// upload.js

// 1) Live-exported variable to hold the last uploaded URL
export let uploadedBookUrl = '';

// 2) Helper to read your auth cookie
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
}

// 3) Now initEpubUploader takes two args:
//     selector: your file-input CSS selector
//     onUpload:  callback(url:string) ⇒ void
export function initEpubUploader(selector = '.epubUploader', onUpload = () => {}) {
  const epubUploader = document.querySelector(selector);
  if (!epubUploader) {
    printError(`initEpubUploader: no element found for selector "${selector}"`);
    return;
  }

  epubUploader.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const token = getCookie('authToken');
    const url   = `${window.API_URLS.BOOK}assets/upload/`;
    const form  = new FormData();
    form.append('book_file', file);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!resp.ok) {
        const err = await resp.json();
        printError('Upload failed:', err);
        alert(`Upload failed: ${resp.status}`);
        return;
      }

      const data = await resp.json();
      uploadedBookUrl = data.files[file.name];
      
      // print the URL in one go (printl usually takes a single string)
      printl(`File uploaded successfully: ${uploadedBookUrl}`);

      // 🔥 fire your consumer callback
      onUpload(uploadedBookUrl);

    } catch (err) {
      printError('Something went wrong:', err);
      alert('An unexpected error occurred while uploading. Please try again later');
    }
  });
}
