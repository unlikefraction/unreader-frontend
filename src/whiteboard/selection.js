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

    // store handle info for hit test
    drawingTools.selectedShape.handle = { cx, cy, localX, localY, size, rot };
  }

  function getLocalCoords(e) {
    // use the preview canvas element's DOM node
    const canvas = drawingTools.canvasManager.previewCtx.canvas;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  document.addEventListener('mousedown', e => {
    if (commonVars.toolActive !== false) return;
    const { x, y } = getLocalCoords(e);
    let hit = null;

    // rotated handle hit-test via inverse rotation
    const h = drawingTools.selectedShape?.handle;
    if (h) {
      const { cx, cy, localX, localY, size, rot } = h;
      // translate into handle local coords
      const dx = x - cx;
      const dy = y - cy;
      const invCos = Math.cos(-rot);
      const invSin = Math.sin(-rot);
      const hxLocal = dx * invCos - dy * invSin;
      const hyLocal = dx * invSin + dy * invCos;
      const half = size / 2;
      const centerX = localX + half;
      const centerY = localY + half;
      if (
        hxLocal >= centerX - half && hxLocal <= centerX + half &&
        hyLocal >= centerY - half && hyLocal <= centerY + half
      ) {
        // start rotate
        const sel = drawingTools.selectedShape;
        const { minX, maxX, minY, maxY } = sel.bounds;
        const zeroX = getZeroXPoint();
        const cxShape = zeroX + (minX + maxX) / 2;
        const cyShape = (minY + maxY) / 2;
        dragInfo = {
          mode: 'rotate',
          type: sel.type,
          index: sel.index,
          cx: cxShape,
          cy: cyShape,
          startAng: Math.atan2(y - cyShape, x - cxShape),
          origRot: drawingTools.shapesData[sel.type][sel.index].rotation || 0
        };
        commonVars.beingEdited = true;
        document.body.style.userSelect = 'none';
        hit = sel;
      }
    }

    // shape hit-test (rotated bounds)
    if (!hit) {
      outer: for (const type of Object.keys(drawingTools.shapesData)) {
        const list = drawingTools.shapesData[type];
        for (let i = list.length - 1; i >= 0; i--) {
          const shape = list[i];
          const bounds = getShapeBounds(type, shape);
          const zeroX = getZeroXPoint();
          const cxShape = zeroX + (bounds.minX + bounds.maxX) / 2;
          const cyShape = (bounds.minY + bounds.maxY) / 2;
          const rot = -((shape.rotation || 0) * Math.PI / 180);
          const dx = x - cxShape;
          const dy = y - cyShape;
          const localX = dx * Math.cos(rot) - dy * Math.sin(rot);
          const localY = dx * Math.sin(rot) + dy * Math.cos(rot);
          const halfW = (bounds.maxX - bounds.minX) / 2;
          const halfH = (bounds.maxY - bounds.minY) / 2;
          if (
            localX >= -halfW && localX <= halfW &&
            localY >= -halfH && localY <= halfH
          ) {
            hit = { type, index: i };
            const base = shape;
            const info = { mode: 'move', type, index: i, startX: x, startY: y };
            if (['rectangle','ellipse','text'].includes(type)) {
              info.origX = base.xRel;
              info.origY = base.y;
            } else if (['line','arrow'].includes(type)) {
              info.orig = { x1: base.x1Rel, y1: base.y1, x2: base.x2Rel, y2: base.y2 };
            } else {
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
    const { x, y } = getLocalCoords(e);
    const { mode, type, index } = dragInfo;
    const shape = drawingTools.shapesData[type][index];

    if (mode === 'move') {
      const dx = x - dragInfo.startX;
      const dy = y - dragInfo.startY;
      if (['rectangle','ellipse','text'].includes(type)) {
        shape.xRel = dragInfo.origX + dx;
        shape.y    = dragInfo.origY + dy;
      } else if (['line','arrow'].includes(type)) {
        shape.x1Rel = dragInfo.orig.x1 + dx;
        shape.y1    = dragInfo.orig.y1 + dy;
        shape.x2Rel = dragInfo.orig.x2 + dx;
        shape.y2    = dragInfo.orig.y2 + dy;
      } else {
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
