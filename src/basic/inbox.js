document.addEventListener('DOMContentLoaded', () => {
  const inboxIcon   = document.querySelector('.inbox');
  const inboxPopup  = document.querySelector('.inboxPopup');
  const messagesEl  = document.querySelector('.messages');
  const inputEl     = document.querySelector('.messageInput');
  const sendBtn     = document.querySelector('.sendButton');
  const badgeWrap   = document.querySelector('.inboxCount');
  const badgeCount  = document.querySelector('.inboxCount .count');

  // Polling interval (5 minutes)
  const POLL_MS = 5 * 60 * 1000;
  let pollTimer = null;

  // ---- helpers -------------------------------------------------------------
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  }

  function authHeaders() {
    const token = getCookie('authToken');
    if (!token) console.warn('[Inbox] Missing auth token cookie: authToken');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  function baseUrl() {
    let base = (window.API_URLS && window.API_URLS.INBOX) ? window.API_URLS.INBOX : '/api/inbox/';
    if (!base.endsWith('/')) base += '/';
    return base;
  }

  function escapeHtml(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function ordinal(n) {
    const s = ["th","st","nd","rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      const day = ordinal(d.getDate());
      const month = d.toLocaleString('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' });
      const year = d.toLocaleString('en-IN', { year: 'numeric', timeZone: 'Asia/Kolkata' });
      return `${day} ${month}, ${year}`;
    } catch {
      return iso;
    }
  }

  function updateUnreadBadge(count) {
    if (!badgeWrap || !badgeCount) return;
    if (count > 0) {
      badgeCount.textContent = String(count);
      badgeWrap.style.display = 'flex';
    } else {
      badgeWrap.style.display = 'none';
      badgeCount.textContent = '0';
    }
  }

  function renderMessages(messages = []) {
    if (!messagesEl) return;

    const frag = document.createDocumentFragment();

    messages.forEach(msg => {
      const wrapper = document.createElement('div');
      wrapper.className = 'message';

      const isUnreadForUser = (msg.direction === 'team' && msg.read_by_user === false);
      const isUnreadForTeam = (msg.direction === 'user' && msg.read_by_team === false);
      if (isUnreadForUser || isUnreadForTeam) wrapper.classList.add('newMessage');

      const details = document.createElement('p');
      details.className = 'messageDetails';

      const date = formatDate(msg.created_at);

      if (msg.direction === 'user') {
        details.innerHTML = `<span class="name">You</span> • <span class="date">${date}</span>`;
      } else {
        const name = escapeHtml(msg.sender || 'Team');
        const role = msg.role ? ` • <span class="designation">${escapeHtml(msg.role)}</span>` : '';
        details.innerHTML = `<span class="name">${name}</span>${role} • <span class="date">${date}</span>`;
      }

      const content = document.createElement('p');
      content.className = 'messageContent';
      content.innerHTML = escapeHtml(msg.text || '').replace(/\n/g, '<br>');

      wrapper.appendChild(details);
      wrapper.appendChild(content);
      frag.appendChild(wrapper);
    });

    messagesEl.innerHTML = '';
    messagesEl.appendChild(frag);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    const unreadTeamForUser = messages.filter(m => m.direction === 'team' && m.read_by_user === false).length;
    updateUnreadBadge(unreadTeamForUser);
  }

  // ---- network -------------------------------------------------------------
  async function fetchInboxThread() {
    const url = baseUrl() + 'thread/';
    try {
      const res = await fetch(url, { headers: authHeaders() });
      if (res.status === 401) {
        console.warn('[Inbox] Unauthorized while fetching thread');
        return;
      }
      if (!res.ok) throw new Error(`Failed to fetch thread: ${res.status}`);
      const data = await res.json();

      const messages = Array.isArray(data.messages)
        ? [...data.messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        : [];

      renderMessages(messages);

      // Prefer server-provided unread count if present
      const serverUnread = data?.thread?.unread_for_user;
      if (typeof serverUnread === 'number') updateUnreadBadge(serverUnread);
    } catch (err) {
      console.error('[Inbox] fetchInboxThread error', err);
    }
  }

  async function markThreadRead() {
    const url = baseUrl() + 'read/';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({}) // explicit empty body per spec
      });
      if (res.status === 401) {
        console.warn('[Inbox] Unauthorized while marking read');
        return;
      }
      if (!res.ok) throw new Error(`Failed to mark read: ${res.status}`);
      await fetchInboxThread();
    } catch (err) {
      console.error('[Inbox] markThreadRead error', err);
    }
  }

  async function postMessage(text) {
    const url = baseUrl() + 'message/';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ text })
      });
      if (res.status === 401) {
        console.warn('[Inbox] Unauthorized while posting message');
        return;
      }
      if (!res.ok) throw new Error(`Failed to post message: ${res.status}`);
      await fetchInboxThread();
    } catch (err) {
      console.error('[Inbox] postMessage error', err);
    }
  }

  // ---- polling -------------------------------------------------------------
  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(fetchInboxThread, POLL_MS);
  }

  // Optional: pause polling when tab is hidden, resume when visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchInboxThread(); // immediate refresh on return
      startPolling();
    } else if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });

  window.addEventListener('beforeunload', () => {
    if (pollTimer) clearInterval(pollTimer);
  });

  // ---- interactions --------------------------------------------------------
  let hasMarkedReadThisOpen = false;

  // Toggle on icon click
  if (inboxIcon && inboxPopup) {
    inboxIcon.addEventListener('click', async (e) => {
      e.stopPropagation();
      inboxPopup.classList.toggle('visible');
      inboxIcon.classList.toggle('active');

      // On open, mark as read once per open session
      if (inboxPopup.classList.contains('visible')) {
        if (!hasMarkedReadThisOpen) {
          hasMarkedReadThisOpen = true;
          await markThreadRead();
        }
      }
    });
  }

  // Close when clicking anywhere else
  document.addEventListener('click', (e) => {
    if (!inboxPopup || !inboxIcon) return;
    if (!inboxIcon.contains(e.target) && !inboxPopup.contains(e.target)) {
      inboxPopup.classList.remove('visible');
      inboxIcon.classList.remove('active');
      hasMarkedReadThisOpen = false; // reset for next open
    }
  });

  // Send interactions
  function handleSend() {
    const text = (inputEl?.value || '').trim();
    if (!text) return;
    inputEl.value = '';
    postMessage(text);
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', handleSend);
  }

  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
    });
  }

  // Initial fetch + start polling every 5 minutes
  fetchInboxThread();
  startPolling();
});
