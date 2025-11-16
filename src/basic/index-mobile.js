import rough from 'roughjs';
import { BOOKS } from './book-machine.js';

const FALLBACK_ACCENT = '#373737';
const BOOK_WIDTH_WITH_PADDING = 180;
const STACK_MACHINE_GAP = 14;
const STACK_LAYER_PADDING = 18;
const STACK_SKEW_OFFSET = 6;
const MOTION = {
  durationMs: 950,
  staggerMs: 160,
  holdMs: 900,
  easing: 'cubic-bezier(.57,.1,.47,1)',
  fadeDurationMs: 380,
  fadeEasing: 'ease-in-out',
};
const LETTER_ANIMATION_CLASSES = [
  'squeeze-anim-stretch',
  'squeeze-anim-tilt',
  'squeeze-anim-bounce',
  'squeeze-anim-wave',
  'squeeze-anim-pop',
];

let todoShapeResizeTimer = null;
const slotPositions = [];
const delayTimers = new Set();
const waitTimers = new Map();
let heroStackRef = null;
let machineRef = null;
let cardQueue = [];
let cancelCycle = false;
let loopPromise = null;
let relayoutQueue = Promise.resolve();

function waitForImage(img) {
  if (!img) return Promise.resolve();
  if (img.complete) return Promise.resolve();
  return new Promise(resolve => {
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
  });
}

function waitForWindowLoad() {
  if (document.readyState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    window.addEventListener('load', resolve, { once: true });
  });
}

function createBookCard({ title, cover, accent }) {
  const item = document.createElement('div');
  item.className = 'book-items index-book';
  item.dataset.accent = accent || FALLBACK_ACCENT;

  const mainWrap = document.createElement('div');
  mainWrap.className = 'main-book-wrap';
  mainWrap.title = title;

  const bookCover = document.createElement('div');
  bookCover.className = 'book-cover';

  const bookInside = document.createElement('div');
  bookInside.className = 'book-inside';

  const bookImage = document.createElement('div');
  bookImage.className = 'book-image img-hidden';
  if (accent) {
    bookImage.style.background = accent;
  }

  const img = document.createElement('img');
  img.src = cover;
  img.alt = `Cover of ${title}`;
  img.loading = 'lazy';

  const effect = document.createElement('div');
  effect.className = 'effect';

  const light = document.createElement('div');
  light.className = 'light';

  bookImage.append(img, effect, light);
  bookCover.append(bookInside, bookImage);
  mainWrap.append(bookCover);
  item.appendChild(mainWrap);

  if (img.complete) {
    bookImage.classList.remove('img-hidden');
  } else {
    img.addEventListener(
      'load',
      () => {
        bookImage.classList.remove('img-hidden');
      },
      { once: true }
    );
    img.addEventListener(
      'error',
      () => {
        bookImage.classList.remove('img-hidden');
      },
      { once: true }
    );
  }

  return item;
}

function placeCardInstant(card, position) {
  if (!position) return;
  card.style.transition = 'none';
  card.style.left = `${position.left}px`;
  card.style.top = `${position.top}px`;
  void card.offsetWidth;
  card.style.transition = '';
  card.classList.add('book-ready');
}

function scheduleCardMove(card, position, delay = 0) {
  if (!position) return 0;
  const kickoff = () => {
    if (cancelCycle) return;
    card.style.transition = `left ${MOTION.durationMs}ms ${MOTION.easing}, top ${MOTION.durationMs}ms ${MOTION.easing}, opacity ${MOTION.fadeDurationMs}ms ${MOTION.fadeEasing}`;
    card.style.left = `${position.left}px`;
    card.style.top = `${position.top}px`;
  };

  if (delay <= 0) {
    kickoff();
    return MOTION.durationMs;
  }

  const timer = setTimeout(() => {
    delayTimers.delete(timer);
    kickoff();
  }, delay);
  delayTimers.add(timer);
  return delay + MOTION.durationMs;
}

