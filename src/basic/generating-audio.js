// generating-audio.js — Event-driven overlay for "Generating audio" flow
// Provides window.GeneratingOverlay.start(pageNumber) and .completeSoon()

import { getVideo, getNextId, saveVideoState, getVideoState } from './video-catalog.js';

let __open = false;
let __completeSoon = false;
let __raf = 0;

function currentPageNumber() {
  try { if (window.currentBookContext?.pageNumber) return window.currentBookContext.pageNumber; } catch {}
  try {
    const idx = window.app?.reader?.getActive?.();
    const pn = window.app?.pageDescriptors?.[idx]?.page_number;
    if (pn != null) return pn;
  } catch {}
  return 42;
}

function buildEl(tag, className, html) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (html != null) el.innerHTML = html;
  return el;
}

export function startGeneratingAudioOverlay({ pageNumber } = {}) {
  if (__open) return;
  __open = true;

  // Hide main content (keep nav + inbox)
  document.body.classList.add('generating-audio');

  const overlay = buildEl('div', 'genAudioOverlay');

  // Center text
  const pg = pageNumber || currentPageNumber();
  const centerText = buildEl('div', 'genCenterText', `Generating audio for page ${pg}`);
  overlay.appendChild(centerText);

  // Back button (top-left, 20px below nav)
  const backBtn = buildEl('button', 'genBackBtn', `<i class="ph ph-caret-left"></i><span>Go back to book</span>`);
  overlay.appendChild(backBtn);

  // Progress container
  const progress = buildEl('div', 'genProgress');
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', '100');
  progress.setAttribute('aria-valuenow', '26');
  progress.setAttribute('aria-label', 'Audio generation progress');
  const bar = buildEl('div', 'bar');
  const label = buildEl('span', 'label', '26% done');
  bar.appendChild(label);
  progress.appendChild(bar);
  overlay.appendChild(progress);

  // Video container (positioned later above bottom progress)
  const videoWrap = buildEl('div', 'genVideoContainer');
  videoWrap.style.bottom = '80px'; // reserve space for bottom bar
  const video = document.createElement('video');
  const savedState = getVideoState() || null;
  let currentVideoId = (typeof window !== 'undefined' && window.generatingVideoId)
    ? String(window.generatingVideoId)
    : (savedState?.id || 'default');
  let vidMeta = getVideo(currentVideoId) || {};
  video.src = String(vidMeta.url || '');
  video.preload = 'metadata';
  video.controls = false; // we implement toggling
  video.autoplay = true; // attempt autoplay
  // Try autoplay as soon as possible (may be blocked; we also try on 'canplay')
  try { video.play?.().catch(() => {}); } catch {}
  const playOverlay = buildEl('div', 'videoPlayOverlay', '<i class="ph ph-play"></i>');
  videoWrap.appendChild(video);
  videoWrap.appendChild(playOverlay);
  overlay.appendChild(videoWrap);

  // Credits (right aligned) — placed under the video inside the container
  const credits = buildEl('div', 'genCredits');
  function renderCredits(meta) {
    const credIcon = (meta.credits && meta.credits.icon) ? meta.credits.icon : 'ph-youtube-logo';
    const credLabel = (meta.credits && meta.credits.label) ? meta.credits.label : 'Daily Dose Of Internet';
    const credHref = (meta.credits && meta.credits.href) ? meta.credits.href : '#';
    const suggIcon = (meta.suggestedBy && meta.suggestedBy.icon) ? meta.suggestedBy.icon : 'ph-x-logo';
    const suggLabel = (meta.suggestedBy && meta.suggestedBy.label) ? meta.suggestedBy.label : '@eipieq';
    const suggHref = (meta.suggestedBy && meta.suggestedBy.href) ? meta.suggestedBy.href : '#';
    credits.innerHTML = `
      <div class="creditVideo"><p>credits to <a class="creditLink" href="${credHref}" target="_blank" rel="noopener"><i class="ph ${credIcon}"></i>${credLabel}</a></p></div>
      <div class="suggested"><p>suggested by <a class="suggestedLink" href="${suggHref}" target="_blank" rel="noopener"><i class="ph ${suggIcon}"></i>${suggLabel}</a></p></div>
    `;
  }
  renderCredits(vidMeta);
  videoWrap.appendChild(credits);

  // Completion CTA (initially hidden)
  const completeBox = buildEl('div', 'genCompleteBox');
  const note = buildEl('p', 'genCompleteNote', 'your video’s timestamp is saved. continue anytime from the “paw” tab');
  const cta = buildEl('button', 'genReturnBtn', '<i class="ph ph-books"></i><span>generated, let\'s get back to reading!</span>');
  completeBox.appendChild(note);
  completeBox.appendChild(cta);
  overlay.appendChild(completeBox);

  document.body.appendChild(overlay);

  // Position back button below nav by measuring nav height
  try {
    const nav = document.querySelector('nav');
    const navH = nav ? nav.offsetHeight : 64;
    backBtn.style.top = (navH + 20) + 'px';
  } catch { backBtn.style.top = '84px'; }

  // Timeline
  centerText.classList.add('anim-enter-left');
  setTimeout(() => { backBtn.classList.add('anim-fade-down-in'); }, 1000);
  setTimeout(() => { centerText.classList.add('anim-exit-right'); }, 3000);
  setTimeout(() => { progress.classList.add('anim-fade-in-left-fixed'); progress.style.opacity = '1'; }, 3000);
  setTimeout(() => { progress.classList.add('moved-bottom'); }, 3000 + 2000);
  setTimeout(() => {
    videoWrap.classList.add('visible');
    videoWrap.style.top = 'auto';
    videoWrap.style.transform = 'translateX(-50%)';
    videoWrap.style.bottom = (30 + 30 + 8) + 'px';
  }, 3000 + 2000 + 500);

  // Erratic 5-min progress; fix flicker via monotonic clamp
  let startTs = 0;
  let finishing = false;
  let finishStart = 0;
  let lastPctFloat = 26; // starting percent as float
  function erraticPct(elapsedMs) {
    const dur = 5 * 60 * 1000; // 5 minutes
    const f = Math.min(1, Math.max(0, elapsedMs / dur));
    const ease = (x) => 1 - Math.pow(1 - x, 2);
    const n = Math.sin(elapsedMs/13000)*0.06 + Math.sin(elapsedMs/4200)*0.03 + (Math.random()-0.5)*0.01;
    let v = ease(f) + n; v = Math.min(1, Math.max(0, v));
    return 26 + v * (94 - 26);
  }
  function rafTick(ts) {
    if (!startTs) startTs = ts;
    let pctFloat;
    if (finishing) {
      const ft = ts - finishStart;
      const d = 3000;
      const v = Math.min(1, ft / d);
      pctFloat = lastPctFloat + (100 - lastPctFloat) * v;
    } else {
      pctFloat = erraticPct(ts - startTs);
      if (__completeSoon) { finishing = true; finishStart = ts; }
    }
    // Monotonic non-decreasing; avoid flicker like 16-17-16
    pctFloat = Math.max(lastPctFloat, pctFloat);
    lastPctFloat = Math.min(100, pctFloat);

    bar.style.width = `${lastPctFloat}%`;
    const labelInt = Math.round(lastPctFloat);
    label.textContent = `${labelInt}% done`;
    progress.setAttribute('aria-valuenow', String(labelInt));

    if (lastPctFloat >= 100) {
      setTimeout(() => {
        progress.style.opacity = '0';
        progress.style.display = 'none';
        completeBox.style.opacity = '1';
      }, 200);
      __raf = 0; return;
    }
    __raf = requestAnimationFrame(rafTick);
  }
  setTimeout(() => { __raf = requestAnimationFrame(rafTick); }, 3000 + 100);

  // Interactions
  const teardown = (opts = { startAudio: false }) => {
    try { if (__raf) cancelAnimationFrame(__raf); } catch {}
    // Fade overlay out, then reveal content by removing generating state
    try { overlay.style.transition = 'opacity 250ms ease'; overlay.style.opacity = '0'; } catch {}
    setTimeout(() => {
      try { saveVideoState(currentVideoId, video.currentTime || 0); } catch {}
      document.body.classList.remove('generating-audio');
      try { overlay.remove(); } catch {}
      __open = false; __completeSoon = false;
      // Optionally start the book audio (CTA only)
      if (opts.startAudio) {
        try { window.reader?.play?.(); } catch {}
      }
    }, 260);
    document.removeEventListener('keydown', onKey, true);
  };
  backBtn.addEventListener('click', () => teardown({ startAudio: false }));
  cta.addEventListener('click', () => teardown({ startAudio: true }));

  // Play/pause logic: click toggles; space toggles while overlay active
  const togglePlay = () => { try { if (video.paused) { video.play().catch(() => {}); } else { video.pause(); } } catch {} };
  videoWrap.addEventListener('click', togglePlay);
  // Attempt autoplay when possible
  video.addEventListener('canplay', () => { try { video.play?.().catch(() => {}); } catch {} });
  const onKey = (e) => { if (e.code === 'Space') { e.preventDefault(); e.stopPropagation(); togglePlay(); } };
  document.addEventListener('keydown', onKey, true);
  video.addEventListener('play', () => { playOverlay.classList.add('hidden'); });
  video.addEventListener('pause', () => { playOverlay.classList.remove('hidden'); });

  // Restore saved timestamp and playlist handling
  video.addEventListener('loadedmetadata', () => {
    try {
      const startT = (savedState && savedState.id === currentVideoId) ? (savedState.t || 0) : 0;
      if (startT > 0 && isFinite(video.duration)) video.currentTime = Math.min(Math.max(0, startT), Math.max(0, video.duration - 0.5));
    } catch {}
  }, { once: true });
  let _lastSave = 0;
  video.addEventListener('timeupdate', () => {
    const now = Date.now();
    if (now - _lastSave > 1000) { _lastSave = now; try { saveVideoState(currentVideoId, video.currentTime || 0); } catch {} }
  });
  video.addEventListener('ended', () => {
    try {
      const nextId = getNextId(currentVideoId) || currentVideoId;
      currentVideoId = nextId; vidMeta = getVideo(currentVideoId) || {}; renderCredits(vidMeta);
      video.src = String(vidMeta.url || ''); video.load(); try { saveVideoState(currentVideoId, 0); } catch {}
      video.play?.().catch(() => {});
    } catch {}
  });
}

export function completeGeneratingOverlaySoon() { __completeSoon = true; }

// Global API
if (typeof window !== 'undefined') {
  window.GeneratingOverlay = {
    start: (pageNumber) => startGeneratingAudioOverlay({ pageNumber }),
    completeSoon: () => completeGeneratingOverlaySoon(),
    isOpen: () => __open,
  };
}
