// ----------------------------------------------------
// Pace Plot PRO - Premium Services, Free Trial & Paywall Engine
// Supports 4 lifecycle states:
//   - 'free'          : Eligible for 7-Day Free Trial (PRO features locked)
//   - 'trial_active'  : Inside active Free Trial window (PRO features unlocked)
//   - 'trial_expired' : Free Trial window elapsed (PRO features locked behind paywall)
//   - 'pro_active'    : Paid PRO subscriber (PRO features permanently unlocked)
// ----------------------------------------------------

const LOCAL_STORAGE_PREMIUM_KEY = 'paceplot_is_premium';
const LOCAL_STORAGE_TIER_KEY = 'paceplot_premium_tier';
const LOCAL_STORAGE_STATUS_KEY = 'paceplot_subscription_status';
const LOCAL_STORAGE_TRIAL_START_KEY = 'paceplot_trial_started_at';
const LOCAL_STORAGE_TRIAL_EXPIRES_KEY = 'paceplot_trial_expires_at';

export const DEFAULT_TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 Days in ms

export const SUBSCRIPTION_STATUS = {
  FREE: 'free',
  TRIAL_ACTIVE: 'trial_active',
  TRIAL_EXPIRED: 'trial_expired',
  PRO_ACTIVE: 'pro_active'
};

let currentTier = 'annual'; // 'annual' | 'monthly'
let expirationWatcherTimer = null;
const premiumStateListeners = new Set();

function safeGetItem(storage, key) {
  try {
    return storage ? storage.getItem(key) : null;
  } catch (_) {
    return null;
  }
}

function safeSetItem(storage, key, val) {
  try {
    if (storage) storage.setItem(key, val);
  } catch (_) {}
}

function safeRemoveItem(storage, key) {
  try {
    if (storage) storage.removeItem(key);
  } catch (_) {}
}

