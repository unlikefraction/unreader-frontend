// -----multiPageReader.js-----
import { AudioSystem } from './audioAndTextGen.js';

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/^[a-z]+:\/\/+/i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}
function cloneForCleanHandlers(el) {
  if (!el) return null;
  const clone = el.cloneNode(true);
  el.replaceWith(clone);
  return clone;
}
function rIC(fn, timeout = 50) {
  const ric = window.requestIdleCallback || ((cb) => setTimeout(() => cb({ timeRemaining: () => 0, didTimeout: true }), timeout));
  return ric(fn, { timeout });
}
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[2]) : null;
}
function qs(name, url = window.location.href) {
  try {
    const u = new URL(url);
    return u.searchParams.get(name);
  } catch { return null; }
}

export default class MultiPageReader {
  /**
   * pages: [{ page_number, textBlobUrl, pageKey?, audioFile, timingFile, offsetMs?, is_read? }]
   */
  constructor(pages, {
    autoPlayFirst = false,
    initialActiveIndex = 0,
    lazyHydration = true,
    prefetchRadius = 1,
    observeRadius = 0.75,
    userBookId = null
  } = {}) {
    this.pageMeta = pages.slice();
    this.pageMeta.forEach(m => {
      m._readyAudioUrl = null;       // final URL once ready
      m._audioSettled = false;       // true when ready && transcript non-null
      m._polling = false;            // avoid parallel polls
      m._waiters = [];               // resolvers waiting for settlement
    });

    this.instances = new Array(pages.length).fill(null);
    this.active = -1;
    this.autoPlayFirst = autoPlayFirst;
    this.lazyHydration = !!lazyHydration;
    this.prefetchRadius = Math.max(0, prefetchRadius | 0);
    this.observeRadius = Math.max(0, Math.min(1, observeRadius ?? 0.75));
    this._controlsBound = false;
    this._paragraphClicksBound = false;
    this._onEndHandlers = new WeakMap();
    this._io = null;
    this._container = null;
    this._initialActiveIndex = Math.max(0, Math.min(initialActiveIndex, pages.length - 1));

    this.userBookId = userBookId ?? qs('id');
    this.audioApiBase = window.API_URLS?.AUDIO || ''; // host must set window.API_URLS.AUDIO
  }

  // ---------- scaffolding ----------
  async _buildScaffolding() {
    let main = document.querySelector('.mainContainer');
    if (!main) {
      main = document.createElement('div');
      main.className = 'mainContainer';
      document.body.appendChild(main);
    }
    this._container = main;

    for (let i = 0; i < this.pageMeta.length; i++) {
      const meta = this.pageMeta[i];
      const pageId = slugify(meta.pageKey || `page-${meta.page_number}-${i}`);

      const p = document.createElement('p');
      p.className = 'mainContent pageRemaining';
      p.dataset.pageId = pageId;
      p.id = `mainContent-${pageId}`;
      p.style.cursor = 'text';

      const html = await (await fetch(meta.textBlobUrl)).text();
      p.innerHTML = html;

      if (i > 0) this._container.appendChild(document.createElement('hr'));
      this._container.appendChild(p);
    }
  }

  async hydratePage(i) {
    if (i < 0 || i >= this.pageMeta.length) return null;
    if (this.instances[i]) return this.instances[i];

    const meta = this.pageMeta[i];
    const sys = new AudioSystem(meta.audioFile, meta.timingFile, meta.textBlobUrl, meta.offsetMs ?? 0);
    sys.textProcessor.pageId = slugify(meta.pageKey || `page-${meta.page_number}-${i}`);

    // build spans first; timings/howler later
    await sys.textProcessor.separateText();
    sys.paragraphSeeker.enableParagraphNavigation();

    const onEnd = () => this.next(true);
    sys.audioCore.onEnd(onEnd);
    this._onEndHandlers.set(sys, onEnd);

    this.instances[i] = sys;
    return sys;
  }

  async ensureAudioReady(i) {
    const sys = await this.hydratePage(i);
    if (!sys) return null;

    if (!sys.audioCore.sound) {
      await sys.textProcessor.loadWordTimings();  // keep your existing JSON
      sys.audioCore.setupAudio();                 // create Howl with current URL
      sys.refreshParagraphNavigation?.();
    }
    return sys;
  }

