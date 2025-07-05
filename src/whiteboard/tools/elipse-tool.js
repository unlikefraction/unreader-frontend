import { computeCoords, getZeroXPoint } from '../utils.js';

/**
 * Ellipse drawing tool
 */
export function handleEllipse(drawingTools, type, e) {
  if (!drawingTools.activeTool?.classList.contains('circle')) return;
  const { xRel, y } = computeCoords(e, getZeroXPoint);
  
  drawingTools._genericDraw(
    type, xRel, y,
    (x1,y1,x2,y2,seed) => {
      const cx = getZeroXPoint()+x1+(x2-x1)/2;
      const cy = y1+(y2-y1)/2;
      drawingTools.canvasManager.previewRough.ellipse(
        cx, cy, Math.abs(x2-x1), Math.abs(y2-y1),
        { stroke:'black', strokeWidth:drawingTools.strokeWidth, roughness:drawingTools.roughness, seed }
      );
    },
    (x1,y1,x2,y2,seed) => {
      drawingTools.shapesData.ellipse.push({ xRel:x1, y:y1, widthRel:x2-x1, height:y2-y1, seed });
      const cx = getZeroXPoint()+x1+(x2-x1)/2;
      const cy = y1+(y2-y1)/2;
      drawingTools.canvasManager.drawRough.ellipse(
        cx, cy, Math.abs(x2-x1), Math.abs(y2-y1),
        { stroke:'black', strokeWidth:drawingTools.strokeWidth, roughness:drawingTools.roughness, seed }
      );
    }
  );
}