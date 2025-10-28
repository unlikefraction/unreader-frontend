document.addEventListener('DOMContentLoaded', () => {
  const link = document.querySelector('.logoutLink');
  if (!link) return;

  function clearAllCookies() {
    try {
      const cookies = document.cookie ? document.cookie.split(';') : [];
      for (const c of cookies) {
        const eqIdx = c.indexOf('=');
        const name = (eqIdx > -1 ? c.substring(0, eqIdx) : c).trim();
        // Expire cookie for root path
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        // Also try current path as a fallback
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=${location.pathname}`;
      }
    } catch {}
  }

  function clearStorage() {
    try { localStorage.removeItem('authToken'); } catch {}
    try { localStorage.removeItem('name'); } catch {}
    try { sessionStorage.clear(); } catch {}
  }

  link.addEventListener('click', (e) => {
    e.preventDefault();
    clearAllCookies();
    clearStorage();
    try { console.log('Logged out: cleared cookies and storage'); } catch {}
    location.reload();
  });
});

