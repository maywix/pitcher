// ==========================================
// RECORDER.JS - Audio Recording for Pitcher Pro
// ==========================================

class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.isRecording = false;
    this.isPaused = false;
    this.startTime = null;
    this.timerInterval = null;
    this.recordingName = '';
    
    // Audio context for visualization
    this.audioContext = null;
    this.analyser = null;
    this.animationId = null;
  }

  async init() {
    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      // Setup audio context for visualization
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      
      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.analyser);
      
      // Setup media recorder
      const options = { mimeType: 'audio/webm;codecs=opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'audio/webm';
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'audio/ogg';
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        delete options.mimeType; // Use default
      }
      
      this.mediaRecorder = new MediaRecorder(this.stream, options);
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      
      this.mediaRecorder.onstop = () => {
        this.handleRecordingComplete();
      };
      
      return true;
    } catch (error) {
      console.error('Erreur d\'accès au microphone:', error);
      throw new Error('Impossible d\'accéder au microphone. Vérifiez les permissions.');
    }
  }

  start() {
    if (!this.mediaRecorder) {
      throw new Error('Recorder not initialized');
    }
    
    this.audioChunks = [];
    this.isRecording = true;
    this.isPaused = false;
    this.startTime = Date.now();
    this.recordingName = `enregistrement_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    
    // Start recording with 100ms chunks for smooth processing
    this.mediaRecorder.start(100);
    
    // Start timer
    this.startTimer();
    
    // Start visualization
    this.startVisualization();
    
    return this.recordingName;
  }

  stop() {
    if (this.mediaRecorder && this.isRecording) {
      this.isRecording = false;
      this.isPaused = false;
      this.mediaRecorder.stop();
      this.stopTimer();
      this.stopVisualization();
    }
  }

  pause() {
    if (this.mediaRecorder && this.isRecording && !this.isPaused) {
      this.mediaRecorder.pause();
      this.isPaused = true;
      this.stopTimer();
    }
  }

  resume() {
    if (this.mediaRecorder && this.isRecording && this.isPaused) {
      this.mediaRecorder.resume();
      this.isPaused = false;
      this.startTimer();
    }
  }

  handleRecordingComplete() {
    const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
    const blob = new Blob(this.audioChunks, { type: mimeType });
    
    // Create a File object from the blob
    const extension = mimeType.includes('ogg') ? 'ogg' : 'webm';
    const file = new File([blob], `${this.recordingName}.${extension}`, { 
      type: mimeType,
      lastModified: Date.now()
    });
    
    // Dispatch custom event with the recorded file
    const event = new CustomEvent('recordingComplete', { 
      detail: { 
        file: file,
        blob: blob,
        name: this.recordingName,
        duration: this.getElapsedTime()
      }
    });
    window.dispatchEvent(event);
    
    // Reset chunks
    this.audioChunks = [];
  }

  startTimer() {
    const timerElement = document.getElementById('recordTimer');
    if (!timerElement) return;
    
    this.timerInterval = setInterval(() => {
      if (!this.isPaused) {
        timerElement.textContent = this.formatTime(this.getElapsedTime());
      }
    }, 100);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  getElapsedTime() {
    if (!this.startTime) return 0;
    return (Date.now() - this.startTime) / 1000;
  }

  formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  startVisualization() {
    const canvas = document.getElementById('recordVisualizer');
    if (!canvas || !this.analyser) return;
    
    const ctx = canvas.getContext('2d');
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Set canvas size
    const updateCanvasSize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    updateCanvasSize();
    
    const draw = () => {
      if (!this.isRecording) return;
      
      this.animationId = requestAnimationFrame(draw);
      
      this.analyser.getByteFrequencyData(dataArray);
      
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      
      // Clear canvas with gradient background
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, 'rgba(255, 85, 0, 0.1)');
      gradient.addColorStop(0.5, 'rgba(255, 119, 51, 0.15)');
      gradient.addColorStop(1, 'rgba(255, 85, 0, 0.1)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      
      // Draw frequency bars
      const barWidth = (width / bufferLength) * 2.5;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height * 0.8;
        
        // Create gradient for each bar
        const barGradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
        barGradient.addColorStop(0, '#ff5500');
        barGradient.addColorStop(0.5, '#ff7733');
        barGradient.addColorStop(1, '#ffaa66');
        
        ctx.fillStyle = barGradient;
        ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
        
        x += barWidth;
      }
    };
    
    draw();
  }

  stopVisualization() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    // Clear canvas
    const canvas = document.getElementById('recordVisualizer');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  destroy() {
    this.stop();
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.mediaRecorder = null;
  }
}

// Export for use in main.js
if (typeof window !== 'undefined') {
  window.AudioRecorder = AudioRecorder;
}
