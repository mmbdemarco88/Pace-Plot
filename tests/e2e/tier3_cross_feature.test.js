// -----------------------------------------------------------------------------
// Pace Plot — Tier 3: Cross-Feature Combinations E2E Suite (`tier3_cross_feature.test.js`)
// 18 Test Cases verifying pairwise and multi-feature interactions across F1–F17.
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setupMockBrowserEnv,
  createMemoryStorage,
  projectFileExists,
  readProjectFile,
  getAssembledIndexHtml
} from './helpers.js';

test('[Tier 3 | F4+F5] Waypoint loop generation street-snaps via OSRM while preserving waypoint AND calibrating distance', async () => {
  const { fetch } = setupMockBrowserEnv({
    fetchOptions: { osrmDetourFactor: 1.35 }
  });
  const { fetchStreetSnappedLoopFromOsrm } = await import('../../src/gpsEngine.js');

  const wp = { lat: 41.3920, lng: -81.7000 };
  const ninePointLoop = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3875, lng: -81.7040 },
    { lat: 41.3895, lng: -81.7020 },
    wp,
    { lat: 41.3940, lng: -81.6975 },
    { lat: 41.3915, lng: -81.6950 },
    { lat: 41.3885, lng: -81.6980 },
    { lat: 41.3868, lng: -81.7020 },
    { lat: 41.3857, lng: -81.7058 }
  ];

  const snapped = await fetchStreetSnappedLoopFromOsrm(ninePointLoop, 'Calibrated Waypoint Loop', {
    targetDistanceMiles: 3.5,
    preserveWaypoint: wp,
    fetchImpl: fetch
  });

  assert.ok(snapped);
  const osrmCalls = fetch.calls.filter((c) => c.url.includes('router.project-osrm.org'));
  assert.ok(osrmCalls.length >= 2, 'Should perform OSRM calibration refinement');
  osrmCalls.forEach((call) => {
    assert.ok(
      call.url.includes(`${wp.lng.toFixed(6)},${wp.lat.toFixed(6)}`),
      'Both initial and calibrated OSRM requests must preserve the pinned waypoint'
    );
  });
});

test('[Tier 3 | F4+F6] OSRM-calibrated loop choices integrate with Overpass safety metrics and surface filter ranking', async () => {
  const { fetch } = setupMockBrowserEnv({
    fetchOptions: { fixedOsrmDistanceMeters: 5020 }
  });
  const { fetchOsmSafetyAndSurfaceMetrics, filterAndRankRoutesBySurface } = await import('../../src/gpsEngine.js');
  const { generateMultipleLoopChoices } = await import('../../src/mapController.js');

  const osmMetrics = await fetchOsmSafetyAndSurfaceMetrics(41.3857, -81.7058, 1200, { fetchImpl: fetch });
  const choices = generateMultipleLoopChoices(41.3857, -81.7058, 'West Creek', 3.1);
  await new Promise((r) => setTimeout(r, 40));

  const rankedForLit = filterAndRankRoutesBySurface(choices, 'lit', osmMetrics);
  assert.equal(rankedForLit.length, 4);
  assert.equal(rankedForLit[0].distance, 3.12);
  assert.ok(Number.parseFloat(rankedForLit[0].safetyScore) >= 8.5);
});

test('[Tier 3 | F5+F17] Long-press waypoint loop generation in Leaflet Fallback mode updates waypoint marker and polylines', async () => {
  const { window, document, L } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const {
    initLeafletFallback,
    handleMapLongPress,
    updateWaypointMarker,
    generateLoopChoicesWithWaypoint
  } = await import('../../src/mapController.js');

  store.googleMap = null;
  initLeafletFallback(document.getElementById('map') || document.createElement('div'));
  assert.ok(window.__activeLeafletMap);

  await handleMapLongPress({ lat: 41.3915, lng: -81.7005 });
  updateWaypointMarker(41.3915, -81.7005);
  const choices = generateLoopChoicesWithWaypoint(41.3857, -81.7058, 41.3915, -81.7005, 'Leaflet Pin', 3.1);
  await new Promise((r) => setTimeout(r, 50));

  assert.equal(choices.length, 4);
  assert.ok(L.createdMarkers.length >= 2, 'Expected start, dropped-pin, and waypoint markers on Leaflet map');
  assert.ok(L.createdPolylines.length >= 2, 'Expected route polylines updated on Leaflet map');
});

