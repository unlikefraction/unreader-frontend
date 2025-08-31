// ------text-tool.js-------


import { computeCoords, getZeroXPoint } from '../utils.js';

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
    transform: 'translate(-50%, -50%)', // center under cursor (matches final placement)
    transformOrigin: 'center center',
    display: 'block',
    padding: '4px 6px',
    border: '1px dashed rgba(0,0,0,0.3)',
    outline: 'none',
    background: 'rgba(255,255,255,0.9)',
    zIndex: '1000',
    fontSize: '24px',
    lineHeight: '1.2',
    color: drawingTools.selectedColor,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    maxWidth: `${maxW}px`,
    minWidth: '40px',
    minHeight: '1em',
    textAlign: 'center',
    borderRadius: '6px'
  });

  document.body.appendChild(el);
  el.focus();

  // Handle Enter vs Shift+Enter, Esc to cancel
  el.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') {
      if (ev.shiftKey) {
        ev.preventDefault();
        try { document.execCommand('insertLineBreak'); } catch {}
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

    // Measure multi-line metrics to compute left/baseline from center
    const lines = String(textValue).split(/\n/);
    const cvs = document.createElement('canvas');
    const ctx = cvs.getContext('2d');
    ctx.font = `${fontSize}px ${fontFamily}`;
    let textWidth = 0;
    for (const line of lines) {
      const w = ctx.measureText(line).width;
      if (w > textWidth) textWidth = w;
    }
    const m = ctx.measureText('Mg');
    const ascent = m.actualBoundingBoxAscent ?? fontSize * 0.8;
    const descent = m.actualBoundingBoxDescent ?? fontSize * 0.2;
    const n = Math.max(1, lines.length);
    // Invert center -> baseline for multi-line
    const baselineY = cy - ((descent - ascent) + (n - 1) * fontSize) / 2;
    const xRel = (cx - zeroX) - textWidth / 2;

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
    const cursor = drawingTools.tools.find(t => t.classList.contains('cursor'));
    if (cursor) drawingTools.setActiveTool(cursor);
  });
}
