// audioSystemManager.js

import { AudioSystem } from "./audioAndTextGen.js";

export class AudioSystemManager {
  constructor(pages) {
    this.pages = pages; // [{ audio, timing, text }]
    this.instances = new Map(); // cache, optional
    this.currentIndex = null;
    this.currentInstance = null;
  }

  async load(index) {
    if (this.currentIndex === index) return this.currentInstance;

    // Destroy current instance
    if (this.currentInstance) {
      this.currentInstance.destroy();
      document.querySelector('.bookContainer').innerHTML = ''; // wipe DOM
    }

    const page = this.pages[index];
    if (!page) throw new Error(`No page at index ${index}`);

    const system = new AudioSystem(
      page.audio,
      page.timing,
      page.text,
      page.offset || 0,
    );

    await system.init();
    this.instances.set(index, system);
    this.currentInstance = system;
    this.currentIndex = index;

    window.audioSystem = system; // re-bind for global utils
    return system;
  }

  async next() {
    return await this.load(this.currentIndex + 1);
  }

  async prev() {
    return await this.load(this.currentIndex - 1);
  }

  destroyAll() {
    this.instances.forEach(i => i.destroy());
    this.instances.clear();
    this.currentInstance = null;
    this.currentIndex = null;
  }
}
