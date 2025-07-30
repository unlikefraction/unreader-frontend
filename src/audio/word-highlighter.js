// -----word-highlighter.js-------


/**
 * Word highlighting and synchronization with audio
 */
export class WordHighlighter {
    constructor(textProcessor) {
      this.textProcessor = textProcessor;
      this.highlightedIndices = new Set();
      this.loggedWords = new Set();
      this.lastHighlightedIndex = 0;
      this.isInitialHighlightDone = false;
      this.lookaheadMs = 100;
      this.processedTimingIndices = new Set();
      this.currentHighlightedWord = null;
      this.highlightInterval = null;
    }
  
    clearAllHighlights() {
      this.textProcessor.wordSpans.forEach(span => {
        span.classList.remove('highlight');
      });
      this.highlightedIndices.clear();
      this.lastHighlightedIndex = 0;
      this.currentHighlightedWord = null;
    }
  
    highlightWordsInRange(startIndex, endIndex, reason = '') {
      const actualStartIndex = Math.max(startIndex, this.lastHighlightedIndex);
      const actualEndIndex = Math.max(endIndex, actualStartIndex);
      
      for (let i = actualStartIndex; i <= actualEndIndex && i < this.textProcessor.wordSpans.length; i++) {
        if (this.textProcessor.wordSpans[i] && !this.highlightedIndices.has(i)) {
          this.textProcessor.wordSpans[i].classList.add('highlight');
          this.highlightedIndices.add(i);
          this.currentHighlightedWord = this.textProcessor.wordSpans[i];
          print(`✨ Highlighted word "${this.textProcessor.wordSpans[i].textContent}" at index ${i} ${reason}`);
        }
      }
      this.lastHighlightedIndex = Math.max(this.lastHighlightedIndex, actualEndIndex + 1);
    }
  
    fillGapsToTarget(targetIndex, reason = '') {
      if (targetIndex > this.lastHighlightedIndex) {
        this.highlightWordsInRange(this.lastHighlightedIndex, targetIndex - 1, `(filling gap ${reason})`);
      }
    }
  
    handleInitialWords(currentTime) {
      if (this.isInitialHighlightDone || !this.textProcessor.wordTimings || this.textProcessor.wordTimings.length === 0) return;
      
      const firstTimedWord = this.textProcessor.wordTimings[0];
      const lookaheadTime = firstTimedWord.time_start - (this.lookaheadMs / 1000);
      
      if (currentTime >= Math.max(0, lookaheadTime) && currentTime < firstTimedWord.time_start) {
        const timeElapsed = currentTime;
        const estimatedWordsPerSecond = 2.5;
        const wordsToHighlight = Math.max(1, Math.floor(timeElapsed * estimatedWordsPerSecond));
        
        const endIndex = Math.min(wordsToHighlight - 1, this.textProcessor.wordSpans.length - 1);
        this.highlightWordsInRange(0, endIndex, '(initial words before first timed word)');
        
        print(`🌟 Highlighted ${wordsToHighlight} initial words (${timeElapsed.toFixed(3)}s elapsed)`);
      }
      
      if (currentTime >= firstTimedWord.time_start) {
        this.isInitialHighlightDone = true;
      }
    }
  
