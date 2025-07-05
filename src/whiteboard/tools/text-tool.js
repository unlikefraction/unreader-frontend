import { getZeroXPoint } from '../utils.js';

/**
 * Text drawing tool
 */
export function handleText(drawingTools, e) {
  if (!drawingTools.activeTool?.classList.contains('text')) return;
  if (drawingTools._isClickOnTool(e)) return; // Skip if clicking on tools
  
  if (!drawingTools.textClickArmed) {
    drawingTools.textClickArmed = true;
    return;
  }
  drawingTools._createTextEditor(e);
}

/** Create editable text box */
export function createTextEditor(drawingTools, e) {
  const x = e.clientX; const y = e.pageY; const zeroX = getZeroXPoint();
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
    drawingTools.shapesData.text.push({ xRel, y: y, text: el.innerText });
    drawingTools.save();
    el.remove();
    drawingTools.redrawAll();
    const cursor = drawingTools.tools.find(t=>t.classList.contains('cursor'));
    if (cursor) drawingTools.setActiveTool(cursor);
  });
}