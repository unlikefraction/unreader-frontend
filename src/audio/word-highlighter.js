// -----word-highlighter.js-------

// Word highlighting and synchronization with audio
// Hardened against null/DOM-detached spans so ReadAlong never receives invalid elements.
export class WordHighlighter {
  constructor(textProcessor) {
    this.textProcessor = textProcessor;

    // state
    this.highlightedIndices = new Set();
    this.loggedWords = new Set();
    this.lastHighlightedIndex = 0;
    this.isInitialHighlightDone = false;
    this.lookaheadMs = 100;
    this.processedTimingIndices = new Set();
    this.currentHighlightedWord = null;
    this._lastTokenReadIndex = -1; // for coloring separators upto current word

    // probability threshold to accept a bestMatch
    this.minProbability = 0.8;

    // timers & perf
    this.highlightInterval = null;
    this._rafId = null;
    this.nextTimingToConsider = 0; // rolling pointer for perf

    // At any given tick, the maximum text-index we are allowed to highlight
    // based on the current audio time. Updated per highlightWord() call.
    this._maxAllowedTextIndexForTime = Infinity;
  }

  /* ---------------- helpers & safety ---------------- */

  _spans() {
    const spans = this.textProcessor?.wordSpans;
    return Array.isArray(spans) ? spans : [];
  }

  _isValidSpan(span) {
    return !!(span && span.nodeType === 1 && span.isConnected);
  }

  _safeSpan(i) {
    const spans = this._spans();
    if (i < 0 || i >= spans.length) return null;
    const el = spans[i];
    return this._isValidSpan(el) ? el : null;
  }

  _setCurrentWordEl(el) {
    this.currentHighlightedWord = this._isValidSpan(el) ? el : null;
  }

  getCurrentWordEl() {
    return this._isValidSpan(this.currentHighlightedWord) ? this.currentHighlightedWord : null;
  }

  _addHighlight(i) {
    const el = this._safeSpan(i);
    if (!el) return false;
    try { el.classList.add('highlight'); } catch {}
    this.highlightedIndices.add(i);
    this._setCurrentWordEl(el);
    return true;
  }

  _removeHighlight(i) {
    const el = this._safeSpan(i);
    if (!el) return false;
    try { el.classList.remove('highlight'); } catch {}
    return true;
  }

  // ----- token helpers (words + separators) -----
  _tokens() {
    try {
      const c = this.textProcessor?.container;
      if (!c || !c.isConnected) return [];
      return Array.from(c.querySelectorAll('span.word, span.sep'));
    } catch { return []; }
  }

  _clearReadTokens() {
    const tokens = this._tokens();
    for (const el of tokens) { try { el.classList.remove('read'); } catch {} }
    this._lastTokenReadIndex = -1;
  }

  _applyReadUpToCurrentWord() {
    const wordEl = this.getCurrentWordEl();
    if (!wordEl) return;
    const tokens = this._tokens();
    if (!tokens.length) return;
    const idx = tokens.indexOf(wordEl);
    if (idx === -1) return;
    const start = Math.max(0, this._lastTokenReadIndex + 1);
    for (let i = start; i <= idx && i < tokens.length; i++) {
      try { tokens[i].classList.add('read'); } catch {}
    }
    this._lastTokenReadIndex = Math.max(this._lastTokenReadIndex, idx);
  }

  /* ---------------- DOM rehydration ---------------- */

  _rehydrateSpansIfDetached() {
    const spans = this._spans();
    if (!spans.length) return;

    let detached = 0;
    for (let i = 0; i < spans.length; i++) {
      const el = spans[i];
      if (!this._isValidSpan(el)) detached++;
      if (detached > 5) break; // early exit once clear
    }

    // If a handful are detached, rebuild references from DOM
    if (detached > 0) {
      const container = this.textProcessor?.container;
      if (!container || !container.isConnected) return;
      let fresh;
      try {
        fresh = Array.from(container.querySelectorAll('span.word'));
      } catch { fresh = null; }

      if (!fresh || fresh.length === 0) return;

      // Build an indexable array by data-index, falling back to order
      const byIndex = [];
      for (const el of fresh) {
        const n = Number(el.dataset?.index);
        if (Number.isInteger(n) && n >= 0) byIndex[n] = el;
      }
      const rebuilt = byIndex.length > 0 ? byIndex : fresh;

      // Replace references in textProcessor
      this.textProcessor.wordSpans = rebuilt;

      // Reapply current highlights idempotently
      for (const i of this.highlightedIndices) {
        const el = this._safeSpan(i);
        if (el) { try { el.classList.add('highlight'); } catch {} }
      }

      // Reset current word element to a safe handle
      this._setCurrentWordEl(this._safeSpan(Math.max(0, this.lastHighlightedIndex - 1)));

      try { printl?.(`♻️ Rehydrated ${detached} detached span reference(s)`); } catch {}
    }
  }

