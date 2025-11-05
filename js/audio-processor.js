class AudioProcessor {
  constructor() {
    this.audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    this.initializeNodes();
    this.setupEqualizer();
  }

  initializeNodes() {
    // Création des noeuds audio
    this.sourceNode = null;
    this.gainNode = this.audioContext.createGain();
    this.analyserNode = this.audioContext.createAnalyser();

    // Réverbération
    this.reverbNode = this.audioContext.createConvolver();
    this.reverbGain = this.audioContext.createGain();
    this.dryGain = this.audioContext.createGain();

    // Création de l'impulsion de réverbération
    this.createReverb();

    // Configuration initiale
    this.reverbGain.gain.value = 0;
    this.dryGain.gain.value = 1;
  }

  setupEqualizer() {
    // Fréquences de l'égaliseur 31 bandes (Hz)
    this.frequencies = [
      20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630,
      800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000,
      12500, 16000, 20000,
    ];

    this.filters = this.frequencies.map((freq) => {
      const filter = this.audioContext.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = freq;
      filter.Q.value = 4.31; // 1/3 octave
      filter.gain.value = 0;
      return filter;
    });

    // Chaînage des filtres
    for (let i = 0; i < this.filters.length - 1; i++) {
      this.filters[i].connect(this.filters[i + 1]);
    }
  }

  async createReverb(duration = 3, decay = 2) {
    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.audioContext.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        channelData[i] =
          (Math.random() * 2 - 1) * Math.pow(1 - t / duration, decay);
      }
    }

    this.reverbNode.buffer = impulse;
  }

  async loadAudio(file) {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = audioBuffer;

    // Connexion des noeuds
    this.sourceNode.connect(this.filters[0]);
    this.filters[this.filters.length - 1].connect(this.dryGain);
    this.filters[this.filters.length - 1].connect(this.reverbNode);
    this.reverbNode.connect(this.reverbGain);
    this.dryGain.connect(this.gainNode);
    this.reverbGain.connect(this.gainNode);
    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.audioContext.destination);

    return audioBuffer;
  }

  setReverbMix(value) {
    this.reverbGain.gain.value = value;
    this.dryGain.gain.value = 1 - value;
  }

  setReverbSize(value) {
    this.createReverb(value * 5, value * 3);
  }

  setPitchAndSpeed(value) {
    if (this.sourceNode) {
      this.sourceNode.playbackRate.value = value;
    }
  }

  setEQBand(index, value) {
    if (this.filters[index]) {
      this.filters[index].gain.value = value;
    }
  }

  async exportAudio(audioBuffer, options = { bitRate: 192 }) {
    // Création d'un nouveau contexte pour le rendu
    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    // Recréation de la chaîne d'effets
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;

    // Application des effets...
    // [Code pour appliquer les effets dans le contexte hors-ligne]

    // Démarrage du rendu
    source.start(0);
    const renderedBuffer = await offlineContext.startRendering();

    // Conversion en MP3 (nécessite la bibliothèque lamejs)
    // [Code pour la conversion en MP3]

    return renderedBuffer;
  }

  start() {
    if (this.sourceNode) {
      this.sourceNode.start(0);
    }
  }

  stop() {
    if (this.sourceNode) {
      this.sourceNode.stop(0);
    }
  }
}
