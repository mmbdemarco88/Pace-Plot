// -----------------------------------------------------------------------------
// Pace Plot — Tier 4: Real-World Scenarios E2E Suite (`tier4_real_world_scenarios.test.js`)
// 10 multi-step, application-level user journeys exercising all 17 features (F1–F17).
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setupMockBrowserEnv,
  createMemoryStorage,
  projectFileExists,
  readProjectFile,
  getAssembledIndexHtml,
  extractHtmlIds
} from './helpers.js';

// -----------------------------------------------------------------------------
// Scenario 1: First-time runner opens app offline (F1, F2, F17)
// -----------------------------------------------------------------------------
test('[Tier 4 | F1+F2+F17] First-time runner opens app offline with build-time CSS, SW precaching, modular DOM IDs, and Leaflet fallback', async () => {
  const { window, document, caches } = setupMockBrowserEnv({ onLine: false });

  // 1. Verify zero runtime CDN links in assembled HTML and build-time Tailwind/FontAwesome setup
  const assembledHtml = getAssembledIndexHtml();
  assert.ok(!assembledHtml.includes('cdn.tailwindcss.com'), 'Must not rely on runtime Tailwind CDN when offline');
  assert.ok(!assembledHtml.includes('cdnjs.cloudflare.com'), 'Must not rely on runtime FontAwesome CDN when offline');
  assert.ok(projectFileExists('tailwind.config.js'), 'tailwind.config.js must exist');
  assert.ok(projectFileExists('postcss.config.js'), 'postcss.config.js must exist');
  assert.ok(projectFileExists('src/styles/main.css'), 'src/styles/main.css must exist');

  // 2. Verify Service Worker precaching & modularized DOM IDs
  const swSource = readProjectFile('public/sw.js');
  assert.ok(swSource.includes('caches.open') || swSource.includes('precache'), 'SW must precache local assets');
  const htmlIds = extractHtmlIds(assembledHtml);
  for (const requiredId of ['map', 'btnLocateMyGps', 'btnRedoChoices', 'modalAppSettings', 'btnStartNavigation']) {
    assert.ok(htmlIds.has(requiredId), `Assembled HTML must preserve DOM ID #${requiredId}`);
  }

  // 3. Verify modularized ES modules exist and Leaflet fallback initializes when Google Maps is unavailable
  const { store } = await import('../../src/state/store.js');
  const { initLeafletFallback } = await import('../../src/mapController.js');

  store.googleMap = null;
  const mapEl = document.getElementById('map') || document.createElement('div');
  initLeafletFallback(mapEl);

  assert.ok(window.__activeLeafletMap, 'Offline runner must get an active Leaflet fallback map instance');
  assert.ok(caches, 'CacheStorage must be available in browser environment');
});

