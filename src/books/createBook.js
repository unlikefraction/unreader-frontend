/*******************************
 * Unreader — Add a Book (createBook.js)
 *******************************/

/* ================================
   HELPERS
===================================*/
function getCookie(name) {
  // Escape special regex characters in the cookie name
  const escaped = name.replace(/([.*+?^${}()|[\]\\])/g, "\\$1");
  const match = document.cookie.match(new RegExp("(?:^|; )" + escaped + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function setStep(n) {
  document.querySelectorAll(".stepDot").forEach(d => {
    const stepNum = Number(d.dataset.step);
    d.classList.toggle("active", stepNum === n);
    d.classList.toggle("stepCompleted", stepNum < n);
  });
  ["step1", "step2", "step3"].forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = (i + 1 === n) ? "" : "none";
    el.classList.toggle("stepCompleted", (i + 1) < n);
  });
}

function showOverlay(msg = "Please wait...") {
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

/* ================================
   CONSTANTS / STATE
===================================*/
const DEFAULT_THUMBNAIL =
  "https://books.google.com/books/content?id=ZnagEAAAQBAJ&printsec=frontcover&img=1&zoom=6&edge=curl";

let uploadedFileUrl   = "";
let uploadedFilename  = "";
let pickedDetails     = null;
let selectedOath      = "fire_oath";
let lastClickedItemEl = null;

/* ================================
   STEP 1 — Upload
===================================*/
const dropZone     = document.getElementById("dropZone");
const fileInput    = document.getElementById("fileInput");
const uploadStatus = document.getElementById("uploadStatus");
const dzHint       = document.getElementById("dzHint");

["dragenter", "dragover"].forEach(evt => {
  dropZone.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add("hover");
  });
});
["dragleave", "drop"].forEach(evt => {
  dropZone.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("hover");
  });
});
dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("drop", e => {
  e.preventDefault();
  const f = [...e.dataTransfer.files].find(f => /\.epub$/i.test(f.name));
  if (!f) return alert("Drop a .epub file");

  const maxSize = 30 * 1024 * 1024; // 30 MB
  if (f.size > maxSize) {
    return alert("File is too large! Maximum allowed size is 30 MB.");
  }

  handleUpload(f);
});

fileInput.addEventListener("change", () => {
  const f = fileInput.files[0];
  if (!f) return;

  if (!/\.epub$/i.test(f.name)) return alert("Please choose a .epub");

  const maxSize = 30 * 1024 * 1024; // 30 MB
  if (f.size > maxSize) {
    alert("File is too large! Maximum allowed size is 30 MB.");
    fileInput.value = ""; // clear the input
    return;
  }

  handleUpload(f);
});

