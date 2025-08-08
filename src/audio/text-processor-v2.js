// text-processor.js

/**
 * Text processing and word timing management
 */
export class TextProcessor {
    /**
     * @param {string} textFile     URL to your HTML transcript
     * @param {string} timingFile   URL to your word timings JSON
     * @param {number} offsetMs     Sync offset in milliseconds
     * @param {HTMLElement} mainContentEl  The <div class="mainContent"> for this page
     */
    constructor(textFile, timingFile, offsetMs = 0, mainContentEl = null) {
      this.textFile      = textFile;
      this.timingFile    = timingFile;
      this.offsetMs      = offsetMs;
      this.mainContentEl = mainContentEl;
      this.wordTimings   = null;
      this.wordSpans     = [];
      this.referenceWords = 10; // context window size
    }
  
    /**
     * Fetch the transcript HTML, split into <span class="word">s,
     * and inject only into this.mainContentEl.
     */
    async separateText() {
      if (!this.mainContentEl) {
        throw new Error('TextProcessor: no container element provided');
      }
  
      // 1) Load the raw HTML
      const resp = await fetch(this.textFile);
      const htmlContent = await resp.text();
  
      // 2) Parse it in a temp container
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContent;
  
      // 3) Scope to our page’s container
      const mainContent = this.mainContentEl;
      mainContent.innerHTML = '';
      this.wordSpans = [];
  
      // 4) Turn every <p> into a stream of <span class="word">
      const paragraphs = tempDiv.querySelectorAll('p');
      paragraphs.forEach((p, pi) => {
        const txt = p.textContent.trim();
        if (txt) {
          txt.split(/\s+/).forEach(word => {
            const span = document.createElement('span');
            span.className = 'word';
            span.textContent = word;
            span.dataset.originalWord = word
              .toLowerCase()
              .replace(/[^\w]/g, '');
            span.dataset.index = this.wordSpans.length;
            mainContent.appendChild(span);
            mainContent.appendChild(document.createTextNode(' '));
            this.wordSpans.push(span);
          });
        }
        // Add paragraph breaks
        if (pi < paragraphs.length - 1) {
          mainContent.appendChild(document.createElement('br'));
          mainContent.appendChild(document.createElement('br'));
        }
      });
  
      printl(`📝 Words: ${this.wordSpans.length}`);
      printl(`📄 Paragraphs: ${paragraphs.length}`);
      printl(`⏱ Offset: ${this.offsetMs}ms`);
    }
  
    /**
     * Fetch and store your word timings JSON,
     * applying the ms offset to each timing.
     */
    async loadWordTimings() {
      const resp = await fetch(this.timingFile);
      this.wordTimings = await resp.json();
  
      const offsetSec = this.offsetMs / 1000;
      this.wordTimings = this.wordTimings.map(t => ({
        ...t,
        time_start: Math.max(0, t.time_start + offsetSec),
        time_end:   Math.max(0, t.time_end + offsetSec),
      }));
  
      printl(`🎵 Loaded ${this.wordTimings.length} timings`);
      if (this.offsetMs !== 0) {
        printl(`🔧 Applied ${this.offsetMs}ms offset`);
      }
    }
  
    // [all your existing context, similarity, matching methods remain unchanged]
  
    /**
     * Kick everything off: split the text, then load timings.
     */
    async init() {
      if (!this.mainContentEl) {
        throw new Error('Cannot init TextProcessor without a container element');
      }
      await this.separateText();
      await this.loadWordTimings();
      // no stray innerHTML assignment here!
    }
  }
  