// googleBook.js

import { createBookDetails } from './createBook.js';

// Select the input and display container
const searchInput = document.querySelector('.searchBook');
const displayDiv = document.querySelector('.displayGoogleBooks');

// Debounce utility to limit API calls
function debounce(fn, delay) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Listen for user input
searchInput.addEventListener('input', debounce(handleSearch, 300));

// Fetch list of books matching query
async function handleSearch(e) {
  const query = e.target.value.trim();
  if (!query) {
    displayDiv.innerHTML = '';
    return;
  }
  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    renderBooks(data.items || []);
  } catch (error) {
    printError(error);
  }
}

// Render clickable book items
function renderBooks(books) {
  displayDiv.innerHTML = '';
  books.forEach(book => {
    const { id, volumeInfo } = book;
    const thumbnail = volumeInfo.imageLinks?.thumbnail || '';
    const title = volumeInfo.title || 'No title';
    const authorsList = volumeInfo.authors || [];
    const authors = authorsList
      .map(name => name.replace(/\|/g, ''))
      .join('|') || 'Unknown author';

    const bookItem = document.createElement('div');
    bookItem.className = 'bookItem';
    bookItem.innerHTML = `
      <img src="${thumbnail}" alt="${title}" />
      <div>
        <h3>${title}</h3>
        <p>${authors}</p>
      </div>
    `;
    bookItem.addEventListener('click', () => selectBook(id));
    displayDiv.appendChild(bookItem);
  });
}

// Fetch detailed info and delegate to details renderer
async function selectBook(id) {
  try {
    // Clear list
    displayDiv.innerHTML = '';

    const response = await fetch(`https://www.googleapis.com/books/v1/volumes/${id}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    const info = data.volumeInfo;

    // Choose highest-resolution image available
    const imageLinks = info.imageLinks || {};
    const sizePriority = ['extraLarge','large','medium','small','thumbnail','smallThumbnail'];
    let imageUrl = '';
    for (const size of sizePriority) {
      if (imageLinks[size]) {
        imageUrl = imageLinks[size];
        break;
      }
    }

    // Prepare details
    const details = {
      imageUrl,
      title: info.title || '',
      authors: (info.authors || []).map(name => name.replace(/\|/g, '')).join('|'),
      google_books_id: data.id,
      subtitle: info.subtitle || '',
      publisher: info.publisher || '',
      published_date: info.publishedDate || '',
      language: info.language || ''
    };

    // Render the details view
    createBookDetails(details);
  } catch (error) {
    printError(error);
  }
}

// Expose functions if needed
export { handleSearch, renderBooks, selectBook };