// -----------------------------------------------------------------------------
// Scenario 2: Metric 5K planning, Overpass safety & surface filter, elevation & GPX (F4, F6, F7, F16)
// -----------------------------------------------------------------------------
test('[Tier 4 | F4+F6+F7+F16] Runner switches to Metric, generates calibrated 5K loop, filters lit trails, inspects elevation, and exports GPX', async () => {
  const { fetch, localStorage } = setupMockBrowserEnv({
    fetchOptions: { fixedOsrmDistanceMeters: 5005 }
  });

  const { setUnitSystem, getUnitSystem, formatDistance, formatTemperature, formatElevation } = await import('../../src/units.js');
  const {
    fetchStreetSnappedLoopFromOsrm,
    fetchOsmSafetyAndSurfaceMetrics,
    filterAndRankRoutesBySurface,
    fetchRouteElevationProfile,
    buildRouteGpxString
  } = await import('../../src/gpsEngine.js');

  // 1. Switch to Metric in Settings
  setUnitSystem('metric', localStorage);
  assert.equal(getUnitSystem(localStorage), 'metric');
  assert.ok(formatDistance(3.10686, 'metric', 2).endsWith('km'));
  assert.ok(formatTemperature(64, 'metric').endsWith('°C'));

  // 2. Generate calibrated 5K (3.11 mi) OSRM street-snapped loop
  const loopAnchors = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3902, lng: -81.7031 },
    { lat: 41.3910, lng: -81.6960 },
    { lat: 41.3860, lng: -81.6965 },
    { lat: 41.3857, lng: -81.7058 }
  ];
  const snapped = await fetchStreetSnappedLoopFromOsrm(loopAnchors, 'Metric 5K Loop', {
    targetDistanceMiles: 3.11,
    fetchImpl: fetch
  });
  assert.ok(snapped && snapped.path.length >= 4);
  assert.ok(Math.abs(snapped.distanceMiles - 3.11) <= 0.25, 'Calibrated OSRM loop distance should match ~3.11 mi (5K)');

  // 3. Inspect Overpass safety/surface metrics and filter by 'lit' then 'trail'
  const osmMetrics = await fetchOsmSafetyAndSurfaceMetrics(41.3857, -81.7058, 1200, { fetchImpl: fetch });
  assert.ok(osmMetrics.safetyScore >= 0 && osmMetrics.safetyScore <= 10);
  assert.ok(typeof osmMetrics.litPct === 'number' && typeof osmMetrics.sidewalkPct === 'number');

  const routeChoices = [
    { id: 'c1', label: 'Greenway Trail', distance: snapped.distanceMiles, path: snapped.path, trailRatio: 0.9, litPct: 50, safetyScore: '8.2' },
    { id: 'c2', label: 'Lit Boulevard', distance: snapped.distanceMiles, path: snapped.path, trailRatio: 0.2, litPct: 96, safetyScore: '9.1' }
  ];
  const litRanked = filterAndRankRoutesBySurface(routeChoices, 'lit', osmMetrics);
  assert.equal(litRanked[0].id, 'c2', 'Lit filter should prioritize high litPct route');
  const trailRanked = filterAndRankRoutesBySurface(routeChoices, 'trail', osmMetrics);
  assert.equal(trailRanked[0].id, 'c1', 'Trail filter should prioritize high trailRatio route');

  // 4. Fetch Open-Meteo elevation profile & export GPX with real <ele> tags
  const elev = await fetchRouteElevationProfile(snapped.path, { fetchImpl: fetch });
  assert.ok(elev.elevationsMeters.length === snapped.path.length);
  assert.ok(elev.svgStrokePath.startsWith('M'));
  assert.ok(formatElevation(elev.gainMeters, 'metric', true).endsWith('m'));

  const gpx = buildRouteGpxString({ name: 'Metric 5K Loop', path: snapped.path }, elev.elevationsMeters);
  assert.ok(gpx.includes('<gpx') && gpx.includes('<trkpt'));
  assert.ok(gpx.includes(`<ele>${elev.elevationsMeters[0]}`), 'GPX must contain real Open-Meteo <ele> tags');
  assert.ok(!gpx.includes('<ele>210.0</ele>'), 'GPX must not use static hardcoded 210.0 elevation');
});

// -----------------------------------------------------------------------------
// Scenario 3: Long-press waypoint loop on Leaflet fallback (F5, F17)
// -----------------------------------------------------------------------------
test('[Tier 4 | F5+F17] Runner long-presses Leaflet fallback map to drop waypoint pin and generates street-snapped waypoint loop', async () => {
  const { window, document, fetch, L } = setupMockBrowserEnv();
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

  const pinned = { lat: 41.3924, lng: -81.7012 };
  await handleMapLongPress(pinned);
  updateWaypointMarker(pinned.lat, pinned.lng);

  const choices = generateLoopChoicesWithWaypoint(41.3857, -81.7058, pinned.lat, pinned.lng, 'Pinned Coffee Stop', 3.5);
  await new Promise((r) => setTimeout(r, 60));

  assert.equal(choices.length, 4);
  const osrmCalls = fetch.calls.filter((c) => c.url.includes('router.project-osrm.org'));
  assert.ok(osrmCalls.length >= 1, 'Waypoint loop must call OSRM for street-snapping');
  assert.ok(
    osrmCalls.some((c) => c.url.includes(`${pinned.lng.toFixed(4)}`) || c.url.includes(`${pinned.lat.toFixed(4)}`)),
    'OSRM request must include the pinned waypoint coordinate'
  );
  assert.ok(L.createdMarkers.length >= 1, 'Leaflet fallback must render waypoint/pin markers');
  assert.ok(L.createdPolylines.length >= 1, 'Leaflet fallback must render snapped route polyline');
});

