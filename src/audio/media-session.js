// Media Session helpers: set metadata and position so OS/external UIs show cover art

export function updateMediaSessionMetadata({ title, artist, album, coverUrl } = {}) {
  try {
    if (!('mediaSession' in navigator)) return;
    const artwork = [];
    if (coverUrl) {
      // Provide a few sizes (reuse the same URL if we can’t transform)
      artwork.push(
        { src: coverUrl, sizes: '96x96', type: guessMime(coverUrl) },
        { src: coverUrl, sizes: '192x192', type: guessMime(coverUrl) },
        { src: coverUrl, sizes: '512x512', type: guessMime(coverUrl) }
      );
    }
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: title || 'Unreader',
      artist: artist || '',
      album: album || 'Unreader',
      artwork
    });
  } catch {}
}

export function updatePositionState({ duration = 0, position = 0, playbackRate = 1 } = {}) {
  try {
    if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
    // Clamp values to valid ranges
    const dur = Math.max(0, Number(duration) || 0);
    const pos = Math.max(0, Math.min(dur || 0, Number(position) || 0));
    const rate = Math.max(0.25, Math.min(4, Number(playbackRate) || 1));
    navigator.mediaSession.setPositionState({ duration: dur, position: pos, playbackRate: rate });
  } catch {}
}

export function setPlaybackState(state) {
  try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = state; } catch {}
}

function guessMime(url) {
  const u = String(url || '').toLowerCase();
  if (u.endsWith('.png')) return 'image/png';
  if (u.endsWith('.webp')) return 'image/webp';
  if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/*';
}

