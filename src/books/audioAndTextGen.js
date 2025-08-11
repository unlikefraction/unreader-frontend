// -----audioAndTextGen.js------

import { AudioCore } from '../audio/audio-core.js';
import { TextProcessor } from '../audio/text-processor.js';
import { WordHighlighter } from '../audio/word-highlighter.js';
import { ReadAlong } from '../audio/read-along.js';
import { ParagraphSeeker } from '../audio/paragraph-seeker.js';

/**
 * Main audio system that orchestrates all components for a single page.
 * This version is UI-agnostic (no per-instance button/slider bindings).
 * Global controls are wired in MultiPageReader.
 */
export class AudioSystem {
  constructor(audioFile, timingFile, textFile, offsetMs = 0) {
    // Core pieces
    this.audioCore = new AudioCore(audioFile, offsetMs);
    this.textProcessor = new TextProcessor(textFile, timingFile, offsetMs);
    this.highlighter = new WordHighlighter(this.textProcessor);
    this.readAlong = new ReadAlong(this.highlighter);
    this.paragraphSeeker = new ParagraphSeeker(this.textProcessor, this.audioCore);

    // internal state
    this._armed = false; // logical active flag for MultiPageReader

    this.setupConnections();
  }

  setupConnections() {
    // when audio starts, start highlighting ticks
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

    // IMPORTANT: do NOT bind any per-instance DOM controls here.
    // MultiPageReader owns the global play/pause/seek/speed UI.
  }

  // Boot the page: load text + timings, prepare audio, enable hover nav
  async init() {
    printl('🎵 Initializing audio system...');
    try {
      await this.textProcessor.init();
      printl('✅ Text processor initialized');

      this.audioCore.setupAudio();
      printl('✅ Audio core initialized');

      // Keep paragraph navigation on for cross-page hover/jump behavior
      if (this.paragraphSeeker?.enableParagraphNavigation) {
        this.paragraphSeeker.enableParagraphNavigation();
        printl('✅ Paragraph navigation enabled');
      }

      printl('🚀 Audio system ready!');
    } catch (error) {
      printError('❌ Error initializing audio system:', error);
      throw error;
    }
  }

  // ---------- arm/disarm for MultiPageReader ----------
  // Arm: mark as active page (no DOM class here; reader handles styling)
  arm() {
    this._armed = true;
    // read-along stays available; it only moves on highlight events while playing
  }

  // Disarm: pause/stop highlight loop; keep paragraph hover enabled for cross-page jumps
  disarm() {
    this._armed = false;
    try {
      this.highlighter.stopHighlighting();
      // don't clear highlights here—reader decides when to clear/keep
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

  // Optional: build a nav list of paragraphs with tiny helpers
  async createParagraphNavigation() {
    const paragraphs = this.extractParagraphs();
    if (paragraphs.length === 0) {
      printError('No paragraphs found in text');
      return [];
    }
    printl(`📝 Found ${paragraphs.length} paragraphs`);
    return paragraphs.map((paragraph, index) => ({
      index,
      text: paragraph,
      preview: paragraph.substring(0, 100) + (paragraph.length > 100 ? '...' : ''),
      seekTo: async () => {
        const result = await this.seekToParagraph(paragraph);
        if (result.success) printl(`✅ Navigated to paragraph ${index + 1}`);
        else printError(`❌ Failed to navigate to paragraph ${index + 1}:`, result.error);
        return result;
      }
    }));
  }

  // Expose nav toggles if you ever need them
  enableParagraphNavigation()  { this.paragraphSeeker?.enableParagraphNavigation?.(); }
  disableParagraphNavigation() { this.paragraphSeeker?.disableParagraphNavigation?.(); }
  refreshParagraphNavigation() { this.paragraphSeeker?.refreshParagraphNavigation?.(); }

  // ---------- cleanup ----------
  destroy() {
    try {
      this.highlighter.stopHighlighting();
      if (this.audioCore?.sound) this.audioCore.sound.unload();
    } catch {}
    printl('🧹 Audio system destroyed');
  }
}
