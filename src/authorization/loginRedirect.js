// guestRedirect.js
import { getItem as storageGet } from '../storage.js';

(function() {
  const token = storageGet('authToken');
  // If there is a token, kick to home.
  if (token) {
    window.location.replace('home.html');
  }
})();