function wait(ms) {
  if (ms <= 0 || cancelCycle) return Promise.resolve();
  return new Promise(resolve => {
    if (cancelCycle) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      waitTimers.delete(timer);
      resolve();
    }, ms);
    waitTimers.set(timer, resolve);
  });
}

function clearTimers() {
  delayTimers.forEach(timer => clearTimeout(timer));
  delayTimers.clear();
  waitTimers.forEach((resolve, timer) => {
    clearTimeout(timer);
    resolve();
  });
  waitTimers.clear();
}

function teleportCard(card, position) {
  if (!position) return;
  card.classList.add('book-hidden');
  card.style.transition = 'none';
  card.style.left = `${position.left}px`;
  card.style.top = `${position.top}px`;
  void card.offsetWidth;
  card.style.transition = '';
  requestAnimationFrame(() => {
    card.classList.remove('book-hidden');
  });
}

function layoutBooks() {
  if (!heroStackRef || !machineRef || cardQueue.length === 0) return;
  const stackRect = heroStackRef.getBoundingClientRect();
  const machineRect = machineRef.getBoundingClientRect();
  const stackCenterX = machineRect.left - stackRect.left + machineRect.width / 2;
  const machineTop = machineRect.top - stackRect.top;
  const baseBottom = machineTop - STACK_MACHINE_GAP;
  let currentBottom = baseBottom;

  slotPositions.length = cardQueue.length;
  cardQueue.forEach((card, idx) => {
    const width = card.offsetWidth || BOOK_WIDTH_WITH_PADDING;
    const height = card.offsetHeight || width * 1.32;
    const top = currentBottom - height;
    const jitter = (idx % 2 === 0 ? -STACK_SKEW_OFFSET : STACK_SKEW_OFFSET) * Math.min(1, idx / 3);
    const left = stackCenterX - width / 2 + jitter;
    slotPositions[idx] = { left, top };
    placeCardInstant(card, slotPositions[idx]);
    currentBottom = top - STACK_LAYER_PADDING;
  });
}

async function performCycle() {
  if (cancelCycle || cardQueue.length === 0) return;
  const stackRect = heroStackRef.getBoundingClientRect();
  const machineRect = machineRef.getBoundingClientRect();

  const active = cardQueue[0];
  const trailing = cardQueue.slice(1);
  const cardWidth = active.offsetWidth || BOOK_WIDTH_WITH_PADDING;
  const cardHeight = active.offsetHeight || cardWidth * 1.32;
  const centerX = machineRect.left - stackRect.left + machineRect.width / 2;
  const dropTop =
    machineRect.top -
    stackRect.top +
    machineRect.height / 2 -
    cardHeight / 2;
  const underMachine = {
    left: centerX - cardWidth / 2,
    top: dropTop,
  };

  scheduleCardMove(active, underMachine);
  trailing.forEach((card, idx) => {
    const slot = slotPositions[idx];
    const delay = idx * MOTION.staggerMs;
    scheduleCardMove(card, slot, delay);
  });

  const trailingDelay = trailing.length > 0 ? (trailing.length - 1) * MOTION.staggerMs : 0;
  await wait(MOTION.durationMs + trailingDelay);
  if (cancelCycle) return;

  announceAccent(active.dataset.accent || FALLBACK_ACCENT);

  active.classList.add('book-disappear');
  await wait(MOTION.holdMs);
  active.classList.remove('book-disappear');
  if (cancelCycle) return;

  const tailSlot = slotPositions[slotPositions.length - 1];
  teleportCard(active, tailSlot);
  cardQueue.push(cardQueue.shift());
}

async function runLoop() {
  while (!cancelCycle && cardQueue.length > 0) {
    await performCycle();
  }
  loopPromise = null;
}

function startLoop() {
  if (cardQueue.length <= 0 || loopPromise) return;
  cancelCycle = false;
  loopPromise = runLoop();
}

