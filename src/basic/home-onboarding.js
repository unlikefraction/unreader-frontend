import { getItem as storageGet } from '../storage.js';

function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

function fadeIn(el) {
  if (!el) return;
  el.style.display = 'block';
  // Restart animation if needed
  el.classList.remove('fade-out');
  void el.offsetWidth; // reflow
  el.classList.add('fade-in');
}

function fadeOut(el, cb) {
  if (!el) { if (cb) cb(); return; }
  el.classList.remove('fade-in');
  el.classList.add('fade-out');
  const done = () => {
    el.style.display = 'none';
    el.removeEventListener('animationend', done);
    if (cb) cb();
  };
  el.addEventListener('animationend', done, { once: true });
}

async function fetchUserInfo() {
  const token = storageGet('authToken');
  if (!token) return null;
  const url = `${window.API_URLS.USER}info/`;
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function markOnboardingComplete() {
  const token = storageGet('authToken');
  const url = `${window.API_URLS.USER}update/`;

  // Merge with existing persisted_storage to avoid overwriting other keys
  let existing = {};
  try {
    const info = await fetchUserInfo();
    existing = (info && info.persisted_storage) || {};
  } catch {}

  const merged = Object.assign({}, existing, { homepage_onboarding_completed: true });
  const body = { persisted_storage: merged };

  let res = await fetch(url, {
    method: 'POST',
    headers: Object.assign(
      { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      token ? { 'Authorization': `Bearer ${token}` } : {}
    ),
    body: JSON.stringify(body)
  });

  // If token provided but unauthorized, retry without it (for robustness)
  if (res.status === 401 && token) {
    try { localStorage.removeItem('authToken'); } catch {}
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  // No need to throw on non-OK; this is non-critical UX state
  return res.ok;
}

function whenLoadedThen(fn) {
  // Prefer to wait until skeleton fade-out completes
  const skel = document.querySelector('.skeletonLoading');
  if (skel) {
    const handler = () => { fn(); };
    // If it already faded out (display none), run immediately
    const computed = window.getComputedStyle(skel);
    if (computed.display === 'none' || computed.visibility === 'hidden') {
      fn();
      return;
    }
    skel.addEventListener('animationend', handler, { once: true });
    // Safety timeout in case animation event doesn’t fire
    setTimeout(() => { fn(); }, 1200);
  } else {
    // Fallback: after window load
    if (document.readyState === 'complete') {
      fn();
    } else {
      window.addEventListener('load', () => fn(), { once: true });
    }
  }
}

onReady(async () => {
  const freeBooks = document.querySelector('.freeBooks.onboardingInterface');
  const inboxInfo = document.querySelector('.inboxInfo.onboardingInterface');
  if (!freeBooks || !inboxInfo) return;

  // Check server-side persisted flag
  const info = await fetchUserInfo();
  const persisted = (info && info.persisted_storage) || {};
  const completed = persisted && persisted.homepage_onboarding_completed === true;
  if (completed) return; // Do not show onboarding

  // Wire button flows
  const freeClose = freeBooks.querySelector('.closeOnboarding');
  const inboxClose = inboxInfo.querySelector('.closeOnboarding');

  if (freeClose) {
    freeClose.addEventListener('click', () => {
      fadeOut(freeBooks, () => {
        fadeIn(inboxInfo);
      });
    });
  }

  if (inboxClose) {
    inboxClose.addEventListener('click', async () => {
      // Mark completion on server, then hide
      try { await markOnboardingComplete(); } catch {}
      fadeOut(inboxInfo);
    });
  }

  // Show the first card once loading is done
  whenLoadedThen(() => {
    fadeIn(freeBooks);
  });
});
