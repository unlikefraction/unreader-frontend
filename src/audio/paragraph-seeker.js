import { commonVars } from '../common-vars.js';

export class ParagraphSeeker {
  static _mouseListenersAdded = false;

  constructor(
    textProcessor,
    audioCore,
    {
      minProbabilityThreshold = 0.4,
      contextWindow = 15,
      cleanPattern = /[^\p{L}\p{N}’']/gu   // Unicode-aware punctuation stripper
    } = {}
  ) {
    this.textProcessor = textProcessor;
    this.audioCore = audioCore;
    this.minProbabilityThreshold = minProbabilityThreshold;
    this.contextWindow = contextWindow;
    this.cleanPattern = cleanPattern;

    document.body.style.userSelect = commonVars.beingEdited ? 'none' : '';

    this._lastToolActive = commonVars.toolActive;
    this._lastBeingEdited = commonVars.beingEdited;

    this._stateInterval = setInterval(() => {
      const { toolActive, beingEdited } = commonVars;

      if (beingEdited !== this._lastBeingEdited) {
        document.body.style.userSelect = beingEdited ? 'none' : '';
      }

      if (toolActive !== this._lastToolActive || beingEdited !== this._lastBeingEdited) {
        this._lastToolActive = toolActive;
        this._lastBeingEdited = beingEdited;
        this.refreshParagraphNavigation();
      }
    }, 100);

    if (!ParagraphSeeker._mouseListenersAdded) {
      document.addEventListener('mouseup', () => {
        document.querySelectorAll('.paragraph-hover-area').forEach(area => {
          area.style.pointerEvents = 'auto';
        });
      });
      ParagraphSeeker._mouseListenersAdded = true;
    }
  }

  // ---------- text utils ----------

  preprocessText(inputText) {
    return inputText
      .toLocaleLowerCase()
      .normalize('NFKC')
      .replace(this.cleanPattern, ' ')
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
    const seqScore = minLen ? sequentialMatches / minLen : 0;
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
      const w = timings[i].word.toLowerCase().replace(this.cleanPattern, '');
      if (w) ctx.push(w);
    }
    return ctx;
  }

  findAudioTimestamp(textIdx) {
    const timings = this.textProcessor.wordTimings;
    if (!timings?.length) return null;

    const span = this.textProcessor.wordSpans[textIdx];
    const target = span?.dataset?.originalWord?.toLowerCase().replace(this.cleanPattern, '');
    if (!target) return null;

    let best = { timing: null, prob: 0 };
    for (let i = 0; i < timings.length; i++) {
      const tw = timings[i].word.toLowerCase().replace(this.cleanPattern, '');
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

  // ---------- seeking APIs ----------

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
    if (log) printl(`Seeked to ${timing.time_start}s`);
    return { success: true, timestamp: timing.time_start, match, timing };
  }

  async seekToParagraphs(paragraphTexts, options = {}) {
    const results = [];
    for (let i = 0; i < paragraphTexts.length; i++) {
      const result = await this.seekToParagraph(paragraphTexts[i], { ...options, log: false });
      results.push({ index: i, text: paragraphTexts[i], result });
      if (result.success) break;
    }
    return results;
  }

  // ---------- paragraph detection on real HTML ----------

  findParagraphBoundaries() {
    const main = this.textProcessor?.container;
    if (!main) return [];
    const paras = [];

    const BLOCK_QUERY = [
      'p','li','blockquote','pre','figcaption','dt','dd',
      'h1','h2','h3','h4','h5','h6','article','section'
    ].join(',');

    const blocks = main.querySelectorAll(BLOCK_QUERY);

    blocks.forEach((blk) => {
      const words = blk.querySelectorAll('span.word');
      if (!words.length) return;

      const first = words[0];
      const last  = words[words.length - 1];

      const start = Number(first.dataset.index);
      const end   = Number(last.dataset.index);
      const text  = [...words].map(w => w.textContent).join(' ').trim();

      paras.push({ start, end, text, elements: [...words] });
    });

    if (!paras.length && this.textProcessor?.wordSpans?.length) {
      const ws = this.textProcessor.wordSpans;
      paras.push({
        start: 0, end: ws.length - 1,
        text: ws.map(w => w.textContent).join(' ').trim(),
        elements: [...ws]
      });
    }

    return paras;
  }

  extractParagraphs() {
    return this.findParagraphBoundaries().map(p => p.text);
  }

  // ---------- paragraph hover UI (unchanged, uses boundaries) ----------

  setupParagraphHoverNavigation() {
    const main = this.textProcessor?.container;
    if (!main) return;

    if (getComputedStyle(main).position === 'static') {
      main.style.position = 'relative';
    }

    main.querySelectorAll('.paragraph-hover-nav, .paragraph-hover-area').forEach(el => el.remove());

    this.findParagraphBoundaries().forEach((p, i) => this.setupParagraphHover(p, i));

    this.setupDynamicUpdates();
  }

  setupParagraphHover(paragraph, index) {
    const main = this.textProcessor?.container;
    if (!main || !paragraph.elements.length) return;

    const first = paragraph.elements[0];

    const hoverArea = document.createElement('div');
    Object.assign(hoverArea.style, {
      position: 'absolute',
      zIndex: 1,
      background: 'transparent',
      pointerEvents: commonVars.toolActive && !commonVars.beingEdited ? 'auto' : 'none',
      cursor: commonVars.toolActive ? 'crossbow' : 'text'
    });
    hoverArea.className = 'paragraph-hover-area';
    hoverArea.dataset.pageId = this.textProcessor.pageId;

    main.appendChild(hoverArea);
    this.updateHoverAreaPosition(hoverArea, paragraph);

    hoverArea.addEventListener('mousedown', () => {
      if (!commonVars.toolActive || commonVars.beingEdited) {
        hoverArea.style.pointerEvents = 'none';
      }
    });

    const hoverDiv = document.createElement('div');
    hoverDiv.className = 'paragraph-hover-nav';
    Object.assign(hoverDiv.style, {
      display: 'none',
      position: 'absolute',
      zIndex: 2,
      cursor: 'pointer',
      pointerEvents: commonVars.beingEdited ? 'none' : 'auto'
    });
    if (commonVars.toolActive) hoverDiv.style.visibility = 'hidden';

    hoverDiv.innerHTML = '<i class="ph ph-play"></i>';
    hoverDiv.dataset.paragraphIndex = index;
    hoverDiv.dataset.pageId = this.textProcessor.pageId;
    hoverDiv.dataset.paragraphText = paragraph.text.trim();

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
      if (commonVars.beingEdited) return;
      const result = await this.seekToParagraph(paragraph.text);
      if (result.success && this.audioCore && !this.audioCore.isPlaying) {
        await this.audioCore.playAudio();
      }
    });

