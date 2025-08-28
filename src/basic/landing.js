// keep your weighted picker + href assignment
const options = ["login.html", "loginOg.html"];
const weights = [0.5, 0.5]; // tweak as needed

function weightedRandom(options, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * sum;
  for (let i = 0; i < options.length; i++) {
    if (rand < weights[i]) return options[i];
    rand -= weights[i];
  }
  // fallback (shouldn't happen if weights valid)
  return options[0];
}

const chosenHref = weightedRandom(options, weights);
const linkEl = document.querySelector(".logInLink");
if (linkEl) linkEl.href = chosenHref;

/* === click/hover logic for the highlight spans === */
(() => {
  const ROOT = '#mainContent-transcript-landing-html-order-word-timings-ordered-json-100';

  // 299 = copy coupon
  const SEL_COPY = `${ROOT} span.highlight[data-index="299"]`;

  // 320/321/322 = redirect (bling)
  const REDIRECT_INDEXES = [317, 318, 319];
  const REDIRECT_SELECTORS = REDIRECT_INDEXES.map(i => `${ROOT} span.highlight[data-index="${i}"]`);

  const q = (sel) => document.querySelector(sel);

  // generic rect hit test
  const hit = (el, x, y) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  // padded hit test for the "guys" 320/321/322 (makes it easier to hover/click)
  const hitWithPad = (el, x, y, pad = 8) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const left = r.left - pad;
    const right = r.right + pad;
    const top = r.top - pad;
    const bottom = r.bottom + pad;
    return x >= left && x <= right && y >= top && y <= bottom;
  };

  // copy coupon with Clipboard API + fallback
  async function copyCoupon(code = "I-UNREAD-IT-ALL") {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand("copy"); } finally { document.body.removeChild(ta); }
    }
  }

  // float a tiny "copied" badge above the element, fade out in 1s, then remove
  function showCopiedBadge(el) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const badge = document.createElement("div");
    badge.textContent = "copied";
    Object.assign(badge.style, {
      position: "fixed",
      left: `${Math.round(r.left + r.width / 2)}px`,
      top: `${Math.round(r.top - 30)}px`,
      background: "#20bf6b",
      transform: "translate(-50%, 0)",
      fontSize: "18px",
      lineHeight: "1",
      padding: "8px 12px",
      borderRadius: "12px",
      color: "#fff",
      fontWeight: "400",
      pointerEvents: "none",
      zIndex: "2147483647",
      transition: "transform 1s ease, opacity 1s ease",
      opacity: "1",
      userSelect: "none"
    });
    document.body.appendChild(badge);

    requestAnimationFrame(() => {
      badge.style.transform = "translate(-50%, -35px)";
      badge.style.opacity = "0";
    });

    setTimeout(() => { badge.remove(); }, 1050);
  }

  function redirectWeighted() {
    const dest = weightedRandom(options, weights) || options[0];
    // keep the .logInLink in sync, too
    const link = document.querySelector(".logInLink");
    if (link) link.href = dest;
    window.location.href = dest;
  }

  // === overlay that forces pointer + captures clicks over 320/321/322 ===
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    zIndex: '2147483646',
    background: 'transparent',
    pointerEvents: 'auto',
    cursor: 'pointer',
    display: 'none',
    userSelect: 'none',
  });
  document.body.appendChild(overlay);

  const REDIRECT_OVERLAY_PAD = 12; // padding around the guys

  function findRedirectTargetAt(x, y) {
    for (const sel of REDIRECT_SELECTORS) {
      const el = q(sel);
      if (hitWithPad(el, x, y, REDIRECT_OVERLAY_PAD)) return el;
    }
    return null;
  }

  function positionOverlayOver(el, pad = REDIRECT_OVERLAY_PAD) {
    const r = el.getBoundingClientRect();
    overlay.style.left = `${r.left - pad}px`;
    overlay.style.top = `${r.top - pad}px`;
    overlay.style.width = `${r.width + pad * 2}px`;
    overlay.style.height = `${r.height + pad * 2}px`;
    overlay.style.display = 'block';
  }

  function hideOverlay() {
    overlay.style.display = 'none';
  }

  // move overlay on mousemove; ensures pointer cursor even if underlying spans are non-interactive
  document.addEventListener('mousemove', (e) => {
    const { clientX: x, clientY: y } = e;

    const target = findRedirectTargetAt(x, y);
    if (target) {
      positionOverlayOver(target, REDIRECT_OVERLAY_PAD);
    } else {
      hideOverlay();
    }
  }, { passive: true });

  // clicks on overlay → redirect
  overlay.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    redirectWeighted();
  });

  // keep overlay honest on layout changes
  window.addEventListener('scroll', hideOverlay, { passive: true });
  window.addEventListener('resize', hideOverlay);

  // document click for the copy badge (302)
  document.addEventListener("click", async (e) => {
    const { clientX: x, clientY: y } = e;
    const elCopy = q(SEL_COPY);
    if (hit(elCopy, x, y)) {
      await copyCoupon("I-UNREAD-IT-ALL");
      showCopiedBadge(elCopy);
    }
  });

  /* === LOGIN-GATE: disable .hold-up, .inbox with tooltip + redirect (per-element messages) === */

  // Per-selector config: selector, tooltip position, and custom message
  const GATED_CONFIG = [
    { sel: '.hold-up', pos: 'top',   message: 'Holdup can be accessed with books. Login to experience.' },
    { sel: '.inbox',   pos: 'right', message: 'Login to use your inbox.' },
  ];

  const GAP = 6, PAD = 6, RADIUS = 4;
  const SHOW_POSITION_IN_TEXT = false; // append (top/right/left/bottom) to the text

  let loginTooltipEl = null;

  function createLoginTooltip() {
    const el = document.createElement("div");
    el.className = "login-tooltip";
    el.setAttribute("role", "tooltip");
    el.style.position = "fixed";
    el.style.background = "#000";
    el.style.color = "#fff";
    el.style.padding = `${PAD}px`;
    el.style.borderRadius = `${RADIUS}px`;
    el.style.fontSize = "13px";
    el.style.whiteSpace = "nowrap";
    el.style.pointerEvents = "none";
    el.style.zIndex = "2147483647";
    el.style.visibility = "hidden";
    document.body.appendChild(el);
    return el;
  }

  // Hide any existing .tooltip when hovering gated features
  function hideNativeTooltips() {
    document.querySelectorAll('.tooltip').forEach(t => {
      t.style.visibility = 'hidden';
    });
  }

  function setLoginTooltipText(message, position) {
    if (!loginTooltipEl) return;
    const label = (SHOW_POSITION_IN_TEXT && position) ? ` (${position})` : "";
    loginTooltipEl.textContent = message + label;
  }

  function positionLoginTooltip(target, position = "top") {
    const rect = target.getBoundingClientRect();
    const tRect = loginTooltipEl.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    let top, left;

    switch (position) {
      case "left":
        top = rect.top + (rect.height - tRect.height) / 2;
        left = rect.left - GAP - tRect.width;
        break;
      case "right":
        top = rect.top + (rect.height - tRect.height) / 2;
        left = rect.right + GAP;
        break;
      case "bottom":
        top = rect.bottom + GAP;
        left = rect.left + (rect.width - tRect.width) / 2;
        break;
      case "top":
      default:
        top = rect.top - GAP - tRect.height;
        left = rect.left + (rect.width - tRect.width) / 2;
        break;
    }

    // Clamp to viewport
    if (left < 4) left = 4;
    if (left + tRect.width > vw - 4) left = Math.max(4, vw - tRect.width - 4);
    if (top < 4) top = 4;
    if (top + tRect.height > vh - 4) top = Math.max(4, vh - tRect.height - 4);

    loginTooltipEl.style.left = `${Math.round(left)}px`;
    loginTooltipEl.style.top = `${Math.round(top)}px`;
  }

  function showLoginTooltip(target, message, position = "top") {
    if (!loginTooltipEl) loginTooltipEl = createLoginTooltip();
    hideNativeTooltips(); // hide .tooltip on hover
    setLoginTooltipText(message, position);

    // measurable
    loginTooltipEl.style.visibility = "hidden";
    loginTooltipEl.offsetWidth;

    positionLoginTooltip(target, position);
    loginTooltipEl.style.visibility = "visible";
  }

  function hideLoginTooltip() {
    if (loginTooltipEl) loginTooltipEl.style.visibility = "hidden";
  }

  function makeElementLookDisabled(el) {
    el.setAttribute("aria-disabled", "true");
    el.style.cursor = "pointer";
    if (!el.dataset._dimApplied) {
      // el.style.opacity = (parseFloat(getComputedStyle(el).opacity) || 1) * 0.7;
      el.dataset._dimApplied = "1";
    }
  }

  function gateElement(el, pos, message) {
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    makeElementLookDisabled(el);

    const go = (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      redirectWeighted();
    };

    el.addEventListener("click", go);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") go(e);
    });

    el.addEventListener("mouseenter", () => showLoginTooltip(el, message, pos));
    el.addEventListener("mouseleave", hideLoginTooltip);
    el.addEventListener("focus", () => showLoginTooltip(el, message, pos));
    el.addEventListener("blur", hideLoginTooltip);

    window.addEventListener("scroll", hideLoginTooltip, { passive: true });
    window.addEventListener("resize", hideLoginTooltip);
  }

  function initLoginGate() {
    GATED_CONFIG.forEach(({ sel, pos, message }) => {
      document.querySelectorAll(sel).forEach((el) => gateElement(el, pos || "top", message));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLoginGate);
  } else {
    initLoginGate();
  }
})();









