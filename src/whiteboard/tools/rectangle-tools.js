import { computeCoords, getZeroXPoint } from '../utils.js';

/**
 * Rectangle drawing tool
 */
export function handleRectangle(drawingTools, type, e) {
  if (!drawingTools.activeTool?.classList.contains('rectangle')) return;
  const { xRel, y } = computeCoords(e, getZeroXPoint);
  
  drawingTools._genericDraw(
    type, xRel, y,
    (x1,y1,x2,y2,seed) => {
      drawingTools.canvasManager.previewRough.rectangle(
        getZeroXPoint()+x1, y1, x2-x1, y2-y1,
        { stroke:'black', strokeWidth:drawingTools.strokeWidth, roughness:drawingTools.roughness, seed }
      );
    },
    (x1,y1,x2,y2,seed) => {
      drawingTools.shapesData.rectangle.push({ xRel:x1, y:y1, widthRel:x2-x1, height:y2-y1, seed });
      drawingTools.canvasManager.drawRough.rectangle(
        getZeroXPoint()+x1, y1, x2-x1, y2-y1,
        { stroke:'black', strokeWidth:drawingTools.strokeWidth, roughness:drawingTools.roughness, seed }
      );
    }
  );
}