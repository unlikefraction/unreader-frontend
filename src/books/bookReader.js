import { AudioSystem } from "./audioAndTextGen.js";

const pages = [
  {
    audio: '/audio/suckAtReading.wav',
    timing: '/order/word_timings_ordered.json',
    text: '/transcript/landing.html',
    offset: -100
  },
  {
    audio: '/audio/suckAtReading.wav',
    timing: '/order/word_timings_ordered.json',
    text: '/transcript/landing.html',
    offset: -100
  },
  // ...
];
  
window.pageSystems = [];

const root = document.querySelector('.bookContainer'); // some container div

(async () => {
    for (let index = 0; index < pages.length; index++) {
      const page = pages[index];
  
      const pageDiv = document.createElement('div');
      pageDiv.className = 'audioPage';
      pageDiv.id = `page-${index}`;
      pageDiv.innerHTML = `<div class="mainContent"></div>`;
      root.appendChild(pageDiv);
  
      const system = new AudioSystem(
        page.audio,
        page.timing,
        page.text,
        page.offset || 0,
        pageDiv
      );
  
      await system.init(); // now this actually waits!
      window.pageSystems.push(system);
    }
  })();
  