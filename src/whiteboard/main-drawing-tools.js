// -----main-drawing-tools.js-----

import { commonVars } from '../common-vars.js';
import { CanvasManager } from './landingFiles/canvas-manager.js';
import { saveShapesData, loadShapesData, clearAllShapesData } from './landingFiles/storage.js';
import { redrawAll } from './landingFiles/renderer.js';
import { handleRectangle } from './tools/rectangle-tools.js';
import { handleEllipse } from './tools/elipse-tool.js';
import { handleLine } from './tools/line-tool.js';
import { handleArrow, drawArrowHead, previewArrowHead } from './tools/arrow-tool.js';
import { handlePencil, handleFreehand } from './tools/pencil-tool.js';
import { handleHighlight } from './tools/highlighter-tool.js';
import { handleText, createTextEditor } from './tools/text-tool.js';
import { handleEraser } from './tools/eraser-tool.js';
import { isClickOnTool, hexToRgba } from './utils.js';
import { initSelectionHandler } from './landingFiles/selection.js';
import { initVersioning } from './version.js';

/**
 * Class to manage drawing annotations on the document
 */
export class DrawingTools {
  static _mouseListenersAdded = false;

  constructor({
    selector = '.w-control',
    strokeWidth = 2,
    roughness = 3,
    pencilOptions = {},
    highlightOptions = {},
    /** Optional: force a storage namespace (e.g., 'landing' | 'pricing' | custom). If omitted, storage.js auto-detects. */
    storageNamespace = undefined
  } = {}) {
    this.selector = selector;
    this.strokeWidth = strokeWidth;
    this.roughness = roughness;
    this.storageNamespace = storageNamespace; // NEW: keep which bucket to use for localStorage

    // Drawing palette
    this.colorOptions = ['#373737', '#9C0000', '#0099FF', '#045C32', '#FFAA00'];
    // Highlight palette
    this.highlightColorOptions = ['#FFE500', '#F84F4F', '#2FCEF6', '#1FDC82', '#FC49FF'];

    // Default colors
    this.selectedColor = this.colorOptions[0];
    this.highlightColor = this.highlightColorOptions[0];

    // Pencil settings
    this.pencilOptions = Object.assign({
      size: 8,
      smoothing: 0.5,
      thinning: 0.5,
      streamline: 0.5,
      easing: t => t,
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true }
    }, pencilOptions);

    // Highlighter settings
    this.highlightOptions = Object.assign({
      size: 35,
      smoothing: 0.5,
      thinning: 0.1,
      streamline: 0.5,
      easing: t => t,
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
      color: this.highlightColor,
      opacity: 0.5
    }, highlightOptions);

    // Tool buttons
    this.tools = Array.from(document.querySelectorAll(this.selector));
    this.activeTool = this.tools.find(t => t.classList.contains('active')) || null;

    // Build the color picker UI container
    this._createColorPicker();

    // State flags
    this.isDrawing = false;
    this.isErasing = false;
    this.currentPoints = [];
    this.textClickArmed = false;
    this.erasedShapeIds = new Set();

    // Load shapes and canvas (NAMESPACED)
    this.shapesData = loadShapesData(this.storageNamespace);
    this.canvasManager = new CanvasManager();

    initSelectionHandler(this);

    // Eraser-following cursor
    this.eraserCursor = document.createElement('div');
    this.eraserCursor.classList.add('eraser-mouse');
    Object.assign(this.eraserCursor.style, {
      position: 'absolute',
      pointerEvents: 'none',
      display: 'none'
    });
    document.body.appendChild(this.eraserCursor);

