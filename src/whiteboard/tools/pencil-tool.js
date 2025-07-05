import { getStroke } from 'perfect-freehand';
import { computeCoords, getZeroXPoint } from '../utils.js';

/**
 * Pencil drawing tool
 */
export function handlePencil(drawingTools, type, e) {
  if (!drawingTools.activeTool?.classList.contains('pencil')) return;
  drawingTools._handleFreehand(type, e, 'pencil', drawingTools.pencilOptions, 'black', 1);
}

/** Generic freehand helper - Updated to not auto-switch tools */
export function handleFreehand(drawingTools, type, e, dataKey, options, color, opacity) {
  const { xRel, y } = computeCoords(e, getZeroXPoint);
  const zeroX = getZeroXPoint();

  if (type === 'mousedown') {
    drawingTools.isDrawing = true;
    drawingTools.currentPoints = [{ xRel, y }];
    document.body.style.userSelect = 'none';
  } else if (type === 'mousemove' && drawingTools.isDrawing) {
    drawingTools.currentPoints.push({ xRel, y });
    drawingTools.canvasManager.clearPreview();
    const raw = drawingTools.currentPoints.map(pt => [pt.xRel, pt.y]);
    const stroke = getStroke(raw, options);
    const poly = stroke.map(([x,y]) => [zeroX + x, y]);
    drawingTools.canvasManager.previewCtx.beginPath();
    poly.forEach(([px,py], i) => i ? drawingTools.canvasManager.previewCtx.lineTo(px,py) : drawingTools.canvasManager.previewCtx.moveTo(px,py));
    drawingTools.canvasManager.previewCtx.closePath();
    drawingTools.canvasManager.previewCtx.fillStyle = dataKey==='highlighter' ? drawingTools._hexToRgba(color, opacity) : color;
    drawingTools.canvasManager.previewCtx.fill();
  } else if (type === 'mouseup' && drawingTools.isDrawing) {
    drawingTools.isDrawing = false;
    document.body.style.userSelect = 'auto';
    drawingTools.canvasManager.clearPreview();

    drawingTools.shapesData[dataKey].push({ points: drawingTools.currentPoints, options });
    const raw = drawingTools.currentPoints.map(pt => [pt.xRel, pt.y]);
    const stroke = getStroke(raw, options);
    const poly = stroke.map(([x,y]) => [zeroX + x, y]);
    drawingTools.canvasManager.drawCtx.beginPath();
    poly.forEach(([px,py], i) => i ? drawingTools.canvasManager.drawCtx.lineTo(px,py) : drawingTools.canvasManager.drawCtx.moveTo(px,py));
    drawingTools.canvasManager.drawCtx.closePath();
    drawingTools.canvasManager.drawCtx.fillStyle = dataKey==='highlighter' ? drawingTools._hexToRgba(color, opacity) : color;
    drawingTools.canvasManager.drawCtx.fill();

    drawingTools.save();
    // Removed the auto-switch to cursor tool - tools stay active for continuous drawing
  }
}