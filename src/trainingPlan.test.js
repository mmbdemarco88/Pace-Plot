import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculatePaces,
  formatPace,
  formatTime,
  generate4WeekPlan,
  hydrateTrainingPlanFromCloud,
  deriveHistoricalMaxHeartRate,
  calculateHeartRateZones,
  getStoredMaxHrOverride,
  setStoredMaxHrOverride,
  buildHrZoneChartDataset
} from './trainingPlan.js';
import {
  BADGES_CONFIG,
  getUnlockedBadges,
  saveUnlockedBadges,
  evaluateBadgesFromWorkouts
} from './badges.js';
import {
  UNITS_STORAGE_KEY,
  getUnitSystem,
  setUnitSystem,
  toggleUnitSystem,
  onUnitSystemChange,
  milesToKm,
  kmToMiles,
  feetToMeters,
  metersToFeet,
  fahrenheitToCelsius,
  formatDistance,
  formatShortDistance,
  formatPaceValue,
  formatElevation,
  formatTemperature,
  formatWindSpeed
} from './units.js';
import { store, escapeHtml } from './state/store.js';
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

test('generate4WeekPlan produces a valid 4-week periodized block with weekly progression and all days completed === false', () => {
  const basePaceSec = 510; // 8:30 / mi
  const plan5k = generate4WeekPlan('5k', basePaceSec);

  assert.equal(plan5k.goalId, '5k');
  assert.equal(plan5k.goalName, '5K Race Target');
  assert.equal(plan5k.weeks.length, 4);

  // Check week structure, progression, and ensure no hardcoded completed workouts on fresh 5K plans
  plan5k.weeks.forEach((week, idx) => {
    assert.equal(week.weekNum, idx + 1);
    assert.ok(week.targetMiles > 0);
    assert.ok(week.days.length >= 4);
    week.days.forEach(day => {
      assert.ok(day.day);
      assert.ok(day.title);
      assert.ok(day.dist >= 0);
      assert.ok(day.pace);
      assert.equal(day.completed, false, `Expected ${day.day} in Week ${week.weekNum} to have completed: false`);
    });
  });

  // Week 3 should be peak volume, Week 4 should taper before race
  assert.ok(plan5k.weeks[2].targetMiles > plan5k.weeks[0].targetMiles, 'Week 3 should have higher volume than Week 1');
  assert.ok(plan5k.weeks[3].targetMiles <= plan5k.weeks[2].targetMiles, 'Week 4 should taper before race day');
});

