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
  const shapesData = {
    rectangle: [],
    ellipse: []
  };

  // Create canvases
  const drawCanvas = document.createElement('canvas');
  const previewCanvas = document.createElement('canvas');
  [drawCanvas, previewCanvas].forEach(c => {
    Object.assign(c.style, {
      position: 'absolute',
      top: '0', left: '0',
      zIndex: '-1',
      pointerEvents: 'none'
    });
    document.body.appendChild(c);
  });
  const drawCtx = drawCanvas.getContext('2d');
  const previewCtx = previewCanvas.getContext('2d');
  const drawRough = rough.canvas(drawCanvas);
  const previewRough = rough.canvas(previewCanvas);

  /** Size both canvases to cover the full document */
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

  /** Save shapes to localStorage */
  function saveShapes() {
    localStorage.setItem('annotations', JSON.stringify(shapesData));
  }

  /** Redraw all shapes on resize */
  function handleResize() {
    sizeCanvases();
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

    const zeroX = getZeroXPoint();
    // redraw rectangles
    shapesData.rectangle.forEach(r => {
      drawRough.rectangle(zeroX + r.xRel, r.y, r.widthRel, r.height, {
        stroke: 'black', strokeWidth: 2, roughness: 3, seed: r.seed
      });
    });
    // redraw ellipses
    shapesData.ellipse.forEach(e => {
      const w = Math.abs(e.widthRel);
      const h = Math.abs(e.height);
      const cx = zeroX + e.xRel + e.widthRel / 2;
      const cy = e.y + e.height / 2;
      drawRough.ellipse(cx, cy, w, h, {
        stroke: 'black', strokeWidth: 2, roughness: 3, seed: e.seed
      });
    });
  }
  window.addEventListener('resize', handleResize);
  window.addEventListener('load', sizeCanvases);
  sizeCanvases();

  /** Compute relative X and absolute Y from event */
  function computeCoords(e) {
    const zeroX = getZeroXPoint();
    return {
      xRel: e.clientX - zeroX,
      y: e.pageY
    };
  }

  /** X-axis zero-point offset */
  function getZeroXPoint() {
    return window.innerWidth / 2 - 325;
  }

  /** Activate selected tool and update cursor */
  function setActiveTool(tool) {
    if (tool === activeTool) return;
    tools.forEach(t => t.classList.remove('active'));
    tool.classList.add('active');
    activeTool = tool;

    const isDrawTool = activeTool.classList.contains('rectangle') ||
                       activeTool.classList.contains('circle');
    document.body.style.cursor = isDrawTool ? 'crosshair' : 'default';
  }
  tools.forEach(tool => tool.addEventListener('click', () => setActiveTool(tool)));

  /** Rectangle tool handlers */
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
      const w = xRel - startXRel;
      const h = y - startY;
      const zeroX = getZeroXPoint();
      previewRough.rectangle(zeroX + startXRel, startY, w, h, {
        stroke: 'black', strokeWidth: 2, roughness: 3, seed: currentSeed
      });

    } else if (type === 'mouseup' && isDrawing) {
      isDrawing = false;
      document.body.style.userSelect = 'auto';
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

      const w = xRel - startXRel;
      const h = y - startY;
      shapesData.rectangle.push({ xRel: startXRel, y: startY, widthRel: w, height: h, seed: currentSeed });
      saveShapes();

      const zeroX = getZeroXPoint();
      drawRough.rectangle(zeroX + startXRel, startY, w, h, {
        stroke: 'black', strokeWidth: 2, roughness: 3, seed: currentSeed
      });

      const cursor = tools.find(t => t.classList.contains('cursor'));
      if (cursor) setActiveTool(cursor);
    }
  }

  /** Ellipse (circle) tool handlers */
  function handleEllipseTool(type, e) {
    if (!activeTool?.classList.contains('circle')) return;
    const { xRel, y } = computeCoords(e);

    if (type === 'mousedown') {
      isDrawing = true;
      startXRel = xRel;
      startY = y;
      currentSeed = Math.floor(Math.random() * 10000) + 1;
      document.body.style.userSelect = 'none';

    } else if (type === 'mousemove' && isDrawing) {
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      const w = xRel - startXRel;
      const h = y - startY;
      const zeroX = getZeroXPoint();
      const cx = zeroX + startXRel + w / 2;
      const cy = startY + h / 2;
      previewRough.ellipse(cx, cy, Math.abs(w), Math.abs(h), {
        stroke: 'black', strokeWidth: 2, roughness: 3, seed: currentSeed
      });

    } else if (type === 'mouseup' && isDrawing) {
      isDrawing = false;
      document.body.style.userSelect = 'auto';
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

      const w = xRel - startXRel;
      const h = y - startY;
      shapesData.ellipse.push({ xRel: startXRel, y: startY, widthRel: w, height: h, seed: currentSeed });
      saveShapes();

      const zeroX = getZeroXPoint();
      const cx = zeroX + startXRel + w / 2;
      const cy = startY + h / 2;
      drawRough.ellipse(cx, cy, Math.abs(w), Math.abs(h), {
        stroke: 'black', strokeWidth: 2, roughness: 3, seed: currentSeed
      });

      const cursor = tools.find(t => t.classList.contains('cursor'));
      if (cursor) setActiveTool(cursor);
    }
  }

  // Global listeners: feed both handlers
  ['mousedown', 'mousemove', 'mouseup'].forEach(evt =>
    document.addEventListener(evt, e => {
      handleRectangleTool(evt, e);
      handleEllipseTool(evt, e);
    })
  );
}

// Initialize on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => initTools());