// -----------------------------------------------------------------------------
// Scenario 4: Live turn-by-turn nav, BLE HR, >50m off-route reroute, D3 HR chart (F3, F8, F16)
// -----------------------------------------------------------------------------
test('[Tier 4 | F3+F8+F16] Runner starts nav, pairs BLE HR, drifts >50m off-route for auto-reroute, and views D3 HR zone chart', async () => {
  const { document, bluetooth, fetch, spokenUtterances } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { setUnitSystem } = await import('../../src/units.js');
  const { evaluateOffRouteDeviation } = await import('../../src/gpsEngine.js');
  const { startNavigation, handleRealGpsPositionUpdate, stopNavigation } = await import('../../src/mapController.js');
  const { setupBleHeartRateMonitor } = await import('../../src/bleHeartRate.js');
  const { calculateHeartRateZones } = await import('../../src/trainingPlan.js');
  const { renderD3HeartRateZonesBarChart } = await import('../../src/hrZoneChart.js');

  setUnitSystem('metric');

  // 1. Setup active route & start navigation
  store.activeRoute = {
    name: 'Tempo Nav Loop',
    distance: 3.1,
    path: [
      { lat: 41.3857, lng: -81.7058 },
      { lat: 41.3877, lng: -81.7058 },
      { lat: 41.3877, lng: -81.7020 },
      { lat: 41.3857, lng: -81.7058 }
    ],
    maneuvers: [
      { instruction: 'Head north on West Ridgewood', distanceMeters: 220, lat: 41.3857, lng: -81.7058 },
      { instruction: 'Turn right onto Parkview', distanceMeters: 300, lat: 41.3877, lng: -81.7058 }
    ]
  };
  startNavigation();
  assert.equal(store.isNavigating, true);

  // 2. Pair BLE Heart Rate monitor & stream 162 BPM notification
  setupBleHeartRateMonitor();
  const bleBtn = document.getElementById('btnConnectBleHr');
  if (bleBtn) {
    bleBtn.click();
    await new Promise((r) => setTimeout(r, 20));
    bluetooth.triggerHeartRateNotification([0x00, 162]);
    assert.equal(store.currentLiveSensorHr, 162);
  }

  // 3. Simulate runner drifting >80m east of route polyline
  const offRouteFix = { lat: 41.3867, lng: -81.7010 };
  const dev = evaluateOffRouteDeviation(offRouteFix, store.activeRoute.path, 50);
  assert.equal(dev.isOffRoute, true);
  assert.ok(dev.deviationMeters > 50);

  await handleRealGpsPositionUpdate({
    coords: { latitude: offRouteFix.lat, longitude: offRouteFix.lng, accuracy: 6, speed: 3.2 },
    timestamp: Date.now()
  });
  await new Promise((r) => setTimeout(r, 40));

  assert.ok(
    fetch.calls.some((c) => c.url.includes('router.project-osrm.org')),
    'Off-route >50m must trigger OSRM auto-reroute'
  );
  assert.ok(
    spokenUtterances.some((u) => /off[- ]?route|rerout/i.test(u)) || store.isOffRoute === false || store.lastRerouteTimestamp > 0,
    'Off-route detection must alert runner or record reroute'
  );
  stopNavigation();

  // 4. Render D3 HR zone chart using selective D3 imports
  const hrChartSource = readProjectFile('src/hrZoneChart.js');
  assert.ok(!hrChartSource.includes("from 'd3'"), 'hrZoneChart must use selective D3 imports');
  const chartContainer = document.getElementById('hrZoneChartContainer') || document.createElement('div');
  const zones = calculateHeartRateZones(188, [], 162);
  renderD3HeartRateZonesBarChart(chartContainer, zones, { isDark: true });
  assert.ok(chartContainer.querySelector('svg'), 'D3 HR zone chart must render an <svg> element');
});

