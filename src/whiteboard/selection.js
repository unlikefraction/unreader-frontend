// selection.js
import { getZeroXPoint, getShapeBounds } from './utils.js';
import { commonVars } from '../common-vars.js';

/**
 * Sets up click-based single-shape selection, highlights with a 5px stroke,
 * and adds drag-to-move functionality.
 */
export function initSelectionHandler(drawingTools) {
  let dragInfo = null; // will hold dragging state

  // Mousedown: select shape & start drag
  document.addEventListener('mousedown', e => {
    if (commonVars.currentTool !== 'cursor') return;

    const zeroX = getZeroXPoint();
    const x = e.clientX - zeroX;
    const y = e.pageY;

    let hit = null;
    for (const type of Object.keys(drawingTools.shapesData)) {
      const list = drawingTools.shapesData[type];
      for (let i = list.length - 1; i >= 0; i--) {
        const shape = list[i];
        const bounds = getShapeBounds(type, shape);
        if (x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY) {
          hit = { type, index: i, bounds };
          break;
        }
      }
      if (hit) break;
    }

    drawingTools.selectedShape = hit;
    drawingTools.canvasManager.clearPreview();
    drawingTools.redrawAll();

    if (hit) {
      // highlight selected shape
      const { bounds } = hit;
      const ctx = drawingTools.canvasManager.previewCtx;
      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#007bff';
      ctx.strokeRect(
        zeroX + bounds.minX,
        bounds.minY,
        bounds.maxX - bounds.minX,
        bounds.maxY - bounds.minY
      );
      ctx.restore();

      // prepare drag state
      const shape = drawingTools.shapesData[hit.type][hit.index];
      dragInfo = {
        type: hit.type,
        index: hit.index,
        startX: e.clientX,
        startY: e.pageY,
        origXRel: shape.xRel != null ? shape.xRel : shape.x1Rel,
        origYRel: shape.y   != null ? shape.y    : shape.y1
      };
      document.body.style.userSelect = 'none';
    }
  });

  // Mousemove: drag shape
  document.addEventListener('mousemove', e => {
    if (!dragInfo) return;
    const zeroX = getZeroXPoint();
    const dx = e.clientX - dragInfo.startX;
    const dy = e.pageY  - dragInfo.startY;
    const shapes = drawingTools.shapesData[dragInfo.type];
    const shape = shapes[dragInfo.index];

    switch (dragInfo.type) {
      case 'rectangle':
      case 'ellipse':
        shape.xRel = dragInfo.origXRel + dx;
        shape.y    = dragInfo.origYRel + dy;
        break;
      case 'line':
      case 'arrow':
        // move start point
        shape.x1Rel = dragInfo.origXRel + dx;
        shape.y1    = dragInfo.origYRel + dy;
        // shift end by same amount
        shape.x2Rel += dx;
        shape.y2    += dy;
        // update for continuous drag
        dragInfo.origXRel = shape.x1Rel;
        dragInfo.origYRel = shape.y1;
        dragInfo.startX = e.clientX;
        dragInfo.startY = e.pageY;
        break;
      case 'pencil':
      case 'highlighter':
        shape.points.forEach(pt => {
          pt.xRel += dx;
          pt.y    += dy;
        });
        dragInfo.startX = e.clientX;
        dragInfo.startY = e.pageY;
        break;
      case 'text':
        shape.xRel += dx;
        shape.y    += dy;
        dragInfo.startX = e.clientX;
        dragInfo.startY = e.pageY;
        break;
    }

    // redraw with highlight
    drawingTools.canvasManager.clearPreview();
    drawingTools.redrawAll();
    const bounds = getShapeBounds(dragInfo.type, shape);
    const ctx = drawingTools.canvasManager.previewCtx;
    ctx.save(); ctx.lineWidth = 5; ctx.strokeStyle = '#007bff';
    ctx.strokeRect(zeroX + bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    ctx.restore();
  });

  // Mouseup: end drag, save
  document.addEventListener('mouseup', () => {
    if (dragInfo) {
      drawingTools.save();
      document.body.style.userSelect = 'auto';
      dragInfo = null;
      drawingTools.selectedShape = null;
      drawingTools.canvasManager.clearPreview();
      drawingTools.redrawAll();
    }
  });
}