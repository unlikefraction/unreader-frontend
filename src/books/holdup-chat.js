// UI-only chat bar for Holdup chat mode.

let chatBarEl = null;
let lastMsgBox = null;

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function typewriter(node, text, speed = 18) {
  return new Promise((resolve) => {
    // Ensure typing happens inline with a temporary cursor inside the node
    const { cursor, remove: removeCursor } = attachCursorInside(node);
    const typedNode = document.createTextNode('');
    try { node.insertBefore(typedNode, cursor); } catch { try { node.appendChild(typedNode); } catch {} }
    let i = 0;
    const tick = () => {
      if (i >= text.length) { try { removeCursor?.(); } catch {} resolve(); return; }
      try { typedNode.data += text[i++]; } catch { try { node.textContent += text[i++]; } catch {} }
      setTimeout(tick, speed);
    };
    tick();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function typeLine(node, text, speed = 18) {
  try { node.textContent = ''; } catch {}
  await typewriter(node, text, speed);
}

async function eraseLine(node, speed = 14) {
  const s = () => new Promise(res => setTimeout(res, speed));
  while ((node.textContent || '').length > 0) {
    node.textContent = node.textContent.slice(0, -1);
    await s();
  }
}

/* -------------------- Cursor utilities -------------------- */

// Attach a temporary cursor span ("|") as the last child of the node.
// Returns the cursor and a disposer to remove it.
function attachCursorInside(node) {
  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  cursor.textContent = '|';
  cursor.setAttribute('aria-hidden', 'true');
  try { node.appendChild(cursor); } catch {}
  return { cursor, remove: () => { try { cursor.remove(); } catch {} } };
}

function findAncestor(el, predicate) {
  let n = el;
  while (n) {
    if (predicate(n)) return n;
    n = n.parentElement;
  }
  return null;
}

/* -------------------- Core UI -------------------- */

function ensureBuilt() {
  if (chatBarEl) return chatBarEl;
  const elb = document.createElement('div');
  elb.className = 'holdupChatBar';
  elb.setAttribute('aria-live', 'polite');
  elb.innerHTML = `
    <input class="holdupChatInput" type="text" placeholder="ask anything" />
    <button class="sendButton" type="button" aria-label="Send">
      <i class="ph ph-paper-plane-tilt"></i>
    </button>
  `;
  elb.style.display = 'none';
  document.body.appendChild(elb);

  // No network/API behavior for now
  const btn = elb.querySelector('button.sendButton');
  const input = elb.querySelector('.holdupChatInput');

  const handleSend = async () => {
    // Clear previous message box if any
    if (lastMsgBox) {
      try { lastMsgBox.remove(); } catch {}
      lastMsgBox = null;
    }
    const msg = (input?.value || '').trim();
    if (!msg) return;
    input.value = ''; // normal clear
    try { input.focus(); } catch {}

    // Spawn message box 8px above bar, 650px width
    const box = elCreateMessageBoxAbove(elb);
    lastMsgBox = box;
    const q = box.querySelector('.hmsg-question');
    const a = box.querySelector('.hmsg-answer');

    await typewriter(q, msg, 18); // question typed at normal speed

    // Start status looper until response arrives (cursor shows on status)
    const stopProgress = startStatusLooper(box);

    // Start response fetch in parallel
    let responseText = '';
    try {
      const holdup = window.holdup;
      if (holdup && typeof holdup.sendChatMessage === 'function') {
        const r = await holdup.sendChatMessage(msg);
        responseText = String(r?.response || '');
      }
    } catch (e) {
      responseText = '…';
    }

    // Stop progress; then type the answer quickly with a temporary cursor
    try { stopProgress?.(); } catch {}
    await typewriter(a, responseText, 4); // super fast
  };

  btn?.addEventListener('click', handleSend);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  chatBarEl = elb;
  return chatBarEl;
}

function elCreateMessageBoxAbove(bar) {
  const box = el('div', 'holdupMessageBox');
  box.innerHTML = `
    <div class="hmsg-question" style="font-weight:400;color:#919191;"></div>
    <div class="hmsg-status"></div>
    <div class="hmsg-answer"></div>
  `;
  document.body.appendChild(box);
  positionMessageBoxAbove(bar, box);
  return box;
}

function positionMessageBoxAbove(bar, box) {
  const rect = bar.getBoundingClientRect();
  const gap = 8; // 50px above the text input bar
  const width = 650;
  box.style.position = 'fixed';
  box.style.left = '50%';
  box.style.transform = 'translateX(-50%)';
  // Anchor by bottom so height growth expands upward
  const bottom = Math.max(0, (window.innerHeight - rect.top) + gap);
  box.style.top = '';
  box.style.bottom = `${bottom}px`;
  box.style.width = `${width}px`;
}

function startProgressList(box) {
  const steps = [
    'Understanding query intent',
    'Finding related context',
    'Scanning previous page',
    'Looking ahead to next page',
    'Drafting response',
    'Finalizing response'
  ];
  const list = box.querySelector('.hmsg-progress');
  if (!list) return () => {};
  list.innerHTML = '';
  const timers = [];
  steps.forEach((label, idx) => {
    const li = el('li', 'hmsg-step', `<span class="dot"></span><span class="label">${label}</span>`);
    list.appendChild(li);
    const t = setTimeout(() => {
      li.classList.add('done');
    }, 450 * (idx + 1));
    timers.push(t);
  });
  // Cleanup: mark all done and remove list after a moment
  return () => {
    try { timers.forEach(clearTimeout); } catch {}
    try { list.querySelectorAll('.hmsg-step').forEach(li => li.classList.add('done')); } catch {}
    setTimeout(() => { try { list.remove(); } catch {} }, 200);
  };
}

function positionToBottomControl() {
  if (!chatBarEl) return;
  const bc = document.querySelector('.bottomControl');
  if (!bc) return;
  const rect = bc.getBoundingClientRect();
  const height = 50; // fixed
  const gap = 16;    // requested gap
  const top = Math.max(0, rect.top - gap - height);
  chatBarEl.style.position = 'fixed';
  chatBarEl.style.left = '50%';
  chatBarEl.style.transform = 'translateX(-50%)';
  chatBarEl.style.top = `${top}px`;
  chatBarEl.style.width = `${Math.max(260, Math.round(rect.width))}px`;
  if (lastMsgBox) {
    try { positionMessageBoxAbove(chatBarEl, lastMsgBox); } catch {}
  }
}

export function showHoldupChatBar() {
  const elb = ensureBuilt();
  elb.style.display = 'flex';
  positionToBottomControl();
  if (lastMsgBox) {
    try { positionMessageBoxAbove(elb, lastMsgBox); } catch {}
  }
  try { window.addEventListener('resize', positionToBottomControl, { passive: true }); } catch {}
  try { window.addEventListener('scroll', positionToBottomControl, { passive: true }); } catch {}
  // Focus input when chat bar becomes visible
  try {
    const inp = elb.querySelector('.holdupChatInput');
    if (inp) setTimeout(() => { try { inp.focus(); } catch {} }, 0);
  } catch {}
}

export function hideHoldupChatBar() {
  if (!chatBarEl) return;
  chatBarEl.style.display = 'none';
  try { window.removeEventListener('resize', positionToBottomControl); } catch {}
  try { window.removeEventListener('scroll', positionToBottomControl); } catch {}
  if (lastMsgBox) { try { lastMsgBox.remove(); } catch {}; lastMsgBox = null; }
}

/* -------------------- Status looper (keeps a single space while animating) -------------------- */

async function typeLineStatus(node, text, speed = 18) {
  try { node.textContent = ' '; } catch {}
  await typewriter(node, text, speed);
}

async function eraseLineToSpace(node, speed = 14) {
  const s = () => new Promise(res => setTimeout(res, speed));
  const current = (node.textContent || '');
  if (current.length === 0) { node.textContent = ' '; return; }
  while ((node.textContent || '').length > 1) {
    node.textContent = node.textContent.slice(0, -1);
    await s();
  }
  node.textContent = ' ';
}

function startStatusLooper(box) {
  const msgs = [
    'understanding query intent',
    'finding related context',
    'scanning previous page',
    'looking ahead to next page',
    'drafting response',
    'finalizing response'
  ];
  const node = box.querySelector('.hmsg-status');
  if (!node) return () => {};
  let cancelled = false;

  (async () => {
    // Hide status initially; reveal after 0.5s
    try { node.style.display = 'none'; } catch {}
    await sleep(500);
    if (cancelled) return;
    try { node.style.removeProperty('display'); } catch { try { node.style.display = ''; } catch {} }
    let i = 0;
    while (!cancelled) {
      const t = msgs[i % msgs.length];
      // type a bit slower, then hold 3.5s before clearing
      await typeLineStatus(node, t, 36);
      await sleep(1500);
      if (cancelled) break;
      await eraseLineToSpace(node, 14);
      await sleep(80);
      i++;
    }
  })();

  // when we stop showing steps, hide cursor and remove the status node
  return () => {
    cancelled = true;
    try { node.remove(); } catch {}
  };
}