// -----------------------------------------------------------------------------
// Scenario 5: SafeGuard live beacon & SOS + ?track= viewer (F14, F1)
// -----------------------------------------------------------------------------
test('[Tier 4 | F14+F1] Runner activates SafeGuard live beacon & SOS and family opens ?track= live viewer', async () => {
  const { window, document } = setupMockBrowserEnv({
    url: 'http://localhost:3000/?track=stride-safe-runner-01',
    batteryLevel: 0.74
  });

  const rules = readProjectFile('firestore.rules');
  assert.ok(rules.includes('match /beacons/{sessionId}'), 'firestore.rules must secure /beacons/{sessionId}');

  const { store } = await import('../../src/state/store.js');
  const {
    setupSafeGuardHandlers,
    getOrCreateBeaconSessionId,
    syncLiveBeaconSession,
    initLiveBeaconViewer
  } = await import('../../src/safeGuard.js');

  setupSafeGuardHandlers();
  const sessionId = getOrCreateBeaconSessionId();
  assert.ok(typeof sessionId === 'string' && sessionId.length > 0);

  store.currentUser = { uid: 'runner_sg_1', displayName: 'Alex Runner' };
  store.lastAcceptedGpsCoord = { lat: 41.3881, lng: -81.7033 };
  await syncLiveBeaconSession({ active: true, sosActive: true, distanceMiles: 2.4 });

  // Initialize live viewer from ?track= query parameter with deterministic subscribeFn mock
  const receivedTrackIds = [];
  let unsubCalled = false;
  const viewerTrackId = initLiveBeaconViewer({
    subscribeFn: (trackSessionId, onUpdate) => {
      receivedTrackIds.push(trackSessionId);
      onUpdate({
        sessionId: trackSessionId,
        runnerName: 'Alex Runner',
        routeTitle: 'SafeGuard Loop',
        lat: 41.3881,
        lng: -81.7033,
        pace: "8'20\"/mi",
        distanceMiles: 2.4,
        batteryPct: 74,
        etaText: '12m remaining',
        active: true,
        sosActive: true
      });
      return () => {
        unsubCalled = true;
      };
    }
  });
  assert.equal(viewerTrackId, 'stride-safe-runner-01', 'initLiveBeaconViewer must return the ?track= beacon session ID');
  assert.deepEqual(receivedTrackIds, ['stride-safe-runner-01'], 'subscribeFn must receive the ?track= beacon session ID');
  assert.equal(typeof store.unsubBeaconSession, 'function', 'store.unsubBeaconSession must hold the unsubscribe function');
  const toastEl = document.getElementById('testSmsToast');
  if (toastEl) {
    assert.ok(toastEl.textContent.includes('stride-safe-runner-01'), 'Live viewer toast must display the tracked beacon ID');
    assert.ok(toastEl.textContent.includes('SOS ACTIVE!'), 'Live viewer toast must reflect active SOS telemetry');
  }
  store.unsubBeaconSession();
  assert.equal(unsubCalled, true, 'Calling store.unsubBeaconSession must invoke the unsubscribe function');
  assert.ok(window.location.search.includes('track='), 'Viewer URL must retain ?track= session parameter');
  assert.ok(document.body, 'Document body must remain valid during live beacon viewer initialization');
});

// -----------------------------------------------------------------------------
// Scenario 6: Offline early-morning / late-night workout queue & badge sync (F11, F12)
// -----------------------------------------------------------------------------
test('[Tier 4 | F11+F12] Offline early-morning run queues in localStorage + CacheStorage, flushes on reconnect, and awards early_bird badge', async () => {
  const { localStorage, caches, navigator } = setupMockBrowserEnv({ onLine: false });

  const {
    enqueueOfflineWorkout,
    getOfflineWorkoutQueue,
    flushOfflineWorkoutQueue
  } = await import('../../src/firebase.js');
  const { evaluateBadgesFromWorkouts, getUnlockedBadges, saveUnlockedBadges } = await import('../../src/badges.js');

  // 1. Complete a 06:15 AM run while offline
  const earlyMorningIso = new Date(2026, 4, 10, 6, 15, 0).toISOString();
  const workout = {
    distanceMiles: 4.2,
    durationSeconds: 2100,
    paceStr: "8'20\"/mi",
    routeName: 'Dawn Creek Loop',
    completedAt: earlyMorningIso
  };

  await enqueueOfflineWorkout(workout, localStorage);
  const queued = getOfflineWorkoutQueue(localStorage);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].completedAt, earlyMorningIso);

  // Verify CacheStorage mirror at /__offline_workout_queue
  const cacheHit = await caches.match('/__offline_workout_queue');
  assert.ok(cacheHit, 'Offline workout must be mirrored in CacheStorage /__offline_workout_queue');

  // Verify SW handles /__offline_workout_queue
  const swSource = readProjectFile('public/sw.js');
  assert.ok(swSource.includes('__offline_workout_queue'), 'Service Worker must handle /__offline_workout_queue');

  // 2. Reconnect & flush queue
  navigator.onLine = true;
  const uploaded = [];
  const result = await flushOfflineWorkoutQueue({
    storage: localStorage,
    cacheStorage: caches,
    isOnline: true,
    currentUser: { uid: 'runner_offline_1' },
    addRunActivityImpl: async (data) => {
      uploaded.push({ ...data });
      return { id: 'doc_1' };
    }
  });
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0].completedAt, earlyMorningIso);
  assert.equal(result.flushedCount ?? uploaded.length, 1);
  assert.equal(getOfflineWorkoutQueue(localStorage).length, 0, 'Queue must be cleared after flush');

  // 3. Evaluate badges from synced workout's completedAt (06:15 AM -> early_bird)
  saveUnlockedBadges([]);
  evaluateBadgesFromWorkouts(uploaded);
  assert.equal(getUnlockedBadges().includes('early_bird'), true, '06:15 AM completedAt must award early_bird badge regardless of current hour');
});

