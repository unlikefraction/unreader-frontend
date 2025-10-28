import { getItem as storageGet } from '../storage.js';

function labelDDMM(d) {
  // Daily label: e.g., "28 oct"
  const dd = d.getDate();
  return `${dd} ${labelMonthShortLower(d)}`;
}

function labelMonthShortLower(d) {
  try {
    return d.toLocaleString(undefined, { month: 'short' }).toLowerCase();
  } catch {
    const names = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    return names[d.getMonth()];
  }
}

function labelMonthYearShortLower(d) {
  // Monthly label: e.g., "oct 2025"
  const m = labelMonthShortLower(d);
  return `${m} ${d.getFullYear()}`;
}

function labelWeekRangeShort(start) {
  const y = start.getFullYear();
  const m = start.getMonth();
  const last = daysInMonth(y, m);
  const sd = start.getDate();
  const ed = Math.min(sd + 6, last);
  return `${sd}-${ed} ${labelMonthShortLower(start)}`;
}

function startOfWeek(date) {
  const d = new Date(date);
  // Make Monday the first day of the week
  const day = (d.getDay() + 6) % 7; // 0..6 with Monday=0
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - day);
  return d;
}

// Month-anchored 7-day windows: 1–7, 8–14, 15–21, 22–28, 29–end
function daysInMonth(y, m /* 0-based */) {
  return new Date(y, m + 1, 0).getDate();
}

function monthAnchoredWeekStart(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const startDay = Math.floor((day - 1) / 7) * 7 + 1; // 1,8,15,22,29
  return new Date(y, m, startDay);
}

function nextMonthAnchoredWeekStart(d) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = d.getDate();
  const last = daysInMonth(y, m);
  const nextStart = start + 7;
  if (nextStart <= last) return new Date(y, m, nextStart);
  return new Date(y, m + 1, 1);
}

function prevMonthAnchoredWeekStart(d) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = d.getDate();
  if (start - 7 >= 1) return new Date(y, m, start - 7);
  const pmLast = new Date(y, m, 0); // last day of previous month
  const last = pmLast.getDate();
  const lastBucketStart = Math.floor((last - 1) / 7) * 7 + 1;
  return new Date(pmLast.getFullYear(), pmLast.getMonth(), lastBucketStart);
}

function keyYYYYMMDD(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function keyYYYYMM(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function continuousGroups(items, period) {
  if (!items || items.length === 0) return [];

  // Build raw unique page_id map per bucket
  const bucketMap = new Map(); // key -> Set(page_id)
  let minDate = null;
  let maxDate = null;
  for (const it of items) {
    const t = new Date(it.read_at);
    if (isNaN(t.getTime())) continue;
    if (!minDate || t < minDate) minDate = t;
    if (!maxDate || t > maxDate) maxDate = t;

    let key;
    if (period === 'monthly') key = keyYYYYMM(t);
    else if (period === 'weekly') key = keyYYYYMMDD(monthAnchoredWeekStart(t));
    else key = keyYYYYMMDD(t);

    const pid = it.page_id ?? it.pageId ?? it.page?.id ?? it.id; // fallback
    if (pid == null) continue;

    let set = bucketMap.get(key);
    if (!set) { set = new Set(); bucketMap.set(key, set); }
    set.add(String(pid));
  }

  if (!minDate || !maxDate) return [];

  // Align boundaries to the period
  let cursor, end;
  if (period === 'monthly') {
    cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    end    = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  } else if (period === 'weekly') {
    cursor = monthAnchoredWeekStart(minDate);
    end    = monthAnchoredWeekStart(maxDate);
  } else { // daily
    cursor = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
    end    = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
  }

  // Ensure the last bucket includes "today"
  const today = new Date();
  const todayAnchor =
    period === 'monthly' ? new Date(today.getFullYear(), today.getMonth(), 1) :
    period === 'weekly'  ? monthAnchoredWeekStart(today) :
                           new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (end < todayAnchor) end = todayAnchor;

  // <-- make this mutable
  let out = [];
  while (cursor <= end) {
    let key, label;
    if (period === 'monthly') {
      key = keyYYYYMM(cursor);
      label = labelMonthYearShortLower(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); // step
    } else if (period === 'weekly') {
      const s = monthAnchoredWeekStart(cursor);
      key = keyYYYYMMDD(s);
      label = labelWeekRangeShort(s);
      cursor = nextMonthAnchoredWeekStart(cursor); // step
    } else {
      key = keyYYYYMMDD(cursor);
      label = labelDDMM(cursor);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1); // step
    }
    const count = (bucketMap.get(key)?.size) || 0;
    out.push({ key, label, count });
  }

  // Ensure at least 10 buckets by prepending earlier zero buckets if needed
  const minBuckets = 10;
  if (out.length < minBuckets) {
    const need = minBuckets - out.length;
    const prefix = [];
    const firstKey = out[0].key;

    if (period === 'monthly') {
      const [y, m] = firstKey.split('-').map(Number);
      const firstDate = new Date(y, m - 1, 1);
      for (let k = need; k >= 1; k--) {
        const d = new Date(firstDate.getFullYear(), firstDate.getMonth() - k, 1);
        prefix.push({ key: keyYYYYMM(d), label: labelMonthYearShortLower(d), count: 0 });
      }
    } else if (period === 'weekly') {
      const [y, m, d] = firstKey.split('-').map(Number);
      let d0 = new Date(y, m - 1, d);
      const prevStarts = [];
      for (let i = 0; i < need; i++) {
        d0 = prevMonthAnchoredWeekStart(d0);
        prevStarts.push(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()));
      }
      prevStarts.reverse().forEach(s => {
        prefix.push({ key: keyYYYYMMDD(s), label: labelWeekRangeShort(s), count: 0 });
      });
    } else {
      const [y, m, d] = firstKey.split('-').map(Number);
      const firstDate = new Date(y, m - 1, d);
      for (let k = need; k >= 1; k--) {
        const dt = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate() - k);
        prefix.push({ key: keyYYYYMMDD(dt), label: labelDDMM(dt), count: 0 });
      }
    }

    // instead of reassigning a const, mutate safely
    out = prefix.concat(out);
  }

  return out;
}


