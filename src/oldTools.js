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
   * @param {object} options.highlightOptions - customization for highlighter
   */
  constructor({
    selector = '.w-control',
    strokeWidth = 2,
    roughness = 3,
    pencilOptions = {},
    highlightOptions = {}
  }) {
    this.selector = selector;
    this.strokeWidth = strokeWidth;
    this.roughness = roughness;

    // Pencil settings
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

    // Highlighter settings
    this.highlightOptions = Object.assign(
      {
        size: 35,
        smoothing: 0.5,
        thinning: 0.1,
        streamline: 0.5,
        easing: t => t,
        start: { taper: 0, cap: true },
        end: { taper: 0, cap: true },
        color: '#FFE500',
        opacity: 0.5
      },
      highlightOptions
    );

    // Tool buttons
    this.tools = Array.from(document.querySelectorAll(this.selector));
    this.activeTool = this.tools.find(t => t.classList.contains('active')) || null;

    // Flags and state
    this.isDrawing = false;
    this.isErasing = false;
    this.currentPoints = [];
    this.textClickArmed = false;
    this.erasedShapeIds = new Set();

    // Shape storage
    this.shapesData = {
      rectangle: [],
      ellipse: [],
      line: [],
      arrow: [],
      pencil: [],
      highlighter: [],
      text: []
    };

    // Create canvases for drawing + preview
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

    // Custom eraser-following cursor
    this.eraserCursor = document.createElement('div');
    this.eraserCursor.classList.add('eraser-mouse');
    Object.assign(this.eraserCursor.style, {
      position: 'absolute',
      pointerEvents: 'none',
      display: 'none'
    });
    document.body.appendChild(this.eraserCursor);
  }

  /** Initialize event listeners and sizing */
  init() {
    // Load saved annotations first
    this.load();
    
    window.addEventListener('resize', () => {
      this.sizeCanvases();
      this.redrawAll();
    });
    
    window.addEventListener('load', () => {
      this.sizeCanvases();
      this.redrawAll(); // Redraw after window loads to ensure proper sizing
    });
    
    this.sizeCanvases();
    
    // Initial draw of loaded shapes - delay slightly to ensure DOM is ready
    setTimeout(() => this.redrawAll(), 10);

    // Tool button clicks
    this.tools.forEach(tool =>
      tool.addEventListener('click', () => this.setActiveTool(tool))
    );

    // Add clear all functionality (optional)
    window.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Shift + C to clear all annotations
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        if (confirm('Clear all annotations?')) {
          this.clearAll();
        }
      }
    });

    // Tool button clicks
    this.tools.forEach(tool =>
      tool.addEventListener('click', () => this.setActiveTool(tool))
    );

    // Also update the eraser events
    ['mousedown', 'mousemove', 'mouseup'].forEach(evt =>
      document.addEventListener(evt, e => {
        // Skip erasing if clicking on tool buttons
        if (evt === 'mousedown' && this._isClickOnTool(e)) return;
        
        this.handleEraser(evt, e);
      })
    );

    // Move custom eraser cursor
    document.addEventListener('mousemove', e => {
      if (this.activeTool?.classList.contains('eraser')) {
        this.eraserCursor.style.display = 'block';
        this.eraserCursor.style.left = `${e.pageX}px`;
        this.eraserCursor.style.top = `${e.pageY}px`;
      } else {
        this.eraserCursor.style.display = 'none';
      }
    });

    // Update text click handler
    document.addEventListener('click', e => {
      if (!this.activeTool?.classList.contains('text')) return;
      if (this._isClickOnTool(e)) return; // Skip if clicking on tools
      
      if (!this.textClickArmed) {
        this.textClickArmed = true;
        return;
      }
      this._createTextEditor(e);
    });

    // Shape drawing events
    ['mousedown', 'mousemove', 'mouseup'].forEach(evt =>
      document.addEventListener(evt, e => {
        // Skip drawing if clicking on tool buttons
        if (evt === 'mousedown' && this._isClickOnTool(e)) return;
        
        this.handleRectangle(evt, e);
        this.handleEllipse(evt, e);
        this.handleLine(evt, e);
        this.handleArrow(evt, e);
        this.handlePencil(evt, e);
        this.handleHighlight(evt, e);
      })
    );
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

  /** Clear & redraw everything */
  redrawAll() {
    document.querySelectorAll('.annotation-text-editor.completed').forEach(el => el.remove());
    this.sizeCanvases();
    this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
    const zeroX = this.getZeroXPoint();

    // helper to fade flagged shapes
    const runDraw = (id, drawFn) => {
      if (this.isErasing && this.erasedShapeIds.has(id)) {
        this.drawCtx.save();
        this.drawCtx.globalAlpha = 0.2;
      }
      drawFn();
      if (this.isErasing && this.erasedShapeIds.has(id)) {
        this.drawCtx.restore();
      }
    };

    // rectangles
    this.shapesData.rectangle.forEach((r, i) => {
      const id = `rectangle-${i}`;
      runDraw(id, () => {
        this.drawRough.rectangle(
          zeroX + r.xRel, r.y,
          r.widthRel, r.height,
          { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed: r.seed }
        );
      });
    });

    // ellipses
    this.shapesData.ellipse.forEach((e, i) => {
      const id = `ellipse-${i}`;
      runDraw(id, () => {
        const w = Math.abs(e.widthRel), h = Math.abs(e.height);
        const cx = zeroX + e.xRel + e.widthRel/2;
        const cy = e.y + e.height/2;
        this.drawRough.ellipse(
          cx, cy, w, h,
          { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed: e.seed }
        );
      });
    });

    // lines
    this.shapesData.line.forEach((l, i) => {
      const id = `line-${i}`;
      runDraw(id, () => {
        this.drawRough.line(
          zeroX + l.x1Rel, l.y1,
          zeroX + l.x2Rel, l.y2,
          { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed: l.seed }
        );
      });
    });

    // arrows
    this.shapesData.arrow.forEach((a, i) => {
      const id = `arrow-${i}`;
      runDraw(id, () => {
        this.drawRough.line(
          zeroX + a.x1Rel, a.y1,
          zeroX + a.x2Rel, a.y2,
          { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed: a.seed }
        );
        this._drawArrowHead(a.x1Rel, a.y1, a.x2Rel, a.y2, a.seed);
      });
    });

    // pencil
    this.shapesData.pencil.forEach((p, i) => {
      const id = `pencil-${i}`;
      runDraw(id, () => {
        const raw = p.points.map(pt => [pt.xRel, pt.y]);
        const stroke = getStroke(raw, p.options);
        const poly = stroke.map(([x,y]) => [zeroX + x, y]);
        this.drawCtx.beginPath();
        poly.forEach(([px,py], j) => j ? this.drawCtx.lineTo(px,py) : this.drawCtx.moveTo(px,py));
        this.drawCtx.closePath();
        this.drawCtx.fillStyle = 'black';
        this.drawCtx.fill();
      });
    });

    // highlighter
    this.shapesData.highlighter.forEach((h, i) => {
      const id = `highlighter-${i}`;
      runDraw(id, () => {
        const raw = h.points.map(pt => [pt.xRel, pt.y]);
        const stroke = getStroke(raw, h.options);
        const poly = stroke.map(([x,y]) => [zeroX + x, y]);
        this.drawCtx.beginPath();
        poly.forEach(([px,py], j) => j ? this.drawCtx.lineTo(px,py) : this.drawCtx.moveTo(px,py));
        this.drawCtx.closePath();
        this.drawCtx.fillStyle = this._hexToRgba(h.options.color, h.options.opacity);
        this.drawCtx.fill();
      });
    });

    // text
    this.shapesData.text.forEach((t, i) => {
      const id = `text-${i}`;
      const div = document.createElement('div');
      div.innerText = t.text;
      div.classList.add('annotation-text-editor', 'completed');
      div.setAttribute('data-text-id', id); // Add ID for eraser tracking
      
      // Calculate rotation based on horizontal position
      const centerX = window.innerWidth / 2;
      const textX = zeroX + t.xRel;
      const maxDistance = window.innerWidth / 2; // Distance from center to edge
      const distanceFromCenter = textX - centerX;
      // Map distance to rotation: -30deg (left) to +30deg (right)
      const rotation = (distanceFromCenter / maxDistance) * 30;
      const clampedRotation = Math.max(-30, Math.min(30, rotation));
      
      Object.assign(div.style, {
        position: 'absolute',
        left: `${textX}px`,
        top: `${t.y}px`,
        display: 'inline-block',
        padding: '4px',
        background: 'transparent',
        pointerEvents: 'none',
        zIndex: '-1000',
        fontSize: '24px',
        transform: `rotate(${clampedRotation}deg)`,
        transformOrigin: 'left center',
        // Apply fading if this text is flagged for erasing
        opacity: (this.isErasing && this.erasedShapeIds.has(id)) ? '0.2' : '1'
      });
      document.body.appendChild(div);
    });
  }

  /** Persist shapesData */
  save() {
    localStorage.setItem('annotations', JSON.stringify(this.shapesData));
  }

  /** Load shapesData from localStorage */
  load() {
    try {
      const saved = localStorage.getItem('annotations');
      if (saved) {
        this.shapesData = JSON.parse(saved);
        // Ensure all shape types exist in case new types were added
        const defaultShapes = {
          rectangle: [],
          ellipse: [],
          line: [],
          arrow: [],
          pencil: [],
          highlighter: [],
          text: []
        };
        this.shapesData = Object.assign(defaultShapes, this.shapesData);
      }
    } catch (error) {
      console.warn('Failed to load annotations from localStorage:', error);
      // Reset to default if corrupted
      this.shapesData = {
        rectangle: [],
        ellipse: [],
        line: [],
        arrow: [],
        pencil: [],
        highlighter: [],
        text: []
      };
    }
  }

  /** Raw event → relative coords */
  computeCoords(e) {
    return { xRel: e.clientX - this.getZeroXPoint(), y: e.pageY };
  }

  /** X-axis zero offset for centering */
  getZeroXPoint() {
    return window.innerWidth/2 - 325;
  }

  /** Tool switch & reset flags */
  setActiveTool(tool) {
    if (tool === this.activeTool) return;
    this.tools.forEach(t => t.classList.remove('active'));
    tool.classList.add('active');
    this.activeTool = tool;

    this.textClickArmed = false;
    this.erasedShapeIds.clear();

    const drawTools = ['rectangle','circle','line','arrow','pencil','highlighter','text','eraser'];
    document.body.style.cursor = drawTools.some(c => tool.classList.contains(c)) ? 'crosshair' : 'default';
  }

  // Add this helper method to check if click is on a tool button
  _isClickOnTool(e) {
    return e.target.closest(this.selector) !== null;
  }

  /** Get proper bounding box for any shape */
  _getShapeBounds(type, shape) {
    const padding = 10; // Extra padding around shapes
    
    if (type === 'rectangle') {
      const x1 = shape.xRel;
      const y1 = shape.y;
      const x2 = shape.xRel + shape.widthRel;
      const y2 = shape.y + shape.height;
      return {
        minX: Math.min(x1, x2) - padding,
        maxX: Math.max(x1, x2) + padding,
        minY: Math.min(y1, y2) - padding,
        maxY: Math.max(y1, y2) + padding
      };
    }
    
    if (type === 'ellipse') {
      const x1 = shape.xRel;
      const y1 = shape.y;
      const x2 = shape.xRel + shape.widthRel;
      const y2 = shape.y + shape.height;
      return {
        minX: Math.min(x1, x2) - padding,
        maxX: Math.max(x1, x2) + padding,
        minY: Math.min(y1, y2) - padding,
        maxY: Math.max(y1, y2) + padding
      };
    }
    
    if (type === 'line') {
      return {
        minX: Math.min(shape.x1Rel, shape.x2Rel) - padding,
        maxX: Math.max(shape.x1Rel, shape.x2Rel) + padding,
        minY: Math.min(shape.y1, shape.y2) - padding,
        maxY: Math.max(shape.y1, shape.y2) + padding
      };
    }
    
    if (type === 'arrow') {
      // Include arrow head in bounds calculation
      const dx = shape.x2Rel - shape.x1Rel;
      const dy = shape.y2 - shape.y1;
      const angle = Math.atan2(dy, dx);
      const len = Math.hypot(dx, dy) * 0.2;
      
      // Calculate arrow head points
      const head1X = shape.x2Rel - len * Math.cos(angle - Math.PI/6);
      const head1Y = shape.y2 - len * Math.sin(angle - Math.PI/6);
      const head2X = shape.x2Rel - len * Math.cos(angle + Math.PI/6);
      const head2Y = shape.y2 - len * Math.sin(angle + Math.PI/6);
      
      const allX = [shape.x1Rel, shape.x2Rel, head1X, head2X];
      const allY = [shape.y1, shape.y2, head1Y, head2Y];
      
      return {
        minX: Math.min(...allX) - padding,
        maxX: Math.max(...allX) + padding,
        minY: Math.min(...allY) - padding,
        maxY: Math.max(...allY) + padding
      };
    }
    
    if (type === 'pencil' || type === 'highlighter') {
      const allX = shape.points.map(p => p.xRel);
      const allY = shape.points.map(p => p.y);
      return {
        minX: Math.min(...allX) - padding,
        maxX: Math.max(...allX) + padding,
        minY: Math.min(...allY) - padding,
        maxY: Math.max(...allY) + padding
      };
    }
    
    if (type === 'text') {
      const textWidth = shape.text.length * 12; // Approximate character width
      const textHeight = 24; // Font size
      return {
        minX: shape.xRel - padding,
        maxX: shape.xRel + textWidth + padding,
        minY: shape.y - padding,
        maxY: shape.y + textHeight + padding
      };
    }
    
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  /** Eraser logic with fading on hover */
  handleEraser(type, e) {
    if (!this.activeTool?.classList.contains('eraser')) return;
    const { xRel, y } = this.computeCoords(e);

    if (type === 'mousedown') {
      this.isErasing = true;
      this.erasedShapeIds.clear();
      document.body.style.userSelect = 'none';

    } else if (type === 'mousemove' && this.isErasing) {
      // redraw to apply fading
      this.redrawAll();

      // detect shapes under cursor using proper bounding boxes
      this.previewCtx.clearRect(0,0,this.previewCanvas.width,this.previewCanvas.height);
      Object.entries(this.shapesData).forEach(([kind, arr]) =>
        arr.forEach((shape, idx) => {
          const id = `${kind}-${idx}`;
          if (!this.erasedShapeIds.has(id) && this._pointInShapeBounds(kind, shape, xRel, y)) {
            this.erasedShapeIds.add(id);
          }
        })
      );

      // preview overlay
      this.erasedShapeIds.forEach(id => {
        const [kind, idx] = id.split('-');
        this._drawShapePreview(kind, this.shapesData[kind][idx], 0.2);
      });

    } else if (type === 'mouseup' && this.isErasing) {
      this.isErasing = false;
      document.body.style.userSelect = 'auto';
      this.previewCtx.clearRect(0,0,this.previewCanvas.width,this.previewCanvas.height);

      // remove flagged shapes
      Object.keys(this.shapesData).forEach(kind => {
        this.shapesData[kind] = this.shapesData[kind].filter((_, i) => !this.erasedShapeIds.has(`${kind}-${i}`));
      });
      this.erasedShapeIds.clear();
      this.save();
      this.redrawAll();

      const cursor = this.tools.find(t => t.classList.contains('cursor'));
      if (cursor) this.setActiveTool(cursor);
    }
  }

  /** Hit-test using proper bounding boxes */
  _pointInShapeBounds(type, shape, x, y) {
    const bounds = this._getShapeBounds(type, shape);
    return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
  }

  /** Hit-test a point against various shape types (keeping original for fallback) */
  _pointInShape(type, shape, x, y) {
    return this._pointInShapeBounds(type, shape, x, y);
  }

  /** Draw faded preview of a shape */
  _drawShapePreview(type, shape, opacity) {
    const zeroX = this.getZeroXPoint();
    this.previewCtx.save();
    this.previewCtx.globalAlpha = opacity;
    if (type === 'rectangle') {
      this.previewRough.rectangle(
        zeroX + shape.xRel, shape.y,
        shape.widthRel, shape.height,
        { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed: shape.seed }
      );
    } else if (type === 'ellipse') {
      const w = Math.abs(shape.widthRel), h = Math.abs(shape.height);
      const cx = zeroX + shape.xRel + shape.widthRel/2;
      const cy = shape.y + shape.height/2;
      this.previewRough.ellipse(
        cx, cy, w, h,
        { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed: shape.seed }
      );
    } else if (type === 'line') {
      this.previewRough.line(
        zeroX + shape.x1Rel, shape.y1,
        zeroX + shape.x2Rel, shape.y2,
        { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed: shape.seed }
      );
    } else if (type === 'arrow') {
      this.previewRough.line(
        zeroX + shape.x1Rel, shape.y1,
        zeroX + shape.x2Rel, shape.y2,
        { stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed: shape.seed }
      );
      this._previewArrowHead(shape.x1Rel, shape.y1, shape.x2Rel, shape.y2, shape.seed);
    } else if (type === 'pencil' || type === 'highlighter') {
      const raw = shape.points.map(pt => [pt.xRel, pt.y]);
      const stroke = getStroke(raw, shape.options);
      const poly = stroke.map(([x,y]) => [zeroX + x, y]);
      this.previewCtx.beginPath();
      poly.forEach(([px,py], i) => i ? this.previewCtx.lineTo(px,py) : this.previewCtx.moveTo(px,py));
      this.previewCtx.closePath();
      this.previewCtx.fillStyle = type==='highlighter'
        ? this._hexToRgba(shape.options.color, shape.options.opacity)
        : 'black';
      this.previewCtx.fill();
    }
    // Note: Text fading is now handled directly in redrawAll() by setting DOM element opacity
    this.previewCtx.restore();
  }

  /** Rectangle drawing */
  handleRectangle(type, e) {
    if (!this.activeTool?.classList.contains('rectangle')) return;
    const { xRel, y } = this.computeCoords(e);
    this._genericDraw(
      type, xRel, y,
      (x1,y1,x2,y2,seed) => {
        this.previewRough.rectangle(
          this.getZeroXPoint()+x1, y1, x2-x1, y2-y1,
          { stroke:'black', strokeWidth:this.strokeWidth, roughness:this.roughness, seed }
        );
      },
      (x1,y1,x2,y2,seed) => {
        this.shapesData.rectangle.push({ xRel:x1, y:y1, widthRel:x2-x1, height:y2-y1, seed });
        this.drawRough.rectangle(
          this.getZeroXPoint()+x1, y1, x2-x1, y2-y1,
          { stroke:'black', strokeWidth:this.strokeWidth, roughness:this.roughness, seed }
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
      (x1,y1,x2,y2,seed) => {
        const cx = this.getZeroXPoint()+x1+(x2-x1)/2;
        const cy = y1+(y2-y1)/2;
        this.previewRough.ellipse(
          cx, cy, Math.abs(x2-x1), Math.abs(y2-y1),
          { stroke:'black', strokeWidth:this.strokeWidth, roughness:this.roughness, seed }
        );
      },
      (x1,y1,x2,y2,seed) => {
        this.shapesData.ellipse.push({ xRel:x1, y:y1, widthRel:x2-x1, height:y2-y1, seed });
        const cx = this.getZeroXPoint()+x1+(x2-x1)/2;
        const cy = y1+(y2-y1)/2;
        this.drawRough.ellipse(
          cx, cy, Math.abs(x2-x1), Math.abs(y2-y1),
          { stroke:'black', strokeWidth:this.strokeWidth, roughness:this.roughness, seed }
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
      (x1,y1,x2,y2,seed) => {
        this.previewRough.line(
          this.getZeroXPoint()+x1, y1,
          this.getZeroXPoint()+x2, y2,
          { stroke:'black', strokeWidth:this.strokeWidth, roughness:this.roughness, seed }
        );
      },
      (x1,y1,x2,y2,seed) => {
        this.shapesData.line.push({ x1Rel:x1, y1, x2Rel:x2, y2, seed });
        this.drawRough.line(
          this.getZeroXPoint()+x1, y1,
          this.getZeroXPoint()+x2, y2,
          { stroke:'black', strokeWidth:this.strokeWidth, roughness:this.roughness, seed }
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
      (x1,y1,x2,y2,seed) => {
        this.previewRough.line(
          this.getZeroXPoint()+x1, y1,
          this.getZeroXPoint()+x2, y2,
          { stroke:'black', strokeWidth:this.strokeWidth, roughness:this.roughness, seed }
        );
        this._previewArrowHead(x1, y1, x2, y2, seed);
      },
      (x1,y1,x2,y2,seed) => {
        this.shapesData.arrow.push({ x1Rel:x1, y1, x2Rel:x2, y2, seed });
        this.drawRough.line(
          this.getZeroXPoint()+x1, y1,
          this.getZeroXPoint()+x2, y2,
          { stroke:'black', strokeWidth:this.strokeWidth, roughness:this.roughness, seed }
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
    this._handleFreehand(
      type, e, 'highlighter',
      this.highlightOptions,
      this.highlightOptions.color,
      this.highlightOptions.opacity
    );
  }

  /** Generic freehand helper - Updated to not auto-switch tools */
  _handleFreehand(type, e, dataKey, options, color, opacity) {
    const { xRel, y } = this.computeCoords(e);
    const zeroX = this.getZeroXPoint();

    if (type === 'mousedown') {
      this.isDrawing = true;
      this.currentPoints = [{ xRel, y }];
      document.body.style.userSelect = 'none';
    } else if (type === 'mousemove' && this.isDrawing) {
      this.currentPoints.push({ xRel, y });
      this.previewCtx.clearRect(0,0,this.previewCanvas.width,this.previewCanvas.height);
      const raw = this.currentPoints.map(pt => [pt.xRel, pt.y]);
      const stroke = getStroke(raw, options);
      const poly = stroke.map(([x,y]) => [zeroX + x, y]);
      this.previewCtx.beginPath();
      poly.forEach(([px,py], i) => i ? this.previewCtx.lineTo(px,py) : this.previewCtx.moveTo(px,py));
      this.previewCtx.closePath();
      this.previewCtx.fillStyle = dataKey==='highlighter' ? this._hexToRgba(color, opacity) : color;
      this.previewCtx.fill();
    } else if (type === 'mouseup' && this.isDrawing) {
      this.isDrawing = false;
      document.body.style.userSelect = 'auto';
      this.previewCtx.clearRect(0,0,this.previewCanvas.width,this.previewCanvas.height);

      this.shapesData[dataKey].push({ points: this.currentPoints, options });
      const raw = this.currentPoints.map(pt => [pt.xRel, pt.y]);
      const stroke = getStroke(raw, options);
      const poly = stroke.map(([x,y]) => [zeroX + x, y]);
      this.drawCtx.beginPath();
      poly.forEach(([px,py], i) => i ? this.drawCtx.lineTo(px,py) : this.drawCtx.moveTo(px,py));
      this.drawCtx.closePath();
      this.drawCtx.fillStyle = dataKey==='highlighter' ? this._hexToRgba(color, opacity) : color;
      this.drawCtx.fill();

      this.save();
      // Removed the auto-switch to cursor tool - tools stay active for continuous drawing
    }
  }

  /** Generic draw lifecycle helper */
  _genericDraw(type, xRel, y, previewFn, finalizeFn) {
    if (type === 'mousedown') {
      this.isDrawing = true;
      this.startXRel = xRel;
      this.startY = y;
      this.currentSeed = Math.floor(Math.random()*10000)+1;
      document.body.style.userSelect = 'none';
    } else if (type === 'mousemove' && this.isDrawing) {
      this.previewCtx.clearRect(0,0,this.previewCanvas.width,this.previewCanvas.height);
      previewFn(this.startXRel, this.startY, xRel, y, this.currentSeed);
    } else if (type === 'mouseup' && this.isDrawing) {
      this.isDrawing = false;
      document.body.style.userSelect = 'auto';
      this.previewCtx.clearRect(0,0,this.previewCanvas.width,this.previewCanvas.height);
      finalizeFn(this.startXRel, this.startY, xRel, y, this.currentSeed);
      this.save();
      const cursor = this.tools.find(t => t.classList.contains('cursor'));
      if (cursor) this.setActiveTool(cursor);
    }
  }

  /** Draw arrow head */
  _drawArrowHead(x1, y1, x2, y2, seed) {
    const zeroX = this.getZeroXPoint();
    const dx = x2 - x1; const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);
    const len = Math.hypot(dx, dy) * 0.2;
    [angle - Math.PI/6, angle + Math.PI/6].forEach(wing => {
      const x3 = zeroX + x2 - len * Math.cos(wing);
      const y3 = y2 - len * Math.sin(wing);
      this.drawRough.line(zeroX + x2, y2, x3, y3, {
        stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed
      });
    });
  }

  /** Preview arrow head */
  _previewArrowHead(x1, y1, x2, y2, seed) {
    const zeroX = this.getZeroXPoint();
    const dx = x2 - x1; const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);
    const len = Math.hypot(dx, dy) * 0.2;
    [angle - Math.PI/6, angle + Math.PI/6].forEach(wing => {
      const x3 = zeroX + x2 - len * Math.cos(wing);
      const y3 = y2 - len * Math.sin(wing);
      this.previewRough.line(zeroX + x2, y2, x3, y3, {
        stroke: 'black', strokeWidth: this.strokeWidth, roughness: this.roughness, seed
      });
    });
  }

  /** Hex to RGBA */
  _hexToRgba(hex, alpha) {
    const bigint = parseInt(hex.replace('#',''), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /** Create editable text box */
  _createTextEditor(e) {
    const x = e.clientX; const y = e.pageY; const zeroX = this.getZeroXPoint();
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.classList.add('annotation-text-editor','editing');
    
    // Calculate rotation based on horizontal position
    const centerX = window.innerWidth / 2;
    const maxDistance = window.innerWidth / 2;
    const distanceFromCenter = x - centerX;
    const rotation = (distanceFromCenter / maxDistance) * 30;
    const clampedRotation = Math.max(-30, Math.min(30, rotation));
    
    Object.assign(el.style, {
      position: 'absolute', 
      left: `${x}px`, 
      top: `${y}px`, 
      display: 'inline-block', 
      padding: '4px', 
      border: 'none', 
      outline: 'none', 
      background: 'rgba(255,255,255,0.8)', 
      zIndex: '-1000', 
      fontSize: '24px',
      transform: `rotate(${clampedRotation}deg)`,
      transformOrigin: 'left center'
    });
    document.body.appendChild(el);
    el.focus();
    el.addEventListener('keydown', ev => { if (ev.key==='Enter') { ev.preventDefault(); el.blur(); }});
    el.addEventListener('blur', () => {
      const xRel = x - zeroX;
      // Save the exact same Y coordinate as the editor
      this.shapesData.text.push({ xRel, y: y, text: el.innerText });
      this.save();
      el.remove();
      this.redrawAll();
      const cursor = this.tools.find(t=>t.classList.contains('cursor'));
      if (cursor) this.setActiveTool(cursor);
    });
  }

  /** Clear all annotations */
  clearAll() {
    this.shapesData = {
      rectangle: [],
      ellipse: [],
      line: [],
      arrow: [],
      pencil: [],
      highlighter: [],
      text: []
    };
    this.save();
    this.redrawAll();
  }
}

// Instantiate with highlight and eraser support
window.addEventListener('DOMContentLoaded', () => {
  const drawer = new DrawingTools({ selector: '.w-control', strokeWidth: 2, roughness: 2 });
  window.drawer = drawer
  drawer.init();
});