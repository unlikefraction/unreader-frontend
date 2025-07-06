import { commonVars } from '../common-vars.js';

export class ParagraphSeeker {
  static _mouseListenersAdded = false;

  constructor(textProcessor, audioCore, {
    minProbabilityThreshold = 0.4,
    contextWindow = 15,
    cleanPattern = /[^\w\s]/g
  } = {}) {
    this.textProcessor = textProcessor;
    this.audioCore = audioCore;
    this.minProbabilityThreshold = minProbabilityThreshold;
    this.contextWindow = contextWindow;
    this.cleanPattern = cleanPattern;

    // Track last known toolActive state
    this._lastToolActive = commonVars.toolActive;

    // Poll for toolActive changes every second
    this._stateInterval = setInterval(() => {
      const current = commonVars.toolActive;
      if (current !== this._lastToolActive) {
        this._lastToolActive = current;
        this.refreshParagraphNavigation();
      }
    }, 1000);

    // Restore overlays on mouseup
    if (!ParagraphSeeker._mouseListenersAdded) {
      document.addEventListener('mouseup', () => {
        document
          .querySelectorAll('.paragraph-hover-area')
          .forEach(area => area.style.pointerEvents = 'auto');
      });
      ParagraphSeeker._mouseListenersAdded = true;
    }
  }

  preprocessText(inputText) {
    return inputText
      .toLowerCase()
      .replace(this.cleanPattern, '')
      .split(/\s+/)
      .filter(Boolean);
  }

  calculateSimilarity(inputWords, referenceWords) {
    const maxLen = Math.max(inputWords.length, referenceWords.length);
    if (!maxLen) return 0;

    const refSet = new Set(referenceWords);
    let directMatches = 0;
    let sequentialMatches = 0;
    const minLen = Math.min(inputWords.length, referenceWords.length);

    for (let i = 0; i < inputWords.length; i++) {
      if (refSet.has(inputWords[i])) directMatches++;
      if (i < referenceWords.length && inputWords[i] === referenceWords[i]) sequentialMatches++;
    }

    const directScore = directMatches / maxLen;
    const seqScore = minLen ? (sequentialMatches / minLen) : 0;
    return directScore * 0.6 + seqScore * 0.4;
  }

  getTextContext(start, end) {
    const spans = this.textProcessor.wordSpans;
    const from = Math.max(0, start - this.contextWindow);
    const to = Math.min(spans.length, end + this.contextWindow);
    const ctx = [];
    for (let i = from; i < to; i++) {
      const w = spans[i]?.dataset?.originalWord;
      if (w) ctx.push(w.toLowerCase());
    }
    return ctx;
  }

  findBestTextMatch(inputWords) {
    const spans = this.textProcessor.wordSpans;
    const total = spans.length;
    const winSize = inputWords.length;
    let best = { start: -1, end: -1, probability: 0, direct: 0, context: 0 };

    for (let i = 0; i <= total - winSize; i++) {
      const slice = spans.slice(i, i + winSize);
      const windowWords = slice
        .map(s => s.dataset.originalWord?.toLowerCase())
        .filter(Boolean);
      if (windowWords.length < winSize * 0.5) continue;

      const direct = this.calculateSimilarity(inputWords, windowWords);
      const context = this.calculateSimilarity(inputWords, this.getTextContext(i, i + winSize));
      const prob = direct * 0.7 + context * 0.3;

      if (prob > best.probability) {
        best = { start: i, end: i + winSize - 1, probability: prob, direct, context };
      }
    }
    return best;
  }

  getAudioContext(idx) {
    const timings = this.textProcessor.wordTimings;
    const from = Math.max(0, idx - this.contextWindow);
    const to = Math.min(timings.length, idx + this.contextWindow);
    const ctx = [];
    for (let i = from; i < to; i++) {
      const w = timings[i].word
        .toLowerCase()
        .replace(this.cleanPattern, '');
      if (w) ctx.push(w);
    }
    return ctx;
  }

