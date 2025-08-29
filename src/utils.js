// Toggle this to true/false to enable/disable debug logs
let debugging = true;

function setDebugging(val) {
    debugging = val;
}

function printl(message) {
    if (debugging) {
        console.log(message);
    }
}

function printError(message) {
    if (debugging) {
        console.error(message);
    }
}

function unskelton() {
    const elements = document.querySelectorAll(
      ".skeleton-hide, .skeleton-margin-top, .skeleton-ui"
    );
  
    elements.forEach(el => {
      el.classList.remove("skeleton-hide", "skeleton-margin-top", "skeleton-ui");
    });
}