// Module-friendly utilities, while also exposing to window for legacy usage
let debugging = true;

// Small-screen redirect (applies to all pages that include utils.js)
// Redirects to /small.html if viewport width < 1000px.
// Skips redirect for the extension popup and the small page itself.
try {
  if (typeof window !== 'undefined' && typeof location !== 'undefined') {
      const isSmallViewport = window.matchMedia('(max-width: 999px)').matches;
      if (isSmallViewport) {
        // Use replace to avoid polluting back stack
        window.location.replace('small.html');
      }
  }
} catch (_) {
  // no-op: never block app if something goes wrong
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
}
  
