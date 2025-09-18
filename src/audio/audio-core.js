// ----audio-core.js---------
import { Howl, Howler } from 'howler';

/**
 * Core audio functionality using Howler.js
 * Headless: no DOM mutations; UI is owned by MultiPageReader.
 */
export class AudioCore {
  static _controlsBound = false; // avoid binding play/ff/rw multiple times

  constructor(audioFile, offsetMs = 0) {
    this.audioFile = audioFile;
    this.offsetMs = offsetMs;
    this.sound = null;
    this.isPlaying = false;
    this.playbackSpeed = 1.0;

    // Event callbacks (multi-listener)
    this._onPlayCbs = [];
    this._onPauseCbs = [];
    this._onEndCbs = [];
    this._onSeekCbs = [];
    this._onErrorCbs = [];
  }

  setupAudio() {
    if (!this.sound) {
      this.sound = new Howl({
        src: [this.audioFile],
        html5: true,
        preload: true,
        rate: this.playbackSpeed,
        onend: () => {
          this.isPlaying = false;
          try { if (window.Analytics) window.Analytics.isAudioPlaying = () => false; } catch {}
          try {
            if (window.Analytics) {
              const dur = this.getDuration();
              window.Analytics.capture('audio_end', { path: location.pathname, duration_s: dur });
            }
          } catch {}
          try { this._onEndCbs.forEach(fn => { try { fn(); } catch {} }); } catch {}
        },
        onloaderror: (id, error) => {
          printError?.('Audio loading error:', error);
          this.isPlaying = false;
          try { if (window.Analytics) window.Analytics.isAudioPlaying = () => false; } catch {}
          try { this._onErrorCbs.forEach(fn => { try { fn(error); } catch {} }); } catch {}
        },
        onplayerror: (id, error) => {
          printError?.('Audio play error:', error);
          this.isPlaying = false;
          try { if (window.Analytics) window.Analytics.isAudioPlaying = () => false; } catch {}
          try { this._onErrorCbs.forEach(fn => { try { fn(error); } catch {} }); } catch {}
        },
        onseek: () => {
          const currentTime = this.getCurrentTime();
          printl?.(`🔄 Audio seeked to: ${currentTime.toFixed(5)}s`);
          try { this._onSeekCbs.forEach(fn => { try { fn(currentTime); } catch {} }); } catch {}
        },
        onplay: () => {
          const startTime = this.getCurrentTime();
          this.isPlaying = true;
          printl?.(`▶️ Audio started playing from: ${startTime.toFixed(5)}s`);
          try { if (window.Analytics) window.Analytics.isAudioPlaying = () => true; } catch {}
          try { if (window.Analytics) window.Analytics.capture('audio_play', { path: location.pathname, at_s: startTime }); } catch {}
          try { this._onPlayCbs.forEach(fn => { try { fn(startTime); } catch {} }); } catch {}
        },
        onpause: () => {
          const pauseTime = this.getCurrentTime();
          this.isPlaying = false;
          printl?.(`⏸️ Audio paused at: ${pauseTime.toFixed(5)}s`);
          try { if (window.Analytics) window.Analytics.isAudioPlaying = () => false; } catch {}
          try { this._onPauseCbs.forEach(fn => { try { fn(pauseTime); } catch {} }); } catch {}
        }
      });
      // Ensure pitch is preserved when changing playbackRate on HTML5 media element
      try {
        const nodes = (this.sound && this.sound._sounds) ? this.sound._sounds : [];
        for (const s of nodes) {
          const el = s && s._node; if (!el) continue;
          // cross-browser flags
          el.preservesPitch = true;
          el.mozPreservesPitch = true;
          el.webkitPreservesPitch = true;
          // Belt-and-suspenders: reflect native play/pause (e.g., hardware keys)
          if (!el.__uiSyncBound) {
            el.addEventListener('play', () => {
              this.isPlaying = true;
              try { this._onPlayCbs.forEach(fn => { try { fn(this.getCurrentTime()); } catch {} }); } catch {}
            });
            el.addEventListener('pause', () => {
              this.isPlaying = false;
              try { this._onPauseCbs.forEach(fn => { try { fn(this.getCurrentTime()); } catch {} }); } catch {}
            });
            // Native ended also flows through Howler's onend, but keep UI consistent if it fires directly
            el.addEventListener('ended', () => {
              this.isPlaying = false;
              try { this._onEndCbs.forEach(fn => { try { fn(); } catch {} }); } catch {}
            });
            el.__uiSyncBound = true;
          }
        }
      } catch {}
    }
  }

  setPlaybackSpeed(speed) {
    this.playbackSpeed = speed;
    if (this.sound) {
      this.sound.rate(speed);
      try {
        const nodes = (this.sound && this.sound._sounds) ? this.sound._sounds : [];
        for (const s of nodes) {
          const el = s && s._node; if (!el) continue;
          el.preservesPitch = true; el.mozPreservesPitch = true; el.webkitPreservesPitch = true;
        }
      } catch {}
      printl?.(`⚡ Playback speed set to ${speed.toFixed(1)}x (pitch preserved)`);
    }
  }

  async playAudio() {
    try {
      this.setupAudio();
      if (!this.sound.playing()) {
        this.sound.play();
        // isPlaying flips true in onplay; UI updates happen in MultiPageReader listeners.
      }
    } catch (error) {
      printError?.('Error playing audio:', error);
      this.isPlaying = false;
      if (this.onErrorCallback) this.onErrorCallback(error);
    }
  }

  pauseAudio() {
    if (this.sound && this.sound.playing()) {
      this.sound.pause();
      // isPlaying flips false in onpause; UI updates happen in MultiPageReader listeners.
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

  // Event callback registration (additive)
  onPlay(callback)  { if (typeof callback === 'function') this._onPlayCbs.push(callback); }
  onPause(callback) { if (typeof callback === 'function') this._onPauseCbs.push(callback); }
  onEnd(callback)   { if (typeof callback === 'function') this._onEndCbs.push(callback); }
  onSeek(callback)  { if (typeof callback === 'function') this._onSeekCbs.push(callback); }
  onError(callback) { if (typeof callback === 'function') this._onErrorCbs.push(callback); }

  // Optional: if you really want these global controls here, keep them headless
  setupEventListeners() {
    if (AudioCore._controlsBound) return; // only bind once (first page)
    const playButton = document.querySelector('.playButton');
    const forward = document.querySelector('.forward');
    const rewind = document.querySelector('.rewind');

    if (playButton) {
      playButton.addEventListener('click', () => this.toggleAudio());
    }
    if (forward) {
      forward.addEventListener('click', () => this.forward());
    }
    if (rewind) {
      rewind.addEventListener('click', () => this.rewind());
    }
    AudioCore._controlsBound = true;
  }
}
