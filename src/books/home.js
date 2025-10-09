import { unskelton, printError } from '../utils.js';
import { getItem as storageGet } from '../storage.js';
import { seedDefaultBooks, getDefaultBooks } from './defaultBooks.js';

window.addEventListener("DOMContentLoaded", () => {
  // DOM refs
  const titleEl      = document.querySelector(".title");
  const subEl        = document.querySelector(".secondaryText");
  const bookWrapper  = document.querySelector(".book-wrapper");
  const searchInput  = document.querySelector(".searchText");

  // our books array (will be filled via fetch)
  let books = [];

  // no cookies — use localStorage via storage util


  // Create floating edit-name button (once)
  const editBtn = document.createElement('button');
  editBtn.className = 'editNameButton';
  editBtn.textContent = 'edit name';
  editBtn.style.display = 'none';
  editBtn.addEventListener('click', () => {
    window.location.href = '/accountSetup.html';
  });
  document.body.appendChild(editBtn);

  let currentNameSpan = null;
  let hideTimer = null;

  function positionEditButton() {
    if (!currentNameSpan) return;
    const rect = currentNameSpan.getBoundingClientRect();
    // Place centered above the name span
    editBtn.style.position = 'fixed';
    editBtn.style.left = `${rect.left + rect.width / 2}px`;
    editBtn.style.top = `${rect.top}px`;
    editBtn.style.transform = 'translate(-50%, calc(-100% - 4px)) rotate(-4deg)';
    editBtn.style.zIndex = '1000';
    editBtn.style.cursor = 'pointer';
  }

  function showEdit() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    positionEditButton();
    editBtn.style.display = 'block';
  }

  function scheduleHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!editBtn.matches(':hover')) {
        editBtn.style.display = 'none';
      }
    }, 150);
  }

  editBtn.addEventListener('mouseenter', () => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  });
  editBtn.addEventListener('mouseleave', scheduleHide);

  // ----- Greeting text with name span -----
  const updateGreeting = () => {
    const name = localStorage.getItem("name") || "bro";
    if (!titleEl) return;
    // Rebuild title content safely: text + span(name) + text
    titleEl.innerHTML = '';
    titleEl.append(document.createTextNode('what we reading today, '));
    const nameSpan = document.createElement('span');
    nameSpan.className = 'userNameSpan';
    nameSpan.textContent = name;
    titleEl.append(nameSpan);
    titleEl.append(document.createTextNode('?'));

    currentNameSpan = nameSpan;
    // Hover interactions
    nameSpan.addEventListener('mouseenter', showEdit);
    nameSpan.addEventListener('mouseleave', scheduleHide);
  };
  updateGreeting();
  if (subEl) subEl.textContent = "or starting a new book?";

  // Trigger simple fade-ins for the header elements
  if (titleEl) titleEl.classList.add('fade-in');
  if (subEl) subEl.classList.add('fade-in-delayed');

  function finishSkeleton() {
    const skel = document.querySelector('.skeletonLoading');
    if (skel) {
      skel.classList.add('fade-out');
      skel.addEventListener('animationend', () => {
        skel.style.display = 'none';
      }, { once: true });
    }
    const homePage = document.querySelector('.homePage');
    if (homePage) homePage.classList.add('fade-in');
  }

  // Poll for name changes (20× every 100 ms)
  let count = 0;
  const intervalId = setInterval(() => {
    updateGreeting();
    if (++count >= 20) clearInterval(intervalId);
  }, 100);

  // Keep button positioned on viewport changes if visible
  window.addEventListener('scroll', () => {
    if (editBtn.style.display !== 'none') positionEditButton();
  }, { passive: true });
  window.addEventListener('resize', () => {
    if (editBtn.style.display !== 'none') positionEditButton();
  });

  // helper: create a DOM card for a default template
  function normKey(title = '', authors = []) {
    const t = String(title || '').trim().toLowerCase();
    const a = Array.isArray(authors) ? authors.map(x => String(x||'').trim().toLowerCase()).join('|') : '';
    return `${t}|${a}`;
  }

  // IntersectionObserver to slide/fade book items on entry
  const bookObserver = new IntersectionObserver((entries) => {
    const visible = entries.filter(e => e.isIntersecting);
    // Stagger within this batch in visual order
    visible
      .sort((a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top)
      .forEach((entry, idx) => {
        entry.target.style.setProperty('--stagger', `${idx * 70}ms`);
        entry.target.classList.add('appear');
        bookObserver.unobserve(entry.target);
      });
  }, { root: null, threshold: 0.08, rootMargin: '0px 0px -32px 0px' });

  function renderDefaultTemplates(container, options = {}) {
    const { existingGoogleIds = new Set(), existingTitleKeys = new Set() } = options;
    try {
      const defaults = getDefaultBooks().filter(b => {
        const gid = (b.google_books_id || '').trim();
        if (gid && existingGoogleIds.has(gid)) return false;
        const key = normKey(b.details?.title, b.details?.authors || []);
        if (key && existingTitleKeys.has(key)) return false;
        return true;
      });
      const baseIndex = container?.children?.length || 0;
      defaults.forEach((t, i) => {
        const item = document.createElement('div');
        item.className = 'book-items book-animate';
        item.style.setProperty('--stagger', `${(baseIndex + i) * 60}ms`);
        item.innerHTML = `
          <a href="/createBook.html?template=${encodeURIComponent(t.id)}" class="main-book-wrap" title="Add ${t.details?.title || ''}">
            <div class="book-cover" data-name="${(t.details?.title || '').toLowerCase()}" data-author="${(t.details?.authors||[]).join(', ').toLowerCase()}">
              <div class="book-inside"></div>
              <div class="book-image img-hidden">
                <img src="${t.bookCover}" loading="lazy" alt="Cover of ${t.details?.title || 'book'}">
                <div class="effect"></div>
                <div class="light"></div>
              </div>
            </div>
          </a>
        `;
        container.appendChild(item);
        // Observe for reveal
        bookObserver.observe(item);

        const img = item.querySelector('img');
        const wrapper = item.querySelector('.book-image');
        if (img && wrapper) {
          const reveal = () => { wrapper.classList.remove('img-hidden'); };
          if (img.complete) {
            reveal();
          } else {
            const done = () => {
              reveal();
              img.removeEventListener('load', done);
              img.removeEventListener('error', done);
            };
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
          }
        }
      });
    } catch {}
  }

  // render function for user books, and prepend default templates if available
  function renderBooks(list, { includeDefaults = true } = {}) {
    if (!bookWrapper) return;
    bookWrapper.innerHTML = "";

    const sorted = list.slice().sort((a, b) => {
      const at = (typeof a.startedAt === 'number' && isFinite(a.startedAt)) ? a.startedAt : null;
      const bt = (typeof b.startedAt === 'number' && isFinite(b.startedAt)) ? b.startedAt : null;
      if (at && bt && at !== bt) return bt - at;
      if (at && !bt) return -1;
      if (!at && bt) return 1;
      const ta = String(a.title || '').trim().toLowerCase();
      const tb = String(b.title || '').trim().toLowerCase();
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      const aa = String((a.authors && a.authors[0]) || '').trim().toLowerCase();
      const ab = String((b.authors && b.authors[0]) || '').trim().toLowerCase();
      if (aa < ab) return -1;
      if (aa > ab) return 1;
      return 0;
    });

    sorted.forEach((book, i) => {
      const item = document.createElement("div");
      item.className = "book-items book-animate";
      item.style.setProperty('--stagger', `${i * 60}ms`);
      item.innerHTML = `
        <a href="/bookDetails.html?id=${book.id}" class="main-book-wrap">
          <div class="book-cover"
               data-name="${book.title.toLowerCase()}"
               data-author="${book.authors.join(", ").toLowerCase()}">
            <div class="book-inside"></div>
            <div class="book-image img-hidden">
              <img src="${book.coverUrl}" loading="lazy"
                   alt="Cover of ${book.title}">
              <div class="effect"></div>
              <div class="light"></div>
            </div>
          </div>
        </a>
      `;
      bookWrapper.appendChild(item);
      // Observe for reveal
      bookObserver.observe(item);

      // Reveal cover only after the image fully loads (or errors)
      const img = item.querySelector("img");
      const wrapper = item.querySelector(".book-image");
      if (img && wrapper) {
        const reveal = () => { wrapper.classList.remove("img-hidden"); };
        if (img.complete) {
          // If cached and already loaded, show immediately
          // naturalWidth === 0 can indicate an error; still reveal to avoid infinite hidden state
          reveal();
        } else {
          const done = () => {
            reveal();
            img.removeEventListener('load', done);
            img.removeEventListener('error', done);
          };
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        }
      }
    });
    if (includeDefaults) {
      const ids = new Set(sorted.map(b => b.googleBooksId).filter(Boolean));
      const titleKeys = new Set(sorted.map(b => normKey(b.title, b.authors || [])).filter(Boolean));
      renderDefaultTemplates(bookWrapper, { existingGoogleIds: ids, existingTitleKeys: titleKeys });
    }
  }

  // search handler: title, subtitle or any author
  function handleSearch() {
    const q = (searchInput?.value || "").trim().toLowerCase();
    if (!q) {
      renderBooks(books, { includeDefaults: true });
      return;
    }
    const filtered = books.filter(book => {
      return book.title.toLowerCase().includes(q)
          || (book.subtitle && book.subtitle.toLowerCase().includes(q))
          || book.authors.some(a => a.toLowerCase().includes(q));
    });
    // On search, show only real books
    renderBooks(filtered, { includeDefaults: false });
  }
  searchInput?.addEventListener("input", handleSearch);

  // Seed defaults once, then fetch your books from the API
  seedDefaultBooks().finally(() => {});

  const token = storageGet("authToken");
  fetch(`${window.API_URLS.BOOK}my-books/`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  })
    .then(res => {
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
      return res.json();
    })
    .then(data => {
      books = (data.books || []).map(b => ({
        id:         b.user_book_id,
        title:      b.title,
        subtitle:   b.subtitle,
        coverUrl:   b.cover_image_url,
        authors:    b.authors,
        googleBooksId: b.google_books_id,
        startedAt:  (b.book_started_at ? Date.parse(b.book_started_at) : null),
        oath:       b.oath,
        publisher:  b.publisher,
        language:   b.language
      }));
      renderBooks(books, { includeDefaults: true });
      // Ensure header fades once content is ready
      if (titleEl) titleEl.classList.add('fade-in');
      if (subEl) subEl.classList.add('fade-in-delayed');
      finishSkeleton();
      unskelton();
    })
    .catch(err => {
      printError("Error loading books:", err);
      if (bookWrapper) {
        bookWrapper.innerHTML = `<p class="error">Could not load your books. Please try again later.</p>`;
      }
      // Still animate header even on error
      if (titleEl) titleEl.classList.add('fade-in');
      if (subEl) subEl.classList.add('fade-in-delayed');
      finishSkeleton();
      unskelton();
    });
});
