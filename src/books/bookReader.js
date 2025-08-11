// -----bookReader.js------
import { AudioSystem } from './audioAndTextGen.js';

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/^[a-z]+:\/\/+/i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

function cloneForCleanHandlers(el) {
  if (!el) return null;
  const clone = el.cloneNode(true);
  el.replaceWith(clone);
  return clone;
}

export class MultiPageReader {
  constructor(pages, { autoPlayFirst = true } = {}) {
    this.pages = pages;
    this.instances = [];
    this.active = -1;
    this.autoPlayFirst = autoPlayFirst;
    this._boundAdvanceHandlers = new WeakMap();
    this._controlsBound = false;
    this._paragraphClicksBound = false;
  }

  async init() {
    for (let i = 0; i < this.pages.length; i++) {
      const p = this.pages[i];
      const sys = new AudioSystem(p.audioFile, p.timingFile, p.textFile, p.offsetMs ?? 0);

      const key = p.pageKey ?? `page-${i}-${Date.now()}-${Math.random()}`;
      sys.textProcessor.pageId = slugify(key);

      await sys.init();

      // paragraph nav ON on every page
      sys.enableParagraphNavigation?.();

      // ensure nothing is playing
      try {
        sys.audioCore.pauseAudio();
        sys.highlighter.stopHighlighting();
      } catch {}

      const onEnd = () => this.next(true);
      sys.audioCore.onEnd(onEnd);
      this._boundAdvanceHandlers.set(sys, onEnd);

      this.instances.push(sys);
    }

    this._setupGlobalControls();
    this._setupGlobalParagraphClickDelegation();

    // set page 0 active initially
    this.setActive(0);
    if (this.autoPlayFirst) await this.play();
  }

