import { getItem as storageGet } from '../storage.js';

const LOGIN_OPTIONS = ['login.html', 'loginOg.html'];
const LOGIN_WEIGHTS = [0.5, 0.5];

function weightedRandom(options, weights) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < options.length; i += 1) {
    if (rand < weights[i]) return options[i];
    rand -= weights[i];
  }
  return options[0];
}

function fmtMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '$0.00';
  return `$${num.toFixed(2)}`;
}

function monthlyFrom(plan) {
  const price = Number(plan.price_dollars);
  const months = plan.duration_days >= 365 ? 12 : Math.max(1, Math.round(plan.duration_days / 30));
  const per = price / months;
  const show = Number.isInteger(per) ? per.toFixed(0) : per.toFixed(2);
  return `$${show}/month`;
}

document.addEventListener('DOMContentLoaded', () => {
  const planList = document.querySelector('.planList');
  const continueBtn = document.getElementById('continueBtn');
  const planError = document.getElementById('planError');
  if (!planList || !continueBtn) return;

  let selectedPlan = null;

  function showPlanError(message) {
    if (!planError) return;
    planError.textContent = message;
    planError.classList.remove('hidden');
  }

  function hidePlanError() {
    planError?.classList.add('hidden');
  }

  function showPlanSkeletons() {
    planList.innerHTML = '';
    for (let i = 0; i < 2; i += 1) {
      const sk = document.createElement('div');
      sk.className = 'option skeleton-ui skeleton-plan';
      sk.innerHTML = '<span>&nbsp;</span><span>&nbsp;</span>';
      planList.appendChild(sk);
    }
    selectedPlan = null;
  }

  function renderPlans(plans) {
    planList.innerHTML = '';
    if (!plans.length) {
      const empty = document.createElement('div');
      empty.className = 'option';
      empty.style.cursor = 'default';
      empty.textContent = 'No plans available right now';
      planList.appendChild(empty);
      selectedPlan = null;
      return;
    }

    plans.forEach((plan, idx) => {
      const option = document.createElement('div');
      option.className = 'option plan';
      option.dataset.planId = String(plan.id);
      option.innerHTML = `
        <span>for ${plan.duration_days} days</span>
        <span>${fmtMoney(plan.price_dollars)} <span class="perMonth" style="opacity:0.6;">[ ${monthlyFrom(plan)} ]</span></span>
      `;
      option.addEventListener('click', () => {
        Array.from(planList.querySelectorAll('.option')).forEach(el => el.classList.remove('active'));
        option.classList.add('active');
        selectedPlan = plan;
        hidePlanError();
      });
      planList.appendChild(option);
      if (idx === plans.length - 1) {
        option.classList.add('active');
        selectedPlan = plan;
      }
    });
  }

  async function loadPlans() {
    try {
      const base = window.API_URLS?.PAYMENT;
      if (!base) throw new Error('Missing API endpoint');
      const token = storageGet('authToken');
      const res = await fetch(`${base}plans/`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = await res.json();
      const plansArray = Array.isArray(data?.plans) ? data.plans : [];
      renderPlans(plansArray);
    } catch (err) {
      console.warn('Failed to load plans on pricing page', err);
      const fallback = document.createElement('div');
      fallback.className = 'option';
      fallback.style.cursor = 'default';
      fallback.textContent = 'Unable to load plans. Please try again later.';
      planList.innerHTML = '';
      planList.appendChild(fallback);
      selectedPlan = null;
    }
  }

  continueBtn.addEventListener('click', () => {
    if (!selectedPlan) {
      showPlanError('Please select a plan');
      return;
    }
    const target = weightedRandom(LOGIN_OPTIONS, LOGIN_WEIGHTS);
    try {
      window.Analytics?.capture?.('pricing_plan_continue', {
        plan_id: selectedPlan.id,
        plan_days: selectedPlan.duration_days,
        plan_price: selectedPlan.price_dollars,
        redirect: target,
      });
    } catch {}
    window.location.href = target;
  });

  showPlanSkeletons();
  loadPlans();
});
