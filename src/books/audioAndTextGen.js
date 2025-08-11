// -----audioAndTextGen.js------

import { AudioCore } from '../audio/audio-core.js';
import { TextProcessor } from '../audio/text-processor.js';
import { WordHighlighter } from '../audio/word-highlighter.js';
import { ReadAlong } from '../audio/read-along.js';
import { ParagraphSeeker } from '../audio/paragraph-seeker.js';

/**
 * Single-page audio/text orchestrator (UI-agnostic).
 * ReadAlong is a singleton shared across pages.
 */
export class AudioSystem {
  constructor(audioFile, timingFile, textFile, offsetMs = 0) {
    this.audioCore = new AudioCore(audioFile, offsetMs);
    this.textProcessor = new TextProcessor(textFile, timingFile, offsetMs);
    this.highlighter = new WordHighlighter(this.textProcessor);

    // 🔸 singleton read-along
    this.readAlong = ReadAlong.get(this.highlighter);

    this.paragraphSeeker = new ParagraphSeeker(this.textProcessor, this.audioCore);
    this._armed = false;

    this.setupConnections();
  }

  setupConnections() {
    // Start/stop highlight loop with audio
    this.audioCore.onPlay(() => {
      this.highlighter.startHighlighting(
        () => this.audioCore.getCurrentTime(),
        () => this.audioCore.getDuration()
      );
    });

    this.audioCore.onPause(() => {
      this.highlighter.stopHighlighting();
    });

    this.audioCore.onEnd(() => {
      this.highlighter.stopHighlighting();
      this.highlighter.handleAudioEnd(this.audioCore.getDuration());
    });

    this.audioCore.onSeek((currentTime) => {
      this.highlighter.handleSeek(currentTime);
    });

    // 🔸 Notify read-along whenever words are painted
    const original = this.highlighter.highlightWordsInRange.bind(this.highlighter);
    this.highlighter.highlightWordsInRange = (startIndex, endIndex, reason = '') => {
      original(startIndex, endIndex, reason);
      this.readAlong.onWordHighlighted();
    };
  }

  async init() {
    printl('🎵 Initializing audio system...');
    try {
      await this.textProcessor.init();
      printl('✅ Text processor initialized');

      this.audioCore.setupAudio();
      printl('✅ Audio core initialized');

      this.paragraphSeeker.enableParagraphNavigation?.();
      printl('✅ Paragraph navigation enabled');

      printl('🚀 Audio system ready!');
    } catch (error) {
      printError('❌ Error initializing audio system:', error);
      throw error;
    }
  }

  // ---------- arm/disarm ----------
  arm() {
    this._armed = true;
    // ensure singleton follows the active page’s highlighter
    this.readAlong.rebindHighlighter(this.highlighter);
  }

  disarm() {
    this._armed = false;
    try {
      this.highlighter.stopHighlighting();
      this.audioCore.pauseAudio();
    } catch {}
  }

  // ---------- transport ----------
  async play() { await this.audioCore.playAudio(); }
  pause() { this.audioCore.pauseAudio(); }
  toggle() { this.audioCore.toggleAudio(); }
  forward() { this.audioCore.forward(); }
  rewind() { this.audioCore.rewind(); }

  setPlaybackSpeed(speed) { this.audioCore.setPlaybackSpeed(speed); }
  getCurrentTime() { return this.audioCore.getCurrentTime(); }
  getDuration() { return this.audioCore.getDuration(); }

  // ---------- highlighting / read-along ----------
  clearHighlights() { this.highlighter.clearAllHighlights(); }
  toggleReadAlong() { this.readAlong.toggle(); }
  isReadAlongActive() { return this.readAlong.isActive; }

  // ---------- paragraph seeking ----------
  async seekToParagraph(paragraphText, options = {}) {
    return await this.paragraphSeeker.seekToParagraph(paragraphText, options);
  }
  async seekToParagraphs(paragraphTexts, options = {}) {
    return await this.paragraphSeeker.seekToParagraphs(paragraphTexts, options);
  }
  extractParagraphs() { return this.paragraphSeeker.extractParagraphs(); }
  setParagraphSeekingThreshold(threshold) { this.paragraphSeeker.setMinProbabilityThreshold(threshold); }
  setParagraphContextWindow(windowSize) { this.paragraphSeeker.setContextWindow(windowSize); }

  async seekToText(text) {
    printl(`🔍 Seeking to text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    return await this.seekToParagraph(text);
  }
  async seekToSentence(sentence) {
    printl(`🔍 Seeking to sentence: "${sentence}"`);
    return await this.seekToParagraph(sentence);
  }

  enableParagraphNavigation()  { this.paragraphSeeker?.enableParagraphNavigation?.(); }
  disableParagraphNavigation() { this.paragraphSeeker?.disableParagraphNavigation?.(); }
  refreshParagraphNavigation() { this.paragraphSeeker?.refreshParagraphNavigation?.(); }

  destroy() {
    try {
      this.highlighter.stopHighlighting();
      if (this.audioCore?.sound) this.audioCore.sound.unload();
    } catch {}
    printl('🧹 Audio system destroyed');
  }
}