test('[Tier 3 | F6+F17] Surface filter re-ranking in Leaflet Fallback mode updates activeRoute and Leaflet polylines', async () => {
  const { document, L } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { filterAndRankRoutesBySurface } = await import('../../src/gpsEngine.js');
  const { initLeafletFallback, renderRoute } = await import('../../src/mapController.js');

  store.googleMap = null;
  initLeafletFallback(document.getElementById('map') || document.createElement('div'));

  const rankedRoad = filterAndRankRoutesBySurface(store.currentRouteChoices, 'road');
  store.activeSurfaceFilter = 'road';
  store.currentRouteChoices = rankedRoad;
  store.activeRoute = rankedRoad[0];

  const polylinesBefore = L.createdPolylines.length;
  renderRoute(store.activeRoute);
  assert.ok(L.createdPolylines.length > polylinesBefore);
});

test('[Tier 3 | F7+F16] Open-Meteo elevation profile formats UI stats in Metric (m) vs Imperial (ft) while GPX keeps <ele> in meters', async () => {
  const { document, localStorage } = setupMockBrowserEnv({
    fetchOptions: { elevationsMeters: [200.0, 215.0, 230.0, 210.0, 200.0] }
  });
  const { setUnitSystem, formatElevation } = await import('../../src/units.js');
  const { fetchRouteElevationProfile, buildRouteGpxString } = await import('../../src/gpsEngine.js');
  const { updateElevationChartSVG } = await import('../../src/mapController.js');

  const routeData = {
    title: 'Dual Unit Elevation Loop',
    path: [
      { lat: 41.3857, lng: -81.7058 },
      { lat: 41.3870, lng: -81.7040 },
      { lat: 41.3890, lng: -81.7020 },
      { lat: 41.3875, lng: -81.7000 },
      { lat: 41.3857, lng: -81.7058 }
    ]
  };

  setUnitSystem('metric', localStorage);
  const profile = await fetchRouteElevationProfile(routeData.path);
  await updateElevationChartSVG(routeData);

  const metricGainLabel = formatElevation(profile.gainMeters, 'metric', true);
  assert.equal(metricGainLabel, '+30 m');
  const statsEl = document.getElementById('elevProfileStats');
  if (statsEl) {
    assert.ok(statsEl.textContent.includes('m'), `Expected metric 'm' in #elevProfileStats, got "${statsEl.textContent}"`);
  }

  // Switch to Imperial and verify GPX <ele> STILL outputs meters (200.0, 230.0) per GPX 1.1 spec
  setUnitSystem('imperial', localStorage);
  const gpx = buildRouteGpxString(routeData, profile.elevationsMeters);
  assert.ok(gpx.includes('<ele>200.0</ele>'));
  assert.ok(gpx.includes('<ele>230.0</ele>'));
});

test('[Tier 3 | F4+F16] OSRM-calibrated route updates planner mileage badges in Metric (km) when unit system is metric', async () => {
  const { document, localStorage } = setupMockBrowserEnv();
  const { setUnitSystem } = await import('../../src/units.js');
  const { updateRouteInfoUI } = await import('../../src/mapController.js');

  setUnitSystem('metric', localStorage);
  updateRouteInfoUI({
    title: 'Metric 5K Loop',
    distance: 3.1,
    elevation: '+42 ft',
    safetyScore: '9.9',
    sidewalkPct: '100%',
    litPct: '98%',
    path: [
      { lat: 41.3857, lng: -81.7058 },
      { lat: 41.3900, lng: -81.7000 },
      { lat: 41.3857, lng: -81.7058 }
    ]
  });

  const mileageBadge = document.getElementById('routeMileageBadge');
  const compactMileage = document.getElementById('compactRouteMileage');
  assert.ok(mileageBadge.textContent.includes('km'), `Expected km in #routeMileageBadge, got "${mileageBadge.textContent}"`);
  assert.ok(compactMileage.textContent.includes('km'), `Expected km in #compactRouteMileage, got "${compactMileage.textContent}"`);
});