    // Global mouseup to restore paragraph events
    if (!DrawingTools._mouseListenersAdded) {
      document.addEventListener('mouseup', () =>
        document.querySelectorAll('.paragraph-hover-area').forEach(a => a.style.pointerEvents = 'auto')
      );
      DrawingTools._mouseListenersAdded = true;
    }
  }

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

    this.tools.forEach(tool =>
      tool.addEventListener('click', () => this.setActiveTool(tool))
    );

    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        if (confirm('Clear all annotations?')) this.clearAll();
      }
    });

    ['mousedown','mousemove','mouseup'].forEach(evt =>
      document.addEventListener(evt, e => {
        if (evt === 'mousedown' && this._isClickOnTool(e)) return;
        handleEraser(this, evt, e);
      })
    );

    document.addEventListener('mousemove', e => {
      if (this.activeTool?.classList.contains('eraser')) {
        this.eraserCursor.style.display = 'block';
        this.eraserCursor.style.left = `${e.pageX}px`;
        this.eraserCursor.style.top = `${e.pageY}px`;
      } else {
        this.eraserCursor.style.display = 'none';
      }
    });

    // Text tool (with color)
    document.addEventListener('click', e =>
      handleText(this, e, this.selectedColor)
    );

    // Drawing shape events
    ['mousedown','mousemove','mouseup'].forEach(evt =>
      document.addEventListener(evt, e => {
        if (evt === 'mousedown' && this._isClickOnTool(e)) return;
        handleRectangle(this, evt, e, this.selectedColor);
        handleEllipse(this, evt, e, this.selectedColor);
        handleLine(this, evt, e, this.selectedColor);
        handleArrow(this, evt, e, this.selectedColor);
        handlePencil(this, evt, e, this.pencilOptions, this.selectedColor);
        handleHighlight(
          this,
          evt,
          e,
          this.highlightOptions,
          this.highlightColor,
          this.highlightOptions.opacity
        );
      })
    );
  }

  /** Build the floating color-picker container */
  _createColorPicker() {
    this.colorPicker = document.createElement('div');
    Object.assign(this.colorPicker.style, {
      display: 'none',
      position: 'fixed',
      flexDirection: 'column',
      gap: '8px',
      marginLeft: '8px',
      borderRadius: '20px',
      padding: '5px',
      background: '#fff',
      border: '1px solid #B7B7B7',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    });
    ['mousedown','click'].forEach(evt =>
      this.colorPicker.addEventListener(evt, e => e.stopPropagation())
    );
    document.body.appendChild(this.colorPicker);
  }

  /** Show and populate picker based on active tool */
  _showColorPicker(tool) {
    this.colorPicker.innerHTML = '';
    const isHighlight = tool.classList.contains('highlighter');
    const palette = isHighlight ? this.highlightColorOptions : this.colorOptions;
    const current = isHighlight ? this.highlightColor : this.selectedColor;

    palette.forEach(color => {
      const dot = document.createElement('div');
      const size = color === current ? '20px' : '13px';
      Object.assign(dot.style, {
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        cursor: 'pointer'
      });
      ['mousedown','click'].forEach(evt =>
        dot.addEventListener(evt, e => {
          e.stopPropagation();
          if (evt === 'click') {
            if (isHighlight) {
              this.highlightColor = color;
              this.highlightOptions.color = color;
            } else {
              this.selectedColor = color;
            }
            this._updatePickerDots(tool);
          }
        })
      );
      this.colorPicker.appendChild(dot);
    });

    const r = tool.getBoundingClientRect();
    Object.assign(this.colorPicker.style, {
      top: `${r.top}px`,
      left: `${r.right + 8}px`,
      display: 'flex'
    });
  }

  /** Update dot sizes after selection */
  _updatePickerDots(tool) {
    const isHighlight = tool.classList.contains('highlighter');
    const palette = isHighlight ? this.highlightColorOptions : this.colorOptions;
    const current = isHighlight ? this.highlightColor : this.selectedColor;

    Array.from(this.colorPicker.children).forEach((dot, idx) => {
      const color = palette[idx];
      const size = color === current ? '20px' : '11px';
      dot.style.width = size;
      dot.style.height = size;
    });
  }

  _hideColorPicker() {
    this.colorPicker.style.display = 'none';
  }

  redrawAll() {
    redrawAll(this);
  }

  save() {
    // NAMESPACED SAVE
    saveShapesData(this.shapesData, this.storageNamespace);
  }

  setActiveTool(tool) {
    if (tool === this.activeTool) return;
    this.tools.forEach(t => t.classList.remove('active'));
    tool.classList.add('active');
    this.activeTool = tool;

    const draw = ['rectangle','circle','line','arrow','pencil','highlighter','text'];
    const isDraw = draw.some(c => tool.classList.contains(c));
    if (isDraw) this._showColorPicker(tool);
    else this._hideColorPicker();

    commonVars.toolActive = !tool.classList.contains('cursor');
    this.textClickArmed = false;
    this.erasedShapeIds.clear();
    document.body.style.cursor = isDraw ? 'crosshair' : 'default';
  }

  _isClickOnTool(e) {
    return isClickOnTool(e, this.selector);
  }

  _genericDraw(type, x, y, pF, fF) {
    if (type === 'mousedown') {
      this.isDrawing = true;
      this.startXRel = x;
      this.startY = y;
      this.currentSeed = Math.floor(Math.random() * 10000) + 1;
      document.body.style.userSelect = 'none';
    } else if (type === 'mousemove' && this.isDrawing) {
      this.canvasManager.clearPreview();
      pF(this.startXRel, this.startY, x, y, this.currentSeed);
    } else if (type === 'mouseup' && this.isDrawing) {
      this.isDrawing = false;
      document.body.style.userSelect = 'auto';
      this.canvasManager.clearPreview();
      fF(this.startXRel, this.startY, x, y, this.currentSeed);
      this.save();
      const c = this.tools.find(t => t.classList.contains('cursor'));
      if (c) this.setActiveTool(c);
    }
  }

  _drawArrowHead(x1, y1, x2, y2, s) {
    drawArrowHead(this, x1, y1, x2, y2, s);
  }

  _previewArrowHead(x1, y1, x2, y2, s) {
    previewArrowHead(this, x1, y1, x2, y2, s);
  }

  _hexToRgba(h, a) {
    return hexToRgba(h, a);
  }

  _createTextEditor(e) {
    createTextEditor(this, e);
  }

  clearAll() {
    this.shapesData = clearAllShapesData();
    this.save(); // persist clear to the namespaced key
    this.redrawAll();
  }

  _handleFreehand(t, e, d, o, c, op) {
    handleFreehand(this, t, e, d, o, c, op);
  }
}

// Instantiate on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  const drawer = new DrawingTools({
    selector: '.w-control',
    strokeWidth: 2,
    roughness: 2
    // Optionally force a namespace per page if you prefer being explicit:
    // storageNamespace: 'landing'   // on index.html
    // storageNamespace: 'pricing'   // on pricing.html
  });
  initVersioning(drawer, {maxHistory : 10});
  window.drawer = drawer;
  drawer.init();
});
