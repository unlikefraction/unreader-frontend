import { getItem as storageGet } from '../storage.js';

document.addEventListener('DOMContentLoaded', () => {
  const home = document.querySelector('.home');
  const addAmount = document.querySelector('.addAmount');
  const paymentOptions = document.querySelector('.paymentOptions');
  const headingAmount = document.querySelector('.headingAmount');
  const noteToInput = document.querySelector('.noteToInput');
  const inputSection = document.querySelector('.inputAmountSection');
  const input = document.querySelector('.inputAmount');
  const dollar = document.querySelector('.dollarAmount');
  const noteAmount = document.querySelector('.noteAmount');
  const payOptionsWrap = document.querySelector('.payOptions');
  const methodOptions = Array.from(document.querySelectorAll('.pOptions .option'));
  const couponOption = document.querySelector('.pOptions .applyCoupon');
  const orTextMiddle = document.querySelector('.orTextMiddle');
  const payNowBtn = document.querySelector('.payNowButton');
  const payNowText = document.querySelector('.payNowButtonText');

  // Modal helpers
  const modal = document.getElementById('paymentStatusModal');
  const closeBtn = modal?.querySelector('.psm-close');
  const okBtn = modal?.querySelector('#psm-ok');
  const msgEl = modal?.querySelector('#psm-message');
  const iconEl = modal?.querySelector('#psm-icon');
  const titleEl = modal?.querySelector('#psm-title');

  function isoToNiceDate(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${d.getDate()} ${months[d.getMonth()]}, ${d.getFullYear()}`;
    } catch { return null; }
  }

  function setIconStatus(ok) {
    if (!iconEl) return;
    iconEl.classList.remove('success','error','warn','logged');
    if (ok) { iconEl.textContent = '✅'; iconEl.classList.add('success'); if (titleEl) titleEl.textContent = 'Success'; }
    else { iconEl.textContent = '⛔'; iconEl.classList.add('error'); if (titleEl) titleEl.textContent = 'Something went wrong'; }
  }

  function openModal({ ok = false, message = '' } = {}) {
    if (!modal) return;
    setIconStatus(ok);
    if (msgEl) msgEl.textContent = message || '';
    modal.setAttribute('aria-hidden', 'false');
    (okBtn || closeBtn)?.focus?.();
  }

  function closeModal() { modal?.setAttribute('aria-hidden', 'true'); }
  closeBtn?.addEventListener('click', closeModal);
  okBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // State
  let plans = [];
  let selectedPlan = null;

  // Build Step 1 (plan selection)
  const planStep = document.createElement('div');
  planStep.className = 'planStep';
  planStep.innerHTML = `
    <div class="addAmount">
      <h3 class="headingAmount">subscribing to</h3>
      <div class="subscriptionRow">
        <div class="subscriptionText">unlimited access of unreader</div>
      </div>
    </div>
    <div class="paymentOptions">
      <div class="payOptions">
        <div class="pOptions planList"></div>
      </div>
      <button class="payNowButton" id="continueBtn">
        <i class="ph ph-lock-laminated payNowIcon"></i>
        <span class="payNowButtonText">Continue</span>
      </button>
      <p class="errorMessage hidden" id="planError">Please select a plan</p>
    </div>
  `;

  // Insert Plan step before existing UI
  if (home) home.insertBefore(planStep, home.firstChild);

  // Hide original sections for Step 1
  if (addAmount) addAmount.style.display = 'none';
  if (paymentOptions) paymentOptions.style.display = 'none';

  // Fetch and render plans
  async function loadPlans() {
    try {
      const base = window.API_URLS?.PAYMENT;
      const url = `${base}plans/`;
      const token = storageGet('authToken');
      const res = await fetch(url, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      plans = Array.isArray(data?.plans) ? data.plans : [];
      renderPlans(plans);
    } catch (err) {
      renderPlans([]);
      console.warn('Failed to load plans', err);
      const list = planStep.querySelector('.planList');
      if (list) list.innerHTML = `<div class="option" style="cursor: default;">Unable to load plans</div>`;
    }
  }

  function fmtMoney(num) {
    const n = Number(num);
    if (!Number.isFinite(n)) return '$0.00';
    return `$${n.toFixed(2)}`;
  }

  function monthlyFrom(plan) {
    const price = Number(plan.price_dollars);
    const months = plan.duration_days >= 365 ? 12 : Math.max(1, Math.round(plan.duration_days / 30));
    const per = price / months;
    const isInt = Number.isInteger(per);
    return `$${isInt ? per.toFixed(0) : per.toFixed(2)}/month`;
  }

  function renderPlans(items) {
    const list = planStep.querySelector('.planList');
    if (!list) return;
    list.innerHTML = '';
    items.forEach((p) => {
      const div = document.createElement('div');
      div.className = 'option plan';
      div.dataset.planId = String(p.id);
      div.dataset.planName = p.name;
      div.dataset.price = String(p.price_dollars);
      div.dataset.duration = String(p.duration_days);
      div.innerHTML = `
        <span>for ${p.duration_days} days</span>
        <span>${fmtMoney(Number(p.price_dollars))} <span class="perMonth" style="opacity:0.6;">[ ${monthlyFrom(p)} ]</span></span>
      `;
      div.addEventListener('click', () => {
        list.querySelectorAll('.option').forEach(o => o.classList.remove('active'));
        div.classList.add('active');
        selectedPlan = p;
        const err = document.getElementById('planError');
        if (err) { err.classList.add('hidden'); err.textContent = ''; }
      });
      list.appendChild(div);
    });
    // Default select the last plan
    if (items.length > 0) {
      const lastIndex = items.length - 1;
      const lastEl = list.children[lastIndex];
      if (lastEl) {
        Array.from(list.children).forEach(el => el.classList.remove('active'));
        lastEl.classList.add('active');
        selectedPlan = items[lastIndex];
      }
    }
  }

  // Continue button
  const continueBtn = planStep.querySelector('#continueBtn');
  continueBtn?.addEventListener('click', () => {
    if (!selectedPlan) {
      const err = document.getElementById('planError');
      if (err) { err.textContent = 'Please select a plan'; err.classList.remove('hidden'); }
      return;
    }
    // Switch to Step 2 (payment method)
    planStep.style.display = 'none';
    if (addAmount) addAmount.style.display = '';
    if (paymentOptions) paymentOptions.style.display = '';

    // Tweak labels and input
    if (headingAmount) headingAmount.textContent = 'you are subscribing to';
    if (noteToInput) noteToInput.style.display = 'none';
    if (dollar) dollar.style.display = 'none';
    if (noteAmount) noteAmount.style.display = 'none';
    if (input) {
      input.readOnly = true;
      input.value = `${selectedPlan.name} for ${fmtMoney(Number(selectedPlan.price_dollars))}`;
      // Use an overlay to color the decimal part
      input.style.color = 'transparent';
      input.style.webkitTextFillColor = 'transparent';
      input.style.background = 'transparent';
      input.style.cursor = 'default';

      const sectionEl = inputSection || input.parentElement;
      if (sectionEl) sectionEl.style.position = sectionEl.style.position || 'relative';

      const finalOverlay = document.createElement('span');
      finalOverlay.className = 'subFormattedOverlay';
      finalOverlay.setAttribute('aria-hidden', 'true');
      Object.assign(finalOverlay.style, {
        position: 'absolute',
        zIndex: '0',
        whiteSpace: 'pre',
        pointerEvents: 'none',
        left: '0px',
        top: '0px',
      });
      input.after(finalOverlay);

      const renderFinalOverlay = () => {
        const cs = getComputedStyle(input);
        finalOverlay.style.left = input.offsetLeft + 'px';
        finalOverlay.style.top = input.offsetTop + 'px';
        finalOverlay.style.width = input.offsetWidth + 'px';
        finalOverlay.style.height = input.offsetHeight + 'px';
        finalOverlay.style.lineHeight = cs.lineHeight;
        finalOverlay.style.fontFamily = cs.fontFamily;
        finalOverlay.style.fontSize = cs.fontSize;
        finalOverlay.style.fontWeight = cs.fontWeight;
        finalOverlay.style.letterSpacing = cs.letterSpacing;
        finalOverlay.style.padding = cs.padding;

        const priceStr = fmtMoney(Number(selectedPlan.price_dollars)); // like $180.00
        const m = priceStr.match(/^(\$\d+)(\.(\d{2}))$/);
        const priceHtml = m ? `${m[1]}<span class="decimal">${m[2]}</span>` : priceStr;
        finalOverlay.innerHTML = `${selectedPlan.name} for ${priceHtml}`;
      };

      window.addEventListener('resize', renderFinalOverlay);
      window.addEventListener('load', renderFinalOverlay);
      renderFinalOverlay();
    }

    // Remove coupons
    orTextMiddle && (orTextMiddle.style.display = 'none');
    couponOption && couponOption.remove();

    // Ensure exactly one method is active
    if (methodOptions.length) {
      methodOptions.forEach(o => o.classList.remove('active'));
      const first = methodOptions.find(o => !o.classList.contains('applyCoupon')) || methodOptions[0];
      first?.classList.add('active');
    }
    // Make sure pay button says Pay Now
    payNowText && (payNowText.textContent = 'Pay Now');
  });

  // Payment method option toggling
  methodOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      if (opt.classList.contains('applyCoupon')) return; // removed in this flow
      methodOptions.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    });
  });

  function getSelectedMethod() {
    const active = methodOptions.find(o => o.classList.contains('active') && !o.classList.contains('applyCoupon'));
    if (!active) return 'UPI';
    // If a data-method is present, prefer it; otherwise use text
    return active.dataset.method?.trim() || active.textContent.trim() || 'UPI';
  }

  // Pay Now → initiate subscription
  payNowBtn?.addEventListener('click', async () => {
    if (!selectedPlan) {
      openModalMessage('Please pick a plan first.');
      return;
    }
    const token = storageGet('authToken');
    if (!token) {
      openModalMessage('Please sign in to continue.');
      return;
    }
    const base = window.API_URLS?.PAYMENT;
    if (!base) {
      openModalMessage('Payment service is not configured.');
      return;
    }
    const body = {
      plan_id: selectedPlan.id,
      payment_method: getSelectedMethod(),
    };
    try {
      const res = await fetch(`${base}initiate/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      let data = null;
      try { data = await res.json(); } catch {}
      let message = data?.message || (res.ok ? 'Request received.' : 'Something went wrong.');
      // If success, try to normalize any date in the message to a friendly format
      if (res.ok) {
        // Prefer an explicit field if provided
        const dateField = data?.premium_ends_at || data?.premium_until || null;
        if (dateField) {
          const nice = isoToNiceDate(dateField);
          if (nice) message = `Subscription activated. Premium access until ${nice}.`;
        } else {
          // Fallback: extract ISO date in message and replace with friendly date
          const m = message.match(/(\d{4}-\d{2}-\d{2})(?:[T ][^\s]*)?/);
          if (m) {
            const nice = isoToNiceDate(m[0]);
            if (nice) message = message.replace(m[0], nice);
          }
        }
      }
      openModal({ ok: res.ok, message });
    } catch (err) {
      openModal({ ok: false, message: 'Network error. Please try again.' });
    }
  });

  // Style hook for subscription text to match input font
  const style = document.createElement('style');
  style.textContent = `
    .subscriptionRow { display: flex; align-items: flex-end; }
    .subscriptionText { font-size: 56px; font-family: 'Space Grotesk', monospace; font-weight: 500; }
    @media (max-width: 400px) { .subscriptionText { font-size: 48px; } }
  `;
  document.head.appendChild(style);

  loadPlans();
});
