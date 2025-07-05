import { getStroke } from 'perfect-freehand';
import { computeCoords, getZeroXPoint, pointInShapeBounds, hexToRgba } from '../utils.js';

/**
 * Eraser drawing tool
 */
export function handleEraser(drawingTools, type, e) {
  if (!drawingTools.activeTool?.classList.contains('eraser')) return;
  const { xRel, y } = computeCoords(e, getZeroXPoint);

  if (type === 'mousedown') {
    drawingTools.isErasing = true;
    drawingTools.erasedShapeIds.clear();
    document.body.style.userSelect = 'none';

  } else if (type === 'mousemove' && drawingTools.isErasing) {
    // redraw to apply fading
    drawingTools.redrawAll();

    // detect shapes under cursor using proper bounding boxes
    drawingTools.canvasManager.clearPreview();
    Object.entries(drawingTools.shapesData).forEach(([kind, arr]) =>
      arr.forEach((shape, idx) => {
        const id = `${kind}-${idx}`;
        if (!drawingTools.erasedShapeIds.has(id) && pointInShapeBounds(kind, shape, xRel, y)) {
          drawingTools.erasedShapeIds.add(id);
        }
      })
    );

    // preview overlay
    drawingTools.erasedShapeIds.forEach(id => {
      const [kind, idx] = id.split('-');
      drawShapePreview(drawingTools, kind, drawingTools.shapesData[kind][idx], 0.2);
    });

  } else if (type === 'mouseup' && drawingTools.isErasing) {
    drawingTools.isErasing = false;
    document.body.style.userSelect = 'auto';
    drawingTools.canvasManager.clearPreview();

    // remove flagged shapes
    Object.keys(drawingTools.shapesData).forEach(kind => {
      drawingTools.shapesData[kind] = drawingTools.shapesData[kind].filter((_, i) => !drawingTools.erasedShapeIds.has(`${kind}-${i}`));
    });
    drawingTools.erasedShapeIds.clear();
    drawingTools.save();
    drawingTools.redrawAll();

    const cursor = drawingTools.tools.find(t => t.classList.contains('cursor'));
    if (cursor) drawingTools.setActiveTool(cursor);
  }
}

/** Draw faded preview of a shape */
export function drawShapePreview(drawingTools, type, shape, opacity) {
  const zeroX = getZeroXPoint();
  drawingTools.canvasManager.previewCtx.save();
  drawingTools.canvasManager.previewCtx.globalAlpha = opacity;
  if (type === 'rectangle') {
    drawingTools.canvasManager.previewRough.rectangle(
      zeroX + shape.xRel, shape.y,
      shape.widthRel, shape.height,
      { stroke: 'black', strokeWidth: drawingTools.strokeWidth, roughness: drawingTools.roughness, seed: shape.seed }
    );
  } else if (type === 'ellipse') {
    const w = Math.abs(shape.widthRel), h = Math.abs(shape.height);
    const cx = zeroX + shape.xRel + shape.widthRel/2;
    const cy = shape.y + shape.height/2;
    drawingTools.canvasManager.previewRough.ellipse(
      cx, cy, w, h,
      { stroke: 'black', strokeWidth: drawingTools.strokeWidth, roughness: drawingTools.roughness, seed: shape.seed }
    );
  } else if (type === 'line') {
    drawingTools.canvasManager.previewRough.line(
      zeroX + shape.x1Rel, shape.y1,
      zeroX + shape.x2Rel, shape.y2,
      { stroke: 'black', strokeWidth: drawingTools.strokeWidth, roughness: drawingTools.roughness, seed: shape.seed }
    );
  } else if (type === 'arrow') {
    drawingTools.canvasManager.previewRough.line(
      zeroX + shape.x1Rel, shape.y1,
      zeroX + shape.x2Rel, shape.y2,
      { stroke: 'black', strokeWidth: drawingTools.strokeWidth, roughness: drawingTools.roughness, seed: shape.seed }
    );
    drawingTools._previewArrowHead(shape.x1Rel, shape.y1, shape.x2Rel, shape.y2, shape.seed);
  } else if (type === 'pencil' || type === 'highlighter') {
    const raw = shape.points.map(pt => [pt.xRel, pt.y]);
    const stroke = getStroke(raw, shape.options);
    const poly = stroke.map(([x,y]) => [zeroX + x, y]);
    drawingTools.canvasManager.previewCtx.beginPath();
    poly.forEach(([px,py], i) => i ? drawingTools.canvasManager.previewCtx.lineTo(px,py) : drawingTools.canvasManager.previewCtx.moveTo(px,py));
    drawingTools.canvasManager.previewCtx.closePath();
    drawingTools.canvasManager.previewCtx.fillStyle = type==='highlighter'
      ? hexToRgba(shape.options.color, shape.options.opacity)
      : 'black';
    drawingTools.canvasManager.previewCtx.fill();
  }
  // Note: Text fading is now handled directly in redrawAll() by setting DOM element opacity
  drawingTools.canvasManager.previewCtx.restore();
}