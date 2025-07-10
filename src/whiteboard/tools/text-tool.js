import { getZeroXPoint } from '../utils.js';

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
    left: `${x}px`,
    top: `${y}px`,
    display: 'inline-block',
    padding: '4px',
    border: '1px solid',
    outline: 'none',
    background: 'rgba(255,255,255,0.8)',
    zIndex: '-1000',
    fontSize: '24px',
    marginTop: '-30px', // Center vertically
    marginLeft: '-6px', // Center horizontally
  });

  document.body.appendChild(el);
  el.focus();

  el.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      el.blur();
    }
  });

  el.addEventListener('blur', () => {
    const xRel = x - zeroX;
    drawingTools.shapesData.text.push({ xRel, y: y, text: el.innerText });
    drawingTools.save();
    el.remove();
    drawingTools.redrawAll();
    const cursor = drawingTools.tools.find(t => t.classList.contains('cursor'));
    if (cursor) drawingTools.setActiveTool(cursor);
  });
}