  async _prefetchAround(i) {
    const tasks = [];
    for (let k = Math.max(0, i - this.prefetchRadius); k <= Math.min(this.pageMeta.length - 1, i + this.prefetchRadius); k++) {
      if (k === i) continue;
      tasks.push((async () => {
        await this.hydratePage(k);
        await rIC(() => {});
      })());
    }
    await Promise.all(tasks);
  }

  _setupIntersectionHydrator() {
    if (!this.lazyHydration) return;
    if (this._io) this._io.disconnect();

    const rootMargin = `${Math.round(this.observeRadius * 100)}% 0%`;
    this._io = new IntersectionObserver(async entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          const el = e.target;
          const all = [...this._container.querySelectorAll('p.mainContent')];
          const i = all.indexOf(el);
          if (i >= 0 && !this.instances[i]) {
            await this.hydratePage(i);
          }
        }
      }
    }, { root: null, rootMargin, threshold: 0.01 });

    this._container.querySelectorAll('p.mainContent').forEach(p => this._io.observe(p));
  }

  async init() {
    await this._buildScaffolding();

    this.setActive(this._initialActiveIndex);
    await this.ensureAudioReady(this.active);
    await this._prefetchAround(this.active);

    this._setupGlobalControls();
    this._setupGlobalParagraphClickDelegation();
    this._setupIntersectionHydrator();

    if (this.autoPlayFirst) await this.play();
  }

  // ---------- state classes ----------
  #pageEl(i) {
    return this._container?.querySelectorAll('p.mainContent')[i] || null;
  }
  #applyPageStateClasses(activeIndex) {
    const N = this.pageMeta.length;
    for (let i = 0; i < N; i++) {
      const el = this.#pageEl(i);
      if (!el) continue;
      el.classList.remove('pageCompleted', 'pageRemaining', 'pageActive');
      if (i < activeIndex) el.classList.add('pageCompleted');
      else if (i > activeIndex) el.classList.add('pageRemaining');
      else el.classList.add('pageActive');
    }
  }

  setActive(i) {
    if (i < 0 || i >= this.pageMeta.length) return;

    for (let k = 0; k < this.instances.length; k++) {
      const sys = this.instances[k];
      if (sys && k !== i) {
        sys.highlighter?.stopHighlighting?.();
        sys.audioCore?.pauseAudio?.();
      }
    }
    this.active = i;
    this.#applyPageStateClasses(i);
    this._syncPlayButton();
  }

  getActive() { return this.active; }

  // ---------- waiter helpers for polling ----------
  _resolveWaiters(meta, url) {
    const waiters = meta._waiters || [];
    meta._waiters = [];
    for (const w of waiters) {
      try { w(url || null); } catch {}
    }
  }
  _waitForSettlement(i) {
    const meta = this.pageMeta[i];
    if (!meta) return Promise.resolve(null);
    if (meta._audioSettled && meta._readyAudioUrl) return Promise.resolve(meta._readyAudioUrl);
    return new Promise(res => {
      (meta._waiters || (meta._waiters = [])).push(res);
    });
  }

  // ---------- AUDIO API polling (only to gate swap) ----------
  async _awaitReadyAudioAndTranscript(i, { pollGeneratingMs = 6000, pollQueuedMs = 8000 } = {}) {
    const meta = this.pageMeta[i];
    if (!meta) return null;
    if (!this.audioApiBase || !this.userBookId) {
      console.warn('⚠️ Audio API base or userBookId missing. Skipping audio API; using default audio.');
      return null;
    }
    if (meta._audioSettled && meta._readyAudioUrl) {
      return meta._readyAudioUrl;
    }
    if (meta._polling) {
      // Another caller is already polling—wait for that result.
      return this._waitForSettlement(i);
    }
    meta._polling = true;

    const token = getCookie('authToken');
    const url = `${this.audioApiBase}book/${encodeURIComponent(this.userBookId)}/page/${encodeURIComponent(meta.page_number)}/`;

    const fetchOnce = async () => {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Audio API ${res.status}`);
      return res.json();
    };

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const data = await fetchOnce();
        const status = data?.status;
        console.log(`🎧 [page ${meta.page_number}] audio status:`, status);

        if (status === 'ready') {
          const audioUrl = data?.audio_url;
          const transcript = data?.time_aligned_transcript ?? null;
          if (audioUrl && transcript) {
            meta._readyAudioUrl = audioUrl;
            meta._audioSettled = true;
            console.log(`✅ [page ${meta.page_number}] audio ready with transcript; url=`, audioUrl);
            this._resolveWaiters(meta, audioUrl);
            return audioUrl;
          }
          console.log(`⏳ [page ${meta.page_number}] waiting for transcript to be non-null...`);
          await new Promise(r => setTimeout(r, pollGeneratingMs));
          continue;
        }

        if (status === 'generating') {
          console.log(`🔄 [page ${meta.page_number}] generating... will recheck in ${pollGeneratingMs}ms`);
          await new Promise(r => setTimeout(r, pollGeneratingMs));
          continue;
        }

        if (status === 'queued') {
          const eta = (data?.estimated_wait_seconds ?? Math.ceil(pollQueuedMs / 1000)) * 1000;
          console.log(`⏳ [page ${meta.page_number}] queued. recheck in ~${eta}ms`);
          await new Promise(r => setTimeout(r, eta));
          continue;
        }
        
        await new Promise(r => setTimeout(r, pollGeneratingMs));
      }
    } catch (e) {
      console.error(`❌ [page ${meta.page_number}] audio polling failed:`, e);
      this._resolveWaiters(meta, null);
      return null;
    } finally {
      meta._polling = false;
    }
  }

  _swapAudioUrl(i, audioUrl) {
    const sys = this.instances[i];
    if (!sys || !audioUrl) return;

    const current = sys.audioCore?.audioFile;
    // 🔒 Do NOT restart if we’re already on this URL
    if (current && sys.audioCore?.sound && String(current) === String(audioUrl)) {
      return;
    }

    try {
      sys.audioCore.pauseAudio();
      if (sys.audioCore.sound) {
        sys.audioCore.sound.unload();
        sys.audioCore.sound = null;
      }
      sys.audioCore.audioFile = audioUrl; // set "constructor spot"
      sys.audioCore.setupAudio();
      console.log(`🔁 swapped audio source for page ${this.pageMeta[i].page_number} -> ${audioUrl}`);
    } catch (e) {
      console.error('audio swap error:', e);
    }
  }

  // ---------- transport ----------
  async play() {
    if (this.active < 0) return;
    const meta = this.pageMeta[this.active];
    const sys = await this.ensureAudioReady(this.active);
    if (!sys) return;

    // If already settled & on the right URL, just play
    if (meta?._audioSettled && meta._readyAudioUrl && sys.audioCore?.audioFile === meta._readyAudioUrl) {
      for (let k = 0; k < this.instances.length; k++) {
        if (k !== this.active) this.instances[k]?.audioCore?.pauseAudio?.();
      }
      await sys.play();
      this._syncPlayButton(true);
      return;
    }

    // Otherwise wait for readiness once, then swap and play
    const url = await this._awaitReadyAudioAndTranscript(this.active);
    if (url) this._swapAudioUrl(this.active, url);

    for (let k = 0; k < this.instances.length; k++) {
      if (k !== this.active) this.instances[k]?.audioCore?.pauseAudio?.();
    }

    await this.instances[this.active].play();
    this._syncPlayButton(true);
  }

  pause() {
    if (this.active < 0) return;
    this.instances[this.active]?.pause?.();
    this._syncPlayButton(false);
  }

  async toggle() {
    if (this.active < 0) return;

    const meta = this.pageMeta[this.active];
    const sys = await this.ensureAudioReady(this.active);
    if (!sys) return;

    // If already on final URL, just pause/resume without polling or swapping
    if (meta?._audioSettled && meta._readyAudioUrl && sys.audioCore?.sound && sys.audioCore.audioFile === meta._readyAudioUrl) {
      sys.toggle();
      setTimeout(() => this._syncPlayButton(), 0);
      return;
    }

    // Not settled yet → wait for it exactly once, then swap & play (no silent play)
    const url = await this._awaitReadyAudioAndTranscript(this.active);
    if (url) this._swapAudioUrl(this.active, url);

    for (let k = 0; k < this.instances.length; k++) {
      if (k !== this.active) this.instances[k]?.audioCore?.pauseAudio?.();
    }
    await this.instances[this.active].play();
    this._syncPlayButton(true);
  }

  forward(seconds = 10) {
    if (this.active < 0) return;
    const sys = this.instances[this.active];
    if (!sys) return;
    const s = sys.audioCore.getCurrentTime();
    this.seek(s + seconds);
  }

  rewind(seconds = 10) {
    if (this.active < 0) return;
    const sys = this.instances[this.active];
    if (!sys) return;
    const s = sys.audioCore.getCurrentTime();
    this.seek(Math.max(0, s - seconds));
  }

  seek(seconds) {
    if (this.active < 0) return;
    const sys = this.instances[this.active];
    if (!sys) return;
    sys.audioCore.sound?.seek(seconds);
    sys.highlighter.handleSeek(seconds);
  }

  setSpeed(speed) {
    if (this.active < 0) return;
    this.instances[this.active]?.setSpeed?.(speed);
  }

  getCurrentTime() { return this.active < 0 ? 0 : (this.instances[this.active]?.getCurrentTime?.() || 0); }
  getDuration()    { return this.active < 0 ? 0 : (this.instances[this.active]?.getDuration?.() || 0); }

  // ---------- paging ----------
  async next(auto = false) {
    if (this.active >= this.pageMeta.length - 1) {
      const sys = this.instances[this.active];
      if (sys) {
        sys.highlighter.handleAudioEnd(sys.getDuration());
        this.#pageEl(this.active)?.classList.add('pageCompleted');
      }
      this._syncPlayButton(false);
      return;
    }
    const target = this.active + 1;
    this.setActive(target);

    // pre-settle in background
    this._awaitReadyAudioAndTranscript(target).then(url => { if (url) this._swapAudioUrl(target, url); }).catch(()=>{});

    await this.ensureAudioReady(target);
    if (auto) await this.play();
    await this._prefetchAround(target);
  }

  async prev() {
    if (this.active <= 0) return;
    const target = this.active - 1;
    this.setActive(target);

    this._awaitReadyAudioAndTranscript(target).then(url => { if (url) this._swapAudioUrl(target, url); }).catch(()=>{});

    await this.ensureAudioReady(target);
    await this.play();
    await this._prefetchAround(target);
  }

  async goto(index, { play = true } = {}) {
    if (index < 0 || index >= this.pageMeta.length) return;
    this.setActive(index);

    this._awaitReadyAudioAndTranscript(index).then(url => { if (url) this._swapAudioUrl(index, url); }).catch(()=>{});

    await this.ensureAudioReady(index);
    if (play) await this.play();
    await this._prefetchAround(index);
  }

  async jumpToParagraph(pageIndex, paragraphText, { minProbability = 0.35, play = true } = {}) {
    if (pageIndex < 0 || pageIndex >= this.pageMeta.length) return;

    this.setActive(pageIndex);

    this._awaitReadyAudioAndTranscript(pageIndex).then(url => { if (url) this._swapAudioUrl(pageIndex, url); }).catch(()=>{});

    await this.ensureAudioReady(pageIndex);
    const sys = this.instances[pageIndex];
    const res = await sys.seekToParagraph(paragraphText, { minProbability });
    if (play) await this.play();
    await this._prefetchAround(pageIndex);
    return res;
  }

  // ---------- global paragraph click delegation ----------
  _setupGlobalParagraphClickDelegation() {
    if (this._paragraphClicksBound) return;
    document.addEventListener('click', async (e) => {
      const chip = e.target?.closest?.('.paragraph-hover-nav');
      if (!chip) return;

      const pageId   = chip.dataset?.pageId;
      const paraText = chip.dataset?.paragraphText;
      if (!pageId || !paraText) return;

      const all = [...this._container.querySelectorAll('p.mainContent')];
      const pageIndex = all.findIndex(p => p.id === `mainContent-${pageId}`);
      if (pageIndex === -1) return;

      e.preventDefault();
      await this.jumpToParagraph(pageIndex, paraText, { minProbability: 0.35, play: true });
    }, { capture: true });
    this._paragraphClicksBound = true;
  }

  // ---------- controls ----------
  _setupGlobalControls() {
    if (this._controlsBound) return;
    const playBtn   = cloneForCleanHandlers(document.querySelector('.playButton'));
    const rewindBtn = cloneForCleanHandlers(document.querySelector('.rewind'));
    const fwdBtn    = cloneForCleanHandlers(document.querySelector('.forward'));

    if (playBtn)   playBtn.addEventListener('click', async () => { await this.toggle(); });
    if (rewindBtn) rewindBtn.addEventListener('click', () => this.rewind());
    if (fwdBtn)    fwdBtn.addEventListener('click', () => this.forward());

    const playBack = document.querySelector('.playBack');
    if (playBack) {
      const slider = playBack.querySelector('.slider');
      const thumb  = playBack.querySelector('.thumb');
      const value  = playBack.querySelector('.thumb .value');

      const cleanThumb  = cloneForCleanHandlers(thumb);
      const cleanSlider = cloneForCleanHandlers(slider);

      const getRect = () => cleanSlider.getBoundingClientRect();
      function widthToSpeed(widthPercent) {
        const s = 0.5 + ((widthPercent - 40) / 60) * 1.5;
        return Math.round(s * 10) / 10;
      }
      function speedToWidth(speed) {
        return 40 + ((speed - 0.5) / 1.5) * 60;
      }
      const setSpeedUI = (s) => {
        const width = speedToWidth(Math.max(0.5, Math.min(2.0, s)));
        cleanThumb.style.width = width + '%';
        if (value) value.textContent = s.toFixed(1);
      };
      setSpeedUI(1.0);

      const onPoint = (clientX) => {
        const rect = getRect();
        const pctRaw = ((clientX - rect.left) / rect.width) * 100;
        const pct = Math.max(40, Math.min(100, pctRaw - 7));
        const spd = widthToSpeed(pct);
        setSpeedUI(spd);
        this.setSpeed(spd);
      };

      let dragging = false;
      const onDown = (clientX, e) => { dragging = true; e?.preventDefault?.(); onPoint(clientX); };
      const onMove = (clientX, e) => { if (!dragging) return; e?.preventDefault?.(); onPoint(clientX); };
      const onUp   = () => { dragging = false; };

      cleanThumb.addEventListener('mousedown', e => onDown(e.clientX, e));
      cleanSlider.addEventListener('mousedown', e => onDown(e.clientX, e));
      document.addEventListener('mousemove', e => onMove(e.clientX, e));
      document.addEventListener('mouseup', onUp);

      cleanThumb.addEventListener('touchstart', e => onDown(e.touches[0].clientX, e), { passive: false });
      cleanSlider.addEventListener('touchstart', e => onDown(e.touches[0].clientX, e), { passive: false });
      document.addEventListener('touchmove', e => onMove(e.touches[0].clientX, e), { passive: false });
      document.addEventListener('touchend', onUp);
    }

    this._controlsBound = true;
  }

  _syncPlayButton(forcePlaying) {
    const playButton = document.querySelector('.playButton');
    const icon = playButton?.querySelector('i');
    const playing = typeof forcePlaying === 'boolean'
      ? forcePlaying
      : (this.active >= 0 && !!this.instances[this.active]?.audioCore?.isPlaying);

    if (icon) {
      if (playing) {
        icon.className = 'ph ph-pause';
        playButton.classList.remove('paused');
      } else {
        icon.className = 'ph ph-play';
        playButton.classList.add('paused');
      }
    }
  }

  destroy() {
    if (this._io) { try { this._io.disconnect(); } catch {} }
    for (const sys of this.instances) {
      try { sys?.destroy?.(); } catch (e) { console.error('Destroy error:', e); }
    }
    this.instances = [];
    this.active = -1;
  }
}