  /* ---------------- lifecycle ---------------- */

  pause() {
    this.stopHighlighting();
  }

  destroy() {
    this.stopHighlighting();
    this.clearAllHighlights();
    this.processedTimingIndices.clear();
    this.loggedWords.clear();
    this.nextTimingToConsider = 0;
  }

  /* ---------------- core ops ---------------- */

  clearAllHighlights() {
    const spans = this._spans();
    for (let i = 0; i < spans.length; i++) {
      const el = spans[i];
      if (this._isValidSpan(el)) {
        try { el.classList.remove('highlight'); } catch {}
      }
    }
    this.highlightedIndices.clear();
    this.lastHighlightedIndex = 0;
    this._setCurrentWordEl(null);
    this._clearReadTokens();
  }

  highlightWordsInRange(startIndex, endIndex, reason = '') {
    const spans = this._spans();
    if (!spans.length) return;

    // Clamp to conservative bound so we never run ahead of the audio time
    let boundedEnd = endIndex;
    if (Number.isFinite(this._maxAllowedTextIndexForTime)) {
      boundedEnd = Math.min(endIndex, this._maxAllowedTextIndexForTime);
    }

    const actualStartIndex = Math.max(startIndex, this.lastHighlightedIndex);
    const actualEndIndex = Math.max(boundedEnd, actualStartIndex - 1);

    if (actualEndIndex < actualStartIndex) return; // nothing to add under current bound

    for (let i = actualStartIndex; i <= actualEndIndex && i < spans.length; i++) {
      if (!this.highlightedIndices.has(i)) {
        if (this._addHighlight(i)) {
          try {
            printl?.(`✨ Highlighted "${spans[i]?.textContent ?? ''}" @${i} ${reason}`);
          } catch {}
        }
      }
    }
    this.lastHighlightedIndex = Math.max(this.lastHighlightedIndex, actualEndIndex + 1);
    // After moving the current word, mark all tokens up to it as read (black)
    this._applyReadUpToCurrentWord();
  }

  fillGapsToTarget(targetIndex, reason = '') {
    if (targetIndex > this.lastHighlightedIndex) {
      this.highlightWordsInRange(
        this.lastHighlightedIndex,
        targetIndex - 1,
        `(filling gap ${reason})`
      );
    }
  }

  handleInitialWords(currentTime) {
    if (
      this.isInitialHighlightDone ||
      !this.textProcessor?.wordTimings ||
      this.textProcessor.wordTimings.length === 0
    ) return;

    const firstTimedWord = this.textProcessor.wordTimings[0];
    const lookaheadTime = firstTimedWord.time_start - this.lookaheadMs / 1000;

    if (currentTime >= Math.max(0, lookaheadTime) && currentTime < firstTimedWord.time_start) {
      const timeElapsed = currentTime;
      const estimatedWordsPerSecond = 2.5;
      const wordsToHighlight = Math.max(1, Math.floor(timeElapsed * estimatedWordsPerSecond));
      const endIndex = Math.min(wordsToHighlight - 1, this._spans().length - 1);
      this.highlightWordsInRange(0, endIndex, '(initial words before first timed word)');
      try { printl?.(`🌟 Highlighted ${wordsToHighlight} initial words (${timeElapsed.toFixed(3)}s)`); } catch {}
    }

    if (currentTime >= firstTimedWord.time_start) {
      this.isInitialHighlightDone = true;
    }
  }

