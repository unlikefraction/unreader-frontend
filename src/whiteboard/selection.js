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

    // draw bounding box
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'black';
    ctx.strokeRect(
      bounds.minX - (bounds.minX + bounds.maxX) / 2,
      bounds.minY - (bounds.minY + bounds.maxY) / 2,
      bounds.maxX - bounds.minX,
      bounds.maxY - bounds.minY
    );
    ctx.restore();

    // draw rotation handle
    const circleSize = 15;
    const margin = 10;
    const localY = bounds.minY - (bounds.minY + bounds.maxY) / 2 - circleSize / 2 - margin;
    const localX = 0;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(localX, localY, circleSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // store handle region for hit-testing
    drawingTools.selectedShape.handle = {
      cx,
      cy,
      localX: localX - circleSize / 2,
      localY: localY - circleSize / 2,
      size: circleSize,
      rot
    };
  }

  function getLocalCoords(e) {
    const canvas = drawingTools.canvasManager.previewCtx.canvas;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  document.addEventListener('mousedown', e => {
    if (commonVars.toolActive !== false) return;
    const { x, y } = getLocalCoords(e);
    let hit = null;
    dragInfo = null;

    // rotation handle
    const h = drawingTools.selectedShape?.handle;
    if (h) {
      const { cx, cy, localX, localY, size, rot } = h;
      const dx = x - cx, dy = y - cy;
      const invCos = Math.cos(-rot), invSin = Math.sin(-rot);
      const lx = dx * invCos - dy * invSin;
      const ly = dx * invSin + dy * Math.cos(-rot);
      if (lx >= localX && lx <= localX + size && ly >= localY && ly <= localY + size) {
        dragInfo = {
          mode: 'rotate',
          type: drawingTools.selectedShape.type,
          index: drawingTools.selectedShape.index,
          cx, cy,
          startAng: Math.atan2(y - cy, x - cx),
          origRot: drawingTools.shapesData[drawingTools.selectedShape.type][drawingTools.selectedShape.index].rotation || 0
        };
      }
    }

    // shape/line/arrow body
    if (!dragInfo) {
      outer: for (const type of Object.keys(drawingTools.shapesData)) {
        const list = drawingTools.shapesData[type];
        for (let i = list.length - 1; i >= 0; i--) {
          const shape = list[i];
          const bounds = getShapeBounds(type, shape);
          const zeroX = getZeroXPoint();
          const cxShape = zeroX + (bounds.minX + bounds.maxX) / 2;
          const cyShape = (bounds.minY + bounds.maxY) / 2;
          const rotInv = -((shape.rotation || 0) * Math.PI / 180);
          const dx = x - cxShape;
          const dy = y - cyShape;
          const localX = dx * Math.cos(rotInv) - dy * Math.sin(rotInv);
          const localY = dx * Math.sin(rotInv) + dy * Math.cos(rotInv);
          const halfW = (bounds.maxX - bounds.minX) / 2;
          const halfH = (bounds.maxY - bounds.minY) / 2;

          if (localX >= -halfW && localX <= halfW && localY >= -halfH && localY <= halfH) {
            hit = { type, index: i };

            // determine what to store for movement
            const info = {
              mode: 'move',
              type,
              index: i,
              startX: x,
              startY: y
            };

            // for polygon/rectangle/etc.
            if (shape.points) {
              info.origPoints = shape.points.map(pt => ({ x: pt.xRel, y: pt.y }));
            }
            // for lines and arrows
            else if ('x1Rel' in shape && 'x2Rel' in shape) {
              info.origEnds = {
                x1Rel: shape.x1Rel,
                y1: shape.y1,
                x2Rel: shape.x2Rel,
                y2: shape.y2
              };
            }
            // fallback for other shapes with a single origin
            else {
              info.origX = shape.xRel;
              info.origY = shape.y;
            }

            dragInfo = info;
            break outer;
          }
        }
      }
    }

    if (hit || dragInfo) {
      commonVars.beingEdited = true;
      drawingTools.selectedShape = hit || drawingTools.selectedShape;
    } else if (drawingTools.selectedShape) {
      drawingTools.selectedShape = null;
      commonVars.beingEdited = false;
    }

    drawingTools.canvasManager.clearPreview();
    drawingTools.redrawAll();
    drawPersistentHighlight();
  });

  document.addEventListener('mousemove', e => {
    if (!dragInfo) return;
    const { x, y } = getLocalCoords(e);
    const { mode, type, index } = dragInfo;
    const shape = drawingTools.shapesData[type][index];

    if (mode === 'move') {
      const dx = x - dragInfo.startX;
      const dy = y - dragInfo.startY;

      // polygons and freeform points
      if (dragInfo.origPoints) {
        shape.points.forEach((pt, i) => {
          pt.xRel = dragInfo.origPoints[i].x + dx;
          pt.y    = dragInfo.origPoints[i].y + dy;
        });
      }
      // lines and arrows
      else if (dragInfo.origEnds) {
        shape.x1Rel = dragInfo.origEnds.x1Rel + dx;
        shape.y1    = dragInfo.origEnds.y1    + dy;
        shape.x2Rel = dragInfo.origEnds.x2Rel + dx;
        shape.y2    = dragInfo.origEnds.y2    + dy;
      }
      // other single-origin shapes
      else {
        shape.xRel = dragInfo.origX + dx;
        shape.y    = dragInfo.origY + dy;
      }
    }
    else if (mode === 'rotate') {
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
    drawingTools.canvasManager.clearPreview();
    drawingTools.redrawAll();
    drawPersistentHighlight();
  });

  document.addEventListener('keydown', e => {
    if (!drawingTools.selectedShape) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const { type, index } = drawingTools.selectedShape;
      drawingTools.shapesData[type].splice(index, 1);
      drawingTools.selectedShape = null;
      commonVars.beingEdited = false;
      drawingTools.canvasManager.clearPreview();
      drawingTools.redrawAll();
      drawingTools.save();
      e.preventDefault();
    }
  });
}
