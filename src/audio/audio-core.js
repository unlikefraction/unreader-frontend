// ----audio-core.js---------

import { Howl, Howler } from 'howler';

/**
 * Core audio functionality using Howler.js
 */
export class AudioCore {
  constructor(audioFile, offsetMs = 0) {
    this.audioFile = audioFile;
    this.offsetMs = offsetMs;
    this.sound = null;
    this.isPlaying = false;
    this.playbackSpeed = 1.0;
    
    // Event callbacks
    this.onPlayCallback = null;
    this.onPauseCallback = null;
    this.onEndCallback = null;
    this.onSeekCallback = null;
    this.onErrorCallback = null;
  }

  setupAudio() {
    if (!this.sound) {
      this.sound = new Howl({
        src: [this.audioFile],
        html5: false,
        preload: true,
        rate: this.playbackSpeed,
        onend: () => {
          this.isPlaying = false;
          this.updatePlayButton(false);
          if (this.onEndCallback) this.onEndCallback();
        },
        onloaderror: (id, error) => {
          console.error('Audio loading error:', error);
          this.isPlaying = false;
          this.updatePlayButton(false);
          if (this.onErrorCallback) this.onErrorCallback(error);
        },
        onplayerror: (id, error) => {
          console.error('Audio play error:', error);
          this.isPlaying = false;
          this.updatePlayButton(false);
          if (this.onErrorCallback) this.onErrorCallback(error);
        },
        onseek: () => {
          const currentTime = this.getCurrentTime();
          console.log(`🔄 Audio seeked to: ${currentTime.toFixed(5)}s`);
          if (this.onSeekCallback) this.onSeekCallback(currentTime);
        },
        onplay: () => {
          const startTime = this.getCurrentTime();
          console.log(`▶️ Audio started playing from: ${startTime.toFixed(5)}s`);
          if (this.onPlayCallback) this.onPlayCallback(startTime);
        },
        onpause: () => {
          const pauseTime = this.getCurrentTime();
          console.log(`⏸️ Audio paused at: ${pauseTime.toFixed(5)}s`);
          if (this.onPauseCallback) this.onPauseCallback(pauseTime);
        }
      });
    }
  }

  setPlaybackSpeed(speed) {
    this.playbackSpeed = speed;
    if (this.sound) {
      this.sound.rate(speed);
      console.log(`⚡ Playback speed set to ${speed.toFixed(1)}x (pitch preserved)`);
    }
  }

  async playAudio() {
    try {
      this.setupAudio();
      
      if (!this.sound.playing()) {
        this.sound.play();
        this.updatePlayButton(true);
        this.isPlaying = true;
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      this.updatePlayButton(false);
      this.isPlaying = false;
      if (this.onErrorCallback) this.onErrorCallback(error);
    }
  }

  pauseAudio() {
    if (this.sound && this.sound.playing()) {
      this.sound.pause();
      this.updatePlayButton(false);
      this.isPlaying = false;
    }
  }

  toggleAudio() {
    if (this.isPlaying) {
      this.pauseAudio();
    } else {
      this.playAudio();
    }
  }

  forward() {
    if (this.sound) {
      const currentTime = this.sound.seek();
      const duration = this.sound.duration();
      const newTime = Math.min(currentTime + 10, duration);
      this.sound.seek(newTime);
    }
  }
  
  rewind() {
    if (this.sound) {
      const currentTime = this.sound.seek();
      const newTime = Math.max(currentTime - 10, 0);
      this.sound.seek(newTime);
    }
  }

  getCurrentTime() {
    return this.sound ? this.sound.seek() : 0;
  }

  getDuration() {
    return this.sound ? this.sound.duration() : 0;
  }

  updatePlayButton(playing) {
    const playButton = document.querySelector('.playButton');
    if (playButton) {
      const icon = playButton.querySelector('i');
      if (icon) {
        if (playing) {
          icon.className = 'ph ph-pause';
          playButton.classList.remove('paused');
        } else {
          icon.className = 'ph ph-play';
          playButton.classList.add('paused');
        }
      }
    }
  }

  // Event callback setters
  onPlay(callback) {
    this.onPlayCallback = callback;
  }

  onPause(callback) {
    this.onPauseCallback = callback;
  }

  onEnd(callback) {
    this.onEndCallback = callback;
  }

  onSeek(callback) {
    this.onSeekCallback = callback;
  }

  onError(callback) {
    this.onErrorCallback = callback;
  }

  setupEventListeners() {
    const playButton = document.querySelector('.playButton');
    const forward = document.querySelector('.forward');
    const rewind = document.querySelector('.rewind');
  
    if (playButton) {
      playButton.addEventListener('click', () => {
        this.toggleAudio();
      });
    }
  
    if (forward) {
      forward.addEventListener('click', () => {
        this.forward();
      });
    }
  
    if (rewind) {
      rewind.addEventListener('click', () => {
        this.rewind();
      });
    }
  }
}