import { getZeroXPoint, getShapeBounds } from './utils.js';
import { commonVars } from '../common-vars.js';

/**
 * Sets up click-based single-shape selection, highlights with a 5px stroke,
 * and adds drag-to-move functionality.
 */
export function initSelectionHandler(drawingTools) {
  let dragInfo = null;

  // Draws the persistent highlight around the selected shape on the preview layer
  function drawPersistentHighlight() {
    const sel = drawingTools.selectedShape;
    if (!sel) return;  // nothing selected

    const { type, index } = sel;
    const shape = drawingTools.shapesData[type][index];
    const bounds = getShapeBounds(type, shape);

    // update stored bounds so blank-clicks still clear properly
    drawingTools.selectedShape.bounds = bounds;

    const zeroX = getZeroXPoint();
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
  }

  // Mousedown: select or deselect shape & maybe start dragging
  document.addEventListener('mousedown', e => {
    if (commonVars.toolActive !== false) return;

    const zeroX = getZeroXPoint();
    const x = e.clientX - zeroX;
    const y = e.pageY;

    let hit = null;
    outer: for (const type of Object.keys(drawingTools.shapesData)) {
      const list = drawingTools.shapesData[type];
      for (let i = list.length - 1; i >= 0; i--) {
        const shape = list[i];
        const b = getShapeBounds(type, shape);
        if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) {
          hit = { type, index: i, bounds: b };
          break outer;
        }
      }
    }

    // Select new shape or clear selection if clicked blank
    drawingTools.selectedShape = hit;
    drawingTools.canvasManager.clearPreview();
    drawingTools.redrawAll();
    drawPersistentHighlight();

    if (hit) {
      // start dragging state
      const shape = drawingTools.shapesData[hit.type][hit.index];
      dragInfo = {
        type: hit.type,
        index: hit.index,
        startX: e.clientX,
        startY: e.pageY,
        origXRel: shape.xRel != null ? shape.xRel : shape.x1Rel,
        origYRel: shape.y    != null ? shape.y    : shape.y1
      };
      document.body.style.userSelect = 'none';
    }
  });

  // Mousemove: if dragging, update shape pos & redraw
  document.addEventListener('mousemove', e => {
    if (!dragInfo) return;
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
        shape.x1Rel = dragInfo.origXRel + dx;
        shape.y1    = dragInfo.origYRel + dy;
        shape.x2Rel += dx;
        shape.y2    += dy;
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

    drawingTools.canvasManager.clearPreview();
    drawingTools.redrawAll();
    drawPersistentHighlight();
  });

  // Mouseup: finish drag/save but KEEP the selection
  document.addEventListener('mouseup', () => {
    if (dragInfo) {
      drawingTools.save();
      document.body.style.userSelect = 'auto';
      dragInfo = null;
      drawingTools.canvasManager.clearPreview();
      drawingTools.redrawAll();
      drawPersistentHighlight();
    }
  });
}
