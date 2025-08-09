// -------text-processor.js-------

/**
 * Text processing and word timing management
 */
export class TextProcessor {
  constructor(textFile, timingFile, offsetMs = 0) {
    this.textFile = textFile;
    this.timingFile = timingFile;
    this.offsetMs = offsetMs;
    this.wordTimings = null;
    this.wordSpans = [];
    this.referenceWords = 10; // Number of reference words for context matching

    // Stable, page-specific identifier from textFile (no collisions across pages)
    this.pageId = this.#slugify(textFile);
    this.container = null; // will be the <p class="mainContent" ...>
  }

  #slugify(s) {
    return String(s)
      .toLowerCase()
      .replace(/^[a-z]+:\/\/+/i, "")  // strip protocol if any
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "");
  }

  #ensureMainContent() {
    // Ensure there is a mainContainer
    let containerDiv = document.querySelector(".mainContainer");
    if (!containerDiv) {
      containerDiv = document.createElement("div");
      containerDiv.className = "mainContainer";
      document.body.appendChild(containerDiv);
      printl?.(`🔧 Created <div.mainContainer>`);
    }
  
    // Check if our page's <p> already exists
    let el = containerDiv.querySelector(
      `p.mainContent[data-page-id="${this.pageId}"]`
    );
  
    if (!el) {
      el = document.createElement("p");
      el.className = "mainContent";
      el.dataset.pageId = this.pageId;
      el.id = `mainContent-${this.pageId}`;
      containerDiv.appendChild(el);
      printl?.(`🔧 Created <p.mainContent> for pageId=${this.pageId} inside mainContainer`);
    }
  
    this.container = el;
  }  

  async separateText() {
    this.#ensureMainContent();

    const response = await fetch(this.textFile);
    const htmlContent = await response.text();

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlContent;

    // Clear only within this instance's container
    this.container.innerHTML = "";
    this.wordSpans = [];

    const paragraphs = tempDiv.querySelectorAll("p");

    paragraphs.forEach((paragraph, paragraphIndex) => {
      const paragraphText = paragraph.textContent.trim();

      if (paragraphText) {
        const words = paragraphText.split(/\s+/);

        words.forEach((word) => {
          if (word.trim()) {
            const span = document.createElement("span");
            span.className = "word";
            span.textContent = word;
            span.dataset.originalWord = word.toLowerCase().replace(/[^\w]/g, "");
            span.dataset.index = this.wordSpans.length;
            // keep everything scoped to this container
            this.container.appendChild(span);
            this.container.appendChild(document.createTextNode(" "));
            this.wordSpans.push(span);
          }
        });
      }

      if (paragraphIndex < paragraphs.length - 1) {
        this.container.appendChild(document.createElement("br"));
        this.container.appendChild(document.createElement("br"));
      }
    });

    printl?.(`📝 Total words in document: ${this.wordSpans.length}`);
    printl?.(`📄 Total paragraphs processed: ${paragraphs.length}`);
    printl?.(`⏱️ Offset applied: ${this.offsetMs}ms`);
  }

  async loadWordTimings() {
    const response = await fetch(this.timingFile);
    this.wordTimings = await response.json();
    printl?.(`🎵 Loaded ${this.wordTimings.length} word timings`);

    // Apply offset to all timings
    const offsetSeconds = this.offsetMs / 1000;
    this.wordTimings = this.wordTimings.map((timing) => ({
      ...timing,
      time_start: Math.max(0, timing.time_start + offsetSeconds),
      time_end: Math.max(0, timing.time_end + offsetSeconds),
    }));

    if (this.offsetMs !== 0) {
      printl?.(`🔧 Applied ${this.offsetMs}ms offset to all timings`);
    }
  }

  getAudioContext(timingIndex, contextSize = 10) {
    const context = [];
    const startIndex = Math.max(0, timingIndex - contextSize);
    const endIndex = Math.min(this.wordTimings.length - 1, timingIndex + contextSize);

    for (let i = startIndex; i <= endIndex; i++) {
      if (i !== timingIndex && this.wordTimings[i]) {
        context.push(this.wordTimings[i].word.toLowerCase().replace(/[^\w]/g, ""));
      }
    }
    return context;
  }

  getTextContext(spanIndex, contextSize = this.referenceWords) {
    const context = [];
    const startIndex = Math.max(0, spanIndex - contextSize);
    const endIndex = Math.min(this.wordSpans.length - 1, spanIndex + contextSize);

    for (let i = startIndex; i <= endIndex; i++) {
      if (
        i !== spanIndex &&
        this.wordSpans[i] &&
        this.wordSpans[i].dataset.originalWord
      ) {
        context.push(this.wordSpans[i].dataset.originalWord);
      }
    }
    return context;
  }

  calculateContextSimilarity(audioContext, textContext) {
    if (audioContext.length === 0 && textContext.length === 0) return 1.0;
    if (audioContext.length === 0 || textContext.length === 0) return 0.0;

    let matchCount = 0;
    const totalWords = Math.max(audioContext.length, textContext.length);

    audioContext.forEach((audioWord) => {
      if (textContext.includes(audioWord)) {
        matchCount++;
      }
    });

    const positionalMatches = Math.min(audioContext.length, textContext.length);
    let positionalMatchCount = 0;

    for (let i = 0; i < positionalMatches; i++) {
      if (audioContext[i] === textContext[i]) {
        positionalMatchCount++;
      }
    }

    const generalScore = matchCount / totalWords;
    const positionalScore = positionalMatchCount / positionalMatches;

    return generalScore * 0.6 + positionalScore * 0.4;
  }

  findBestWordMatch(targetWord, timingIndex, searchCenter = null, lastHighlightedIndex = 0) {
    const cleanTarget = targetWord.toLowerCase().replace(/[^\w]/g, "");

    const centerIndex = searchCenter !== null ? searchCenter : lastHighlightedIndex;

    const searchStart = Math.max(0, centerIndex - this.referenceWords);
    const searchEnd = Math.min(this.wordSpans.length, centerIndex + this.referenceWords + 1);

    const audioContext = this.getAudioContext(timingIndex);

    let bestMatch = { index: -1, probability: 0, wordScore: 0, contextScore: 0 };

    for (let i = searchStart; i < searchEnd; i++) {
      const span = this.wordSpans[i];
      if (span && span.dataset.originalWord) {
        const wordScore = cleanTarget === span.dataset.originalWord ? 1.0 : 0.0;

        const textContext = this.getTextContext(i);
        const contextScore = this.calculateContextSimilarity(audioContext, textContext);

        const totalProbability = wordScore * 0.4 + contextScore * 0.6;

        if (totalProbability > bestMatch.probability) {
          bestMatch = {
            index: i,
            probability: totalProbability,
            wordScore,
            contextScore,
          };
        }
      }
    }

    const threshold = bestMatch.wordScore === 1.0 ? 0.2 : 0.3;
    return bestMatch.probability > threshold ? bestMatch : { index: -1, probability: 0 };
  }

  async init() {
    await this.separateText();
    await this.loadWordTimings();
  }
}
