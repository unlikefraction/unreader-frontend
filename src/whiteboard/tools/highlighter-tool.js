import { handleFreehand } from './pencil-tool.js';

/**
 * Highlighter drawing tool
 */
export function handleHighlight(drawingTools, type, e) {
  if (!drawingTools.activeTool?.classList.contains('highlighter')) return;
  handleFreehand(
    drawingTools, type, e, 'highlighter',
    drawingTools.highlightOptions,
    drawingTools.highlightOptions.color,
    drawingTools.highlightOptions.opacity
  );
}