  processWordTiming(wordData, index, currentTime) {
    const lookaheadTime = wordData.time_start - this.lookaheadMs / 1000;

    if (currentTime >= lookaheadTime && !this.processedTimingIndices.has(index)) {
      this.processedTimingIndices.add(index);

      try {
        printl?.(
          `🎯 Timing "${wordData.word}" (${this.lookaheadMs}ms early) at ${wordData.time_start.toFixed(
            5
          )}s (now: ${currentTime.toFixed(5)}s)`
        );
      } catch {}

      const bestMatch = this.textProcessor.findBestWordMatch(
        wordData.word,
        index,
        null,
        this.lastHighlightedIndex
      );

      const p = bestMatch?.probability ?? 0;
      if (bestMatch.index !== -1 && p >= this.minProbability) {
        this.fillGapsToTarget(bestMatch.index, `before "${wordData.word}"`);

        this.highlightWordsInRange(
          bestMatch.index,
          bestMatch.index,
          `(p=${(bestMatch.probability ?? 0).toFixed(3)}, w=${(bestMatch.wordScore ?? 0).toFixed(
            3
          )}, c=${(bestMatch.contextScore ?? 0).toFixed(3)})`
        );

        if (index < (this.textProcessor.wordTimings?.length ?? 0) - 1) {
          const nextWordData = this.textProcessor.wordTimings[index + 1];
          const nextMatch = this.textProcessor.findBestWordMatch(
            nextWordData.word,
            index + 1,
            null,
            this.lastHighlightedIndex
          );

          const nextP = nextMatch?.probability ?? 0;
          if (
            nextMatch.index !== -1 &&
            nextMatch.index > bestMatch.index + 1 &&
            nextP >= this.minProbability
          ) {
            const timeGap = nextWordData.time_start - wordData.time_end;

            if (timeGap > 0.1) {
              const estimatedWordsInGap = Math.max(1, Math.ceil(timeGap * 3));
              const actualWordsInGap = nextMatch.index - bestMatch.index - 1;
              const wordsToHighlight = Math.min(estimatedWordsInGap, actualWordsInGap);

              if (wordsToHighlight > 0) {
                this.highlightWordsInRange(
                  bestMatch.index + 1,
                  bestMatch.index + wordsToHighlight,
                  `(~${wordsToHighlight} words in ${timeGap.toFixed(3)}s gap)`
                );
              }
            } else {
              this.highlightWordsInRange(
                bestMatch.index + 1,
                nextMatch.index - 1,
                '(between consecutive timed words)'
              );
            }
          }
        }
      } else {
        // Fallback 1: forward exact search within a small window ahead
        const forwardIndex = this._forwardExactSearch(wordData.word, this.lastHighlightedIndex);
        if (forwardIndex !== -1) {
          this.fillGapsToTarget(forwardIndex, `fallback forward-search for "${wordData.word}"`);
          this.highlightWordsInRange(forwardIndex, forwardIndex, '(forward exact match)');
        } else {
          try { printl?.(`⏭️ Skipping low-confidence match for "${wordData.word}" (p=${p.toFixed(3)})`); } catch {}
        }
      }
    }
  }

  // process only timings that are due by now (perf)
  processUpToTime(currentTime) {
    if (!this.textProcessor?.wordTimings) return;
    const lookahead = this.lookaheadMs / 1000;

    while (
      this.nextTimingToConsider < this.textProcessor.wordTimings.length &&
      this.textProcessor.wordTimings[this.nextTimingToConsider].time_start - lookahead <= currentTime
    ) {
      const i = this.nextTimingToConsider;
      const wd = this.textProcessor.wordTimings[i];
      this.processWordTiming(wd, i, currentTime);
      this.nextTimingToConsider++;
    }
  }

  catchUpToCurrentTime(currentTime) {
    if (!this.textProcessor?.wordTimings) return;

    let lastExpectedIndex = -1;

    for (let i = 0; i < this.textProcessor.wordTimings.length; i++) {
      if (currentTime >= this.textProcessor.wordTimings[i].time_start - this.lookaheadMs / 1000) {
        lastExpectedIndex = i;
      } else {
        break;
      }
    }

    if (lastExpectedIndex >= 0) {
      const expectedWordData = this.textProcessor.wordTimings[lastExpectedIndex];
      const expectedMatch = this.textProcessor.findBestWordMatch(
        expectedWordData.word,
        lastExpectedIndex,
        null,
        this.lastHighlightedIndex
      );

      const p = expectedMatch?.probability ?? 0;
      if (
        expectedMatch.index !== -1 &&
        expectedMatch.index >= this.lastHighlightedIndex &&
        p >= this.minProbability
      ) {
        this.fillGapsToTarget(expectedMatch.index + 1, 'catching up to current time');
      }
    }
  }

