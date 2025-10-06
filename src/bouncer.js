import { getItem as storageGet } from './storage.js';

// Elements
const inputEl = document.querySelector('.bouncer-input');
const buttonEl = document.querySelector('.bouncer-btn');
const accessDetails = document.querySelector('.accessDetails');
const accessContainer = document.querySelector('.accessMainContainer');
const accessText = document.querySelector('.accessContent');
const accessBorder = document.querySelector('.accessBorder');

// Hide the access details until we receive a response
try { if (accessDetails) accessDetails.classList.remove('show'); } catch {}

// Utility: adjust decorative border height to match content
function syncAccessBorderHeight() {
  try {
    if (accessText && accessBorder) {
      accessBorder.style.height = `${accessText.offsetHeight}px`;
    }
  } catch {}
}

// Button state handlers
function setButtonBaseStyles() {
  buttonEl.classList.remove('accepted-state', 'denied-state', 'iconified');
  buttonEl.style.background = '';
  buttonEl.style.border = '';
  buttonEl.style.color = '';
}

function applyInitialButton() {
  setButtonBaseStyles();
  buttonEl.textContent = 'check with bouncer';
  // Initial action submits the message
  buttonEl.onclick = handleSubmit;
  // Re-enable input in default state
  try { if (inputEl) inputEl.disabled = false; } catch {}
  updateButtonState();
}

function applyAcceptedButton() {
  setButtonBaseStyles();
  buttonEl.classList.add('accepted-state', 'iconified');
  buttonEl.innerHTML = 'access unreader <i class="ph ph-arrow-right"></i>';
  buttonEl.disabled = false;
  // Disable input after acceptance
  try { if (inputEl) inputEl.disabled = true; } catch {}
  buttonEl.onclick = () => { window.location.assign('/'); };
}

function applyDeniedButton() {
  setButtonBaseStyles();
  buttonEl.classList.add('denied-state', 'iconified');
  buttonEl.innerHTML = 'try again <i class="ph ph-arrows-clockwise"></i>';
  buttonEl.disabled = false;
  // Disable input after denial
  try { if (inputEl) inputEl.disabled = true; } catch {}
  buttonEl.onclick = () => {
    // Reset to initial state; hide access details until next response
    try { if (accessDetails) accessDetails.classList.remove('show'); } catch {}
    try { if (accessContainer) accessContainer.classList.remove('accepted', 'denied'); } catch {}
    if (inputEl) { inputEl.value = ''; inputEl.disabled = false; }
    applyInitialButton();
    inputEl?.focus?.();
  };
}

// Disable button until user types something
function updateButtonState() {
  if (!buttonEl) return;
  const hasText = !!inputEl?.value && inputEl.value.trim().length > 0;
  buttonEl.disabled = !hasText;
}

async function handleSubmit() {
  const message = (inputEl?.value || '').trim();
  if (!message) { updateButtonState(); return; }
  buttonEl.disabled = true; // prevent duplicate submissions
  applyThinkingButton();

  try {
    const token = storageGet('authToken');
    const url = `${window.API_URLS.USER}bouncer/`;

    const res = await fetch(url, {
      method: 'POST',
      headers: Object.assign(
        { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        token ? { 'Authorization': `Bearer ${token}` } : {}
      ),
      body: JSON.stringify({ message })
    });

    // Try to parse the expected response shape
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    try { window.printl && window.printl('bouncer response:', res.status, data); } catch {}

    if (data && typeof data.reply_to_user === 'string') {
      // Reveal the access details area
      try { if (accessDetails) accessDetails.classList.add('show'); } catch {}
      if (accessText) accessText.textContent = data.reply_to_user;
      if (accessContainer) {
        accessContainer.classList.remove('accepted', 'denied');
        accessContainer.classList.add(data.allow ? 'accepted' : 'denied');
      }
      // Sync border height to new content
      syncAccessBorderHeight();

      if (data.allow === true) {
        stopThinkingButton();
        applyAcceptedButton();
      } else {
        stopThinkingButton();
        applyDeniedButton();
      }
    } else {
      // Unexpected response, just reset state
      try { window.printWarning && window.printWarning('Unexpected bouncer response shape'); } catch {}
      stopThinkingButton();
      applyDeniedButton();
    }
  } catch (err) {
    try { window.printError && window.printError('bouncer request failed:', err); } catch {}
    stopThinkingButton();
    applyDeniedButton();
  }
}

// Initialize interactions
if (inputEl && buttonEl) {
  inputEl.addEventListener('input', updateButtonState);
  // Keyboard shortcuts: Cmd+Enter (mac) or Shift+Enter (Windows) to submit
  try {
    const isWindows = /win/i.test(navigator?.platform || navigator?.userAgent || '');
    inputEl.addEventListener('keydown', (e) => {
      const isEnter = (e.key === 'Enter');
      const trigger = (e.metaKey) || (isWindows && e.shiftKey);
      if (isEnter && trigger) {
        e.preventDefault();
        if (!buttonEl.disabled) handleSubmit();
      }
    });
  } catch {}
  applyInitialButton();
}

// Initial border sync (in case default content is shown later)
syncAccessBorderHeight();

// --- Thinking state helpers ---
let __thinkingTimer = null;
function applyThinkingButton() {
  if (!buttonEl) return;
  setButtonBaseStyles();
  buttonEl.disabled = true;
  buttonEl.style.cursor = 'default';
  let dots = 0;
  const base = 'bouncer is thinking';
  buttonEl.textContent = `${base}...`;
  if (__thinkingTimer) { try { clearInterval(__thinkingTimer); } catch {} }
  __thinkingTimer = setInterval(() => {
    dots = (dots + 1) % 4; // 0..3
    const suffix = '.'.repeat(dots);
    buttonEl.textContent = `${base}${suffix}`;
  }, 400);
}

function stopThinkingButton() {
  if (__thinkingTimer) {
    try { clearInterval(__thinkingTimer); } catch {}
    __thinkingTimer = null;
  }
}
