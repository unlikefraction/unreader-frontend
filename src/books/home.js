window.addEventListener("DOMContentLoaded", () => {
  // DOM refs
  const titleEl     = document.querySelector(".title");
  const subEl       = document.querySelector(".secondaryText");
  const bookWrapper = document.querySelector(".book-wrapper");
  const searchInput = document.querySelector(".searchText");

  // placeholder name
  const updateGreeting = () => {
    const name = localStorage.getItem("name") || "bro";
    titleEl.textContent = `what we reading today, ${name}?`;
  };
  updateGreeting();
  subEl.textContent = "or starting a new book?";

  // poll for name changes (20× every 100 ms)
  let count = 0;
  const intervalId = setInterval(() => {
    updateGreeting();
    if (++count >= 20) clearInterval(intervalId);
  }, 100);

  // our books array (will be filled via fetch)
  let books = [];

  // render function
  function renderBooks(list) {
    bookWrapper.innerHTML = "";
    list.forEach(book => {
      const item = document.createElement("div");
      item.className = "book-items";
      item.innerHTML = `
        <div class="main-book-wrap">
          <div class="book-cover"
               data-name="${book.title.toLowerCase()}"
               data-author="${book.authors.join(", ").toLowerCase()}">
            <div class="book-inside"></div>
            <div class="book-image">
              <img src="${book.coverUrl}"
                   alt="Cover of ${book.title}">
              <div class="effect"></div>
              <div class="light"></div>
            </div>
          </div>
        </div>
      `;
      bookWrapper.appendChild(item);
    });
  }

  // search handler: title, subtitle or any author
  function handleSearch() {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      renderBooks(books);
      return;
    }
    const filtered = books.filter(book => {
      return book.title.toLowerCase().includes(q)
          || (book.subtitle && book.subtitle.toLowerCase().includes(q))
          || book.authors.some(a => a.toLowerCase().includes(q));
    });
    renderBooks(filtered);
  }
  searchInput.addEventListener("input", handleSearch);

  // fetch your books from the API
  const token = getCookie("authToken");
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
      books = data.books.map(b => ({
        id:         b.user_book_id,
        title:      b.title,
        subtitle:   b.subtitle,
        coverUrl:   b.cover_image_url,
        authors:    b.authors,
        oath:       b.oath,
        publisher:  b.publisher,
        language:   b.language
      }));
      renderBooks(books);
    })
    .catch(err => {
      printError("Error loading books:", err);
      bookWrapper.innerHTML = `<p class="error">Could not load your books. Please try again later.</p>`;
    });
});
