// -----multiPageReader.js-----
import { AudioSystem } from './audioAndTextGen.js';
import { ReadAlong } from '../audio/read-along.js';

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/^[a-z]+:\/\/+/i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}
function cloneForCleanHandlers(el) { if (!el) return null; const clone = el.cloneNode(true); el.replaceWith(clone); return clone; }
function rIC(fn, timeout = 50) {
  const ric = window.requestIdleCallback || ((cb) => setTimeout(() => cb({ timeRemaining: () => 0, didTimeout: true }), timeout));
  return ric(fn, { timeout });
}
function getCookie(name) { const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)')); return m ? decodeURIComponent(m[2]) : null; }
function setCookie(name, value, days = 365) {
  const d = new Date(); d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
}
function qs(name, url = window.location.href) { try { return new URL(url).searchParams.get(name); } catch { return null; } }

/* ---------- transcript normalizer ---------- */
function normalizeWordTimings(raw) {
  if (!raw) return [];
  const monologues = Array.isArray(raw) ? raw : (raw.monologues || []);
  const out = [];
  for (const m of monologues) {
    const elems = m?.elements || [];
    for (const el of elems) {
      if (el?.type !== 'text') continue;
      const word = String(el.value ?? '').trim(); if (!word) continue;
      const start = typeof el.ts === 'number' ? el.ts : typeof el.start_ts === 'number' ? el.start_ts : typeof el.time_start === 'number' ? el.time_start : undefined;
      const end   = typeof el.end_ts === 'number' ? el.end_ts : typeof el.time_end === 'number' ? el.time_end : undefined;
      if (typeof start !== 'number' || typeof end !== 'number') continue;
      out.push({ word, time_start: start, time_end: end });
    }
  }
  out.sort((a, b) => a.time_start - b.time_start);
  return out;
}
async function tryApplyTimings(sys, words) {
  const tp = sys?.textProcessor;
  if (!tp || !Array.isArray(words) || !words.length) return false;
  try {
    if (typeof tp.ingestWordTimingsFromBackend === 'function') { await tp.ingestWordTimingsFromBackend(words); return true; }
    if (typeof tp.ingestWordTimings === 'function') { await tp.ingestWordTimings(words); return true; }
    if (typeof tp.setWordTimings === 'function') { tp.setWordTimings(words); return true; }
    tp.wordTimings = words; tp._wordTimings = words; sys.refreshParagraphNavigation?.(); return true;
  } catch { return false; }
}

export default class MultiPageReader {
  /**
   * pages: [{ page_number, textBlobUrl, pageKey?, audioFile, timingFile, offsetMs?, is_read?, _html? }]
   */
  constructor(pages, {
    autoPlayFirst = false,
    initialActiveIndex = 0,
    lazyHydration = true,
    prefetchRadius = 1,
    observeRadius = 0.75,
    userBookId = null,
    callbacks = {}
  } = {}) {
    this.pageMeta = pages.slice();
    this.pageMeta.forEach(m => { m._readyAudioUrl = null; m._audioSettled = false; m._polling = false; m._readyTranscript = null; m._readyTranscriptFlat = null; m._html = null; });
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
    this._progressTimer = null;
    this._isLoadingActiveAudio = false;
    this._autoplayOnReady = false;

    this.userBookId = userBookId ?? qs('id');
    this.audioApiBase = window.API_URLS?.AUDIO || '';

    this._cb = {
      onActivePageChanged: typeof callbacks.onActivePageChanged === 'function' ? callbacks.onActivePageChanged : null,
      onDestroyed: typeof callbacks.onDestroyed === 'function' ? callbacks.onDestroyed : null
    };
  }

