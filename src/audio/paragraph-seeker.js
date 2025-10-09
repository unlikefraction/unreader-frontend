// ----paragraph-seeker.js-----

import { commonVars } from '../common-vars.js';

export class ParagraphSeeker {
  static _mouseListenersAdded = false;

  constructor(
    textProcessor,
    audioCore,
    {
      minProbabilityThreshold = 0.4,
      contextWindow = 15,
      cleanPattern = /[^\w\s]/g
    } = {}
  ) {
    this.textProcessor = textProcessor;
    this.audioCore = audioCore;
    this.minProbabilityThreshold = minProbabilityThreshold;
    this.contextWindow = contextWindow;
    this.cleanPattern = cleanPattern;

    // Pinned icon state (when we want the play icon always visible on a target paragraph)
    this._pinned = { active: false, paragraphEl: null, onScroll: null, onResize: null };

    // respect edit mode for selection
    document.body.style.userSelect = commonVars.beingEdited ? 'none' : '';

    this._lastToolActive = commonVars.toolActive;
    this._lastBeingEdited = commonVars.beingEdited;

    // watch global tool/edit switches and refresh paragraph hover UI when needed
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

    // Re-enable hover areas after selection attempts
    if (!ParagraphSeeker._mouseListenersAdded) {
      const reenable = () => {
        document.querySelectorAll('.paragraph-hover-area').forEach(area => {
          area.style.pointerEvents = commonVars.beingEdited ? 'none' : 'auto';
        });
      };
      document.addEventListener('mouseup', reenable);
      document.addEventListener('touchend', reenable, { passive: true });
      ParagraphSeeker._mouseListenersAdded = true;
    }
  }

  // ---------- text utils ----------

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
    if (log) printl?.(`Seeked to ${timing.time_start}s`);
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

  // ---------- paragraph detection (HTML-preserving) ----------

  /** block-ish displays we treat as paragraph hosts */
  _isBlockish(el) {
    try {
      const display = getComputedStyle(el).display;
      if (display === 'block' || display === 'list-item' || display === 'table' ||
          display === 'table-row' || display === 'table-cell' ||
          display === 'grid' || display === 'flex') return true;
    } catch {}
    // fallback by tag (covers <p>, headings, li, blockquote, pre, div, section, article, aside)
    const tag = el.tagName;
    return /^(P|H[1-6]|LI|BLOCKQUOTE|PRE|DIV|SECTION|ARTICLE|ASIDE|HEADER|FOOTER|MAIN|NAV|DD|DT|FIGCAPTION|ADDRESS)$/.test(tag);
  }

  _closestParagraphHost(spanEl, stopAt) {
    let n = spanEl?.parentElement || null;
    while (n && n !== stopAt) {
      if (this._isBlockish(n)) return n;
      n = n.parentElement;
    }
    return stopAt || null;
  }

  /**
   * Build paragraph boundaries by grouping contiguous word spans under the same
   * block-level ancestor. This works for real HTML (<p>, <li>, headings, etc.).
   */
  findParagraphBoundaries() {
    const main = this.textProcessor?.container;
    if (!main) return [];
    const spans = this.textProcessor.wordSpans || [];
    const paras = [];

    let curHost = null;
    let para = { start: 0, end: 0, text: '', elements: [] };
    let idx = 0;

    for (let i = 0; i < spans.length; i++) {
      const w = spans[i];
      if (!w?.isConnected) continue;
      const host = this._closestParagraphHost(w, main) || main;

      // start a new paragraph when host changes
      if (host !== curHost && para.elements.length) {
        para.end = idx - 1;
        paras.push({ ...para });
        para = { start: idx, end: idx, text: '', elements: [] };
      }

      curHost = host;
      para.text += w.textContent + ' ';
      para.elements.push(w);
      idx++;
    }

    if (para.elements.length) {
      para.end = idx - 1;
      paras.push(para);
    }

    if (!paras.length) {
      printl?.('⚠️ ParagraphSeeker: no paragraph boundaries found');
    } else {
      printl?.(`🧭 ParagraphSeeker: found ${paras.length} paragraph(s)`);
    }
    return paras;
  }

  extractParagraphs() {
    return this.findParagraphBoundaries().map(p => p.text.trim()).filter(Boolean);
  }

  // ---------- paragraph hover UI: shared play icon on <p> ----------

