// -----read-along.js-----------
/**
 * Read-along functionality and text positioning (singleton).
 */
export class ReadAlong {
  static _instance = null;

  static get(highlighter) {
    if (!ReadAlong._instance) {
      ReadAlong._instance = new ReadAlong(highlighter);
    } else if (highlighter) {
      ReadAlong._instance.rebindHighlighter(highlighter);
    }
    return ReadAlong._instance;
  }

  constructor(highlighter) {
    // DO NOT call this directly; use ReadAlong.get()
    this.highlighter      = highlighter;

    // read-along state
    this.isActive         = true;
    this.thresholdPx      = 200;    // ±200px = 400px total band
    this.isUserScrolling  = false;
    this.scrollTimeout    = null;

    // heightSetter (draggable line) state
    this.heightSetter     = null;
    this.isDragging       = false;
    this.startY           = 0;
    this.startTop         = 0;

    // one-time UI bindings
    this._bindUI();
  }

  // ---------- UI binding (one-time) ----------
  _bindUI() {
    // heightSetter
    this.heightSetter = document.getElementById('heightSetter');
    if (!this.heightSetter) {
      printError?.('heightSetter element not found');
    } else {
      if (!this.heightSetter.style.top) this.heightSetter.style.top = '50%';
      this._setupHeightSetterDragging();
    }

    // read-along toggle control
    const ctrl = document.querySelector('.read-along.control');
    if (!ctrl) {
      printError?.('Read-along control not found');
    } else {
      this._onCtrlClick = () => this.toggle();
      ctrl.addEventListener('click', this._onCtrlClick);
    }

    // scroll detection
    this._boundOnScroll = this.onScroll.bind(this);
    window.addEventListener('scroll', this._boundOnScroll, { passive: true });
  }

  _setupHeightSetterDragging() {
    if (!this.heightSetter) return;

    const startDrag = (clientY, e) => {
      this.isDragging = true;
      this.startY     = clientY;
      this.startTop   = this.getCurrentTopPercent();
      if (e.type.startsWith('mouse')) {
        this.heightSetter.style.cursor = 'grabbing';
        e.preventDefault();
      }
    };
    const onDrag = (clientY, e) => {
      if (!this.isDragging) return;
      const deltaY       = clientY - this.startY;
      const vpHeight     = window.innerHeight;
      const deltaPercent = (deltaY / vpHeight) * 100;
      this.setTopPercent(this.startTop + deltaPercent);
      if (e.type.startsWith('touch')) e.preventDefault();
    };
    const endDrag = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.heightSetter.style.cursor = 'grab';
    };

    this._onMouseMove  = e => onDrag(e.clientY, e);
    this._onMouseUp    = endDrag;
    this._onTouchMove  = e => onDrag(e.touches[0].clientY, e);
    this._onTouchEnd   = endDrag;

    this.heightSetter.addEventListener('mousedown', e => startDrag(e.clientY, e));
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup',   this._onMouseUp);

    this.heightSetter.addEventListener('touchstart', e => startDrag(e.touches[0].clientY, e));
    document.addEventListener('touchmove',  this._onTouchMove, { passive: false });
    document.addEventListener('touchend',   this._onTouchEnd);
  }

  // ---------- logic ----------
  onScroll() {
    if (!this.isUserScrolling) this.isUserScrolling = true;

    const wordEl = this.highlighter?.currentHighlightedWord;
    if (this.isActive && wordEl) {
      const rect = wordEl.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        this.setReadAlongActive(false);
      }
    }

    clearTimeout(this.scrollTimeout);
    this.scrollTimeout = setTimeout(() => this.onScrollEnd(), 250);
  }

  onScrollEnd() {
    this.isUserScrolling = false;
    this.evaluateReadAlongState();
  }

  evaluateReadAlongState() {
    const wordEl = this.highlighter?.currentHighlightedWord;
    if (!this.heightSetter || !wordEl) return;

    const rect      = wordEl.getBoundingClientRect();
    const vpHeight  = window.innerHeight;
    const linePct   = this.getCurrentTopPercent();
    const lineY     = (linePct / 100) * vpHeight;
    const diff      = rect.top - lineY;

    if (Math.abs(diff) <= this.thresholdPx) this.setReadAlongActive(true);
    else this.setReadAlongActive(false);
  }

  setReadAlongActive(active) {
    if (this.isActive === active) return;
    this.isActive = active;

    const ctrl = document.querySelector('.read-along.control');
    if (ctrl) ctrl.classList.toggle('active', active);

    printl?.(`📖 Read-along ${active ? 'enabled' : 'disabled'}`);

    if (active && this.highlighter?.currentHighlightedWord) {
      this.updateTextPosition();
    }
  }

  getCurrentTopPercent() {
    if (!this.heightSetter) return 50;
    return parseFloat((this.heightSetter.style.top || '50%').replace('%',''));
  }

  setTopPercent(pct) {
    if (!this.heightSetter) return;
    const clamped = Math.max(10, Math.min(90, pct));
    this.heightSetter.style.top = `${clamped}%`;
    if (this.isActive && this.highlighter?.currentHighlightedWord) {
      this.updateTextPosition();
    }
  }

  toggle() {
    this.setReadAlongActive(!this.isActive);
  }

  updateTextPosition() {
    if (!this.isActive || this.isUserScrolling || !this.highlighter?.currentHighlightedWord || !this.heightSetter) return;

    const rect     = this.highlighter.currentHighlightedWord.getBoundingClientRect();
    const vpHeight = window.innerHeight;
    const linePct  = this.getCurrentTopPercent();
    const targetY  = (linePct / 100) * vpHeight;
    const currentY = rect.top + window.scrollY;
    const scrollTo = currentY - targetY;

    window.scrollTo({ top: scrollTo, behavior: 'smooth' });
  }

  onWordHighlighted() {
    if (!this.isActive) this.evaluateReadAlongState();
    else this.updateTextPosition();
  }

  rebindHighlighter(highlighter) {
    this.highlighter = highlighter;
  }

  destroy() {
    if (this._boundOnScroll) window.removeEventListener('scroll', this._boundOnScroll);
    if (this._onMouseMove) document.removeEventListener('mousemove', this._onMouseMove);
    if (this._onMouseUp)   document.removeEventListener('mouseup', this._onMouseUp);
    if (this._onTouchMove) document.removeEventListener('touchmove', this._onTouchMove);
    if (this._onTouchEnd)  document.removeEventListener('touchend', this._onTouchEnd);
  }
}
