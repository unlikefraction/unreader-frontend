import { createBookDetails } from './createBook.js';

// Helper to get a cookie value by name (for auth token)
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

// Select the input and display container
const searchInput = document.querySelector('.searchBook');
const displayDiv = document.querySelector('.displayGoogleBooks');

// Default placeholder when no thumbnail available
const DEFAULT_THUMBNAIL = 'http://books.google.com/books/publisher/content?id=ZnagEAAAQBAJ&printsec=frontcover&img=1&zoom=6&edge=curl&imgtk=AFLRE71g5POqHZsChCSic-kFONPKY0Fv8-KLJsa7IsVEb7LSWaqpcbrQALrbDPLJrLvEdLyws2eC2iaGu8s7fwxR_fI0UwjmIiW4vX-E9HiiQBRbd4DuytLib1rs4pd5ng42FPdv9BdH&source=gbs_api';

let lastResults = [];

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
    lastResults = [];
    return;
  }
  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    lastResults = data.items || [];
    renderBooks(lastResults);
  } catch (error) {
    printError('Google Books API error:', error);
  }
}

// Render clickable book items
function renderBooks(books) {
  displayDiv.innerHTML = '';
  books.forEach(book => {
    const { volumeInfo } = book;
    const thumbnail = volumeInfo.imageLinks?.thumbnail || DEFAULT_THUMBNAIL;
    const title = volumeInfo.title || 'No title';
    const authors = (volumeInfo.authors || [])
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
    bookItem.addEventListener('click', () => selectBook(book));
    displayDiv.appendChild(bookItem);
  });
}

// When a user selects a book, check if it already exists, then render details
async function selectBook(book) {
  // Clear list
  displayDiv.innerHTML = '';

  const info = book.volumeInfo;
  let details = {
    imageUrl: info.imageLinks?.thumbnail || DEFAULT_THUMBNAIL,
    title: info.title || '',
    authors: (info.authors || []).map(name => name.replace(/\|/g, '')).join('|'),
    google_books_id: book.id,
    subtitle: info.subtitle || '',
    publisher: info.publisher || '',
    published_date: info.publishedDate || '',
    language: info.language || ''
  };

  // Check if the book already exists in our system
  const token = getCookie('authToken');
  if (token) {
    try {
      const res = await fetch(`${window.API_URLS.BOOK}check/${book.id}/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const json = await res.json();
        if (json.exists) {
          // Override fields with existing data
          details = {
            ...details,
            title: json.title || details.title,
            subtitle: json.subtitle || details.subtitle,
            authors: Array.isArray(json.authors) ? json.authors.join('|') : details.authors,
            imageUrl: json.cover_image_url || details.imageUrl,
            language: json.language || details.language
          };
        }
      } else {
        printError(`Check API returned status ${res.status}`);
      }
    } catch (error) {
      printError('Error checking book existence:', error);
    }
  } else {
    printError('Auth token missing; skipping existence check');
  }

  // Render the details view
  createBookDetails(details);
}

// Expose functions if needed
export { handleSearch, renderBooks, selectBook };
