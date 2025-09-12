import { printError } from '../utils.js';
import { setItem as storageSet } from '../storage.js';

window.onload = function () {
  // Store auth in localStorage (30-day TTL)
  function setAuthToken(tokenValue, daysToExpire = 30) {
    storageSet('authToken', tokenValue || '', daysToExpire);
  }

  async function redeemWelcomeCoupon(token) {
    try {
      const code = "WELCOME-TO-UNREADER";

      const res = await fetch(`${window.API_URLS.PAYMENT}redeem-coupon/`, {
        method: "POST",
        // keepalive lets the request try to finish even if the page is unloading
        keepalive: true,
        headers: Object.assign(
          { "Content-Type": "application/json", "Accept": "application/json" },
          token ? { "Authorization": `Bearer ${token}` } : {}
        ),
        body: JSON.stringify({ code })
      });

      if (res.ok) {
        // optional: const data = await res.json();
        printl("You have 5$ of free credits.");
      } else {
        const txt = await res.text().catch(() => "");
        printError("Coupon redeem failed:", res.status, txt);
      }
    } catch (err) {
      printError("Coupon redeem error:", err);
    }
  }

  // Google-specific: extract access_token from URL hash
  if (!window.location.hash.includes("access_token")) {
    document.body.textContent = "⚠️ No access_token found in URL.";
    printError("Google login not initiated or invalid redirect.");
    return;
  }

  const params = new URLSearchParams(window.location.hash.substring(1));
  const googleToken = params.get("access_token");

  if (!googleToken) {
    document.body.textContent = "⚠️ Token missing—login failed.";
    printError("No access_token in URL hash.");
    return;
  }

  // Exchange Google token for your API token
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
      setAuthToken(apiToken, 30);

      // Persist onboardingComplete in localStorage
      const onboardingValue = is_new_user ? 'false' : 'true';
      storageSet('onboardingComplete', onboardingValue);

      document.body.textContent = "✅ Login successful! Redirecting…";

      // IMPORTANT: await the coupon redemption BEFORE redirect/close
      if (is_new_user) {
        await redeemWelcomeCoupon(apiToken);
      }

      const redirectTo = is_new_user ? "/accountSetup.html" : "/home.html";

      if (window.opener && !window.opener.closed) {
        window.opener.location.href = redirectTo;
      }

      window.close();

    } catch (err) {
      document.body.textContent = "⚠️ Login Failed, try again.";
      printError("Error exchanging Google token:", err);
    }
  })();
};
