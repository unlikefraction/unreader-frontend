// Simple catalog of videos with metadata for credits and suggestions
// Usage:
//   import { videosById, getVideo, listVideos, getNextId, saveVideoState, getVideoState } from './video-catalog.js';
//   const v = getVideo('default');
// Or via global:
//   window.VideoCatalog.get('default')

export const videosById = {
  // Example/default entry used by generating-audio overlay
  cats: {
    url: 'https://cdn.unlikefraction.com/books/paw-videos/cats.mp4',
    thumbnail: 'https://cdn.unlikefraction.com/books/paw-videos/funnyCats.jpg',
    credits: {
      label: 'NoCAT NoLiFE 2',
      icon: 'ph-youtube-logo',
      href: 'https://www.youtube.com/@nocatnolife2366'
    },
    suggestedBy: {
      label: '@unlikefraction',
      icon: 'ph-x-logo',
      href: 'https://x.com/unlikefraction'
    }
  },

  funny_animals: {
    url: 'https://cdn.unlikefraction.com/books/paw-videos/funnyAnimals.mp4',
    thumbnail: 'https://cdn.unlikefraction.com/books/paw-videos/funnyAnimals.jpg',
    credits: {
      label: 'Daily Dose Of Internet',
      icon: 'ph-youtube-logo',
      href: 'https://www.youtube.com/@DailyDoseOfInternet'
    },
    suggestedBy: {
      label: '@eipieq',
      icon: 'ph-x-logo',
      href: 'https://x.com/eipieq'
    }
  }

  // Add more videos here with unique IDs
  // "some-other-id": {
  //   url: 'https://.../video.mp4',
  //   credits: { label: 'Channel/Creator', icon: 'ph-youtube-logo', href: 'https://...' },
  //   suggestedBy: { label: '@handle', icon: 'ph-x-logo', href: 'https://x.com/...' }
  // }
};

// Explicit order; if not provided, fallback to insertion order
export const playlistOrder = [
  'cats',
  'funny_animals',
];

export function getVideo(id = 'default') {
  return videosById[id] || null;
}

export function listVideos() {
  // Prefer explicit playlist order if it contains known IDs
  const fromPlaylist = playlistOrder.filter(id => Object.prototype.hasOwnProperty.call(videosById, id));
  if (fromPlaylist.length) return fromPlaylist;
  return Object.keys(videosById);
}

export function getNextId(currentId) {
  const list = listVideos();
  if (!list.length) return null;
  const idx = list.indexOf(currentId);
  const i = idx >= 0 ? idx : 0;
  const next = (i + 1) % list.length;
  return list[next];
}

// --- Cookie persistence for last video + timestamp ---
const COOKIE_NAME = 'unr_video_state';

function setCookie(name, value, days = 365) {
  try {
    const d = new Date();
    d.setTime(d.getTime() + (days*24*60*60*1000));
    const expires = `expires=${d.toUTCString()}`;
    document.cookie = `${name}=${encodeURIComponent(String(value))};${expires};path=/;SameSite=Lax`;
  } catch {}
}
function getCookie(name) {
  try {
    const nameEQ = name + '=';
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
  } catch {}
  return null;
}

export function saveVideoState(id, seconds = 0) {
  try {
    const t = Math.max(0, Math.floor(Number(seconds) || 0));
    const payload = JSON.stringify({ id: String(id || 'default'), t });
    setCookie(COOKIE_NAME, payload, 365);
  } catch {}
}

export function getVideoState() {
  try {
    const raw = getCookie(COOKIE_NAME);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    const id = typeof obj.id === 'string' ? obj.id : 'default';
    const t = Math.max(0, Math.floor(Number(obj.t) || 0));
    return { id, t };
  } catch { return null; }
}

// --- Per-video timestamp map (localStorage) ---
const LS_TS_MAP = 'unr_video_timestamps';

export function saveVideoTimestamp(id, seconds = 0) {
  try {
    const key = String(id || 'default');
    const t = Math.max(0, Math.floor(Number(seconds) || 0));
    let map = {};
    try { map = JSON.parse(localStorage.getItem(LS_TS_MAP) || '{}') || {}; } catch { map = {}; }
    map[key] = t;
    localStorage.setItem(LS_TS_MAP, JSON.stringify(map));
  } catch {}
}

export function getVideoTimestamp(id) {
  try {
    const key = String(id || 'default');
    const raw = localStorage.getItem(LS_TS_MAP);
    if (!raw) return 0;
    const map = JSON.parse(raw) || {};
    const v = map[key];
    return Math.max(0, Math.floor(Number(v) || 0));
  } catch { return 0; }
}

export function getVideoTimestampMap() {
  try {
    const raw = localStorage.getItem(LS_TS_MAP);
    if (!raw) return {};
    const map = JSON.parse(raw) || {};
    const out = {};
    for (const [k, v] of Object.entries(map)) out[k] = Math.max(0, Math.floor(Number(v) || 0));
    return out;
  } catch { return {}; }
}

// --- Per-video duration map (localStorage) ---
const LS_DUR_MAP = 'unr_video_durations';

export function saveVideoDuration(id, seconds = 0) {
  try {
    const key = String(id || 'default');
    const d = Math.max(0, Math.floor(Number(seconds) || 0));
    if (!d) return;
    let map = {};
    try { map = JSON.parse(localStorage.getItem(LS_DUR_MAP) || '{}') || {}; } catch { map = {}; }
    map[key] = d;
    localStorage.setItem(LS_DUR_MAP, JSON.stringify(map));
  } catch {}
}

export function getVideoDuration(id) {
  try {
    const key = String(id || 'default');
    const raw = localStorage.getItem(LS_DUR_MAP);
    if (!raw) return 0;
    const map = JSON.parse(raw) || {};
    const v = map[key];
    return Math.max(0, Math.floor(Number(v) || 0));
  } catch { return 0; }
}

export function getVideoDurationMap() {
  try {
    const raw = localStorage.getItem(LS_DUR_MAP);
    if (!raw) return {};
    const map = JSON.parse(raw) || {};
    const out = {};
    for (const [k, v] of Object.entries(map)) out[k] = Math.max(0, Math.floor(Number(v) || 0));
    return out;
  } catch { return {}; }
}

export function getVideoProgress(id) {
  const t = getVideoTimestamp(id) || 0;
  const d = getVideoDuration(id) || 0;
  if (d <= 0) return 0;
  return Math.max(0, Math.min(1, t / d));
}

export function getAllVideoProgress() {
  const ts = getVideoTimestampMap();
  const ds = getVideoDurationMap();
  const out = {};
  for (const id of Object.keys({ ...videosById, ...ts, ...ds })) {
    const t = Math.max(0, Math.floor(Number(ts[id] || 0)));
    const d = Math.max(0, Math.floor(Number(ds[id] || 0)));
    out[id] = d > 0 ? Math.max(0, Math.min(1, t / d)) : 0;
  }
  return out;
}

// Optional global for non-module consumers
if (typeof window !== 'undefined') {
  window.VideoCatalog = {
    data: videosById,
    get: getVideo,
    list: listVideos,
    nextId: getNextId,
    saveState: saveVideoState,
    loadState: getVideoState,
    saveTimestamp: saveVideoTimestamp,
    getTimestamp: getVideoTimestamp,
    getTimestampMap: getVideoTimestampMap,
    saveDuration: saveVideoDuration,
    getDuration: getVideoDuration,
    getDurationMap: getVideoDurationMap,
    getProgress: getVideoProgress,
    getAllProgress: getAllVideoProgress,
  };
}
