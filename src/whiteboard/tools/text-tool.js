// ------text-tool.js-------


import { computeCoords, getZeroXPoint, getShapeBounds } from '../utils.js';
import { ReadAlong } from '../../audio/read-along.js';

/**
 * Text drawing tool
 */
export function handleText(drawingTools, e) {
  if (!drawingTools.activeTool?.classList.contains('text')) return;
  if (drawingTools._isClickOnTool(e)) return; // Skip if clicking on tools

  drawingTools._createTextEditor(e);
}

/** Create editable text box */
export function createTextEditor(drawingTools, e) {
  const cx = e.pageX; // center X in page space
  const cy = e.pageY; // center Y in page space
  const zeroX = getZeroXPoint();

  const el = document.createElement('div');
  el.contentEditable = 'true';
  el.classList.add('annotation-text-editor', 'editing');

  const maxW = Math.min(600, Math.floor(window.innerWidth * 0.9));
  Object.assign(el.style, {
    position: 'absolute',
    left: `${cx}px`,
    top: `${cy}px`,
    transform: 'none', // anchor start exactly at click (adjusted to baseline below)
    transformOrigin: 'left top',
    display: 'block',
    // Use outline so visuals don't affect layout/positioning
    padding: '0',
    border: 'none',
    outline: '1px dashed rgba(0,0,0,0.3)',
    outlineOffset: '2px',
    background: 'transparent',
    zIndex: '1000',
    fontSize: '24px',
    // Match renderer line-height to avoid vertical shift on save
    lineHeight: 'normal',
    color: drawingTools.selectedColor,
    whiteSpace: 'pre',
    overflow: 'visible',
    minWidth: '40px',
    minHeight: '1em',
    textAlign: 'left',
    borderRadius: '0px',
    boxSizing: 'content-box',
    margin: '0'
  });

  // While editing, hide any selection box
  try {
    drawingTools._isEditingText = true;
    drawingTools.selectedShape = null;
    // clear any preview overlays in all canvases
    const list = drawingTools.canvasManagers && drawingTools.canvasManagers.length
      ? drawingTools.canvasManagers
      : (drawingTools.canvasManager ? [drawingTools.canvasManager] : []);
    list.forEach(m => m?.clearPreview?.());
  } catch {}

  document.body.appendChild(el);
  // Prevent initial focus from scrolling viewport
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
  // Ensure caret at end for a better editing UX
  try {
    const placeEnd = () => {
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    };
    // Defer to ensure DOM is ready
    requestAnimationFrame(placeEnd);
  } catch {}
  // Snapshot zone and disable read-along while editing text
  try {
    const ra = ReadAlong.get();
    drawingTools._wasInReadAlongZone = (ra && typeof ra.isCurrentWordInZone === 'function') ? ra.isCurrentWordInZone() : false;
    ra?.setAutoEnabled(false);
  } catch {}

  // After insertion, align top to baseline so the click point is baseline of first line
  try {
    const cs = getComputedStyle(el);
    const fontSize = parseFloat(cs.fontSize) || 24;
    const fontFamily = cs.fontFamily || 'sans-serif';
    const cvs = document.createElement('canvas');
    const ctx = cvs.getContext('2d');
    ctx.font = `${fontSize}px ${fontFamily}`;
    const m = ctx.measureText('Mg');
    const ascent = m.actualBoundingBoxAscent ?? fontSize * 0.8;
    el.style.top = `${cy - ascent}px`;
  } catch {}

  // Handle Enter vs Shift+Enter, Esc to cancel
  const restoreScroll = () => {
    const x = window.scrollX, y = window.scrollY;
    requestAnimationFrame(() => window.scrollTo(x, y));
  };

  el.addEventListener('keydown', ev => {
    // Never allow viewport to shift to keep caret visible
    restoreScroll();
    if (ev.key === 'Enter') {
      if (ev.shiftKey) {
        // Insert a literal newline without causing viewport jumps
        ev.preventDefault();
        try { document.execCommand('insertText', false, '\n'); } catch {}
        restoreScroll();
      } else {
        ev.preventDefault();
        el.blur();
      }
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      el.dataset.cancelled = '1';
      el.blur();
    }
  });
  // Extra guards against scroll adjustments while typing
  el.addEventListener('keyup', restoreScroll);
  el.addEventListener('input', restoreScroll);
  el.addEventListener('beforeinput', restoreScroll);

  // Prevent creating another editor when clicking inside current one
  ['mousedown','click'].forEach(evt => el.addEventListener(evt, ev => ev.stopPropagation()));

  el.addEventListener('blur', () => {
    const cancelled = el.dataset.cancelled === '1';
    const textValue = (el.innerText || '').replace(/\s+$/,'');
    const cs = getComputedStyle(el);
    const fontSize = parseFloat(cs.fontSize) || 24;
    const fontFamily = cs.fontFamily || 'sans-serif';

    // If cancelled or empty, cleanup and bail
    if (cancelled || textValue.length === 0) {
      el.remove();
      const cursor = drawingTools.tools.find(t => t.classList.contains('cursor'));
      if (cursor) drawingTools.setActiveTool(cursor);
      return;
    }

    // Persist with click point as the fixed start (baseline of first line)
    const baselineY = cy;
    const xRel = (cx - zeroX);

    // Persist text
    drawingTools.shapesData.text.push({
      xRel,
      y: baselineY,
      text: textValue,
      color: drawingTools.selectedColor,
      fontSize,
      fontFamily
    });
    drawingTools.save();
    el.remove();
    drawingTools.redrawAll();
    // Done editing; allow selection overlay again
    try { drawingTools._isEditingText = false; } catch {}
    // Snap once only if previously in zone; then re-enable
    try {
      const ra = ReadAlong.get();
      if (drawingTools._wasInReadAlongZone && ra && typeof ra.snapToCurrentWord === 'function') {
        ra.snapToCurrentWord({ smooth: true });
      }
      ra?.setAutoEnabled(true);
    } catch {}
    drawingTools._wasInReadAlongZone = undefined;
    const cursor = drawingTools.tools.find(t => t.classList.contains('cursor'));
    if (cursor) drawingTools.setActiveTool(cursor);
  });
}

