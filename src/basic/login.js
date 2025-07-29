// login.js

// ---------- CONFIG ----------
const GOOGLE_CLIENT_ID     = "814413323140-tmvrg2ad3bhe7j35h1v58v5hrkl311tg.apps.googleusercontent.com";
const GOOGLE_REDIRECT_URI  = "http://localhost:5173/popup.html";
const GOOGLE_SCOPE         = "profile email";
const GOOGLE_RESPONSE_TYPE = "token";

const APPLE_CLIENT_ID      = "com.unreader.auth";
const APPLE_REDIRECT_URI   = "https://unreaderdev.unlikefraction.com/user/auth/apple/";
const APPLE_SCOPE          = "name email";
const APPLE_RESPONSE_TYPE  = "code id_token";

// ---------- UTILITIES ----------
/** RFC4122 v4 UUID generator */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Set the authToken cookie */
function setAuthCookie(tokenValue, daysToExpire) {
  let expires = "";
  if (daysToExpire) {
    const date = new Date();
    date.setTime(date.getTime() + daysToExpire * 24 * 60 * 60 * 1000);
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = `authToken=${tokenValue || ""}${expires}; path=/; SameSite=Lax; Secure`;
}

// ---------- GOOGLE LOGIN ----------
function openGooglePopup() {
  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}` +
    `&response_type=${encodeURIComponent(GOOGLE_RESPONSE_TYPE)}` +
    `&scope=${encodeURIComponent(GOOGLE_SCOPE)}` +
    `&prompt=select_account`;

  window.open(authUrl, "_blank", "width=500,height=600");
}

// ---------- APPLE LOGIN + POLLING ----------
function loginWithApple() {
  // 1) generate a unique state
  const state = generateUUID();
  sessionStorage.setItem("appleAuthState", state);

  // 2) open Apple auth popup
  const url =
    `https://appleid.apple.com/auth/authorize?` +
    `response_type=${encodeURIComponent(APPLE_RESPONSE_TYPE)}` +
    `&client_id=${encodeURIComponent(APPLE_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(APPLE_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(APPLE_SCOPE)}` +
    `&response_mode=form_post` +
    `&state=${encodeURIComponent(state)}`;

  const popup = window.open(url, "_blank", "width=500,height=600");

  // 3) start polling backend for token
  const intervalId = setInterval(async () => {
    try {
      const res = await fetch(
        `${window.API_URLS.APPLE_TOKEN}?state=${encodeURIComponent(state)}`,
        { method: "GET", credentials: "include" }
      );

      if (res.status === 200) {
        const { token } = await res.json();
        setAuthCookie(token, 30);
        clearInterval(intervalId);
        if (popup && !popup.closed) popup.close();
        window.location.href = "home.html";
      } else if (res.status !== 404) {
        console.error("Apple token polling error:", res.status, await res.text());
      }
      // 404 → not ready yet, keep polling
    } catch (err) {
      console.error("Polling network error:", err);
    }
  }, 1000);
}

// expose for your buttons
window.openGooglePopup = openGooglePopup;
window.loginWithApple   = loginWithApple;


// demoApi.js

/**
 * Fetch the current user’s info from the backend.
 * @returns {Promise<Object>} Resolves to the user info JSON.
 */
async function fetchUserInfo() {
  const url = `${window.API_URLS.BASE}/user/info/`;
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',         // send cookies
      headers: {
        'Accept': 'application/json'  // we expect JSON back
      }
    });
    
    if (!res.ok) {
      throw new Error(`Failed to fetch user info: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    console.log('✅ User Info:', data);
    return data;
    
  } catch (err) {
    console.error('⚠️ Error in fetchUserInfo():', err);
    // you could show a UI error state here
    throw err;
  }
}

// Example usage: on page load, get user info and render their name
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const user = await fetchUserInfo();
    console.log(user)
  } catch {
    console.log("dance")
  }
});
