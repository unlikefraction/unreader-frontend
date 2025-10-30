// Simple catalog of videos with metadata for credits and suggestions
// Usage:
//   import { videosById, getVideo, listVideos, getNextId, saveVideoState, getVideoState } from './video-catalog.js';
//   const v = getVideo('default');
// Or via global:
//   window.VideoCatalog.get('default')

export const videosById = {
  // Example/default entry used by generating-audio overlay
  default: {
    url: 'https://cdn.pixabay.com/video/2020/05/13/39009-420224623_large.mp4',
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
  },
  // Another sample entry
  cats: {
    url: 'https://cdn.pixabay.com/video/2020/05/13/39009-420224623_large.mp4',
    credits: {
      label: 'Cats',
      icon: 'ph-youtube-logo',
      href: 'https://www.youtube.com/@cats'
    },
    suggestedBy: {
      label: '@shubham',
      icon: 'ph-x-logo',
      href: 'https://x.com/shubham'
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
  'default',
  'cats',
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

// Optional global for non-module consumers
if (typeof window !== 'undefined') {
  window.VideoCatalog = {
    data: videosById,
    get: getVideo,
    list: listVideos,
    nextId: getNextId,
    saveState: saveVideoState,
    loadState: getVideoState,
  };
}
