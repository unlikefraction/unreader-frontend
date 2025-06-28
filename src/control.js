import rough from 'roughjs';

/**
 * Class to manage drawing annotations on the document
 */
class DrawingTools {
  /**
   * @param {object} options
   * @param {string} options.selector - CSS selector for tool buttons
   * @param {number} options.strokeWidth - default stroke width for shapes
   * @param {number} options.roughness - default roughness for shapes
   */
  constructor({ selector = '.w-control', strokeWidth = 2, roughness = 3 }) {
    this.selector = selector;
    this.strokeWidth = strokeWidth;
    this.roughness = roughness;

    this.tools = Array.from(document.querySelectorAll(this.selector));
    this.activeTool = this.tools.find(t => t.classList.contains('active')) || null;
    this.isDrawing = false;
    this.startXRel = 0;
    this.startY = 0;
    this.currentSeed = null;

    this.shapesData = { rectangle: [], ellipse: [], line: [], arrow: [] };

    // Create and configure canvases
    this.drawCanvas = document.createElement('canvas');
    this.previewCanvas = document.createElement('canvas');
    [this.drawCanvas, this.previewCanvas].forEach(c => {
      Object.assign(c.style, {
        position: 'absolute', top: '0', left: '0',
        zIndex: '-1', pointerEvents: 'none'
      });
      document.body.appendChild(c);
    });
    this.drawCtx = this.drawCanvas.getContext('2d');
    this.previewCtx = this.previewCanvas.getContext('2d');
    this.drawRough = rough.canvas(this.drawCanvas);
    this.previewRough = rough.canvas(this.previewCanvas);
  }

  /** Initialize event listeners and sizing */
  init() {
    window.addEventListener('resize', () => this.redrawAll());
    window.addEventListener('load', () => this.sizeCanvases());
    this.sizeCanvases();

    this.tools.forEach(tool =>
      tool.addEventListener('click', () => this.setActiveTool(tool))
    );

    ['mousedown', 'mousemove', 'mouseup'].forEach(evt =>
      document.addEventListener(evt, e => {
        this.handleRectangle(evt, e);
        this.handleEllipse(evt, e);
        this.handleLine(evt, e);
        this.handleArrow(evt, e);
      })
    );
  }

  /** Resize canvases to document dimensions */
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

  /** Clear and redraw all stored shapes */
  redrawAll() {
    this.sizeCanvases();
    this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
    const zeroX = this.getZeroXPoint();

    this.shapesData.rectangle.forEach(r => {
      this.drawRough.rectangle(zeroX + r.xRel, r.y, r.widthRel, r.height, {
        stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed: r.seed
      });
    });

    this.shapesData.ellipse.forEach(e => {
      const w = Math.abs(e.widthRel);
      const h = Math.abs(e.height);
      const cx = zeroX + e.xRel + e.widthRel / 2;
      const cy = e.y + e.height / 2;
      this.drawRough.ellipse(cx, cy, w, h, {
        stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed: e.seed
      });
    });

    this.shapesData.line.forEach(l => {
      const x1 = zeroX + l.x1Rel;
      const y1 = l.y1;
      const x2 = zeroX + l.x2Rel;
      const y2 = l.y2;
      this.drawRough.line(x1, y1, x2, y2, {
        stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed: l.seed
      });
    });

    this.shapesData.arrow.forEach(a => {
      const x1 = zeroX + a.x1Rel;
      const y1 = a.y1;
      const x2 = zeroX + a.x2Rel;
      const y2 = a.y2;
      this.drawRough.line(x1, y1, x2, y2, {
        stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed: a.seed
      });
      this._drawArrowHead(x1, y1, x2, y2, a.seed);
    });
  }

  /** Persist to localStorage */
  save() {
    localStorage.setItem('annotations', JSON.stringify(this.shapesData));
  }

  /** Compute relative coords */
  computeCoords(e) {
    return { xRel: e.clientX - this.getZeroXPoint(), y: e.pageY };
  }

  /** X-axis zero offset */
  getZeroXPoint() {
    return window.innerWidth / 2 - 325;
  }

  /** Activate a tool */
  setActiveTool(tool) {
    if (tool === this.activeTool) return;
    this.tools.forEach(t => t.classList.remove('active'));
    tool.classList.add('active');
    this.activeTool = tool;
    const drawTools = ['rectangle', 'circle', 'line', 'arrow'];
    const isDraw = drawTools.some(cls => tool.classList.contains(cls));
    document.body.style.cursor = isDraw ? 'crosshair' : 'default';
  }

  /** Rectangle drawing */
  handleRectangle(type, e) {
    if (!this.activeTool?.classList.contains('rectangle')) return;
    const { xRel, y } = this.computeCoords(e);
    this._genericDraw(type, xRel, y,
      (x1, y1, x2, y2, seed) => {
        this.previewRough.rectangle(this.getZeroXPoint() + x1, y1, x2 - x1, y2 - y1, { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed });
      },
      (x1, y1, x2, y2, seed) => {
        this.shapesData.rectangle.push({ xRel: x1, y: y1, widthRel: x2 - x1, height: y2 - y1, seed });
        this.drawRough.rectangle(this.getZeroXPoint() + x1, y1, x2 - x1, y2 - y1, { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed });
      }
    );
  }

