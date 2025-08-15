// -----bookReader.js-----
import MultiPageReader from './multiPageReader.js';

/**
 * Tiny silent WAV so Howler can init without touching the network.
 * We block actual playback until backend audio is ready.
 */
function createSilentWavUrl(durationMs = 600, sampleRate = 44100) {
  const numChannels = 1;
  const bytesPerSample = 2;
  const numSamples = Math.max(1, Math.floor(sampleRate * (durationMs / 1000)));
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);

  function writeString(dv, offset, str) {
    for (let i = 0; i < str.length; i++) dv.setUint8(offset + i, str.charCodeAt(i));
  }
}
const SILENT_WAV_URL = createSilentWavUrl();

// start with silence
const DEFAULT_AUDIO_FILE  = SILENT_WAV_URL;
const DEFAULT_TIMING_FILE = '/order/word_timings_ordered_1.json';
const DEFAULT_OFFSET_MS   = -100;

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

(async () => {
  try {
    const userBookId = qs('id');
    if (!userBookId) throw new Error('Missing ?id=');

    const book = await fetchBook(userBookId);
    const pages = Array.isArray(book.pages) ? [...book.pages] : [];
    pages.sort((a, b) => (a.page_number || 0) - (b.page_number || 0));

    const anchor = computeAnchorIndex(pages);

    const pageDescriptors = pages.map(p => ({
      page_number: p.page_number,
      textBlobUrl: blobUrlForHtml(p.content),
      is_read: !!p.is_read,
      audioFile: DEFAULT_AUDIO_FILE,     // silent stub
      timingFile: DEFAULT_TIMING_FILE,
      offsetMs: DEFAULT_OFFSET_MS,
      pageKey: `ub-${book.user_book_id}-p${p.page_number}`
    }));

    const reader = new MultiPageReader(pageDescriptors, {
      autoPlayFirst: false,
      initialActiveIndex: anchor,
      lazyHydration: true,
      prefetchRadius: 1,
      observeRadius: 0.75
    });
    await reader.init();
    window.reader = reader;

    window.addEventListener('beforeunload', () => {
      try { pageDescriptors.forEach(pg => URL.revokeObjectURL(pg.textBlobUrl)); } catch {}
    });

    console.log('📚 Loaded book HTML (lazy-hydrated audio with silent stub).', {
      title: book.title,
      totalPages: pages.length,
      anchorPage: pages[anchor]?.page_number
    });
  } catch (err) {
    console.error('Book init failed:', err);
  }
})();
