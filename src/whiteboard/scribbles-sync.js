// -----scribbles-sync.js-----
// Handles syncing whiteboard scribbles to backend while keeping localStorage fast.

import { saveShapesData, loadShapesData, defaultShapesData } from './storage.js';

function getCookie(name) {
  const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[2]) : null;
}
function getBookIdFromUrl() {
  try { return new URL(window.location.href).searchParams.get('id'); } catch { return null; }
}
function isNonEmptyObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0;
}
function withDefaults(shapes) {
  // Ensure all shape types exist
  try { return Object.assign({ ...defaultShapesData }, (shapes || {})); } catch { return { ...defaultShapesData }; }
}

async function fetchRemoteScribbles(userBookId) {
  const token = getCookie('authToken');
  if (!token) return null;
  const base = window.API_URLS?.BOOK;
  if (!base || !userBookId) return null;
  const url = `${base}get-details/${encodeURIComponent(userBookId)}/`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = await res.json();
    return (data && typeof data.scribbles === 'object') ? data.scribbles : null;
  } catch {
    return null;
  }
}

async function pushRemoteScribbles(userBookId, scribbles) {
  const token = getCookie('authToken');
  if (!token) return false;
  const base = window.API_URLS?.BOOK;
  if (!base || !userBookId) return false;
  const url = `${base}update/${encodeURIComponent(userBookId)}/`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ scribbles: (scribbles || {}) })
    });
    return res.ok;
  } catch {
    return false;
  }
}

function beaconPushScribbles(userBookId, scribbles) {
  try {
    const token = getCookie('authToken');
    const base = window.API_URLS?.BOOK;
    if (!navigator.sendBeacon || !token || !base || !userBookId) return false;
    const url = `${base}update/${encodeURIComponent(userBookId)}/`;
    const payload = JSON.stringify({ scribbles: (scribbles || {}) });
    const headers = { type: 'application/json' };
    // Some backends ignore auth headers with beacon; embed token as query if needed.
    // Prefer standard: use Beacon with Bearer via Keepalive fetch fallback if beacon not honored.
    // Here we try beacon without auth header; backend may read token from cookie as fallback.
    return navigator.sendBeacon(url, new Blob([payload], headers));
  } catch { return false; }
}

/**
 * Initialize backend syncing for scribbles.
 * - Loads local immediately.
 * - Fetches remote in background; if present and different, replaces local and calls setData.
 * - Debounces POST of entire scribbles object on each local save.
 *
 * @param {Object} opts
 * @param {() => Object} opts.getData - returns current shapes/scribbles object
 * @param {(data: Object) => void} opts.setData - replace local state with provided data
 * @param {number=} opts.debounceMs - debounce interval for push (default 1500ms)
 * @returns {{ schedulePush: () => void }}
 */
export function initScribblesSync({ getData, setData, debounceMs = 0 } = {}) {
  const userBookId = getBookIdFromUrl();
  let pendingTimer = null;
  let lastPushedJson = null;

  // Background: reconcile with remote once
  (async () => {
    const remote = await fetchRemoteScribbles(userBookId);
    if (remote && typeof remote === 'object') {
      const normalized = withDefaults(remote);
      const local = loadShapesData(userBookId);
      const jLocal = JSON.stringify(local);
      const jRemote = JSON.stringify(normalized);
      if (jLocal !== jRemote) {
        // Replace local with remote (server is source of truth if available)
        saveShapesData(normalized, userBookId);
        try { setData?.(normalized); } catch {}
      }
    }
  })();

  async function doPushNow() {
    const scribbles = withDefaults(getData?.() || {});
    const payloadJson = JSON.stringify(scribbles);
    if (payloadJson === lastPushedJson) return;
    const ok = await pushRemoteScribbles(userBookId, scribbles);
    if (ok) lastPushedJson = payloadJson;
  }

  function schedulePush() {
    // Immediate push when debounceMs <= 0
    if ((debounceMs | 0) <= 0) { doPushNow(); return; }
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => { pendingTimer = null; doPushNow(); }, Math.max(0, debounceMs | 0));
  }

  // Try to flush on page hide
  async function pushWithKeepalive() {
    try {
      const token = getCookie('authToken');
      const base = window.API_URLS?.BOOK;
      const id = getBookIdFromUrl();
      if (!token || !base || !id) return false;
      const url = `${base}update/${encodeURIComponent(id)}/`;
      const scribbles = withDefaults(getData?.() || {});
      const res = await fetch(url, {
        method: 'POST',
        keepalive: true,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scribbles })
      });
      return res.ok;
    } catch { return false; }
  }

  const onVisibility = () => { if (document.visibilityState === 'hidden') { pushWithKeepalive().then(ok => { if (!ok) schedulePush(); }); } };
  document.addEventListener('visibilitychange', onVisibility);

  // Also on unload (best-effort; may be skipped by browsers)
  window.addEventListener('beforeunload', () => { pushWithKeepalive(); });

  return { schedulePush };
}