  /** Ellipse drawing */
  handleEllipse(type, e) {
    if (!this.activeTool?.classList.contains('circle')) return;
    const { xRel, y } = this.computeCoords(e);
    this._genericDraw(type, xRel, y,
      (x1, y1, x2, y2, seed) => {
        const cx = this.getZeroXPoint() + x1 + (x2 - x1) / 2;
        const cy = y1 + (y2 - y1) / 2;
        this.previewRough.ellipse(cx, cy, Math.abs(x2 - x1), Math.abs(y2 - y1), { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed });
      },
      (x1, y1, x2, y2, seed) => {
        this.shapesData.ellipse.push({ xRel: x1, y: y1, widthRel: x2 - x1, height: y2 - y1, seed });
        const cx = this.getZeroXPoint() + x1 + (x2 - x1) / 2;
        const cy = y1 + (y2 - y1) / 2;
        this.drawRough.ellipse(cx, cy, Math.abs(x2 - x1), Math.abs(y2 - y1), { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed });
      }
    );
  }

  /** Line drawing */
  handleLine(type, e) {
    if (!this.activeTool?.classList.contains('line')) return;
    const { xRel, y } = this.computeCoords(e);
    this._genericDraw(type, xRel, y,
      (x1, y1, x2, y2, seed) => {
        this.previewRough.line(this.getZeroXPoint() + x1, y1, this.getZeroXPoint() + x2, y2, { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed });
      },
      (x1, y1, x2, y2, seed) => {
        this.shapesData.line.push({ x1Rel: x1, y1, x2Rel: x2, y2, seed });
        this.drawRough.line(this.getZeroXPoint() + x1, y1, this.getZeroXPoint() + x2, y2, { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed });
      }
    );
  }

  /** Arrow drawing */
  handleArrow(type, e) {
    if (!this.activeTool?.classList.contains('arrow')) return;
    const { xRel, y } = this.computeCoords(e);
    this._genericDraw(type, xRel, y,
      (x1, y1, x2, y2, seed) => {
        this.previewRough.line(this.getZeroXPoint() + x1, y1, this.getZeroXPoint() + x2, y2, { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed });
        this._previewArrowHead(x1, y1, x2, y2, seed);
      },
      (x1, y1, x2, y2, seed) => {
        this.shapesData.arrow.push({ x1Rel: x1, y1, x2Rel: x2, y2, seed });
        this.drawRough.line(this.getZeroXPoint() + x1, y1, this.getZeroXPoint() + x2, y2, { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed });
        this._drawArrowHead(x1, y1, x2, y2, seed);
      }
    );
  }

  /** Generic draw lifecycle helper */
  _genericDraw(type, xRel, y, previewFn, finalizeFn) {
    if (type === 'mousedown') {
      this.isDrawing = true;
      this.startXRel = xRel;
      this.startY = y;
      this.currentSeed = Math.floor(Math.random() * 10000) + 1;
      document.body.style.userSelect = 'none';

    } else if (type === 'mousemove' && this.isDrawing) {
      this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
      previewFn(this.startXRel, this.startY, xRel, y, this.currentSeed);

    } else if (type === 'mouseup' && this.isDrawing) {
      this.isDrawing = false;
      document.body.style.userSelect = 'auto';
      this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
      finalizeFn(this.startXRel, this.startY, xRel, y, this.currentSeed);
      this.save();
      const cursor = this.tools.find(t => t.classList.contains('cursor'));
      if (cursor) this.setActiveTool(cursor);
    }
  }

  /** Draw arrow head on permanent canvas */
  _drawArrowHead(x1, y1, x2, y2, seed) {
    const zeroX = this.getZeroXPoint();
    const dx = (x2 - x1);
    const dy = (y2 - y1);
    const angle = Math.atan2(dy, dx);
    const length = Math.hypot(dx, dy) * 0.2;
    [angle - Math.PI / 6, angle + Math.PI / 6].forEach(wing => {
      const x3 = zeroX + x2 - length * Math.cos(wing);
      const y3 = y2 - length * Math.sin(wing);
      this.drawRough.line(zeroX + x2, y2, x3, y3, {
        stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed
      });
    });
  }

  /** Preview arrow head */
  _previewArrowHead(x1, y1, x2, y2, seed) {
    const zeroX = this.getZeroXPoint();
    const dx = (x2 - x1);
    const dy = (y2 - y1);
    const angle = Math.atan2(dy, dx);
    const length = Math.hypot(dx, dy) * 0.2;
    [angle - Math.PI / 6, angle + Math.PI / 6].forEach(wing => {
      const x3 = zeroX + x2 - length * Math.cos(wing);
      const y3 = y2 - length * Math.sin(wing);
      this.previewRough.line(zeroX + x2, y2, x3, y3, {
        stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed
      });
    });
  }
}

// Instantiate with custom strokeWidth & roughness
window.addEventListener('DOMContentLoaded', () => {
  const drawer = new DrawingTools({ selector: '.w-control', strokeWidth: 2, roughness: 2 });
  drawer.init();
});