test('[Tier 3 | F8+F14] Off-route >50m deviation during GPS navigation triggers auto-reroute AND updates Live SafeGuard Beacon', async () => {
  const { fetch } = setupMockBrowserEnv({ batteryLevel: 0.76 });
  const { store } = await import('../../src/state/store.js');
  const { handleRealGpsPositionUpdate } = await import('../../src/mapController.js');
  const { syncLiveBeaconSession } = await import('../../src/safeGuard.js');

  store.isNavigating = true;
  store.navIsPaused = false;
  store.lastRerouteTimestamp = 0;
  store.lastAcceptedGpsCoord = { lat: 41.3857, lng: -81.7058 };
  store.activeRoute = {
    title: 'Beacon Reroute Loop',
    distance: 3.1,
    path: [
      { lat: 41.3857, lng: -81.7058 },
      { lat: 41.3900, lng: -81.7058 },
      { lat: 41.3857, lng: -81.7058 }
    ],
    maneuvers: [{ text: 'Start', dist: 'Start', lat: 41.3857, lng: -81.7058 }]
  };

  await handleRealGpsPositionUpdate({
    coords: { latitude: 41.3860, longitude: -81.7044, accuracy: 7, speed: 3.3 }
  });

  const beaconPayload = await syncLiveBeaconSession({ active: true });
  assert.equal(store.isOffRoute, true);
  assert.ok(fetch.calls.some((c) => c.url.includes('router.project-osrm.org')));
  assert.equal(beaconPayload.lat, 41.386);
  assert.equal(beaconPayload.lng, -81.7044);
  assert.equal(beaconPayload.batteryPct, 76);
});

test('[Tier 3 | F8+F17] Off-route >50m auto-rerouting in Leaflet Fallback mode redraws rerouted polyline on window.__activeLeafletMap', async () => {
  const { document, L } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { initLeafletFallback, handleRealGpsPositionUpdate } = await import('../../src/mapController.js');

  store.googleMap = null;
  initLeafletFallback(document.getElementById('map') || document.createElement('div'));
  store.isNavigating = true;
  store.navIsPaused = false;
  store.lastRerouteTimestamp = 0;
  store.lastAcceptedGpsCoord = { lat: 41.3857, lng: -81.7058 };
  store.activeRoute = {
    title: 'Leaflet Off-Route Loop',
    distance: 3.1,
    center: { lat: 41.3857, lng: -81.7058 },
    path: [
      { lat: 41.3857, lng: -81.7058 },
      { lat: 41.3900, lng: -81.7058 },
      { lat: 41.3857, lng: -81.7058 }
    ],
    maneuvers: [{ text: 'Start', dist: 'Start', lat: 41.3857, lng: -81.7058 }]
  };

  const polylinesBefore = L.createdPolylines.length;
  await handleRealGpsPositionUpdate({
    coords: { latitude: 41.3860, longitude: -81.7044, accuracy: 7, speed: 3.2 }
  });
  await new Promise((r) => setTimeout(r, 40));

  assert.ok(L.createdPolylines.length > polylinesBefore, 'Expected Leaflet polylines to update after off-route reroute');
});

test('[Tier 3 | F9+F10+F13] Fresh Marathon and 5K plans have 0 completed days and round-trip through cloud profile hydration', async () => {
  const storage = createMemoryStorage();
  const { generate4WeekPlan, hydrateTrainingPlanFromCloud } = await import('../../src/trainingPlan.js');

  const marathonPlan = generate4WeekPlan('marathon', 480);
  assert.equal(marathonPlan.weeks.flatMap((w) => w.days).filter((d) => d.completed).length, 0);

  const hydrated = hydrateTrainingPlanFromCloud({ activeTrainingPlan: marathonPlan }, storage);
  assert.equal(hydrated.goalId, 'marathon');
  assert.equal(hydrated.targetDistance, 26.2);
  assert.equal(hydrated.weeks.flatMap((w) => w.days).filter((d) => d.completed).length, 0);
});

