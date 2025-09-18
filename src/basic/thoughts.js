// thoughts.js — floating Thoughts popup on readBook.html

import { getItem as storageGet } from '../storage.js';

function countWords(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.split(' ').length : 0;
}

function getUserBookId() {
  try { return new URLSearchParams(window.location.search).get('id'); } catch { return null; }
}

function debounce(fn, delay) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

document.addEventListener('DOMContentLoaded', () => {
  const fab = document.querySelector('.thoughtsFab');
  const popup = document.querySelector('.thoughtsPopup');
  const textarea = document.querySelector('.thoughtsInput');
  const wordNumEl = document.querySelector('.wordAmountThought');
  const wordsWrap = document.querySelector('.wordsThoughts');
  if (!fab || !popup || !textarea || !wordNumEl || !wordsWrap) return;

  const userBookId = getUserBookId();
  const storageKey = userBookId ? `ub_thoughts_${userBookId}` : null;

  // Load cached thoughts (from bookDetails autosave or prior session)
  if (storageKey) {
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached != null) textarea.value = cached;
    } catch {}
  }

  // Initial word count
  wordNumEl.textContent = String(countWords(textarea.value));

  // Autosave locally (debounced) and update word count live
  const saveLocal = () => {
    if (storageKey) {
      try { localStorage.setItem(storageKey, textarea.value); } catch {}
    }
  };
  const debouncedSave = debounce(saveLocal, 500);
  textarea.addEventListener('input', () => {
    // live word count on each keystroke
    wordNumEl.textContent = String(countWords(textarea.value));
    // debounce local persistence
    debouncedSave();
  });

  // Toggle open/close
  const toggle = () => {
    popup.classList.toggle('visible');
    fab.classList.toggle('active');
    popup.setAttribute('aria-hidden', popup.classList.contains('visible') ? 'false' : 'true');
    if (popup.classList.contains('visible')) {
      // Close Inbox if open (mutually exclusive)
      try {
        const inboxPopup = document.querySelector('.inboxPopup');
        const inboxIcon  = document.querySelector('.inbox');
        if (inboxPopup && inboxPopup.classList.contains('visible')) inboxPopup.classList.remove('visible');
        if (inboxIcon) inboxIcon.classList.remove('active');
      } catch {}
      // focus textarea when opened
      setTimeout(() => textarea.focus(), 0);
    }
  };
  fab.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });

  // Click-away to close
  document.addEventListener('click', (e) => {
    if (!popup.classList.contains('visible')) return;
    if (!popup.contains(e.target) && !fab.contains(e.target)) {
      popup.classList.remove('visible');
      fab.classList.remove('active');
      popup.setAttribute('aria-hidden', 'true');
    }
  });
});
