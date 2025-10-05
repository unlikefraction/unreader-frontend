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


  // ----- Greeting text -----
  const updateGreeting = () => {
    const name = localStorage.getItem("name") || "bro";
    if (titleEl) titleEl.textContent = `what we reading today, ${name}?`;
  };
  updateGreeting();
  if (subEl) subEl.textContent = "or starting a new book?";

  // Poll for name changes (20× every 100 ms)
  let count = 0;
  const intervalId = setInterval(() => {
    updateGreeting();
    if (++count >= 20) clearInterval(intervalId);
  }, 100);

  // helper: create a DOM card for a default template
  function normKey(title = '', authors = []) {
    const t = String(title || '').trim().toLowerCase();
    const a = Array.isArray(authors) ? authors.map(x => String(x||'').trim().toLowerCase()).join('|') : '';
    return `${t}|${a}`;
  }

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
      defaults.forEach(t => {
        const item = document.createElement('div');
        item.className = 'book-items';
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
    list.forEach(book => {
      const item = document.createElement("div");
      item.className = "book-items";
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
      const ids = new Set(list.map(b => b.googleBooksId).filter(Boolean));
      const titleKeys = new Set(list.map(b => normKey(b.title, b.authors || [])).filter(Boolean));
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
        oath:       b.oath,
        publisher:  b.publisher,
        language:   b.language
      }));
      renderBooks(books, { includeDefaults: true });
      unskelton();
    })
    .catch(err => {
      printError("Error loading books:", err);
      if (bookWrapper) {
        bookWrapper.innerHTML = `<p class="error">Could not load your books. Please try again later.</p>`;
      }
      unskelton();
    });
});
