// thoughts.js — floating Thoughts popup on readBook.html

import { getItem as storageGet } from '../storage.js';

function countWords(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.split(' ').length : 0;
}

function getUserBookId() {
  try { return new URLSearchParams(window.location.search).get('id'); } catch { return null; }
}

function debounce(fn, delay) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

document.addEventListener('DOMContentLoaded', () => {
  const fab = document.querySelector('.thoughtsFab');
  const popup = document.querySelector('.thoughtsPopup');
  const textarea = document.querySelector('.thoughtsInput');
  const wordNumEl = document.querySelector('.wordAmountThought');
  const wordsWrap = document.querySelector('.wordsThoughts');
  if (!fab || !popup || !textarea || !wordNumEl || !wordsWrap) return;

  const userBookId = getUserBookId();
  const storageKey = userBookId ? `ub_thoughts_${userBookId}` : null;
  const token = storageGet('authToken');

  // If a previous sync instance exists (HMR or re-entry), stop it first
  try { if (window.__thoughtsSync && typeof window.__thoughtsSync.stop === 'function') window.__thoughtsSync.stop(); } catch {}

  // Track timestamps for conflict resolution
  let lastLocalChangeAt = null; // Date
  let lastSentAt = null;        // Date
  let lastServerSeenAt = null;  // Date

  // Load cached thoughts (from prior session)
  if (storageKey) {
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached != null) textarea.value = cached;
      const tsStr = localStorage.getItem(`${storageKey}:ts`);
      if (tsStr) { try { lastLocalChangeAt = new Date(tsStr); } catch {} }
    } catch {}
  }

  // Initial word count
  wordNumEl.textContent = String(countWords(textarea.value));

  // Autosave locally (debounced) and update word count live
  const saveLocal = () => {
    if (storageKey) {
      try { localStorage.setItem(storageKey, textarea.value); } catch {}
    }
  };
  const debouncedSave = debounce(saveLocal, 500);
  // timestamps declared above

  textarea.addEventListener('input', () => {
    // live word count on each keystroke
    wordNumEl.textContent = String(countWords(textarea.value));
    // debounce local persistence
    debouncedSave();
    // mark dirty for backend sync
    try { dirty = true; } catch {}
    lastLocalChangeAt = new Date();
    // persist client ts for potential cross-reload hints
    if (storageKey) {
      try { localStorage.setItem(`${storageKey}:ts`, lastLocalChangeAt.toISOString()); } catch {}
    }
  });

  // Backend autosync (every ~10s, on any click, and on unload)
  let lastSent = textarea.value;
  let dirty = false;

  async function pushToServer() {
    // Require essentials
    if (!token || !userBookId) return;
    if (!dirty) return;
    const txt = textarea.value;
    if (txt === lastSent) { dirty = false; return; }
    try {
      const res = await fetch(`${window.API_URLS.BOOK}update/${userBookId}/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          thoughts: txt,
          last_updated_at: (lastLocalChangeAt ? lastLocalChangeAt : new Date()).toISOString()
        })
      });
      if (!res.ok) {
        // keep dirty so we can retry later
        return;
      }
      lastSent = txt;
      dirty = false;
      lastSentAt = lastLocalChangeAt || new Date();
    } catch (err) {
      try { console.error('Thoughts sync (readBook) failed:', err); } catch {}
    }
  }

  // interval sync ~10s
  const syncInterval = setInterval(pushToServer, 10_000);
  // opportunistic sync on any click (capture)
  const clickHandler = () => { pushToServer(); };
  document.addEventListener('click', clickHandler, true);

  // Poll server for latest every 5s and reconcile with local
  async function fetchLatest() {
    if (!token || !userBookId) return;
    try {
      const res = await fetch(`${window.API_URLS.BOOK}get-details/${userBookId}/?pages=false`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      if (!res.ok) return;
      const data = await res.json();
      const serverTxt = data?.thoughts ?? '';
      const serverTsStr = data?.thoughts_updated_at;
      const serverTs = serverTsStr ? new Date(serverTsStr) : null;
      if (serverTs && (!lastServerSeenAt || serverTs > lastServerSeenAt)) {
        lastServerSeenAt = serverTs;
      }
      // Compare server timestamp vs last local change; adopt server if newer
      if (serverTs && (!lastLocalChangeAt || serverTs > lastLocalChangeAt)) {
        if (textarea.value !== serverTxt) {
          textarea.value = serverTxt || '';
          wordNumEl.textContent = String(countWords(textarea.value));
          saveLocal();
          lastSent = textarea.value;
          dirty = false; // we just aligned to server
        }
      }
    } catch {}
  }
  const pollInterval = setInterval(fetchLatest, 5_000);
  // Prime once soon after load
  fetchLatest();

  // beacon on unload
  window.addEventListener('beforeunload', () => {
    saveLocal();
    if (navigator.sendBeacon && token && userBookId) {
      const iso = (lastLocalChangeAt ? lastLocalChangeAt : new Date()).toISOString();
      const payload = JSON.stringify({ thoughts: textarea.value, last_updated_at: iso });
      try {
        navigator.sendBeacon(
          `${window.API_URLS.BOOK}update/${userBookId}/`,
          new Blob([payload], { type: 'application/json' })
        );
      } catch {}
    }
    try { clearInterval(syncInterval); } catch {}
    try { clearInterval(pollInterval); } catch {}
    try { document.removeEventListener('click', clickHandler, true); } catch {}
  });

  // Expose a stop hook to avoid duplicate intervals if re-initialized
  window.__thoughtsSync = {
    stop() {
      try { clearInterval(syncInterval); } catch {}
      try { clearInterval(pollInterval); } catch {}
      try { document.removeEventListener('click', clickHandler, true); } catch {}
    }
  };

  // Toggle open/close
  const toggle = () => {
    popup.classList.toggle('visible');
    fab.classList.toggle('active');
    popup.setAttribute('aria-hidden', popup.classList.contains('visible') ? 'false' : 'true');
    if (popup.classList.contains('visible')) {
      // Close Inbox if open (mutually exclusive)
      try {
        const inboxPopup = document.querySelector('.inboxPopup');
        const inboxIcon  = document.querySelector('.inbox');
        if (inboxPopup && inboxPopup.classList.contains('visible')) inboxPopup.classList.remove('visible');
        if (inboxIcon) inboxIcon.classList.remove('active');
      } catch {}
      // focus textarea when opened
      setTimeout(() => textarea.focus(), 0);
    }
  };
  fab.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });

  // Keyboard shortcut: Alt/Option+T to toggle Thoughts (ignore when typing)
  function isTypingTarget(el) {
    const tag = (el?.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || el?.isContentEditable;
  }
  document.addEventListener('keydown', (e) => {
    const isAltT = e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.code === 'KeyT' || (e.key && e.key.toLowerCase() === 't'));
    if (isAltT) {
      // Force toggle even if typing inside the thoughts textarea/input
      e.preventDefault();
      toggle();
      return;
    }
    // Otherwise ignore when typing
    if (isTypingTarget(e.target)) return;
  });

  // Click-away to close
  document.addEventListener('click', (e) => {
    if (!popup.classList.contains('visible')) return;
    if (!popup.contains(e.target) && !fab.contains(e.target)) {
      popup.classList.remove('visible');
      fab.classList.remove('active');
      popup.setAttribute('aria-hidden', 'true');
    }
  });
});
