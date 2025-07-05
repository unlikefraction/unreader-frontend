import { getStroke } from 'perfect-freehand';
import { getZeroXPoint, hexToRgba } from './utils.js';

/**
 * Renderer for drawing all shapes
 */
export function redrawAll(drawingTools) {
  document.querySelectorAll('.annotation-text-editor.completed').forEach(el => el.remove());
  drawingTools.canvasManager.sizeCanvases();
  drawingTools.canvasManager.clearDraw();
  const zeroX = getZeroXPoint();

  // helper to fade flagged shapes
  const runDraw = (id, drawFn) => {
    if (drawingTools.isErasing && drawingTools.erasedShapeIds.has(id)) {
      drawingTools.canvasManager.drawCtx.save();
      drawingTools.canvasManager.drawCtx.globalAlpha = 0.2;
    }
    drawFn();
    if (drawingTools.isErasing && drawingTools.erasedShapeIds.has(id)) {
      drawingTools.canvasManager.drawCtx.restore();
    }
  };

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
      const cx = zeroX + e.xRel + e.widthRel/2;
      const cy = e.y + e.height/2;
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

  // pencil
  drawingTools.shapesData.pencil.forEach((p, i) => {
    const id = `pencil-${i}`;
    runDraw(id, () => {
      const raw = p.points.map(pt => [pt.xRel, pt.y]);
      const stroke = getStroke(raw, p.options);
      const poly = stroke.map(([x,y]) => [zeroX + x, y]);
      drawingTools.canvasManager.drawCtx.beginPath();
      poly.forEach(([px,py], j) => j ? drawingTools.canvasManager.drawCtx.lineTo(px,py) : drawingTools.canvasManager.drawCtx.moveTo(px,py));
      drawingTools.canvasManager.drawCtx.closePath();
      drawingTools.canvasManager.drawCtx.fillStyle = 'black';
      drawingTools.canvasManager.drawCtx.fill();
    });
  });

  // highlighter
  drawingTools.shapesData.highlighter.forEach((h, i) => {
    const id = `highlighter-${i}`;
    runDraw(id, () => {
      const raw = h.points.map(pt => [pt.xRel, pt.y]);
      const stroke = getStroke(raw, h.options);
      const poly = stroke.map(([x,y]) => [zeroX + x, y]);
      drawingTools.canvasManager.drawCtx.beginPath();
      poly.forEach(([px,py], j) => j ? drawingTools.canvasManager.drawCtx.lineTo(px,py) : drawingTools.canvasManager.drawCtx.moveTo(px,py));
      drawingTools.canvasManager.drawCtx.closePath();
      drawingTools.canvasManager.drawCtx.fillStyle = hexToRgba(h.options.color, h.options.opacity);
      drawingTools.canvasManager.drawCtx.fill();
    });
  });

  // text
  drawingTools.shapesData.text.forEach((t, i) => {
    const id = `text-${i}`;
    const div = document.createElement('div');
    div.innerText = t.text;
    div.classList.add('annotation-text-editor', 'completed');
    div.setAttribute('data-text-id', id); // Add ID for eraser tracking
    
    // Calculate rotation based on horizontal position
    const centerX = window.innerWidth / 2;
    const textX = zeroX + t.xRel;
    const maxDistance = window.innerWidth / 2; // Distance from center to edge
    const distanceFromCenter = textX - centerX;
    // Map distance to rotation: -30deg (left) to +30deg (right)
    const rotation = (distanceFromCenter / maxDistance) * 30;
    const clampedRotation = Math.max(-30, Math.min(30, rotation));
    
    Object.assign(div.style, {
      position: 'absolute',
      left: `${textX}px`,
      top: `${t.y}px`,
      display: 'inline-block',
      padding: '4px',
      background: 'transparent',
      pointerEvents: 'none',
      zIndex: '-1000',
      fontSize: '24px',
      transform: `rotate(${clampedRotation}deg)`,
      transformOrigin: 'left center',
      // Apply fading if this text is flagged for erasing
      opacity: (drawingTools.isErasing && drawingTools.erasedShapeIds.has(id)) ? '0.2' : '1'
    });
    document.body.appendChild(div);
  });
}

/** Draw arrow head */
export function drawArrowHead(drawingTools, x1, y1, x2, y2, seed) {
  const zeroX = getZeroXPoint();
  const dx = x2 - x1; const dy = y2 - y1;
  const angle = Math.atan2(dy, dx);
  const len = Math.hypot(dx, dy) * 0.2;
  [angle - Math.PI/6, angle + Math.PI/6].forEach(wing => {
    const x3 = zeroX + x2 - len * Math.cos(wing);
    const y3 = y2 - len * Math.sin(wing);
    drawingTools.canvasManager.drawRough.line(zeroX + x2, y2, x3, y3, {
      stroke: 'black', strokeWidth: drawingTools.strokeWidth, roughness: drawingTools.roughness, seed
    });
  });
}