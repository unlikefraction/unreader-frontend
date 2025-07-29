// 1) Your “demo” name
var name = "shubh";

// 2) In-memory book list
var books = [
  { id: "1", name: "Creativity, INC.", coverUrl: "https://i.imgur.com/SPv9Rg7.png", autor: "Ed Catmull" },
  { id: "2", name: "Keep Going",       coverUrl: "https://i.imgur.com/UIPQEwk.png", autor: "Austin Kleon" },
  { id: "3", name: "Steve Jobs",       coverUrl: "https://i.imgur.com/nwzWCgm.png", autor: "Walter Isaacson" },
  { id: "4", name: "How to draw comics the marvel way",        coverUrl: "https://i.imgur.com/YdfU4Bw.png", autor: "Stan Lee" },
  { id: "5", name: "Zero to One",        coverUrl: "https://i.imgur.com/sVNy4Ct.png", autor: "Peter Thiel" },
  { id: "1", name: "Creativity, INC.", coverUrl: "https://i.imgur.com/SPv9Rg7.png", autor: "Ed Catmull" },
  { id: "2", name: "Keep Going",       coverUrl: "https://i.imgur.com/UIPQEwk.png", autor: "Austin Kleon" },
  { id: "3", name: "Steve Jobs",       coverUrl: "https://i.imgur.com/nwzWCgm.png", autor: "Walter Isaacson" },
  { id: "4", name: "How to draw comics the marvel way",        coverUrl: "https://i.imgur.com/YdfU4Bw.png", autor: "Stan Lee" },
  { id: "5", name: "Zero to One",        coverUrl: "https://i.imgur.com/sVNy4Ct.png", autor: "Peter Thiel" }
];

// 3) Cache DOM refs
const titleEl     = document.querySelector(".title");
const subEl       = document.querySelector(".secondaryText");
const bookWrapper = document.querySelector(".book-wrapper");
const searchInput = document.querySelector(".searchText");

// 4) Render function (no visible text)
function renderBooks(list) {
  bookWrapper.innerHTML = "";
  list.forEach(book => {
    const item = document.createElement("div");
    item.className = "book-items";
    item.innerHTML = `
      <div class="main-book-wrap">
        <div class="book-cover"
             data-name="${book.name.toLowerCase()}"
             data-author="${book.autor.toLowerCase()}">
          <div class="book-inside"></div>
          <div class="book-image">
            <img src="${book.coverUrl}"
                 alt="Cover of ${book.name}">
            <div class="effect"></div>
            <div class="light"></div>
          </div>
        </div>
      </div>
    `;
    bookWrapper.appendChild(item);
  });
}

// 5) Search handler
function handleSearch() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    renderBooks(books);
    return;
  }
  const filtered = books.filter(book => {
    return book.name.toLowerCase().includes(query) ||
           book.autor.toLowerCase().includes(query);
  });
  renderBooks(filtered);
}

// 6) Init on DOM ready
window.addEventListener("DOMContentLoaded", () => {
  titleEl.textContent = `what we reading today, ${name}?`;
  subEl.textContent   = "or starting a new book?";
  renderBooks(books);
  searchInput.addEventListener("input", handleSearch);
});
