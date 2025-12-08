document.addEventListener("DOMContentLoaded", function () {
  const audioProcessor = new AudioProcessor();
  let wavesurfer;
  let currentFileName = null;
  let djTurntable = null;
  // Runtime state
  let audioFiles = new Map();
  // Recorder instance
  let audioRecorder = null;
  // Recorded files list
  let recordedFiles = new Map();
  // Equalizer runtime state
  let eqFilters = [];
  let pendingEqGains = [];
  // EQ frequencies are now managed dynamically in the EQ section
  let currentReverbImpulse = null;
  let currentReverbMix = 0;
  let currentReverbSize = 0.5;
  
  // ==========================================
  // TAB NAVIGATION
  // ==========================================
  const tabImport = document.getElementById('tabImport');
  const tabRecord = document.getElementById('tabRecord');
  const importTab = document.getElementById('importTab');
  const recordTab = document.getElementById('recordTab');
  
  function switchTab(tabName) {
    // Update button states
    tabImport.classList.toggle('active', tabName === 'import');
    tabRecord.classList.toggle('active', tabName === 'record');
    
    // Update tab content visibility
    importTab.classList.toggle('active', tabName === 'import');
    recordTab.classList.toggle('active', tabName === 'record');
  }
  
  tabImport.addEventListener('click', () => switchTab('import'));
  tabRecord.addEventListener('click', () => switchTab('record'));
  
  // ==========================================
  // MODE TOGGLE (Simple / Advanced)
  // ==========================================
  const appContainer = document.querySelector('.app-container');
  const simpleModeBtn = document.getElementById('simpleModeBtn');
  const advancedModeBtn = document.getElementById('advancedModeBtn');
  
  // Check for saved mode preference
  const savedMode = localStorage.getItem('pitcherMode') || 'simple';
  setMode(savedMode);
  
  function setMode(mode) {
    appContainer.setAttribute('data-mode', mode);
    
    // Update button states
    simpleModeBtn.classList.toggle('active', mode === 'simple');
    advancedModeBtn.classList.toggle('active', mode === 'advanced');
    
    // Save preference
    localStorage.setItem('pitcherMode', mode);
    
    // If switching to simple mode and on record tab, switch to import
    if (mode === 'simple' && recordTab.classList.contains('active')) {
      switchTab('import');
    }
    
    // Log mode change
    console.log('Pitcher Mode:', mode);
  }
  
  simpleModeBtn.addEventListener('click', () => setMode('simple'));
  advancedModeBtn.addEventListener('click', () => setMode('advanced'));
  
  // ==========================================
  // UPLOAD ZONE - CLICK & DRAG AND DROP
  // ==========================================
  const uploadZone = document.getElementById('uploadZone');
  const audioFileInput = document.getElementById('audioFile');
  
  // Click on upload zone opens file dialog
  uploadZone.addEventListener('click', function(e) {
    // Prevent triggering if clicking on input itself
    if (e.target !== audioFileInput) {
      audioFileInput.click();
    }
  });
  
  // Drag and drop handlers
  uploadZone.addEventListener('dragenter', function(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.add('drag-over');
  });
  
  uploadZone.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.add('drag-over');
  });
  
  uploadZone.addEventListener('dragleave', function(e) {
    e.preventDefault();
    e.stopPropagation();
    // Only remove class if leaving the upload zone itself
    if (e.relatedTarget && !this.contains(e.relatedTarget)) {
      this.classList.remove('drag-over');
    } else if (!e.relatedTarget) {
      this.classList.remove('drag-over');
    }
  });
  
  uploadZone.addEventListener('drop', async function(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await handleFiles(files);
    }
  });
  
  // Prevent default drag behavior on the document
  document.addEventListener('dragover', function(e) {
    e.preventDefault();
  });
  
  document.addEventListener('drop', function(e) {
    e.preventDefault();
  });
  
  // Handle files from both input and drag & drop
  async function handleFiles(files) {
    const validExtensions = ['.mp3', '.flac', '.wav', '.aac', '.ogg', '.webm'];
    let firstFile = null;
    
    for (let file of files) {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (validExtensions.includes(ext) || file.type.startsWith('audio/')) {
        audioFiles.set(file.name, file);
        if (!firstFile) firstFile = file;
      }
    }
    
    updateFilesList();
    
    // Show files panel when files are added
    const filesPanel = document.getElementById('filesPanel');
    if (filesPanel && audioFiles.size > 0) {
      filesPanel.classList.add('has-files');
    }
    
    // Load first file if none is currently loaded
    if (!currentFileName && firstFile) {
      currentFileName = firstFile.name;
      await playFile(currentFileName);
    }
    
    // Hide the overlay if audio is loaded
    const overlay = document.getElementById('waveformOverlay');
    if (overlay && audioFiles.size > 0) {
      overlay.style.display = 'none';
    }
  }
  
  // Clear files button
  const clearFilesBtn = document.getElementById('clearFilesBtn');
  if (clearFilesBtn) {
    clearFilesBtn.addEventListener('click', function() {
      audioFiles.clear();
      currentFileName = null;
      updateFilesList();
      wavesurfer.empty();
      
      const overlay = document.getElementById('waveformOverlay');
      if (overlay) overlay.style.display = 'flex';
      
      const filesPanel = document.getElementById('filesPanel');
      if (filesPanel) filesPanel.classList.remove('has-files');
    });
  }
  
  // ==========================================
  // AUDIO RECORDER SETUP
  // ==========================================
  const recordBtn = document.getElementById('recordBtn');
  const stopRecordBtn = document.getElementById('stopRecordBtn');
  
  recordBtn.addEventListener('click', async function() {
    try {
      // Initialize recorder if not already
      if (!audioRecorder) {
        audioRecorder = new AudioRecorder();
        await audioRecorder.init();
      }
      
      // Start recording
      const recordingName = audioRecorder.start();
      
      // Update UI
      this.classList.add('recording');
      this.innerHTML = '<i class="fas fa-circle blink"></i> <span>Enregistrement...</span>';
      this.disabled = true;
      stopRecordBtn.disabled = false;
      
      // Update status
      const djStatus = document.getElementById('djStatus');
      if (djStatus) djStatus.textContent = 'Enregistrement';
      
    } catch (error) {
      console.error('Erreur démarrage enregistrement:', error);
      alert('Erreur: ' + error.message);
    }
  });
  
  stopRecordBtn.addEventListener('click', function() {
    if (audioRecorder && audioRecorder.isRecording) {
      audioRecorder.stop();
      
      // Update UI
      recordBtn.classList.remove('recording');
      recordBtn.innerHTML = '<i class="fas fa-microphone"></i> <span>Démarrer l\'enregistrement</span>';
      recordBtn.disabled = false;
      this.disabled = true;
      
      // Update status
      const djStatus = document.getElementById('djStatus');
      if (djStatus) djStatus.textContent = 'En attente';
    }
  });
  
  // Handle recording complete event
  window.addEventListener('recordingComplete', function(e) {
    const { file, name, duration } = e.detail;
    
    // Add to recorded files
    recordedFiles.set(name, file);
    
    // Update recorded files list
    updateRecordedFilesList();
    
    // Also add to main audio files for processing
    audioFiles.set(file.name, file);
    updateFilesList();
    
    // Show success notification
    showNotification(`Enregistrement "${name}" sauvegardé (${formatDuration(duration)})`);
  });
  
  function updateRecordedFilesList() {
    const recordedFilesList = document.getElementById('recordedFilesList');
    if (!recordedFilesList) return;
    
    recordedFilesList.innerHTML = '';
    
    recordedFiles.forEach((file, name) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="file-name"><i class="fas fa-microphone"></i> ${file.name}</span>
        <div class="file-actions">
          <button class="btn-icon load-btn" title="Charger"><i class="fas fa-play"></i></button>
          <button class="btn-icon delete-btn" title="Supprimer"><i class="fas fa-trash"></i></button>
        </div>
      `;
      
      // Load button
      li.querySelector('.load-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        currentFileName = file.name;
        await playFile(file.name);
        switchTab('import');
      });
      
      // Delete button
      li.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        recordedFiles.delete(name);
        audioFiles.delete(file.name);
        updateRecordedFilesList();
        updateFilesList();
      });
      
      recordedFilesList.appendChild(li);
    });
    
    // Show panel if has recordings
    const recordedFilesPanel = document.getElementById('recordedFilesPanel');
    if (recordedFilesPanel) {
      recordedFilesPanel.style.display = recordedFiles.size > 0 ? 'block' : 'none';
    }
  }
  
  function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
  
  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  // ==========================================
  // PRESETS INTEGRATION
  // ==========================================
  document.querySelectorAll('.preset-btn[data-preset]').forEach(btn => {
    btn.addEventListener('click', function() {
      const presetName = this.dataset.preset;
      if (window.PRESETS && window.PRESETS[presetName]) {
        applyPreset(window.PRESETS[presetName]);
        
        // Visual feedback
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        if (presetName !== 'reset') {
          this.classList.add('active');
        }
      }
    });
  });
  
  function applyPreset(preset) {
    // Apply EQ bands
    if (preset.eq && preset.eq.bands) {
      preset.eq.bands.forEach((gain, index) => {
        pendingEqGains[index] = gain;
        if (eqFilters[index]) {
          eqFilters[index].gain.value = gain;
        }
        // Update slider UI
        const slider = document.querySelector(`#eqContainer input[data-index="${index}"]`);
        if (slider) slider.value = gain;
      });
    }
    
    // Apply reverb
    if (preset.reverb) {
      const reverbMixSlider = document.getElementById('reverbMix');
      const reverbSizeSlider = document.getElementById('reverbSize');
      
      if (reverbMixSlider) {
        reverbMixSlider.value = preset.reverb.mix;
        document.getElementById('reverbMixValue').textContent = Math.round(preset.reverb.mix * 100) + '%';
      }
      if (reverbSizeSlider) {
        reverbSizeSlider.value = preset.reverb.size;
        document.getElementById('reverbSizeValue').textContent = Math.round(preset.reverb.size * 100) + '%';
      }
    }
    
    // Apply pitch/speed
    if (preset.pitch) {
      const pitchSlider = document.getElementById('pitchSpeed');
      if (pitchSlider) {
        pitchSlider.value = preset.pitch;
        document.getElementById('pitchSpeedValue').textContent = preset.pitch.toFixed(2) + 'x';
        if (wavesurfer && wavesurfer.backend) {
          wavesurfer.setPlaybackRate(preset.pitch);
        }
      }
    }
    
    // Reload audio with new settings
    if (currentFileName) {
      playFile(currentFileName);
    }
  }
  
  // EQ Presets buttons
  document.querySelectorAll('.eq-preset-btn[data-eq]').forEach(btn => {
    btn.addEventListener('click', function() {
      const eqPresetName = this.dataset.eq;
      if (window.EQ_PRESETS && window.EQ_PRESETS[eqPresetName]) {
        const eqPreset = window.EQ_PRESETS[eqPresetName];
        eqPreset.bands.forEach((gain, index) => {
          pendingEqGains[index] = gain;
          if (eqFilters[index]) {
            eqFilters[index].gain.value = gain;
          }
          const slider = document.querySelector(`#eqContainer input[data-index="${index}"]`);
          if (slider) slider.value = gain;
        });
        
        // Visual feedback
        document.querySelectorAll('.eq-preset-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
      }
    });
  });
  
  // ==========================================
  // COLLAPSIBLE PANELS
  // ==========================================
  document.querySelectorAll('.panel-header.collapsible').forEach(header => {
    header.addEventListener('click', function() {
      const content = this.nextElementSibling;
      const icon = this.querySelector('.toggle-icon');
      
      content.classList.toggle('expanded');
      if (icon) {
        icon.style.transform = content.classList.contains('expanded') ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    });
  });
  
  // ==========================================
  // WAVESURFER SETUP
  // ==========================================
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

  // ==========================================
  // AUDIO VISUALIZER
  // ==========================================
  const visualizerCanvas = document.getElementById('audioVisualizer');
  const visualizerCtx = visualizerCanvas.getContext('2d');
  let analyserNode = null;
  let visualizerAnimationId = null;
  let isVisualizerActive = false;
  
  // Set canvas size
  function resizeVisualizer() {
    const container = visualizerCanvas.parentElement;
    visualizerCanvas.width = container.offsetWidth - 32; // padding
    visualizerCanvas.height = 80;
  }
  resizeVisualizer();
  window.addEventListener('resize', resizeVisualizer);
  
  // Draw idle state (flat line of bars)
  function drawIdleVisualizer() {
    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;
    const barCount = 64;
    const barWidth = (width / barCount) - 2;
    const barGap = 2;
    
    visualizerCtx.clearRect(0, 0, width, height);
    
    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + barGap);
      const barHeight = 4;
      const y = height - barHeight;
      
      // Purple gradient for idle
      const gradient = visualizerCtx.createLinearGradient(0, y, 0, height);
      gradient.addColorStop(0, 'rgba(153, 102, 255, 0.5)');
      gradient.addColorStop(1, 'rgba(153, 102, 255, 0.2)');
      
      visualizerCtx.fillStyle = gradient;
      visualizerCtx.fillRect(x, y, barWidth, barHeight);
    }
  }
  drawIdleVisualizer();
  
  // Create gradient colors for bars
  function getBarGradient(ctx, x, y, height, intensity) {
    const gradient = ctx.createLinearGradient(0, y, 0, y + height);
    // Purple to violet gradient like the reference
    gradient.addColorStop(0, `rgba(180, 120, 255, ${0.9 + intensity * 0.1})`);
    gradient.addColorStop(0.5, `rgba(153, 102, 255, ${0.8 + intensity * 0.2})`);
    gradient.addColorStop(1, `rgba(120, 80, 200, ${0.6 + intensity * 0.2})`);
    return gradient;
  }
  
  // Draw visualizer with frequency data
  function drawVisualizer(dataArray) {
    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;
    const barCount = 64;
    const barWidth = (width / barCount) - 2;
    const barGap = 2;
    
    visualizerCtx.clearRect(0, 0, width, height);
    
    // Sample data to match bar count
    const step = Math.floor(dataArray.length / barCount);
    
    for (let i = 0; i < barCount; i++) {
      // Average of frequencies in this range
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += dataArray[i * step + j];
      }
      const average = sum / step;
      
      // Normalize to 0-1 and apply smoothing
      const normalized = average / 255;
      const barHeight = Math.max(4, normalized * height * 0.9);
      
      const x = i * (barWidth + barGap);
      const y = height - barHeight;
      
      // Get gradient based on intensity
      const gradient = getBarGradient(visualizerCtx, x, y, barHeight, normalized);
      
      visualizerCtx.fillStyle = gradient;
      
      // Draw rounded bar
      visualizerCtx.beginPath();
      visualizerCtx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
      visualizerCtx.fill();
      
      // Add glow effect for high intensity bars
      if (normalized > 0.6) {
        visualizerCtx.shadowColor = 'rgba(153, 102, 255, 0.8)';
        visualizerCtx.shadowBlur = 10;
        visualizerCtx.fill();
        visualizerCtx.shadowBlur = 0;
      }
    }
  }
  
  // Animation loop
  function animateVisualizer() {
    if (!analyserNode || !isVisualizerActive) {
      drawIdleVisualizer();
      return;
    }
    
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserNode.getByteFrequencyData(dataArray);
    
    drawVisualizer(dataArray);
    
    visualizerAnimationId = requestAnimationFrame(animateVisualizer);
  }
  
  // Setup visualizer when audio context is available
  function setupVisualizer(audioContext, sourceNode) {
    try {
      // Create analyser if not exists
      if (!analyserNode) {
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 256;
        analyserNode.smoothingTimeConstant = 0.8;
      }
      
      // Connect source to analyser (and analyser to nothing, just for analysis)
      if (sourceNode && typeof sourceNode.connect === 'function') {
        sourceNode.connect(analyserNode);
      }
      
      isVisualizerActive = true;
      if (!visualizerAnimationId) {
        animateVisualizer();
      }
      
      console.log('Audio visualizer setup complete');
    } catch (err) {
      console.warn('Visualizer setup error:', err);
    }
  }
  
  // Stop visualizer
  function stopVisualizer() {
    isVisualizerActive = false;
    if (visualizerAnimationId) {
      cancelAnimationFrame(visualizerAnimationId);
      visualizerAnimationId = null;
    }
    setTimeout(drawIdleVisualizer, 100);
  }
  
  // Hook into wavesurfer play/pause events
  wavesurfer.on('play', function() {
    if (wavesurfer.backend && wavesurfer.backend.ac) {
      const audioContext = wavesurfer.backend.ac;
      const connector = wavesurfer.backend.gainNode || wavesurfer.backend.gain || wavesurfer.backend.masterGain;
      if (connector) {
        setupVisualizer(audioContext, connector);
      }
    }
  });
  
  wavesurfer.on('pause', stopVisualizer);
  wavesurfer.on('stop', stopVisualizer);
  wavesurfer.on('finish', stopVisualizer);

  // Debug panel (visible on hosted site to collect runtime errors/routing info)
  (function createDebugPanel() {
    try {
      const panel = document.createElement("div");
      panel.id = "debugPanel";
      panel.style.position = "fixed";
      panel.style.right = "10px";
      panel.style.bottom = "10px";
      panel.style.maxWidth = "320px";
      panel.style.maxHeight = "200px";
      panel.style.overflow = "auto";
      panel.style.background = "rgba(0,0,0,0.6)";
      panel.style.color = "#fff";
      panel.style.fontSize = "12px";
      panel.style.padding = "8px";
      panel.style.borderRadius = "6px";
      panel.style.zIndex = 99999;
      panel.style.display = "none"; // hidden by default
      panel.innerHTML = "<strong>Debug</strong><br/>";
      document.body.appendChild(panel);

      window.__pitcherDebug = {
        panel: panel,
        log: function (msg) {
          try {
            console.log("[Pitcher debug]", msg);
            const el = document.createElement("div");
            el.textContent = new Date().toLocaleTimeString() + " - " + msg;
            panel.appendChild(el);
            // keep panel small
            while (panel.childNodes.length > 60)
              panel.removeChild(panel.firstChild);
          } catch (e) {
            console.warn(e);
          }
        },
        show: function () {
          panel.style.display = "block";
        },
      };
    } catch (e) {
      console.warn("debug panel init failed", e);
    }
  })();

  // global error catcher to help debug hosted issues
  window.addEventListener("error", function (ev) {
    try {
      const msg = ev && ev.message ? ev.message : String(ev);
      if (window.__pitcherDebug)
        window.__pitcherDebug.log("Uncaught error: " + msg);
      console.error("Uncaught error", ev);
    } catch (e) {}
  });
  // ==========================================
  // EQUALIZER WITH BAND SELECTION (8, 15, 31)
  // ==========================================
  
  // Frequency configurations for different band counts
  const eqBandConfigs = {
    8: [60, 170, 310, 600, 1000, 3000, 6000, 12000],
    15: [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000],
    31: [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630,
         800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000,
         12500, 16000, 20000]
  };
  
  let currentBandCount = 31;
  let currentEqFreqs = eqBandConfigs[31];
  
  // Format frequency for display
  function formatFrequency(freq) {
    if (freq >= 1000) {
      return (freq / 1000).toFixed(freq % 1000 === 0 ? 0 : 1) + 'k';
    }
    return freq.toString();
  }
  
  // Create EQ sliders based on band count
  function createEQSliders(bandCount = 31) {
    currentBandCount = bandCount;
    currentEqFreqs = eqBandConfigs[bandCount];
    
    const eqContainer = document.getElementById("eqContainer");
    eqContainer.innerHTML = "";
    pendingEqGains = new Array(currentEqFreqs.length).fill(0);
    
    // Reset eqFilters for new configuration
    eqFilters = [];

    currentEqFreqs.forEach((f, i) => {
      const sliderContainer = document.createElement("div");
      sliderContainer.className = "eq-slider";

      // Value display
      const valueDisplay = document.createElement("span");
      valueDisplay.className = "eq-value";
      valueDisplay.textContent = "0dB";

      const input = document.createElement("input");
      input.type = "range";
      input.min = -12;
      input.max = 12;
      input.step = 0.1;
      input.value = 0;
      input.dataset.index = i;
      input.dataset.freq = f;
      input.addEventListener("input", function (e) {
        const idx = parseInt(this.dataset.index);
        const val = parseFloat(this.value);
        pendingEqGains[idx] = val;
        
        // Update value display
        valueDisplay.textContent = (val >= 0 ? "+" : "") + val.toFixed(1) + "dB";
        
        if (eqFilters && eqFilters[idx]) {
          try {
            eqFilters[idx].gain.value = val;
          } catch (err) {
            /* ignore */
          }
        }
      });

      const label = document.createElement("label");
      label.textContent = formatFrequency(f);

      sliderContainer.appendChild(valueDisplay);
      sliderContainer.appendChild(input);
      sliderContainer.appendChild(label);
      eqContainer.appendChild(sliderContainer);
    });
    
    // Update label in header
    const bandLabel = document.getElementById("eqBandCountLabel");
    if (bandLabel) {
      bandLabel.textContent = bandCount;
    }
  }

  // Band selector buttons
  document.querySelectorAll('.eq-band-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const bandCount = parseInt(this.dataset.bands);
      
      // Update active state
      document.querySelectorAll('.eq-band-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      // Recreate sliders
      createEQSliders(bandCount);
      
      // Reload audio to apply new EQ if playing
      if (currentFileName && wavesurfer) {
        playFile(currentFileName);
      }
    });
  });

  // Create the EQ UI with default 31 bands
  createEQSliders(31);

  // ==========================================
  // DJ DECK FUNCTIONALITY
  // ==========================================
  const djDeck = document.getElementById('djDeck');
  const djDisc = document.getElementById('djDisc');
  const djPowerBtn = document.getElementById('djPowerBtn');
  const djBackBtn = document.getElementById('djBackBtn');
  const djForwardBtn = document.getElementById('djForwardBtn');
  const djCueBtn = document.getElementById('djCueBtn');
  const djPositionDisplay = document.getElementById('djPosition');
  const djSpeedDisplay = document.getElementById('djSpeed');
  const djStatusDisplay = document.getElementById('djStatus');
  
  let isDjPowered = false;
  let isDjDragging = false;
  let djLastAngle = 0;
  let djRotation = 0;
  let djAnimationId = null;
  let djSpeed = 1.0;
  
  // Format time for DJ display
  function formatDjTime(seconds) {
    const mins = Math.floor(Math.abs(seconds) / 60);
    const secs = Math.floor(Math.abs(seconds) % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  // Update DJ display
  function updateDjDisplay() {
    if (wavesurfer && wavesurfer.getDuration() > 0) {
      djPositionDisplay.textContent = formatDjTime(wavesurfer.getCurrentTime());
    }
    djSpeedDisplay.textContent = djSpeed.toFixed(2) + 'x';
  }
  
  // Animate the disc rotation while playing
  function animateDiscRotation() {
    if (!isDjPowered || !wavesurfer || !wavesurfer.isPlaying()) {
      return;
    }
    
    // Rotate based on playback speed
    djRotation += djSpeed * 2;
    djDisc.style.setProperty('--dj-rotation', djRotation + 'deg');
    
    updateDjDisplay();
    djAnimationId = requestAnimationFrame(animateDiscRotation);
  }
  
  // Start disc animation
  function startDiscAnimation() {
    if (djAnimationId) {
      cancelAnimationFrame(djAnimationId);
    }
    animateDiscRotation();
  }
  
  // Stop disc animation
  function stopDiscAnimation() {
    if (djAnimationId) {
      cancelAnimationFrame(djAnimationId);
      djAnimationId = null;
    }
  }
  
  // Power button - toggle DJ deck
  if (djPowerBtn) {
    djPowerBtn.addEventListener('click', function() {
      isDjPowered = !isDjPowered;
      this.classList.toggle('active', isDjPowered);
      djDeck.classList.toggle('disabled', !isDjPowered);
      
      if (isDjPowered) {
        djStatusDisplay.textContent = 'Prêt';
        if (wavesurfer && wavesurfer.isPlaying()) {
          startDiscAnimation();
        }
      } else {
        djStatusDisplay.textContent = 'Éteint';
        stopDiscAnimation();
      }
    });
  }
  
  // Back button - rewind 2 seconds
  if (djBackBtn) {
    djBackBtn.addEventListener('click', function() {
      if (!isDjPowered || !wavesurfer) return;
      
      const currentTime = wavesurfer.getCurrentTime();
      const newTime = Math.max(0, currentTime - 2);
      wavesurfer.seekTo(newTime / wavesurfer.getDuration());
      updateDjDisplay();
      
      // Visual feedback
      this.classList.add('active');
      setTimeout(() => this.classList.remove('active'), 150);
    });
  }
  
  // Forward button - forward 2 seconds
  if (djForwardBtn) {
    djForwardBtn.addEventListener('click', function() {
      if (!isDjPowered || !wavesurfer) return;
      
      const currentTime = wavesurfer.getCurrentTime();
      const duration = wavesurfer.getDuration();
      const newTime = Math.min(duration, currentTime + 2);
      wavesurfer.seekTo(newTime / duration);
      updateDjDisplay();
      
      // Visual feedback
      this.classList.add('active');
      setTimeout(() => this.classList.remove('active'), 150);
    });
  }
  
  // Cue button - go to beginning
  if (djCueBtn) {
    djCueBtn.addEventListener('click', function() {
      if (!isDjPowered || !wavesurfer) return;
      
      wavesurfer.seekTo(0);
      djRotation = 0;
      djDisc.style.setProperty('--dj-rotation', '0deg');
      updateDjDisplay();
      
      // Visual feedback
      this.classList.add('active');
      setTimeout(() => this.classList.remove('active'), 150);
    });
  }
  
  // Disc scratching / dragging with REAL vinyl effect
  if (djDisc) {
    let lastScratchTime = 0;
    let scratchVelocity = 0;
    let wasPlayingBeforeScratch = false;
    let scratchAnimationId = null;
    
    // Calculate angle from center of disc
    function getAngleFromCenter(e, element) {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      
      return Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
    }
    
    // Apply vinyl scratch effect - changes playback rate based on rotation
    function applyScratchEffect(deltaAngle, deltaTime) {
      if (!wavesurfer || !wavesurfer.backend) return;
      
      // Calculate rotation velocity (degrees per millisecond)
      const velocity = deltaTime > 0 ? deltaAngle / deltaTime : 0;
      scratchVelocity = velocity;
      
      // Convert velocity to playback rate
      // Positive rotation = forward, negative = backward
      // Scale: ~1 degree/ms = normal speed (1x)
      let scratchRate = velocity * 3; // Amplify for responsiveness
      
      // Clamp the rate to reasonable bounds
      scratchRate = Math.max(-3, Math.min(3, scratchRate));
      
      try {
        // WaveSurfer doesn't support negative playback rates natively,
        // so we'll simulate by seeking backwards rapidly
        if (scratchRate < 0) {
          // Backward scratch - seek backwards
          const currentTime = wavesurfer.getCurrentTime();
          const seekAmount = Math.abs(scratchRate) * 0.05; // Adjust sensitivity
          const newTime = Math.max(0, currentTime - seekAmount);
          wavesurfer.seekTo(newTime / wavesurfer.getDuration());
          
          // Set a slow positive rate to simulate the backwards sound
          wavesurfer.setPlaybackRate(0.1);
        } else if (scratchRate > 0.1) {
          // Forward scratch - play at modified speed
          wavesurfer.setPlaybackRate(scratchRate);
          
          // Make sure it's playing
          if (!wavesurfer.isPlaying()) {
            wavesurfer.play();
          }
        } else {
          // Very slow or stopped - pause
          wavesurfer.setPlaybackRate(0.1);
        }
      } catch (err) {
        console.warn('Scratch effect error:', err);
      }
    }
    
    // Spin-down effect when releasing the disc
    function spinDownEffect() {
      if (scratchAnimationId) {
        cancelAnimationFrame(scratchAnimationId);
      }
      
      let currentRate = Math.abs(scratchVelocity * 3);
      
      function animateSpinDown() {
        currentRate *= 0.92; // Decay factor
        
        if (currentRate > 0.05) {
          try {
            wavesurfer.setPlaybackRate(Math.max(0.1, currentRate));
          } catch (err) {}
          scratchAnimationId = requestAnimationFrame(animateSpinDown);
        } else {
          // Restore normal playback
          try {
            wavesurfer.setPlaybackRate(djSpeed);
            if (wasPlayingBeforeScratch) {
              wavesurfer.play();
            }
          } catch (err) {}
          scratchAnimationId = null;
        }
      }
      
      animateSpinDown();
    }
    
    function handleDragStart(e) {
      if (!isDjPowered) return;
      
      e.preventDefault();
      isDjDragging = true;
      djDisc.classList.add('is-dragging');
      djLastAngle = getAngleFromCenter(e, djDisc);
      lastScratchTime = performance.now();
      scratchVelocity = 0;
      
      // Remember if we were playing
      wasPlayingBeforeScratch = wavesurfer && wavesurfer.isPlaying();
      
      // Cancel any ongoing spin effect
      if (scratchAnimationId) {
        cancelAnimationFrame(scratchAnimationId);
        scratchAnimationId = null;
      }
      
      djStatusDisplay.textContent = 'Scratch';
    }
    
    function handleDragMove(e) {
      if (!isDjDragging || !isDjPowered) return;
      
      e.preventDefault();
      const now = performance.now();
      const deltaTime = now - lastScratchTime;
      lastScratchTime = now;
      
      const currentAngle = getAngleFromCenter(e, djDisc);
      let deltaAngle = currentAngle - djLastAngle;
      
      // Handle angle wrap-around
      if (deltaAngle > 180) deltaAngle -= 360;
      if (deltaAngle < -180) deltaAngle += 360;
      
      djRotation += deltaAngle;
      djDisc.style.setProperty('--dj-rotation', djRotation + 'deg');
      djLastAngle = currentAngle;
      
      // Apply the vinyl scratch effect
      applyScratchEffect(deltaAngle, deltaTime);
      
      // Update position display
      updateDjDisplay();
      
      // Update speed display with scratch velocity
      const displayRate = Math.abs(scratchVelocity * 3).toFixed(2);
      djSpeedDisplay.textContent = (scratchVelocity < 0 ? '-' : '') + displayRate + 'x';
    }
    
    function handleDragEnd(e) {
      if (!isDjDragging) return;
      
      isDjDragging = false;
      djDisc.classList.remove('is-dragging');
      
      if (isDjPowered && wavesurfer) {
        djStatusDisplay.textContent = wasPlayingBeforeScratch ? 'Lecture' : 'Pause';
        
        // Apply spin-down effect for smooth transition
        spinDownEffect();
        
        // Restore speed display
        setTimeout(() => {
          djSpeedDisplay.textContent = djSpeed.toFixed(2) + 'x';
        }, 500);
      }
    }
    
    // Mouse events
    djDisc.addEventListener('mousedown', handleDragStart);
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
    
    // Touch events
    djDisc.addEventListener('touchstart', handleDragStart, { passive: false });
    document.addEventListener('touchmove', handleDragMove, { passive: false });
    document.addEventListener('touchend', handleDragEnd);
  }
  
  // Sync DJ deck with wavesurfer events
  wavesurfer.on('play', function() {
    if (isDjPowered) {
      djStatusDisplay.textContent = 'Lecture';
      startDiscAnimation();
    }
  });
  
  wavesurfer.on('pause', function() {
    if (isDjPowered) {
      djStatusDisplay.textContent = 'Pause';
      stopDiscAnimation();
    }
  });
  
  wavesurfer.on('finish', function() {
    if (isDjPowered) {
      djStatusDisplay.textContent = 'Terminé';
      stopDiscAnimation();
    }
  });
  
  wavesurfer.on('seek', function() {
    updateDjDisplay();
  });
  
  // Sync speed with pitch control
  const pitchSpeedSlider = document.getElementById('pitchSpeed');
  if (pitchSpeedSlider) {
    pitchSpeedSlider.addEventListener('input', function() {
      djSpeed = parseFloat(this.value);
      updateDjDisplay();
    });
  }
  
  // Initialize DJ deck display
  updateDjDisplay();

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
          eqFilters = currentEqFreqs.map((f) => {
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
        const backend =
          wavesurfer && wavesurfer.backend ? wavesurfer.backend : null;
        let connectorNode = null;
        if (backend) {
          connectorNode =
            backend.gainNode || backend.gain || backend.masterGain || null;
        }

        try {
          if (connectorNode && typeof connectorNode.connect === "function") {
            if (window.__pitcherDebug)
              window.__pitcherDebug.log("Routing via backend connector node");
            // detach original connection and route through our EQ/reverb chain
            try {
              connectorNode.disconnect();
            } catch (e) {
              /* ignore */
            }

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
            if (window.__pitcherDebug)
              window.__pitcherDebug.log("Routing via backend connector done");
          } else if (source) {
            if (window.__pitcherDebug)
              window.__pitcherDebug.log("Routing via source node fallback");
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
            if (window.__pitcherDebug)
              window.__pitcherDebug.log("Routing via source done");
          } else {
            console.warn(
              "No connector node or source found — audio routing may be incomplete"
            );
            if (window.__pitcherDebug)
              window.__pitcherDebug.log("No connector node or source found");
          }
        } catch (routeErr) {
          console.warn(
            "Error while routing audio nodes for reverb/EQ",
            routeErr
          );
          if (window.__pitcherDebug)
            window.__pitcherDebug.log(
              "Routing error: " +
                (routeErr && routeErr.message
                  ? routeErr.message
                  : String(routeErr))
            );
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
        await handleFiles(e.target.files);
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
      const formatSelect = document.getElementById("exportFormat");
      const selectedFormat = formatSelect.value;
      
      btn.disabled = true;
      btn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Export en cours...';

      // cancellation controller for this export run
      const exportAbort = { canceled: false };
      const cancelBtn = document.getElementById("cancelExportBtn");
      function onCancelClick() {
        exportAbort.canceled = true;
        try {
          btn.innerHTML = '<i class="fas fa-ban"></i> Annulation...';
        } catch (e) {}
        if (cancelBtn) cancelBtn.disabled = true;
      }
      if (cancelBtn) {
        cancelBtn.style.display = "inline-block";
        cancelBtn.disabled = false;
        cancelBtn.addEventListener("click", onCancelClick);
      }

      // Parse format settings
      function parseFormatSettings(format) {
        const [type, quality] = format.split('-');
        return {
          type: type,
          quality: quality ? parseInt(quality) : null,
          extension: getExtension(type),
          mimeType: getMimeType(type)
        };
      }
      
      function getExtension(type) {
        const extensions = {
          'mp3': '.mp3',
          'wav': '.wav',
          'ogg': '.ogg',
          'flac': '.flac',
          'aac': '.m4a',
          'webm': '.webm'
        };
        return extensions[type] || '.mp3';
      }
      
      function getMimeType(type) {
        const mimeTypes = {
          'mp3': 'audio/mpeg',
          'wav': 'audio/wav',
          'ogg': 'audio/ogg',
          'flac': 'audio/flac',
          'aac': 'audio/mp4',
          'webm': 'audio/webm'
        };
        return mimeTypes[type] || 'audio/mpeg';
      }

      // helper: encode rendered AudioBuffer to MP3 Blob using lamejs
      async function encodeToMp3(renderedBuffer, kbps = 192) {
        if (
          typeof lamejs === "undefined" &&
          typeof window.Mp3Encoder === "undefined"
        ) {
          throw new Error("lamejs non chargé");
        }

        if (exportAbort.canceled) throw new Error("Export cancelled");

        function floatTo16BitPCM(float32Array) {
          const l = float32Array.length;
          const int16 = new Int16Array(l);
          for (let i = 0; i < l; i++) {
            let s = Math.max(-1, Math.min(1, float32Array[i]));
            if (isNaN(s)) s = 0;
            int16[i] = s < 0 ? Math.floor(s * 0x8000) : Math.floor(s * 0x7fff);
          }
          return int16;
        }

        const Mp3Encoder =
          window.Mp3Encoder ||
          (lamejs && lamejs.Mp3Encoder) ||
          (window.lamejs && window.lamejs.Mp3Encoder);
        const channels = renderedBuffer.numberOfChannels;
        const sampleRate = renderedBuffer.sampleRate;
        const mp3encoder = new Mp3Encoder(channels, sampleRate, kbps);

        const left = renderedBuffer.getChannelData(0);
        const right = channels > 1 ? renderedBuffer.getChannelData(1) : null;
        const blockSize = 1152;
        const mp3Chunks = [];

        for (let i = 0; i < renderedBuffer.length; i += blockSize) {
          if (exportAbort.canceled) throw new Error("Export cancelled");
          const chunkSize = Math.min(blockSize, renderedBuffer.length - i);
          const leftChunkRaw = left.subarray(i, i + chunkSize);
          const leftChunk = floatTo16BitPCM(leftChunkRaw);

          let rightChunk = null;
          if (channels > 1) {
            if (right) {
              const rightChunkRaw = right.subarray(i, i + chunkSize);
              rightChunk = floatTo16BitPCM(rightChunkRaw);
            } else {
              rightChunk = new Int16Array(chunkSize);
            }
          }

          if (chunkSize < blockSize) {
            const paddedLeft = new Int16Array(blockSize);
            paddedLeft.set(leftChunk);
            if (channels > 1) {
              const paddedRight = new Int16Array(blockSize);
              if (rightChunk) paddedRight.set(rightChunk);
              const mp3buf = mp3encoder.encodeBuffer(paddedLeft, paddedRight);
              if (mp3buf && mp3buf.length > 0)
                mp3Chunks.push(new Uint8Array(mp3buf));
            } else {
              const mp3buf = mp3encoder.encodeBuffer(paddedLeft);
              if (mp3buf && mp3buf.length > 0)
                mp3Chunks.push(new Uint8Array(mp3buf));
            }
          } else {
            if (channels > 1) {
              const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
              if (mp3buf && mp3buf.length > 0)
                mp3Chunks.push(new Uint8Array(mp3buf));
            } else {
              const mp3buf = mp3encoder.encodeBuffer(leftChunk);
              if (mp3buf && mp3buf.length > 0)
                mp3Chunks.push(new Uint8Array(mp3buf));
            }
          }
        }

        const mp3bufEnd = mp3encoder.flush();
        if (mp3bufEnd && mp3bufEnd.length > 0)
          mp3Chunks.push(new Uint8Array(mp3bufEnd));

        return new Blob(mp3Chunks, { type: "audio/mpeg" });
      }

      // helper: encode to WAV
      function encodeToWav(renderedBuffer, bitDepth = 16) {
        const numChannels = renderedBuffer.numberOfChannels;
        const sampleRate = renderedBuffer.sampleRate;
        const length = renderedBuffer.length;
        
        let bytesPerSample;
        let formatType;
        
        if (bitDepth === 32) {
          bytesPerSample = 4;
          formatType = 3; // IEEE float
        } else if (bitDepth === 24) {
          bytesPerSample = 3;
          formatType = 1; // PCM
        } else {
          bytesPerSample = 2;
          formatType = 1; // PCM
          bitDepth = 16;
        }
        
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const dataSize = length * blockAlign;
        const bufferSize = 44 + dataSize;
        
        const buffer = new ArrayBuffer(bufferSize);
        const view = new DataView(buffer);
        
        // WAV header
        const writeString = (offset, str) => {
          for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
          }
        };
        
        writeString(0, 'RIFF');
        view.setUint32(4, bufferSize - 8, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, formatType, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true);
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);
        
        // Write audio data
        let offset = 44;
        for (let i = 0; i < length; i++) {
          for (let ch = 0; ch < numChannels; ch++) {
            const sample = renderedBuffer.getChannelData(ch)[i];
            
            if (bitDepth === 32) {
              view.setFloat32(offset, sample, true);
              offset += 4;
            } else if (bitDepth === 24) {
              const s = Math.max(-1, Math.min(1, sample));
              const val = Math.floor(s * 0x7FFFFF);
              view.setUint8(offset, val & 0xFF);
              view.setUint8(offset + 1, (val >> 8) & 0xFF);
              view.setUint8(offset + 2, (val >> 16) & 0xFF);
              offset += 3;
            } else {
              const s = Math.max(-1, Math.min(1, sample));
              const val = s < 0 ? Math.floor(s * 0x8000) : Math.floor(s * 0x7FFF);
              view.setInt16(offset, val, true);
              offset += 2;
            }
          }
        }
        
        return new Blob([buffer], { type: 'audio/wav' });
      }

      // helper: encode using MediaRecorder for OGG, WebM, AAC
      async function encodeWithMediaRecorder(renderedBuffer, mimeType, targetBitrate = 192000) {
        return new Promise((resolve, reject) => {
          // Create an offline audio context to play the buffer
          const audioContext = new AudioContext({ sampleRate: renderedBuffer.sampleRate });
          const dest = audioContext.createMediaStreamDestination();
          
          const source = audioContext.createBufferSource();
          source.buffer = renderedBuffer;
          source.connect(dest);
          
          // Determine best mime type
          let actualMimeType = mimeType;
          const mimeOptions = [mimeType, 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/ogg'];
          for (const option of mimeOptions) {
            if (MediaRecorder.isTypeSupported(option)) {
              actualMimeType = option;
              break;
            }
          }
          
          const recorder = new MediaRecorder(dest.stream, {
            mimeType: actualMimeType,
            audioBitsPerSecond: targetBitrate
          });
          
          const chunks = [];
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };
          
          recorder.onstop = () => {
            audioContext.close();
            resolve(new Blob(chunks, { type: actualMimeType }));
          };
          
          recorder.onerror = (e) => {
            audioContext.close();
            reject(e.error);
          };
          
          recorder.start();
          source.start();
          source.onended = () => {
            setTimeout(() => recorder.stop(), 100);
          };
        });
      }

      // Main processing function
      async function processFile(file, formatSettings) {
        const arrayBuffer = await file.arrayBuffer();
        const decoded = await audioProcessor.audioContext.decodeAudioData(
          arrayBuffer.slice(0)
        );

        if (exportAbort.canceled) throw new Error("Export cancelled");

        const playbackRate =
          parseFloat(document.getElementById("pitchSpeed").value) || 1;
        const preRollSeconds =
          parseFloat(
            document.getElementById("preRoll")
              ? document.getElementById("preRoll").value
              : 0
          ) || 0;
        const sampleRate = decoded.sampleRate;
        const preRollSamples = Math.ceil(preRollSeconds * sampleRate);
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
        const offlineFilters = currentEqFreqs.map((f, i) => {
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
        if (exportAbort.canceled) throw new Error("Export cancelled");
        const renderedBuffer = await offlineContext.startRendering();

        if (exportAbort.canceled) throw new Error("Export cancelled");

        // Encode based on format
        switch (formatSettings.type) {
          case 'mp3':
            return await encodeToMp3(renderedBuffer, formatSettings.quality || 192);
          
          case 'wav':
            return encodeToWav(renderedBuffer, formatSettings.quality || 16);
          
          case 'ogg':
            try {
              return await encodeWithMediaRecorder(renderedBuffer, 'audio/ogg;codecs=opus', (formatSettings.quality || 192) * 1000);
            } catch (e) {
              console.warn('OGG export failed, falling back to WebM:', e);
              return await encodeWithMediaRecorder(renderedBuffer, 'audio/webm;codecs=opus', (formatSettings.quality || 192) * 1000);
            }
          
          case 'flac':
            // FLAC encoding requires specialized library, fallback to WAV 24-bit
            console.warn('FLAC export not fully supported, exporting as high-quality WAV');
            return encodeToWav(renderedBuffer, 24);
          
          case 'aac':
            try {
              return await encodeWithMediaRecorder(renderedBuffer, 'audio/mp4;codecs=mp4a.40.2', (formatSettings.quality || 192) * 1000);
            } catch (e) {
              console.warn('AAC export failed, falling back to MP3:', e);
              return await encodeToMp3(renderedBuffer, formatSettings.quality || 192);
            }
          
          case 'webm':
            return await encodeWithMediaRecorder(renderedBuffer, 'audio/webm;codecs=opus', 192000);
          
          default:
            return await encodeToMp3(renderedBuffer, 192);
        }
      }

      const formatSettings = parseFormatSettings(selectedFormat);

      try {
        if (audioFiles.size === 1) {
          const [[name, file]] = Array.from(audioFiles.entries());
          const exportedBlob = await processFile(file, formatSettings);
          const url = URL.createObjectURL(exportedBlob);
          const a = document.createElement("a");
          a.href = url;
          const baseName = name.replace(/\.[^/.]+$/, "");
          const finalName = baseName + formatSettings.extension;
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
            if (exportAbort.canceled) break;
            i++;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Export ${i}/${audioFiles.size}...`;
            const exportedBlob = await processFile(file, formatSettings);
            const baseName = name.replace(/\.[^/.]+$/, "");
            const finalName = baseName + formatSettings.extension;
            zip.file(finalName, exportedBlob);
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
          '<i class="fas fa-download"></i> <span>Exporter</span>';
        // hide and cleanup cancel button
        try {
          if (cancelBtn) {
            cancelBtn.style.display = "none";
            cancelBtn.disabled = true;
            cancelBtn.removeEventListener("click", onCancelClick);
          }
        } catch (e) {}
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
