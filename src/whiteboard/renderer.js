/**
 * Renderer for drawing all shapes and their bounding borders
 */
import { getZeroXPoint, getShapeBounds } from './utils.js';
import { drawArrowHead } from './tools/arrow-tool.js';
import { getStroke } from 'perfect-freehand';

export function redrawAll(drawingTools) {
  // Remove completed text editors
  document.querySelectorAll('.annotation-text-editor.completed').forEach(el => el.remove());

  // Resize & clear the draw canvas
  drawingTools.canvasManager.sizeCanvases();
  const drawCtx = drawingTools.canvasManager.drawCtx;
  drawCtx.clearRect(0, 0, drawingTools.canvasManager.drawCanvas.width, drawingTools.canvasManager.drawCanvas.height);

  const zeroX = getZeroXPoint();

  // helper to fade flagged shapes (text is skipped)
  const runDraw = (id, drawFn) => {
    if (drawingTools.isErasing && drawingTools.erasedShapeIds.has(id)) {
      drawCtx.save();
      drawCtx.globalAlpha = 0.2;
    }
    drawFn();
    if (drawingTools.isErasing && drawingTools.erasedShapeIds.has(id)) {
      drawCtx.restore();
    }
  };

  // DRAW SHAPES
  // rectangles
  drawingTools.shapesData.rectangle.forEach((r, i) => {
    const id = `rectangle-${i}`;
    runDraw(id, () => {
      drawingTools.canvasManager.drawRough.rectangle(
        zeroX + r.xRel, r.y,
        r.widthRel, r.height,
        { stroke: 'black', strokeWidth: drawingTools.strokeWidth, roughness: drawingTools.roughness, seed: r.seed }
      );
    });
  });

  // ellipses
  drawingTools.shapesData.ellipse.forEach((e, i) => {
    const id = `ellipse-${i}`;
    runDraw(id, () => {
      const w = Math.abs(e.widthRel), h = Math.abs(e.height);
      const cx = zeroX + e.xRel + e.widthRel / 2;
      const cy = e.y + e.height / 2;
      drawingTools.canvasManager.drawRough.ellipse(
        cx, cy, w, h,
        { stroke: 'black', strokeWidth: drawingTools.strokeWidth, roughness: drawingTools.roughness, seed: e.seed }
      );
    });
  });

  // lines
  drawingTools.shapesData.line.forEach((l, i) => {
    const id = `line-${i}`;
    runDraw(id, () => {
      drawingTools.canvasManager.drawRough.line(
        zeroX + l.x1Rel, l.y1,
        zeroX + l.x2Rel, l.y2,
        { stroke: 'black', strokeWidth: drawingTools.strokeWidth, roughness: drawingTools.roughness, seed: l.seed }
      );
    });
  });

  // arrows
  drawingTools.shapesData.arrow.forEach((a, i) => {
    const id = `arrow-${i}`;
    runDraw(id, () => {
      drawingTools.canvasManager.drawRough.line(
        zeroX + a.x1Rel, a.y1,
        zeroX + a.x2Rel, a.y2,
        { stroke: 'black', strokeWidth: drawingTools.strokeWidth, roughness: drawingTools.roughness, seed: a.seed }
      );
      drawArrowHead(drawingTools, a.x1Rel, a.y1, a.x2Rel, a.y2, a.seed);
    });
  });

  // pencil stroke
  drawingTools.shapesData.pencil.forEach((p, i) => {
    if (!p.points || p.points.length === 0) return;
    const id = `pencil-${i}`;
    runDraw(id, () => {
      const raw = p.points.map(pt => [pt.xRel, pt.y]);
      const stroke = getStroke(raw, p.options);
      drawCtx.beginPath();
      stroke.forEach(([x, y], j) => j ? drawCtx.lineTo(zeroX + x, y) : drawCtx.moveTo(zeroX + x, y));
      drawCtx.closePath();
      drawCtx.fillStyle = 'black';
      drawCtx.fill();
    });
  });

  // highlighter
  drawingTools.shapesData.highlighter.forEach((h, i) => {
    if (!h.points || h.points.length === 0) return;
    const id = `highlighter-${i}`;
    runDraw(id, () => {
      const raw = h.points.map(pt => [pt.xRel, pt.y]);
      const stroke = getStroke(raw, h.options);
      drawCtx.beginPath();
      stroke.forEach(([x, y], j) => j ? drawCtx.lineTo(zeroX + x, y) : drawCtx.moveTo(zeroX + x, y));
      drawCtx.closePath();
      drawCtx.fillStyle = drawingTools._hexToRgba(h.options.color, h.options.opacity);
      drawCtx.fill();
    });
  });

  // text
  drawingTools.shapesData.text.forEach((t, i) => {
    const id = `text-${i}`;
    // Create text div and position it above canvas so eraser won't hide it
    const div = document.createElement('div');
    div.innerText = t.text;
    div.classList.add('annotation-text-editor', 'completed');
    div.setAttribute('data-text-id', id);
    Object.assign(div.style, {
      position: 'absolute',
      left: `${zeroX + t.xRel}px`,
      top: `${t.y}px`,
      pointerEvents: 'none',
      fontSize: '24px',
      background: 'transparent',
      zIndex: '-1',
      opacity: (drawingTools.isErasing && drawingTools.erasedShapeIds.has(id)) ? '0.2' : '1'
    });
    document.body.appendChild(div);
  });
}