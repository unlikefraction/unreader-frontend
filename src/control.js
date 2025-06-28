import rough from 'roughjs';
import { getStroke } from 'perfect-freehand';

/**
 * Class to manage drawing annotations on the document
 */
class DrawingTools {
  /**
   * @param {object} options
   * @param {string} options.selector - CSS selector for tool buttons
   * @param {number} options.strokeWidth - default stroke width for shapes
   * @param {number} options.roughness - default roughness for shapes
   * @param {object} options.pencilOptions - customization for pencil stroke
   */
  constructor({ selector = '.w-control', strokeWidth = 2, roughness = 3, pencilOptions = {}, highlightOptions = {} }) {
    this.selector = selector;
    this.strokeWidth = strokeWidth;
    this.roughness = roughness;

    // Default pencil settings, merged with any overrides
    this.pencilOptions = Object.assign(
      {
        size: 8,
        smoothing: 0.5,
        thinning: 0.5,
        streamline: 0.5,
        easing: t => t,
        start: { taper: 0, cap: true },
        end: { taper: 0, cap: true }
      },
      pencilOptions
    );

    // Default highlight settings
    this.highlightOptions = Object.assign(
      {
        size: 35,
        smoothing: 0.5,
        thinning: 0.1,
        streamline: 0.5,
        easing: t => t,
        start: { taper: 0, cap: true },
        end: { taper: 0, cap: true },
        color: '#26de81',
        opacity: 0.4
      },
      highlightOptions
    );

    
    this.tools = Array.from(document.querySelectorAll(this.selector));
    this.activeTool = this.tools.find(t => t.classList.contains('active')) || null;
    this.isDrawing = false;
    this.currentPoints = [];

    // Store shape data
    this.shapesData = {
      rectangle: [], ellipse: [], line: [], arrow: [], pencil: [], highlighter: []
    };

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
        this.handlePencil(evt, e);
        this.handleHighlight(evt, e);
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

    // Rectangles
    this.shapesData.rectangle.forEach(r => {
      this.drawRough.rectangle(
        zeroX + r.xRel, r.y, r.widthRel, r.height,
        { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed: r.seed }
      );
    });

    // Ellipses
    this.shapesData.ellipse.forEach(e => {
      const w = Math.abs(e.widthRel);
      const h = Math.abs(e.height);
      const cx = zeroX + e.xRel + e.widthRel / 2;
      const cy = e.y + e.height / 2;
      this.drawRough.ellipse(
        cx, cy, w, h,
        { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed: e.seed }
      );
    });

    // Lines
    this.shapesData.line.forEach(l => {
      this.drawRough.line(
        zeroX + l.x1Rel, l.y1,
        zeroX + l.x2Rel, l.y2,
        { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed: l.seed }
      );
    });

    // Arrows
    this.shapesData.arrow.forEach(a => {
      this.drawRough.line(
        zeroX + a.x1Rel, a.y1,
        zeroX + a.x2Rel, a.y2,
        { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed: a.seed }
      );
      this._drawArrowHead(a.x1Rel, a.y1, a.x2Rel, a.y2, a.seed);
    });

    // Pencil redraw
    this.shapesData.pencil.forEach(p => {
      const raw = p.points.map(pt => [pt.xRel, pt.y]);
      const stroke = getStroke(raw, p.options);
      const polygon = stroke.map(([x, y]) => [zeroX + x, y]);
      this.drawCtx.beginPath();
      polygon.forEach(([px, py], i) => i ? this.drawCtx.lineTo(px, py) : this.drawCtx.moveTo(px, py));
      this.drawCtx.closePath();
      this.drawCtx.fillStyle = 'black';
      this.drawCtx.fill();
    });

    // Highlight redraw
    this.shapesData.highlighter.forEach(h => {
      const raw = h.points.map(pt => [pt.xRel, pt.y]);
      const stroke = getStroke(raw, h.options);
      const polygon = stroke.map(([x, y]) => [zeroX + x, y]);
      this.drawCtx.beginPath();
      polygon.forEach(([px, py], i) => i ? this.drawCtx.lineTo(px, py) : this.drawCtx.moveTo(px, py));
      this.drawCtx.closePath();
      this.drawCtx.fillStyle = this._hexToRgba(h.options.color, h.options.opacity);
      this.drawCtx.fill();
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
    const drawTools = ['rectangle', 'circle', 'line', 'arrow', 'pencil', 'highlighter'];
    document.body.style.cursor = drawTools.some(cls => tool.classList.contains(cls)) ? 'crosshair' : 'default';
  }

  /** Rectangle drawing */
  handleRectangle(type, e) {
    if (!this.activeTool?.classList.contains('rectangle')) return;
    const { xRel, y } = this.computeCoords(e);
    this._genericDraw(
      type, xRel, y,
      (x1, y1, x2, y2, seed) => {
        this.previewRough.rectangle(
          this.getZeroXPoint() + x1, y1, x2 - x1, y2 - y1,
          { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed }
        );
      },
      (x1, y1, x2, y2, seed) => {
        this.shapesData.rectangle.push({ xRel: x1, y: y1, widthRel: x2 - x1, height: y2 - y1, seed });
        this.drawRough.rectangle(
          this.getZeroXPoint() + x1, y1, x2 - x1, y2 - y1,
          { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed }
        );
      }
    );
  }

  /** Ellipse drawing */
  handleEllipse(type, e) {
    if (!this.activeTool?.classList.contains('circle')) return;
    const { xRel, y } = this.computeCoords(e);
    this._genericDraw(
      type, xRel, y,
      (x1, y1, x2, y2, seed) => {
        const cx = this.getZeroXPoint() + x1 + (x2 - x1) / 2;
        const cy = y1 + (y2 - y1) / 2;
        this.previewRough.ellipse(
          cx, cy, Math.abs(x2 - x1), Math.abs(y2 - y1),
          { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed }
        );
      },
      (x1, y1, x2, y2, seed) => {
        this.shapesData.ellipse.push({ xRel: x1, y: y1, widthRel: x2 - x1, height: y2 - y1, seed });
        const cx = this.getZeroXPoint() + x1 + (x2 - x1) / 2;
        const cy = y1 + (y2 - y1) / 2;
        this.drawRough.ellipse(
          cx, cy, Math.abs(x2 - x1), Math.abs(y2 - y1),
          { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed }
        );
      }
    );
  }

  /** Line drawing */
  handleLine(type, e) {
    if (!this.activeTool?.classList.contains('line')) return;
    const { xRel, y } = this.computeCoords(e);
    this._genericDraw(
      type, xRel, y,
      (x1, y1, x2, y2, seed) => {
        this.previewRough.line(
          this.getZeroXPoint() + x1, y1,
          this.getZeroXPoint() + x2, y2,
          { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed }
        );
      },
      (x1, y1, x2, y2, seed) => {
        this.shapesData.line.push({ x1Rel: x1, y1, x2Rel: x2, y2, seed });
        this.drawRough.line(
          this.getZeroXPoint() + x1, y1,
          this.getZeroXPoint() + x2, y2,
          { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed }
        );
      }
    );
  }

  /** Arrow drawing */
  handleArrow(type, e) {
    if (!this.activeTool?.classList.contains('arrow')) return;
    const { xRel, y } = this.computeCoords(e);
    this._genericDraw(
      type, xRel, y,
      (x1, y1, x2, y2, seed) => {
        this.previewRough.line(
          this.getZeroXPoint() + x1, y1,
          this.getZeroXPoint() + x2, y2,
          { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed }
        );
        this._previewArrowHead(x1, y1, x2, y2, seed);
      },
      (x1, y1, x2, y2, seed) => {
        this.shapesData.arrow.push({ x1Rel: x1, y1, x2Rel: x2, y2, seed });
        this.drawRough.line(
          this.getZeroXPoint() + x1, y1,
          this.getZeroXPoint() + x2, y2,
          { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed }
        );
        this._drawArrowHead(x1, y1, x2, y2, seed);
      }
    );
  }

  /** Pencil (freehand) drawing */
  handlePencil(type, e) {
    if (!this.activeTool?.classList.contains('pencil')) return;
    this._handleFreehand(type, e, 'pencil', this.pencilOptions, 'black', 1);
  }

  /** Highlight drawing */
  handleHighlight(type, e) {
    if (!this.activeTool?.classList.contains('highlighter')) return;
    this._handleFreehand(type, e, 'highlighter', this.highlightOptions, this.highlightOptions.color, this.highlightOptions.opacity);
  }

  /** Generic freehand helper */
  _handleFreehand(type, e, dataKey, options, color, opacity) {
    const { xRel, y } = this.computeCoords(e);
    const zeroX = this.getZeroXPoint();

    if (type === 'mousedown') {
      this.isDrawing = true;
      this.currentPoints = [{ xRel, y }];
      document.body.style.userSelect = 'none';
    } else if (type === 'mousemove' && this.isDrawing) {
      this.currentPoints.push({ xRel, y });
      this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
      const raw = this.currentPoints.map(pt => [pt.xRel, pt.y]);
      const stroke = getStroke(raw, options);
      const polygon = stroke.map(([sx, sy]) => [zeroX + sx, sy]);

      this.previewCtx.beginPath();
      polygon.forEach(([px, py], i) => i ? this.previewCtx.lineTo(px, py) : this.previewCtx.moveTo(px, py));
      this.previewCtx.closePath();
      this.previewCtx.fillStyle = dataKey === 'highlighter' ? this._hexToRgba(color, opacity) : color;
      this.previewCtx.fill();
    } else if (type === 'mouseup' && this.isDrawing) {
      this.isDrawing = false;
      document.body.style.userSelect = 'auto';
      this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
      this.shapesData[dataKey].push({ points: this.currentPoints, options });

      // Draw permanent
      const raw = this.currentPoints.map(pt => [pt.xRel, pt.y]);
      const stroke = getStroke(raw, options);
      const polygon = stroke.map(([sx, sy]) => [zeroX + sx, sy]);

      this.drawCtx.beginPath();
      polygon.forEach(([px, py], i) => i ? this.drawCtx.lineTo(px, py) : this.drawCtx.moveTo(px, py));
      this.drawCtx.closePath();
      this.drawCtx.fillStyle = dataKey === 'highlighter' ? this._hexToRgba(color, opacity) : color;
      this.drawCtx.fill();

      this.save();
      const cursor = this.tools.find(t => t.classList.contains('cursor'));
      if (cursor) this.setActiveTool(cursor);
    }
  }

  /** Convert hex & alpha to rgba string */
  _hexToRgba(hex, alpha) {
    const bigint = parseInt(hex.replace('#',''), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
    const dx = x2 - x1;
    const dy = y2 - y1;
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
    const dx = x2 - x1;
    const dy = y2 - y1;
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

// Instantiate with highlight support
window.addEventListener('DOMContentLoaded', () => {
  const drawer = new DrawingTools({ selector: '.w-control', strokeWidth: 2, roughness: 2 });
  drawer.init();
});
