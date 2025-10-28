import { getItem as storageGet } from '../storage.js';

function labelDDMM(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}`;
}

function labelMonthShortLower(d) {
  try {
    return d.toLocaleString(undefined, { month: 'short' }).toLowerCase();
  } catch {
    const names = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    return names[d.getMonth()];
  }
}

function labelWeekRangeShort(start) {
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const sd = start.getDate();
  const ed = end.getDate();
  if (start.getMonth() === end.getMonth()) {
    return `${sd}-${ed} ${labelMonthShortLower(end)}`;
  }
  return `${sd} ${labelMonthShortLower(start)}-${ed} ${labelMonthShortLower(end)}`;
}

function startOfWeek(date) {
  const d = new Date(date);
  // Make Monday the first day of the week
  const day = (d.getDay() + 6) % 7; // 0..6 with Monday=0
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - day);
  return d;
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

  // Build raw count map first
  const countMap = new Map();
  let minDate = null;
  let maxDate = null;
  for (const it of items) {
    const t = new Date(it.read_at);
    if (isNaN(t.getTime())) continue;
    if (!minDate || t < minDate) minDate = t;
    if (!maxDate || t > maxDate) maxDate = t;

    let key;
    if (period === 'monthly') key = keyYYYYMM(t);
    else if (period === 'weekly') key = keyYYYYMMDD(startOfWeek(t));
    else key = keyYYYYMMDD(t);
    countMap.set(key, (countMap.get(key) || 0) + 1);
  }

  if (!minDate || !maxDate) return [];

  // Align boundaries to the period
  let cursor;
  let end;
  if (period === 'monthly') {
    cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    end    = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  } else if (period === 'weekly') {
    cursor = startOfWeek(minDate);
    end    = startOfWeek(maxDate);
  } else { // daily
    cursor = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
    end    = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
  }

  // Ensure the last bucket includes "today"
  const today = new Date();
  let todayAnchor;
  if (period === 'monthly') todayAnchor = new Date(today.getFullYear(), today.getMonth(), 1);
  else if (period === 'weekly') todayAnchor = startOfWeek(today);
  else todayAnchor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (end < todayAnchor) end = todayAnchor;

  const out = [];
  while (cursor <= end) {
    let key;
    let label;
    if (period === 'monthly') {
      key = keyYYYYMM(cursor);
      label = labelMonthShortLower(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    } else if (period === 'weekly') {
      const s = startOfWeek(cursor);
      key = keyYYYYMMDD(s);
      label = labelWeekRangeShort(s);
    } else {
      key = keyYYYYMMDD(cursor);
      label = labelDDMM(cursor);
    }

    const count = countMap.get(key) || 0;
    out.push({ key, label, count });

    // step forward
    if (period === 'monthly') {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    } else if (period === 'weekly') {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
    } else {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
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
  const select = document.querySelector('.usageHistory');
  let rawItems = [];

  async function load() {
    try {
      const user = await fetchUserInfo();
      if (!user?.id) { renderNoUsage(usageEl); return; }
      const items = await fetchPagesRead(user.id);
      rawItems = items || [];
      update();
    } catch (err) {
      try { console.warn('usage graph load failed', err); } catch {}
      renderNoUsage(usageEl);
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