/**
 * Enter edit mode for an existing text shape (by index), reusing its
 * position, font and color. Double-clicking a rendered text block should
 * invoke this to allow modifications.
 */
export function startEditExistingText(drawingTools, index) {
  const t = drawingTools?.shapesData?.text?.[index];
  if (!t) return;

  const zeroX = getZeroXPoint();
  const fontSize = t.fontSize || 24;
  const fontFamily = t.fontFamily || 'sans-serif';
  const color = t.color || drawingTools.selectedColor;

  // Measure ascent to align the top of the editor to the text baseline
  let ascent = Math.floor(fontSize * 0.8);
  try {
    const cvs = document.createElement('canvas');
    const ctx = cvs.getContext('2d');
    ctx.font = `${fontSize}px ${fontFamily}`;
    const m = ctx.measureText('Mg');
    ascent = m.actualBoundingBoxAscent ?? ascent;
  } catch {}

  const cx = zeroX + t.xRel;
  const cyTop = t.y - ascent;

  const el = document.createElement('div');
  el.contentEditable = 'true';
  el.classList.add('annotation-text-editor', 'editing');
  el.innerText = String(t.text ?? '');

  Object.assign(el.style, {
    position: 'absolute',
    left: `${cx}px`,
    top: `${cyTop}px`,
    transform: 'none',
    transformOrigin: 'left top',
    display: 'block',
    padding: '0',
    border: 'none',
    outline: '1px dashed rgba(0,0,0,0.3)',
    outlineOffset: '2px',
    background: 'transparent',
    zIndex: '1000',
    fontSize: `${fontSize}px`,
    lineHeight: 'normal',
    color,
    whiteSpace: 'pre',
    overflow: 'visible',
    minWidth: '40px',
    minHeight: '1em',
    textAlign: 'left',
    borderRadius: '0px',
    boxSizing: 'content-box',
    margin: '0',
    fontFamily
  });

  // Temporarily hide the rendered block for this index (if present)
  try {
    const ghost = document.querySelector(`[data-text-id="text-${index}"]`);
    if (ghost) ghost.style.visibility = 'hidden';
  } catch {}

  // While editing, hide any selection box
  try {
    drawingTools._isEditingText = true;
    drawingTools.selectedShape = null;
    const list = drawingTools.canvasManagers && drawingTools.canvasManagers.length
      ? drawingTools.canvasManagers
      : (drawingTools.canvasManager ? [drawingTools.canvasManager] : []);
    list.forEach(m => m?.clearPreview?.());
  } catch {}

  document.body.appendChild(el);
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
  // Move caret to end of existing content
  try {
    const placeEnd = () => {
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    };
    requestAnimationFrame(placeEnd);
  } catch {}

  // Snapshot zone and disable read-along while editing
  try {
    const ra = ReadAlong.get();
    drawingTools._wasInReadAlongZone = (ra && typeof ra.isCurrentWordInZone === 'function') ? ra.isCurrentWordInZone() : false;
    ra?.setAutoEnabled(false);
  } catch {}

  const restoreScroll = () => {
    const x = window.scrollX, y = window.scrollY;
    requestAnimationFrame(() => window.scrollTo(x, y));
  };

  el.addEventListener('keydown', ev => {
    restoreScroll();
    if (ev.key === 'Enter') {
      if (ev.shiftKey) {
        ev.preventDefault();
        try { document.execCommand('insertText', false, '\n'); } catch {}
        restoreScroll();
      } else {
        ev.preventDefault();
        el.blur();
      }
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      el.dataset.cancelled = '1';
      el.blur();
    }
  });
  ['keyup','input','beforeinput'].forEach(evt => el.addEventListener(evt, restoreScroll));
  ;['mousedown','click'].forEach(evt => el.addEventListener(evt, ev => ev.stopPropagation()));

  el.addEventListener('blur', () => {
    // Restore ghost visibility
    try {
      const ghost = document.querySelector(`[data-text-id="text-${index}"]`);
      if (ghost) ghost.style.visibility = '';
    } catch {}

    const cancelled = el.dataset.cancelled === '1';
    const newText = (el.innerText || '').replace(/\s+$/,'');

    if (!cancelled) {
      if (newText.length === 0) {
        // Delete the shape if emptied
        try { drawingTools.shapesData.text.splice(index, 1); } catch {}
      } else {
        // Update in-place
        t.text = newText;
        t.fontSize = fontSize;
        t.fontFamily = fontFamily;
        t.color = color; // keep same color
      }
      drawingTools.save();
    }

    el.remove();
    drawingTools.redrawAll();
    try { drawingTools._isEditingText = false; } catch {}
    // Snap if previously in zone; re-enable auto-readalong
    try {
      const ra = ReadAlong.get();
      if (drawingTools._wasInReadAlongZone && ra && typeof ra.snapToCurrentWord === 'function') {
        ra.snapToCurrentWord({ smooth: true });
      }
      ra?.setAutoEnabled(true);
    } catch {}
    drawingTools._wasInReadAlongZone = undefined;

    const cursor = drawingTools.tools.find(tl => tl.classList.contains('cursor'));
    if (cursor) drawingTools.setActiveTool(cursor);
  });
}