test('[Tier 3 | F9+F16] Marathon 26.2-mile training plan distances and paces format accurately in Metric (42.16 km, /km)', async () => {
  const { generate4WeekPlan } = await import('../../src/trainingPlan.js');
  const { formatDistance, formatPaceValue } = await import('../../src/units.js');

  const plan = generate4WeekPlan('marathon', 480); // 8:00/mi -> 510s marathon pace
  assert.equal(formatDistance(plan.targetDistance, 'metric', 2), '42.16 km');
  assert.equal(formatDistance(plan.weeks[2].days[3].dist, 'metric', 1), '32.2 km'); // 20.0 mi peak long run
  assert.equal(formatPaceValue(plan.paces.marathonPace, 'metric', true), `5'17"/km`);
});

test('[Tier 3 | F11+F12] Offline early-morning (06:15) workout queues locally, unlocks early_bird, and preserves completedAt on sync', async () => {
  const { localStorage } = setupMockBrowserEnv({
    onLine: false,
    initialLocalStorage: { paceplot_unlocked_badges: JSON.stringify([]) }
  });
  const { evaluateBadgesFromWorkouts, getUnlockedBadges } = await import('../../src/badges.js');
  const { enqueueOfflineWorkout, flushOfflineWorkoutQueue } = await import('../../src/firebase.js');

  const earlyWorkout = {
    routeTitle: 'Offline Dawn 5K',
    distance: 3.2,
    durationSeconds: 1580,
    completedAt: '2026-05-10T06:15:00'
  };

  evaluateBadgesFromWorkouts([earlyWorkout]);
  assert.ok(getUnlockedBadges().includes('early_bird'));

  await enqueueOfflineWorkout(earlyWorkout, localStorage);

  let syncedPayload = null;
  await flushOfflineWorkoutQueue({
    storage: localStorage,
    isOnline: true,
    user: { uid: 'runner_dawn' },
    uploadFn: async (w) => {
      syncedPayload = w;
      return 'cloud_doc_1';
    }
  });

  assert.ok(syncedPayload);
  assert.equal(syncedPayload.completedAt, '2026-05-10T06:15:00');
});

test('[Tier 3 | F11+F12] Offline late-night (21:30) workout queues to CacheStorage, flushes on reconnect, and unlocks night_owl', async () => {
  const { localStorage, caches } = setupMockBrowserEnv({
    onLine: false,
    initialLocalStorage: { paceplot_unlocked_badges: JSON.stringify([]) }
  });
  const { evaluateBadgesFromWorkouts, getUnlockedBadges } = await import('../../src/badges.js');
  const { enqueueOfflineWorkout, flushOfflineWorkoutQueue } = await import('../../src/firebase.js');

  const nightWorkout = {
    routeTitle: 'Night Lit Boulevard 10K',
    distance: 6.2,
    durationSeconds: 3100,
    completedAt: '2026-05-10T21:30:00'
  };

  await enqueueOfflineWorkout(nightWorkout, localStorage);
  const cached = await caches.match('/__offline_workout_queue');
  assert.ok(cached, 'Expected workout mirrored in CacheStorage');

  const syncedItems = [];
  await flushOfflineWorkoutQueue({
    storage: localStorage,
    isOnline: true,
    user: { uid: 'runner_night' },
    uploadFn: async (w) => {
      syncedItems.push(w);
      return 'cloud_doc_2';
    }
  });

  // Simulate cloud workout snapshot evaluation the next morning
  evaluateBadgesFromWorkouts(syncedItems);
  assert.ok(getUnlockedBadges().includes('night_owl'));
  assert.ok(getUnlockedBadges().includes('pace_10k'));
});

