// authorize.js

window.onload = function() {
  /**
   * Sets an authentication cookie.
   * @param {string} tokenValue
   * @param {number} daysToExpire
   */
  function setAuthCookie(tokenValue, daysToExpire) {
    let expires = "";
    if (daysToExpire) {
      const date = new Date();
      date.setTime(date.getTime() + daysToExpire * 24 * 60 * 60 * 1000);
      expires = "; expires=" + date.toUTCString();
    }
    document.cookie = `authToken=${tokenValue || ""}${expires}; path=/; SameSite=Lax; Secure`;
  }

  // Only Google: parse the hash fragment
  if (!window.location.hash.includes("access_token")) {
    document.body.textContent = "⚠️ No access_token found in URL.";
    console.error("Google login not initiated or invalid redirect.");
    return;
  }

  const params = new URLSearchParams(window.location.hash.substring(1));
  const googleToken = params.get("access_token");

  if (!googleToken) {
    document.body.textContent = "⚠️ Token missing—login failed.";
    console.error("No access_token in URL hash.");
    return;
  }

  // Post to your backend to exchange for an API token
  (async () => {
    try {
      const res = await fetch(window.API_URLS.GOOGLE_AUTH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ access_token: googleToken })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Backend auth failed: ${res.status} ${res.statusText} — ${errText}`);
      }

      const { token: apiToken, user, is_new_user } = await res.json();
      // Store the API token in a cookie (30 days)
      setAuthCookie(apiToken, 30);

      document.body.textContent = "✅ Login successful! Redirecting…";

      // After 3s, redirect opener and close popup
      setTimeout(() => {
        if (window.opener && !window.opener.closed) {
          window.opener.location.href = "/index.html";
        }
        window.close();
      }, 3000);

    } catch (err) {
      document.body.textContent = "⚠️ Login error. Check console.";
      console.error("Error exchanging Google token:", err);
    }
  })();
};