function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }

function renderNoUsage(usageEl) {
  if (!usageEl) return;
  clear(usageEl);
  const msg = document.createElement('h3');
  msg.className = 'noUsage';
  msg.textContent = 'ready when you are! start reading to see your credit usage details here';
  usageEl.appendChild(msg);
}

function renderChart(usageEl, groups) {
  if (!usageEl) return;
  clear(usageEl);

  if (!groups || groups.length === 0) {
    renderNoUsage(usageEl);
    return;
  }

  const maxVal = Math.max(...groups.map(g => g.count));
  const chartHeight = 180; // px total available for bars

  const scroller = document.createElement('div');
  scroller.className = 'usageChartScroller';
  const chart = document.createElement('div');
  chart.className = 'usageChart';
  scroller.appendChild(chart);

  for (const g of groups) {
    const barCol = document.createElement('div');
    barCol.className = 'barCol';

    const bar = document.createElement('div');
    bar.className = 'bar';
    const h = maxVal > 0 ? Math.round((g.count / maxVal) * (chartHeight - 24)) : 0;
    bar.style.height = `${h}px`;

    const val = document.createElement('span');
    val.className = 'barValue';
    val.textContent = String(g.count);
    if (h < 25) {
      val.classList.add('outside');
    }
    bar.appendChild(val);

    const lab = document.createElement('div');
    lab.className = 'barLabel';
    lab.textContent = g.label;

    barCol.appendChild(bar);
    barCol.appendChild(lab);
    chart.appendChild(barCol);
  }

  usageEl.appendChild(scroller);

  // Scroll to the end (latest) after render
  try { scroller.scrollLeft = scroller.scrollWidth; } catch {}
  try {
    requestAnimationFrame(() => {
      try { scroller.scrollLeft = scroller.scrollWidth; } catch {}
    });
  } catch {
    setTimeout(() => {
      try { scroller.scrollLeft = scroller.scrollWidth; } catch {}
    }, 0);
  }
}

async function fetchUserInfo() {
  const token = storageGet('authToken');
  if (!token) throw new Error('Missing auth token');
  const url = `${window.API_URLS.USER}info/`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) throw new Error(`user info ${res.status}`);
  return res.json();
}

async function fetchPagesRead(userId) {
  const token = storageGet('authToken');
  if (!token) throw new Error('Missing auth token');
  const base = window.API_URLS?.BASE;
  if (!base) throw new Error('Missing API base');
  const url = `${base}/analytics/users/${encodeURIComponent(userId)}/pages-read/`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(`analytics ${res.status}`);
  // Support both array or {data: [...]}
  const items = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
  return items;
}

document.addEventListener('DOMContentLoaded', () => {
  const usageEl = document.querySelector('.usage');
  const usageSection = document.querySelector('.usageSection');
  const select = document.querySelector('.usageHistory');
  let rawItems = [];

  // Ensure skeleton remains until analytics fetch completes; global removal happens when both top+usage ready
  try { usageSection?.classList.add('skeleton-ui'); } catch {}
  try {
    if (typeof window !== 'undefined') {
      window.__acctUsageReady = false;
      if (typeof window.__tryUnskeltonAccount !== 'function') {
        window.__tryUnskeltonAccount = function () {
          try {
            if (window.__acctTopReady && window.__acctUsageReady) window.unskelton?.();
          } catch {}
        };
      }
    }
  } catch {}

  async function load() {
    try {
      const user = await fetchUserInfo();
      if (!user?.id) { renderNoUsage(usageEl); return; }
      const items = await fetchPagesRead(user.id);
      rawItems = items || [];
      update();
      try { if (typeof window !== 'undefined') { window.__acctUsageReady = true; window.__tryUnskeltonAccount?.(); } } catch {}
    } catch (err) {
      try { console.warn('usage graph load failed', err); } catch {}
      renderNoUsage(usageEl);
      try { if (typeof window !== 'undefined') { window.__acctUsageReady = true; window.__tryUnskeltonAccount?.(); } } catch {}
    }
  }

  function update() {
    const period = (select?.value || 'daily').toLowerCase();
    const groups = continuousGroups(rawItems, period);
    renderChart(usageEl, groups);
  }

  select?.addEventListener('change', update);
  load();
});
