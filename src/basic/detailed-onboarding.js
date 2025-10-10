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
  // Choose display based on element type
  const asFlex = el.classList.contains('heightSetterInfo');
  el.style.display = asFlex ? 'flex' : 'block';
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

async function markDetailedOnboardingComplete() {
  const token = storageGet('authToken');
  const url = `${window.API_URLS.USER}update/`;

  // Merge with existing persisted_storage to avoid overwriting other keys
  let existing = {};
  try {
    const info = await fetchUserInfo();
    existing = (info && info.persisted_storage) || {};
  } catch {}

  const merged = Object.assign({}, existing, { detailedpage_onboarding_completed: true });
  const body = { persisted_storage: merged };

  let res = await fetch(url, {
    method: 'POST',
    headers: Object.assign(
      { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      token ? { 'Authorization': `Bearer ${token}` } : {}
    ),
    body: JSON.stringify(body)
  });

  if (res.status === 401 && token) {
    try { localStorage.removeItem('authToken'); } catch {}
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    });
  }
  return res.ok;
}

function whenLoadedThen(fn) {
  // Prefer to wait until the main book skeleton overlay disappears
  const skel = document.querySelector('.skeletonLoadingMainBook');
  if (skel) {
    const runIfHidden = () => {
      const comp = window.getComputedStyle(skel);
      if (comp.display === 'none' || comp.visibility === 'hidden' || comp.opacity === '0') {
        clearInterval(poller);
        fn();
        return true;
      }
      return false;
    };

    // If already hidden, run immediately
    if (runIfHidden()) return;

    // Poll for up to ~2 seconds as app code hides skeleton after init
    const poller = setInterval(() => {
      if (runIfHidden()) return;
    }, 150);
    setTimeout(() => { clearInterval(poller); fn(); }, 2000);
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
  const heightSetterInfo = document.querySelector('.heightSetterInfo.onboardingInterfaceDetailed');
  const holdupInfo = document.querySelector('.holdupInfo.onboardingInterfaceDetailed');
  if (!heightSetterInfo || !holdupInfo) return;

  // Check server-side persisted flag to avoid re-showing
  const info = await fetchUserInfo();
  const persisted = (info && info.persisted_storage) || {};
  const completed = persisted && persisted.detailedpage_onboarding_completed === true;
  if (completed) return;

  // UI helpers to dim/disable controls while onboarding tips are visible
  function setControlsDimmed(on) {
    document.querySelectorAll('.controls').forEach(root => {
      try {
        root.style.background = on ? '#E4E4E4' : '';
        root.style.pointerEvents = on ? 'none' : '';
      } catch {}
    });
    document.querySelectorAll('.control').forEach(el => {
      try { el.style.opacity = on ? '0.5' : ''; } catch {}
    });
  }

  function setPageWrappersZ(on) {
    document.querySelectorAll('.pageWrapper').forEach(el => {
      try { el.style.zIndex = on ? '-1' : ''; } catch {}
    });
  }

  const firstClose = heightSetterInfo.querySelector('.closeOnboarding');
  const secondClose = holdupInfo.querySelector('.closeOnboarding');

  let tShowSecond = null;
  let secondShown = false;
  let pausedForSecond = false;

  function showSecond() {
    if (secondShown) return;
    secondShown = true;
    setControlsDimmed(true);
    setPageWrappersZ(true);
    try {
      const r = window.reader;
      const idx = typeof r?.getActive === 'function' ? r.getActive() : (r?.active ?? -1);
      const sys = r?.instances?.[idx];
      const playing = !!sys?.audioCore?.isPlaying;
      if (playing) pausedForSecond = true;
      r?.pause?.();
    } catch {}
    if (heightSetterInfo && heightSetterInfo.style.display !== 'none') {
      fadeOut(heightSetterInfo, () => fadeIn(holdupInfo));
    } else {
      fadeIn(holdupInfo);
    }
  }

  function showFirst() {
    setControlsDimmed(false);
    fadeIn(heightSetterInfo);
  }

  if (firstClose) {
    firstClose.addEventListener('click', () => {
      fadeOut(heightSetterInfo, () => {
        setControlsDimmed(false);
        if (tShowSecond) { clearTimeout(tShowSecond); tShowSecond = null; }
        tShowSecond = setTimeout(showSecond, 5000);
      });
    });
  }

  if (secondClose) {
    secondClose.addEventListener('click', async () => {
      try { await markDetailedOnboardingComplete(); } catch {}
      fadeOut(holdupInfo, () => {
        setControlsDimmed(false);
        setPageWrappersZ(false);
        try { if (pausedForSecond) window.reader?.play?.(); } catch {}
      });
    });
  }

  // Drive the timing off the first time audio actually starts playing
  let firstTriggerScheduled = false;
  const boundCores = new WeakSet();

  function attachToActiveAudioCore() {
    const r = window.reader;
    if (!r) return;
    const idx = typeof r.getActive === 'function' ? r.getActive() : (r.active ?? -1);
    if (idx < 0) return;
    const sys = r.instances?.[idx];
    const ac = sys?.audioCore;
    if (!ac || boundCores.has(ac)) return;
    boundCores.add(ac);
    const maybeSchedule = () => {
      if (firstTriggerScheduled) return;
      firstTriggerScheduled = true;
      setTimeout(showFirst, 5000);
    };
    ac.onPlay(() => { maybeSchedule(); });
    if (ac.isPlaying) { maybeSchedule(); }
  }

  // Attach once reader is ready and on future page changes
  const waitForReader = setInterval(() => {
    if (window.reader && Array.isArray(window.reader.instances)) {
      clearInterval(waitForReader);
      attachToActiveAudioCore();
      window.addEventListener('reader:active_page', attachToActiveAudioCore);
    }
  }, 200);
});
