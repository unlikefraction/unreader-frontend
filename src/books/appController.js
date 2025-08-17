// -----appController.js-----
import MultiPageReader from './multiPageReader.js';
import { HoldupManager } from './holdup.js';

/** tiny silent WAV as a stub until real audio arrives */
function createSilentWavDataUrl(durationSec = 0.2, sampleRate = 16000) {
  const numSamples = Math.max(1, Math.floor(durationSec * sampleRate));
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  function writeString(off, str) { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); }
  writeString(0, 'RIFF'); view.setUint32(4, 36 + numSamples * 2, true); writeString(8, 'WAVE');
  writeString(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeString(36, 'data'); view.setUint32(40, numSamples * 2, true);
  const blob = new Blob([view], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}
const DEFAULT_AUDIO_FILE  = createSilentWavDataUrl(0.2, 16000);
const DEFAULT_TIMING_FILE = '/order/word_timings_ordered_1.json';
const DEFAULT_OFFSET_MS   = 100;

function getCookie(name) {
  const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[2]) : null;
}
function qs(name, url = window.location.href) {
  const u = new URL(url);
  return u.searchParams.get(name);
}
function blobUrlForHtml(html) {
  const blob = new Blob([html || '<p></p>'], { type: 'text/html;charset=utf-8' });
  return URL.createObjectURL(blob);
}
async function fetchBook(userBookId) {
  const token = getCookie('authToken');
  if (!token) throw new Error('Missing auth token');
  if (!window.API_URLS?.BOOK) throw new Error('Missing window.API_URLS.BOOK');
  const url = `${window.API_URLS.BOOK}get-details/${encodeURIComponent(userBookId)}/`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Book fetch failed (${res.status})`);
  return res.json();
}
function computeAnchorIndex(pages = []) {
  let lastReadIdx = -1;
  for (let i = 0; i < pages.length; i++) if (pages[i]?.is_read) lastReadIdx = i;
  if (lastReadIdx === -1) return 0;
  return Math.min(lastReadIdx + 1, pages.length - 1);
}

export default class AppController {
  constructor() {
    this.reader = null;
    this.holdup = null;
    this.pageDescriptors = [];
    this._pausedByHoldup = false;
    this._wasPlayingPreHoldup = false;
  }

  _pauseForHoldup() {
    if (!this.reader) return;
    const active = this.reader.getActive();
    const sys = this.reader.instances?.[active];
    this._wasPlayingPreHoldup = !!sys?.audioCore?.isPlaying;
    if (this._wasPlayingPreHoldup) {
      this.reader.pause();
      this._pausedByHoldup = true;
    } else {
      this._pausedByHoldup = false;
    }
  }
  _resumeAfterHoldup() {
    if (!this.reader) return;
    if (this._pausedByHoldup && this._wasPlayingPreHoldup) {
      this.reader.play();
    }
    this._pausedByHoldup = false;
    this._wasPlayingPreHoldup = false;
  }

  async bootstrap() {
    try {
      const userBookId = qs('id');
      if (!userBookId) throw new Error('Missing ?id=');

      const book = await fetchBook(userBookId);
      const pages = Array.isArray(book.pages) ? [...book.pages] : [];
      pages.sort((a, b) => (a.page_number || 0) - (b.page_number || 0));

      const anchor = computeAnchorIndex(pages);

      this.pageDescriptors = pages.map(p => ({
        page_number: p.page_number,
        textBlobUrl: blobUrlForHtml(p.content),
        is_read: !!p.is_read,
        audioFile: DEFAULT_AUDIO_FILE,
        timingFile: DEFAULT_TIMING_FILE,
        offsetMs: DEFAULT_OFFSET_MS,
        pageKey: `ub-${book.user_book_id}-p${p.page_number}`
      }));

      // Holdup: persistent connection + instant engage
      this.holdup = new HoldupManager({
        userBookId,
        roomNameBase: `book-${book.user_book_id || userBookId}`,
        callbacks: {
          onEngageStart: () => this._pauseForHoldup(),
          onEngageEnd:   () => this._resumeAfterHoldup(),
          onRemoteAudioStart: () => this._pauseForHoldup(),
          onRemoteAudioStop:  () => this._resumeAfterHoldup()
        }
      });

      // Reader
      this.reader = new MultiPageReader(this.pageDescriptors, {
        autoPlayFirst: false,
        initialActiveIndex: anchor,
        lazyHydration: true,
        prefetchRadius: 1,
        observeRadius: 0.75,
        userBookId,
        callbacks: {
          onActivePageChanged: async (index) => {
            try {
              await this.holdup.updateContext({
                pageNumber: this.pageDescriptors[index]?.page_number,
                metadata: this._metadataForIndex(index)
              });
            } catch (e) { console.warn('Holdup updateContext error:', e); }
          },
          onDestroyed: () => this.holdup?.disconnect()
        }
      });

      await this.reader.init();

      // Preconnect once (muted) and send initial context so first press is instant
      const startIndex = this.reader.getActive();
      await this.holdup.connectOnce({
        pageNumber: this.pageDescriptors[startIndex]?.page_number,
        metadata: this._metadataForIndex(startIndex)
      });

      window.addEventListener('beforeunload', () => {
        try { this.pageDescriptors.forEach(pg => URL.revokeObjectURL(pg.textBlobUrl)); } catch {}
        this.holdup?.disconnect();
        try { URL.revokeObjectURL(DEFAULT_AUDIO_FILE); } catch {}
      });

      console.log('📚 AppController ready.');
    } catch (err) {
      console.error('App bootstrap failed:', err);
    }
  }

  _htmlAt(i) {
    const fromReader = this.reader?.pageMeta?.[i]?._html;
    if (fromReader) return fromReader;
    const meta = this.pageDescriptors[i];
    return (meta && meta._html) ? meta._html : null;
  }
  _metadataForIndex(i) {
    const cur = this._htmlAt(i);
    const prev = (i > 0) ? this._htmlAt(i - 1) : null;
    const next = (i < this.pageDescriptors.length - 1) ? this._htmlAt(i + 1) : null;
    return { current_page: cur || '', previous_page: prev, next_page: next };
  }
}
