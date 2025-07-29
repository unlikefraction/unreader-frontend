// apiUrls.js

// Base URL for all API requests
const API_BASE_URL = 'https://unreaderdev.unlikefraction.com';

// Expose endpoints on a global object
window.API_URLS = {
  BASE: API_BASE_URL,
  APPLE_TOKEN: `${API_BASE_URL}/user/auth/apple/token/`,
  GOOGLE_AUTH: `${API_BASE_URL}/user/auth/google/`,
};