  findCurrentWordAndHighlight(currentTime) {
    const spans = this._spans();
    if (!this.textProcessor?.wordTimings || this.textProcessor.wordTimings.length === 0) {
      try { printl?.(`⚠️ No word timings for t=${currentTime.toFixed(3)}s`); } catch {}
      return null;
    }

    for (let i = 0; i < this.textProcessor.wordTimings.length; i++) {
      const wordData = this.textProcessor.wordTimings[i];

      if (currentTime >= wordData.time_start && currentTime <= wordData.time_end) {
        try { printl?.(`🎯 Current word "${wordData.word}" @ ${currentTime.toFixed(3)}s`); } catch {}

        const centerGuess = this._approxTextIndexForTimingIndex(i);
        const bestMatch = this.textProcessor.findBestWordMatch(
          wordData.word,
          i,
          centerGuess,
          this.lastHighlightedIndex
        );

        const p = bestMatch?.probability ?? 0;
        if (bestMatch.index !== -1 && p >= this.minProbability) {
          this.clearAllHighlights();
          this.highlightWordsInRange(
            0,
            Math.min(bestMatch.index, spans.length - 1),
            `(seek target p=${p.toFixed(3)})`
          );
          return { wordData, textIndex: Math.min(bestMatch.index, spans.length - 1) };
        }

        // Fallback: try a quick forward exact search near the guess before bailing
        const startFrom = Number.isFinite(centerGuess) ? Math.max(0, centerGuess - 5) : this.lastHighlightedIndex;
        const forwardIndex = this._forwardExactSearch(wordData.word, startFrom);
        if (forwardIndex !== -1) {
          this.clearAllHighlights();
          this.highlightWordsInRange(0, Math.min(forwardIndex, spans.length - 1), '(seek forward exact)');
          return { wordData, textIndex: Math.min(forwardIndex, spans.length - 1) };
        }
        // Gate: no highlight if below threshold — return null so caller can estimate
        return null;
      }
    }

    // nearest previous
    let closestWord = null;
    let closestIndex = -1;

    for (let i = 0; i < this.textProcessor.wordTimings.length; i++) {
      const wd = this.textProcessor.wordTimings[i];
      if (wd.time_start <= currentTime) {
        closestWord = wd;
        closestIndex = i;
      } else {
        break;
      }
    }

    if (closestWord) {
      try { printl?.(`🎯 Closest previous "${closestWord.word}" @ ${currentTime.toFixed(3)}s`); } catch {}
      const centerGuess = this._approxTextIndexForTimingIndex(closestIndex);
      const bestMatch = this.textProcessor.findBestWordMatch(
        closestWord.word,
        closestIndex,
        centerGuess,
        this.lastHighlightedIndex
      );

      const p = bestMatch?.probability ?? 0;
      if (bestMatch.index !== -1 && p >= this.minProbability) {
        this.clearAllHighlights();
        this.highlightWordsInRange(
          0,
          Math.min(bestMatch.index, spans.length - 1),
          `(seek closest p=${p.toFixed(3)})`
        );

        return { wordData: closestWord, textIndex: Math.min(bestMatch.index, spans.length - 1) };
      }
      // Fallback: forward exact search near guess
      const startFrom = Number.isFinite(centerGuess) ? Math.max(0, centerGuess - 5) : this.lastHighlightedIndex;
      const forwardIndex = this._forwardExactSearch(closestWord.word, startFrom);
      if (forwardIndex !== -1) {
        this.clearAllHighlights();
        this.highlightWordsInRange(0, Math.min(forwardIndex, spans.length - 1), '(seek closest forward exact)');
        return { wordData: closestWord, textIndex: Math.min(forwardIndex, spans.length - 1) };
      }
    }

    try { printl?.(`⚠️ No suitable high-confidence word for t=${currentTime.toFixed(3)}s`); } catch {}
    return null;
  }

