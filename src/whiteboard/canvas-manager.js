import rough from 'roughjs';

/**
 * Canvas manager for drawing and preview canvases
 */
export class CanvasManager {
  constructor() {
    this.drawCanvas = null;
    this.previewCanvas = null;
    this.drawCtx = null;
    this.previewCtx = null;
    this.drawRough = null;
    this.previewRough = null;
    
    this.setupCanvases();
  }

  /** Create canvases for drawing + preview */
  setupCanvases() {
    this.drawCanvas = document.createElement('canvas');
    this.previewCanvas = document.createElement('canvas');
    
    [this.drawCanvas, this.previewCanvas].forEach(c => {
      Object.assign(c.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        zIndex: '-1',
        pointerEvents: 'none'
      });
      document.body.appendChild(c);
    });
    
    this.drawCtx = this.drawCanvas.getContext('2d');
    this.previewCtx = this.previewCanvas.getContext('2d');
    this.drawRough = rough.canvas(this.drawCanvas);
    this.previewRough = rough.canvas(this.previewCanvas);
  }

  /** Resize canvases to cover the full document */
  sizeCanvases() {
    const doc = document.documentElement;
    const body = document.body;
    const width = Math.max(doc.scrollWidth, body.scrollWidth, doc.clientWidth);
    const height = Math.max(doc.scrollHeight, body.scrollHeight, doc.clientHeight);
    
    [this.drawCanvas, this.previewCanvas].forEach(c => {
      c.width = width;
      c.height = height;
    });
  }

  /** Clear preview canvas */
  clearPreview() {
    this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
  }

  /** Clear draw canvas */
  clearDraw() {
    this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
  }
}