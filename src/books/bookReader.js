import { AudioSystem } from "./audioAndTextGen";

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
  printError('Failed to initialize audio system:', error);
});

// Add some convenience global functions for easy testing
window.seekToParagraph = (text) => audioSystem.seekToParagraph(text);
window.seekToText = (text) => audioSystem.seekToText(text);
window.extractParagraphs = () => audioSystem.extractParagraphs();