function stopLoop() {
  cancelCycle = true;
  clearTimers();
  const current = loopPromise;
  loopPromise = null;
  return current;
}

function queueRelayout() {
  relayoutQueue = relayoutQueue.then(async () => {
    if (!heroStackRef || !machineRef || cardQueue.length === 0) return;
    const previous = stopLoop();
    if (previous) {
      try {
        await previous;
      } catch {
        // ignore interruption
      }
    }
    layoutBooks();
    startLoop();
  });
}

function setupMobileBookStack() {
  heroStackRef = document.querySelector('.mobile-hero-stack');
  machineRef = document.querySelector('.mobile-hero-machine');
  if (!heroStackRef || !machineRef) return;

  const cards = BOOKS.map(createBookCard);
  cards.forEach(card => heroStackRef.appendChild(card));
  cardQueue = [...cards];

  const machineImg = machineRef.querySelector('img');
  const cardImagePromises = cards.map(card => waitForImage(card.querySelector('img')));
  const loadPromises = [waitForWindowLoad(), ...cardImagePromises];
  if (machineImg) {
    loadPromises.push(waitForImage(machineImg));
  }

  Promise.all(loadPromises).then(() => {
    queueRelayout();
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      queueRelayout();
    }, 140);
  });
  window.addEventListener('orientationchange', () => queueRelayout());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopLoop();
    } else if (!loopPromise) {
      startLoop();
    }
  });
}