// Attach a single global dblclick handler that detects double-clicks on
// rendered text blocks and switches them back to edit mode.
let _dblSetupDone = false;
export function setupTextEditingShortcuts(drawingTools) {
  if (_dblSetupDone) return;
  _dblSetupDone = true;

  document.addEventListener('dblclick', (e) => {
    try {
      // Ignore toolbar double-clicks
      if (drawingTools._isClickOnTool?.(e)) return;

      // Avoid triggering when currently editing
      if (e.target && (e.target.classList?.contains('annotation-text-editor') || e.target.isContentEditable)) return;

      // Hit-test for rendered text nodes under the pointer
      const els = (document.elementsFromPoint?.(e.clientX, e.clientY) || []);
      let match = els.find(el => el?.classList?.contains('annotation-text-editor') && el?.classList?.contains('completed'));
      // Fallback: manual hit test over all completed text nodes
      if (!match) {
        const candidates = Array.from(document.querySelectorAll('.annotation-text-editor.completed'));
        for (const c of candidates) {
          const r = c.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            match = c; break;
          }
        }
      }
      if (!match) return;
      const id = match.getAttribute('data-text-id') || '';
      const m = id.match(/^text-(\d+)$/);
      if (m) {
        const idx = parseInt(m[1], 10);
        e.preventDefault();
        e.stopPropagation();
        startEditExistingText(drawingTools, idx);
        return;
      }

      // If we didn't hit the DOM text node, try the text shape bounding boxes
      // so that dblclick anywhere inside the selection/bounds starts edit.
      const x = e.pageX;
      const y = e.pageY;
      const texts = drawingTools?.shapesData?.text || [];
      for (let i = texts.length - 1; i >= 0; i--) {
        const shape = texts[i];
        const bounds = getShapeBounds('text', shape);
        const zeroX = getZeroXPoint();
        const cx = zeroX + (bounds.minX + bounds.maxX) / 2; // page-space
        const cy = (bounds.minY + bounds.maxY) / 2;         // page-space
        const rotInv = -((shape.rotation || 0) * Math.PI / 180);
        const dx = x - cx;
        const dy = y - cy;
        const localX = dx * Math.cos(rotInv) - dy * Math.sin(rotInv);
        const localY = dx * Math.sin(rotInv) + dy * Math.cos(rotInv);
        const halfW = (bounds.maxX - bounds.minX) / 2;
        const halfH = (bounds.maxY - bounds.minY) / 2;
        if (localX >= -halfW && localX <= halfW && localY >= -halfH && localY <= halfH) {
          e.preventDefault();
          e.stopPropagation();
          startEditExistingText(drawingTools, i);
          return;
        }
      }
    } catch {}
  }, true);
}
