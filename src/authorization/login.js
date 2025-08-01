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
  const state = generateUUID();
  sessionStorage.setItem("appleAuthState", state);

  const url =
    `https://appleid.apple.com/auth/authorize?` +
    `response_type=${encodeURIComponent(APPLE_RESPONSE_TYPE)}` +
    `&client_id=${encodeURIComponent(APPLE_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(APPLE_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(APPLE_SCOPE)}` +
    `&response_mode=form_post` +
    `&state=${encodeURIComponent(state)}`;

  const popup = window.open(url, "_blank", "width=500,height=600");

  const intervalId = setInterval(async () => {
    try {
      const res = await fetch(
        `${window.API_URLS.APPLE_TOKEN}?state=${encodeURIComponent(state)}`,
        { method: "GET", credentials: "include" }
      );

      if (res.status === 200) {
        const { token, is_new_user, user } = await res.json();
        setAuthCookie(token, 30);
        clearInterval(intervalId);
        if (popup && !popup.closed) popup.close();

        // Conditional redirect based on user status
        if (is_new_user) {
          // First-time login — onboarding incomplete
          document.cookie = `onboardingComplete=false; path=/; SameSite=Lax; Secure`;
          window.location.href = "accountSetup.html";
        } else {
          // Returning user — assume onboarding already complete
          document.cookie = `onboardingComplete=true; path=/; SameSite=Lax; Secure`;
          window.location.href = "home.html";
        }        

      } else if (res.status !== 404) {
        printError("Apple token polling error:", res.status, await res.text());
      }

    } catch (err) {
      printError("Polling network error:", err);
    }
  }, 1000);
}

// expose for your buttons
window.openGooglePopup = openGooglePopup;
window.loginWithApple   = loginWithApple;