function drawTodoShapes() {
  const rects = document.querySelectorAll('.index-todo-rect');
  rects.forEach(rect => {
    const svg = rect.querySelector('.index-todo-rough');
    if (!svg) return;
    const width = Math.round(rect.clientWidth);
    const height = Math.round(rect.clientHeight);
    if (!width || !height) return;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.innerHTML = '';
    const rc = rough.svg(svg);
    const inset = Math.max(6, Math.min(width, height) * 0.12);
    const innerWidth = Math.max(2, width - inset * 2);
    const innerHeight = Math.max(2, height - inset * 2);
    const scribbleColor = '#373737';
    const fillRect = rc.rectangle(inset, inset, innerWidth, innerHeight, {
      fill: scribbleColor,
      fillStyle: 'hachure',
      fillWeight: 1.1,
      hachureAngle: 120,
      hachureGap: 8,
      stroke: 'none',
      roughness: 2,
    });
    fillRect.classList.add('index-todo-rough-fill');
    const outlineRect = rc.rectangle(
      inset * 0.55,
      inset * 0.55,
      Math.max(2, width - inset * 1.1),
      Math.max(2, height - inset * 1.1),
      {
        stroke: scribbleColor,
        strokeWidth: 2.2,
        roughness: 1.3,
      }
    );
    outlineRect.classList.add('index-todo-rough-outline');
    svg.append(fillRect, outlineRect);
  });

  const STRIKE_HEIGHT = 22;
  document.querySelectorAll('.index-todo-item').forEach(item => {
    const svg = item.querySelector('.index-todo-strike');
    const textSpan = item.querySelector('.index-todo-text span');
    if (!svg || !textSpan) return;
    const width = Math.round(textSpan.getBoundingClientRect().width);
    if (!width) return;
    svg.setAttribute('viewBox', `0 0 ${width} ${STRIKE_HEIGHT}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', STRIKE_HEIGHT);
    svg.innerHTML = '';
    const rc = rough.svg(svg);
    const mid = STRIKE_HEIGHT / 2;
    const clampX = val => Math.max(4, Math.min(val, width - 4));
    const points = [
      [clampX(4), mid - 2],
      [clampX(width * 0.3), mid + 2],
      [clampX(width * 0.6), mid - 1],
      [clampX(width - 6), mid + 1],
    ];
    const strikePath = rc.curve(points, {
      stroke: '#373737',
      strokeWidth: 3,
      roughness: 1.6,
    });
    strikePath.classList.add('index-todo-strike-path');
    svg.append(strikePath);
  });
}

function scheduleTodoShapeDraw(immediate = false) {
  if (immediate) {
    drawTodoShapes();
    return;
  }
  clearTimeout(todoShapeResizeTimer);
  todoShapeResizeTimer = setTimeout(drawTodoShapes, 140);
}

function setupTodoScrollSection() {
  const section = document.querySelector('.index-todo-section');
  if (!section) return;
  const items = Array.from(section.querySelectorAll('.index-todo-item'));
  if (!items.length) return;

  let hasCompleted = false;
  const firstItem = items[0];

  const startCheckSequence = () => {
    if (hasCompleted) return;
    hasCompleted = true;
    detach();
    section.classList.add('todos-checked');
    items.forEach((item, idx) => {
      setTimeout(() => {
        item.classList.add('checked');
      }, idx * 550);
    });
  };

  const reachedMidpoint = () => {
    if (!firstItem) return false;
    const rect = firstItem.getBoundingClientRect();
    const todoMid = rect.top + rect.height / 2;
    return todoMid <= window.innerHeight / 2;
  };

  const maybeStartChecks = () => {
    if (hasCompleted) return;
    if (reachedMidpoint()) {
      startCheckSequence();
    }
  };

  const detach = () => {
    window.removeEventListener('scroll', maybeStartChecks);
    window.removeEventListener('resize', maybeStartChecks);
  };

  window.addEventListener('scroll', maybeStartChecks, { passive: true });
  window.addEventListener('resize', maybeStartChecks);
  section.classList.add('todos-visible');
  maybeStartChecks();
}

function setupSqueezeWord() {
  const squeezeEl = document.querySelector('.squeeze-word');
  if (!squeezeEl) return;
  const word = squeezeEl.dataset.word || squeezeEl.textContent?.trim();
  if (!word) return;
  squeezeEl.setAttribute('aria-label', word);
  squeezeEl.textContent = '';

  const lettersWrap = document.createElement('span');
  lettersWrap.className = 'squeeze-word__letters';
  [...word].forEach((char, idx) => {
    const letter = document.createElement('span');
    letter.className = 'squeeze-letter';
    letter.textContent = char;
    letter.style.setProperty('--squeeze-letter-index', idx);
    letter.style.setProperty('--squeeze-letter-tilt', `${(idx + 1) * 2}deg`);
    lettersWrap.appendChild(letter);
  });

  const overlay = document.createElement('span');
  overlay.className = 'squeeze-word__overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.textContent = word;

  squeezeEl.append(lettersWrap, overlay);

  const trigger = (color = FALLBACK_ACCENT) => {
    squeezeEl.style.setProperty('--squeeze-color', color);
    squeezeEl.classList.remove('squeeze-word--wiping', ...LETTER_ANIMATION_CLASSES);
    void squeezeEl.offsetWidth;
    const randomClass = LETTER_ANIMATION_CLASSES[Math.floor(Math.random() * LETTER_ANIMATION_CLASSES.length)];
    squeezeEl.classList.add('squeeze-word--wiping', randomClass);
  };

  document.addEventListener('mobileBookAccent', event => {
    const color = event.detail?.color;
    if (color) trigger(color);
  });

  trigger();
}

function announceAccent(color) {
  const event = new CustomEvent('mobileBookAccent', { detail: { color } });
  document.dispatchEvent(event);
}

document.addEventListener('DOMContentLoaded', () => {
  setupSqueezeWord();
  setupTodoScrollSection();
  drawTodoShapes();
  setupMobileBookStack();
  window.addEventListener('resize', () => scheduleTodoShapeDraw());
});

window.addEventListener('load', () => scheduleTodoShapeDraw(true));
window.addEventListener('orientationchange', () => scheduleTodoShapeDraw());
