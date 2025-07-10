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
  const x = e.clientX;
  const y = e.pageY;
  const zeroX = getZeroXPoint();

  const el = document.createElement('div');
  el.contentEditable = 'true';
  el.classList.add('annotation-text-editor', 'editing');

  Object.assign(el.style, {
    position: 'absolute',
    left: `${x}px`,  // absolute page position
    top: `${y}px`,   
    display: 'inline-block',
    padding: '4px',
    border: '1px dashed rgba(0,0,0,0.3)',
    outline: 'none',
    background: 'rgba(255,255,255,0.8)',
    zIndex: '1000',
    fontSize: '24px',
    color: drawingTools.selectedColor, // apply selected color
    marginTop: '-0.5em',
    marginLeft: '-0.25em'
  });

  document.body.appendChild(el);
  el.focus();

  // Enter to finish
  el.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      el.blur();
    }
  });

  el.addEventListener('blur', () => {
    const xRel = x - zeroX;
    const textValue = el.innerText;
    // Persist text with color
    drawingTools.shapesData.text.push({
      xRel,
      y,
      text: textValue,
      color: drawingTools.selectedColor,
      fontSize: 24
    });
    drawingTools.save();
    el.remove();
    drawingTools.redrawAll();
    // revert to cursor
    const cursor = drawingTools.tools.find(t => t.classList.contains('cursor'));
    if (cursor) drawingTools.setActiveTool(cursor);
  });
}