/* ================================
   NEW — EPUB metadata fetch + search text derivation
===================================*/
async function fetchEpubMetadata(epubUrl, token) {
  try {
    showOverlay("Reading EPUB metadata…");
    const res = await fetch(`${API_URLS.BOOK}epub-metadata/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ epub_url: epubUrl })
    });
    const data = await res.json().catch(() => ({}));
    hideOverlay();

    if (!res.ok) {
      // Friendly status-based messaging; still fall back safely
      let msg = "Couldn't read EPUB metadata.";
      if (res.status === 400) msg = "EPUB URL invalid or private; using file name.";
      if (res.status === 401) msg = "Auth failed while reading metadata; using file name.";
      if (res.status === 413) msg = "EPUB is too large for metadata parse; using file name.";
      if (res.status === 502) msg = "Server couldn't fetch the EPUB; using file name.";
      console.warn("EPUB metadata error:", data || res.statusText);
      searchStatus.textContent = msg;
      return null;
    }

    return data; // { source_url, metadata: {...} }
  } catch (err) {
    hideOverlay();
    console.error("EPUB metadata network error:", err);
    searchStatus.textContent = "Network error while extracting metadata; using file name.";
    return null;
  }
}

function deriveSearchTextFromMetadata(meta, fallbackNameNoExt) {
  if (!meta || !meta.metadata) return fallbackNameNoExt;

  const m = meta.metadata;
  const title = (m.title || "").trim();
  const authors = Array.isArray(m.authors) ? m.authors.filter(Boolean).map(a => a.trim()).filter(Boolean) : [];

  if (title && authors.length) {
    return `${title} by ${authors.join(", ")}`;        // case 1: title + authors
  }
  if (title && !authors.length) {
    return title;                                      // case 2: title only
  }
  return fallbackNameNoExt;                             // case 3: neither available
}

async function handleUpload(file) {
  const token = getCookie("authToken");
  if (!token) {
    alert("You're not logged in. Please log in first.");
    return;
  }

  uploadedFilename = file.name.replace(/\.epub$/i, "");
  uploadStatus.innerHTML = `<span class="spinner"></span> Uploading ${file.name}…`;
  dzHint.textContent = file.name;

  try {
    const form = new FormData();
    form.append("book_file", file);

    showOverlay("Uploading EPUB…");
    const res = await fetch(`${API_URLS.BOOK}assets/upload/`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: form
    });
    hideOverlay();

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      uploadStatus.textContent = `Upload failed (${res.status}).`;
      console.error("Upload error:", data);
      return;
    }

    uploadedFileUrl = data.files?.[file.name];
    uploadStatus.textContent = "✅ Uploaded.";

    // === NEW: fetch EPUB metadata using the uploaded URL ===
    const meta = await fetchEpubMetadata(uploadedFileUrl, token);

    // derive what we put in Step 2’s search box
    const derivedText = deriveSearchTextFromMetadata(meta, uploadedFilename);

    // If metadata gave us just a title (no authors), we’ll search by title next.
    // If it gave us title+authors, we’ll show "Title by A, B" in the box.
    // If neither, we fall back to the filename (existing behavior).
    uploadedFilename = derivedText;  // Step 2 uses this to pre-fill the search box

    // proceed to Step 2
    initStep2();
    setStep(2);

    // If Step 2 text is present, trigger a search now.
    if (searchInput.value.trim()) {
      doSearch(searchInput.value.trim());
    }

  } catch (err) {
    hideOverlay();
    console.error(err);
    uploadStatus.textContent = "Unexpected error while uploading.";
  }
}

/* ================================
   STEP 2 — Choose book
===================================*/
const searchInput  = document.getElementById("searchInput");
const bookList     = document.getElementById("bookList");
const pickedBox    = document.getElementById("pickedBox");
const searchStatus = document.getElementById("searchStatus");

function initStep2() {
  searchInput.value = uploadedFilename || "";
  bookList.innerHTML = "";
  pickedBox.className = "pickedBox";
  pickedBox.innerHTML = `
    <i class="ph ph-book-open" style="font-size:20px"></i>
    <span>no book selected</span>
  `;
  if (searchInput.value.trim()) doSearch(searchInput.value.trim());
}

searchInput.addEventListener("input", debounce(e => {
  const q = e.target.value.trim();
  if (!q) { bookList.innerHTML = ""; return; }
  doSearch(q);
}, 300));

async function doSearch(q) {
  try {
    searchStatus.textContent = "";
    bookList.innerHTML = `<div class="status"><span class="spinner"></span> Searching…</div>`;
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error(`Books API ${r.status}`);
    const data = await r.json();
    renderSearch(data.items || []);
  } catch (err) {
    console.error(err);
    bookList.innerHTML = "";
    searchStatus.textContent = "Problem searching Google Books.";
  }
}

function getYear(publishedDate = "") {
  const m = publishedDate.match(/\d{4}/);
  return m ? m[0] : "";
}

function renderSearch(items) {
  bookList.innerHTML = "";
  if (!items.length) {
    bookList.innerHTML = `<div class="status">No results. Try refining your title.</div>`;
    return;
  }
  items.forEach(item => {
    const info    = item.volumeInfo || {};
    const img     = (info.imageLinks && (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail)) || DEFAULT_THUMBNAIL;
    const title   = info.title || "Untitled";
    const authors = (info.authors || []).join(", ") || "Unknown author";
    const year    = getYear(info.publishedDate || "");

    const el = document.createElement("div");
    el.className = "bookItem";
    el.innerHTML = `
      <img src="${img}" alt="${title}"/>
      <div class="meta">
        <h3>${title}</h3>
        <p>${authors}${year ? ` • ${year}` : ""}</p>
      </div>
      <i class="ph ph-check-circle bookTick" aria-hidden="true"></i>
    `;
    el.addEventListener("click", () => selectBook(item, el));
    bookList.appendChild(el);
  });
}

function selectBook(book, el) {
  if (lastClickedItemEl) lastClickedItemEl.classList.remove("active");
  el.classList.add("active");
  lastClickedItemEl = el;

  const info = book.volumeInfo || {};
  const year = getYear(info.publishedDate || "");
  pickedDetails = {
    imageUrl: (info.imageLinks && (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail)) || DEFAULT_THUMBNAIL,
    title: info.title || "",
    authors: (info.authors || []).join("|"),
    google_books_id: book.id,
    subtitle: info.subtitle || "",
    publisher: info.publisher || "",
    published_date: info.publishedDate || "",
    language: info.language || "en"
  };

  pickedBox.className = "pickedBox bookSelected";
  pickedBox.innerHTML = `
    <div class="book-cover">
      <div class="book-inside"></div>
      <div class="book-image">
        <img src="${pickedDetails.imageUrl}"
              alt="Cover of ${pickedDetails.title}">
        <div class="effect"></div>
        <div class="light"></div>
      </div>
    </div>
    <div class="pickedMeta">
      <div class="mataDeta">
        <h4>${pickedDetails.title}</h4>
        <p>${pickedDetails.authors ? pickedDetails.authors.replace(/\|/g, ", ") : "Unknown author"}${year ? ` • ${year}` : ""}</p>
      </div>
      <button id="confirmBookBtn" class="btn">yes, continue   →</button>
    </div>
  `;
}

document.addEventListener("click", e => {
  if (e.target && e.target.id === "confirmBookBtn") {
    if (!pickedDetails || !uploadedFileUrl) {
      alert("Pick a book and upload an EPUB first.");
      return;
    }
    initStep3();
    setStep(3);
  }
});

/* ================================
   STEP 3 — Oath + Create  (UPDATED)
===================================*/
const oathTabs     = document.getElementById("oathTabs");
const oathBadge    = document.getElementById("oathBadge");
const oathCopy     = document.getElementById("oathCopy");
const oathImg      = document.getElementById("oathImg");
const takeOathBtn  = document.getElementById("takeOathBtn");
const createStatus = document.getElementById("createStatus");

/* price + gradient map per oath */
const OATHS = {
  whisper_oath: {
    label: "Whisper Oath",
    price: 1,
    gradient: "linear-gradient(90deg, #0C3C57 0%, #2B769C 49.5%, #689BAF 100%)"
  },
  fire_oath: {
    label: "Fire Oath",
    price: 4,
    gradient: "linear-gradient(90deg, #070302 0%, #9F0E01 49.5%, #FD9A2E 100%)"
  },
  blood_oath: {
    label: "Blood Oath",
    price: 10,
    gradient: "linear-gradient(90deg, #29160D 0%, #972219 49.5%, #91160F 100%)"
  }
};

function ordinal(n) {
  const s = ["th","st","nd","rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatBadgeDate(d = new Date()) {
  const day = ordinal(d.getDate());
  const month = d.toLocaleString(undefined, { month: "long" });
  const year = d.getFullYear();
  return `${day} ${month}, ${year}`;
}

function initStep3() {
  /* tabs */
  oathTabs.innerHTML = "";
  Object.entries(OATHS).forEach(([value, meta]) => {
    const b = document.createElement("button");
    b.className = "oathTab" + (value === selectedOath ? " active" : "");
    b.textContent = meta.label;
    b.addEventListener("click", () => {
      selectedOath = value;
      document.querySelectorAll(".oathTab").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      renderOathCopy();
    });
    oathTabs.appendChild(b);
  });

  renderOathCopy();
}

function renderOathCopy() {
  const { label, price, gradient } = OATHS[selectedOath];

  // date badge + full gradient
  oathBadge.textContent = formatBadgeDate(new Date());
  oathBadge.style.background = gradient;

  // oath image
  const oathKey = selectedOath.toLowerCase();
  if (["fire_oath", "whisper_oath", "blood_oath"].includes(oathKey)) {
    oathImg.src = `/assets/${oathKey.replace("_", "")}.png`;
  }

  // username (capitalize first letter)
  let username = (localStorage.getItem("name") || "").trim();
  username = username ? username.charAt(0).toUpperCase() + username.slice(1) : "—";

  const title = pickedDetails?.title || "the selected book";

  // extract first two colors from the full gradient
  const firstTwo = gradient.match(/#[0-9A-Fa-f]{3,6}/g)?.slice(0, 2) || ["#000", "#000"];
  const twoColorGradient = `linear-gradient(90deg, ${firstTwo[0]} 0%, ${firstTwo[1]} 50%)`;

  // gradient label style
  const labelHTML = `<span style="
      background: ${twoColorGradient};
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      color: transparent;
    ">${label}</span>`;

  oathCopy.innerHTML = `I, <strong>${username}</strong>, hereby take the <strong>${labelHTML}</strong> to read “<u>${title}</u>”, and <strong>wager $${price}</strong>, which I shall receive if, and only if, I complete the book.`;
}

takeOathBtn.addEventListener("click", createBookOnBackend);

async function createBookOnBackend() {
  const token = getCookie("authToken");
  if (!token) {
    alert("Please log in to continue.");
    return;
  }

  takeOathBtn.disabled = true;
  takeOathBtn.innerHTML = `<span class="spinner"></span> Processing…`;
  createStatus.textContent = "";
  showOverlay("Creating your book…");

  const payload = {
    title: pickedDetails.title,
    authors: pickedDetails.authors,
    google_books_id: pickedDetails.google_books_id,
    book_file_url: uploadedFileUrl,
    oath: selectedOath,
    subtitle: pickedDetails.subtitle,
    cover_image_url: pickedDetails.imageUrl,
    publisher: pickedDetails.publisher,
    published_date: pickedDetails.published_date,
    isbns: "",
    language: pickedDetails.language
  };

  try {
    const res = await fetch(`${API_URLS.BOOK}create/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    hideOverlay();

    if (!res.ok) {
      console.error("Create Book Error:", data);
      createStatus.textContent = data?.detail || "Error creating book.";
      takeOathBtn.disabled = false;
      takeOathBtn.textContent = "I take the oath, continue →";
      return;
    }

    createStatus.textContent = "✅ Done. Redirecting…";
    setTimeout(() => {
      window.location.href = `/bookDetails.html?id=${data.book_id}`;
    }, 600);

  } catch (err) {
    hideOverlay();
    console.error(err);
    createStatus.textContent = "Network error while creating the book.";
    takeOathBtn.disabled = false;
    takeOathBtn.textContent = "I take the oath, continue →";
  }
}