  estimatePositionFromTime(currentTime) {
    const spans = this._spans();

    if (!this.textProcessor?.wordTimings || this.textProcessor.wordTimings.length === 0) {
      const estimatedWordsPerSecond = 2.5;
      const estimatedWords = Math.max(0, Math.floor(currentTime * estimatedWordsPerSecond));
      const endIndex = Math.min(estimatedWords, spans.length - 1);

      if (endIndex >= 0) {
        this.clearAllHighlights();
        this.highlightWordsInRange(0, endIndex, '(time-based estimate)');
      }
      return;
    }

    let lastWordIndex = -1;

    for (let i = 0; i < this.textProcessor.wordTimings.length; i++) {
      if (this.textProcessor.wordTimings[i].time_start <= currentTime) {
        lastWordIndex = i;
      } else {
        break;
      }
    }

    let lastTextIndex = -1;
    if (lastWordIndex >= 0) {
      const bestMatch = this.textProcessor.findBestWordMatch(
        this.textProcessor.wordTimings[lastWordIndex].word,
        lastWordIndex,
        null,
        this.lastHighlightedIndex
      );
      const p = bestMatch?.probability ?? 0;
      if (bestMatch.index !== -1 && p >= this.minProbability) lastTextIndex = bestMatch.index;
    }

    if (lastTextIndex >= 0) {
      this.clearAllHighlights();
      this.highlightWordsInRange(0, Math.min(lastTextIndex, spans.length - 1), '(seek position estimate)');
    } else if (currentTime > 0) {
      const estimatedWordsPerSecond = 2.5;
      const estimatedWords = Math.max(0, Math.floor(currentTime * estimatedWordsPerSecond));
      const endIndex = Math.min(estimatedWords, spans.length - 1);

      if (endIndex >= 0) {
        this.clearAllHighlights();
        this.highlightWordsInRange(0, endIndex, '(fallback time estimate)');
      }
    } else {
      this.clearAllHighlights();
    }
  }

  handleSeek(currentTime) {
    try { printl?.(`🔄 Handling seek to: ${currentTime.toFixed(5)}s`); } catch {}

    this.clearAllHighlights();

    // reset processing state
    this.processedTimingIndices.clear();
    this.isInitialHighlightDone = false;
    this.lastHighlightedIndex = 0;
    this.nextTimingToConsider = 0;

    // During seek resolution, allow initial highlight without time clamp
    this._maxAllowedTextIndexForTime = Infinity;

    const currentWord = this.findCurrentWordAndHighlight(currentTime);

    if (currentWord) {
      try { printl?.(`✅ Highlighted after seek: "${currentWord.wordData?.word ?? ''}"`); } catch {}
    } else {
      this.estimatePositionFromTime(currentTime);
    }
  }

  handleAudioEnd(audioDuration) {
    const finalTime = audioDuration;
    try { printl?.(`🏁 Audio ended at: ${finalTime.toFixed(5)}s`); } catch {}
    try {
      printl?.(
        `📊 Highlighted ${this.highlightedIndices.size}/${this._spans().length}`
      );
    } catch {}

    // At end, allow painting the remainder without time-bound clamping
    this._maxAllowedTextIndexForTime = Infinity;

    const remaining = this._spans().length - this.highlightedIndices.size;
    if (remaining > 0) {
      try {
        printl?.(`🔧 Highlighting remaining ${remaining} words`);
      } catch {}
      this.highlightWordsInRange(
        this.lastHighlightedIndex,
        this._spans().length - 1,
        '(ensure all highlighted at end)'
      );
    }
  }

  async highlightWord(time, audioDuration) {
    if (!Number.isFinite(time) || time < 0) return;
    try { printl?.(`Audio time: ${time.toFixed(5)}s`); } catch {}

    try {
      // Set a conservative upper bound for highlighting based on current time
      this._maxAllowedTextIndexForTime = this._computeMaxAllowedIndexForTime(time);

      // Repair span references if the DOM was re-rendered
      this._rehydrateSpansIfDetached();

      this.handleInitialWords(time);
      // perf: process only what's due
      this.processUpToTime(time);
      this.catchUpToCurrentTime(time);

      if (audioDuration && time >= audioDuration - 0.1) {
        const remaining = this._spans().length - this.lastHighlightedIndex;
        if (remaining > 0) {
          this.highlightWordsInRange(
            this.lastHighlightedIndex,
            this._spans().length - 1,
            '(final words at audio end)'
          );
        }
      }
    } catch (error) {
      try { printError?.('Error highlighting words:', error); } catch {}
    }
  }

  startHighlighting(getCurrentTime, getDuration, { preferRAF = true } = {}) {
    // Clear any existing schedulers
    if (this.highlightInterval) { clearInterval(this.highlightInterval); this.highlightInterval = null; }
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }

    const tick = () => {
      try {
        const currentTime = getCurrentTime();
        const duration = getDuration();
        this.highlightWord(currentTime, duration);
      } finally {
        this._rafId = requestAnimationFrame(tick);
      }
    };

