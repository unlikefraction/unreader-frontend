// tooltips.js

// className → [Tool Name, Shortcut, Position]
const tools = {
    ".cursor": ["Cursor", "V", "right"],
    ".highlighter": ["Highlighter", "H", "right"],
    ".pencil": ["Pencil", "P", "right"],
    ".text": ["Text", "T", "right"],
    ".line": ["Line", "L", "right"],
    ".arrow": ["Arrow", "A", "right"],
    ".eraser": ["Eraser", "E", "right"],
    ".rectangle": ["Rectangle", "R", "right"],
    ".circle": ["Circle", "O", "right"],
    ".inbox": ["Inbox", null, "right"],
  
    ".settings": ["Settings", null, "top"],
    ".rewind": ["Rewind", "←", "top"],
    ".playButton": ["Play", "␣", "top"],
    ".forward": ["Forward", "→", "top"],
    ".read-along": ["Read Along", null, "top"],
    ".hold-up": ["Hold Up", "/", "top"],
  
    ".heightSetter": ["Aligner", null, "left"],
  };
  
  (function () {
    const GAP = 6;
    const PAD = 8;
    const RADIUS = 4;
  
    let tooltipEl = null;
  
    function createTooltip() {
      const el = document.createElement("div");
      el.setAttribute("role", "tooltip");
      el.style.position = "fixed";
      el.style.left = "0";
      el.style.top = "0";
      el.style.background = "#000";
      el.style.color = "#fff";
      el.style.padding = `${PAD}px`;
      el.style.borderRadius = `${RADIUS}px`;
      el.style.fontSize = `14px`;
      el.style.whiteSpace = "nowrap";
      el.style.pointerEvents = "none";
      el.style.zIndex = "2147483647";
      el.style.boxSizing = "border-box";
      el.style.visibility = "hidden";
      document.body.appendChild(el);
      return el;
    }
  
    function setTooltipContent(name, shortcut) {
      tooltipEl.textContent = "";
      const nameSpan = document.createElement("span");
      nameSpan.textContent = name || "";
      tooltipEl.appendChild(nameSpan);
  
      if (shortcut && String(shortcut).toLowerCase() !== "null") {
        const shortSpan = document.createElement("span");
        shortSpan.textContent = shortcut;
        shortSpan.style.opacity = "0.6";
        shortSpan.style.marginLeft = "8px";
        tooltipEl.appendChild(shortSpan);
      }
    }
  
    function positionTooltip(target, position) {
      const rect = target.getBoundingClientRect();
      const tRect = tooltipEl.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
  
      let top, left;
  
      switch (position) {
        case "left":
          top = rect.top + (rect.height - tRect.height) / 2;
          left = rect.left - GAP - tRect.width + 10;
          break;
        case "right":
          top = rect.top + (rect.height - tRect.height) / 2;
          left = rect.right + GAP + 5;
          break;
        case "bottom":
          top = rect.bottom + GAP;
          left = rect.left + (rect.width - tRect.width) / 2;
          break;
        case "top":
        default:
          top = rect.top - GAP - tRect.height - 10;
          left = rect.left + (rect.width - tRect.width) / 2;
          break;
      }
  
      // Clamp to viewport
      if (left < 4) left = 4;
      if (left + tRect.width > vw - 4) left = Math.max(4, vw - tRect.width - 4);
      if (top < 4) top = 4;
      if (top + tRect.height > vh - 4) top = Math.max(4, vh - tRect.height - 4);
  
      tooltipEl.style.left = `${Math.round(left)}px`;
      tooltipEl.style.top = `${Math.round(top)}px`;
    }
  
    function showTooltipFor(el, toolName, shortcut, position) {
      if (!tooltipEl) tooltipEl = createTooltip();
  
      setTooltipContent(toolName, shortcut);
      tooltipEl.style.visibility = "hidden";
      tooltipEl.offsetWidth; // force reflow
      positionTooltip(el, position);
      tooltipEl.style.visibility = "visible";
    }
  
    function hideTooltip() {
      if (tooltipEl) tooltipEl.style.visibility = "hidden";
    }
  
    function attachHandlers(selector, toolName, shortcut, position) {
      document.querySelectorAll(selector).forEach((el) => {
        el.addEventListener("mouseenter", () =>
          showTooltipFor(el, toolName, shortcut, position)
        );
        el.addEventListener("mouseleave", hideTooltip);
        el.addEventListener("focus", () =>
          showTooltipFor(el, toolName, shortcut, position)
        );
        el.addEventListener("blur", hideTooltip);
      });
    }
  
    // Initialize
    Object.entries(tools).forEach(([selector, [name, shortcut, position]]) => {
      attachHandlers(selector, name, shortcut, position || "top");
    });
  
    window.addEventListener("resize", hideTooltip, true);
    window.addEventListener("scroll", hideTooltip, true);
  })();
  