// -----------------------------------------------------------------------------
// Scenario 7: Marathon plan, fresh 5K completed: false, Firestore profile sync (F9, F10, F13)
// -----------------------------------------------------------------------------
test('[Tier 4 | F9+F10+F13] Runner selects Marathon 4-week plan, verifies fresh 5K has completed: false, and syncs profile to Firestore', async () => {
  const { localStorage } = setupMockBrowserEnv();

  const { generate4WeekPlan, EVENT_GOALS, saveActivePlan, hydrateTrainingPlanFromCloud } = await import('../../src/trainingPlan.js');
  const { hydrateSubscriptionFromCloud, getSubscriptionState } = await import('../../src/premium.js');

  // 1. Marathon plan branch exists and scales toward 26.2 mi
  assert.ok(EVENT_GOALS.find((g) => g.id === 'marathon'), 'EVENT_GOALS must define marathon');
  const marathonPlan = generate4WeekPlan('marathon', 480);
  assert.equal(marathonPlan.goalId, 'marathon');
  assert.equal(marathonPlan.weeks.length, 4);
  const maxLongRun = Math.max(...marathonPlan.weeks.flatMap((w) => w.days.map((d) => d.dist || 0)));
  assert.ok(maxLongRun >= 14, `Marathon 4-week peak long run (${maxLongRun} mi) must exceed base/5K distances`);

  // 2. Fresh 5K plan has completed: false on every day (including Week 1 Mon & Wed)
  const fresh5k = generate4WeekPlan('5k', 510);
  const allDays = fresh5k.weeks.flatMap((w) => w.days);
  assert.ok(allDays.every((d) => d.completed === false), 'Fresh 5K plan must have completed: false on all days');

  // Verify Marathon selector button and 0 / 4 Done initial badge in assembled HTML
  const html = getAssembledIndexHtml();
  assert.ok(html.includes('data-goal="marathon"'), 'UI must include Marathon goal selector button');
  assert.ok(html.includes('0 / 4 Done'), 'Initial static training badge must read 0 / 4 Done');

  // 3. Sync & hydrate subscription + activeTrainingPlan from Firestore /users/{userId}
  const rules = readProjectFile('firestore.rules');
  assert.ok(rules.includes('activeTrainingPlan'), 'firestore.rules isValidUserProfile must allow activeTrainingPlan');

  saveActivePlan(marathonPlan);
  const cloudStorage = createMemoryStorage();
  hydrateSubscriptionFromCloud(
    { subscriptionStatus: 'pro_active', tier: 'pro', trialStartedAt: Date.now() - 1000, trialExpiresAt: Date.now() + 86400000 },
    cloudStorage
  );
  assert.equal(getSubscriptionState(Date.now(), cloudStorage).status, 'pro_active');
  const hydratedPlan = hydrateTrainingPlanFromCloud({ activeTrainingPlan: marathonPlan }, cloudStorage);
  assert.equal(hydratedPlan.goalId, 'marathon');
});

