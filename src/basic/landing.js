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

  // 302 = copy coupon
  const SEL_COPY = `${ROOT} span.highlight[data-index="302"]`;

  // 320/321/322 = redirect (bling)
  const REDIRECT_INDEXES = [320, 321, 322];
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

  /* === LOGIN-GATE: disable .hold-up, .inbox, .bookDetails with tooltip + redirect === */

  // You can set per-selector tooltip placements here (top/right/left/bottom)
  // This affects both **position** and appends the direction to the **text**.
  const GATED_CONFIG = [
    { sel: '.hold-up',     pos: 'top' },
    { sel: '.inbox',       pos: 'right' },
    { sel: '.bookDetails', pos: 'right' },
  ];

  const LOGIN_MESSAGE = "Login to use this feature";
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

  // Hide any existing .tooltip when hovering gated features (your request)
  function hideNativeTooltips() {
    document.querySelectorAll('.tooltip').forEach(t => {
      t.style.visibility = 'hidden';
    });
  }

  function setLoginTooltipText(position) {
    if (!loginTooltipEl) return;
    const label = (SHOW_POSITION_IN_TEXT && position) ? ` (${position})` : "";
    loginTooltipEl.textContent = LOGIN_MESSAGE + label;
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

  function showLoginTooltip(target, position = "top") {
    if (!loginTooltipEl) loginTooltipEl = createLoginTooltip();
    hideNativeTooltips(); // hide .tooltip on hover as requested
    setLoginTooltipText(position);

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
      el.style.opacity = (parseFloat(getComputedStyle(el).opacity) || 1) * 0.7;
      el.dataset._dimApplied = "1";
    }
  }

  function gateElement(el, pos) {
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

    el.addEventListener("mouseenter", () => showLoginTooltip(el, pos));
    el.addEventListener("mouseleave", hideLoginTooltip);
    el.addEventListener("focus", () => showLoginTooltip(el, pos));
    el.addEventListener("blur", hideLoginTooltip);

    window.addEventListener("scroll", hideLoginTooltip, { passive: true });
    window.addEventListener("resize", hideLoginTooltip);
  }

  function initLoginGate() {
    GATED_CONFIG.forEach(({ sel, pos }) => {
      document.querySelectorAll(sel).forEach((el) => gateElement(el, pos || "top"));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLoginGate);
  } else {
    initLoginGate();
  }
})();
