// Minimal handler for the paw tab toggle
// Toggles `.active` on the `.pawTab` when clicked

function initPawToggle() {
  try {
    const paw = document.querySelector('.pawTab');
    if (!paw) return;
    paw.addEventListener('click', (e) => {
      try { paw.classList.toggle('active'); } catch {}
    });
  } catch {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPawToggle);
} else {
  initPawToggle();
}

