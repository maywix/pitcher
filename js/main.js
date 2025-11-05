document.addEventListener("DOMContentLoaded", function () {
  const audioProcessor = new AudioProcessor();
  let wavesurfer;
  let currentFileName = null;
  let audioFiles = new Map();
  // Equalizer runtime state
  let eqFilters = []; // BiquadFilterNodes created when audio is loaded
  let pendingEqGains = []; // gains set by sliders before filters exist

  // Initialisation de WaveSurfer
  function initWaveSurfer() {
    wavesurfer = WaveSurfer.create({
      container: "#waveform",
      waveColor: "#ff5500",
      progressColor: "#ff7733",
      cursorColor: "#ffffff",
      height: 128,
      responsive: true,
      normalize: true,
      backgroundColor: "#1a1a1a",
      backend: "WebAudio",
    });

    wavesurfer.on("finish", function () {
      document.getElementById("playBtn").innerHTML =
        '<i class="fas fa-play"></i>';
    });
  }

  initWaveSurfer();

  // Création des sliders de l'égaliseur
  function createEQSliders() {
    const eqContainer = document.getElementById("eqContainer");
    // build sliders for the 31-band EQ
    const freqs = [
      20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160,
      200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
      2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000
    ];

    freqs.forEach((freq, index) => {
      const sliderContainer = document.createElement("div");
      sliderContainer.className = "eq-slider";

      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = -12;
      slider.max = 12;
      slider.value = 0;
      slider.step = 0.1;

      const freqLabel = document.createElement("span");
      freqLabel.className = "freq";
      freqLabel.textContent = freq < 1000 ? freq + "Hz" : (freq / 1000) + "kHz";

      // keep pending gain in case filters not created yet
      pendingEqGains[index] = 0;

      slider.addEventListener("input", (e) => {
        const gain = parseFloat(e.target.value);
        pendingEqGains[index] = gain;
        // if filters exist, update immediately
        if (eqFilters[index]) {
          eqFilters[index].gain.value = gain;
        }
      });

      sliderContainer.appendChild(slider);
      sliderContainer.appendChild(freqLabel);
      eqContainer.appendChild(sliderContainer);
    });
  }

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
        const source = wavesurfer.backend.source || wavesurfer.backend.bufferSource || wavesurfer.backend._bufferSource;

        // Déconnecter proprement la source existante
        try { if (source) source.disconnect(); } catch (e) { /* ignore */ }

        // Créer (ou recréer) l'égaliseur si nécessaire
        if (!eqFilters || eqFilters.length === 0) {
          const freqs = [
            20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160,
            200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
            2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000
          ];
          eqFilters = freqs.map((f) => {
            const filter = audioContext.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = f;
            filter.Q.value = 4.31;
            filter.gain.value = 0;
            return filter;
          });
        }

        // apply any pending slider gains
        eqFilters.forEach((filter, i) => {
          if (typeof pendingEqGains[i] === 'number') filter.gain.value = pendingEqGains[i];
        });

        // create reverb and dry path
        const gainNode = audioContext.createGain();
        const reverbNode = audioContext.createConvolver();
        const reverbGain = audioContext.createGain();
        const dryGain = audioContext.createGain();

        // Configurer les gains
        reverbGain.gain.value = parseFloat(document.getElementById('reverbMix').value);
        dryGain.gain.value = 1 - reverbGain.gain.value;

        // Créer l'effet de réverbération (impulse)
        const duration = Math.max(0.1, parseFloat(document.getElementById('reverbSize').value) * 5);
        const decay = Math.max(0.1, parseFloat(document.getElementById('reverbSize').value) * 3);
        const sampleRate = audioContext.sampleRate;
        const length = Math.max(1, Math.floor(sampleRate * duration));
        const impulse = audioContext.createBuffer(2, length, sampleRate);
        for (let channel = 0; channel < 2; channel++) {
          const channelData = impulse.getChannelData(channel);
          for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - t / duration, decay);
          }
        }
        reverbNode.buffer = impulse;

        // Déconnecter d'anciennes liaisons des filtres (éviter multiconnexions)
        try { if (eqFilters && eqFilters.length) eqFilters.forEach(f => f.disconnect()); } catch (e) { /* ignore */ }

        // Try to use WaveSurfer's setFilters API (preferred)
        let filtersAppliedViaWaveSurfer = false;
        if (typeof wavesurfer.backend.setFilters === 'function' && eqFilters.length > 0) {
          try {
            wavesurfer.backend.setFilters(eqFilters);
            filtersAppliedViaWaveSurfer = true;
          } catch (e) {
            console.warn('wavesurfer.backend.setFilters failed, falling back to manual routing', e);
            filtersAppliedViaWaveSurfer = false;
          }
        }

        if (!filtersAppliedViaWaveSurfer) {
          // manual routing: source -> EQ -> (dry + reverb) -> gain -> destination
          if (eqFilters.length > 0 && source) {
            source.connect(eqFilters[0]);
            for (let i = 0; i < eqFilters.length - 1; i++) {
              eqFilters[i].connect(eqFilters[i + 1]);
            }
            eqFilters[eqFilters.length - 1].connect(dryGain);
            eqFilters[eqFilters.length - 1].connect(reverbNode);
          } else if (source) {
            source.connect(dryGain);
            source.connect(reverbNode);
          }

          reverbNode.connect(reverbGain);
          dryGain.connect(gainNode);
          reverbGain.connect(gainNode);
          gainNode.connect(audioContext.destination);
        }

        // Appliquer le pitch/speed via wavesurfer
        const pitchSpeed = parseFloat(document.getElementById('pitchSpeed').value);
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

  document
    .getElementById("exportBtn")
    .addEventListener("click", async function () {
      if (!currentFileName) {
        alert("Veuillez d'abord charger un fichier audio");
        return;
      }

      this.disabled = true;
      this.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Export en cours...';

      try {
        // Récupérer le fichier actuel
        const currentFile = audioFiles.get(currentFileName);
        if (!currentFile) throw new Error("Fichier non trouvé");

        // Obtenir le buffer audio actuel de wavesurfer avec les effets
        const audioBuffer = wavesurfer.backend.buffer;

        // Créer un nouveau contexte audio hors-ligne
        const offlineContext = new OfflineAudioContext(
          audioBuffer.numberOfChannels,
          audioBuffer.length,
          audioBuffer.sampleRate
        );

        // Créer une source avec le buffer
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;

        // Appliquer le pitch/speed
        source.playbackRate.value = parseFloat(
          document.getElementById("pitchSpeed").value
        );

        // Connecter directement à la destination pour l'export
        source.connect(offlineContext.destination);

        // Démarrer la source et rendre
        source.start(0);
        const renderedBuffer = await offlineContext.startRendering();

        // Convertir le buffer en blob
        const blob = await new Promise((resolve) => {
          const sampleRate = renderedBuffer.sampleRate;
          const length = renderedBuffer.length;
          const channels = renderedBuffer.numberOfChannels;

          // Créer le WAV
          const buffer = new ArrayBuffer(44 + length * 2);
          const view = new DataView(buffer);

          // En-tête WAV
          const writeString = (view, offset, string) => {
            for (let i = 0; i < string.length; i++) {
              view.setUint8(offset + i, string.charCodeAt(i));
            }
          };

          writeString(view, 0, "RIFF");
          view.setUint32(4, 36 + length * 2, true);
          writeString(view, 8, "WAVE");
          writeString(view, 12, "fmt ");
          view.setUint32(16, 16, true);
          view.setUint16(20, 1, true);
          view.setUint16(22, channels, true);
          view.setUint32(24, sampleRate, true);
          view.setUint32(28, sampleRate * 2 * channels, true);
          view.setUint16(32, channels * 2, true);
          view.setUint16(34, 16, true);
          writeString(view, 36, "data");
          view.setUint32(40, length * 2, true);

          // Écriture des données audio
          const channelData = new Float32Array(length);
          let offset = 44;

          for (let i = 0; i < channels; i++) {
            renderedBuffer.copyFromChannel(channelData, i);
            for (let j = 0; j < length; j++) {
              const sample = Math.max(-1, Math.min(1, channelData[j]));
              view.setInt16(
                offset,
                sample < 0 ? sample * 0x8000 : sample * 0x7fff,
                true
              );
              offset += 2;
            }
          }

          resolve(new Blob([buffer], { type: currentFile.type }));
        });

        // Créer le lien de téléchargement
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "processed_" + currentFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Erreur lors de l'export:", error);
        alert("Une erreur est survenue lors de l'export");
      } finally {
        this.disabled = false;
        this.innerHTML =
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
