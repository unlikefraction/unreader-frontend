// apiUrls.js

// Default to PROD; allow switching to DEV via window.useDev()
const PROD_BASE = 'https://unreaderprod.unlikefraction.com';
const DEV_BASE  = 'https://unreaderdev.unlikefraction.com';

function buildUrls(base) {
  return {
    BASE: base,
    APPLE_TOKEN: `${base}/user/auth/apple/token/`,
    GOOGLE_AUTH: `${base}/user/auth/google/`,
    USER: `${base}/user/`,
    BOOK: `${base}/book/`,
    PAYMENT: `${base}/payment/`,
    AUDIO: `${base}/audio/`,
    INBOX: `${base}/team/`,
  };
}

let API_BASE_URL = PROD_BASE;
try {
  if (localStorage.getItem('useDev') === 'true') {
    API_BASE_URL = DEV_BASE;
  }
} catch {}

window.API_URLS = buildUrls(API_BASE_URL);

// Global helper to switch to dev endpoints and persist choice
window.useDev = function useDev() {
  try { localStorage.setItem('useDev', 'true'); } catch {}
  window.API_URLS = buildUrls(DEV_BASE);
  try { console.log('API_URLS switched to DEV:', DEV_BASE); } catch {}
};
