// bookDetails.js

// === Utility ===
function getCookie(name) {
    const cookie = document.cookie
      .split('; ')
      .find(row => row.startsWith(name + '='));
    return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
  }
  
  // === Timezone Setup ===
  const userTimezoneOffset = new Date().getTimezoneOffset() * 60000; // in ms
  
  // === Fetch book details ===
  (async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const userBookId = urlParams.get('id');
    const token = getCookie("authToken");
  
    if (!userBookId || !token) {
      console.error("Missing userBookId or authToken");
      return;
    }
  
    try {
      const response = await fetch(`${window.API_URLS.BOOK}get-details/${userBookId}/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
  
      if (!response.ok) throw new Error(`Status: ${response.status}`);
      const book = await response.json();
  
      // === Set cover image ===
      const coverImg = document.querySelector('.book-image img');
      if (coverImg && book.cover_image_url) {
        coverImg.src = book.cover_image_url;
      }
  
      // === Set oath image ===
      const oathImg = document.querySelector('.oath');
      if (oathImg && book.oath) {
        const oath = book.oath.toLowerCase();
        if (["fire_oath", "whisper_oath", "blood_oath"].includes(oath)) {
          oathImg.src = `/assets/${oath.replace("_", "")}.png`;
        }
      }
  
      // === Progress bar setup ===
      const totalPages = book.pages.length;
      const analytics = book.pages_read_analytics || {};
      let lastPageRead = 0;
      Object.values(analytics).forEach(pages => {
        pages.forEach(p => {
          if (p > lastPageRead) lastPageRead = p;
        });
      });
  
      const percentageRead = Math.min(Math.round((lastPageRead / totalPages) * 100), 100);
      const filledBar = document.querySelector('.progressFilledBook');
      const percentText = document.querySelector('.percentRead');
      if (filledBar) filledBar.style.width = `${percentageRead}%`;
      if (percentText) percentText.textContent = `${percentageRead}%`;
  
      // === Start Date ===
      const startDate = new Date(book.book_started_at);
      const userStartDate = new Date(startDate.getTime() - userTimezoneOffset);
      const startDateText = document.querySelector('.startDateText');
      startDateText.textContent = userStartDate.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
  
      // === Dot logic ===
      const progressContainer = document.querySelector('.progressMarkings');
      progressContainer.innerHTML = ''; // clear existing dots
  
      const today = new Date(Date.now() - userTimezoneOffset);
      const dayMap = {};
  
      // Convert analytics keys to local dates
      Object.keys(analytics).forEach(utcDate => {
        const d = new Date(utcDate + "T00:00:00Z");
        const localDate = new Date(d.getTime() - userTimezoneOffset);
        const key = localDate.toISOString().split("T")[0];
        dayMap[key] = true;
      });
  
      const start = new Date(userStartDate);
      while (start <= today) {
        const dot = document.createElement("div");
        dot.classList.add("progressDot");
  
        const dateKey = start.toISOString().split("T")[0];
        const isToday = dateKey === today.toISOString().split("T")[0];
        const wasRead = dayMap[dateKey];
  
        if (isToday && wasRead) dot.classList.add("todayCompleted");
        else if (isToday) dot.classList.add("today");
        else if (wasRead) dot.classList.add("completed");
        // else leave it as regular dot
  
        progressContainer.appendChild(dot);
        start.setDate(start.getDate() + 1);
      }
  
      // === Title + Subtitle ===
      const titleElement = document.querySelector('.bookTitle');
      if (titleElement) {
        const main = book.title || '';
        const sub = book.subtitle || '';
        titleElement.innerHTML = sub ? `${main} : <span class="bookSubtitle">${sub}</span>` : main;
      }
  
      // === Author(s) ===
      const authorElement = document.querySelector('.bookAuthor');
      if (authorElement && Array.isArray(book.authors)) {
        authorElement.textContent = book.authors.join(', ');
      }

      // === Read Book Button Redirect ===
      const readBtn = document.querySelector('.readBook');
        if (readBtn) {
        readBtn.addEventListener('click', () => {
            window.location.href = `readBook.html?id=${userBookId}`;
        });
      }

  
      // === Thoughts ===
      const thoughtsInput = document.querySelector('.thoughtsInput');
      if (thoughtsInput) {
        thoughtsInput.value = book.thoughts || '';
      }
  
    } catch (err) {
      console.error("Error fetching book details:", err);
    }
  })();
  