test('generate4WeekPlan supports all distance goals (10k, half, marathon, base) and hydrateTrainingPlanFromCloud persists valid cloud plans', () => {
  const goals = ['10k', 'half', 'marathon', 'base'];
  goals.forEach(goal => {
    const plan = generate4WeekPlan(goal, 500);
    assert.equal(plan.goalId, goal);
    assert.equal(plan.weeks.length, 4);
    assert.ok(plan.predictedTime);
    plan.weeks.forEach(week => {
      week.days.forEach(day => {
        assert.equal(day.completed, false);
      });
    });
  });

  // Detailed checks for marathon branch
  const marathonPlan = generate4WeekPlan('marathon', 510);
  assert.equal(marathonPlan.goalId, 'marathon');
  assert.equal(marathonPlan.goalName, 'Marathon Peak Block');
  assert.equal(marathonPlan.targetDistance, 26.2);
  assert.equal(marathonPlan.weeks.length, 4);
  assert.ok(marathonPlan.weeks[2].targetMiles > marathonPlan.weeks[0].targetMiles, 'Marathon Week 3 should exceed Week 1 targetMiles');
  assert.ok(marathonPlan.weeks[3].targetMiles < marathonPlan.weeks[2].targetMiles, 'Marathon Week 4 should taper from Week 3');
  const raceDay = marathonPlan.weeks[3].days.find(d => d.day === 'Sun');
  assert.ok(raceDay);
  assert.equal(raceDay.dist, 26.2);
  assert.equal(raceDay.pace, marathonPlan.paces.marathonPaceFormatted);

  // Verify hydrateTrainingPlanFromCloud
  const memStore = createMemoryStorage();
  const hydrated = hydrateTrainingPlanFromCloud({ activeTrainingPlan: marathonPlan }, memStore);
  assert.deepEqual(hydrated, marathonPlan);
  assert.deepEqual(JSON.parse(memStore.getItem('paceplot_active_training_plan')), marathonPlan);
  assert.equal(hydrateTrainingPlanFromCloud({}, memStore), null);
  assert.equal(hydrateTrainingPlanFromCloud({ activeTrainingPlan: { weeks: [] } }, memStore), null);
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

test('evaluateBadgesFromWorkouts evaluates early_bird and night_owl from workout completedAt timestamps', () => {
  const prevLocalStorage = globalThis.localStorage;
  const memStore = createMemoryStorage();
  globalThis.localStorage = memStore;

  try {
    // 1. Start with empty unlocked badges and give only a 12:00 noon workout -> neither early_bird nor night_owl unlocks
    saveUnlockedBadges([]);
    const noonIso = new Date(2026, 4, 10, 12, 0, 0).toISOString();
    evaluateBadgesFromWorkouts([{ distance: 2.0, elevationGain: 20, completedAt: noonIso }]);
    let unlocked = getUnlockedBadges();
    assert.equal(unlocked.includes('early_bird'), false, 'Noon workout must not unlock early_bird');
    assert.equal(unlocked.includes('night_owl'), false, 'Noon workout must not unlock night_owl');

    // 2. Give a workout completed at 06:15 local time -> unlocks early_bird regardless of current system clock
    saveUnlockedBadges([]);
    const earlyIso = new Date(2026, 4, 10, 6, 15, 0).toISOString();
    const unlockedViaCallback = [];
    evaluateBadgesFromWorkouts(
      [{ distance: 3.1, elevationGain: 30, completedAt: earlyIso }],
      {},
      (badge) => unlockedViaCallback.push(badge.id)
    );
    unlocked = getUnlockedBadges();
    assert.equal(unlocked.includes('early_bird'), true, '06:15 workout should unlock early_bird');
    assert.equal(unlocked.includes('night_owl'), false, '06:15 workout should not unlock night_owl');
    assert.ok(unlockedViaCallback.includes('early_bird'));

    // 3. Give a workout completed at 21:30 local time -> unlocks night_owl
    saveUnlockedBadges([]);
    const nightIso = new Date(2026, 4, 10, 21, 30, 0).toISOString();
    evaluateBadgesFromWorkouts([{ distance: 3.1, elevationGain: 30, completedAt: nightIso }]);
    unlocked = getUnlockedBadges();
    assert.equal(unlocked.includes('night_owl'), true, '21:30 workout should unlock night_owl');
    assert.equal(unlocked.includes('early_bird'), false, '21:30 workout should not unlock early_bird');
  } finally {
    globalThis.localStorage = prevLocalStorage;
  }
});

test('Free Trial & Paywall State Machine unlocks PRO during trial window and locks on expiration', () => {
  const storeMem = createMemoryStorage();
  const t0 = 1_700_000_000_000;

  // 1. Initially free -> PRO features (like Spotify HUD) are locked
  const initial = getSubscriptionState(t0, storeMem);
  assert.equal(initial.status, SUBSCRIPTION_STATUS.FREE);
  assert.equal(initial.hasAccess, false);
  assert.equal(initial.canStartTrial, true);
  assert.equal(hasPremiumAccess(t0, storeMem), false);

  // 2. Start 7-Day Free Trial -> PRO features are unlocked during the trial period
  const activeTrial = startFreeTrial(DEFAULT_TRIAL_DURATION_MS, 'annual', t0, storeMem);
  assert.equal(activeTrial.status, SUBSCRIPTION_STATUS.TRIAL_ACTIVE);
  assert.equal(activeTrial.hasAccess, true);
  assert.equal(activeTrial.isTrial, true);
  assert.equal(hasPremiumAccess(t0 + 3600_000, storeMem), true);
  assert.ok(formatTrialRemaining(activeTrial.remainingMs).includes('7d'));

  // 3. Once the trial period elapses -> automatically locks user in the paywall
  const afterSevenDays = t0 + DEFAULT_TRIAL_DURATION_MS + 1000;
  const expiredState = getSubscriptionState(afterSevenDays, storeMem);
  assert.equal(expiredState.status, SUBSCRIPTION_STATUS.TRIAL_EXPIRED);
  assert.equal(expiredState.hasAccess, false);
  assert.equal(expiredState.isExpired, true);
  assert.equal(expiredState.canStartTrial, false);
  assert.equal(hasPremiumAccess(afterSevenDays, storeMem), false);

  // 4. Upgrading to paid PRO unlocks features permanently
  const paidState = activatePaidSubscription('annual', storeMem);
  assert.equal(paidState.status, SUBSCRIPTION_STATUS.PRO_ACTIVE);
  assert.equal(paidState.hasAccess, true);
  assert.equal(hasPremiumAccess(afterSevenDays + 999_999_999, storeMem), true);

  // 5. Simulate instant trial expiration helper
  resetSubscriptionToFree(storeMem);
  startFreeTrial(60_000, 'monthly', t0, storeMem);
  assert.equal(hasPremiumAccess(t0 + 1000, storeMem), true);
  const manualExpire = expireFreeTrialNow(t0 + 2000, storeMem);
  assert.equal(manualExpire.status, SUBSCRIPTION_STATUS.TRIAL_EXPIRED);
  assert.equal(manualExpire.hasAccess, false);
});

test('Theme controller persists and toggles Dark and Light mode in LocalStorage', () => {
  const storeMem = createMemoryStorage();

  // Default theme is dark
  assert.equal(getStoredTheme(storeMem), THEME_MODES.DARK);

  // Toggling switches to light and persists in storage
  const next = toggleStoredTheme(storeMem);
  assert.equal(next, THEME_MODES.LIGHT);
  assert.equal(storeMem.getItem(THEME_STORAGE_KEY), 'light');
  assert.equal(getStoredTheme(storeMem), THEME_MODES.LIGHT);

  // Toggling again switches back to dark
  const backToDark = toggleStoredTheme(storeMem);
  assert.equal(backToDark, THEME_MODES.DARK);
  assert.equal(storeMem.getItem(THEME_STORAGE_KEY), 'dark');

  // Explicit setStoredTheme normalizes invalid values safely
  setStoredTheme('light', storeMem);
  assert.equal(getStoredTheme(storeMem), THEME_MODES.LIGHT);
});

test('deriveHistoricalMaxHeartRate and calculateHeartRateZones compute personalized 5-zone BPM ranges from historical Max HR', () => {
  const storeMem = createMemoryStorage();

  // 1. Baseline historical runs detect 188 bpm peak from 10K Threshold Benchmark
  const summary = deriveHistoricalMaxHeartRate([], null);
  assert.equal(summary.detectedMaxHr, 188);
  assert.equal(summary.effectiveMaxHr, 188);
  assert.equal(summary.isCustomOverride, false);
  assert.equal(summary.totalWorkoutsAnalyzed, 6);

  // 2. Compute 5 heart rate zones for 188 bpm Max HR and 148 bpm live HR
  const zoneResult = calculateHeartRateZones(summary.effectiveMaxHr, [], 148);
  assert.equal(zoneResult.maxHr, 188);
  assert.equal(zoneResult.zones.length, 5);

  // Verify exact BPM boundaries for 188 bpm Max HR:
  // Z1 (50-60%): 94–112 bpm
  // Z2 (60-70%): 113–131 bpm
  // Z3 (70-80%): 132–149 bpm
  // Z4 (80-90%): 150–168 bpm
  // Z5 (90-100%): 169–188 bpm
  assert.equal(zoneResult.zones[0].minBpm, 94);
  assert.equal(zoneResult.zones[0].maxBpm, 112);
  assert.equal(zoneResult.zones[1].minBpm, 113);
  assert.equal(zoneResult.zones[1].maxBpm, 131);
  assert.equal(zoneResult.zones[2].minBpm, 132);
  assert.equal(zoneResult.zones[2].maxBpm, 149);
  assert.equal(zoneResult.zones[3].minBpm, 150);
  assert.equal(zoneResult.zones[3].maxBpm, 168);
  assert.equal(zoneResult.zones[4].minBpm, 169);
  assert.equal(zoneResult.zones[4].maxBpm, 188);

  // Percentages across all 5 zones must sum to 100%
  const pctSum = zoneResult.zones.reduce((sum, z) => sum + z.percentage, 0);
  assert.equal(pctSum, 100);

  // Live HR of 148 bpm should map to Zone 3 (132-149 bpm)
  assert.equal(zoneResult.activeZone.zone, 3);
  assert.equal(zoneResult.zones[2].isLiveZone, true);

  // 3. Adding a high-intensity workout or custom override shifts all 5 zones
  setStoredMaxHrOverride(194, storeMem);
  assert.equal(getStoredMaxHrOverride(storeMem), 194);
  const customSummary = deriveHistoricalMaxHeartRate([], getStoredMaxHrOverride(storeMem));
  assert.equal(customSummary.effectiveMaxHr, 194);
  assert.equal(customSummary.isCustomOverride, true);

  const customZones = calculateHeartRateZones(customSummary.effectiveMaxHr, [], 148);
  assert.equal(customZones.zones[1].minBpm, Math.round(194 * 0.60)); // 116 bpm
  assert.equal(customZones.zones[4].maxBpm, 194);

  // 4. Verify D3.js bar chart dataset transformation
  const d3Model = buildHrZoneChartDataset(zoneResult);
  assert.equal(d3Model.maxHr, 188);
  assert.equal(d3Model.totalMinutes, 222); // 3h 42m = 222 minutes
  assert.equal(d3Model.items.length, 5);
  assert.equal(d3Model.items[0].code, 'Z1');
  assert.equal(d3Model.items[1].code, 'Z2');
  assert.equal(d3Model.items[1].bpmShort, '113–131');
  assert.ok(d3Model.items[1].minutes > d3Model.items[4].minutes, 'Zone 2 aerobic base has more weekly minutes than Zone 5 peak');
  assert.ok(d3Model.items.every((item) => item.fillHex.startsWith('#')));
});

test('gpsEngine computes real Haversine distances, live GPS pace, jitter filtering, and BLE heart rate bytes', async () => {
  const {
    haversineDistanceMeters,
    haversineDistanceMiles,
    computeLiveGpsPace,
    evaluateGpsFixMovement,
    parseBleHeartRateMeasurement
  } = await import('./gpsEngine.js');

  const start = { lat: 41.3857, lng: -81.7058 };
  const oneKmNorth = { lat: 41.3947, lng: -81.7058 }; // ~1000.8 meters
  const distMeters = haversineDistanceMeters(start, oneKmNorth);
  assert.ok(distMeters > 995 && distMeters < 1005);

  const distMiles = haversineDistanceMiles(start, oneKmNorth);
  assert.ok(distMiles > 0.61 && distMiles < 0.63);

  // Jitter filter rejects < 2.5m stationary drift and accepts real running movement
  const driftFix = evaluateGpsFixMovement(start, { lat: 41.385705, lng: -81.705805 }, 8);
  assert.equal(driftFix.accepted, false);

  const realStepFix = evaluateGpsFixMovement(start, { lat: 41.38585, lng: -81.7058 }, 8);
  assert.equal(realStepFix.accepted, true);
  assert.ok(realStepFix.deltaMeters > 15);

  // Live pace calculation from speed (3.35 m/s = ~8'00"/mi)
  const paceFromSpeed = computeLiveGpsPace(0.5, 240, 3.3528);
  assert.equal(paceFromSpeed.formatted, `8'00"`);

  // BLE Heart Rate 8-bit & 16-bit GATT measurement parsing
  const buf8 = new Uint8Array([0x00, 154]).buffer;
  assert.equal(parseBleHeartRateMeasurement(new DataView(buf8)), 154);

  const buf16 = new Uint8Array([0x01, 172, 0x00]).buffer;
  assert.equal(parseBleHeartRateMeasurement(new DataView(buf16)), 172);

  // Full address formatting from Photon properties
  const { formatFullPhotonAddress } = await import('./gpsEngine.js');
  const fullAddr = formatFullPhotonAddress({
    name: 'West Creek Reservation',
    housenumber: '2277',
    street: 'West Ridgewood Drive',
    city: 'Parma',
    state: 'Ohio',
    postcode: '44134'
  });
  assert.equal(fullAddr, 'West Creek Reservation, 2277 West Ridgewood Drive, Parma, Ohio 44134');
});

test('units module converts and formats Metric and Imperial distances, paces, elevations, and weather accurately', () => {
  const memStore = createMemoryStorage();
  const observedChanges = [];
  const unsub = onUnitSystemChange((sys) => observedChanges.push(sys));

  assert.equal(getUnitSystem(memStore), 'imperial');
  assert.equal(toggleUnitSystem(memStore), 'metric');
  assert.equal(memStore.getItem(UNITS_STORAGE_KEY), 'metric');
  assert.equal(getUnitSystem(memStore), 'metric');
  assert.equal(toggleUnitSystem(memStore), 'imperial');
  assert.equal(setUnitSystem('metric', memStore), 'metric');
  assert.equal(setUnitSystem('invalid_val', memStore), 'imperial');
  unsub();
  setUnitSystem('metric', memStore);
  assert.deepEqual(observedChanges, ['metric', 'imperial', 'metric', 'imperial']);

  // Core numeric conversions
  assert.ok(Math.abs(milesToKm(3.1) - 4.9889664) < 1e-5);
  assert.ok(Math.abs(kmToMiles(4.9889664) - 3.1) < 1e-5);
  assert.ok(Math.abs(feetToMeters(100) - 30.48) < 1e-5);
  assert.ok(Math.abs(metersToFeet(30.48) - 100) < 1e-5);
  assert.equal(fahrenheitToCelsius(64), 18);
  assert.equal(fahrenheitToCelsius(32), 0);

  // Formatters in Imperial vs Metric
  assert.equal(formatDistance(3.1, 'imperial', 2), '3.10 mi');
  assert.equal(formatDistance(3.1, 'metric', 2), '4.99 km');

  assert.equal(formatShortDistance(106.68, 'imperial'), 'In 350 ft');
  assert.equal(formatShortDistance(643.7376, 'imperial'), 'In 0.4 mi');
  assert.equal(formatShortDistance(106.68, 'metric'), 'In 107 m');
  assert.equal(formatShortDistance(643.7376, 'metric'), 'In 0.6 km');

  assert.equal(formatPaceValue(510, 'imperial', true), `8'30"/mi`);
  assert.equal(formatPaceValue(510, 'metric', true), `5'17"/km`);
  assert.equal(formatPaceValue(510, 'metric', false), `5'17"`);

  assert.equal(formatElevation('+42 ft', 'imperial', false), '+42 ft');
  assert.equal(formatElevation('+42 ft', 'metric', false), '+13 m');
  assert.equal(formatElevation(13, 'imperial', true), '+43 ft');
  assert.equal(formatElevation(13, 'metric', true), '+13 m');

  assert.equal(formatTemperature(64, 'imperial'), '64°F');
  assert.equal(formatTemperature(64, 'metric'), '18°C');

  assert.equal(formatWindSpeed(6, 'imperial'), '6 mph');
  assert.equal(formatWindSpeed(6, 'metric'), '10 km/h');
});

test('store and hrZoneChart satisfy M1 state and selective D3 import contracts', () => {
  assert.equal(store.activeKey, 'parma');
  assert.equal(store.currentGoalId, '5k');
  assert.equal(store.currentPlanWeek, 0);
  assert.equal(store.activeSurfaceFilter, 'trail');
  assert.equal(store.beaconSessionId, 'stride-safe-7b49');
  assert.equal(store.isOffRoute, false);
  assert.equal(escapeHtml('<script>"alert(\'x\')&"</script>'), '&lt;script&gt;&quot;alert(&#39;x&#39;)&amp;&quot;&lt;/script&gt;');

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const hrChartSource = fs.readFileSync(path.join(__dirname, 'hrZoneChart.js'), 'utf8');
  assert.equal(hrChartSource.includes("from 'd3'"), false, 'hrZoneChart.js must not import monolithic d3');
  assert.ok(hrChartSource.includes("from 'd3-selection'"));
  assert.ok(hrChartSource.includes("from 'd3-scale'"));
  assert.ok(hrChartSource.includes("from 'd3-axis'"));
});