    if (preferRAF && typeof requestAnimationFrame === 'function') {
      this._rafId = requestAnimationFrame(tick);
    } else {
      this.highlightInterval = setInterval(() => {
        const currentTime = getCurrentTime();
        const duration = getDuration();
        this.highlightWord(currentTime, duration);
      }, 50);
    }
  }

  stopHighlighting() {
    if (this.highlightInterval) { clearInterval(this.highlightInterval); this.highlightInterval = null; }
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  }

  /* ---------------- util: forward exact search ---------------- */
  _forwardExactSearch(targetWord, fromIndex, windowSize = this.textProcessor?.referenceWords ?? 10) {
    const spans = this._spans();
    if (!spans.length) return -1;

    const cleanTarget = String(targetWord)
      .toLocaleLowerCase()
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}’']+/gu, '');

    const start = Math.max(0, fromIndex);
    const end = Math.min(spans.length, start + Math.max(3, windowSize));
    for (let i = start; i < end; i++) {
      const el = this._safeSpan(i);
      if (!el) continue;
      const ow = el.dataset?.originalWord;
      if (ow && ow === cleanTarget) return i;
    }
    return -1;
  }

  _approxTextIndexForTimingIndex(timingIndex) {
    const spans = this._spans();
    const timings = this.textProcessor?.wordTimings;
    if (!spans.length || !Array.isArray(timings) || timings.length === 0) return NaN;
    const ratio = Math.max(0, Math.min(1, timingIndex / Math.max(1, timings.length - 1)));
    return Math.floor(ratio * (spans.length - 1));
  }

  /* ---------------- util: time-bound guard ---------------- */
  _computeMaxAllowedIndexForTime(currentTime) {
    const spans = this._spans();
    if (!spans.length) return -1;

    const timings = this.textProcessor?.wordTimings;
    if (!Array.isArray(timings) || timings.length === 0) {
      // Fallback: coarse estimate by words/second (conservative)
      const wps = 2.5;
      return Math.min(spans.length - 1, Math.max(-1, Math.floor(currentTime * wps) - 1));
    }

    // Find the last timing whose start is <= current time (no lookahead)
    let idx = -1;
    for (let i = 0; i < timings.length; i++) {
      if (timings[i].time_start <= currentTime) idx = i; else break;
    }

    if (idx < 0) {
      // Before first word starts: do not allow any highlight yet
      return -1;
    }

    // Map current timing to text index conservatively
    const curWord = timings[idx];
    let match = this.textProcessor.findBestWordMatch(
      curWord.word,
      idx,
      null,
      this.lastHighlightedIndex
    );

    let curTextIndex = (match && match.index !== -1) ? match.index : -1;
    if (curTextIndex === -1) {
      // Try a forward exact search near the last highlighted index
      const fwd = this._forwardExactSearch(curWord.word, this.lastHighlightedIndex);
      if (fwd !== -1) curTextIndex = fwd;
    }
    if (curTextIndex === -1) {
      // If we cannot confidently map, do not allow further progress
      return Math.max(-1, this.lastHighlightedIndex - 1);
    }

    // If we are still within the current timed word, allow only this word index
    if (currentTime <= curWord.time_end) return Math.min(curTextIndex, spans.length - 1);

    // We are in the gap to the next word (if any). Allow gradual progress through
    // the inter-word text based on elapsed fraction of the time gap.
    if (idx + 1 < timings.length) {
      const nextWord = timings[idx + 1];
      const gap = nextWord.time_start - curWord.time_end;
      if (gap > 0) {
        let nextMatch = this.textProcessor.findBestWordMatch(
          nextWord.word,
          idx + 1,
          null,
          this.lastHighlightedIndex
        );
        let nextTextIndex = (nextMatch && nextMatch.index !== -1) ? nextMatch.index : -1;
        if (nextTextIndex === -1) {
          const fwd2 = this._forwardExactSearch(nextWord.word, curTextIndex + 1);
          if (fwd2 !== -1) nextTextIndex = fwd2;
        }
        if (nextTextIndex > curTextIndex) {
          const between = Math.max(0, nextTextIndex - curTextIndex - 1);
          if (between > 0) {
            const frac = Math.max(0, Math.min(1, (currentTime - curWord.time_end) / gap));
            const allowExtra = Math.floor(between * frac);
            return Math.min(spans.length - 1, curTextIndex + allowExtra);
          }
        }
      }
    }

    return Math.min(spans.length - 1, curTextIndex);
  }
}