  findAudioTimestamp(textIdx) {
    const timings = this.textProcessor.wordTimings;
    if (!timings?.length) return null;
    const span = this.textProcessor.wordSpans[textIdx];
    const target = span?.dataset?.originalWord
      ?.toLowerCase()
      .replace(this.cleanPattern, '');
    if (!target) return null;

    let best = { timing: null, prob: 0 };
    for (let i = 0; i < timings.length; i++) {
      const tw = timings[i].word
        .toLowerCase()
        .replace(this.cleanPattern, '');
      if (tw !== target) continue;

      const ctxScore = this.calculateSimilarity(
        this.getTextContext(textIdx, textIdx + 1),
        this.getAudioContext(i)
      );
      const prob = 0.5 + 0.5 * ctxScore;
      if (prob > best.prob) best = { timing: timings[i], prob };
    }
    return best.timing;
  }

  async seekToParagraph(inputText, { minProbability, log = true } = {}) {
    const thresh = minProbability ?? this.minProbabilityThreshold;
    const words = this.preprocessText(inputText);
    if (!words.length) return { success: false, error: 'No valid words' };

    const match = this.findBestTextMatch(words);
    if (match.probability < thresh) {
      return { success: false, error: 'Low match probability', match };
    }

    const timing = this.findAudioTimestamp(match.start);
    if (!timing) {
      return { success: false, error: 'No audio timing', match };
    }

    this.audioCore.sound?.seek(timing.time_start);
    if (log) console.log(`Seeked to ${timing.time_start}s`);
    return { success: true, timestamp: timing.time_start, match, timing };
  }

  async seekToParagraphs(paragraphTexts, options = {}) {
    const results = [];
    for (let i = 0; i < paragraphTexts.length; i++) {
      const result = await this.seekToParagraph(
        paragraphTexts[i],
        { ...options, log: false }
      );
      results.push({ index: i, text: paragraphTexts[i], result });
      if (result.success) break;
    }
    return results;
  }

