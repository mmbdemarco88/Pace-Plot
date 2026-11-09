import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePaces, formatPace, formatTime, generate4WeekPlan } from './trainingPlan.js';
import { BADGES_CONFIG, getUnlockedBadges } from './badges.js';
import {
  SUBSCRIPTION_STATUS,
  DEFAULT_TRIAL_DURATION_MS,
  getSubscriptionState,
  hasPremiumAccess,
  startFreeTrial,
  expireFreeTrialNow,
  activatePaidSubscription,
  resetSubscriptionToFree,
  formatTrialRemaining
} from './premium.js';
import {
  THEME_STORAGE_KEY,
  THEME_MODES,
  getStoredTheme,
  setStoredTheme,
  toggleStoredTheme
} from './theme.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    }
  };
}

test('calculatePaces computes accurate aerobic and threshold training zones', () => {
  const basePaceSec = 480; // 8:00 / mi
  const zones = calculatePaces(basePaceSec);

  assert.equal(zones.easyPace, 535); // +55s
  assert.equal(zones.tempoPace, 495); // +15s
  assert.equal(zones.intervalPace, 455); // -25s

  assert.equal(zones.easyPaceFormatted, `8'55"/mi`);
  assert.equal(zones.tempoPaceFormatted, `8'15"/mi`);
  assert.equal(zones.intervalPaceFormatted, `7'35"/mi`);
});

test('formatPace and formatTime correctly format times and paces', () => {
  assert.equal(formatPace(512), `8'32"/mi`);
  assert.equal(formatPace(480), `8'00"/mi`);
  assert.equal(formatTime(3600), '1h 00m');
  assert.equal(formatTime(1525), '25m 25s');
  assert.equal(formatTime(4500), '1h 15m');
});

test('generate4WeekPlan produces a valid 4-week periodized block with weekly progression', () => {
  const basePaceSec = 510; // 8:30 / mi
  const plan5k = generate4WeekPlan('5k', basePaceSec);

  assert.equal(plan5k.goalId, '5k');
  assert.equal(plan5k.goalName, '5K Race Target');
  assert.equal(plan5k.weeks.length, 4);

  // Check week structure and progression
  plan5k.weeks.forEach((week, idx) => {
    assert.equal(week.weekNum, idx + 1);
    assert.ok(week.targetMiles > 0);
    assert.ok(week.days.length >= 4);
    week.days.forEach(day => {
      assert.ok(day.day);
      assert.ok(day.title);
      assert.ok(day.dist >= 0);
      assert.ok(day.pace);
    });
  });

  // Week 3 should be peak volume, Week 4 should taper before race
  assert.ok(plan5k.weeks[2].targetMiles > plan5k.weeks[0].targetMiles, 'Week 3 should have higher volume than Week 1');
  assert.ok(plan5k.weeks[3].targetMiles <= plan5k.weeks[2].targetMiles, 'Week 4 should taper before race day');
});

test('generate4WeekPlan supports all distance goals (10k, half, base)', () => {
  const goals = ['10k', 'half', 'base'];
  goals.forEach(goal => {
    const plan = generate4WeekPlan(goal, 500);
    assert.equal(plan.goalId, goal);
    assert.equal(plan.weeks.length, 4);
    assert.ok(plan.predictedTime);
  });
});

test('BADGES_CONFIG contains required athletic milestones', () => {
  assert.ok(BADGES_CONFIG.length >= 8);
  const badgeIds = BADGES_CONFIG.map(b => b.id);
  assert.ok(badgeIds.includes('early_bird'));
  assert.ok(badgeIds.includes('pace_5k'));
  assert.ok(badgeIds.includes('pace_10k'));
  assert.ok(badgeIds.includes('half_marathon'));
  assert.ok(badgeIds.includes('marathon_milestone'));
});

test('getUnlockedBadges provides initial unlocked milestones out of the box', () => {
  const unlocked = getUnlockedBadges();
  assert.ok(Array.isArray(unlocked));
  assert.ok(unlocked.includes('early_bird'));
  assert.ok(unlocked.includes('pace_5k'));
});

test('Free Trial & Paywall State Machine unlocks PRO during trial window and locks on expiration', () => {
  const store = createMemoryStorage();
  const t0 = 1_700_000_000_000;

  // 1. Initially free -> PRO features (like Spotify HUD) are locked
  const initial = getSubscriptionState(t0, store);
  assert.equal(initial.status, SUBSCRIPTION_STATUS.FREE);
  assert.equal(initial.hasAccess, false);
  assert.equal(initial.canStartTrial, true);
  assert.equal(hasPremiumAccess(t0, store), false);

  // 2. Start 7-Day Free Trial -> PRO features are unlocked during the trial period
  const activeTrial = startFreeTrial(DEFAULT_TRIAL_DURATION_MS, 'annual', t0, store);
  assert.equal(activeTrial.status, SUBSCRIPTION_STATUS.TRIAL_ACTIVE);
  assert.equal(activeTrial.hasAccess, true);
  assert.equal(activeTrial.isTrial, true);
  assert.equal(hasPremiumAccess(t0 + 3600_000, store), true);
  assert.ok(formatTrialRemaining(activeTrial.remainingMs).includes('7d'));

  // 3. Once the trial period elapses -> automatically locks user in the paywall
  const afterSevenDays = t0 + DEFAULT_TRIAL_DURATION_MS + 1000;
  const expiredState = getSubscriptionState(afterSevenDays, store);
  assert.equal(expiredState.status, SUBSCRIPTION_STATUS.TRIAL_EXPIRED);
  assert.equal(expiredState.hasAccess, false);
  assert.equal(expiredState.isExpired, true);
  assert.equal(expiredState.canStartTrial, false);
  assert.equal(hasPremiumAccess(afterSevenDays, store), false);

  // 4. Upgrading to paid PRO unlocks features permanently
  const paidState = activatePaidSubscription('annual', store);
  assert.equal(paidState.status, SUBSCRIPTION_STATUS.PRO_ACTIVE);
  assert.equal(paidState.hasAccess, true);
  assert.equal(hasPremiumAccess(afterSevenDays + 999_999_999, store), true);

  // 5. Simulate instant trial expiration helper
  resetSubscriptionToFree(store);
  startFreeTrial(60_000, 'monthly', t0, store);
  assert.equal(hasPremiumAccess(t0 + 1000, store), true);
  const manualExpire = expireFreeTrialNow(t0 + 2000, store);
  assert.equal(manualExpire.status, SUBSCRIPTION_STATUS.TRIAL_EXPIRED);
  assert.equal(manualExpire.hasAccess, false);
});

test('Theme controller persists and toggles Dark and Light mode in LocalStorage', () => {
  const store = createMemoryStorage();

  // Default theme is dark
  assert.equal(getStoredTheme(store), THEME_MODES.DARK);

  // Toggling switches to light and persists in storage
  const next = toggleStoredTheme(store);
  assert.equal(next, THEME_MODES.LIGHT);
  assert.equal(store.getItem(THEME_STORAGE_KEY), 'light');
  assert.equal(getStoredTheme(store), THEME_MODES.LIGHT);

  // Toggling again switches back to dark
  const backToDark = toggleStoredTheme(store);
  assert.equal(backToDark, THEME_MODES.DARK);
  assert.equal(store.getItem(THEME_STORAGE_KEY), 'dark');

  // Explicit setStoredTheme normalizes invalid values safely
  setStoredTheme('light', store);
  assert.equal(getStoredTheme(store), THEME_MODES.LIGHT);
});
