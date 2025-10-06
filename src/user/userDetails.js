import { getItem as storageGet, removeItem as storageRemove } from '../storage.js';

/**
 * Fetch the current user’s info from the backend using a Bearer token from cookies.
 * @returns {Promise<Object>} Resolves to the user info JSON.
 */
async function fetchUserInfo() {
  const token = storageGet('authToken');
  if (!token) {
    throw new Error('No auth token found – you need to be logged in.');
  }

  const url = `${window.API_URLS.USER}info/`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });

  if (res.status === 401) {
    // Token is invalid or expired
    storageRemove('authToken');
    throw new Error('Unauthorized. authToken deleted. Please log in again.');
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch user info: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  localStorage.setItem('name', data.name); // store name in localStorage
  printl('fetched user info:', data);
  return data;
}

/**
 * Pull user info & update the UI.
 */
async function updateUserDetails() {
  try {
    const data = await fetchUserInfo();

    // If the backend indicates no access, redirect to bouncer page
    try {
      const path = (location.pathname || '').toLowerCase();
      const onBouncer = /\/bouncer\.html(?:$|[?#])/.test(path);
      // Do NOT redirect away from the account setup (name) page
      const onAccountSetup = /\/accountsetup\.html(?:$|[?#])/.test(path);
      if (data && data.has_access === false && !onBouncer && !onAccountSetup) {
        window.location.assign('/bouncer.html');
        return; // stop further UI updates on this page
      }
    } catch {}
    if (data.credits != null) {
      const formattedCredits = `$ ${data.credits}`;

      // Update all .creditRemaining elements
      document.querySelectorAll('.creditRemaining').forEach(el => {
        el.innerHTML = formattedCredits;
      });

      // Update all .credit elements
      document.querySelectorAll('.credit').forEach(el => {
        el.innerText = formattedCredits;
      });
    }
  } catch (err) {
    printError('⚠️ updateUserDetails error:', err);
  }
}

// Kick it off now, then every 10 seconds
updateUserDetails();
setInterval(updateUserDetails, 10 * 1000);