  /* ---------- cookies ---------- */
  _cookieKey() { const id = this.userBookId || 'book'; return `mpr_last_played_${id}`; }
  _saveLastPlayedCookie(pageIndex, seconds) {
    if (pageIndex < 0 || pageIndex >= this.pageMeta.length) return;
    const pn = this.pageMeta[pageIndex]?.page_number ?? pageIndex;
    const payload = { page_number: pn, seconds: Math.max(0, Number(seconds) || 0), at: Date.now() };
    setCookie(this._cookieKey(), JSON.stringify(payload), 365);
  }
  _readLastPlayedCookie() { const raw = getCookie(this._cookieKey()); if (!raw) return null; try { return JSON.parse(raw); } catch { return null; } }
  _mapPageNumberToIndex(pn) { const idx = this.pageMeta.findIndex(p => p.page_number === pn); return idx === -1 ? 0 : idx; }
  _stopProgressTimer() { if (this._progressTimer) { clearInterval(this._progressTimer); this._progressTimer = null; } }
  _startProgressTimer() {
    this._stopProgressTimer();
    this._progressTimer = setInterval(() => {
      if (this.active < 0) return;
      const t = this.getCurrentTime();
      this._saveLastPlayedCookie(this.active, t);
    }, 2000);
  }

  /* ---------- transport UI ---------- */
  _transportRoot() {
    return (
      document.querySelector('.bottomTransport') ||
      document.querySelector('footer .transport') ||
      document.querySelector('.playBack') ||
      document.querySelector('.player') ||
      null
    );
  }
  _updateTransportMeta({ playing = false, loading = false, pageIndex = this.active, paragraphText = null } = {}) {
    const root = this._transportRoot();
    if (root) {
      root.classList.toggle('is-loading', !!loading);
      root.classList.toggle('is-playing', !!playing && !loading);
      root.classList.toggle('is-paused', !playing && !loading);
      const pageNo = this.pageMeta[pageIndex]?.page_number;
      root.setAttribute('data-active-page', pageNo ?? '');
      if (paragraphText) root.setAttribute('data-active-paragraph', paragraphText);
      const pageEl = root.querySelector('[data-transport="page"]'); if (pageEl && pageNo) pageEl.textContent = `Page ${pageNo}`;
      const paraEl = root.querySelector('[data-transport="paragraph"]'); if (paraEl) paraEl.textContent = paragraphText || '';
    }
    const playButton = document.querySelector('.playButton');
    const icon = playButton?.querySelector('i');
    if (playButton) {
      playButton.classList.toggle('loading', !!loading);
      playButton.classList.toggle('playing', !!playing && !loading);
      playButton.classList.toggle('paused', !playing && !loading);
    }
    if (icon) icon.className = (loading || playing) ? 'ph ph-pause' : 'ph ph-play';
  }
  _syncPlayButton(forcePlaying, { loading = false, paragraphText = null } = {}) {
    const playing = loading
      ? true
      : (typeof forcePlaying === 'boolean'
          ? forcePlaying
          : (this.active >= 0 && !!this.instances[this.active]?.audioCore?.isPlaying));
    this._updateTransportMeta({ playing, loading, pageIndex: this.active, paragraphText });
  }

  _scrollActivePageIntoView(center = true) {
    const el = this.#pageEl(this.active); if (!el) return;
    try { el.scrollIntoView({ behavior: 'auto', block: center ? 'center' : 'nearest', inline: 'nearest' }); }
    catch {
      const y = el.getBoundingClientRect().top + window.scrollY;
      const mid = y - (window.innerHeight / 2) + (el.offsetHeight / 2);
      window.scrollTo(0, Math.max(0, mid));
    }
  }

  async _buildScaffolding() {
    let main = document.querySelector('.mainContainer');
    if (!main) { main = document.createElement('div'); main.className = 'mainContainer'; document.body.appendChild(main); }
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
      meta._html = html;
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

    await sys.textProcessor.separateText();
    sys.paragraphSeeker.enableParagraphNavigation();

    // hook end-of-page → next
    const onEnd = () => this.next(true);
    sys.audioCore.onEnd(onEnd);
    this._onEndHandlers.set(sys, onEnd);

    // prefer backend timings if we already have them
    const originalLoad = sys.textProcessor.loadWordTimings?.bind(sys.textProcessor);
    sys.textProcessor.loadWordTimings = async () => {
      const words = this.pageMeta[i]._readyTranscriptFlat;
      if (Array.isArray(words) && words.length) {
        const ok = await tryApplyTimings(sys, words);
        if (ok) return true;
      }
      if (typeof originalLoad === 'function') return originalLoad();
      return false;
    };

    // ---------- Read-Along binding (fix) ----------
    try {
      const ra = ReadAlong.get(sys.highlighter);
      // if highlighter exposes highlightWord, patch to notify ReadAlong every time
      const hl = sys.highlighter;
      if (hl && typeof hl.highlightWord === 'function' && !hl._raPatched) {
        const _orig = hl.highlightWord.bind(hl);
        hl.highlightWord = (...args) => {
          const r = _orig(...args);
          try { ReadAlong.get().onWordHighlighted(); } catch {}
          return r;
        };
        hl._raPatched = true;
      }
    } catch (e) { console.warn('ReadAlong bind failed:', e); }

    this.instances[i] = sys;
    return sys;
  }

