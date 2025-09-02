// Module-friendly utilities, while also exposing to window for legacy usage
let debugging = true;

// Render small.html as a full-screen overlay for small screens
export function mobileNoRender() {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const isSmallViewport = window.matchMedia('(max-width: 999px)').matches;
    if (!isSmallViewport) return;
    if (document.getElementById('mobileNoRenderOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'mobileNoRenderOverlay';
    Object.assign(overlay.style, {
      position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
      width: '100%', height: '100%', background: '#fff',
      zIndex: '2147483647', overflow: 'hidden'
    });

    const iframe = document.createElement('iframe');
    iframe.src = 'small.html';
    iframe.title = 'Mobile notice';
    Object.assign(iframe.style, { width: '100%', height: '100%', border: '0', display: 'block' });

    overlay.appendChild(iframe);
    document.body.appendChild(overlay);

    // Lock background scrolling
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    overlay.addEventListener('remove', () => {
      try { document.documentElement.style.overflow = prevHtmlOverflow; } catch {}
      try { document.body.style.overflow = prevBodyOverflow; } catch {}
    });
  } catch (_) { /* never block */ }
}

export function setDebugging(val) {
  debugging = !!val;
}

export function printl(...message) {
  if (debugging) {
    try { console.log(...message); } catch {}
  }
}

export function printError(...message) {
  if (debugging) {
    try { console.error(...message); } catch {}
  }
}

export function unskelton() {
  const elements = document.querySelectorAll(
    ".skeleton-hide, .skeleton-margin-top, .skeleton-ui"
  );

  elements.forEach(el => {
    el.classList.remove("skeleton-hide", "skeleton-margin-top", "skeleton-ui");
  });
}

export function handle402AndRedirect() {
  try {
    alert('You dont have enough credits, redirecting you to account page.');
  } finally {
    window.location.assign('/account.html');
  }
}

// Expose to global for any code that expects globals
// Note: modules should import from this file instead of relying on globals.
if (typeof window !== 'undefined') {
  window.setDebugging = setDebugging;
  window.printl = printl;
  window.printError = printError;
  window.unskelton = unskelton;
  window.handle402AndRedirect = handle402AndRedirect;
  window.mobileNoRender = mobileNoRender;
}
  