test('[Tier 3 | F13+F15] Cloud-hydrated subscription state controls access to client-side Spotify PKCE OAuth flow', async () => {
  const { window, localStorage } = setupMockBrowserEnv({
    fetchOptions: { disableSpotifyDevMiddleware: true }
  });
  const { hydrateSubscriptionFromCloud, hasPremiumAccess } = await import('../../src/premium.js');
  const { setCustomSpotifyClientId, initiateSpotifyOAuthPopup } = await import('../../src/spotify.js');

  // 1. Expired trial in cloud locks PRO access
  hydrateSubscriptionFromCloud(
    {
      subscriptionStatus: 'trial_expired',
      trialStartedAt: Date.now() - 8 * 86400 * 1000,
      trialExpiresAt: Date.now() - 86400 * 1000
    },
    localStorage
  );
  assert.equal(hasPremiumAccess(Date.now(), localStorage), false);

  // 2. Upgrading/hydrating pro_active in cloud unlocks PRO and allows client-side PKCE OAuth
  hydrateSubscriptionFromCloud({ subscriptionStatus: 'pro_active', tier: 'annual' }, localStorage);
  assert.equal(hasPremiumAccess(Date.now(), localStorage), true);

  setCustomSpotifyClientId('pro_spotify_client_id');
  const oauthRes = await initiateSpotifyOAuthPopup();
  assert.equal(oauthRes.opened, true);
  assert.ok(window.openedWindows[0].url.startsWith('https://accounts.spotify.com/authorize'));
});

test('[Tier 3 | F1+F3+F16] Store live BLE heart rate, selective-D3 5-zone bar chart, and Metric unit system work together', async () => {
  const { document, localStorage } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { setUnitSystem, formatDistance } = await import('../../src/units.js');
  const { parseBleHeartRateMeasurement } = await import('../../src/gpsEngine.js');
  const { calculateHeartRateZones } = await import('../../src/trainingPlan.js');
  const { renderD3HeartRateZonesBarChart } = await import('../../src/hrZoneChart.js');

  setUnitSystem('metric', localStorage);
  const packet = new DataView(new Uint8Array([0x00, 172]).buffer); // 172 bpm -> Zone 5 for 188 Max HR
  store.currentLiveSensorHr = parseBleHeartRateMeasurement(packet);
  assert.equal(store.currentLiveSensorHr, 172);

  const zones = calculateHeartRateZones(188, [], store.currentLiveSensorHr);
  assert.equal(zones.activeZone.zone, 5);

  const container = document.createElement('div');
  renderD3HeartRateZonesBarChart(container, zones, { isDark: true });
  const xLabels = container.querySelectorAll('.d3-hr-x-zone');
  assert.equal(xLabels[4].textContent, 'Z5 •');
  assert.equal(formatDistance(6.2, 'metric', 1), '10.0 km');
});

test('[Tier 3 | F2+F12+F15] Offline-first CSS/FontAwesome build, SW background sync, and static Spotify callback coexist with zero CDNs', () => {
  assert.ok(projectFileExists('tailwind.config.js'));
  assert.ok(projectFileExists('src/styles/main.css'));
  assert.ok(projectFileExists('public/sw.js'));
  assert.ok(projectFileExists('public/auth/callback/index.html'));

  const assembledHtml = getAssembledIndexHtml();
  const callbackHtml = readProjectFile('public/auth/callback/index.html');
  assert.ok(!assembledHtml.includes('cdn.tailwindcss.com'));
  assert.ok(!callbackHtml.includes('cdn.tailwindcss.com'));
});

