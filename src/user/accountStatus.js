import { getItem as storageGet, removeItem as storageRemove } from '../storage.js';

function formatUntil(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const day = d.getDate();
    const mon = months[d.getMonth()];
    const yr = d.getFullYear();
    return `${day} ${mon}, ${yr}`;
  } catch {
    return null;
  }
}

async function fetchUserInfo() {
  const token = storageGet('authToken');
  if (!token) throw new Error('Missing auth token');
  const url = `${window.API_URLS.USER}info/`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });
  if (res.status === 401) {
    storageRemove('authToken');
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

function setNotUnlimitedUI() {
  const img = document.querySelector('.topSection .statusImage');
  const section = document.getElementById('statusSection');
  const prefix = section?.querySelector('.statusPrefix');
  const label = section?.querySelector('.creditRemaining');
  const until = section?.querySelector('.statusUntil');
  const btn = document.getElementById('getUnlimitedBtn');

  if (img) img.src = '/assets/not-unlimited.webp';
  section?.classList.remove('unlimited');
  if (prefix) prefix.textContent = 'you are';
  if (label) label.textContent = 'not unlimited';
  if (until) { until.style.display = 'none'; until.textContent = ''; }
  if (btn) btn.style.display = '';
}

function setUnlimitedUI(untilDateStr) {
  const img = document.querySelector('.topSection .statusImage');
  const section = document.getElementById('statusSection');
  const prefix = section?.querySelector('.statusPrefix');
  const label = section?.querySelector('.creditRemaining');
  const until = section?.querySelector('.statusUntil');
  const btn = document.getElementById('getUnlimitedBtn');

  if (img) img.src = '/assets/dino.webp';
  img.style.width = '200px'
  section?.classList.add('unlimited');
  if (prefix) prefix.textContent = 'you are';
  if (label) label.textContent = 'Unlimited';
  if (btn) btn.style.display = 'none';

  const nice = formatUntil(untilDateStr);
  if (until) {
    if (nice) {
      until.textContent = `until ${nice}`;
      until.style.display = '';
    } else {
      until.textContent = '';
      until.style.display = 'none';
    }
  }
}

async function initAccountStatus() {
  try {
    const data = await fetchUserInfo();
    const ends = data?.premium_ends_at ?? null;

    // Trial logic: if account is within 30 days of creation, show Unlimited (trial)
    let trialUntil = null;
    try {
      const createdStr = data?.created;
      if (createdStr) {
        const created = new Date(createdStr);
        if (!isNaN(created.getTime())) {
          const now = new Date();
          const msDiff = now.getTime() - created.getTime();
          const days = msDiff / (1000 * 60 * 60 * 24);
          // Treat accounts within first 30 days as premium (trial)
          if (days <= 30) {
            const trialEndMs = created.getTime() + (30 * 24 * 60 * 60 * 1000);
            trialUntil = new Date(trialEndMs).toISOString();
          }
        }
      }
    } catch {}

    if (trialUntil) {
      setUnlimitedUI(trialUntil);
    } else if (ends) {
      setUnlimitedUI(ends);
    } else {
      setNotUnlimitedUI();
    }
  } catch (err) {
    // On error, default to not-unlimited view
    try { console.warn('accountStatus failed', err); } catch {}
    setNotUnlimitedUI();
  }
}

initAccountStatus();
