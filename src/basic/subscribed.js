import confetti from 'canvas-confetti';

// Confetti helper
export function celebrateBuckeyes(ms = 15000) {
  const end = Date.now() + ms;
  const colors = ['#CF3F35', '#B7B7B7'];
  (function frame() {
    confetti({ particleCount: 2, angle: 60, spread: 55, origin: { x: 0 }, colors, disableForReducedMotion: false });
    confetti({ particleCount: 2, angle: 120, spread: 55, origin: { x: 1 }, colors, disableForReducedMotion: false });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

// Wire UI without intermediate processing state
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('.goHomeBtn');
  // Navigate home on click
  btn?.addEventListener('click', () => { window.location.href = '/home.html'; });
  // Immediately celebrate without delay
  celebrateBuckeyes();
});