  setupParagraphHoverNavigation() {
    const main = this.textProcessor?.container;
    if (!main) return;

    // Ensure local positioning for absolute children
    if (getComputedStyle(main).position === 'static') {
      main.style.position = 'relative';
    }

    // Remove page-scoped UI
    main.querySelectorAll('.paragraph-hover-nav, .paragraph-hover-area').forEach(el => el.remove());

    // Create single shared play icon element
    this._playIcon = document.createElement('div');
    this._playIcon.className = 'paragraph-hover-nav';
    Object.assign(this._playIcon.style, {
      display: 'none',
      position: 'absolute',
      zIndex: 2,
      cursor: commonVars.toolActive ? 'crosshair' : 'pointer',
      pointerEvents: commonVars.beingEdited ? 'none' : 'auto'
    });
    if (commonVars.toolActive) this._playIcon.style.visibility = 'hidden';
    this._playIcon.innerHTML = '<i class="ph ph-play"></i>';
    this._playIcon.dataset.pageId = this.textProcessor.pageId;

    // Handle icon click -> play paragraph
    this._playIcon.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      if (commonVars.beingEdited || commonVars.toolActive) return;
      const text = this._currentParagraphText?.trim();
      if (!text) return;
      // Ensure timings and audio exist when not under MultiPageReader
      try { if (!this.textProcessor?.wordTimings?.length && typeof this.textProcessor?.loadWordTimings === 'function') await this.textProcessor.loadWordTimings(); } catch {}
      try { if (!this.audioCore?.sound && this.audioCore?.setupAudio) this.audioCore.setupAudio(); } catch {}
      const result = await this.seekToParagraph(text);
      if (result.success && this.audioCore && !this.audioCore.isPlaying) {
        await this.audioCore.playAudio();
      }
    });

    // Keep visible while hovering icon
    this._playIcon.addEventListener('mouseenter', () => { this._iconHovering = true; });
    this._playIcon.addEventListener('mouseleave', () => { this._iconHovering = false; this._scheduleHideIcon(); });

    main.appendChild(this._playIcon);

    // Bind events to <p> elements
    this._bindParagraphEvents();

    // Observe DOM changes to rebind efficiently
    try {
      this._mo?.disconnect?.();
      this._mo = new MutationObserver(() => this._scheduleRebind());
      this._mo.observe(main, { subtree: true, childList: true, characterData: true });
    } catch {}
  }

  _bindParagraphEvents() {
    const main = this.textProcessor?.container;
    if (!main) return;

    // Cleanup previous listeners
    this._paragraphListeners?.forEach(({ el, enter, leave }) => {
      try { el.removeEventListener('mouseenter', enter); } catch {}
      try { el.removeEventListener('mouseleave', leave); } catch {}
    });
    this._paragraphListeners = [];

    const paras = Array.from(main.querySelectorAll('p'));
    paras.forEach(p => {
      const enter = () => this._showIconForParagraph(p);
      const leave = () => this._scheduleHideIcon();
      p.addEventListener('mouseenter', enter);
      p.addEventListener('mouseleave', leave);
      this._paragraphListeners.push({ el: p, enter, leave });
    });

    printl?.(`🧭 ParagraphSeeker: bound to ${paras.length} <p> elements`);
  }

  _showIconForParagraph(pEl) {
    const main = this.textProcessor?.container;
    if (!main || !this._playIcon) return;
    const rect = pEl.getBoundingClientRect();
    const cr = main.getBoundingClientRect();
  this._currentParagraphEl = pEl;
  this._currentParagraphText = pEl.textContent || '';
  this._playIcon.style.left = `${rect.left - cr.left - 14}px`;
  this._playIcon.style.top = `${rect.top - cr.top + 6}px`;
  this._playIcon.style.visibility = commonVars.toolActive ? 'hidden' : 'visible';
  this._playIcon.style.cursor = commonVars.toolActive ? 'crosshair' : 'pointer';
  this._playIcon.style.pointerEvents = commonVars.beingEdited ? 'none' : 'auto';
  this._playIcon.style.display = 'block';
  // Expose paragraph text for global delegator in MultiPageReader
  this._playIcon.dataset.paragraphText = this._currentParagraphText.trim();
  }

  _scheduleHideIcon() {
    clearTimeout(this._hideTO);
    this._hideTO = setTimeout(() => {
      // Do not auto-hide when pinned
      if (this._pinned?.active) return;
      if (this._iconHovering) return;
      const overP = this._currentParagraphEl?.matches?.(':hover');
      if (!overP && this._playIcon) this._playIcon.style.display = 'none';
    }, 60);
  }

  refreshParagraphNavigation() {
    this.disableParagraphNavigation();
    this.enableParagraphNavigation();
  }

  _scheduleRebind() {
    clearTimeout(this._rebindTO);
    this._rebindTO = setTimeout(() => this._bindParagraphEvents(), 80);
  }

  enableParagraphNavigation() {
    this.setupParagraphHoverNavigation();
    printl?.('✅ Paragraph hover navigation enabled (p-hover, shared icon)');
  }

  disableParagraphNavigation() {
    const main = this.textProcessor?.container;
    if (main) main.querySelectorAll('.paragraph-hover-nav, .paragraph-hover-area').forEach(el => el.remove());
    try { this._mo?.disconnect?.(); } catch {}
    // remove paragraph listeners
    this._paragraphListeners?.forEach(({ el, enter, leave }) => {
      try { el.removeEventListener('mouseenter', enter); } catch {}
      try { el.removeEventListener('mouseleave', leave); } catch {}
    });
    this._paragraphListeners = [];
    // ensure pinned state is cleared and listeners removed
    try { this.unpinIcon(); } catch {}
    this._currentParagraphEl = null;
    this._currentParagraphText = '';
    this._iconHovering = false;
    clearTimeout(this._hideTO);
    clearTimeout(this._rebindTO);
    printl?.('❌ Paragraph hover navigation disabled');
  }

  /**
   * Pin the shared play icon to a given <p> element and keep it visible at all times.
   * Also repositions it on scroll/resize so it stays aligned.
   */
  pinIconToParagraph(pEl) {
    try {
      const main = this.textProcessor?.container;
      if (!main || !pEl) return;
      // Ensure UI exists
      if (!this._playIcon || !main.contains(this._playIcon)) {
        this.setupParagraphHoverNavigation();
      }
      this._pinned = this._pinned || { active: false, paragraphEl: null, onScroll: null, onResize: null };
      this._pinned.paragraphEl = pEl;
      this._pinned.active = true;

      const reposition = () => {
        try { this._showIconForParagraph(this._pinned.paragraphEl); } catch {}
      };
      // Remove prior listeners if any
      try { if (this._pinned.onScroll) window.removeEventListener('scroll', this._pinned.onScroll, { capture: false }); } catch {}
      try { if (this._pinned.onResize) window.removeEventListener('resize', this._pinned.onResize, { capture: false }); } catch {}
      // Throttle via rAF
      let rafId = null;
      const onScroll = () => { if (rafId) cancelAnimationFrame(rafId); rafId = requestAnimationFrame(reposition); };
      const onResize = () => { if (rafId) cancelAnimationFrame(rafId); rafId = requestAnimationFrame(reposition); };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize);
      this._pinned.onScroll = onScroll;
      this._pinned.onResize = onResize;

      // Show now
      reposition();
    } catch {}
  }

  /** Unpin the icon and restore normal hover behavior */
  unpinIcon() {
    try {
      if (!this._pinned) return;
      try { if (this._pinned.onScroll) window.removeEventListener('scroll', this._pinned.onScroll); } catch {}
      try { if (this._pinned.onResize) window.removeEventListener('resize', this._pinned.onResize); } catch {}
      this._pinned.onScroll = null;
      this._pinned.onResize = null;
      this._pinned.paragraphEl = null;
      this._pinned.active = false;
      // Hide if not hovering any paragraph
      this._scheduleHideIcon();
    } catch {}
  }

  // ---------- tuning ----------

  setMinProbabilityThreshold(threshold) {
    this.minProbabilityThreshold = Math.min(1, Math.max(0, threshold));
    printl?.(`📊 Min probability threshold set to: ${this.minProbabilityThreshold}`);
  }

  setContextWindow(windowSize) {
    this.contextWindow = Math.min(50, Math.max(5, windowSize));
    printl?.(`🔍 Context window set to: ${this.contextWindow} words`);
  }

  // ---------- cleanup ----------
  destroy() {
    clearInterval(this._stateInterval);
    this.disableParagraphNavigation();
  }
}
