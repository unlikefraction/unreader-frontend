// Simple top-right sticky mode toggle between audio and reading
// Positions 30px from right and 20px below the nav

function createModeToggle() {
  try {
    // Avoid duplicate mounts
    if (document.querySelector('.mode-toggle')) return;

    const wrapper = document.createElement('div');
    // Reuse `.controls` styling for visual consistency
    wrapper.className = 'mode-toggle controls';
    wrapper.setAttribute('role', 'group');
    wrapper.setAttribute('aria-label', 'Toggle reading/audio mode');

    const btnAudio = document.createElement('button');
    btnAudio.className = 'control mode-btn mode-audio';
    btnAudio.title = 'Audio mode';
    btnAudio.innerHTML = '<i class="ph ph-headphones"></i>';
    btnAudio.type = 'button';

    const btnReading = document.createElement('button');
    btnReading.className = 'control mode-btn mode-reading';
    btnReading.title = 'Reading mode';
    btnReading.innerHTML = '<i class="ph ph-book-open-text"></i>';
    btnReading.type = 'button';

    wrapper.append(btnAudio, btnReading);
    document.body.appendChild(wrapper);

    // Initial mode from storage or default to 'reading'
    let mode = 'reading';
    try {
      mode = localStorage.getItem('unreader_mode') || 'reading';
    } catch {}

    function applyMode(next) {
      mode = next === 'audio' ? 'audio' : 'reading';
      try { localStorage.setItem('unreader_mode', mode); } catch {}

      // Update pressed/active states
      const isAudio = mode === 'audio';
      btnAudio.classList.toggle('active', isAudio);
      btnReading.classList.toggle('active', !isAudio);
      btnAudio.setAttribute('aria-pressed', String(isAudio));
      btnReading.setAttribute('aria-pressed', String(!isAudio));

      // Reflect on <body> for CSS-driven UI changes
      document.body.classList.toggle('reading-mode', !isAudio);
      document.body.classList.toggle('audio-mode', isAudio);

      // Start/stop reading-mode watcher
      if (!isAudio) startReadingModeWatcher(); else stopReadingModeWatcher();

      // Sync per-page headers alignment
      updatePageHeaders();

      // Notify listeners
      const evt = new CustomEvent('mode-toggle', { detail: { mode } });
      window.dispatchEvent(evt);
    }

    // Click handlers
    btnAudio.addEventListener('click', () => applyMode('audio'));
    btnReading.addEventListener('click', () => applyMode('reading'));

    // Positioning: 20px below nav, 30px from right (right via CSS)
    function positionToggle() {
      const nav = document.querySelector('nav');
      const navH = nav ? Math.ceil(nav.getBoundingClientRect().height) : 0;
      wrapper.style.top = (navH + 20) + 'px';
    }
    positionToggle();
    window.addEventListener('resize', positionToggle);

    const nav = document.querySelector('nav');
    if (nav && 'ResizeObserver' in window) {
      try {
        const ro = new ResizeObserver(positionToggle);
        ro.observe(nav);
      } catch {}
    }

    // Fallback reflow after fonts/icons load
    window.addEventListener('load', positionToggle);

    // Helper: update page header alignment per mode
    function updatePageHeaders() {
      const isAudio = mode === 'audio';
      document.querySelectorAll('.pageDetails').forEach(h => {
        try {
          h.style.justifyContent = isAudio ? 'space-between' : 'flex-start';
          h.style.flexDirection = isAudio ? 'row-reverse' : 'row';
        } catch {}
      });
    }

    // --------------- Reading mode: majority-in-view watcher ---------------
    let _rmTick = null;
    let _candidate = { index: -1, since: 0, ratio: 0 };
    const _sentAnalytics = new Set(); // pageNumbers we've reported this session
    let _userId = null;

    function pageWrappers() {
      return Array.from(document.querySelectorAll('.pageWrapper'));
    }
    function computeMajority() {
      const list = pageWrappers();
      if (!list.length) return { index: -1, ratio: 0, top: 0 };
      const vh = window.innerHeight || 800;
      let best = { idx: 0, ratio: 0, top: Infinity };
      for (let i = 0; i < list.length; i++) {
        const r = list[i].getBoundingClientRect();
        const visible = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
        const ratio = Math.max(0, Math.min(1, visible / vh));
        const top = r.top;
        if (ratio > best.ratio + 0.005) {
          best = { idx: i, ratio, top };
        } else if (Math.abs(ratio - best.ratio) <= 0.005) {
          // tie → pick upper one
          if (top < best.top) best = { idx: i, ratio, top };
        }
      }
      return { index: best.idx, ratio: best.ratio, top: best.top };
    }
    function currentPageNumberForIndex(i) {
      try { return window.app?.pageDescriptors?.[i]?.page_number ?? (i + 1); } catch { return (i + 1); }
    }
    async function ensureUserId() {
      if (_userId) return _userId;
      try {
        const token = storageGet('authToken');
        const baseUser = window.API_URLS?.USER;
        if (!token || !baseUser) return null;
        const res = await fetch(`${baseUser}info/`, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } });
        if (!res.ok) return null;
        const data = await res.json();
        _userId = data?.id || null;
        return _userId;
      } catch { return null; }
    }
    async function sendPagesRead(pageNumber) {
      const userBookId = Number(window.reader?.userBookId || 0);
      if (!pageNumber || !userBookId) return;
      const dedupeKey = `${userBookId}:${pageNumber}`;
      if (_sentAnalytics.has(dedupeKey)) return;
      const token = storageGet('authToken');
      if (!token) return;
      
      // Mark page complete via POST (empty body)
      try {
        const baseBook = window.API_URLS?.BOOK;
        if (baseBook) {
          const url = `${baseBook}${encodeURIComponent(userBookId)}/page-read/${encodeURIComponent(pageNumber)}/`;
          await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
        }
      } catch {}
      
      _sentAnalytics.add(dedupeKey);
    }
    function commitMajority(index) {
      try {
        if (index < 0) return false;
        const reader = window.reader;
        let ok = false;
        if (reader && typeof reader.setActive === 'function') {
          reader.setActive(index);
          ok = true;
        }
        // Send analytics once per page per session
        const pn = currentPageNumberForIndex(index);
        sendPagesRead(pn);
        return ok;
      } catch { return false; }
    }
    function tick() {
      if (mode !== 'reading') return; // guard
      const m = computeMajority();
      const now = Date.now();
      if (m.index !== _candidate.index) {
        _candidate = { index: m.index, since: now, ratio: m.ratio };
        return;
      }
      // must be majority and visible enough (> 0.5 of viewport)
      if (m.ratio >= 0.5 && (now - _candidate.since) >= 10000) {
        const ok = commitMajority(m.index);
        // only lock if we actually had a reader to commit against
        if (ok) _candidate.since = now + 1e9; // effectively stop until candidate changes
      }
    }
    function startReadingModeWatcher() {
      if (_rmTick) return;
      _candidate = { index: -1, since: 0, ratio: 0 };
      _rmTick = setInterval(tick, 1000);
      window.addEventListener('scroll', tick, { passive: true });
      window.addEventListener('resize', tick, { passive: true });
    }
    function stopReadingModeWatcher() {
      if (_rmTick) { try { clearInterval(_rmTick); } catch {} _rmTick = null; }
      window.removeEventListener('scroll', tick, { passive: true });
      window.removeEventListener('resize', tick, { passive: true });
    }

    // When user switches to chat holdup, immediately use current majority page
    try {
      document.addEventListener('pointerdown', (e) => {
        const t = e.target;
        if (!t) return;
        const isChatToggle = t.closest?.('.holdup-menu .option-chat');
        if (isChatToggle && mode === 'reading') {
          const m = computeMajority();
          if (m.index >= 0) commitMajority(m.index);
        }
      }, true);
    } catch {}

    // If user clicks inside chat bar in reading mode, fix majority page
    try {
      document.addEventListener('pointerdown', (e) => {
        if (mode !== 'reading') return;
        const t = e.target; if (!t) return;
        const inChatBar = t.closest?.('.holdupChatBar');
        if (inChatBar) {
          const m = computeMajority();
          if (m.index >= 0) commitMajority(m.index);
        }
      }, true);
    } catch {}

    // Apply initial mode
    applyMode(mode);

    // Expose global helpers so other code can switch modes
    try {
      window.UnreaderMode = {
        get: () => mode,
        set: (m) => applyMode(m)
      };
    } catch {}

    // If user clicks any paragraph play icon, ensure we switch to audio first
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target) return;
      const icon = target.closest?.('.paragraph-hover-nav, .mobilePlayFromStart');
      if (icon) {
        applyMode('audio');
      }
    }, true); // capture before play handlers run

    // Watch for dynamic page header creation and adjust in reading mode
    try {
      const mo = new MutationObserver(() => {
        if (mode === 'reading') updatePageHeaders();
      });
      mo.observe(document.body, { subtree: true, childList: true });
    } catch {}
  } catch (e) {
    // Non-fatal: avoid breaking page if any error occurs
    // eslint-disable-next-line no-console
    try { console.warn('mode-toggle init failed', e); } catch {}
  }
}

// Wait for DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createModeToggle);
} else {
  createModeToggle();
}
import { getItem as storageGet } from '../storage.js';