// letter by letter typing animation

(function () {
  // ===== Vars you can tweak =====
  var CONTAINER_SELECTOR = '.mainContent';
  var START_DELAY_MS     = 300;   // minimum delay before even considering start
  var QUIET_WINDOW_MS    = 500;   // must be no DOM changes for this long
  var MIN_TEXT_LEN       = 200;   // don’t start until there’s at least this much text
  var CHAR_DELAY_MS      = 2;     // ~6ms/char; raise to see more dramatic animation
  var INSTANT_FINISH_KEY = 'Escape'; // press Esc to dump the rest instantly
  var MAX_WAIT_MS        = 5000; // safety: start anyway after this much waiting

  // Expose live tuning if you want
  if (typeof window !== 'undefined') {
    window.typeConfig = { start: START_DELAY_MS, char: CHAR_DELAY_MS };
  }

  // Hide ASAP (and win against CSS with !important). Preserve exact inline style to restore later.
  function hideEarly() {
    var c = document.querySelector(CONTAINER_SELECTOR);
    if (!c || c.dataset._typedInit === '1') return;
    c.dataset._typedInit = '1';
    c.dataset._oldInlineStyle = c.getAttribute('style') || '';
    c.style.setProperty('display', 'none', 'important');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { hideEarly(); init(); });
  } else {
    hideEarly(); init();
  }

  function init() {
    var container = document.querySelector(CONTAINER_SELECTOR);
    if (!container) return;

    var started = false;
    var firstPossibleStart = Date.now() + ((window.typeConfig && window.typeConfig.start) || START_DELAY_MS);
    var lastMutation = Date.now();

    // Watch for your data population
    var mo = new MutationObserver(function () { lastMutation = Date.now(); });
    mo.observe(container, { childList: true, subtree: true, characterData: true });

    // Manual override: dispatch when your app is ready
    window.addEventListener('typing:go', function () { tryStart(true); });

    var forceTimer = setTimeout(function () { tryStart(true); }, MAX_WAIT_MS);
    tickCheck();

    function tickCheck() {
      if (started) return;
      var now = Date.now();
      if (now < firstPossibleStart) { return setTimeout(tickCheck, firstPossibleStart - now); }
      if (!hasEnoughContent(container)) { return setTimeout(tickCheck, 100); }
      if (now - lastMutation < QUIET_WINDOW_MS) { return setTimeout(tickCheck, QUIET_WINDOW_MS); }
      tryStart(false);
    }

    function tryStart(force) {
      if (started) return;
      if (!force) {
        if (!hasEnoughContent(container)) return tickCheck();
        if (Date.now() - lastMutation < QUIET_WINDOW_MS) return tickCheck();
      }
      started = true;
      clearTimeout(forceTimer);
      mo.disconnect();
      beginTyping(container);
    }
  }

  function hasEnoughContent(container) {
    var txt = (container.textContent || '').trim();
    return txt.length >= MIN_TEXT_LEN;
  }

  function beginTyping(container) {
    // Collect text nodes in order
    var walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
          var p = node.parentNode; if (!p) return NodeFilter.FILTER_REJECT;
          var tag = p.nodeName.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'noscript') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    var nodes = [], n;
    while (n = walker.nextNode()) {
      nodes.push({ node: n, text: n.nodeValue, i: 0 });
    }

    // Blank the text while still hidden
    for (var k = 0; k < nodes.length; k++) nodes[k].node.nodeValue = '';

    // Restore the EXACT inline style the element had
    var containerStyle = container.dataset._oldInlineStyle || '';
    if (containerStyle) container.setAttribute('style', containerStyle);
    else container.removeAttribute('style');
    delete container.dataset._oldInlineStyle;

    if (!nodes.length) return; // nothing to type

    // RAF-driven typer
    var skip = false;
    window.addEventListener('keydown', function (e) { if (e.key === INSTANT_FINISH_KEY) skip = true; });

    var last = null, acc = 0;
    var charDelay = Math.max(1, (window.typeConfig && window.typeConfig.char) || CHAR_DELAY_MS);

    function frame(ts) {
      if (skip) {
        for (var a = 0; a < nodes.length; a++) {
          var it = nodes[a];
          if (it.i < it.text.length) {
            it.node.nodeValue += it.text.slice(it.i);
            it.i = it.text.length;
          }
        }
        return; // done
      }

      if (last == null) last = ts;
      var dt = ts - last; last = ts; acc += dt;

      // Type as many chars as budget allows, capped per frame for visible motion
      var MAX_CHARS_PER_FRAME = 60;
      var typedThisFrame = 0;

      while (acc >= charDelay && typedThisFrame < MAX_CHARS_PER_FRAME) {
        if (!typeOneChar(nodes)) return; // finished all
        acc -= charDelay;
        typedThisFrame++;
      }
      requestAnimationFrame(frame);
    }

    // tiny start delay helps browsers paint the blank state
    setTimeout(function () { requestAnimationFrame(frame); }, 0);
  }

  function typeOneChar(nodes) {
    for (var idx = 0; idx < nodes.length; idx++) {
      var it = nodes[idx];
      if (it.i < it.text.length) {
        it.node.nodeValue += it.text.charAt(it.i++);
        return true; // still work to do
      }
    }
    return false; // all done
  }
})();