// ---------renderer.js---------

import { getZeroXPoint, getShapeBounds } from '../utils.js';
import { drawArrowHead } from '../tools/arrow-tool.js';
import { getStroke } from 'perfect-freehand';

/**
 * Renderer for drawing all shapes and their bounding borders, now supporting per-shape rotation
 */
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
      drawCtx.save(); drawCtx.globalAlpha = 0.2; drawFn(); drawCtx.restore();
    } else {
      drawFn();
    }
  };

  // DRAW SHAPES
  // rectangles
  drawingTools.shapesData.rectangle.forEach((r, i) => {
    const id = `rectangle-${i}`;
    runDraw(id, () => {
      const w = r.widthRel;
      const h = r.height;
      const cx = zeroX + r.xRel + w / 2;
      const cy = r.y + h / 2;
      const rotRad = ((r.rotation || 0) * Math.PI) / 180;
      drawCtx.save();
      drawCtx.translate(cx, cy);
      drawCtx.rotate(rotRad);
      drawingTools.canvasManager.drawRough.rectangle(
        -w / 2, -h / 2,
        w, h,
        {
          stroke: r.color,
          strokeWidth: drawingTools.strokeWidth,
          roughness: drawingTools.roughness,
          seed: r.seed
        }
      );
      drawCtx.restore();
    });
  });

  // ellipses
  drawingTools.shapesData.ellipse.forEach((e, i) => {
    const id = `ellipse-${i}`;
    runDraw(id, () => {
      const w = Math.abs(e.widthRel);
      const h = Math.abs(e.height);
      const cx = zeroX + e.xRel + e.widthRel / 2;
      const cy = e.y + e.height / 2;
      const rotRad = ((e.rotation || 0) * Math.PI) / 180;
      drawCtx.save();
      drawCtx.translate(cx, cy);
      drawCtx.rotate(rotRad);
      drawingTools.canvasManager.drawRough.ellipse(
        0, 0, w, h,
        {
          stroke: e.color,
          strokeWidth: drawingTools.strokeWidth,
          roughness: drawingTools.roughness,
          seed: e.seed
        }
      );
      drawCtx.restore();
    });
  });

  // lines
  drawingTools.shapesData.line.forEach((l, i) => {
    const id = `line-${i}`;
    runDraw(id, () => {
      const x1 = zeroX + l.x1Rel;
      const y1 = l.y1;
      const x2 = zeroX + l.x2Rel;
      const y2 = l.y2;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rotRad = ((l.rotation || 0) * Math.PI) / 180;
      drawCtx.save();
      drawCtx.translate(cx, cy);
      drawCtx.rotate(rotRad);
      drawingTools.canvasManager.drawRough.line(
        x1 - cx, y1 - cy,
        x2 - cx, y2 - cy,
        {
          stroke: l.color,
          strokeWidth: drawingTools.strokeWidth,
          roughness: drawingTools.roughness,
          seed: l.seed
        }
      );
      drawCtx.restore();
    });
  });

  // arrows
  drawingTools.shapesData.arrow.forEach((a, i) => {
    const id = `arrow-${i}`;
    runDraw(id, () => {
      const x1 = zeroX + a.x1Rel;
      const y1 = a.y1;
      const x2 = zeroX + a.x2Rel;
      const y2 = a.y2;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rotRad = ((a.rotation || 0) * Math.PI) / 180;
      drawCtx.save();
      drawCtx.translate(cx, cy);
      drawCtx.rotate(rotRad);
      drawingTools.canvasManager.drawRough.line(
        x1 - cx, y1 - cy,
        x2 - cx, y2 - cy,
        {
          stroke: a.color,
          strokeWidth: drawingTools.strokeWidth,
          roughness: drawingTools.roughness,
          seed: a.seed
        }
      );
      drawArrowHead(
        Object.assign({}, drawingTools, { selectedColor: a.color }),
        x1 - cx,
        y1 - cy,
        x2 - cx,
        y2 - cy,
        a.seed
      );
      drawCtx.restore();
    });
  });

  // pencil strokes
  drawingTools.shapesData.pencil.forEach((p, i) => {
    if (!p.points || p.points.length === 0) return;
    const id = `pencil-${i}`;
    runDraw(id, () => {
      const raw = p.points.map(pt => [pt.xRel, pt.y]);
      const xs = raw.map(r => r[0]), ys = raw.map(r => r[1]);
      const cxRel = xs.reduce((a,b)=>a+b)/xs.length;
      const cy = ys.reduce((a,b)=>a+b)/ys.length;
      const cx = zeroX + cxRel;
      const rotRad = ((p.rotation || 0) * Math.PI) / 180;
      const stroke = getStroke(raw, p.options);
      drawCtx.save();
      drawCtx.translate(cx, cy);
      drawCtx.rotate(rotRad);
      drawCtx.beginPath();
      stroke.forEach(([x, y], j) => {
        const rx = x - cxRel;
        const ry = y - cy;
        j ? drawCtx.lineTo(rx, ry) : drawCtx.moveTo(rx, ry);
      });
      drawCtx.closePath();
      drawCtx.fillStyle = p.color;
      drawCtx.fill();
      drawCtx.restore();
    });
  });

  // highlighter strokes
  drawingTools.shapesData.highlighter.forEach((h, i) => {
    if (!h.points || h.points.length === 0) return;
    const id = `highlighter-${i}`;
    runDraw(id, () => {
      const raw = h.points.map(pt => [pt.xRel, pt.y]);
      const xs = raw.map(r => r[0]), ys = raw.map(r => r[1]);
      const cxRel = xs.reduce((a,b)=>a+b)/xs.length;
      const cy = ys.reduce((a,b)=>a+b)/ys.length;
      const cx = zeroX + cxRel;
      const rotRad = ((h.rotation || 0) * Math.PI) / 180;
      const stroke = getStroke(raw, h.options);
      drawCtx.save();
      drawCtx.translate(cx, cy);
      drawCtx.rotate(rotRad);
      drawCtx.beginPath();
      stroke.forEach(([x, y], j) => {
        const rx = x - cxRel;
        const ry = y - cy;
        j ? drawCtx.lineTo(rx, ry) : drawCtx.moveTo(rx, ry);
      });
      drawCtx.closePath();
      drawCtx.fillStyle = drawingTools._hexToRgba(h.color, h.opacity);
      drawCtx.fill();
      drawCtx.restore();
    });
  });

  // TEXT: render and position using measured bounds for accurate highlighting
  drawingTools.shapesData.text.forEach((t, i) => {
    const id = `text-${i}`;
    const bounds = getShapeBounds('text', t);
    const rotDeg = t.rotation || 0;
    const cx = zeroX + (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const div = document.createElement('div');
    div.innerText = t.text;
    div.classList.add('annotation-text-editor', 'completed');
    div.setAttribute('data-text-id', id);
    Object.assign(div.style, {
      position: 'absolute',
      left: `${cx}px`,
      top: `${cy}px`,
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(-50%, -50%) rotate(${rotDeg}deg)`,
      transformOrigin: 'center center',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      textAlign: 'center',
      pointerEvents: 'none',
      fontSize: `${t.fontSize || 24}px`,
      fontFamily: t.fontFamily || 'sans-serif',
      lineHeight: 'normal',
      whiteSpace: 'pre-wrap',
      background: 'transparent',
      color: t.color,
      zIndex: '-1',
      opacity: (drawingTools.isErasing && drawingTools.erasedShapeIds.has(id)) ? '0.2' : '1'
    });
    document.body.appendChild(div);
  });
}