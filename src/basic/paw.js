// Paw tab toggle + stacked video thumbnails (3 items) with progress
// - Adds a stack panel under the `.pawTab` showing the first 3 videos
//   from the catalog, rotated as requested and animated open/close.
// - Clicking a thumbnail opens a dialog with video + credits.

import { listVideos, getVideo, getVideoState, saveVideoState, getVideoTimestamp, saveVideoTimestamp, getVideoDuration, saveVideoDuration } from './video-catalog.js';

function buildEl(tag, className, html) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (html != null) el.innerHTML = html;
  return el;
}

function initPawToggle() {
  try {
    const paw = document.querySelector('.pawTab');
    if (!paw) return;

    // Create container once; position near paw on open
    const stack = buildEl('div', 'pawVideoStack');
    stack.setAttribute('aria-hidden', 'true');
    document.body.appendChild(stack);

    const ids = listVideos().slice(0, 3);
    const rotations = [2.37, -1.97, 0.8];
    const items = [];

    // Build the three cards
    ids.forEach((id, idx) => {
      const meta = getVideo(id) || {};
      const card = buildEl('div', `pawVideoItem idx-${idx + 1}`);
      card.style.setProperty('--rot-deg', `${rotations[idx]}deg`);

      const thumb = buildEl('div', 'pawVideoThumb');
      const thumbUrl = meta.thumbnail || '';
      if (thumbUrl) {
        thumb.style.backgroundImage = `url("${thumbUrl}")`;
      } else {
        thumb.classList.add('fallback');
      }
      card.appendChild(thumb);

      // Progress UI
      const progWrap = buildEl('div', 'pawProgWrap');
      const progBg = buildEl('div', 'pawProgBg');
      const progFill = buildEl('div', 'pawProgFill');
      progBg.appendChild(progFill);
      progWrap.appendChild(progBg);
      card.appendChild(progWrap);

      // Clicking opens the completion dialog clone with a live timer
      card.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Hide stack while dialog is open
        try {
          closeStack(); paw.classList.remove('active');
          // Force immediate hide of stack visuals
          try { stack.classList.remove('visible'); } catch {}
          try { items.forEach(({card}) => card.classList.remove('visible')); } catch {}
        } catch {}
        openPawDialog(meta, id);
      });

      stack.appendChild(card);
      items.push({ id, meta, card, progFill });
    });

    let openTimers = [];
    let isOpen = false;

    function clearTimers() {
      try { openTimers.forEach(t => clearTimeout(t)); } catch {}
      openTimers = [];
    }

    function positionStack() {
      try {
        const r = paw.getBoundingClientRect();
        const left = (r.left + r.width / 2) - 120; // center 240px under paw
        const top = r.bottom + 12; // 12px gap below paw
        stack.style.left = `${Math.max(8, left)}px`;
        stack.style.top = `${Math.max(8, top)}px`;
      } catch {}
    }

    function updateProgressBars() {
      // Default 0%; compute percent for each item based on per-video timestamps
      const savedSingle = getVideoState?.() || null;
      const tFor = (vid) => {
        try {
          const t = Number(getVideoTimestamp?.(vid) || 0);
          if (t > 0) return t;
        } catch {}
        try {
          // Fallback to legacy single saved state
          if (savedSingle && savedSingle.id === vid) return Number(savedSingle.t || 0);
        } catch {}
        return 0;
      };
      items.forEach(({ id, meta, progFill }) => {
        progFill.style.width = '0%';
        try {
          // Prefer stored duration. If missing, fetch metadata once and cache.
          let d = Math.max(0, Number(getVideoDuration?.(id) || 0));
          if (d > 0) {
            const t = tFor(id);
            const pct = Math.max(0, Math.min(100, (t / d) * 100));
            progFill.style.width = pct.toFixed(1) + '%';
          } else {
            const v = document.createElement('video');
            v.preload = 'metadata';
            v.src = String(meta.url || '');
            v.addEventListener('loadedmetadata', () => {
              try {
                const dur = Math.max(1, Number(v.duration) || 1);
                try { saveVideoDuration?.(id, Math.floor(dur)); } catch {}
                const t = tFor(id);
                const pct = Math.max(0, Math.min(100, (t / dur) * 100));
                progFill.style.width = pct.toFixed(1) + '%';
              } catch {}
            }, { once: true });
          }
        } catch {}
      });
    }

    function openStack() {
      if (isOpen) return;
      isOpen = true;
      stack.classList.add('visible');
      stack.setAttribute('aria-hidden', 'false');
      positionStack();
      updateProgressBars();
      // Animate 1 -> 2 -> 3
      clearTimers();
      items.forEach(({ card }, idx) => {
        openTimers.push(setTimeout(() => { card.classList.add('visible'); }, idx * 120));
      });

      // Click-away to close when user clicks anywhere outside paw/stack
      const onDocClick = (ev) => {
        try {
          const t = ev.target;
          if (paw.contains(t) || stack.contains(t)) return; // clicks inside keep it open
        } catch {}
        try { paw.classList.remove('active'); } catch {}
        closeStack();
      };
      // Save for removal on close
      openStack._onDocClick = onDocClick;
      document.addEventListener('mousedown', onDocClick, true);
      document.addEventListener('touchstart', onDocClick, { passive: true, capture: true });
    }

    function closeStack() {
      if (!isOpen) return;
      isOpen = false;
      // Animate 3 -> 2 -> 1
      clearTimers();
      items.slice().reverse().forEach(({ card }, rIdx) => {
        openTimers.push(setTimeout(() => { card.classList.remove('visible'); }, rIdx * 120));
      });
      // After last, hide container
      openTimers.push(setTimeout(() => {
        stack.classList.remove('visible');
        stack.setAttribute('aria-hidden', 'true');
      }, 3 * 120 + 180));

      // Remove click-away listeners if present
      try {
        if (openStack._onDocClick) {
          document.removeEventListener('mousedown', openStack._onDocClick, true);
          document.removeEventListener('touchstart', openStack._onDocClick, { capture: true });
          openStack._onDocClick = null;
        }
      } catch {}
    }

    // Keep position in sync when viewport changes
    const onReposition = () => { if (isOpen) positionStack(); };
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, { passive: true });

    paw.addEventListener('click', (e) => {
      try { paw.classList.toggle('active'); } catch {}
      if (paw.classList.contains('active')) openStack(); else closeStack();
    });

    // Dialog UI from generating final screen with a left timer
    function openPawDialog(meta, videoId) {
      // Build overlay
      const overlay = buildEl('div', 'genAudioOverlay pawDialogOverlay');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      // Back button (from top)
      const backBtn = buildEl('button', 'genBackBtn', '<i class="ph ph-caret-left"></i><span>Go back to book</span>');
      overlay.appendChild(backBtn);
      try {
        const nav = document.querySelector('nav');
        const navH = nav ? nav.offsetHeight : 64;
        backBtn.style.top = (navH + 20) + 'px';
      } catch { backBtn.style.top = '84px'; }

      // Video container (from top)
      const videoWrap = buildEl('div', 'genVideoContainer');
      const video = document.createElement('video');
      try {
        video.src = String(meta?.url || '');
        video.preload = 'metadata';
        // Detailed view: start paused and with sound
        video.muted = false;
        video.playsInline = true;
        video.controls = false;
        video.autoplay = false;
      } catch {}
      // Loading spinner overlay (visible until video is ready)
      const loadingOverlay = buildEl('div', 'videoLoadingOverlay', '<i class="ph ph-circle-notch paw-spin"></i>');
      videoWrap.appendChild(video);
      videoWrap.appendChild(loadingOverlay);
      
      // Credits
      const credits = buildEl('div', 'genCredits');
      const credIcon = (meta?.credits && meta.credits.icon) ? meta.credits.icon : 'ph-youtube-logo';
      const credLabel = (meta?.credits && meta.credits.label) ? meta.credits.label : 'Daily Dose Of Internet';
      const credHref = (meta?.credits && meta.credits.href) ? meta.credits.href : '#';
      const suggIcon = (meta?.suggestedBy && meta.suggestedBy.icon) ? meta.suggestedBy.icon : 'ph-x-logo';
      const suggLabel = (meta?.suggestedBy && meta.suggestedBy.label) ? meta.suggestedBy.label : '@eipieq';
      const suggHref = (meta?.suggestedBy && meta.suggestedBy.href) ? meta.suggestedBy.href : '#';
      credits.innerHTML = `
        <div class="creditVideo"><p>credits to <a class="creditLink" href="${credHref}" target="_blank" rel="noopener"><i class="ph ${credIcon}"></i>${credLabel}</a></p></div>
        <div class="suggested"><p>suggested by <a class="suggestedLink" href="${suggHref}" target="_blank" rel="noopener"><i class="ph ${suggIcon}"></i>${suggLabel}</a></p></div>
      `;
      videoWrap.appendChild(credits);
      overlay.appendChild(videoWrap);

      // Completion CTA (from bottom)
      const completeBox = buildEl('div', 'genCompleteBox');
      const note = buildEl('p', 'genCompleteNote', 'your video’s timestamp is saved. continue anytime from the “paw” tab');
      const actions = buildEl('div', 'genCompleteActions');
      const timer = buildEl('div', 'genReturnTimer');
      const timerIcon = buildEl('i', 'ph ph-timer');
      const timerText = buildEl('span', 'time', '00:00');
      timer.appendChild(timerIcon); timer.appendChild(timerText);
      const btn = buildEl('button', 'genReturnBtn', '<i class="ph ph-books"></i><span>let’s get back to reading!</span>');
      actions.appendChild(timer); actions.appendChild(btn);
      completeBox.appendChild(note); completeBox.appendChild(actions);
      overlay.appendChild(completeBox);

      document.body.appendChild(overlay);
      try { document.documentElement.classList.add('pawDialog-open'); document.body.classList.add('pawDialog-open'); } catch {}
      // Dim most UI while dialog is open; keep nav + inbox visible via CSS rules
      const hadGenerating = document.body.classList.contains('generating-audio');
      if (!hadGenerating) {
        try { document.body.classList.add('generating-audio'); } catch {}
      }

      // Timer logic
      let start = Date.now();
      let int = 0;
      function fmt(ms){
        const s = Math.floor(ms/1000);
        const mm = String(Math.floor(s/60)).padStart(2,'0');
        const ss = String(s%60).padStart(2,'0');
        return mm+':'+ss;
      }
      function tick(){
        try { timerText.textContent = fmt(Date.now()-start); } catch {}
      }
      tick();
      int = setInterval(tick, 1000);

      // Interactions
      let hasPlayedOnce = false;
      const applyResumeTime = () => {
        try {
          const legacy = getVideoState?.();
          let t = Number(getVideoTimestamp?.(videoId) || 0);
          if (!t && legacy && legacy.id === videoId) t = Number(legacy.t || 0);
          t = Math.max(0, Math.floor(t || 0));
          if (!t) return;
          const setT = () => { try { if (isFinite(video.duration)) video.currentTime = Math.min(t, Math.max(0, (video.duration || t) - 0.5)); } catch {} };
          if (video.readyState >= 1) setT(); else video.addEventListener('loadedmetadata', setT, { once: true });
        } catch {}
      };
      const togglePlay = () => { try { if (video.paused) { applyResumeTime(); video.play().catch(() => {}); } else { video.pause(); } } catch {} };
      const onWrapClick = () => togglePlay();
      videoWrap.addEventListener('click', onWrapClick);
      // First play: enable native controls and stop hijacking clicks
      video.addEventListener('play', () => {
        hasPlayedOnce = true;
        // After playback starts, show native controls and stop hijacking clicks
        try { video.controls = true; } catch {}
        try { videoWrap.removeEventListener('click', onWrapClick); } catch {}
      });
      // Loading state: while loading/buffering, hide the play icon
      const hideLoading = () => {
        try { loadingOverlay.classList.add('hidden'); } catch {}
      };
      const showLoading = () => {
        try { loadingOverlay.classList.remove('hidden'); } catch {}
      };
      showLoading();
      video.addEventListener('canplay', () => { hideLoading(); try { saveVideoDuration?.(videoId, Math.floor(Number(video.duration) || 0)); } catch {} });
      video.addEventListener('canplaythrough', hideLoading);
      video.addEventListener('playing', hideLoading);
      video.addEventListener('waiting', showLoading);

      // Close helpers
      // Persist timestamp every 2 seconds and on close
      let saveTick = 0; let lastSave = 0;
      const doSave = () => {
        try {
          const t = Math.floor(Number(video.currentTime) || 0);
          if (!videoId) return;
          saveVideoState(videoId, t); // legacy single-state cookie
          saveVideoTimestamp(videoId, t); // per-video map in localStorage
          try { localStorage.setItem('unr_video_state', JSON.stringify({ id: String(videoId), t })); } catch {}
        } catch {}
      };
      saveTick = setInterval(() => {
        const now = Date.now();
        if (now - lastSave > 500) { doSave(); lastSave = now; }
      }, 2000);

      function close(){
        try { clearInterval(int); } catch {}
        try { if (saveTick) clearInterval(saveTick); } catch {}
        try { doSave(); } catch {}
        try { overlay.remove(); } catch {}
        try { if (!hadGenerating) document.body.classList.remove('generating-audio'); } catch {}
        try { document.documentElement.classList.remove('pawDialog-open'); document.body.classList.remove('pawDialog-open'); } catch {}
      }
      btn.addEventListener('click', (e)=>{ e.preventDefault(); close(); });
      backBtn.addEventListener('click', (e)=>{ e.preventDefault(); close(); });
      // Clicking the background should NOT close the dialog
      // Intentionally no Escape-to-close; only back or main button

      // Restore previous timestamp if we have it
      try { applyResumeTime(); } catch {}

      // Entrance animations
      setTimeout(()=>{ backBtn.classList.add('anim-fade-down-in'); }, 20);
      setTimeout(()=>{ videoWrap.classList.add('visible'); videoWrap.classList.add('anim-fade-down-in'); }, 80);
      setTimeout(()=>{ completeBox.classList.add('anim-fade-up-in'); completeBox.style.opacity = '1'; }, 140);
    }
  } catch {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPawToggle);
} else {
  initPawToggle();
}
