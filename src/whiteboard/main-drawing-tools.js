import { commonVars } from '../common-vars.js';
import { CanvasManager } from './canvas-manager.js';
import { saveShapesData, loadShapesData, clearAllShapesData } from './storage.js';
import { redrawAll } from './renderer.js';
import { handleRectangle } from './tools/rectangle-tools.js';
import { handleEllipse } from './tools/elipse-tool.js';
import { handleLine } from './tools/line-tool.js';
import { handleArrow, drawArrowHead, previewArrowHead } from './tools/arrow-tool.js';
import { handlePencil, handleFreehand } from './tools/pencil-tool.js';
import { handleHighlight } from './tools/highlighter-tool.js';
import { handleText, createTextEditor } from './tools/text-tool.js';
import { handleEraser } from './tools/eraser-tool.js';
import { isClickOnTool, hexToRgba } from './utils.js';
import { initSelectionHandler } from './selection.js';

/**
 * Class to manage drawing annotations on the document
 */
export class DrawingTools {
  static _mouseListenersAdded = false;

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
  } = {}) {
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
    this.shapesData = loadShapesData();

    // Create canvas manager
    this.canvasManager = new CanvasManager();

    initSelectionHandler(this);


    // Custom eraser-following cursor
    this.eraserCursor = document.createElement('div');
    this.eraserCursor.classList.add('eraser-mouse');
    Object.assign(this.eraserCursor.style, {
      position: 'absolute',
      pointerEvents: 'none',
      display: 'none'
    });
    document.body.appendChild(this.eraserCursor);

    // Global mouseup listener for selection pass-through (if paragraph nav present)
    if (!DrawingTools._mouseListenersAdded) {
      document.addEventListener('mouseup', () => {
        document.querySelectorAll('.paragraph-hover-area').forEach(area => {
          area.style.pointerEvents = 'auto';
        });
      });
      DrawingTools._mouseListenersAdded = true;
    }
  }

  /** Initialize event listeners and sizing */
  init() {
    window.addEventListener('resize', () => {
      this.canvasManager.sizeCanvases();
      this.redrawAll();
    });

    window.addEventListener('load', () => {
      this.canvasManager.sizeCanvases();
      this.redrawAll();
    });

    this.canvasManager.sizeCanvases();
    setTimeout(() => this.redrawAll(), 10);

    // Tool button clicks
    this.tools.forEach(tool =>
      tool.addEventListener('click', () => this.setActiveTool(tool))
    );

    // Clear all on Ctrl/Cmd+Shift+C
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        if (confirm('Clear all annotations?')) this.clearAll();
      }
    });

    // Eraser events
    ['mousedown','mousemove','mouseup'].forEach(evt =>
      document.addEventListener(evt, e => {
        if (evt === 'mousedown' && this._isClickOnTool(e)) return;
        handleEraser(this, evt, e);
      })
    );

    // Eraser cursor follow
    document.addEventListener('mousemove', e => {
      if (this.activeTool?.classList.contains('eraser')) {
        this.eraserCursor.style.display = 'block';
        this.eraserCursor.style.left = `${e.pageX}px`;
        this.eraserCursor.style.top = `${e.pageY}px`;
      } else {
        this.eraserCursor.style.display = 'none';
      }
    });

    // Text tool click
    document.addEventListener('click', e => handleText(this, e));

    // Shape drawing events
    ['mousedown','mousemove','mouseup'].forEach(evt =>
      document.addEventListener(evt, e => {
        if (evt === 'mousedown' && this._isClickOnTool(e)) return;
        handleRectangle(this, evt, e);
        handleEllipse(this, evt, e);
        handleLine(this, evt, e);
        handleArrow(this, evt, e);
        handlePencil(this, evt, e);
        handleHighlight(this, evt, e);
      })
    );
  }

  /** Clear & redraw everything */
  redrawAll() {
    redrawAll(this);
  }

  /** Persist shapesData */
  save() {
    saveShapesData(this.shapesData);
  }

  /** Tool switch & update global flag */
  setActiveTool(tool) {
    if (tool === this.activeTool) return;
    this.tools.forEach(t => t.classList.remove('active'));
    tool.classList.add('active');
    this.activeTool = tool;

    // Flip global toolActive flag by mutating exported object
    commonVars.toolActive = !tool.classList.contains('cursor');

    // Reset state
    this.textClickArmed = false;
    this.erasedShapeIds.clear();

    // Update cursor style
    const drawTools = ['rectangle','circle','line','arrow','pencil','highlighter','text','eraser'];
    document.body.style.cursor = drawTools.some(c => tool.classList.contains(c))
      ? 'crosshair'
      : 'default';
  }

  /** Add helper to detect clicks on UI */
  _isClickOnTool(e) {
    return isClickOnTool(e, this.selector);
  }

  /** Generic draw lifecycle helper */
  _genericDraw(type, xRel, y, previewFn, finalizeFn) {
    if (type === 'mousedown') {
      this.isDrawing = true;
      this.startXRel = xRel; this.startY = y;
      this.currentSeed = Math.floor(Math.random()*10000)+1;
      document.body.style.userSelect = 'none';
    } else if (type === 'mousemove' && this.isDrawing) {
      this.canvasManager.clearPreview();
      previewFn(this.startXRel, this.startY, xRel, y, this.currentSeed);
    } else if (type === 'mouseup' && this.isDrawing) {
      this.isDrawing = false;
      document.body.style.userSelect = 'auto';
      this.canvasManager.clearPreview();
      finalizeFn(this.startXRel, this.startY, xRel, y, this.currentSeed);
      this.save();
      const cursor = this.tools.find(t => t.classList.contains('cursor'));
      if (cursor) this.setActiveTool(cursor);
    }
  }

  /** Draw arrow head */
  _drawArrowHead(x1, y1, x2, y2, seed) {
    drawArrowHead(this, x1, y1, x2, y2, seed);
  }

  /** Preview arrow head */
  _previewArrowHead(x1, y1, x2, y2, seed) {
    previewArrowHead(this, x1, y1, x2, y2, seed);
  }

  /** Convert hex to RGBA */
  _hexToRgba(hex, alpha) {
    return hexToRgba(hex, alpha);
  }

  /** Create editable text box */
  _createTextEditor(e) {
    createTextEditor(this, e);
  }

  /** Clear all annotations */
  clearAll() {
    this.shapesData = clearAllShapesData();
    this.save();
    this.redrawAll();
  }

  /** Generic freehand helper */
  _handleFreehand(type, e, dataKey, options, color,opacity) {
    handleFreehand(this, type, e, dataKey, options, color,opacity);
  }
}

// Instantiate on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  const drawer = new DrawingTools({ selector: '.w-control', strokeWidth:2, roughness:2 });
  window.drawer = drawer;
  drawer.init();
});
