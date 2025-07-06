/**
 * Utility functions for drawing tools
 */

/** Hex to RGBA conversion */
export function hexToRgba(hex, alpha) {
  const bigint = parseInt(hex.replace('#',''), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Raw event → relative coords */
export function computeCoords(e, getZeroXPoint) {
  return { xRel: e.clientX - getZeroXPoint(), y: e.pageY };
}

/** X-axis zero offset for centering */
export function getZeroXPoint() {
  return window.innerWidth/2 - 325;
}

/** Check if click is on a tool button */
export function isClickOnTool(e, selector) {
  return e.target.closest(selector) !== null;
}

/** Get proper bounding box for any shape */
export function getShapeBounds(type, shape) {
  const padding = 10; // Extra padding around shapes

  if (type === 'rectangle' || type === 'ellipse') {
    const x1 = shape.xRel;
    const y1 = shape.y;
    const x2 = shape.xRel + shape.widthRel;
    const y2 = shape.y + shape.height;
    return {
      minX: Math.min(x1, x2) - padding,
      maxX: Math.max(x1, x2) + padding,
      minY: Math.min(y1, y2) - padding,
      maxY: Math.max(y1, y2) + padding
    };
  }

  if (type === 'line') {
    return {
      minX: Math.min(shape.x1Rel, shape.x2Rel) - padding,
      maxX: Math.max(shape.x1Rel, shape.x2Rel) + padding,
      minY: Math.min(shape.y1, shape.y2) - padding,
      maxY: Math.max(shape.y1, shape.y2) + padding
    };
  }

  if (type === 'arrow') {
    // Include arrow head in bounds calculation
    const dx = shape.x2Rel - shape.x1Rel;
    const dy = shape.y2 - shape.y1;
    const angle = Math.atan2(dy, dx);
    const len = Math.hypot(dx, dy) * 0.2;

    // Calculate arrow head points
    const head1X = shape.x2Rel - len * Math.cos(angle - Math.PI/6);
    const head1Y = shape.y2 - len * Math.sin(angle - Math.PI/6);
    const head2X = shape.x2Rel - len * Math.cos(angle + Math.PI/6);
    const head2Y = shape.y2 - len * Math.sin(angle + Math.PI/6);

    const allX = [shape.x1Rel, shape.x2Rel, head1X, head2X];
    const allY = [shape.y1, shape.y2, head1Y, head2Y];

    return {
      minX: Math.min(...allX) - padding,
      maxX: Math.max(...allX) + padding,
      minY: Math.min(...allY) - padding,
      maxY: Math.max(...allY) + padding
    };
  }

  if (type === 'pencil' || type === 'highlighter') {
    // Guard against missing or empty points array
    const pts = Array.isArray(shape.points) ? shape.points : [];
    if (pts.length === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }
    const allX = pts.map(p => p.xRel);
    const allY = pts.map(p => p.y);
    return {
      minX: Math.min(...allX) - padding,
      maxX: Math.max(...allX) + padding,
      minY: Math.min(...allY) - padding,
      maxY: Math.max(...allY) + padding
    };
  }

  if (type === 'text') {
    const textWidth = shape.text.length * 12; // Approximate character width
    const textHeight = 24; // Font size
    return {
      minX: shape.xRel - padding,
      maxX: shape.xRel + textWidth + padding,
      minY: shape.y - padding,
      maxY: shape.y + textHeight + padding
    };
  }

  return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
}

/** Hit-test using proper bounding boxes */
export function pointInShapeBounds(type, shape, x, y) {
  const bounds = getShapeBounds(type, shape);
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}
