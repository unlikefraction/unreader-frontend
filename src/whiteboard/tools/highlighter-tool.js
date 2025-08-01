// -----highlighter-tool.js-----

import { getStroke } from 'perfect-freehand';
import { computeCoords, getZeroXPoint } from '../utils.js';

/**
 * Generic freehand helper – used by pencil and highlighter tools
 */
export function handleFreehand(
  drawingTools,
  type,
  e,
  dataKey,
  options,
  color,
  opacity
) {
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
    const poly = stroke.map(([px, py]) => [zeroX + px, py]);

    const ctx = drawingTools.canvasManager.previewCtx;
    ctx.beginPath();
    poly.forEach(([px, py], i) =>
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
    );
    ctx.closePath();
    ctx.fillStyle =
      dataKey === 'highlighter'
        ? drawingTools._hexToRgba(color, opacity)
        : color;
    ctx.fill();
  } else if (type === 'mouseup' && drawingTools.isDrawing) {
    drawingTools.isDrawing = false;
    document.body.style.userSelect = 'auto';
    drawingTools.canvasManager.clearPreview();

    // Persist the stroke data with color and opacity
    drawingTools.shapesData[dataKey].push({
      points: drawingTools.currentPoints,
      options,
      color,
      opacity
    });

    const raw = drawingTools.currentPoints.map(pt => [pt.xRel, pt.y]);
    const stroke = getStroke(raw, options);
    const poly = stroke.map(([px, py]) => [zeroX + px, py]);

    const ctx = drawingTools.canvasManager.drawCtx;
    ctx.beginPath();
    poly.forEach(([px, py], i) =>
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
    );
    ctx.closePath();
    ctx.fillStyle =
      dataKey === 'highlighter'
        ? drawingTools._hexToRgba(color, opacity)
        : color;
    ctx.fill();

    drawingTools.save();
    // tool remains active for continuous drawing
  }
}

/**
 * Highlighter drawing tool
 */
export function handleHighlight(drawingTools, type, e) {
  if (!drawingTools.activeTool?.classList.contains('highlighter')) return;

  handleFreehand(
    drawingTools,
    type,
    e,
    'highlighter',
    drawingTools.highlightOptions,           // freehand options
    drawingTools.highlightColor,              // use highlightColor instead of selectedColor
    drawingTools.highlightOptions.opacity    // the opacity remains from options
  );
}
