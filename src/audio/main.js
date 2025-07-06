import { AudioCore } from './audio-core.js';
import { TextProcessor } from './text-processor.js';
import { WordHighlighter } from './word-highlighter.js';
import { ReadAlong } from './read-along.js';
import { PlaybackControls } from './playback-controls.js';
import { ParagraphSeeker } from './paragraph-seeker.js';

/**
 * Main audio system that orchestrates all components
 */
export class AudioSystem {
  constructor(audioFile, timingFile, textFile, offsetMs = 0) {
    // Initialize core components
    this.audioCore = new AudioCore(audioFile, offsetMs);
    this.textProcessor = new TextProcessor(textFile, timingFile, offsetMs);
    this.highlighter = new WordHighlighter(this.textProcessor);
    this.readAlong = new ReadAlong(this.highlighter);
    this.playbackControls = new PlaybackControls(this.audioCore);
    this.paragraphSeeker = new ParagraphSeeker(this.textProcessor, this.audioCore);
    
    // Setup component connections
    this.setupConnections();
  }

  setupConnections() {
    // Connect audio events to highlighter
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

    // Connect highlighter to read-along
    // Override the original highlightWordsInRange to notify read-along
    const originalHighlightWordsInRange = this.highlighter.highlightWordsInRange.bind(this.highlighter);
    this.highlighter.highlightWordsInRange = (startIndex, endIndex, reason = '') => {
      originalHighlightWordsInRange(startIndex, endIndex, reason);
      this.readAlong.onWordHighlighted();
    };

    // Setup audio controls
    this.audioCore.setupEventListeners();
  }

  // Public API methods
  async init() {
    console.log('🎵 Initializing audio system...');
    
    try {
      // Initialize text processor first
      await this.textProcessor.init();
      console.log('✅ Text processor initialized');
      
      // Setup audio core
      this.audioCore.setupAudio();
      console.log('✅ Audio core initialized');
      
      // Enable paragraph hover navigation if available
      if (this.paragraphSeeker && typeof this.paragraphSeeker.enableParagraphNavigation === 'function') {
        this.paragraphSeeker.enableParagraphNavigation();
        console.log('✅ Paragraph navigation enabled');
      } else {
        console.log('⚠️ Paragraph navigation not available (method missing)');
      }
      
      console.log('🚀 Audio system ready!');
      
    } catch (error) {
      console.error('❌ Error initializing audio system:', error);
      throw error;
    }
  }

  // Audio control methods
  async play() {
    await this.audioCore.playAudio();
  }

  pause() {
    this.audioCore.pauseAudio();
  }

  toggle() {
    this.audioCore.toggleAudio();
  }

  forward() {
    this.audioCore.forward();
  }

  rewind() {
    this.audioCore.rewind();
  }

  setPlaybackSpeed(speed) {
    this.audioCore.setPlaybackSpeed(speed);
  }

  getCurrentTime() {
    return this.audioCore.getCurrentTime();
  }

  getDuration() {
    return this.audioCore.getDuration();
  }

  // Highlighting control methods
  clearHighlights() {
    this.highlighter.clearAllHighlights();
  }

  // Read-along control methods
  toggleReadAlong() {
    this.readAlong.toggle();
  }

  isReadAlongActive() {
    return this.readAlong.isActive;
  }

  // Playback control methods
  getCurrentSpeed() {
    return this.playbackControls.getCurrentSpeed();
  }

  setSpeed(speed) {
    this.playbackControls.setSpeed(speed);
  }

  // NEW: Paragraph seeking methods
  async seekToParagraph(paragraphText, options = {}) {
    return await this.paragraphSeeker.seekToParagraph(paragraphText, options);
  }

  async seekToParagraphs(paragraphTexts, options = {}) {
    return await this.paragraphSeeker.seekToParagraphs(paragraphTexts, options);
  }

  extractParagraphs() {
    return this.paragraphSeeker.extractParagraphs();
  }

  // NEW: Configuration methods for paragraph seeking
  setParagraphSeekingThreshold(threshold) {
    this.paragraphSeeker.setMinProbabilityThreshold(threshold);
  }

  setParagraphContextWindow(windowSize) {
    this.paragraphSeeker.setContextWindow(windowSize);
  }

  // NEW: Convenience methods
  async seekToText(text) {
    console.log(`🔍 Seeking to text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    return await this.seekToParagraph(text);
  }

  async seekToSentence(sentence) {
    console.log(`🔍 Seeking to sentence: "${sentence}"`);
    return await this.seekToParagraph(sentence);
  }

  // NEW: Interactive paragraph navigation
  async createParagraphNavigation() {
    const paragraphs = this.extractParagraphs();
    
    if (paragraphs.length === 0) {
      console.warn('No paragraphs found in text');
      return [];
    }
    
    console.log(`📝 Found ${paragraphs.length} paragraphs`);
    
    // Create clickable paragraph navigation
    const navItems = paragraphs.map((paragraph, index) => ({
      index,
      text: paragraph,
      preview: paragraph.substring(0, 100) + (paragraph.length > 100 ? '...' : ''),
      seekTo: async () => {
        const result = await this.seekToParagraph(paragraph);
        if (result.success) {
          console.log(`✅ Navigated to paragraph ${index + 1}`);
        } else {
          console.warn(`❌ Failed to navigate to paragraph ${index + 1}:`, result.error);
        }
        return result;
      }
    }));
    
    return navItems;
  }

  // NEW: Paragraph navigation control methods
  enableParagraphNavigation() {
    if (this.paragraphSeeker && typeof this.paragraphSeeker.enableParagraphNavigation === 'function') {
      this.paragraphSeeker.enableParagraphNavigation();
    } else {
      console.warn('Paragraph navigation not available');
    }
  }

  disableParagraphNavigation() {
    if (this.paragraphSeeker && typeof this.paragraphSeeker.disableParagraphNavigation === 'function') {
      this.paragraphSeeker.disableParagraphNavigation();
    } else {
      console.warn('Paragraph navigation not available');
    }
  }

  refreshParagraphNavigation() {
    if (this.paragraphSeeker && typeof this.paragraphSeeker.refreshParagraphNavigation === 'function') {
      this.paragraphSeeker.refreshParagraphNavigation();
    } else {
      console.warn('Paragraph navigation not available');
    }
  }

  // Cleanup method
  destroy() {
    this.highlighter.stopHighlighting();
    this.playbackControls.destroy();
    if (this.audioCore.sound) {
      this.audioCore.sound.unload();
    }
    console.log('🧹 Audio system destroyed');
  }
}

// Create and initialize the audio system
const audioSystem = new AudioSystem(
  '/audio/suckAtReading.wav',
  '/order/word_timings_ordered.json',
  '/transcript/landing.html',
  -100
);

// Make it globally available
window.audioSystem = audioSystem;
window.audioSetup = audioSystem; // Keep backward compatibility

// Initialize the system
audioSystem.init().catch(error => {
  console.error('Failed to initialize audio system:', error);
});

// Add some convenience global functions for easy testing
window.seekToParagraph = (text) => audioSystem.seekToParagraph(text);
window.seekToText = (text) => audioSystem.seekToText(text);
window.extractParagraphs = () => audioSystem.extractParagraphs();