function getStorage(customStorage) {
  if (customStorage) return customStorage;
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

export function formatTrialRemaining(remainingMs) {
  const ms = Math.max(0, Number(remainingMs) || 0);
  if (ms <= 0) return 'Expired';
  const totalSeconds = Math.ceil(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m left`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s left`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s left`;
  }
  return `${seconds}s left`;
}

export function getSubscriptionState(now = Date.now(), customStorage = null) {
  const store = getStorage(customStorage);
  const storedStatus = safeGetItem(store, LOCAL_STORAGE_STATUS_KEY);
  const legacyPremium = safeGetItem(store, LOCAL_STORAGE_PREMIUM_KEY) === 'true';
  const tier = safeGetItem(store, LOCAL_STORAGE_TIER_KEY) || currentTier || 'annual';
  const trialStartedAt = Number(safeGetItem(store, LOCAL_STORAGE_TRIAL_START_KEY) || 0);
  const trialExpiresAt = Number(safeGetItem(store, LOCAL_STORAGE_TRIAL_EXPIRES_KEY) || 0);

  // 1. Paid PRO Active
  if (storedStatus === SUBSCRIPTION_STATUS.PRO_ACTIVE || (legacyPremium && !storedStatus)) {
    return {
      status: SUBSCRIPTION_STATUS.PRO_ACTIVE,
      hasAccess: true,
      isTrial: false,
      isExpired: false,
      canStartTrial: false,
      tier,
      trialStartedAt: trialStartedAt || null,
      trialExpiresAt: trialExpiresAt || null,
      remainingMs: 0,
      remainingText: 'PRO Active'
    };
  }

  // 2. Active or Expired Free Trial
  if (
    storedStatus === SUBSCRIPTION_STATUS.TRIAL_ACTIVE ||
    storedStatus === SUBSCRIPTION_STATUS.TRIAL_EXPIRED ||
    trialExpiresAt > 0
  ) {
    if (trialExpiresAt > now && storedStatus !== SUBSCRIPTION_STATUS.TRIAL_EXPIRED) {
      const remainingMs = trialExpiresAt - now;
      return {
        status: SUBSCRIPTION_STATUS.TRIAL_ACTIVE,
        hasAccess: true,
        isTrial: true,
        isExpired: false,
        canStartTrial: false,
        tier,
        trialStartedAt,
        trialExpiresAt,
        remainingMs,
        remainingText: formatTrialRemaining(remainingMs)
      };
    }

    // Trial has expired -> lock behind paywall
    if (storedStatus !== SUBSCRIPTION_STATUS.TRIAL_EXPIRED || legacyPremium) {
      safeSetItem(store, LOCAL_STORAGE_STATUS_KEY, SUBSCRIPTION_STATUS.TRIAL_EXPIRED);
      safeSetItem(store, LOCAL_STORAGE_PREMIUM_KEY, 'false');
    }

    return {
      status: SUBSCRIPTION_STATUS.TRIAL_EXPIRED,
      hasAccess: false,
      isTrial: false,
      isExpired: true,
      canStartTrial: false,
      tier,
      trialStartedAt,
      trialExpiresAt,
      remainingMs: 0,
      remainingText: 'Trial Expired'
    };
  }

  // 3. Default Free (Trial not yet started)
  return {
    status: SUBSCRIPTION_STATUS.FREE,
    hasAccess: false,
    isTrial: false,
    isExpired: false,
    canStartTrial: true,
    tier,
    trialStartedAt: null,
    trialExpiresAt: null,
    remainingMs: 0,
    remainingText: '7-Day Free Trial'
  };
}

export function isPremiumUser(now = Date.now(), customStorage = null) {
  return getSubscriptionState(now, customStorage).hasAccess;
}

export function hasPremiumAccess(now = Date.now(), customStorage = null) {
  return getSubscriptionState(now, customStorage).hasAccess;
}

export function subscribePremiumState(listener) {
  premiumStateListeners.add(listener);
  try {
    listener(getSubscriptionState());
  } catch (_) {}
  return () => premiumStateListeners.delete(listener);
}

function notifyPremiumListeners() {
  const snapshot = getSubscriptionState();
  premiumStateListeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (e) {
      console.warn('Premium listener error:', e);
    }
  });
}

export function startFreeTrial(durationMs = DEFAULT_TRIAL_DURATION_MS, tier = currentTier, now = Date.now(), customStorage = null) {
  const store = getStorage(customStorage);
  const validDuration = Math.max(1000, Number(durationMs) || DEFAULT_TRIAL_DURATION_MS);
  const expiresAt = now + validDuration;

  safeSetItem(store, LOCAL_STORAGE_STATUS_KEY, SUBSCRIPTION_STATUS.TRIAL_ACTIVE);
  safeSetItem(store, LOCAL_STORAGE_TRIAL_START_KEY, String(now));
  safeSetItem(store, LOCAL_STORAGE_TRIAL_EXPIRES_KEY, String(expiresAt));
  safeSetItem(store, LOCAL_STORAGE_PREMIUM_KEY, 'true');
  safeSetItem(store, LOCAL_STORAGE_TIER_KEY, tier);

  if (typeof document !== 'undefined') {
    updatePremiumUI();
    syncTierUI();
  }
  notifyPremiumListeners();
  return getSubscriptionState(now, store);
}

export function expireFreeTrialNow(now = Date.now(), customStorage = null) {
  const store = getStorage(customStorage);
  const startedAt = Number(safeGetItem(store, LOCAL_STORAGE_TRIAL_START_KEY) || (now - DEFAULT_TRIAL_DURATION_MS));

  safeSetItem(store, LOCAL_STORAGE_STATUS_KEY, SUBSCRIPTION_STATUS.TRIAL_EXPIRED);
  safeSetItem(store, LOCAL_STORAGE_TRIAL_START_KEY, String(startedAt));
  safeSetItem(store, LOCAL_STORAGE_TRIAL_EXPIRES_KEY, String(now - 1000));
  safeSetItem(store, LOCAL_STORAGE_PREMIUM_KEY, 'false');

  if (typeof document !== 'undefined') {
    updatePremiumUI();
    syncTierUI();
  }
  notifyPremiumListeners();
  return getSubscriptionState(now, store);
}

export function activatePaidSubscription(tier = currentTier, customStorage = null) {
  const store = getStorage(customStorage);
  currentTier = tier || 'annual';

  safeSetItem(store, LOCAL_STORAGE_STATUS_KEY, SUBSCRIPTION_STATUS.PRO_ACTIVE);
  safeSetItem(store, LOCAL_STORAGE_PREMIUM_KEY, 'true');
  safeSetItem(store, LOCAL_STORAGE_TIER_KEY, currentTier);

  if (typeof document !== 'undefined') {
    updatePremiumUI();
    syncTierUI();
  }
  notifyPremiumListeners();
  return getSubscriptionState(Date.now(), store);
}

export function resetSubscriptionToFree(customStorage = null) {
  const store = getStorage(customStorage);
  safeRemoveItem(store, LOCAL_STORAGE_STATUS_KEY);
  safeRemoveItem(store, LOCAL_STORAGE_TRIAL_START_KEY);
  safeRemoveItem(store, LOCAL_STORAGE_TRIAL_EXPIRES_KEY);
  safeSetItem(store, LOCAL_STORAGE_PREMIUM_KEY, 'false');

  if (typeof document !== 'undefined') {
    updatePremiumUI();
    syncTierUI();
  }
  notifyPremiumListeners();
  return getSubscriptionState(Date.now(), store);
}

export function setPremiumStatus(active = true, tier = 'annual', customStorage = null) {
  if (active) {
    return activatePaidSubscription(tier, customStorage);
  }
  return resetSubscriptionToFree(customStorage);
}

export function openUpgradeModal(reasonText = '') {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('modalUpgradePremium');
  const reasonBanner = document.getElementById('proModalPaywallReason');
  if (reasonBanner) {
    if (reasonText) {
      reasonBanner.textContent = reasonText;
      reasonBanner.classList.remove('hidden');
    } else {
      reasonBanner.classList.add('hidden');
    }
  }
  if (modal) {
    modal.classList.remove('hidden');
    updatePremiumUI();
    syncTierUI();
  }
}

export function closeUpgradeModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('modalUpgradePremium');
  if (modal) {
    modal.classList.add('hidden');
  }
}

export function updatePremiumUI() {
  if (typeof document === 'undefined') return;
  const state = getSubscriptionState();
  const headerLabel = document.getElementById('headerPremiumLabel');
  const btnUpgrade = document.getElementById('btnOpenUpgradeModal');
  const trialBanner = document.getElementById('proModalTrialStatusBanner');
  const btnStartTrial = document.getElementById('btnStartFreeTrial');
  const btnExpireTrialNow = document.getElementById('btnExpireTrialNow');
  const btnResetTrialDemo = document.getElementById('btnResetTrialDemo');

  if (headerLabel) {
    if (state.status === SUBSCRIPTION_STATUS.PRO_ACTIVE) {
      headerLabel.innerHTML = '<span class="flex items-center gap-1"><i class="fa-solid fa-crown text-amber-300"></i> PRO ACTIVE</span>';
    } else if (state.status === SUBSCRIPTION_STATUS.TRIAL_ACTIVE) {
      headerLabel.innerHTML = `<span class="flex items-center gap-1"><i class="fa-solid fa-hourglass-half text-amber-200"></i> TRIAL · ${state.remainingText.split(' ')[0]}</span>`;
    } else if (state.status === SUBSCRIPTION_STATUS.TRIAL_EXPIRED) {
      headerLabel.innerHTML = '<span class="flex items-center gap-1"><i class="fa-solid fa-lock text-rose-200"></i> TRIAL ENDED</span>';
    } else {
      headerLabel.innerHTML = 'FREE TRIAL';
    }
  }

  if (btnUpgrade) {
    if (state.status === SUBSCRIPTION_STATUS.PRO_ACTIVE) {
      btnUpgrade.className = 'px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-extrabold text-[10px] flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer whitespace-nowrap shrink-0';
      btnUpgrade.title = 'Pace Plot PRO Active (Manage Membership)';
    } else if (state.status === SUBSCRIPTION_STATUS.TRIAL_ACTIVE) {
      btnUpgrade.className = 'px-2.5 py-1 rounded-full bg-gradient-to-r from-sky-600 to-emerald-600 text-white font-extrabold text-[10px] flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer whitespace-nowrap shrink-0';
      btnUpgrade.title = `Free Trial Active (${state.remainingText})`;
    } else if (state.status === SUBSCRIPTION_STATUS.TRIAL_EXPIRED) {
      btnUpgrade.className = 'px-2.5 py-1 rounded-full bg-gradient-to-r from-rose-600 to-terracotta text-white font-extrabold text-[10px] flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer whitespace-nowrap shrink-0 animate-pulse';
      btnUpgrade.title = 'Free Trial Expired — Upgrade to Pace Plot PRO';
    } else {
      btnUpgrade.className = 'px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-terracotta text-white font-extrabold text-[10px] flex items-center gap-1 shadow-sm hover:opacity-95 transition active:scale-95 cursor-pointer whitespace-nowrap shrink-0';
      btnUpgrade.title = 'Start 7-Day Free Trial or Upgrade to Pace Plot PRO';
    }
  }

  // Update Trial Status Banner inside Modal
  if (trialBanner) {
    if (state.status === SUBSCRIPTION_STATUS.TRIAL_ACTIVE) {
      trialBanner.className = 'p-3 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs space-y-1.5';
      trialBanner.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <span class="font-extrabold text-emerald-300 flex items-center gap-1.5">
            <i class="fa-solid fa-circle-check text-emerald-400"></i>
            <span>Free Trial Active</span>
          </span>
          <span class="font-mono tabular-nums text-[11px] font-bold px-2 py-0.5 rounded-lg bg-emerald-900/80 text-emerald-200 border border-emerald-600/40">${state.remainingText}</span>
        </div>
        <p class="text-[11px] text-stone-300 leading-snug">Spotify Navigation HUD, BPM Cadence Sync, and SafeGuard PRO features are unlocked during your trial window.</p>
      `;
    } else if (state.status === SUBSCRIPTION_STATUS.TRIAL_EXPIRED) {
      trialBanner.className = 'p-3 rounded-2xl bg-rose-950/70 border border-rose-500/50 text-rose-100 text-xs space-y-1.5';
      trialBanner.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <span class="font-extrabold text-rose-300 flex items-center gap-1.5">
            <i class="fa-solid fa-lock text-rose-400"></i>
            <span>Free Trial Expired · Paywall Active</span>
          </span>
          <span class="font-mono text-[10px] font-bold px-2 py-0.5 rounded-lg bg-rose-900/80 text-rose-200">LOCKED</span>
        </div>
        <p class="text-[11px] text-rose-200/90 leading-snug">Your 7-day free trial has ended. Spotify Running Audio, HUD Mini-Player, and PRO safety tools are now locked behind the paywall. Subscribe below to restore instant access.</p>
      `;
    } else if (state.status === SUBSCRIPTION_STATUS.PRO_ACTIVE) {
      trialBanner.className = 'p-3 rounded-2xl bg-amber-950/50 border border-amber-500/40 text-amber-100 text-xs space-y-1';
      trialBanner.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <span class="font-extrabold text-amber-300 flex items-center gap-1.5">
            <i class="fa-solid fa-crown text-amber-400"></i>
            <span>Pace Plot PRO Membership Active</span>
          </span>
          <span class="font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300">${state.tier}</span>
        </div>
        <p class="text-[11px] text-stone-300 leading-snug">Full access to Spotify Running Audio, Live Family Beacon, and Weather Radar is permanently unlocked.</p>
      `;
    } else {
      trialBanner.className = 'p-3 rounded-2xl bg-stone-950/80 border border-amber-500/30 text-stone-200 text-xs space-y-1';
      trialBanner.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <span class="font-extrabold text-amber-400 flex items-center gap-1.5">
            <i class="fa-solid fa-gift"></i>
            <span>7-Day Free Trial Eligible</span>
          </span>
          <span class="font-mono text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-300">$0 Today</span>
        </div>
        <p class="text-[11px] text-stone-400 leading-snug">Try Spotify Running Audio, BPM Cadence Sync, and SafeGuard Live Tracking free for 7 days before your paywall activates.</p>
      `;
    }
  }

  if (btnStartTrial) {
    btnStartTrial.classList.toggle('hidden', state.status !== SUBSCRIPTION_STATUS.FREE);
  }
  if (btnExpireTrialNow) {
    btnExpireTrialNow.classList.toggle('hidden', state.status !== SUBSCRIPTION_STATUS.TRIAL_ACTIVE);
  }
  if (btnResetTrialDemo) {
    btnResetTrialDemo.classList.toggle('hidden', state.status === SUBSCRIPTION_STATUS.FREE);
  }
}

function syncTierUI() {
  if (typeof document === 'undefined') return;
  const btnTierAnnual = document.getElementById('btnTierAnnual');
  const btnTierMonthly = document.getElementById('btnTierMonthly');
  const priceLarge = document.getElementById('tierPriceLarge');
  const pricePeriod = document.getElementById('tierPricePeriod');
  const billingDetail = document.getElementById('tierBillingDetail');
  const subscribeLabel = document.getElementById('btnSubscribeLabel');
  const state = getSubscriptionState();

  if (currentTier === 'annual') {
    if (btnTierAnnual) {
      btnTierAnnual.className = 'flex-1 py-2 px-2 rounded-xl bg-terracotta text-white shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer';
    }
    if (btnTierMonthly) {
      btnTierMonthly.className = 'flex-1 py-2 px-2 rounded-xl text-stone-400 hover:text-white transition flex items-center justify-center cursor-pointer';
    }
    if (priceLarge) priceLarge.textContent = '$4.16';
    if (pricePeriod) pricePeriod.textContent = '/ month';
    if (billingDetail) billingDetail.textContent = 'Billed annually at $49.99/year (Save 40% · Includes 7-day free trial)';
    if (subscribeLabel) {
      if (state.status === SUBSCRIPTION_STATUS.PRO_ACTIVE) {
        subscribeLabel.textContent = 'Current Plan: Annual PRO ($49.99/yr)';
      } else if (state.status === SUBSCRIPTION_STATUS.TRIAL_EXPIRED) {
        subscribeLabel.textContent = 'Unlock PRO Now — $49.99/yr';
      } else {
        subscribeLabel.textContent = 'Subscribe to Annual PRO ($49.99/yr)';
      }
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
      if (state.status === SUBSCRIPTION_STATUS.PRO_ACTIVE) {
        subscribeLabel.textContent = 'Current Plan: Monthly PRO ($6.99/mo)';
      } else if (state.status === SUBSCRIPTION_STATUS.TRIAL_EXPIRED) {
        subscribeLabel.textContent = 'Unlock PRO Now — $6.99/mo';
      } else {
        subscribeLabel.textContent = 'Subscribe Monthly ($6.99/mo)';
      }
    }
  }
}

export function setupPremiumListeners(callbacks = {}) {
  if (typeof document === 'undefined') return;
  const btnOpenModal = document.getElementById('btnOpenUpgradeModal');
  const btnCloseModal = document.getElementById('btnCloseUpgradeModal');
  const btnTierAnnual = document.getElementById('btnTierAnnual');
  const btnTierMonthly = document.getElementById('btnTierMonthly');
  const btnStartTrial = document.getElementById('btnStartFreeTrial');
  const btnSubscribe = document.getElementById('btnSubscribePro');
  const btnExpireTrialNow = document.getElementById('btnExpireTrialNow');
  const btnResetTrialDemo = document.getElementById('btnResetTrialDemo');
  const btnRestore = document.getElementById('btnRestorePurchases');

  if (btnOpenModal) {
    btnOpenModal.addEventListener('click', () => openUpgradeModal());
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

  // Start 7-Day Free Trial CTA
  if (btnStartTrial) {
    btnStartTrial.addEventListener('click', () => {
      const trialState = startFreeTrial(DEFAULT_TRIAL_DURATION_MS, currentTier);
      if (typeof callbacks.onTrialStarted === 'function') {
        callbacks.onTrialStarted(trialState);
      }
      setTimeout(() => {
        closeUpgradeModal();
      }, 650);
    });
  }

  // Direct Paid PRO Subscription CTA
  if (btnSubscribe) {
    btnSubscribe.addEventListener('click', () => {
      btnSubscribe.disabled = true;
      btnSubscribe.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Activating PRO...</span>';

      setTimeout(() => {
        activatePaidSubscription(currentTier);
        btnSubscribe.disabled = false;
        btnSubscribe.innerHTML = '<i class="fa-solid fa-crown"></i> <span id="btnSubscribeLabel">PRO Membership Active!</span>';

        if (typeof callbacks.onSuccess === 'function') {
          callbacks.onSuccess(currentTier);
        }

        setTimeout(() => {
          closeUpgradeModal();
          syncTierUI();
        }, 700);
      }, 450);
    });
  }

  // Simulate Trial Expiration Now (Instant Paywall Lock Verification)
  if (btnExpireTrialNow) {
    btnExpireTrialNow.addEventListener('click', () => {
      const expiredState = expireFreeTrialNow();
      if (typeof callbacks.onTrialExpired === 'function') {
        callbacks.onTrialExpired(expiredState);
      }
    });
  }

  // Reset to Free / Untried Demo State
  if (btnResetTrialDemo) {
    btnResetTrialDemo.addEventListener('click', () => {
      const resetState = resetSubscriptionToFree();
      if (typeof callbacks.onReset === 'function') {
        callbacks.onReset(resetState);
      }
    });
  }

  if (btnRestore) {
    btnRestore.addEventListener('click', () => {
      activatePaidSubscription('annual');
      if (typeof callbacks.onRestore === 'function') {
        callbacks.onRestore();
      }
      setTimeout(closeUpgradeModal, 600);
    });
  }

  // Background Watcher: checks every second if an active free trial has expired
  if (expirationWatcherTimer) clearInterval(expirationWatcherTimer);
  let lastKnownStatus = getSubscriptionState().status;
  expirationWatcherTimer = setInterval(() => {
    const current = getSubscriptionState();
    if (lastKnownStatus === SUBSCRIPTION_STATUS.TRIAL_ACTIVE && current.status === SUBSCRIPTION_STATUS.TRIAL_EXPIRED) {
      lastKnownStatus = current.status;
      updatePremiumUI();
      syncTierUI();
      notifyPremiumListeners();
      if (typeof callbacks.onTrialExpired === 'function') {
        callbacks.onTrialExpired(current);
      }
    } else {
      lastKnownStatus = current.status;
      if (current.status === SUBSCRIPTION_STATUS.TRIAL_ACTIVE) {
        updatePremiumUI();
      }
    }
  }, 1000);

  updatePremiumUI();
  syncTierUI();
}