  async ensureAudioReady(i) {
    const sys = await this.hydratePage(i);
    if (!sys) return null;
    if (!sys.audioCore.sound) {
      await sys.textProcessor.loadWordTimings();
      sys.audioCore.setupAudio();
      sys.refreshParagraphNavigation?.();
    }
    return sys;
  }

  async _prefetchAround(i) {
    const tasks = [];
    for (let k = Math.max(0, i - this.prefetchRadius); k <= Math.min(this.pageMeta.length - 1, i + this.prefetchRadius); k++) {
      if (k === i) continue;
      tasks.push((async () => { await this.hydratePage(k); await rIC(() => {}); })());
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
          if (i >= 0 && !this.instances[i]) await this.hydratePage(i);
        }
      }
    }, { root: null, rootMargin, threshold: 0.01 });
    this._container.querySelectorAll('p.mainContent').forEach(p => this._io.observe(p));
  }

  async init() {
    await this._buildScaffolding();

    const saved = this._readLastPlayedCookie();
    let pageIndex, seconds;
    if (saved && typeof saved.page_number !== 'undefined') { pageIndex = this._mapPageNumberToIndex(saved.page_number); seconds = Math.max(0, Number(saved.seconds) || 0); }
    else { pageIndex = this._initialActiveIndex; seconds = 0; this._saveLastPlayedCookie(pageIndex, 0); }

    this.setActive(pageIndex);
    this._scrollActivePageIntoView(true);

    const url = await this._awaitReadyAudioAndTranscript(pageIndex, { pollGeneratingMs: 5000, pollQueuedMs: 5000 });
    if (url) this._swapAudioUrl(pageIndex, url);

    await this.ensureAudioReady(pageIndex);
    this.seek(seconds);
    this._stopProgressTimer();
    this._syncPlayButton(false);

    await this._prefetchAround(pageIndex);
    this._setupGlobalControls();
    this._setupGlobalParagraphClickDelegation();
    this._setupIntersectionHydrator();
  }

  #pageEl(i) { return this._container?.querySelectorAll('p.mainContent')[i] || null; }
  #applyPageStateClasses(activeIndex) {
    const N = this.pageMeta.length;
    for (let i = 0; i < N; i++) {
      const el = this.#pageEl(i); if (!el) continue;
      el.classList.remove('pageCompleted', 'pageRemaining', 'pageActive');
      if (i < activeIndex) el.classList.add('pageCompleted');
      else if (i > activeIndex) el.classList.add('pageRemaining');
      else el.classList.add('pageActive');
    }
  }
  _emitActiveChanged(i) { if (this._cb.onActivePageChanged) { try { this._cb.onActivePageChanged(i, this.pageMeta[i]); } catch (e) { console.warn(e); } } }

  setActive(i) {
    if (i < 0 || i >= this.pageMeta.length) return;
    const prev = this.active;
    for (let k = 0; k < this.instances.length; k++) {
      const sys = this.instances[k];
      if (sys && k !== i) { sys.highlighter?.stopHighlighting?.(); sys.audioCore?.pauseAudio?.(); }
    }
    this.active = i;
    this.#applyPageStateClasses(i);
    this._syncPlayButton(false);
    if (prev !== i) this._emitActiveChanged(i);
  }

  getActive() { return this.active; }

  /* ---------- AUDIO API polling / swap ---------- */
  async _awaitReadyAudioAndTranscript(i, { pollGeneratingMs = 5000, pollQueuedMs = 5000 } = {}) {
    const meta = this.pageMeta[i];
    if (!meta) return null;
    if (!this.audioApiBase || !this.userBookId) { console.warn('⚠️ Missing audio API base or userBookId.'); return null; }
    if (meta._audioSettled && meta._readyAudioUrl) return meta._readyAudioUrl;
    if (meta._polling) return null;
    meta._polling = true;

    const token = getCookie('authToken');
    const url = `${this.audioApiBase}book/${encodeURIComponent(this.userBookId)}/page/${encodeURIComponent(meta.page_number)}/`;

    const fetchOnce = async () => {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Audio API ${res.status}`);
      return res.json();
    };

    try {
      while (true) {
        const data = await fetchOnce();
        const status = data?.status;
        if (status === 'ready') {
          const audioUrl = data?.audio_url;
          const transcript = data?.time_aligned_transcript ?? null;
          if (audioUrl && transcript) {
            meta._readyAudioUrl = audioUrl;
            meta._readyTranscript = transcript;
            meta._readyTranscriptFlat = normalizeWordTimings(transcript);
            meta._audioSettled = true;
            return audioUrl;
          }
          await new Promise(r => setTimeout(r, pollGeneratingMs));
          continue;
        }
        if (status === 'generating') { await new Promise(r => setTimeout(r, pollGeneratingMs)); continue; }
        if (status === 'queued')     { await new Promise(r => setTimeout(r, pollQueuedMs));     continue; }
        await new Promise(r => setTimeout(r, pollGeneratingMs));
      }
    } catch (e) {
      console.error(`❌ [page ${meta.page_number}] audio polling failed:`, e);
      return null;
    } finally { meta._polling = false; }
  }

  _swapAudioUrl(i, audioUrl) {
    const sys = this.instances[i];
    if (!sys || !audioUrl) return;
    try {
      const wasPlaying = !!sys.audioCore?.isPlaying;
      const pos = typeof sys.audioCore?.getCurrentTime === 'function' ? sys.audioCore.getCurrentTime() : 0;
      sys.audioCore.pauseAudio();
      if (sys.audioCore.sound) { try { sys.audioCore.sound.unload(); } catch {} sys.audioCore.sound = null; }
      sys.audioCore.audioFile = audioUrl;
      sys.audioCore.setupAudio();
      if (pos && typeof sys.audioCore?.sound?.seek === 'function') sys.audioCore.sound.seek(pos);
      if (wasPlaying) sys.audioCore.playAudio();
    } catch (e) { console.error('audio swap error:', e); }
  }

  /* ---------- transport ---------- */
  async play() {
    if (this.active < 0) return;
    const meta = this.pageMeta[this.active];
    if (!meta?._audioSettled) { this._isLoadingActiveAudio = true; this._autoplayOnReady = true; this._syncPlayButton(true, { loading: true }); }
    const url = await this._awaitReadyAudioAndTranscript(this.active, { pollGeneratingMs: 5000, pollQueuedMs: 5000 });
    if (url) this._swapAudioUrl(this.active, url);

    const sys = await this.ensureAudioReady(this.active);
    const flat = this.pageMeta[this.active]?._readyTranscriptFlat;
    if (Array.isArray(flat) && flat.length) await tryApplyTimings(sys, flat);

    for (let k = 0; k < this.instances.length; k++) { if (k !== this.active) this.instances[k]?.audioCore?.pauseAudio?.(); }
    await sys.play();
    this._isLoadingActiveAudio = false; this._autoplayOnReady = false; this._syncPlayButton(true);
    this._startProgressTimer();
    this._saveLastPlayedCookie(this.active, this.getCurrentTime());

    // [NEW]
    try { window.app?.holdup?.noteLocalAudioActivity?.(true); } catch {}
  }

  pause() {
    if (this.active < 0) return;
    this.instances[this.active]?.pause?.();
    this._isLoadingActiveAudio = false; this._autoplayOnReady = false;
    this._syncPlayButton(false);
    this._stopProgressTimer();
    this._saveLastPlayedCookie(this.active, this.getCurrentTime());

    // [NEW]
    try { window.app?.holdup?.noteLocalAudioActivity?.(false); } catch {}
  }

  async toggle() {
    if (this.active < 0) return;
    const sys = this.instances[this.active] || await this.hydratePage(this.active);
    const isPlaying = !!sys?.audioCore?.isPlaying || this._isLoadingActiveAudio;
    if (isPlaying) return this.pause();
    return this.play();
  }

  forward(seconds = 10) { if (this.active < 0) return; const s = this.getCurrentTime(); this.seek(s + seconds); this._saveLastPlayedCookie(this.active, this.getCurrentTime()); }
  rewind(seconds = 10)  { if (this.active < 0) return; const s = this.getCurrentTime(); this.seek(Math.max(0, s - seconds)); this._saveLastPlayedCookie(this.active, this.getCurrentTime()); }

  seek(seconds) {
    if (this.active < 0) return;
    const sys = this.instances[this.active]; if (!sys) return;
    sys.audioCore.sound?.seek(seconds);
    sys.highlighter?.handleSeek?.(seconds);
  }
  setSpeed(speed) { if (this.active < 0) return; this.instances[this.active]?.setSpeed?.(speed); }
  getCurrentTime() { return this.active < 0 ? 0 : (this.instances[this.active]?.getCurrentTime?.() || 0); }
  getDuration()    { return this.active < 0 ? 0 : (this.instances[this.active]?.getDuration?.() || 0); }

  /* ---------- paging ---------- */
  async next(auto = false) {
    if (this.active >= this.pageMeta.length - 1) {
      const sys = this.instances[this.active];
      if (sys) { sys.highlighter?.handleAudioEnd?.(sys.getDuration()); this.#pageEl(this.active)?.classList.add('pageCompleted'); }
      this._syncPlayButton(false);
      this._stopProgressTimer();
      this._saveLastPlayedCookie(this.active, this.getCurrentTime());
      return;
    }
    const target = this.active + 1;
    this.setActive(target);
    this._scrollActivePageIntoView(true);
    this._stopProgressTimer();

    this._isLoadingActiveAudio = true; this._autoplayOnReady = !!auto; this._syncPlayButton(true, { loading: true });
    const url = await this._awaitReadyAudioAndTranscript(target, { pollGeneratingMs: 5000, pollQueuedMs: 5000 });
    if (url) this._swapAudioUrl(target, url);

    await this.ensureAudioReady(target);
    if (auto) await this.play();
    else { this._isLoadingActiveAudio = false; this._autoplayOnReady = false; this._syncPlayButton(false); }
    await this._prefetchAround(target);
    this._saveLastPlayedCookie(target, this.getCurrentTime());
  }

  async prev() {
    if (this.active <= 0) return;
    const target = this.active - 1;
    this.setActive(target);
    this._scrollActivePageIntoView(true);
    this._stopProgressTimer();

    this._isLoadingActiveAudio = true; this._autoplayOnReady = true; this._syncPlayButton(true, { loading: true });
    const url = await this._awaitReadyAudioAndTranscript(target, { pollGeneratingMs: 5000, pollQueuedMs: 5000 });
    if (url) this._swapAudioUrl(target, url);

    await this.ensureAudioReady(target);
    await this.play();
    await this._prefetchAround(target);
    this._saveLastPlayedCookie(target, this.getCurrentTime());
  }

  async goto(index, { play = true } = {}) {
    if (index < 0 || index >= this.pageMeta.length) return;
    this.setActive(index);
    this._scrollActivePageIntoView(true);
    this._stopProgressTimer();

    if (play) { this._isLoadingActiveAudio = true; this._autoplayOnReady = true; this._syncPlayButton(true, { loading: true }); }
    const url = await this._awaitReadyAudioAndTranscript(index, { pollGeneratingMs: 5000, pollQueuedMs: 5000 });
    if (url) this._swapAudioUrl(index, url);

    await this.ensureAudioReady(index);
    if (play) await this.play();
    else { this._isLoadingActiveAudio = false; this._autoplayOnReady = false; this._syncPlayButton(false); this._saveLastPlayedCookie(index, this.getCurrentTime()); }
    await this._prefetchAround(index);
  }

  async jumpToParagraph(pageIndex, paragraphText, { minProbability = 0.35, play = true } = {}) {
    if (pageIndex < 0 || pageIndex >= this.pageMeta.length) return;
    this.setActive(pageIndex);
    this._stopProgressTimer();

    if (play) { this._isLoadingActiveAudio = true; this._autoplayOnReady = true; this._syncPlayButton(true, { loading: true, paragraphText }); }

    const meta = this.pageMeta[pageIndex];
    const alreadySettled = !!meta?._audioSettled && !!meta?._readyAudioUrl &&
      !!this.instances[pageIndex]?.audioCore &&
      this.instances[pageIndex].audioCore.audioFile === meta._readyAudioUrl;

    if (!alreadySettled) {
      const url = await this._awaitReadyAudioAndTranscript(pageIndex, { pollGeneratingMs: 5000, pollQueuedMs: 5000 });
      if (url) this._swapAudioUrl(pageIndex, url);
    }

    await this.ensureAudioReady(pageIndex);
    const sys = this.instances[pageIndex];

    const flat = this.pageMeta[pageIndex]?._readyTranscriptFlat;
    if (Array.isArray(flat) && flat.length) {
      try {
        if (typeof sys.textProcessor.ingestWordTimingsFromBackend === 'function')      await sys.textProcessor.ingestWordTimingsFromBackend(flat);
        else if (typeof sys.textProcessor.ingestWordTimings === 'function')            await sys.textProcessor.ingestWordTimings(flat);
        else if (typeof sys.textProcessor.setWordTimings === 'function')               sys.textProcessor.setWordTimings(flat);
        else { sys.textProcessor.wordTimings = flat; sys.textProcessor._wordTimings = flat; sys.refreshParagraphNavigation?.(); }
      } catch (e) { console.warn('timings ingest failed; will still attempt seek:', e); }
    }

    const seekRes = await sys.seekToParagraph(paragraphText, { minProbability });
    if (play) {
      for (let k = 0; k < this.instances.length; k++) { if (k !== pageIndex) this.instances[k]?.audioCore?.pauseAudio?.(); }
      await sys.play();
      this._isLoadingActiveAudio = false; this._autoplayOnReady = false; this._syncPlayButton(true, { paragraphText });
      this._startProgressTimer();
    } else {
      this._isLoadingActiveAudio = false; this._autoplayOnReady = false; this._syncPlayButton(false, { paragraphText });
    }

    this._saveLastPlayedCookie(pageIndex, this.getCurrentTime());
    await this._prefetchAround(pageIndex);
    return seekRes;
  }

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

      e.preventDefault(); e.stopPropagation();
      this._isLoadingActiveAudio = true; this._autoplayOnReady = true; this._syncPlayButton(true, { loading: true, paragraphText: paraText });
      await this.jumpToParagraph(pageIndex, paraText, { minProbability: 0.35, play: true });
    }, { capture: true });
    this._paragraphClicksBound = true;
  }

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
      function widthToSpeed(widthPercent) { const s = 0.5 + ((widthPercent - 40) / 60) * 1.5; return Math.round(s * 10) / 10; }
      function speedToWidth(speed) { return 40 + ((speed - 0.5) / 1.5) * 60; }
      const setSpeedUI = (s) => { const width = speedToWidth(Math.max(0.5, Math.min(2.0, s))); cleanThumb.style.width = width + '%'; if (value) value.textContent = s.toFixed(1); };
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

  destroy() {
    if (this._io) { try { this._io.disconnect(); } catch {} }
    this._stopProgressTimer();
    for (const sys of this.instances) { try { sys?.destroy?.(); } catch (e) { console.error('Destroy error:', e); } }
    this.instances = [];
    this.active = -1;
    if (this._cb.onDestroyed) { try { this._cb.onDestroyed(); } catch {} }
  }
}