    main.appendChild(hoverDiv);
  }

  updateHoverAreaPosition(hoverArea, paragraph) {
    const main = this.textProcessor?.container;
    if (!main) return;

    const firstRect = paragraph.elements[0].getBoundingClientRect();
    const lastRect = paragraph.elements[paragraph.elements.length - 1].getBoundingClientRect();
    const containerRect = main.getBoundingClientRect();

    const left = Math.min(firstRect.left, lastRect.left) - containerRect.left - 25;
    const top = Math.min(firstRect.top, lastRect.top) - containerRect.top;
    const height = Math.max(firstRect.bottom, lastRect.bottom) - firstRect.top;

    hoverArea.style.left = `${left}px`;
    hoverArea.style.top = `${top}px`;
    hoverArea.style.width = `700px`;
    hoverArea.style.height = `${height}px`;
  }

  showHoverDiv(hoverDiv, firstElement, paragraph) {
    const main = this.textProcessor?.container;
    if (!main) return;

    const rect = firstElement.getBoundingClientRect();
    const containerRect = main.getBoundingClientRect();

    hoverDiv.style.left = `${rect.left - containerRect.left - 10}px`;
    hoverDiv.style.top = `${rect.top - containerRect.top}px`;
    hoverDiv.style.display = 'block';
    hoverDiv.style.visibility = commonVars.toolActive ? 'hidden' : 'visible';
    hoverDiv.dataset.paragraphLength = paragraph.elements.length;
    hoverDiv.dataset.paragraphPreview = paragraph.text.substring(0, 100);
  }

  hideHoverDiv(hoverDiv) {
    setTimeout(() => {
      const area = hoverDiv.closest('.paragraph-hover-area');
      if (!hoverDiv.matches(':hover') && !(area && area.matches(':hover'))) {
        hoverDiv.style.display = 'none';
      }
    }, 50);
  }

  enableParagraphNavigation() {
    this.setupParagraphHoverNavigation();
    printl?.('✅ Paragraph hover navigation enabled (scoped to page)');
  }

  disableParagraphNavigation() {
    const main = this.textProcessor?.container;
    if (main) main.querySelectorAll('.paragraph-hover-nav, .paragraph-hover-area').forEach(el => el.remove());
    if (this.scrollListener) window.removeEventListener('scroll', this.scrollListener);
    if (this.resizeListener) window.removeEventListener('resize', this.resizeListener);
    printl?.('❌ Paragraph hover navigation disabled (page-scoped)');
  }

  setupDynamicUpdates() {
    this.scrollListener = () => this.updateAllHoverAreas();
    this.resizeListener = () => this.updateAllHoverAreas();
    window.addEventListener('scroll', this.scrollListener, { passive: true });
    window.addEventListener('resize', this.resizeListener, { passive: true });
  }

  updateAllHoverAreas() {
    const main = this.textProcessor?.container;
    if (!main) return;

    const paragraphs = this.findParagraphBoundaries();
    const areas = main.querySelectorAll('.paragraph-hover-area');
    areas.forEach((area, idx) => {
      if (paragraphs[idx]) this.updateHoverAreaPosition(area, paragraphs[idx]);
    });
  }

  refreshParagraphNavigation() {
    this.disableParagraphNavigation();
    this.enableParagraphNavigation();
  }

  setMinProbabilityThreshold(threshold) {
    this.minProbabilityThreshold = Math.min(1, Math.max(0, threshold));
    printl?.(`📊 Min probability threshold set to: ${this.minProbabilityThreshold}`);
  }

  setContextWindow(windowSize) {
    this.contextWindow = Math.min(50, Math.max(5, windowSize));
    printl?.(`🔍 Context window set to: ${this.contextWindow} words`);
  }

  destroy() {
    clearInterval(this._stateInterval);
    this.disableParagraphNavigation();
  }
}
