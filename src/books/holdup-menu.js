// Minimal UI logic for holdup hover menu
// Ensures exactly one option is active at all times and persists preference
import { getItem as storageGet, setItem as storageSet } from '../storage.js';

function initHoldupMenu() {
  const wrapper = document.querySelector('.holdup-wrapper');
  const menu = document.querySelector('.holdup-menu');
  if (!wrapper || !menu) return;

  const options = Array.from(menu.querySelectorAll('.option'));
  if (!options.length) return;

  // Ensure exactly one active (load preference if available)
  const saved = (storageGet('ui:holdupMode') || 'voice');
  let preferred = options.find(o => o.getAttribute('data-mode') === saved) || null;
  if (!preferred) preferred = options[0];
  options.forEach(o => o.classList.remove('active'));
  preferred.classList.add('active');
  try { preferred.setAttribute('aria-pressed', 'true'); } catch {}
  let active = preferred;

  options.forEach(opt => {
    // Use pointerdown for immediate activation (faster than click)
    opt.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      try { menu.classList.add('instant'); } catch {}
      if (opt === active) return;
      if (active) {
        active.classList.remove('active');
        try { active.setAttribute('aria-pressed', 'false'); } catch {}
      }
      opt.classList.add('active');
      try { opt.setAttribute('aria-pressed', 'true'); } catch {}
      active = opt;

      // Persist preference and emit a mode-change event
      const mode = opt.getAttribute('data-mode') || 'voice';
      try { storageSet('ui:holdupMode', mode); } catch {}
      try { wrapper.dispatchEvent(new CustomEvent('holdup-mode-change', { detail: { mode } })); } catch {}
    });
  });

  // Remove instant mode when pointer leaves wrapper so next hover animates again
  try {
    wrapper.addEventListener('mouseleave', () => {
      try { menu.classList.remove('instant'); } catch {}
    });
  } catch {}
}

// Run on DOM ready (module loaded at end of body)
try { initHoldupMenu(); } catch {}