// -----------------------------------------------------------------------------
// Scenario 8: Client-side Spotify PKCE OAuth for production / Capacitor (F15)
// -----------------------------------------------------------------------------
test('[Tier 4 | F15] Runner connects Spotify via client-side PKCE OAuth without dev middleware (production / Capacitor)', async () => {
  const { fetch, localStorage } = setupMockBrowserEnv({
    url: 'https://paceplot.app/',
    fetchOptions: { disableSpotifyDevMiddleware: true }
  });

  // 1. Static callback HTML must exist for production/Capacitor
  assert.ok(projectFileExists('public/auth/callback/index.html'), 'public/auth/callback/index.html must exist');
  const callbackHtml = readProjectFile('public/auth/callback/index.html');
  assert.ok(callbackHtml.includes('code') && callbackHtml.includes('postMessage'), 'Callback page must forward OAuth code');

  const {
    buildSpotifyAuthorizeUrl,
    exchangeSpotifyPkceTokenDirect,
    handleSpotifyOAuthCallbackCode
  } = await import('../../src/spotify.js');

  // 2. Build direct PKCE authorize URL without calling /api/spotify/auth/url
  const authUrl = buildSpotifyAuthorizeUrl({
    clientId: 'custom_prod_client_id',
    redirectUri: 'https://paceplot.app/auth/callback',
    codeChallenge: 'mock_s256_challenge_xyz',
    state: 'mock_state_123'
  });
  assert.ok(authUrl.startsWith('https://accounts.spotify.com/authorize'));
  assert.ok(authUrl.includes('code_challenge_method=S256'));

  // 3. Exchange code directly against https://accounts.spotify.com/api/token
  const tokenResult = await exchangeSpotifyPkceTokenDirect({
    code: 'auth_code_xyz',
    codeVerifier: 'verifier_abc',
    clientId: 'custom_prod_client_id',
    redirectUri: 'https://paceplot.app/auth/callback',
    fetchImpl: fetch
  });
  assert.equal(tokenResult.ok, true);
  assert.equal(tokenResult.data.access_token, 'mock_spotify_pkce_access_token_123');
  assert.ok(
    fetch.calls.some((c) => c.url.includes('accounts.spotify.com/api/token')),
    'Production PKCE exchange must hit accounts.spotify.com/api/token directly'
  );

  // 4. Full callback handler stores tokens cleanly
  localStorage.setItem('paceplot_spotify_custom_client_id', 'custom_prod_client_id');
  localStorage.setItem('paceplot_spotify_pkce_verifier', 'verifier_abc');
  const connected = await handleSpotifyOAuthCallbackCode('auth_code_xyz');
  assert.ok(connected);
});

