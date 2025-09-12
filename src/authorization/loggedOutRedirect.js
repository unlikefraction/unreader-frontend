// authRedirect.js
import { getItem as storageGet } from '../storage.js';

(function() {
  const token = storageGet('authToken');
  // If there’s no token, send to login
  if (!token) {
    window.location.replace('/');
  }
})();
