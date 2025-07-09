/**
 * Sets up click-based single-shape selection, highlights with a 5px stroke,
 * adds a draggable red rotation-handle on top,
 * and supports moving or rotating any shape with correct hit-testing on rotated bounds.
 * Ensures commonVars.beingEdited toggles.
 */
import { getZeroXPoint, getShapeBounds } from './utils.js';
import { commonVars } from '../common-vars.js';

export function initSelectionHandler(drawingTools) {
  let dragInfo = null;

  function drawPersistentHighlight() {
    const sel = drawingTools.selectedShape;
    if (!sel) return;
    const { type, index } = sel;
    const shape = drawingTools.shapesData[type][index];
    const bounds = getShapeBounds(type, shape);
    drawingTools.selectedShape.bounds = bounds;

    const zeroX = getZeroXPoint();
    const ctx = drawingTools.canvasManager.previewCtx;
    const cx = zeroX + (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const rot = (shape.rotation || 0) * Math.PI / 180;

    // draw rotated blue border
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#007bff';
    ctx.strokeRect(
      bounds.minX - (bounds.minX + bounds.maxX) / 2,
      bounds.minY - (bounds.minY + bounds.maxY) / 2,
      bounds.maxX - bounds.minX,
      bounds.maxY - bounds.minY
    );
    ctx.restore();

    // draw rotated red handle
    const size = 20;
    const localX = (bounds.maxX - bounds.minX) / 2 - size / 2;
    const localY = bounds.minY - (bounds.minY + bounds.maxY) / 2 - size - 5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.fillStyle = 'red';
    ctx.fillRect(localX, localY, size, size);
    ctx.restore();

    // compute absolute handle position for hit-test
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const hx = cx + localX * cos - localY * sin;
    const hy = cy + localX * sin + localY * cos;
    drawingTools.selectedShape.handle = { x: hx, y: hy, size };
  }

  document.addEventListener('mousedown', e => {
    if (commonVars.toolActive !== false) return;
    const x = e.clientX;
    const y = e.pageY;
    let hit = null;

    // rotate handle hit
    if (drawingTools.selectedShape?.handle) {
      const h = drawingTools.selectedShape.handle;
      if (x >= h.x && x <= h.x + h.size && y >= h.y && y <= h.y + h.size) {
        hit = { ...drawingTools.selectedShape };
        const { minX, maxX, minY, maxY } = drawingTools.selectedShape.bounds;
        const zeroX = getZeroXPoint();
        const cx = zeroX + (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        dragInfo = {
          mode: 'rotate',
          type: hit.type,
          index: hit.index,
          cx,
          cy,
          startAng: Math.atan2(y - cy, x - cx),
          origRot: drawingTools.shapesData[hit.type][hit.index].rotation || 0
        };
        commonVars.beingEdited = true;
        document.body.style.userSelect = 'none';
      }
    }

    // shape hit on rotated bounds
    if (!hit) {
      outer: for (const type of Object.keys(drawingTools.shapesData)) {
        const list = drawingTools.shapesData[type];
        for (let i = list.length - 1; i >= 0; i--) {
          const shape = list[i];
          const bounds = getShapeBounds(type, shape);
          const zeroX = getZeroXPoint();
          // center and rotation
          const cx = zeroX + (bounds.minX + bounds.maxX) / 2;
          const cy = (bounds.minY + bounds.maxY) / 2;
          const rot = -((shape.rotation || 0) * Math.PI / 180);
          // translate click into shape local coords
          const dx = x - cx;
          const dy = y - cy;
          const localX = dx * Math.cos(rot) - dy * Math.sin(rot);
          const localY = dx * Math.sin(rot) + dy * Math.cos(rot);
          const halfW = (bounds.maxX - bounds.minX) / 2;
          const halfH = (bounds.maxY - bounds.minY) / 2;
          if (localX >= -halfW && localX <= halfW && localY >= -halfH && localY <= halfH) {
            hit = { type, index: i };
            // prepare move drag state
            const base = drawingTools.shapesData[type][i];
            const info = { mode: 'move', type, index: i };
            if (type === 'rectangle' || type === 'ellipse' || type === 'text') {
              info.startX = x; info.startY = y;
              info.origX = base.xRel; info.origY = base.y;
            } else if (type === 'line' || type === 'arrow') {
              info.startX = x; info.startY = y;
              info.orig = { x1: base.x1Rel, y1: base.y1, x2: base.x2Rel, y2: base.y2 };
            } else if (type === 'pencil' || type === 'highlighter') {
              info.startX = x; info.startY = y;
              info.origPts = base.points.map(pt => ({ x: pt.xRel, y: pt.y }));
            }
            dragInfo = info;
            commonVars.beingEdited = true;
            document.body.style.userSelect = 'none';
            break outer;
          }
        }
      }
    }

    drawingTools.selectedShape = hit;
    drawingTools.canvasManager.clearPreview();
    drawingTools.redrawAll();
    drawPersistentHighlight();
  });

  document.addEventListener('mousemove', e => {
    if (!dragInfo) return;
    commonVars.beingEdited = true;
    const x = e.clientX; const y = e.pageY;
    const { mode, type, index } = dragInfo;
    const shape = drawingTools.shapesData[type][index];
    if (mode === 'move') {
      const dx = x - dragInfo.startX;
      const dy = y - dragInfo.startY;
      if (type === 'rectangle' || type === 'ellipse' || type === 'text') {
        shape.xRel = dragInfo.origX + dx;
        shape.y    = dragInfo.origY + dy;
      } else if (type === 'line' || type === 'arrow') {
        shape.x1Rel = dragInfo.orig.x1 + dx;
        shape.y1    = dragInfo.orig.y1 + dy;
        shape.x2Rel = dragInfo.orig.x2 + dx;
        shape.y2    = dragInfo.orig.y2 + dy;
      } else if (type === 'pencil' || type === 'highlighter') {
        shape.points.forEach((pt, i) => {
          pt.xRel = dragInfo.origPts[i].x + dx;
          pt.y    = dragInfo.origPts[i].y + dy;
        });
      }
    } else if (mode === 'rotate') {
      const ang = Math.atan2(y - dragInfo.cy, x - dragInfo.cx);
      shape.rotation = dragInfo.origRot + (ang - dragInfo.startAng) * 180 / Math.PI;
    }
    drawingTools.canvasManager.clearPreview();
    drawingTools.redrawAll();
    drawPersistentHighlight();
  });

  document.addEventListener('mouseup', () => {
    if (!dragInfo) return;
    drawingTools.save();
    dragInfo = null;
    commonVars.beingEdited = true;
    document.body.style.userSelect = 'auto';
    drawingTools.canvasManager.clearPreview();
    drawingTools.redrawAll();
    drawPersistentHighlight();
  });
}
