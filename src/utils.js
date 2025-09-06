// Module-friendly utilities, while also exposing to window for legacy usage
let debugging = false;

// Keep original console methods so we can restore them when debugging is enabled
const __consoleBackup = (() => {
  try {
    const c = (typeof console !== 'undefined') ? console : {};
    return {
      log:   typeof c.log === 'function'   ? c.log.bind(c)   : () => {},
      info:  typeof c.info === 'function'  ? c.info.bind(c)  : () => {},
      warn:  typeof c.warn === 'function'  ? c.warn.bind(c)  : () => {},
      error: typeof c.error === 'function' ? c.error.bind(c) : () => {},
      debug: typeof c.debug === 'function' ? c.debug.bind(c) : () => {},
    };
  } catch { return { log:()=>{}, info:()=>{}, warn:()=>{}, error:()=>{}, debug:()=>{} }; }
})();

// Track original error handlers to restore when debugging is enabled
let __origOnError = null;
let __origOnUnhandled = null;
let __safetyNoticeShown = false;

function __applyConsoleDebugging() {
  try {
    if (typeof console === 'undefined') return;
    if (debugging) {
      // Restore original console methods
      console.log   = __consoleBackup.log;
      console.info  = __consoleBackup.info;
      console.warn  = __consoleBackup.warn;
      console.error = __consoleBackup.error;
      console.debug = __consoleBackup.debug;
      __removeSilentErrorHandler();
    } else {
      // Silence all console output
      const noop = () => {};
      console.log   = noop;
      console.info  = noop;
      console.warn  = noop;
      console.error = noop;
      console.debug = noop;
      __installSilentErrorHandler();
      __showConsoleSafetyNotice();
    }
  } catch {}
}

function __installSilentErrorHandler() {
  try {
    if (typeof window === 'undefined') return;
    if (__origOnError === null) __origOnError = window.onerror;
    if (__origOnUnhandled === null) __origOnUnhandled = window.onunhandledrejection;

    window.onerror = function () { return true; };
    window.onunhandledrejection = function (e) { try { e?.preventDefault?.(); } catch {}; return true; };

    // Also prevent default via capture listeners to catch event-based errors
    window.addEventListener('error', (ev) => { try { ev.preventDefault(); } catch {}; }, true);
    window.addEventListener('unhandledrejection', (ev) => { try { ev.preventDefault(); } catch {}; }, true);
  } catch {}
}

function __removeSilentErrorHandler() {
  try {
    if (typeof window === 'undefined') return;
    if (__origOnError !== null) window.onerror = __origOnError;
    if (__origOnUnhandled !== null) window.onunhandledrejection = __origOnUnhandled;
  } catch {}
}

function __showConsoleSafetyNotice() {
  if (__safetyNoticeShown) return;
  __safetyNoticeShown = true;
  try {
    const headerStyle = [
      'font: 900 16px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      'color:#fff',
      'background:linear-gradient(90deg,#0ea5e9,#6366f1)',
      'padding:8px 12px',
      'border-radius:10px',
      'margin:6px 0',
    ].join(';');
    const bodyStyle = [
      'font: 500 12px/1.7 system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      'color:#cbd5e1',
      'padding:6px 12px',
      'margin:2px 0 10px',
    ].join(';');

    __consoleBackup.log('%c⚠  DO NOT PASTE ANYTHING HERE', headerStyle);
    __consoleBackup.log("%cAnd if you know what you are doing contact us ;) we are always looking for cool people, something something", bodyStyle);
  } catch {}
}

// mobileNoRender removed — phones use the full app experience now

export function setDebugging(val) {
  debugging = !!val;
  __applyConsoleDebugging();
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

export function printWarning(...message) {
  if (debugging) {
    try { console.warn(...message); } catch {}
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
  window.printWarning = printWarning;
  window.unskelton = unskelton;
  window.handle402AndRedirect = handle402AndRedirect;
}

// Apply initial console behavior based on the default debugging flag
__applyConsoleDebugging();
  