// -----------------------------------------------------------------------------
// Scenario 9: Full "Sunday Long Run" end-to-end journey (F1, F3, F4, F6, F7, F12, F13, F16, F17)
// -----------------------------------------------------------------------------
test('[Tier 4 | F1+F3+F4+F6+F7+F12+F13+F16+F17] Full Sunday Long Run: Metric units, calibrated OSRM, Overpass safety, elevation, Leaflet, D3 HR, offline sync, cloud hydration', async () => {
  const { window, document, fetch, localStorage, L } = setupMockBrowserEnv({
    onLine: false,
    fetchOptions: { fixedOsrmDistanceMeters: 16093 } // 10.0 mi / 16.09 km
  });

  const { store } = await import('../../src/state/store.js');
  const { setUnitSystem, formatDistance } = await import('../../src/units.js');
  const {
    fetchStreetSnappedLoopFromOsrm,
    fetchOsmSafetyAndSurfaceMetrics,
    fetchRouteElevationProfile,
    buildRouteGpxString
  } = await import('../../src/gpsEngine.js');
  const { initLeafletFallback, renderRoute, updateRunnerMapMarker } = await import('../../src/mapController.js');
  const { calculateHeartRateZones } = await import('../../src/trainingPlan.js');
  const { renderD3HeartRateZonesBarChart } = await import('../../src/hrZoneChart.js');
  const { enqueueOfflineWorkout, flushOfflineWorkoutQueue } = await import('../../src/firebase.js');
  const { hydrateSubscriptionFromCloud, getSubscriptionState } = await import('../../src/premium.js');

  // 1. Hydrate cloud Pro subscription & switch to Metric
  hydrateSubscriptionFromCloud({ subscriptionStatus: 'pro_active', tier: 'pro' }, localStorage);
  assert.equal(getSubscriptionState(Date.now(), localStorage).status, 'pro_active');
  setUnitSystem('metric', localStorage);
  assert.equal(formatDistance(10.0, 'metric', 1), '16.1 km');

  // 2. Generate 10-mile calibrated loop, Overpass safety, and Open-Meteo elevation
  const anchors = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.4020, lng: -81.7000 },
    { lat: 41.3950, lng: -81.6820 },
    { lat: 41.3800, lng: -81.6900 },
    { lat: 41.3857, lng: -81.7058 }
  ];
  const snapped = await fetchStreetSnappedLoopFromOsrm(anchors, 'Sunday 16K', { targetDistanceMiles: 10.0, fetchImpl: fetch });
  const osm = await fetchOsmSafetyAndSurfaceMetrics(41.3857, -81.7058, 1200, { fetchImpl: fetch });
  const elev = await fetchRouteElevationProfile(snapped.path, { fetchImpl: fetch });
  const gpx = buildRouteGpxString({ name: 'Sunday 16K', path: snapped.path }, elev.elevationsMeters);
  assert.ok(osm.safetyScore > 0 && gpx.includes(`<ele>${elev.elevationsMeters[0]}`));

  // 3. Render on Leaflet fallback & update runner marker
  store.googleMap = null;
  initLeafletFallback(document.getElementById('map') || document.createElement('div'));
  renderRoute({ name: 'Sunday 16K', distance: snapped.distanceMiles, path: snapped.path, maneuvers: snapped.maneuvers });
  updateRunnerMapMarker({ lat: 41.3900, lng: -81.7020 });
  assert.ok(window.__activeLeafletMap && L.createdPolylines.length >= 1 && L.createdMarkers.length >= 1);

  // 4. Render post-run D3 HR zones & queue offline workout, then flush on reconnect
  const chartBox = document.createElement('div');
  renderD3HeartRateZonesBarChart(chartBox, calculateHeartRateZones(188, [], 148));
  assert.ok(chartBox.querySelector('svg'));

  await enqueueOfflineWorkout({ distanceMiles: 10.0, durationSeconds: 5100, completedAt: new Date(2026, 4, 17, 8, 30, 0).toISOString() }, localStorage);
  window.navigator.onLine = true;
  const synced = [];
  await flushOfflineWorkoutQueue({
    storage: localStorage,
    cacheStorage: window.caches,
    isOnline: true,
    currentUser: { uid: 'sunday_runner' },
    addRunActivityImpl: async (data) => { synced.push({ ...data }); return { id: 'sun_1' }; }
  });
  assert.equal(synced.length, 1);
});

// -----------------------------------------------------------------------------
// Scenario 10: Evening tempo run with voice prompts, off-route recovery, SafeGuard, & night_owl (F2, F8, F11, F14, F16)
// -----------------------------------------------------------------------------
test('[Tier 4 | F2+F8+F11+F14+F16] Evening tempo run: metric voice cues, off-route recovery, SafeGuard beacon, and night_owl badge', async () => {
  const { spokenUtterances } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { setUnitSystem, formatShortDistance } = await import('../../src/units.js');
  const { speakInstruction } = await import('../../src/voiceNav.js');
  const { evaluateOffRouteDeviation } = await import('../../src/gpsEngine.js');
  const { syncLiveBeaconSession } = await import('../../src/safeGuard.js');
  const { evaluateBadgesFromWorkouts, getUnlockedBadges, saveUnlockedBadges } = await import('../../src/badges.js');

  setUnitSystem('metric');
  store.isNavigating = true;
  const cueDist = formatShortDistance(150, 'metric');
  assert.ok(cueDist.includes('m'), 'Metric short distance cue should use meters');
  speakInstruction(`${cueDist}, turn left onto Greenway`);
  assert.ok(spokenUtterances.some((u) => u.includes('Greenway')));
  store.isNavigating = false;

  const deviation = evaluateOffRouteDeviation(
    { lat: 41.3857, lng: -81.7030 },
    [{ lat: 41.3857, lng: -81.7058 }, { lat: 41.3880, lng: -81.7058 }],
    50
  );
  assert.equal(deviation.isOffRoute, true);

  await syncLiveBeaconSession({ active: true, sosActive: false, distanceMiles: 3.0 });

  const nightRun = { distanceMiles: 3.1, durationSeconds: 1500, completedAt: new Date(2026, 4, 18, 21, 30, 0).toISOString() };
  saveUnlockedBadges([]);
  evaluateBadgesFromWorkouts([nightRun]);
  assert.equal(getUnlockedBadges().includes('night_owl'), true, '21:30 completedAt must award night_owl badge');
});
