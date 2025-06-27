class AudioSetup {
  constructor(audioFile, order, text, offsetMs = 0) {
    this.audioFile = audioFile;
    this.order = order;
    this.text = text;
    this.offsetMs = offsetMs;
    
    // Howler.js audio object
    this.sound = null;
    this.isPlaying = false;
    
    // Advanced highlighting properties from your old code
    this.wordTimings = null;
    this.wordSpans = [];
    this.highlightedIndices = new Set();
    this.loggedWords = new Set();
    this.lastHighlightedIndex = 0;
    this.isInitialHighlightDone = false;
    this.lookaheadMs = 100; // 100ms lookahead time
    this.processedTimingIndices = new Set();
    this.currentHighlightedWord = null;
    this.highlightInterval = null;
  }

  setupAudio() {
    if (!this.sound) {
      this.sound = new Howl({
        src: [this.audioFile],
        html5: false,
        preload: true,
        onend: () => {
          this.stopHighlighting();
          this.updatePlayButton(false);
          this.isPlaying = false;
          this.handleAudioEnd();
        },
        onloaderror: (id, error) => {
          console.error('Audio loading error:', error);
          this.stopHighlighting();
          this.updatePlayButton(false);
          this.isPlaying = false;
        },
        onplayerror: (id, error) => {
          console.error('Audio play error:', error);
          this.updatePlayButton(false);
          this.isPlaying = false;
        },
        onseek: () => {
          const currentTime = this.getCurrentTime();
          console.log(`🔄 Audio seeked to: ${currentTime.toFixed(5)}s`);
          this.handleSeek(currentTime);
        },
        onplay: () => {
          const startTime = this.getCurrentTime();
          console.log(`▶️ Audio started playing from: ${startTime.toFixed(5)}s`);
        },
        onpause: () => {
          const pauseTime = this.getCurrentTime();
          console.log(`⏸️ Audio paused at: ${pauseTime.toFixed(5)}s`);
        }
      });
    }
  }

  // Your advanced text separation logic
  async seperateText() {
    const response = await fetch(this.text);
    const htmlContent = await response.text();
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    const mainContent = document.querySelector('.mainContent');
    mainContent.innerHTML = '';
    this.wordSpans = [];
    
    const paragraphs = tempDiv.querySelectorAll('p');
    
    paragraphs.forEach((paragraph, paragraphIndex) => {
      const paragraphText = paragraph.textContent.trim();
      
      if (paragraphText) {
        const words = paragraphText.split(/\s+/);
        
        words.forEach(word => {
          if (word.trim()) {
            const span = document.createElement('span');
            span.className = 'word';
            span.textContent = word;
            span.dataset.originalWord = word.toLowerCase().replace(/[^\w]/g, '');
            span.dataset.index = this.wordSpans.length;
            mainContent.appendChild(span);
            mainContent.appendChild(document.createTextNode(' '));
            this.wordSpans.push(span);
          }
        });
      }
      
      if (paragraphIndex < paragraphs.length - 1) {
        mainContent.appendChild(document.createElement('br'));
        mainContent.appendChild(document.createElement('br'));
      }
    });

    console.log(`📝 Total words in document: ${this.wordSpans.length}`);
    console.log(`📄 Total paragraphs processed: ${paragraphs.length}`);
    console.log(`⏱️ Offset applied: ${this.offsetMs}ms`);
  }

  // Your advanced word timing loading with offset
  async loadWordTimings() {
    const response = await fetch(this.order);
    this.wordTimings = await response.json();
    console.log(`🎵 Loaded ${this.wordTimings.length} word timings`);
    
    // Apply offset to all timings
    const offsetSeconds = this.offsetMs / 1000;
    this.wordTimings = this.wordTimings.map(timing => ({
      ...timing,
      time_start: Math.max(0, timing.time_start + offsetSeconds),
      time_end: Math.max(0, timing.time_end + offsetSeconds)
    }));
    
    if (this.offsetMs !== 0) {
      console.log(`🔧 Applied ${this.offsetMs}ms offset to all timings`);
    }
  }

  // Your context analysis methods
  getAudioContext(timingIndex, contextSize = 10) {
    const context = [];
    const startIndex = Math.max(0, timingIndex - contextSize);
    const endIndex = Math.min(this.wordTimings.length - 1, timingIndex + contextSize);
    
    for (let i = startIndex; i <= endIndex; i++) {
      if (i !== timingIndex && this.wordTimings[i]) {
        context.push(this.wordTimings[i].word.toLowerCase().replace(/[^\w]/g, ''));
      }
    }
    return context;
  }

  getTextContext(spanIndex, contextSize = 10) {
    const context = [];
    const startIndex = Math.max(0, spanIndex - contextSize);
    const endIndex = Math.min(this.wordSpans.length - 1, spanIndex + contextSize);
    
    for (let i = startIndex; i <= endIndex; i++) {
      if (i !== spanIndex && this.wordSpans[i] && this.wordSpans[i].dataset.originalWord) {
        context.push(this.wordSpans[i].dataset.originalWord);
      }
    }
    return context;
  }

  calculateContextSimilarity(audioContext, textContext) {
    if (audioContext.length === 0 && textContext.length === 0) return 1.0;
    if (audioContext.length === 0 || textContext.length === 0) return 0.0;
    
    let matchCount = 0;
    const totalWords = Math.max(audioContext.length, textContext.length);
    
    audioContext.forEach(audioWord => {
      if (textContext.includes(audioWord)) {
        matchCount++;
      }
    });
    
    const positionalMatches = Math.min(audioContext.length, textContext.length);
    let positionalMatchCount = 0;
    
    for (let i = 0; i < positionalMatches; i++) {
      if (audioContext[i] === textContext[i]) {
        positionalMatchCount++;
      }
    }
    
    const generalScore = matchCount / totalWords;
    const positionalScore = positionalMatchCount / positionalMatches;
    
    return (generalScore * 0.6) + (positionalScore * 0.4);
  }

  // Your advanced word matching with probability scoring
  findBestWordMatch(targetWord, timingIndex, searchCenter = null) {
    const cleanTarget = targetWord.toLowerCase().replace(/[^\w]/g, '');
    
    const centerIndex = searchCenter !== null ? searchCenter : this.lastHighlightedIndex;
    
    const searchStart = Math.max(0, centerIndex - 10);
    const searchEnd = Math.min(this.wordSpans.length, centerIndex + 10 + 1);
    
    const audioContext = this.getAudioContext(timingIndex);
    
    let bestMatch = { index: -1, probability: 0, wordScore: 0, contextScore: 0 };
    
    for (let i = searchStart; i < searchEnd; i++) {
      const span = this.wordSpans[i];
      if (span && span.dataset.originalWord) {
        const wordScore = cleanTarget === span.dataset.originalWord ? 1.0 : 0.0;
        
        const textContext = this.getTextContext(i);
        const contextScore = this.calculateContextSimilarity(audioContext, textContext);
        
        const totalProbability = (wordScore * 0.4) + (contextScore * 0.6);
        
        if (totalProbability > bestMatch.probability) {
          bestMatch = { 
            index: i, 
            probability: totalProbability, 
            wordScore, 
            contextScore 
          };
        }
      }
    }
    
    const threshold = bestMatch.wordScore === 1.0 ? 0.2 : 0.3;
    return bestMatch.probability > threshold ? bestMatch : { index: -1, probability: 0 };
  }

  // Your advanced seek handling
  findCurrentWordAndHighlight(currentTime) {
    if (!this.wordTimings || this.wordTimings.length === 0) {
      console.log(`⚠️ No word timings available for time: ${currentTime.toFixed(3)}s`);
      return null;
    }

    for (let i = 0; i < this.wordTimings.length; i++) {
      const wordData = this.wordTimings[i];
      
      if (currentTime >= wordData.time_start && currentTime <= wordData.time_end) {
        console.log(`🎯 Found current word: "${wordData.word}" at ${currentTime.toFixed(3)}s`);
        
        const bestMatch = this.findBestWordMatch(wordData.word, i);
        
        if (bestMatch.index !== -1) {
          this.clearAllHighlights();
          this.highlightWordsInRange(0, bestMatch.index, 
            `(seek target: probability: ${bestMatch.probability.toFixed(3)}, word: ${bestMatch.wordScore.toFixed(3)}, context: ${bestMatch.contextScore.toFixed(3)})`);
          
          return { wordData, textIndex: bestMatch.index };
        }
        
        return { wordData, textIndex: -1 };
      }
    }

    let closestWord = null;
    let closestIndex = -1;
    
    for (let i = 0; i < this.wordTimings.length; i++) {
      const wordData = this.wordTimings[i];
      if (wordData.time_start <= currentTime) {
        closestWord = wordData;
        closestIndex = i;
      } else {
        break;
      }
    }

    if (closestWord) {
      console.log(`🎯 Found closest previous word: "${closestWord.word}" at ${currentTime.toFixed(3)}s`);
      
      const bestMatch = this.findBestWordMatch(closestWord.word, closestIndex);
      
      if (bestMatch.index !== -1) {
        this.clearAllHighlights();
        this.highlightWordsInRange(0, bestMatch.index, 
          `(seek closest: probability: ${bestMatch.probability.toFixed(3)}, word: ${bestMatch.wordScore.toFixed(3)}, context: ${bestMatch.contextScore.toFixed(3)})`);
        
        return { wordData: closestWord, textIndex: bestMatch.index };
      }
    }

    console.log(`⚠️ No suitable word found for time: ${currentTime.toFixed(3)}s`);
    return null;
  }

  // Your advanced highlighting methods
  clearAllHighlights() {
    this.wordSpans.forEach(span => {
      span.classList.remove('highlight');
    });
    this.highlightedIndices.clear();
    this.lastHighlightedIndex = 0;
    this.currentHighlightedWord = null;
  }

  highlightWordsInRange(startIndex, endIndex, reason = '') {
    const actualStartIndex = Math.max(startIndex, this.lastHighlightedIndex);
    const actualEndIndex = Math.max(endIndex, actualStartIndex);
    
    for (let i = actualStartIndex; i <= actualEndIndex && i < this.wordSpans.length; i++) {
      if (this.wordSpans[i] && !this.highlightedIndices.has(i)) {
        this.wordSpans[i].classList.add('highlight');
        this.highlightedIndices.add(i);
        this.currentHighlightedWord = this.wordSpans[i];
        console.log(`✨ Highlighted word "${this.wordSpans[i].textContent}" at index ${i} ${reason}`);
      }
    }
    this.lastHighlightedIndex = Math.max(this.lastHighlightedIndex, actualEndIndex + 1);
    
    this.updateTextPosition();
  }

  fillGapsToTarget(targetIndex, reason = '') {
    if (targetIndex > this.lastHighlightedIndex) {
      this.highlightWordsInRange(this.lastHighlightedIndex, targetIndex - 1, `(filling gap ${reason})`);
    }
  }

  handleInitialWords(currentTime) {
    if (this.isInitialHighlightDone || !this.wordTimings || this.wordTimings.length === 0) return;
    
    const firstTimedWord = this.wordTimings[0];
    const lookaheadTime = firstTimedWord.time_start - (this.lookaheadMs / 1000);
    
    if (currentTime >= Math.max(0, lookaheadTime) && currentTime < firstTimedWord.time_start) {
      const timeElapsed = currentTime;
      const estimatedWordsPerSecond = 2.5;
      const wordsToHighlight = Math.max(1, Math.floor(timeElapsed * estimatedWordsPerSecond));
      
      const endIndex = Math.min(wordsToHighlight - 1, this.wordSpans.length - 1);
      this.highlightWordsInRange(0, endIndex, '(initial words before first timed word)');
      
      console.log(`🌟 Highlighted ${wordsToHighlight} initial words (${timeElapsed.toFixed(3)}s elapsed)`);
    }
    
    if (currentTime >= firstTimedWord.time_start) {
      this.isInitialHighlightDone = true;
    }
  }

  processWordTiming(wordData, index, currentTime) {
    const lookaheadTime = wordData.time_start - (this.lookaheadMs / 1000);
    
    if (currentTime >= lookaheadTime && !this.processedTimingIndices.has(index)) {
      this.processedTimingIndices.add(index);
      
      console.log(`🎯 Processing word: "${wordData.word}" (${this.lookaheadMs}ms early) at ${wordData.time_start.toFixed(5)}s (current: ${currentTime.toFixed(5)}s)`);
      
      const bestMatch = this.findBestWordMatch(wordData.word, index);
      
      if (bestMatch.index !== -1) {
        this.fillGapsToTarget(bestMatch.index, `before "${wordData.word}"`);
        
        this.highlightWordsInRange(bestMatch.index, bestMatch.index, 
          `(probability: ${bestMatch.probability.toFixed(3)}, word: ${bestMatch.wordScore.toFixed(3)}, context: ${bestMatch.contextScore.toFixed(3)})`);
        
        if (index < this.wordTimings.length - 1) {
          const nextWordData = this.wordTimings[index + 1];
          const nextMatch = this.findBestWordMatch(nextWordData.word, index + 1);
          
          if (nextMatch.index !== -1 && nextMatch.index > bestMatch.index + 1) {
            const timeGap = nextWordData.time_start - wordData.time_end;
            
            if (timeGap > 0.1) {
              const estimatedWordsInGap = Math.max(1, Math.ceil(timeGap * 3));
              const actualWordsInGap = nextMatch.index - bestMatch.index - 1;
              const wordsToHighlight = Math.min(estimatedWordsInGap, actualWordsInGap);
              
              if (wordsToHighlight > 0) {
                this.highlightWordsInRange(bestMatch.index + 1, bestMatch.index + wordsToHighlight, 
                  `(estimated ${wordsToHighlight} words in ${timeGap.toFixed(3)}s gap)`);
              }
            } else {
              this.highlightWordsInRange(bestMatch.index + 1, nextMatch.index - 1, 
                '(filling between consecutive timed words)');
            }
          }
        }
      } else {
        const fallbackEnd = Math.min(this.lastHighlightedIndex + 2, this.wordSpans.length - 1);
        this.highlightWordsInRange(this.lastHighlightedIndex, fallbackEnd, 
          `(fallback for "${wordData.word}")`);
      }
    }
  }

  catchUpToCurrentTime(currentTime) {
    if (!this.wordTimings) return;
    
    let lastExpectedIndex = -1;
    
    for (let i = 0; i < this.wordTimings.length; i++) {
      if (currentTime >= this.wordTimings[i].time_start - (this.lookaheadMs / 1000)) {
        lastExpectedIndex = i;
      } else {
        break;
      }
    }
    
    if (lastExpectedIndex >= 0) {
      const expectedWordData = this.wordTimings[lastExpectedIndex];
      const expectedMatch = this.findBestWordMatch(expectedWordData.word, lastExpectedIndex);
      
      if (expectedMatch.index !== -1 && expectedMatch.index >= this.lastHighlightedIndex) {
        this.fillGapsToTarget(expectedMatch.index + 1, 'catching up to current time');
      }
    }
  }

  // Text positioning from your old code
  updateTextPosition() {
    if (!this.currentHighlightedWord) return;
    
    // Check if read-along is active
    const readAlongControl = document.querySelector('.read-along.control');
    if (!readAlongControl || !readAlongControl.classList.contains('active')) {
      return; // Don't scroll if read-along is inactive
    }
    
    const heightSetter = document.getElementById('heightSetter');
    
    const heightSetterTop = parseFloat(heightSetter.style.top || '50%');
    
    const wordRect = this.currentHighlightedWord.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const targetY = (heightSetterTop / 100) * viewportHeight;
    
    const currentWordY = wordRect.top + window.scrollY;
    const desiredScrollY = currentWordY - targetY;
    
    window.scrollTo({
      top: desiredScrollY,
      behavior: 'smooth'
    });
  }

  // Main highlighting loop with your advanced logic
  async highlightWord(time) {
    try {
      await this.loadWordTimings();
      
      console.log(`Audio time: ${time.toFixed(5)}s`);
      
      this.handleInitialWords(time);
      
      if (this.wordTimings) {
        this.wordTimings.forEach((wordData, index) => {
          this.processWordTiming(wordData, index, time);
        });
      }
      
      this.catchUpToCurrentTime(time);
      
      // Handle end of audio
      if (this.sound && time >= this.sound.duration() - 0.1) {
        const remainingWords = this.wordSpans.length - this.lastHighlightedIndex;
        if (remainingWords > 0) {
          this.highlightWordsInRange(this.lastHighlightedIndex, this.wordSpans.length - 1, 
            '(final words at audio end)');
        }
      }
      
    } catch (error) {
      console.error('Error highlighting words:', error);
    }
  }

  // Event handlers
  handleSeek(currentTime) {
    console.log(`🔄 Handling seek to: ${currentTime.toFixed(5)}s`);
    
    // Always clear all highlights on any seek/rewind
    this.clearAllHighlights();
    
    // Reset all processing state
    this.processedTimingIndices.clear();
    this.isInitialHighlightDone = false;
    this.lastHighlightedIndex = 0;
    
    // Find and highlight current position from scratch
    const currentWord = this.findCurrentWordAndHighlight(currentTime);
    
    if (currentWord) {
      console.log(`✅ Highlighted word after seek: "${currentWord.wordData.word}"`);
    } else {
      // If no current word found, estimate position based on time
      this.estimatePositionFromTime(currentTime);
    }
  }

  // Estimate highlighting position based on time when no exact word match
  estimatePositionFromTime(currentTime) {
    if (!this.wordTimings || this.wordTimings.length === 0) {
      // No timing data - estimate based on speaking rate
      const estimatedWordsPerSecond = 2.5;
      const estimatedWords = Math.max(0, Math.floor(currentTime * estimatedWordsPerSecond));
      const endIndex = Math.min(estimatedWords, this.wordSpans.length - 1);
      
      if (endIndex >= 0) {
        this.clearAllHighlights();
        this.highlightWordsInRange(0, endIndex, '(time-based estimate)');
      }
      return;
    }

    // Find last word that should have played by this time
    let lastWordIndex = -1;
    let lastTextIndex = -1;

    for (let i = 0; i < this.wordTimings.length; i++) {
      if (this.wordTimings[i].time_start <= currentTime) {
        lastWordIndex = i;
      } else {
        break;
      }
    }

    if (lastWordIndex >= 0) {
      // Find corresponding text position
      const bestMatch = this.findBestWordMatch(this.wordTimings[lastWordIndex].word, lastWordIndex);
      if (bestMatch.index !== -1) {
        lastTextIndex = bestMatch.index;
      }
    }

    // If we found a position, highlight up to there
    if (lastTextIndex >= 0) {
      this.clearAllHighlights();
      this.highlightWordsInRange(0, lastTextIndex, '(seek position estimate)');
    } else if (currentTime > 0) {
      // Fallback: estimate based on time
      const estimatedWordsPerSecond = 2.5;
      const estimatedWords = Math.max(0, Math.floor(currentTime * estimatedWordsPerSecond));
      const endIndex = Math.min(estimatedWords, this.wordSpans.length - 1);
      
      if (endIndex >= 0) {
        this.clearAllHighlights();
        this.highlightWordsInRange(0, endIndex, '(fallback time estimate)');
      }
    } else {
      // At beginning - clear all highlights
      this.clearAllHighlights();
    }
  }

  handleAudioEnd() {
    const finalTime = this.getCurrentTime();
    console.log(`🏁 Audio ended at: ${finalTime.toFixed(5)}s`);
    console.log(`📊 Total highlighted words: ${this.highlightedIndices.size}/${this.wordSpans.length}`);
    
    if (this.highlightedIndices.size < this.wordSpans.length) {
      console.log(`🔧 Highlighting remaining ${this.wordSpans.length - this.highlightedIndices.size} words`);
      this.highlightWordsInRange(this.lastHighlightedIndex, this.wordSpans.length - 1, 
        '(ensuring all words highlighted at end)');
    }
  }

  // Howler.js audio control methods
  async playAudio() {
    try {
      this.setupAudio();
      
      if (!this.sound.playing()) {
        this.sound.play();
        this.updatePlayButton(true);
        this.startHighlighting();
        this.isPlaying = true;
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      this.updatePlayButton(false);
      this.isPlaying = false;
    }
  }

  pauseAudio() {
    if (this.sound && this.sound.playing()) {
      this.sound.pause();
      this.updatePlayButton(false);
      this.stopHighlighting();
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

  startHighlighting() {
    if (this.highlightInterval) {
      clearInterval(this.highlightInterval);
    }
    
    this.highlightInterval = setInterval(() => {
      if (this.sound && this.sound.playing()) {
        const currentTime = this.getCurrentTime();
        this.highlightWord(currentTime);
      }
    }, 50);
  }

  stopHighlighting() {
    if (this.highlightInterval) {
      clearInterval(this.highlightInterval);
      this.highlightInterval = null;
    }
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

  setupEventListeners() {
    const playButton = document.querySelector('.playButton');
    const forward = document.querySelector('.forward');
    const rewind = document.querySelector('.rewind');
    const readAlongControl = document.querySelector('.read-along.control');
  
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

    // Setup read-along toggle
    if (readAlongControl) {
      readAlongControl.addEventListener('click', () => {
        readAlongControl.classList.toggle('active');
        console.log(`📖 Read-along ${readAlongControl.classList.contains('active') ? 'enabled' : 'disabled'}`);
        
        // If just enabled and we have a current word, update position immediately
        if (readAlongControl.classList.contains('active') && this.currentHighlightedWord) {
          this.updateTextPosition();
        }
      });
    }
  }

  async init() {
    await this.seperateText();
    await this.loadWordTimings();
    this.setupEventListeners();
  }
}

// Usage
const audioSetup = new AudioSetup('./public/audio/suckAtReading.wav', './public/order/word_timings_ordered.json', './public/transcript/landing.html', -100);
window.audioSetup = audioSetup;
audioSetup.init();

// Enhanced draggable center point with text positioning
const heightSetter = document.getElementById('heightSetter');
let isDragging = false;
let startY = 0;
let startTop = 0;

// Initialize heightSetter position if not set
if (!heightSetter.style.top) {
  heightSetter.style.top = '50%';
}

// Get current top position as percentage
function getCurrentTopPercent() {
  const currentTop = heightSetter.style.top || '50%';
  return parseFloat(currentTop.replace('%', ''));
}

// Set top position as percentage with 10% to 90% constraint
function setTopPercent(percent) {
  // Clamp between 10% and 90% (not 0% to 100%)
  const clampedPercent = Math.max(10, Math.min(90, percent));
  heightSetter.style.top = `${clampedPercent}%`;
  
  // Update text position when heightSetter moves (only if audioSetup is ready and read-along is active)
  setTimeout(() => {
    const readAlongControl = document.querySelector('.read-along.control');
    if (window.audioSetup && 
        window.audioSetup.currentHighlightedWord && 
        readAlongControl && 
        readAlongControl.classList.contains('active')) {
      window.audioSetup.updateTextPosition();
    }
  }, 0);
}

// Mouse events
heightSetter.addEventListener('mousedown', (e) => {
  isDragging = true;
  startY = e.clientY;
  startTop = getCurrentTopPercent();
  
  // Change cursor to grabbing
  heightSetter.style.cursor = 'grabbing';
  
  // Prevent text selection and other default behaviors
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  
  // Calculate the difference in Y position
  const deltaY = e.clientY - startY;
  const viewportHeight = window.innerHeight;
  
  // Convert pixel difference to percentage
  const deltaPercent = (deltaY / viewportHeight) * 100;
  
  // Update position
  const newTop = startTop + deltaPercent;
  setTopPercent(newTop);
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    heightSetter.style.cursor = 'grab';
  }
});

// Touch events for mobile support
heightSetter.addEventListener('touchstart', (e) => {
  isDragging = true;
  startY = e.touches[0].clientY;
  startTop = getCurrentTopPercent();
  
  e.preventDefault();
});

document.addEventListener('touchmove', (e) => {
  if (!isDragging) return;
  
  const deltaY = e.touches[0].clientY - startY;
  const viewportHeight = window.innerHeight;
  const deltaPercent = (deltaY / viewportHeight) * 100;
  
  const newTop = startTop + deltaPercent;
  setTopPercent(newTop);
  
  e.preventDefault();
});

document.addEventListener('touchend', () => {
  if (isDragging) {
    isDragging = false;
  }
});