test('[Tier 3 | F1+F7+F8] Modularized mapController updates SVG elevation runner dot during navigation and handles off-route state', async () => {
  const { document } = setupMockBrowserEnv({
    fetchOptions: { elevationsMeters: [200.0, 225.0, 250.0, 215.0, 200.0] }
  });
  const { store } = await import('../../src/state/store.js');
  const { updateElevationChartSVG, updateNavStep } = await import('../../src/mapController.js');
  const { evaluateOffRouteDeviation } = await import('../../src/gpsEngine.js');

  store.activeRoute = {
    title: 'Modular Elevation & Off-Route Loop',
    distance: 3.1,
    path: [
      { lat: 41.3857, lng: -81.7058 },
      { lat: 41.3875, lng: -81.7040 },
      { lat: 41.3895, lng: -81.7020 },
      { lat: 41.3875, lng: -81.7000 },
      { lat: 41.3857, lng: -81.7058 }
    ],
    maneuvers: [
      { text: 'Start', dist: 'Start' },
      { text: 'Climb', dist: 'In 1.0 mi' },
      { text: 'Summit', dist: 'In 1.5 mi' },
      { text: 'Descend', dist: 'In 2.2 mi' },
      { text: 'Finish', dist: 'In 3.1 mi' }
    ]
  };

  await updateElevationChartSVG(store.activeRoute);
  updateNavStep(2, true, false);
  const dot = document.getElementById('elevRunnerDot');
  assert.ok(Number(dot.getAttribute('cy')) < 32);

  const offRouteCheck = evaluateOffRouteDeviation({ lat: 41.3950, lng: -81.7020 }, store.activeRoute.path, 50);
  assert.equal(offRouteCheck.isOffRoute, true);
});

test('[Tier 3 | F10+F11+F13] Completing a fresh 5K plan workout updates completion state, evaluates completedAt badge, and persists plan', async () => {
  const storage = createMemoryStorage();
  setupMockBrowserEnv({
    initialLocalStorage: { paceplot_unlocked_badges: JSON.stringify([]) }
  });
  const { generate4WeekPlan, hydrateTrainingPlanFromCloud } = await import('../../src/trainingPlan.js');
  const { evaluateBadgesFromWorkouts, getUnlockedBadges } = await import('../../src/badges.js');

  const plan = generate4WeekPlan('5k', 510);
  assert.equal(plan.weeks[0].days[0].completed, false);

  // Runner completes Week 1 Monday at 6:05 AM
  plan.weeks[0].days[0].completed = true;
  evaluateBadgesFromWorkouts([
    {
      routeTitle: plan.weeks[0].days[0].title,
      distance: plan.weeks[0].days[0].dist,
      completedAt: '2026-05-11T06:05:00'
    }
  ]);

  assert.ok(getUnlockedBadges().includes('early_bird'));
  const hydrated = hydrateTrainingPlanFromCloud({ activeTrainingPlan: plan }, storage);
  assert.equal(hydrated.weeks[0].days[0].completed, true);
  assert.equal(hydrated.weeks[0].days[1].completed, false);
});

test('[Tier 3 | F14+F16+F17] Live SafeGuard Beacon viewer (?track=) updates runner marker on Leaflet Fallback map with Metric formatting', async () => {
  const { document, localStorage, L } = setupMockBrowserEnv({
    url: 'http://localhost:3000/?track=stride-safe-live99'
  });
  const { store } = await import('../../src/state/store.js');
  const { setUnitSystem } = await import('../../src/units.js');
  const { initLeafletFallback } = await import('../../src/mapController.js');
  const { initLiveBeaconViewer } = await import('../../src/safeGuard.js');

  store.googleMap = null;
  setUnitSystem('metric', localStorage);
  initLeafletFallback(document.getElementById('map') || document.createElement('div'));
  const markersBefore = L.createdMarkers.length;

  initLiveBeaconViewer({
    subscribeFn: (_sessionId, onUpdate) => {
      onUpdate({
        sessionId: 'stride-safe-live99',
        runnerName: 'Maya Stride',
        routeTitle: 'Lakeshore Loop',
        lat: 41.3892,
        lng: -81.7018,
        pace: "5'15\"/km",
        distanceMiles: 3.1,
        batteryPct: 82,
        etaText: '12 min',
        active: true,
        sosActive: false
      });
      return () => {};
    }
  });

  assert.ok(L.createdMarkers.length > markersBefore, 'Live beacon viewer should update runner marker on Leaflet map');
});
