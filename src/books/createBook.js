import { initEpubUploader } from './upload.js';

// Variables to store book details
let bookImageUrl = '';
let bookTitle = '';
let bookAuthors = '';
let bookGoogleId = '';
let bookSubtitle = '';
let bookPublisher = '';
let bookPublishedDate = '';
let bookLanguage = '';
let bookFileUrl = ''; // will be set later

// Initialize the EPUB uploader on page load
initEpubUploader('.epubUploader', (url) => {
  bookFileUrl = url;
});

/**
 * Helper to get a cookie value by name
 */
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

/**
 * Renders an editable book-detail panel and handles book creation.
 * Clears previous search results before rendering.
 */
export function createBookDetails({ imageUrl, title, authors, google_books_id, subtitle, publisher, published_date, language }) {
  // Assign values to module-scoped vars
  bookImageUrl = imageUrl;
  bookTitle = title;
  bookAuthors = authors;
  bookGoogleId = google_books_id;
  bookSubtitle = subtitle || '';
  bookPublisher = publisher || '';
  bookPublishedDate = published_date || '';
  bookLanguage = language || 'en';

  // Clear any existing results
  const displayDiv = document.querySelector('.displayGoogleBooks');
  displayDiv.innerHTML = '';

  // Container for details
  const detailsContainer = document.querySelector('.createBookDetails');
  detailsContainer.innerHTML = '';

  // Editable image URL input and preview
  const imgInput = document.createElement('input');
  imgInput.type = 'text';
  imgInput.value = bookImageUrl;
  imgInput.className = 'bookImageUrlInput';
  imgInput.addEventListener('input', (e) => {
    bookImageUrl = e.target.value;
    imgPreview.src = bookImageUrl;
  });

  const imgPreview = document.createElement('img');
  imgPreview.src = bookImageUrl;
  imgPreview.alt = bookTitle;
  imgPreview.className = 'bookImagePreview';

  // Editable title
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.value = bookTitle;
  titleInput.className = 'bookTitleInput';
  titleInput.addEventListener('input', (e) => {
    bookTitle = e.target.value;
  });

  // Authors (non-editable)
  const authorsEl = document.createElement('p');
  authorsEl.textContent = bookAuthors;
  authorsEl.className = 'bookAuthors';

  // Editable subtitle
  const subtitleInput = document.createElement('input');
  subtitleInput.type = 'text';
  subtitleInput.value = bookSubtitle;
  subtitleInput.className = 'bookSubtitleInput';
  subtitleInput.addEventListener('input', (e) => {
    bookSubtitle = e.target.value;
  });

  // Publisher (non-editable)
  const publisherEl = document.createElement('p');
  publisherEl.textContent = bookPublisher;
  publisherEl.className = 'bookPublisher';

  // Published date (non-editable)
  const publishedDateEl = document.createElement('p');
  publishedDateEl.textContent = bookPublishedDate;
  publishedDateEl.className = 'bookPublishedDate';

  // Language (non-editable)
  const languageEl = document.createElement('p');
  languageEl.textContent = bookLanguage;
  languageEl.className = 'bookLanguage';

  // Oath selection dropdown
  const oathLabel = document.createElement('label');
  oathLabel.textContent = 'Choose an oath (credits will be deducted): ';
  oathLabel.htmlFor = 'oathSelect';

  const oathSelect = document.createElement('select');
  oathSelect.id = 'oathSelect';
  oathSelect.className = 'bookOathSelect';
  ['whisper_oath', 'fire_oath', 'blood_oath'].forEach((oath) => {
    const option = document.createElement('option');
    option.value = oath;
    // Humanize option text
    option.textContent = oath.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    oathSelect.appendChild(option);
  });

  // Create Book button
  const createBtn = document.createElement('button');
  createBtn.textContent = 'Create Book';
  createBtn.addEventListener('click', async () => {
    if (!bookTitle || !bookAuthors || !bookFileUrl) {
      alert('Title, authors, and EPUB file are required.');
      return;
    }

    const token = getCookie('authToken');
    if (!token) {
      alert('Authentication token missing. Please log in.');
      return;
    }

    const payload = {
      title: bookTitle,
      authors: bookAuthors,
      google_books_id: bookGoogleId,
      book_file_url: bookFileUrl,
      oath: oathSelect.value,
      subtitle: bookSubtitle,
      cover_image_url: bookImageUrl,
      publisher: bookPublisher,
      published_date: bookPublishedDate,
      isbns: '',
      language: bookLanguage
    };

    try {
      const res = await fetch(`${window.API_URLS.BOOK}create/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = `/bookDetails.html?id=${data.book_id}`;
        printl(`Book ${data.created ? 'created' : 'already exists'} with ID ${data.book_id}`);
      } else {
        printError('Create Book Error:', data);
        alert(`Error creating book: ${data.detail || res.statusText}`);
      }
    } catch (err) {
      printError(err);
      alert('Network error while creating book.');
    }
  });

  // Append all elements
  detailsContainer.appendChild(imgInput);
  detailsContainer.appendChild(imgPreview);
  detailsContainer.appendChild(titleInput);
  detailsContainer.appendChild(authorsEl);
  detailsContainer.appendChild(subtitleInput);
  detailsContainer.appendChild(publisherEl);
  detailsContainer.appendChild(publishedDateEl);
  detailsContainer.appendChild(languageEl);
  detailsContainer.appendChild(oathLabel);
  detailsContainer.appendChild(oathSelect);
  detailsContainer.appendChild(createBtn);

  displayDiv.appendChild(detailsContainer);
}
