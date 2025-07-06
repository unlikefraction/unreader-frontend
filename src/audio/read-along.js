/**
 * Read-along functionality and text positioning
 */
export class ReadAlong {
    constructor(highlighter) {
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
  
      this.setupHeightSetter();
      this.setupReadAlongControl();
      this.setupScrollDetection();
    }
  
    /** Listen for scroll and debounce end */
    setupScrollDetection() {
      window.addEventListener('scroll', this.onScroll.bind(this), { passive: true });
    }
  
    onScroll() {
      // mark that user is actively scrolling
      if (!this.isUserScrolling) this.isUserScrolling = true;
  
      // immediate disable if highlighted word goes completely off-screen
      const wordEl = this.highlighter.currentHighlightedWord;
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
  
    /** After scrolling stops, decide if we re-enable or disable */
    evaluateReadAlongState() {
      const wordEl = this.highlighter.currentHighlightedWord;
      if (!this.heightSetter || !wordEl) return;
  
      const rect      = wordEl.getBoundingClientRect();
      const vpHeight  = window.innerHeight;
      const linePct   = this.getCurrentTopPercent();
      const lineY     = (linePct / 100) * vpHeight;
      const diff      = rect.top - lineY;
  
      if (Math.abs(diff) <= this.thresholdPx) {
        this.setReadAlongActive(true);
      } else {
        this.setReadAlongActive(false);
      }
    }
  
    /**
     * Toggle read-along on/off,
     * update UI, and snap when enabling.
     */
    setReadAlongActive(active) {
      if (this.isActive === active) return;
      this.isActive = active;
  
      const ctrl = document.querySelector('.read-along.control');
      if (ctrl) ctrl.classList.toggle('active', active);
  
      console.log(`📖 Read-along ${active ? 'enabled' : 'disabled'}`);
  
      // If enabling and we have a word, scroll to it
      if (active && this.highlighter.currentHighlightedWord) {
        this.updateTextPosition();
      }
    }
  
    /** Build & position the draggable heightSetter line */
    setupHeightSetter() {
      this.heightSetter = document.getElementById('heightSetter');
      if (!this.heightSetter) {
        console.warn('heightSetter element not found');
        return;
      }
      if (!this.heightSetter.style.top) {
        this.heightSetter.style.top = '50%';
      }
      this.setupHeightSetterDragging();
    }
  
    setupHeightSetterDragging() {
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
  
      this.heightSetter.addEventListener('mousedown', e => startDrag(e.clientY, e));
      document.addEventListener('mousemove', e => onDrag(e.clientY, e));
      document.addEventListener('mouseup',   endDrag);
  
      this.heightSetter.addEventListener('touchstart', e => startDrag(e.touches[0].clientY, e));
      document.addEventListener('touchmove',  e => onDrag(e.touches[0].clientY, e), { passive: false });
      document.addEventListener('touchend',   endDrag);
    }
  
    /** Read setter’s current top in % */
    getCurrentTopPercent() {
      if (!this.heightSetter) return 50;
      return parseFloat((this.heightSetter.style.top || '50%').replace('%',''));
    }
  
    /** Move setter (clamped 10–90%) and, if active, reflow text */
    setTopPercent(pct) {
      if (!this.heightSetter) return;
      const clamped = Math.max(10, Math.min(90, pct));
      this.heightSetter.style.top = `${clamped}%`;
      if (this.isActive && this.highlighter.currentHighlightedWord) {
        this.updateTextPosition();
      }
    }
  
    /** Click UI to manually toggle read-along */
    setupReadAlongControl() {
      const ctrl = document.querySelector('.read-along.control');
      if (!ctrl) {
        console.warn('Read-along control not found');
        return;
      }
      ctrl.addEventListener('click', () => this.toggle());
    }
  
    toggle() {
      this.setReadAlongActive(!this.isActive);
    }
  
    /**
     * Scroll so that the highlighted word sits at the setter line.
     */
    updateTextPosition() {
      if (!this.isActive ||
          this.isUserScrolling ||
          !this.highlighter.currentHighlightedWord ||
          !this.heightSetter) {
        return;
      }
      const rect     = this.highlighter.currentHighlightedWord.getBoundingClientRect();
      const vpHeight = window.innerHeight;
      const linePct  = this.getCurrentTopPercent();
      const targetY  = (linePct / 100) * vpHeight;
      const currentY = rect.top + window.scrollY;
      const scrollTo = currentY - targetY;
  
      window.scrollTo({
        top:      scrollTo,
        behavior: 'smooth'
      });
    }
  
    /** Called whenever highlighting moves to a new word */
    onWordHighlighted() {
      if (!this.isActive) {
        this.evaluateReadAlongState();
      } else {
        this.updateTextPosition();
      }
    }
  }