  extractParagraphs() {
    const main = document.querySelector('.mainContent');
    if (!main) return [];
    const paras = [];
    let curr = '';

    main.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        curr += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'BR') {
          if (curr.trim()) { paras.push(curr.trim()); curr = ''; }
        } else if (node.classList.contains('word')) {
          curr += node.textContent;
        }
      }
    });
    if (curr.trim()) paras.push(curr.trim());
    return paras;
  }

  setupParagraphHoverNavigation() {
    const main = document.querySelector('.mainContent');
    if (!main) return;
    document
      .querySelectorAll('.paragraph-hover-nav, .paragraph-hover-area')
      .forEach(el => el.remove());
    this.findParagraphBoundaries().forEach((p, i) =>
      this.setupParagraphHover(p, i)
    );
    this.setupDynamicUpdates();
  }

  findParagraphBoundaries() {
    const main = document.querySelector('.mainContent');
    if (!main) return [];
    const paras = [];
    let para = { start: 0, end: 0, text: '', elements: [] };
    let idx = 0;

    main.childNodes.forEach(node => {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        node.classList.contains('word')
      ) {
        para.text += node.textContent + ' ';
        para.elements.push(node);
        idx++;
      } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
        if (para.text.trim()) {
          para.end = idx - 1;
          paras.push({ ...para });
        }
        para = { start: idx, end: idx, text: '', elements: [] };
      }
    });
    if (para.text.trim()) {
      para.end = idx - 1;
      paras.push(para);
    }
    return paras;
  }

  setupParagraphHover(paragraph, index) {
    if (!paragraph.elements.length) return;
    const first = paragraph.elements[0];
    const last = paragraph.elements[paragraph.elements.length - 1];

    const hoverArea = document.createElement('div');
    Object.assign(hoverArea.style, {
      position: 'absolute',
      zIndex: 999,
      background: 'transparent',
      pointerEvents: commonVars.toolActive ? 'auto' : 'auto',
      cursor: commonVars.toolActive ? 'default' : 'text'
    });
    hoverArea.className = 'paragraph-hover-area';

    // If toolActive is true, just block selection and bail
    if (commonVars.toolActive) {
      document.body.appendChild(hoverArea);
      this.updateHoverAreaPosition(hoverArea, paragraph);
      return;
    }

    // When inactive: allow mousedown to pass through for text selection
    hoverArea.addEventListener('mousedown', () => {
      hoverArea.style.pointerEvents = 'none';
    });

    const hoverDiv = document.createElement('div');
    hoverDiv.className = 'paragraph-hover-nav';
    Object.assign(hoverDiv.style, {
      display: 'none',
      position: 'absolute',
      zIndex: 1000,
      cursor: 'pointer',
      pointerEvents: 'auto'
    });
    hoverDiv.innerHTML = '<i class="ph ph-play"></i>';
    hoverDiv.dataset.paragraphIndex = index;

    hoverArea.addEventListener('mouseenter', () => this.showHoverDiv(hoverDiv, first, paragraph));
    hoverArea.addEventListener('mouseleave', e => {
      if (!hoverDiv.contains(e.relatedTarget)) this.hideHoverDiv(hoverDiv);
    });
    hoverDiv.addEventListener('mouseenter', () => this.showHoverDiv(hoverDiv, first, paragraph));
    hoverDiv.addEventListener('mouseleave', e => {
      if (!hoverArea.contains(e.relatedTarget)) this.hideHoverDiv(hoverDiv);
    });

    hoverDiv.addEventListener('click', async e => {
      e.preventDefault();
      const result = await this.seekToParagraph(paragraph.text);
      if (result.success && this.audioCore && !this.audioCore.isPlaying) {
        await this.audioCore.playAudio();
      }
    });

    document.body.appendChild(hoverArea);
    document.body.appendChild(hoverDiv);
    this.updateHoverAreaPosition(hoverArea, paragraph);
  }

  updateHoverAreaPosition(hoverArea, paragraph) {
    const firstRect = paragraph.elements[0].getBoundingClientRect();
    const lastRect = paragraph.elements[paragraph.elements.length - 1].getBoundingClientRect();
    const left = Math.min(firstRect.left, lastRect.left) - 25;
    const top = Math.min(firstRect.top, lastRect.top) + window.scrollY;
    const height = Math.max(firstRect.bottom, lastRect.bottom) - Math.min(firstRect.top, firstRect.top);

    hoverArea.style.left = `${left}px`;
    hoverArea.style.top = `${top}px`;
    hoverArea.style.width = `700px`;
    hoverArea.style.height = `${height}px`;
  }

  showHoverDiv(hoverDiv, firstElement, paragraph) {
    const rect = firstElement.getBoundingClientRect();
    hoverDiv.style.left = `${rect.left - 10}px`;
    hoverDiv.style.top = `${rect.top + window.scrollY}px`;
    hoverDiv.style.display = 'block';
    hoverDiv.dataset.paragraphLength = paragraph.elements.length;
    hoverDiv.dataset.paragraphPreview = paragraph.text.substring(0, 100);
  }

  hideHoverDiv(hoverDiv) {
    setTimeout(() => {
      if (!hoverDiv.matches(':hover') && !document.querySelector(`.paragraph-hover-area[data-index="${hoverDiv.dataset.paragraphIndex}"]`)?.matches(':hover')) {
        hoverDiv.style.display = 'none';
      }
    }, 50);
  }

  enableParagraphNavigation() {
    this.setupParagraphHoverNavigation();
    console.log('✅ Paragraph hover navigation enabled');
  }

  disableParagraphNavigation() {
    document.querySelectorAll('.paragraph-hover-nav, .paragraph-hover-area')
      .forEach(el => el.remove());
    if (this.scrollListener) window.removeEventListener('scroll', this.scrollListener);
    if (this.resizeListener) window.removeEventListener('resize', this.resizeListener);
    console.log('❌ Paragraph hover navigation disabled');
  }
  
  setupDynamicUpdates() {
    this.scrollListener = () => this.updateAllHoverAreas();
    this.resizeListener = () => this.updateAllHoverAreas();
    window.addEventListener('scroll', this.scrollListener, { passive: true });
    window.addEventListener('resize', this.resizeListener, { passive: true });
  }

  updateAllHoverAreas() {
    const paragraphs = this.findParagraphBoundaries();
    document.querySelectorAll('.paragraph-hover-area').forEach((area, idx) => {
      if (paragraphs[idx]) this.updateHoverAreaPosition(area, paragraphs[idx]);
    });
  }

  refreshParagraphNavigation() {
    this.disableParagraphNavigation();
    this.enableParagraphNavigation();
  }

  setMinProbabilityThreshold(threshold) {
    this.minProbabilityThreshold = Math.min(1, Math.max(0, threshold));
    console.log(`📊 Min probability threshold set to: ${this.minProbabilityThreshold}`);
  }

  setContextWindow(windowSize) {
    this.contextWindow = Math.min(50, Math.max(5, windowSize));
    console.log(`🔍 Context window set to: ${this.contextWindow} words`);
  }
}
