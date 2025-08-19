// bookDetails.js

// === Utility ===
function getCookie(name) {
  const cookie = document.cookie
    .split('; ')
    .find(row => row.startsWith(name + '='));
  return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
}
function setCookie(name, value, days = 30) {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`;
}
function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}
function escapeHtmlAttr(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// === Timezone Setup ===
const userTimezoneOffset = new Date().getTimezoneOffset() * 60000; // in ms

// === Image Upload Config ===
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/webp", "image/jpeg", "image/jpg"];
const MAX_COVER_BYTES = 10 * 1024 * 1024; // 10MB

async function uploadCoverImage(file, token) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    alert("Please select a PNG, WEBP, or JPEG image.");
    return null;
  }
  if (file.size > MAX_COVER_BYTES) {
    alert("Cover image too large. Max 10 MB.");
    return null;
  }

  try {
    showOverlay("Uploading cover image…");
    const form = new FormData();
    // server accepts same field name as EPUB upload
    form.append("book_file", file);

    const res = await fetch(`${window.API_URLS.BOOK}assets/upload/`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: form
    });
    const data = await res.json().catch(() => ({}));
    hideOverlay();

    if (!res.ok) {
      console.error("Cover upload error:", data);
      alert(`Cover upload failed (${res.status}).`);
      return null;
    }
    return data.files?.[file.name] || null;
  } catch (err) {
    hideOverlay();
    console.error("Cover upload network error:", err);
    alert("Network error while uploading cover.");
    return null;
  }
}

// Lightweight overlay hooks (only work if you have #loadingOverlay on page)
function showOverlay(msg = "Please wait…") {
  const o = document.getElementById("loadingOverlay");
  if (!o) return;
  o.style.display = "flex";
  const t = o.querySelector(".loadingText");
  if (t) t.textContent = msg;
}
function hideOverlay() {
  const o = document.getElementById("loadingOverlay");
  if (o) o.style.display = "none";
}

// === Update API helper ===
async function updateUserBook(userBookId, patch, token) {
  const res = await fetch(`${window.API_URLS.BOOK}update/${userBookId}/`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(patch)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || `Update failed (${res.status})`);
  }
  return data;
}

// === Inline Title Editing (same behavior/classes as add page) ===
function wireInlineTitleEditing({ container, initialTitle, onCommit }) {
  const editBtn = container.querySelector(".editTitle");
  let titleP   = container.querySelector(".bookTitle");
  let subtitleSpan = titleP?.querySelector(".bookSubtitle");
  const subtitleText = subtitleSpan ? subtitleSpan.textContent : "";

  // Build structure: input for main title + optional subtitle
  titleP.innerHTML = "";
  const input = document.createElement("input");
  input.id = "bookTitleInput";
  input.className = "editableTitle";
  input.type = "text";
  input.value = initialTitle || "";
  input.readOnly = true;
  input.setAttribute("aria-label", "Edit book title");
  titleP.appendChild(input);

  if (subtitleText) {
    const sep = document.createElement("span");
    sep.className = "titleSep";
    sep.textContent = " : ";
    titleP.appendChild(sep);
    subtitleSpan = document.createElement("span");
    subtitleSpan.className = "bookSubtitle";
    subtitleSpan.textContent = subtitleText;
    titleP.appendChild(subtitleSpan);
  }

  let preEditTitle = input.value;
  let outsideHandler = null;

  const enableEdit = () => {
    preEditTitle = input.value;
    input.readOnly = false;
    input.classList.add("isEditing");
    input.focus();
    input.setSelectionRange(0, input.value.length);

    if (!outsideHandler) {
      outsideHandler = (e) => {
        if (input.readOnly) return;
        const inside = input.contains(e.target) || (editBtn && editBtn.contains(e.target));
        if (!inside) commitEdit();
      };
      document.addEventListener("mousedown", outsideHandler, true);
    }
  };

  const commitEdit = async () => {
    const newTitle = input.value.trim();
    input.readOnly = true;
    input.classList.remove("isEditing");
    if (!newTitle || newTitle === preEditTitle) return; // no-op

    try {
      await onCommit(newTitle);
    } catch (err) {
      // revert on failure
      input.value = preEditTitle;
      console.error(err);
      alert(err.message || "Failed to update title.");
    }
  };

  const revertEdit = () => {
    input.value = preEditTitle;
    input.readOnly = true;
    input.classList.remove("isEditing");
  };

  input.addEventListener("click", () => {
    if (input.readOnly) enableEdit();
  });
  editBtn?.addEventListener("click", enableEdit);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      revertEdit();
    }
  });

  return {
    setTitle: (t) => { input.value = t; },
    cleanup: () => {
      if (outsideHandler) {
        document.removeEventListener("mousedown", outsideHandler, true);
        outsideHandler = null;
      }
    }
  };
}

// === Thoughts autosave (cookie ~2s, backend ~10s, and on any click) ===
function wireThoughtsAutosave({ textarea, userBookId, token, initialServerText = "" }) {
  const cookieKey = `ub_thoughts_${userBookId}`;

  // Prefer cookie/localStorage if exists; else server text
  let cacheVal = getCookie(cookieKey);
  if (cacheVal === null || cacheVal === undefined) {
    cacheVal = localStorage.getItem(cookieKey);
  }
  textarea.value = (cacheVal !== null && cacheVal !== undefined) ? cacheVal : (initialServerText || "");

  let dirty = false;
  let lastSent = textarea.value;
  let syncing = false;

  const saveCookie = () => {
    try {
      if (textarea.value.length > 3000) {
        localStorage.setItem(cookieKey, textarea.value);
      } else {
        setCookie(cookieKey, textarea.value, 30);
        localStorage.removeItem(cookieKey); // keep one source
      }
    } catch {/* ignore */}
  };
  const debouncedCookie = debounce(saveCookie, 2000);

  textarea.addEventListener("input", () => {
    dirty = true;
    debouncedCookie();
  });

  async function pushToServer() {
    if (!dirty || syncing) return;
    const txt = textarea.value;
    if (txt === lastSent) { dirty = false; return; }
    try {
      syncing = true;
      await updateUserBook(userBookId, { thoughts: txt }, token);
      lastSent = txt;
      dirty = false;
    } catch (err) {
      console.error("Thoughts sync failed:", err);
      // keep dirty so we retry on next tick or click
    } finally {
      syncing = false;
    }
  }

  const intervalId = setInterval(pushToServer, 10_000);
  const clickHandler = () => { pushToServer(); };
  document.addEventListener("click", clickHandler, true);

  window.addEventListener("beforeunload", () => {
    saveCookie();
    if (token) {
      const payload = JSON.stringify({ thoughts: textarea.value });
      navigator.sendBeacon?.(
        `${window.API_URLS.BOOK}update/${userBookId}/`,
        new Blob([payload], { type: "application/json" })
      );
    }
  });

  return {
    stop: () => {
      clearInterval(intervalId);
      document.removeEventListener("click", clickHandler, true);
    },
    forceSync: pushToServer
  };
}

// === Fetch book details + wire everything ===
(async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const userBookId = urlParams.get('id');
  const token = getCookie("authToken");

  if (!userBookId || !token) {
    console.error("Missing userBookId or authToken");
    return;
  }

  try {
    const response = await fetch(`${window.API_URLS.BOOK}get-details/${userBookId}/`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) throw new Error(`Status: ${response.status}`);
    const book = await response.json();

    // === Set cover image ===
    const coverImg = document.querySelector('.book-image img');
    if (coverImg && book.cover_image_url) coverImg.src = book.cover_image_url;

    // === Set oath image ===
    const oathImg = document.querySelector('.oath');
    if (oathImg && book.oath) {
      const oath = book.oath.toLowerCase();
      if (["fire_oath", "whisper_oath", "blood_oath"].includes(oath)) {
        oathImg.src = `/assets/${oath.replace("_", "")}.png`;
      }
    }

    // === Progress bar setup ===
    const totalPages = book.pages.length;
    const analytics = book.pages_read_analytics || {};
    let lastPageRead = 0;
    Object.values(analytics).forEach(pages => {
      pages.forEach(p => { if (p > lastPageRead) lastPageRead = p; });
    });

    const percentageRead = Math.min(Math.round((lastPageRead / totalPages) * 100), 100);
    const filledBar = document.querySelector('.progressFilledBook');
    const percentText = document.querySelector('.percentRead');
    if (filledBar) filledBar.style.width = `${percentageRead}%`;
    if (percentText) percentText.textContent = `${percentageRead}%`;

    // === Start Date ===
    const startDate = new Date(book.book_started_at);
    const userStartDate = new Date(startDate.getTime() - userTimezoneOffset);
    const startDateText = document.querySelector('.startDateText');
    if (startDateText) {
      startDateText.textContent = userStartDate.toLocaleDateString(undefined, {
        day: 'numeric', month: 'short', year: 'numeric'
      });
    }

    // === Dot logic ===
    const progressContainer = document.querySelector('.progressMarkings');
    if (progressContainer) {
      progressContainer.innerHTML = '';
      const today = new Date(Date.now() - userTimezoneOffset);
      const dayMap = {};

      Object.keys(analytics).forEach(utcDate => {
        const d = new Date(utcDate + "T00:00:00Z");
        const localDate = new Date(d.getTime() - userTimezoneOffset);
        const key = localDate.toISOString().split("T")[0];
        dayMap[key] = true;
      });

      const start = new Date(userStartDate);
      let isFirst = true;

      while (start <= today) {
        const dot = document.createElement("div");
        dot.classList.add("progressDot");

        const dateKey = start.toISOString().split("T")[0];
        const isToday = dateKey === today.toISOString().split("T")[0];
        const wasRead = dayMap[dateKey];

        if (isFirst) {
          if (wasRead) dot.classList.add("startCompleted");
          else dot.classList.add("start");
          isFirst = false;
        } else {
          if (isToday && wasRead) dot.classList.add("todayCompleted");
          else if (isToday) dot.classList.add("today");
          else if (wasRead) dot.classList.add("completed");
        }

        progressContainer.appendChild(dot);
        start.setDate(start.getDate() + 1);
      }
    }

    // === Title + Subtitle render (then we replace main title with editable input) ===
    const titleContainer = document.querySelector('.bookBasicInfo .title');
    if (titleContainer) {
      const titleP = titleContainer.querySelector('.bookTitle');
      if (titleP) {
        const main = book.title || '';
        const sub = book.subtitle || '';
        titleP.innerHTML = sub ? `${escapeHtmlAttr(main)} : <span class="bookSubtitle">${escapeHtmlAttr(sub)}</span>` : escapeHtmlAttr(main);

        // wire inline editing (commits to backend)
        const editor = wireInlineTitleEditing({
          container: titleContainer,
          initialTitle: main,
          onCommit: async (newTitle) => {
            await updateUserBook(userBookId, { title: newTitle }, token);
            const input = document.getElementById("bookTitleInput");
            if (input) input.value = newTitle;
          }
        });
        window.__titleEditor = editor;
      }
    }

    // === Author(s) ===
    const authorElement = document.querySelector('.bookAuthor');
    if (authorElement && Array.isArray(book.authors)) {
      authorElement.textContent = book.authors.join(', ');
    }

    // === Read Book Button Redirect ===
    const readBtn = document.querySelector('.readBook');
    if (readBtn) {
      readBtn.addEventListener('click', () => {
        window.location.href = `readBook.html?id=${userBookId}`;
      });
    }

    // === Thoughts (cookie 2s, backend 10s, and on click) ===
    const thoughtsInput = document.querySelector('.thoughtsInput');
    if (thoughtsInput) {
      const autosaver = wireThoughtsAutosave({
        textarea: thoughtsInput,
        userBookId,
        token,
        initialServerText: book.thoughts || ''
      });
      window.__thoughtsAutosaver = autosaver; // optional: for debugging
      // === Live word count for Thoughts ===
      const wordAmountEl = document.querySelector('.wordAmountThought');

      function countThoughtWords(text) {
        // treat words as tokens separated by a single space (normalize all whitespace -> one space)
        const normalized = String(text || "").replace(/\s+/g, " ").trim();
        return normalized ? normalized.split(" ").length : 0;
      }

      function updateThoughtWordCount() {
        if (!wordAmountEl || !thoughtsInput) return;
        wordAmountEl.textContent = String(countThoughtWords(thoughtsInput.value));
      }

      // initial render (after you've set thoughtsInput.value)
      updateThoughtWordCount();

      // keep it live
      thoughtsInput.addEventListener('input', updateThoughtWordCount);

    }

    // === Edit Cover (pencil) → file select → upload → POST update → update UI ===
    const editCoverIcon = document.querySelector('.editBookCover');
    const coverContainer = document.querySelector('.bookCoverDetailed');
    if (editCoverIcon && coverContainer) {
      // create hidden input once
      let coverInput = document.getElementById("coverFileInput");
      if (!coverInput) {
        coverInput = document.createElement("input");
        coverInput.type = "file";
        coverInput.id = "coverFileInput";
        coverInput.accept = "image/png, image/webp, image/jpeg, image/jpg";
        coverInput.style.display = "none";
        coverContainer.appendChild(coverInput);
      }

      editCoverIcon.addEventListener("click", () => coverInput.click());

      coverInput.addEventListener("change", async () => {
        const f = coverInput.files?.[0];
        coverInput.value = ""; // allow re-select same file later
        if (!f) return;

        const url = await uploadCoverImage(f, token);
        if (!url) return;

        try {
          await updateUserBook(userBookId, { cover_image_url: url }, token);
          // reflect in UI
          const img = document.querySelector(".book-image img");
          if (img) img.src = url;
        } catch (err) {
          console.error(err);
          alert(err.message || "Failed to update cover.");
        }
      });
    }

  } catch (err) {
    console.error("Error fetching book details:", err);
  }
})();
