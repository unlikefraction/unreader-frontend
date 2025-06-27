import rough from 'roughjs';

/**
 * Bootstrap all drawing tools on the page
 * @param {string} selector - CSS selector for tool buttons
 */
function initTools(selector = '.w-control') {
  const tools = Array.from(document.querySelectorAll(selector));
  let activeTool = tools.find(t => t.classList.contains('active')) || null;
  let isDrawing = false;
  let startXRel = 0;
  let startY = 0;
  let currentSeed = null;

  // Store shapes in JSON structure
  const shapesData = { rectangle: [] };

  // Create permanent draw canvas and live preview canvas
  const drawCanvas = document.createElement('canvas');
  const previewCanvas = document.createElement('canvas');
  [drawCanvas, previewCanvas].forEach(c => {
    Object.assign(c.style, {
      position: 'absolute',
      top: '0', left: '0',
      zIndex: '-1',          // draw below all content
      pointerEvents: 'none'  // allow clicks through
    });
    document.body.appendChild(c);
  });
  const drawCtx = drawCanvas.getContext('2d');
  const previewCtx = previewCanvas.getContext('2d');
  const drawRough = rough.canvas(drawCanvas);
  const previewRough = rough.canvas(previewCanvas);

  /**
   * Set canvas dimensions to cover full document height/width
   */
  function sizeCanvases() {
    const doc = document.documentElement;
    const body = document.body;
    const width = Math.max(doc.scrollWidth, body.scrollWidth, doc.clientWidth);
    const height = Math.max(doc.scrollHeight, body.scrollHeight, doc.clientHeight);
    [drawCanvas, previewCanvas].forEach(c => {
      c.width = width;
      c.height = height;
    });
  }

  // Initial sizing and after all resources load
  sizeCanvases();
  window.addEventListener('load', sizeCanvases);

  /**
   * Persist shapesData to annotations.json via localStorage
   */
  function saveShapes() {
    localStorage.setItem('annotations', JSON.stringify(shapesData));
  }

  /**
   * On window resize: update preview canvas and redraw permanent shapes
   */
  function handleResize() {
    sizeCanvases();
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    shapesData.rectangle.forEach(r => {
      const zeroX = getZeroXPoint();
      const xDoc = r.xRel + zeroX;
      drawRough.rectangle(xDoc, r.y, r.widthRel, r.height, {
        stroke: 'black', strokeWidth: 2, roughness: 3, seed: r.seed
      });
    });
  }
  window.addEventListener('resize', handleResize);

  /**
   * Calculate zero-point X coordinate offset
   */
  function getZeroXPoint() {
    return window.innerWidth / 2 - 325;
  }

  /**
   * Convert event into relative X and absolute Y
   */
  function computeCoords(e) {
    const y = e.pageY;
    const zeroX = getZeroXPoint();
    const xRel = e.clientX - zeroX;
    return { xRel, y };
  }

  /**
   * Activate tool and update cursor
   */
  function setActiveTool(tool) {
    if (tool === activeTool) return;
    tools.forEach(t => t.classList.remove('active'));
    tool.classList.add('active');
    activeTool = tool;
    document.body.style.cursor = activeTool?.classList.contains('rectangle') ? 'crosshair' : 'default';
  }
  tools.forEach(tool => tool.addEventListener('click', () => setActiveTool(tool)));

  /**
   * Handle rectangle tool draw lifecycle
   */
  function handleRectangleTool(type, e) {
    if (!activeTool?.classList.contains('rectangle')) return;
    const { xRel, y } = computeCoords(e);
    if (type === 'mousedown') {
      isDrawing = true;
      startXRel = xRel;
      startY = y;
      currentSeed = Math.floor(Math.random() * 10000) + 1;
      document.body.style.userSelect = 'none';
    } else if (type === 'mousemove' && isDrawing) {
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      const widthRel = xRel - startXRel;
      const height = y - startY;
      const zeroX = getZeroXPoint();
      previewRough.rectangle(startXRel + zeroX, startY, widthRel, height, {
        stroke: 'black', strokeWidth: 2, roughness: 3, seed: currentSeed
      });
    } else if (type === 'mouseup' && isDrawing) {
      isDrawing = false;
      document.body.style.userSelect = 'auto';
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      const widthRel = xRel - startXRel;
      const height = y - startY;
      shapesData.rectangle.push({ xRel: startXRel, y: startY, widthRel, height, seed: currentSeed });
      saveShapes();
      const zeroX = getZeroXPoint();
      drawRough.rectangle(startXRel + zeroX, startY, widthRel, height, {
        stroke: 'black', strokeWidth: 2, roughness: 3, seed: currentSeed
      });
      const cursor = tools.find(t => t.classList.contains('cursor'));
      if (cursor) setActiveTool(cursor);
    }
  }
  ['mousedown', 'mousemove', 'mouseup'].forEach(evt =>
    document.addEventListener(evt, e => handleRectangleTool(evt, e))
  );
}

// Initialize on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => initTools());