    processWordTiming(wordData, index, currentTime) {
      const lookaheadTime = wordData.time_start - (this.lookaheadMs / 1000);
      
      if (currentTime >= lookaheadTime && !this.processedTimingIndices.has(index)) {
        this.processedTimingIndices.add(index);
        
        print(`🎯 Processing word: "${wordData.word}" (${this.lookaheadMs}ms early) at ${wordData.time_start.toFixed(5)}s (current: ${currentTime.toFixed(5)}s)`);
        
        const bestMatch = this.textProcessor.findBestWordMatch(wordData.word, index, null, this.lastHighlightedIndex);
        
        if (bestMatch.index !== -1) {
          this.fillGapsToTarget(bestMatch.index, `before "${wordData.word}"`);
          
          this.highlightWordsInRange(bestMatch.index, bestMatch.index, 
            `(probability: ${bestMatch.probability.toFixed(3)}, word: ${bestMatch.wordScore.toFixed(3)}, context: ${bestMatch.contextScore.toFixed(3)})`);
          
          if (index < this.textProcessor.wordTimings.length - 1) {
            const nextWordData = this.textProcessor.wordTimings[index + 1];
            const nextMatch = this.textProcessor.findBestWordMatch(nextWordData.word, index + 1, null, this.lastHighlightedIndex);
            
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
          const fallbackEnd = Math.min(this.lastHighlightedIndex + 2, this.textProcessor.wordSpans.length - 1);
          this.highlightWordsInRange(this.lastHighlightedIndex, fallbackEnd, 
            `(fallback for "${wordData.word}")`);
        }
      }
    }
  
    catchUpToCurrentTime(currentTime) {
      if (!this.textProcessor.wordTimings) return;
      
      let lastExpectedIndex = -1;
      
      for (let i = 0; i < this.textProcessor.wordTimings.length; i++) {
        if (currentTime >= this.textProcessor.wordTimings[i].time_start - (this.lookaheadMs / 1000)) {
          lastExpectedIndex = i;
        } else {
          break;
        }
      }
      
      if (lastExpectedIndex >= 0) {
        const expectedWordData = this.textProcessor.wordTimings[lastExpectedIndex];
        const expectedMatch = this.textProcessor.findBestWordMatch(expectedWordData.word, lastExpectedIndex, null, this.lastHighlightedIndex);
        
        if (expectedMatch.index !== -1 && expectedMatch.index >= this.lastHighlightedIndex) {
          this.fillGapsToTarget(expectedMatch.index + 1, 'catching up to current time');
        }
      }
    }
  
    findCurrentWordAndHighlight(currentTime) {
      if (!this.textProcessor.wordTimings || this.textProcessor.wordTimings.length === 0) {
        print(`⚠️ No word timings available for time: ${currentTime.toFixed(3)}s`);
        return null;
      }
  
      for (let i = 0; i < this.textProcessor.wordTimings.length; i++) {
        const wordData = this.textProcessor.wordTimings[i];
        
        if (currentTime >= wordData.time_start && currentTime <= wordData.time_end) {
          print(`🎯 Found current word: "${wordData.word}" at ${currentTime.toFixed(3)}s`);
          
          const bestMatch = this.textProcessor.findBestWordMatch(wordData.word, i, null, this.lastHighlightedIndex);
          
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
      
      for (let i = 0; i < this.textProcessor.wordTimings.length; i++) {
        const wordData = this.textProcessor.wordTimings[i];
        if (wordData.time_start <= currentTime) {
          closestWord = wordData;
          closestIndex = i;
        } else {
          break;
        }
      }
  
      if (closestWord) {
        print(`🎯 Found closest previous word: "${closestWord.word}" at ${currentTime.toFixed(3)}s`);
        
        const bestMatch = this.textProcessor.findBestWordMatch(closestWord.word, closestIndex, null, this.lastHighlightedIndex);
        
        if (bestMatch.index !== -1) {
          this.clearAllHighlights();
          this.highlightWordsInRange(0, bestMatch.index, 
            `(seek closest: probability: ${bestMatch.probability.toFixed(3)}, word: ${bestMatch.wordScore.toFixed(3)}, context: ${bestMatch.contextScore.toFixed(3)})`);
          
          return { wordData: closestWord, textIndex: bestMatch.index };
        }
      }
  
      print(`⚠️ No suitable word found for time: ${currentTime.toFixed(3)}s`);
      return null;
    }
  
    estimatePositionFromTime(currentTime) {
      if (!this.textProcessor.wordTimings || this.textProcessor.wordTimings.length === 0) {
        // No timing data - estimate based on speaking rate
        const estimatedWordsPerSecond = 2.5;
        const estimatedWords = Math.max(0, Math.floor(currentTime * estimatedWordsPerSecond));
        const endIndex = Math.min(estimatedWords, this.textProcessor.wordSpans.length - 1);
        
        if (endIndex >= 0) {
          this.clearAllHighlights();
          this.highlightWordsInRange(0, endIndex, '(time-based estimate)');
        }
        return;
      }
  
      // Find last word that should have played by this time
      let lastWordIndex = -1;
      let lastTextIndex = -1;
  
      for (let i = 0; i < this.textProcessor.wordTimings.length; i++) {
        if (this.textProcessor.wordTimings[i].time_start <= currentTime) {
          lastWordIndex = i;
        } else {
          break;
        }
      }
  
      if (lastWordIndex >= 0) {
        // Find corresponding text position
        const bestMatch = this.textProcessor.findBestWordMatch(this.textProcessor.wordTimings[lastWordIndex].word, lastWordIndex, null, this.lastHighlightedIndex);
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
        const endIndex = Math.min(estimatedWords, this.textProcessor.wordSpans.length - 1);
        
        if (endIndex >= 0) {
          this.clearAllHighlights();
          this.highlightWordsInRange(0, endIndex, '(fallback time estimate)');
        }
      } else {
        // At beginning - clear all highlights
        this.clearAllHighlights();
      }
    }
  
    handleSeek(currentTime) {
      print(`🔄 Handling seek to: ${currentTime.toFixed(5)}s`);
      
      // Always clear all highlights on any seek/rewind
      this.clearAllHighlights();
      
      // Reset all processing state
      this.processedTimingIndices.clear();
      this.isInitialHighlightDone = false;
      this.lastHighlightedIndex = 0;
      
      // Find and highlight current position from scratch
      const currentWord = this.findCurrentWordAndHighlight(currentTime);
      
      if (currentWord) {
        print(`✅ Highlighted word after seek: "${currentWord.wordData.word}"`);
      } else {
        // If no current word found, estimate position based on time
        this.estimatePositionFromTime(currentTime);
      }
    }
  
    handleAudioEnd(audioDuration) {
      const finalTime = audioDuration;
      print(`🏁 Audio ended at: ${finalTime.toFixed(5)}s`);
      print(`📊 Total highlighted words: ${this.highlightedIndices.size}/${this.textProcessor.wordSpans.length}`);
      
      if (this.highlightedIndices.size < this.textProcessor.wordSpans.length) {
        print(`🔧 Highlighting remaining ${this.textProcessor.wordSpans.length - this.highlightedIndices.size} words`);
        this.highlightWordsInRange(this.lastHighlightedIndex, this.textProcessor.wordSpans.length - 1, 
          '(ensuring all words highlighted at end)');
      }
    }
  
    async highlightWord(time, audioDuration) {
      try {
        print(`Audio time: ${time.toFixed(5)}s`);
        
        this.handleInitialWords(time);
        
        if (this.textProcessor.wordTimings) {
          this.textProcessor.wordTimings.forEach((wordData, index) => {
            this.processWordTiming(wordData, index, time);
          });
        }
        
        this.catchUpToCurrentTime(time);
        
        // Handle end of audio
        if (audioDuration && time >= audioDuration - 0.1) {
          const remainingWords = this.textProcessor.wordSpans.length - this.lastHighlightedIndex;
          if (remainingWords > 0) {
            this.highlightWordsInRange(this.lastHighlightedIndex, this.textProcessor.wordSpans.length - 1, 
              '(final words at audio end)');
          }
        }
        
      } catch (error) {
        printError('Error highlighting words:', error);
      }
    }
  
    startHighlighting(getCurrentTime, getDuration) {
      if (this.highlightInterval) {
        clearInterval(this.highlightInterval);
      }
      
      this.highlightInterval = setInterval(() => {
        const currentTime = getCurrentTime();
        const duration = getDuration();
        this.highlightWord(currentTime, duration);
      }, 50);
    }
  
    stopHighlighting() {
      if (this.highlightInterval) {
        clearInterval(this.highlightInterval);
        this.highlightInterval = null;
      }
    }
  }