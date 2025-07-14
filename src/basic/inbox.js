document.addEventListener('DOMContentLoaded', () => {
    const inboxIcon   = document.querySelector('.inbox');
    const inboxPopup  = document.querySelector('.inboxPopup');
  
    // Toggle on icon click
    inboxIcon.addEventListener('click', (e) => {
      e.stopPropagation();  // prevent the document handler from immediately closing it
      inboxPopup.classList.toggle('visible');
      inboxIcon.classList.toggle('active');
    });
  
    // Close when clicking anywhere else
    document.addEventListener('click', (e) => {
      // if the click’s target isn’t the icon or inside the popup…
      if (!inboxIcon.contains(e.target) && !inboxPopup.contains(e.target)) {
        inboxPopup.classList.remove('visible');
        inboxIcon.classList.remove('active');
      }
    });
  });
  