import { computeCoords, getZeroXPoint } from '../utils.js';

/**
 * Arrow drawing tool
 */
export function handleArrow(drawingTools, type, e) {
  if (!drawingTools.activeTool?.classList.contains('arrow')) return;
  const { xRel, y } = computeCoords(e, getZeroXPoint);
  
  drawingTools._genericDraw(
    type, xRel, y,
    (x1,y1,x2,y2,seed) => {
      drawingTools.canvasManager.previewRough.line(
        getZeroXPoint()+x1, y1,
        getZeroXPoint()+x2, y2,
        { stroke:'black', strokeWidth:drawingTools.strokeWidth, roughness:drawingTools.roughness, seed }
      );
      drawingTools._previewArrowHead(x1, y1, x2, y2, seed);
    },
    (x1,y1,x2,y2,seed) => {
      drawingTools.shapesData.arrow.push({ x1Rel:x1, y1, x2Rel:x2, y2, seed });
      drawingTools.canvasManager.drawRough.line(
        getZeroXPoint()+x1, y1,
        getZeroXPoint()+x2, y2,
        { stroke:'black', strokeWidth:drawingTools.strokeWidth, roughness:drawingTools.roughness, seed }
      );
      drawingTools._drawArrowHead(x1, y1, x2, y2, seed);
    }
  );
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

/** Preview arrow head */
export function previewArrowHead(drawingTools, x1, y1, x2, y2, seed) {
  const zeroX = getZeroXPoint();
  const dx = x2 - x1; const dy = y2 - y1;
  const angle = Math.atan2(dy, dx);
  const len = Math.hypot(dx, dy) * 0.2;
  [angle - Math.PI/6, angle + Math.PI/6].forEach(wing => {
    const x3 = zeroX + x2 - len * Math.cos(wing);
    const y3 = y2 - len * Math.sin(wing);
    drawingTools.canvasManager.previewRough.line(zeroX + x2, y2, x3, y3, {
      stroke: 'black', strokeWidth: drawingTools.strokeWidth, roughness: drawingTools.roughness, seed
    });
  });
}