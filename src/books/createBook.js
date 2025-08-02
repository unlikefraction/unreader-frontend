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

/**
 * Renders an editable book-detail panel.
 * Clears previous search results before rendering.
 */
export function createBookDetails({ imageUrl, title, authors, google_books_id, subtitle, publisher, published_date, language }) {
  // Assign values to module-scoped vars
  bookImageUrl = imageUrl;
  bookTitle = title;
  bookAuthors = authors;
  bookGoogleId = google_books_id;
  bookSubtitle = subtitle;
  bookPublisher = publisher;
  bookPublishedDate = published_date;
  bookLanguage = language;
  bookFileUrl = '';

  // Clear any existing results
  const displayDiv = document.querySelector('.displayGoogleBooks');
  displayDiv.innerHTML = '';

  // Container for details
  const detailsContainer = document.querySelector(".createBookDetails")

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

  // Button to display all current details
  const detailsBtn = document.createElement('button');
  detailsBtn.textContent = 'Show Details';
  detailsBtn.addEventListener('click', () => {
    printl(`Image URL: ${bookImageUrl}`);
    printl(`Title: ${bookTitle}`);
    printl(`Authors: ${bookAuthors}`);
    printl(`Google Books ID: ${bookGoogleId}`);
    printl(`Subtitle: ${bookSubtitle}`);
    printl(`Publisher: ${bookPublisher}`);
    printl(`Published Date: ${bookPublishedDate}`);
    printl(`Language: ${bookLanguage}`);
    printl(`Book File URL: ${bookFileUrl}`);
  });

  // Append all elements in order
  detailsContainer.appendChild(imgInput);
  detailsContainer.appendChild(imgPreview);
  detailsContainer.appendChild(titleInput);
  detailsContainer.appendChild(authorsEl);
  detailsContainer.appendChild(subtitleInput);
  detailsContainer.appendChild(publisherEl);
  detailsContainer.appendChild(publishedDateEl);
  detailsContainer.appendChild(languageEl);
  detailsContainer.appendChild(detailsBtn);

  displayDiv.appendChild(detailsContainer);
}
