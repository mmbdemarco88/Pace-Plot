// ----------------------------------------------------
// Pace Plot PRO - Premium Services & Subscription Engine
// ----------------------------------------------------

const LOCAL_STORAGE_PREMIUM_KEY = 'paceplot_is_premium';
const LOCAL_STORAGE_TIER_KEY = 'paceplot_premium_tier';

let currentTier = 'annual'; // 'annual' | 'monthly'

export function isPremiumUser() {
  try {
    return localStorage.getItem(LOCAL_STORAGE_PREMIUM_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

export function setPremiumStatus(active = true, tier = 'annual') {
  try {
    localStorage.setItem(LOCAL_STORAGE_PREMIUM_KEY, active ? 'true' : 'false');
    localStorage.setItem(LOCAL_STORAGE_TIER_KEY, tier);
  } catch (_) {}
  updatePremiumUI();
}

export function openUpgradeModal() {
  const modal = document.getElementById('modalUpgradePremium');
  if (modal) {
    modal.classList.remove('hidden');
    syncTierUI();
  }
}

export function closeUpgradeModal() {
  const modal = document.getElementById('modalUpgradePremium');
  if (modal) {
    modal.classList.add('hidden');
  }
}

export function updatePremiumUI() {
  const isPro = isPremiumUser();
  const headerLabel = document.getElementById('headerPremiumLabel');
  const btnUpgrade = document.getElementById('btnOpenUpgradeModal');
  const btnSubscribeLabel = document.getElementById('btnSubscribeLabel');

  if (headerLabel) {
    headerLabel.innerHTML = isPro
      ? '<span class="flex items-center gap-1"><i class="fa-solid fa-crown text-amber-300"></i> PRO ACTIVE</span>'
      : 'PRO';
  }

  if (btnUpgrade) {
    if (isPro) {
      btnUpgrade.className = 'px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-extrabold text-[10px] flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer';
      btnUpgrade.title = 'Pace Plot PRO Active (Manage Subscription)';
    } else {
      btnUpgrade.className = 'px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-terracotta text-white font-extrabold text-[10px] flex items-center gap-1 shadow-sm hover:opacity-95 transition active:scale-95 cursor-pointer';
      btnUpgrade.title = 'Upgrade to Pace Plot PRO';
    }
  }

  if (btnSubscribeLabel) {
    if (isPro) {
      btnSubscribeLabel.textContent = 'Manage Active PRO Subscription';
    } else {
      btnSubscribeLabel.textContent = currentTier === 'annual'
        ? 'Start 7-Day Free Trial ($49.99/yr)'
        : 'Subscribe Monthly ($6.99/mo)';
    }
  }
}

function syncTierUI() {
  const btnTierAnnual = document.getElementById('btnTierAnnual');
  const btnTierMonthly = document.getElementById('btnTierMonthly');
  const priceLarge = document.getElementById('tierPriceLarge');
  const pricePeriod = document.getElementById('tierPricePeriod');
  const billingDetail = document.getElementById('tierBillingDetail');
  const subscribeLabel = document.getElementById('btnSubscribeLabel');
  const isPro = isPremiumUser();

  if (currentTier === 'annual') {
    if (btnTierAnnual) {
      btnTierAnnual.className = 'flex-1 py-2 px-2 rounded-xl bg-terracotta text-white shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer';
    }
    if (btnTierMonthly) {
      btnTierMonthly.className = 'flex-1 py-2 px-2 rounded-xl text-stone-400 hover:text-white transition flex items-center justify-center cursor-pointer';
    }
    if (priceLarge) priceLarge.textContent = '$4.16';
    if (pricePeriod) pricePeriod.textContent = '/ month';
    if (billingDetail) billingDetail.textContent = 'Billed annually at $49.99/year (Save 40% · 7-day free trial)';
    if (subscribeLabel) {
      subscribeLabel.textContent = isPro ? 'Current Tier: Annual PRO ($49.99/yr)' : 'Start 7-Day Free Trial ($49.99/yr)';
    }
  } else {
    if (btnTierAnnual) {
      btnTierAnnual.className = 'flex-1 py-2 px-2 rounded-xl text-stone-400 hover:text-white transition flex items-center justify-center gap-1.5 cursor-pointer';
    }
    if (btnTierMonthly) {
      btnTierMonthly.className = 'flex-1 py-2 px-2 rounded-xl bg-terracotta text-white shadow-md transition flex items-center justify-center cursor-pointer';
    }
    if (priceLarge) priceLarge.textContent = '$6.99';
    if (pricePeriod) pricePeriod.textContent = '/ month';
    if (billingDetail) billingDetail.textContent = 'Billed monthly at $6.99/month (Cancel anytime)';
    if (subscribeLabel) {
      subscribeLabel.textContent = isPro ? 'Current Tier: Monthly PRO ($6.99/mo)' : 'Subscribe Monthly ($6.99/mo)';
    }
  }
}

export function setupPremiumListeners(callbacks = {}) {
  const btnOpenModal = document.getElementById('btnOpenUpgradeModal');
  const btnCloseModal = document.getElementById('btnCloseUpgradeModal');
  const btnTierAnnual = document.getElementById('btnTierAnnual');
  const btnTierMonthly = document.getElementById('btnTierMonthly');
  const btnSubscribe = document.getElementById('btnSubscribePro');
  const btnRestore = document.getElementById('btnRestorePurchases');

  if (btnOpenModal) {
    btnOpenModal.addEventListener('click', openUpgradeModal);
  }

  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', closeUpgradeModal);
  }

  if (btnTierAnnual) {
    btnTierAnnual.addEventListener('click', () => {
      currentTier = 'annual';
      syncTierUI();
    });
  }

  if (btnTierMonthly) {
    btnTierMonthly.addEventListener('click', () => {
      currentTier = 'monthly';
      syncTierUI();
    });
  }

  if (btnSubscribe) {
    btnSubscribe.addEventListener('click', () => {
      btnSubscribe.disabled = true;
      btnSubscribe.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Activating PRO...</span>';

      setTimeout(() => {
        setPremiumStatus(true, currentTier);
        btnSubscribe.disabled = false;
        btnSubscribe.innerHTML = '<i class="fa-solid fa-check"></i> <span>PRO Membership Active!</span>';

        if (typeof callbacks.onSuccess === 'function') {
          callbacks.onSuccess(currentTier);
        }

        setTimeout(() => {
          closeUpgradeModal();
          syncTierUI();
        }, 800);
      }, 700);
    });
  }

  if (btnRestore) {
    btnRestore.addEventListener('click', () => {
      setPremiumStatus(true, 'annual');
      if (typeof callbacks.onRestore === 'function') {
        callbacks.onRestore();
      }
      setTimeout(closeUpgradeModal, 600);
    });
  }

  updatePremiumUI();
}
