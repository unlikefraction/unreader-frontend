import { computeCoords, getZeroXPoint } from '../utils.js';

/**
 * Rectangle drawing tool with Shift for perfect squares
 */
export function handleRectangle(drawingTools, type, e) {
  // Only run when rectangle tool is active
  if (!drawingTools.activeTool?.classList.contains('rectangle')) return;

  // Starting coordinates
  const { xRel: startX, y: startY } = computeCoords(e, getZeroXPoint);
  // Check if Shift was held at the start
  const isSquare = e.shiftKey;

  drawingTools._genericDraw(
    type,
    startX,
    startY,
    // Preview callback
    (x1, y1, x2, y2, seed) => {
      let width = x2 - x1;
      let height = y2 - y1;
      // Constrain to square if Shift
      if (isSquare) {
        const size = Math.min(Math.abs(width), Math.abs(height));
        width = Math.sign(width) * size;
        height = Math.sign(height) * size;
      }
      drawingTools.canvasManager.previewRough.rectangle(
        getZeroXPoint() + x1,
        y1,
        width,
        height,
        { stroke: 'black', strokeWidth: drawingTools.strokeWidth, roughness: drawingTools.roughness, seed }
      );
    },
    // Commit callback
    (x1, y1, x2, y2, seed) => {
      let width = x2 - x1;
      let height = y2 - y1;
      // Constrain to square if Shift
      if (isSquare) {
        const size = Math.min(Math.abs(width), Math.abs(height));
        width = Math.sign(width) * size;
        height = Math.sign(height) * size;
      }
      // Save shape data
      drawingTools.shapesData.rectangle.push({ xRel: x1, y: y1, widthRel: width, height: height, seed });
      // Draw final shape
      drawingTools.canvasManager.drawRough.rectangle(
        getZeroXPoint() + x1,
        y1,
        width,
        height,
        { stroke: 'black', strokeWidth: drawingTools.strokeWidth, roughness: drawingTools.roughness, seed }
      );
    }
  );
}
