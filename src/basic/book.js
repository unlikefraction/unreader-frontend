let editTitleIcon = document.querySelector(".editTitle");
let bookTitle      = document.querySelector(".bookTitle");

editTitleIcon.addEventListener("click", () => {
  // Unlock the input and focus it
  bookTitle.readOnly = false;
  bookTitle.focus();

  // Move caret to the end of the current text
  const len = bookTitle.value.length;
  bookTitle.setSelectionRange(len, len);

  // Hide pencil icon while editing
  editTitleIcon.classList.add("hidden");
});

bookTitle.addEventListener("blur", () => {
  // Lock it back down and show the pencil again
  bookTitle.readOnly = true;
  editTitleIcon.classList.remove("hidden");
});

bookTitle.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    bookTitle.blur();  // trigger blur handler
  }
});
