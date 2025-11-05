document.addEventListener("DOMContentLoaded", function () {
  const audioProcessor = new AudioProcessor();
  let wavesurfer;
  let currentFileName = null;
  // Runtime state (was accidentally removed during edits)
  let audioFiles = new Map();
  // Equalizer runtime state
  let eqFilters = [];
  let pendingEqGains = [];
  const eqFreqs = [
    20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630,
    800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000,
    12500, 16000, 20000,
  ];
  let currentReverbImpulse = null;
  let currentReverbMix = 0;
  let currentReverbSize = 0.5;
  wavesurfer = WaveSurfer.create({
    container: "#waveform",
    waveColor: "#ff5500",
    progressColor: "#ff7733",
    cursorColor: "#ffffff",
    height: 128,
    responsive: true,
    backend: "WebAudio",
  });

  // Keep some basic UI hooks for time updates (more listeners are added later)
  wavesurfer.on("ready", function () {
    document.getElementById("totalTime").textContent = formatTime(
      wavesurfer.getDuration()
    );
  });
  wavesurfer.on("audioprocess", function () {
    document.getElementById("currentTime").textContent = formatTime(
      wavesurfer.getCurrentTime()
    );
  });

  // Debug panel (visible on hosted site to collect runtime errors/routing info)
  (function createDebugPanel(){
    try {
      const panel = document.createElement('div');
      panel.id = 'debugPanel';
      panel.style.position = 'fixed';
      panel.style.right = '10px';
      panel.style.bottom = '10px';
      panel.style.maxWidth = '320px';
      panel.style.maxHeight = '200px';
      panel.style.overflow = 'auto';
      panel.style.background = 'rgba(0,0,0,0.6)';
      panel.style.color = '#fff';
      panel.style.fontSize = '12px';
      panel.style.padding = '8px';
      panel.style.borderRadius = '6px';
      panel.style.zIndex = 99999;
      panel.style.display = 'none'; // hidden by default
      panel.innerHTML = '<strong>Debug</strong><br/>';
      document.body.appendChild(panel);

      window.__pitcherDebug = {
        panel: panel,
        log: function(msg){
          try {
            console.log('[Pitcher debug]', msg);
            const el = document.createElement('div');
            el.textContent = (new Date()).toLocaleTimeString() + ' - ' + msg;
            panel.appendChild(el);
            // keep panel small
            while(panel.childNodes.length > 60) panel.removeChild(panel.firstChild);
          } catch(e) { console.warn(e); }
        },
        show: function(){ panel.style.display = 'block'; }
      };
    } catch (e) { console.warn('debug panel init failed', e); }
  })();

  // global error catcher to help debug hosted issues
  window.addEventListener('error', function(ev){
    try {
      const msg = ev && ev.message ? ev.message : String(ev);
      if (window.__pitcherDebug) window.__pitcherDebug.log('Uncaught error: ' + msg);
      console.error('Uncaught error', ev);
    } catch(e){}
  });
  // Create 31-band EQ sliders
  function createEQSliders() {
    const eqContainer = document.getElementById("eqContainer");
    eqContainer.innerHTML = "";
    pendingEqGains = new Array(eqFreqs.length).fill(0);

    eqFreqs.forEach((f, i) => {
      const sliderContainer = document.createElement("div");
      sliderContainer.className = "eq-slider";

      const input = document.createElement("input");
      input.type = "range";
      input.min = -12;
      input.max = 12;
      input.step = 0.1;
      input.value = 0;
      input.dataset.index = i;
      input.addEventListener("input", function (e) {
        const idx = parseInt(this.dataset.index);
        const val = parseFloat(this.value);
        pendingEqGains[idx] = val;
        if (eqFilters && eqFilters[idx]) {
          try {
            eqFilters[idx].gain.value = val;
          } catch (err) {
            /* ignore */
          }
        }
      });

      const label = document.createElement("label");
      label.textContent = f + " Hz";

      sliderContainer.appendChild(input);
      sliderContainer.appendChild(label);
      eqContainer.appendChild(sliderContainer);
    });
  }

  // create the EQ UI (wavesurfer already initialized above)
  createEQSliders();

  // Gestion de la liste des fichiers
  function updateFilesList() {
    const filesList = document.getElementById("audioFilesList");
    filesList.innerHTML = "";

    audioFiles.forEach((file, fileName) => {
      const li = document.createElement("li");
      li.textContent = fileName;
      if (fileName === currentFileName) {
        li.classList.add("active");
      }

      li.addEventListener("click", () => {
        currentFileName = fileName;
        playFile(fileName);
        document.querySelectorAll("#audioFilesList li").forEach((item) => {
          item.classList.remove("active");
        });
        li.classList.add("active");
      });

      filesList.appendChild(li);
    });
  }

  async function playFile(fileName) {
    if (!audioFiles.has(fileName)) return;

    try {
      // Arrêter la lecture actuelle
      wavesurfer.stop();

      // Charger le fichier
      const file = audioFiles.get(fileName);
      const fileUrl = URL.createObjectURL(file);

      // Charger dans wavesurfer
      await wavesurfer.load(fileUrl);

      // Configurer les effets après le chargement
      if (wavesurfer.backend && wavesurfer.backend.ac) {
        // Récupérer le contexte audio et la source
        const audioContext = wavesurfer.backend.ac;
        // wavesurfer backend may expose different source names depending on version
        const source =
          wavesurfer.backend.source ||
          wavesurfer.backend.bufferSource ||
          wavesurfer.backend._bufferSource;

        // Déconnecter proprement la source existante
        try {
          if (source) source.disconnect();
        } catch (e) {
          /* ignore */
        }

        // Créer (ou recréer) l'égaliseur si nécessaire
        if (!eqFilters || eqFilters.length === 0) {
          eqFilters = eqFreqs.map((f) => {
            const filter = audioContext.createBiquadFilter();
            filter.type = "peaking";
            filter.frequency.value = f;
            filter.Q.value = 4.31;
            filter.gain.value = 0;
            return filter;
          });
        }

        // apply any pending slider gains
        eqFilters.forEach((filter, i) => {
          if (typeof pendingEqGains[i] === "number")
            filter.gain.value = pendingEqGains[i];
        });

        // create reverb and dry path
        const gainNode = audioContext.createGain();
        const reverbNode = audioContext.createConvolver();
        const reverbGain = audioContext.createGain();
        const dryGain = audioContext.createGain();

        // Configurer les gains
        reverbGain.gain.value = parseFloat(
          document.getElementById("reverbMix").value
        );
        dryGain.gain.value = 1 - reverbGain.gain.value;

        // Créer l'effet de réverbération (impulse)
        const duration = Math.max(
          0.1,
          parseFloat(document.getElementById("reverbSize").value) * 5
        );
        const decay = Math.max(
          0.1,
          parseFloat(document.getElementById("reverbSize").value) * 3
        );
        const sampleRate = audioContext.sampleRate;
        const length = Math.max(1, Math.floor(sampleRate * duration));
        const impulse = audioContext.createBuffer(2, length, sampleRate);
        for (let channel = 0; channel < 2; channel++) {
          const channelData = impulse.getChannelData(channel);
          for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            channelData[i] =
              (Math.random() * 2 - 1) * Math.pow(1 - t / duration, decay);
          }
        }
        reverbNode.buffer = impulse;
        // store current impulse and mix/size for export rendering
        try {
          currentReverbImpulse = impulse;
          currentReverbMix = reverbGain.gain.value;
          currentReverbSize = parseFloat(
            document.getElementById("reverbSize").value
          );
        } catch (e) {
          /* ignore */
        }

        // Déconnecter d'anciennes liaisons des filtres (éviter multiconnexions)
        try {
          if (eqFilters && eqFilters.length)
            eqFilters.forEach((f) => f.disconnect());
        } catch (e) {
          /* ignore */
        }

        // Robust routing for EQ + reverb: prefer connecting to WaveSurfer backend master/gain node
        // so preview uses the same wet/dry path as offline rendering. Fallback to source when needed.
        const backend = wavesurfer && wavesurfer.backend ? wavesurfer.backend : null;
        let connectorNode = null;
        if (backend) {
          connectorNode = backend.gainNode || backend.gain || backend.masterGain || null;
        }

        try {
          if (connectorNode && typeof connectorNode.connect === 'function') {
            if (window.__pitcherDebug) window.__pitcherDebug.log('Routing via backend connector node');
            // detach original connection and route through our EQ/reverb chain
            try { connectorNode.disconnect(); } catch (e) { /* ignore */ }

            if (eqFilters.length > 0) {
              connectorNode.connect(eqFilters[0]);
              for (let i = 0; i < eqFilters.length - 1; i++) {
                eqFilters[i].connect(eqFilters[i + 1]);
              }
              eqFilters[eqFilters.length - 1].connect(dryGain);
              eqFilters[eqFilters.length - 1].connect(reverbNode);
            } else {
              connectorNode.connect(dryGain);
              connectorNode.connect(reverbNode);
            }
            if (window.__pitcherDebug) window.__pitcherDebug.log('Routing via backend connector done');
          } else if (source) {
            if (window.__pitcherDebug) window.__pitcherDebug.log('Routing via source node fallback');
            // fallback: connect the buffer/source directly
            if (eqFilters.length > 0) {
              source.connect(eqFilters[0]);
              for (let i = 0; i < eqFilters.length - 1; i++) {
                eqFilters[i].connect(eqFilters[i + 1]);
              }
              eqFilters[eqFilters.length - 1].connect(dryGain);
              eqFilters[eqFilters.length - 1].connect(reverbNode);
            } else {
              source.connect(dryGain);
              source.connect(reverbNode);
            }
            if (window.__pitcherDebug) window.__pitcherDebug.log('Routing via source done');
          } else {
            console.warn('No connector node or source found — audio routing may be incomplete');
            if (window.__pitcherDebug) window.__pitcherDebug.log('No connector node or source found');
          }
        } catch (routeErr) {
          console.warn('Error while routing audio nodes for reverb/EQ', routeErr);
          if (window.__pitcherDebug) window.__pitcherDebug.log('Routing error: ' + (routeErr && routeErr.message ? routeErr.message : String(routeErr)));
        }

        // Connect wet/dry gains to final output
        reverbNode.connect(reverbGain);
        dryGain.connect(gainNode);
        reverbGain.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Appliquer le pitch/speed via wavesurfer
        const pitchSpeed = parseFloat(
          document.getElementById("pitchSpeed").value
        );
        wavesurfer.setPlaybackRate(pitchSpeed);
      }

      // Nettoyer le blob URL
      URL.revokeObjectURL(fileUrl);
    } catch (error) {
      console.error("Erreur lors de la lecture:", error);
      alert("Erreur lors du chargement du fichier audio");
    }
  }

  // Gestionnaires d'événements pour les contrôles
  document
    .getElementById("audioFile")
    .addEventListener("change", async function (e) {
      if (e.target.files.length > 0) {
        for (let file of e.target.files) {
          audioFiles.set(file.name, file);
        }
        updateFilesList();

        if (!currentFileName) {
          currentFileName = e.target.files[0].name;
          await playFile(currentFileName);
        }
      }
    });

  document.getElementById("playBtn").addEventListener("click", function () {
    if (!currentFileName) {
      alert("Veuillez sélectionner un fichier audio");
      return;
    }

    if (wavesurfer.isPlaying()) {
      wavesurfer.pause();
      this.innerHTML = '<i class="fas fa-play"></i>';
    } else {
      wavesurfer.play();
      this.innerHTML = '<i class="fas fa-pause"></i>';
    }
  });

  document.getElementById("stopBtn").addEventListener("click", function () {
    wavesurfer.stop();
    audioProcessor.stop();
    document.getElementById("playBtn").innerHTML =
      '<i class="fas fa-play"></i>';
  });

  // Contrôles des effets
  document.getElementById("reverbMix").addEventListener("input", function (e) {
    const value = parseFloat(e.target.value);
    if (wavesurfer.backend && wavesurfer.backend.ac) {
      playFile(currentFileName); // Recharger avec les nouveaux paramètres
    }
    this.nextElementSibling.textContent = Math.round(value * 100) + "%";
  });

  document.getElementById("reverbSize").addEventListener("input", function (e) {
    const value = parseFloat(e.target.value);
    if (wavesurfer.backend && wavesurfer.backend.ac) {
      playFile(currentFileName); // Recharger avec les nouveaux paramètres
    }
    this.nextElementSibling.textContent = Math.round(value * 100) + "%";
  });

  document.getElementById("pitchSpeed").addEventListener("input", function (e) {
    const value = parseFloat(e.target.value);
    if (wavesurfer.backend && wavesurfer.isPlaying()) {
      wavesurfer.setPlaybackRate(value);
    }
    this.nextElementSibling.textContent = value.toFixed(2) + "x";
  });

  // Pre-roll (silence before start) UI handler
  const preRollEl = document.getElementById("preRoll");
  if (preRollEl) {
    preRollEl.addEventListener("input", function (e) {
      const v = parseInt(this.value, 10) || 0;
      const label = document.getElementById("preRollValue");
      if (label) label.textContent = v + "s";
    });
  }

  document
    .getElementById("exportBtn")
    .addEventListener("click", async function () {
      if (audioFiles.size === 0) {
        alert("Veuillez d'abord charger au moins un fichier audio");
        return;
      }

      const btn = this;
      btn.disabled = true;
      btn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Export en cours...';

      // helper: encode rendered AudioBuffer to MP3 Blob using lamejs
      async function encodeRenderedBufferToMp3(renderedBuffer) {
        if (
          typeof lamejs === "undefined" &&
          typeof window.Mp3Encoder === "undefined"
        ) {
          throw new Error("lamejs non chargé");
        }

        function floatTo16BitPCM(float32Array) {
          const l = float32Array.length;
          const int16 = new Int16Array(l);
          for (let i = 0; i < l; i++) {
            let s = Math.max(-1, Math.min(1, float32Array[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          return int16;
        }

        const Mp3Encoder =
          window.Mp3Encoder ||
          (lamejs && lamejs.Mp3Encoder) ||
          (window.lamejs && window.lamejs.Mp3Encoder);
        const channels = renderedBuffer.numberOfChannels;
        const sampleRate = renderedBuffer.sampleRate;
        const kbps = 192;
        const mp3encoder = new Mp3Encoder(channels, sampleRate, kbps);

        const left = renderedBuffer.getChannelData(0);
        const right = channels > 1 ? renderedBuffer.getChannelData(1) : null;
        const blockSize = 1152;
        const mp3Chunks = [];

        for (let i = 0; i < renderedBuffer.length; i += blockSize) {
          const leftChunk = floatTo16BitPCM(left.subarray(i, i + blockSize));
          const rightChunk = right
            ? floatTo16BitPCM(right.subarray(i, i + blockSize))
            : undefined;
          const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
          if (mp3buf && mp3buf.length > 0)
            mp3Chunks.push(new Uint8Array(mp3buf));
        }

        const mp3bufEnd = mp3encoder.flush();
        if (mp3bufEnd && mp3bufEnd.length > 0)
          mp3Chunks.push(new Uint8Array(mp3bufEnd));

        return new Blob(mp3Chunks, { type: "audio/mpeg" });
      }

      // helper: process a single File -> MP3 Blob (applies current EQ/reverb/pitch)
      async function processFileToMp3(file) {
        // decode file
        const arrayBuffer = await file.arrayBuffer();
        const decoded = await audioProcessor.audioContext.decodeAudioData(
          arrayBuffer.slice(0)
        );

        const playbackRate =
          parseFloat(document.getElementById("pitchSpeed").value) || 1;
        // pre-roll (silence before start) in seconds
        const preRollSeconds =
          parseFloat(
            document.getElementById("preRoll")
              ? document.getElementById("preRoll").value
              : 0
          ) || 0;
        const sampleRate = decoded.sampleRate;
        const preRollSamples = Math.ceil(preRollSeconds * sampleRate);
        // offline length must account for pre-roll plus slowed/sped audio duration
        const offlineLength = Math.max(
          1,
          Math.ceil(preRollSamples + decoded.length / playbackRate)
        );
        const offlineContext = new OfflineAudioContext(
          decoded.numberOfChannels,
          offlineLength,
          sampleRate
        );

        const source = offlineContext.createBufferSource();
        const offBuffer = offlineContext.createBuffer(
          decoded.numberOfChannels,
          decoded.length,
          decoded.sampleRate
        );
        for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
          offBuffer.copyToChannel(decoded.getChannelData(ch), ch, 0);
        }
        source.buffer = offBuffer;
        source.playbackRate.value = playbackRate;

        // build EQ filters in offline context
        const offlineFilters = eqFreqs.map((f, i) => {
          const filter = offlineContext.createBiquadFilter();
          filter.type = "peaking";
          filter.frequency.value = f;
          filter.Q.value = 4.31;
          const liveGain =
            eqFilters[i] && typeof eqFilters[i].gain === "object"
              ? eqFilters[i].gain.value
              : undefined;
          filter.gain.value =
            typeof liveGain === "number"
              ? liveGain
              : typeof pendingEqGains[i] === "number"
              ? pendingEqGains[i]
              : 0;
          return filter;
        });

        const offlineReverb = offlineContext.createConvolver();
        if (currentReverbImpulse) {
          const offImp = offlineContext.createBuffer(
            currentReverbImpulse.numberOfChannels,
            currentReverbImpulse.length,
            currentReverbImpulse.sampleRate
          );
          for (let ch = 0; ch < currentReverbImpulse.numberOfChannels; ch++) {
            offImp.copyToChannel(
              currentReverbImpulse.getChannelData(ch),
              ch,
              0
            );
          }
          offlineReverb.buffer = offImp;
        }

        const offlineReverbGain = offlineContext.createGain();
        const offlineDryGain = offlineContext.createGain();
        offlineReverbGain.gain.value =
          currentReverbMix ||
          parseFloat(document.getElementById("reverbMix").value) ||
          0;
        offlineDryGain.gain.value = 1 - offlineReverbGain.gain.value;

        if (offlineFilters.length > 0) {
          source.connect(offlineFilters[0]);
          for (let i = 0; i < offlineFilters.length - 1; i++) {
            offlineFilters[i].connect(offlineFilters[i + 1]);
          }
          offlineFilters[offlineFilters.length - 1].connect(offlineDryGain);
          offlineFilters[offlineFilters.length - 1].connect(offlineReverb);
        } else {
          source.connect(offlineDryGain);
          source.connect(offlineReverb);
        }

        offlineReverb.connect(offlineReverbGain);
        offlineDryGain.connect(offlineContext.destination);
        offlineReverbGain.connect(offlineContext.destination);

        source.start(preRollSeconds);
        const renderedBuffer = await offlineContext.startRendering();

        const mp3Blob = await encodeRenderedBufferToMp3(renderedBuffer);
        return mp3Blob;
      }

      try {
        if (audioFiles.size === 1) {
          // single file: process and download directly (keep original base name, change extension to .mp3)
          const [[name, file]] = Array.from(audioFiles.entries());
          const mp3Blob = await processFileToMp3(file);
          const url = URL.createObjectURL(mp3Blob);
          const a = document.createElement("a");
          a.href = url;
          const baseName = name.replace(/\.[^/.]+$/, "");
          const finalName = baseName + ".mp3";
          a.download = finalName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } else {
          // multiple files: process all and zip
          if (typeof JSZip === "undefined") throw new Error("JSZip non chargé");
          const zip = new JSZip();
          let i = 0;
          for (const [name, file] of audioFiles.entries()) {
            i++;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Export ${i}/${audioFiles.size}...`;
            const mp3Blob = await processFileToMp3(file);
            const baseName = name.replace(/\.[^/.]+$/, "");
            const finalName = baseName + ".mp3";
            zip.file(finalName, mp3Blob);
          }

          btn.innerHTML =
            '<i class="fas fa-spinner fa-spin"></i> Création du ZIP...';
          const zipBlob = await zip.generateAsync({ type: "blob" });
          const url = URL.createObjectURL(zipBlob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "processed_all.zip";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        console.error("Erreur export batch:", err);
        alert(
          "Erreur lors de l'export : " +
            (err && err.message ? err.message : err)
        );
      } finally {
        btn.disabled = false;
        btn.innerHTML =
          '<i class="fas fa-download"></i> Exporter en MP3 (192kbps)';
      }
    });

  // Mise à jour de l'affichage du temps
  wavesurfer.on("audioprocess", function () {
    document.getElementById("currentTime").textContent = formatTime(
      wavesurfer.getCurrentTime()
    );
  });

  wavesurfer.on("ready", function () {
    document.getElementById("totalTime").textContent = formatTime(
      wavesurfer.getDuration()
    );
  });

  // Fonction utilitaire pour formater le temps
  function formatTime(time) {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
});
