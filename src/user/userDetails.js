/**
 * Read a cookie value by name.
 * @param {string} name
 * @returns {string|null}
 */
function getCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|; )' +
      name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }
  
  /**
   * Delete a cookie by name.
   * @param {string} name
   */
  function deleteCookie(name) {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
  }
  
  /**
   * Fetch the current user’s info from the backend using a Bearer token from cookies.
   * @returns {Promise<Object>} Resolves to the user info JSON.
   */
  async function fetchUserInfo() {
    const token = getCookie('authToken');
    if (!token) {
      throw new Error('No authToken cookie found – you need to be logged in.');
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
      deleteCookie('authToken');
      throw new Error('Unauthorized. authToken deleted. Please log in again.');
    }
  
    if (!res.ok) {
      throw new Error(`Failed to fetch user info: ${res.status} ${res.statusText}`);
    }
  
    const data = await res.json();
    // 🔥 Store the user’s name in localStorage
    localStorage.setItem('name', data.name);
    console.log('fetched user info:', data);
    return data;
  }
  
  /**
   * Pull user info & update the UI.
   */
  async function updateUserDetails() {
    try {
      const data = await fetchUserInfo();
      // If credits exist, update the .credit element’s text
      if (data.credits != null) {
        const creditEl = document.querySelector('.credit');
        if (creditEl) {
          creditEl.innerText = `$ ${data.credits}`;
        }
      }
    } catch (err) {
      console.error('⚠️ updateUserDetails error:', err);
    }
  }
  
// Kick it off now, then every 10 seconds (10,000ms)
updateUserDetails();
setInterval(updateUserDetails, 10 * 1000);
  