import { computeCoords, getZeroXPoint } from '../utils.js';

/**
 * Line drawing tool
 */
export function handleLine(drawingTools, type, e) {
  if (!drawingTools.activeTool?.classList.contains('line')) return;
  const { xRel, y } = computeCoords(e, getZeroXPoint);
  
  drawingTools._genericDraw(
    type, xRel, y,
    (x1,y1,x2,y2,seed) => {
      drawingTools.canvasManager.previewRough.line(
        getZeroXPoint()+x1, y1,
        getZeroXPoint()+x2, y2,
        { stroke:'black', strokeWidth:drawingTools.strokeWidth, roughness:drawingTools.roughness, seed }
      );
    },
    (x1,y1,x2,y2,seed) => {
      drawingTools.shapesData.line.push({ x1Rel:x1, y1, x2Rel:x2, y2, seed });
      drawingTools.canvasManager.drawRough.line(
        getZeroXPoint()+x1, y1,
        getZeroXPoint()+x2, y2,
        { stroke:'black', strokeWidth:drawingTools.strokeWidth, roughness:drawingTools.roughness, seed }
      );
    }
  );
}