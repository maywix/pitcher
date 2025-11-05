document.addEventListener("DOMContentLoaded", function () {
  const audioProcessor = new AudioProcessor();
  let wavesurfer;
  let currentFileName = null;
  let audioFiles = new Map();

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
    audioProcessor.frequencies.forEach((freq, index) => {
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
      freqLabel.textContent = freq < 1000 ? freq + "Hz" : freq / 1000 + "kHz";

      slider.addEventListener("input", (e) => {
        audioProcessor.setEQBand(index, parseFloat(e.target.value));
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

    const file = audioFiles.get(fileName);
    try {
      // Arrêter la lecture actuelle
      wavesurfer.stop();
      audioProcessor.stop();
      
      // Créer un blob URL pour wavesurfer
      const fileUrl = URL.createObjectURL(file);
      await wavesurfer.load(fileUrl);
      
      // Charger et configurer l'audio processor
      await audioProcessor.loadAndPlay(file);
      
      // Nettoyer le blob URL
      URL.revokeObjectURL(fileUrl);
    } catch (error) {
      console.error('Erreur lors de la lecture:', error);
      alert('Erreur lors du chargement du fichier audio');
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
      alert('Veuillez sélectionner un fichier audio');
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
    audioProcessor.setReverbMix(value);
    this.nextElementSibling.textContent = Math.round(value * 100) + "%";
  });

  document.getElementById("reverbSize").addEventListener("input", function (e) {
    const value = parseFloat(e.target.value);
    audioProcessor.setReverbSize(value);
    this.nextElementSibling.textContent = Math.round(value * 100) + "%";
  });

  document.getElementById("pitchSpeed").addEventListener("input", function (e) {
    const value = parseFloat(e.target.value);
    audioProcessor.setPitchAndSpeed(value);
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
        if (!currentFile) throw new Error('Fichier non trouvé');
        
        // Exporter avec les effets
        const blob = await audioProcessor.exportAudio(currentFile);
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        // Garder l'extension d'origine
        const extension = currentFileName.split('.').pop();
        a.download = "processed_" + currentFileName.replace('.' + extension, '') + '.wav';
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