  // ---------- helpers ----------
  #pageEl(i) {
    return this.instances[i]?.textProcessor?.container || null;
  }

  // two-state styling: Completed (before), Remaining (after). Active has neither.
  #applyPageStateClasses(activeIndex) {
    for (let i = 0; i < this.instances.length; i++) {
      const el = this.#pageEl(i);
      if (!el) continue;
      el.classList.remove('pageCompleted', 'pageRemaining');
      if (i < activeIndex) el.classList.add('pageCompleted');
      else if (i > activeIndex) el.classList.add('pageRemaining');
    }
  }

  #markCurrentCompleted() {
    const el = this.#pageEl(this.active);
    if (el) {
      el.classList.remove('pageRemaining');
      el.classList.add('pageCompleted');
    }
  }

  #resetPageToUnread(i) {
    const sys = this.instances[i];
    const el = this.#pageEl(i);
    if (el) {
      el.classList.remove('pageCompleted');
      el.classList.add('pageRemaining');
    }
    try {
      sys.audioCore.pauseAudio();
      sys.audioCore.sound?.seek(0);
      sys.highlighter.handleSeek(0);
      sys.highlighter.stopHighlighting();
      sys.clearHighlights();
    } catch {}
  }

  #resetFutureFrom(index) {
    for (let i = index; i < this.instances.length; i++) {
      this.#resetPageToUnread(i);
    }
  }

  // Ensure we have a valid active page; if not, select first.
  ensureActive() {
    if (this.active < 0 || !this.instances[this.active]) {
      this.setActive(0);
    }
  }

  // ---------- activation ----------
  setActive(i) {
    if (i < 0 || i >= this.instances.length) return;

    // pause all others
    for (let k = 0; k < this.instances.length; k++) {
      const sys = this.instances[k];
      if (k !== i) {
        sys.highlighter.stopHighlighting();
        sys.audioCore.pauseAudio();
      }
    }

    const sys = this.instances[i];
    sys.arm?.();
    this.active = i;

    this.#applyPageStateClasses(this.active);
    this._syncPlayButton();
  }

  getActive() { return this.active; }

  // ---------- transport ----------
  async play() {
    this.ensureActive();
    if (this.active < 0) return;

    // make absolutely sure only one audio runs
    for (let k = 0; k < this.instances.length; k++) {
      if (k !== this.active) this.instances[k].audioCore.pauseAudio();
    }

    await this.instances[this.active].play();
    this._syncPlayButton(true);
  }

  pause() {
    this.ensureActive();
    if (this.active < 0) return;
    this.instances[this.active].pause();
    this._syncPlayButton(false);
  }

  toggle() {
    this.ensureActive();
    if (this.active < 0) return;

    // pause others first
    for (let k = 0; k < this.instances.length; k++) {
      if (k !== this.active) this.instances[k].audioCore.pauseAudio();
    }
    this.instances[this.active].toggle();
    setTimeout(() => this._syncPlayButton(), 0);
  }

  forward(seconds = 10) {
    this.ensureActive();
    if (this.active < 0) return;
    const s = this.instances[this.active].audioCore.getCurrentTime();
    this.seek(s + seconds);
  }

  rewind(seconds = 10) {
    this.ensureActive();
    if (this.active < 0) return;
    const s = this.instances[this.active].audioCore.getCurrentTime();
    this.seek(Math.max(0, s - seconds));
  }

  seek(seconds) {
    this.ensureActive();
    if (this.active < 0) return;
    const sys = this.instances[this.active];
    sys.audioCore.sound?.seek(seconds);
    sys.highlighter.handleSeek(seconds);
  }

  setSpeed(speed) {
    this.ensureActive();
    if (this.active < 0) return;
    this.instances[this.active].setSpeed(speed);
  }

  getCurrentTime() { return this.active < 0 ? 0 : this.instances[this.active].getCurrentTime(); }
  getDuration()    { return this.active < 0 ? 0 : this.instances[this.active].getDuration(); }

  // ---------- paging ----------
  async next(auto = false) {
    this.ensureActive();
    if (this.active >= this.instances.length - 1) {
      const sys = this.instances[this.active];
      sys.highlighter.handleAudioEnd(sys.getDuration());
      this.#markCurrentCompleted();
      this.#applyPageStateClasses(this.active);
      this._syncPlayButton(false);
      return;
    }
    if (auto) this.#markCurrentCompleted();
    const target = this.active + 1;
    this.setActive(target);
    if (auto) await this.play();
  }

  async prev() {
    this.ensureActive();
    if (this.active <= 0) return;
    const target = this.active - 1;
    this.setActive(target);
    await this.play();
  }

  async goto(index, { play = true } = {}) {
    if (index < 0 || index >= this.instances.length) return;

    if (index < this.active) {
      this.#resetFutureFrom(index);
    } else if (index > this.active) {
      for (let i = 0; i < index; i++) {
        const el = this.#pageEl(i);
        if (el) { el.classList.remove('pageRemaining'); el.classList.add('pageCompleted'); }
      }
    }
    this.setActive(index);
    if (play) await this.play();
  }

  async jumpToParagraph(pageIndex, paragraphText, { minProbability = 0.35, play = true } = {}) {
    if (pageIndex < 0 || pageIndex >= this.instances.length) return;

    if (pageIndex < this.active) {
      this.#resetFutureFrom(pageIndex);
    } else if (pageIndex > this.active) {
      for (let i = 0; i < pageIndex; i++) {
        const el = this.#pageEl(i);
        if (el) { el.classList.remove('pageRemaining'); el.classList.add('pageCompleted'); }
      }
    }

    this.setActive(pageIndex);

    const sys = this.instances[pageIndex];
    const res = await sys.seekToParagraph(paragraphText, { minProbability });
    if (play) await this.play();
    return res;
  }

  // ---------- paragraph click delegation ----------
  _setupGlobalParagraphClickDelegation() {
    if (this._paragraphClicksBound) return;

    document.addEventListener(
      'click',
      async (e) => {
        const chip = e.target?.closest?.('.paragraph-hover-nav');
        if (!chip) return;

        const pageId = chip.dataset.pageId;
        const paraText = chip.dataset.paragraphText;
        if (!pageId || !paraText) return;

        const idx = this.instances.findIndex(sys => sys?.textProcessor?.pageId === pageId);
        if (idx === -1) return;

        e.preventDefault();
        await this.jumpToParagraph(idx, paraText, { minProbability: 0.35, play: true });
      },
      { capture: true }
    );

    this._paragraphClicksBound = true;
  }

  // ---------- global controls ----------
  _setupGlobalControls() {
    if (this._controlsBound) return;

    const playBtn   = cloneForCleanHandlers(document.querySelector('.playButton'));
    const rewindBtn = cloneForCleanHandlers(document.querySelector('.rewind'));
    const fwdBtn    = cloneForCleanHandlers(document.querySelector('.forward'));

    if (playBtn)   playBtn.addEventListener('click', () => this.toggle());
    if (rewindBtn) rewindBtn.addEventListener('click', () => this.rewind());
    if (fwdBtn)    fwdBtn.addEventListener('click', () => this.forward());

    const playBack = document.querySelector('.playBack');
    if (playBack) {
      const slider = playBack.querySelector('.slider');
      const thumb  = playBack.querySelector('.thumb');
      const value  = playBack.querySelector('.thumb .value');

      const cleanThumb  = cloneForCleanHandlers(thumb);
      const cleanSlider = cloneForCleanHandlers(slider);

      const getRect = () => cleanSlider.getBoundingClientRect();
      function widthToSpeed(widthPercent) {
        const s = 0.5 + ((widthPercent - 40) / 60) * 1.5;
        return Math.round(s * 10) / 10;
      }
      function speedToWidth(speed) {
        return 40 + ((speed - 0.5) / 1.5) * 60;
      }
      const setSpeedUI = (s) => {
        const width = speedToWidth(Math.max(0.5, Math.min(2.0, s)));
        cleanThumb.style.width = width + '%';
        if (value) value.textContent = s.toFixed(1);
      };
      setSpeedUI(1.0);

      const onPoint = (clientX) => {
        const rect = getRect();
        const pctRaw = ((clientX - rect.left) / rect.width) * 100;
        const pct = Math.max(40, Math.min(100, pctRaw - 7));
        const spd = widthToSpeed(pct);
        setSpeedUI(spd);
        this.setSpeed(spd);
      };

      let dragging = false;
      const onDown = (clientX, e) => { dragging = true; e?.preventDefault?.(); onPoint(clientX); };
      const onMove = (clientX, e) => { if (!dragging) return; e?.preventDefault?.(); onPoint(clientX); };
      const onUp   = () => { dragging = false; };

      cleanThumb.addEventListener('mousedown', e => onDown(e.clientX, e));
      cleanSlider.addEventListener('mousedown', e => onDown(e.clientX, e));
      document.addEventListener('mousemove', e => onMove(e.clientX, e));
      document.addEventListener('mouseup', onUp);

      cleanThumb.addEventListener('touchstart', e => onDown(e.touches[0].clientX, e), { passive: false });
      cleanSlider.addEventListener('touchstart', e => onDown(e.touches[0].clientX, e), { passive: false });
      document.addEventListener('touchmove', e => onMove(e.touches[0].clientX, e), { passive: false });
      document.addEventListener('touchend', onUp);
    }

    this._controlsBound = true;
  }

  _syncPlayButton(forcePlaying) {
    const playButton = document.querySelector('.playButton');
    const icon = playButton?.querySelector('i');
    const playing = typeof forcePlaying === 'boolean'
      ? forcePlaying
      : (this.active >= 0 && this.instances[this.active].audioCore.isPlaying);

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

  destroy() {
    for (const sys of this.instances) {
      try {
        const onEnd = this._boundAdvanceHandlers.get(sys);
        if (onEnd) { /* no off() api */ }
        sys.destroy();
      } catch (e) {
        printError?.('Destroy error:', e);
      }
    }
    this.instances = [];
    this.active = -1;
  }
}

// Example boot
const reader = new MultiPageReader([
  { audioFile: '/audio/suckAtReading_1.wav', timingFile: '/order/word_timings_ordered_1.json', textFile: '/transcript/landing_1.html', offsetMs: -100, pageKey: 'chapter-1' },
  { audioFile: '/audio/suckAtReading_2.wav', timingFile: '/order/word_timings_ordered_2.json', textFile: '/transcript/landing_2.html', offsetMs: -100, pageKey: 'chapter-2' },
  { audioFile: '/audio/suckAtReading_3.wav', timingFile: '/order/word_timings_ordered_3.json', textFile: '/transcript/landing_3.html', offsetMs: -100, pageKey: 'chapter-3' }
], { autoPlayFirst: false });

await reader.init();
window.reader = reader;
