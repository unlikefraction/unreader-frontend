import rough from 'roughjs';

/**
 * Canvas manager for a single band (draw + preview) positioned at an
 * ABSOLUTE top in page coordinates. It also keeps a normalized "topOffset"
 * if upstream code wants it, but CSS positioning always uses _absTop.
 */
export class CanvasManager {
  constructor({ topOffset = 0, height = 0, bg = '' } = {}) {
    this.topOffset = Math.max(0, topOffset | 0); // kept for compatibility (normalized if you want)
    this.height = Math.max(0, height | 0);
    this.bg = bg;

    this._absTop = this.topOffset; // absolute page Y used for CSS top

    this.drawCanvas = null;
    this.previewCanvas = null;
    this.drawCtx = null;
    this.previewCtx = null;
    this.drawRough = null;
    this.previewRough = null;

    this._setupCanvases();
  }

  getCanvasElement() {
    // prefer preview for hit-testing; either works (same size/position)
    return this.previewCanvas || this.drawCanvas;
  }

  _setupCanvases() {
    this.drawCanvas = document.createElement('canvas');
    this.previewCanvas = document.createElement('canvas');

    [this.drawCanvas, this.previewCanvas].forEach(c => {
      Object.assign(c.style, {
        position: 'absolute',
        left: '0',
        top: `${this._absTop}px`,
        pointerEvents: 'none',
        zIndex: '-1', // behind selectable DOM
        background: this.bg || 'transparent'
      });
      document.body.appendChild(c);
    });

    this.drawCtx = this.drawCanvas.getContext('2d');
    this.previewCtx = this.previewCanvas.getContext('2d');
    this.drawRough = rough.canvas(this.drawCanvas);
    this.previewRough = rough.canvas(this.previewCanvas);

    this.sizeCanvases();
  }

  /** Resize canvases to full document width and fixed band height */
  sizeCanvases() {
    const doc = document.documentElement;
    const body = document.body;
    const width = Math.max(doc.scrollWidth, body.scrollWidth, doc.clientWidth);

    [this.drawCanvas, this.previewCanvas].forEach(c => {
      c.width = width;
      c.height = Math.max(1, this.height);
      c.style.top = `${this._absTop}px`;   // ABSOLUTE
      c.style.width = `${width}px`;
      c.style.height = `${this.height}px`;
    });
  }

  /** Legacy: update with normalized offset (kept for compatibility) */
  updateTopAndHeight(topOffset, height) {
    this.topOffset = Math.max(0, topOffset | 0);
    if (typeof height === 'number') this.height = Math.max(0, height | 0);
    // DO NOT change _absTop here; absolute update must call updateAbsoluteTopAndHeight
    this.sizeCanvases();
    this.clearPreview();
    this.clearDraw();
  }

  /** New: update with ABSOLUTE page Y */
  updateAbsoluteTopAndHeight(absTop, height) {
    this._absTop = Math.max(0, absTop | 0);
    this.height = Math.max(0, height | 0);
    this.sizeCanvases();
    this.clearPreview();
    this.clearDraw();
  }

  clearPreview() {
    if (!this.previewCtx) return;
    this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
  }

  clearDraw() {
    if (!this.drawCtx) return;
    this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
  }

  destroy() {
    try { this.drawCanvas?.remove(); } catch {}
    try { this.previewCanvas?.remove(); } catch {}
    this.drawCanvas = this.previewCanvas = null;
    this.drawCtx = this.previewCtx = null;
    this.drawRough = this.previewRough = null;
  }
}
