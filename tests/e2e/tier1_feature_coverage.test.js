// -----------------------------------------------------------------------------
// Pace Plot — Tier 1: Feature Coverage E2E Suite (`tier1_feature_coverage.test.js`)
// 85 Test Cases (5 per feature across F1–F17) verifying happy-path contracts.
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

// =============================================================================
// F1: Modularize `src/main.js` & `index.html`
// =============================================================================

test('[Tier 1 | F1] src/state/store.js exports centralized reactive store and escapeHtml helper', async () => {
  const { store, escapeHtml } = await import('../../src/state/store.js');
  assert.equal(typeof store, 'object');
  const requiredKeys = [
    'activeKey',
    'activeRoute',
    'isVoiceMuted',
    'isNavigating',
    'googleMap',
    'currentUser',
    'currentSelectedDistance',
    'currentPaceSeconds',
    'currentRouteChoices',
    'selectedChoiceIndex',
    'activeWaypointCoords',
    'historicalWorkoutsCache',
    'currentLiveSensorHr',
    'isBleHrConnected',
    'gpsWatchId',
    'activeSurfaceFilter',
    'beaconSessionId',
    'lastRerouteTimestamp',
    'isOffRoute'
  ];
  for (const key of requiredKeys) {
    assert.ok(key in store, `Expected store to contain property "${key}"`);
  }
  assert.equal(escapeHtml('<b>Run & "Stride"</b>'), '&lt;b&gt;Run &amp; &quot;Stride&quot;&lt;/b&gt;');
});

test('[Tier 1 | F1] Focused domain modules exist and export documented interface functions', async () => {
  setupMockBrowserEnv();
  assert.ok(projectFileExists('src/units.js'), 'src/units.js should exist');
  assert.ok(projectFileExists('src/mapController.js'), 'src/mapController.js should exist');
  assert.ok(projectFileExists('src/voiceNav.js'), 'src/voiceNav.js should exist');
  assert.ok(projectFileExists('src/geocoder.js'), 'src/geocoder.js should exist');
  assert.ok(projectFileExists('src/safeGuard.js'), 'src/safeGuard.js should exist');
  assert.ok(projectFileExists('src/bleHeartRate.js'), 'src/bleHeartRate.js should exist');

  const mapController = await import('../../src/mapController.js');
  const voiceNav = await import('../../src/voiceNav.js');
  const geocoder = await import('../../src/geocoder.js');
  const safeGuard = await import('../../src/safeGuard.js');
  const bleHeartRate = await import('../../src/bleHeartRate.js');

  assert.equal(typeof mapController.initGoogleMaps, 'function');
  assert.equal(typeof mapController.initLeafletFallback, 'function');
  assert.equal(typeof mapController.renderRoute, 'function');
  assert.equal(typeof mapController.generateMultipleLoopChoices, 'function');
  assert.equal(typeof mapController.generateLoopChoicesWithWaypoint, 'function');
  assert.equal(typeof mapController.handleRealGpsPositionUpdate, 'function');
  assert.equal(typeof voiceNav.initSpeechSynthesis, 'function');
  assert.equal(typeof voiceNav.speakInstruction, 'function');
  assert.equal(typeof geocoder.setupLocationSearch, 'function');
  assert.equal(typeof safeGuard.setupSafeGuardHandlers, 'function');
  assert.equal(typeof bleHeartRate.setupBleHeartRateMonitor, 'function');
});

test('[Tier 1 | F1] src/main.js is decomposed from 5,096-line monolith and imports extracted modules', () => {
  const mainContent = readProjectFile('src/main.js');
  const lineCount = mainContent.split('\n').length;
  assert.ok(lineCount < 2200, `Expected src/main.js to be decomposed (<2200 lines), found ${lineCount} lines`);
  assert.ok(mainContent.includes('mapController.js'), 'src/main.js should import mapController.js');
  assert.ok(mainContent.includes('voiceNav.js'), 'src/main.js should import voiceNav.js');
  assert.ok(mainContent.includes('geocoder.js'), 'src/main.js should import geocoder.js');
  assert.ok(mainContent.includes('safeGuard.js'), 'src/main.js should import safeGuard.js');
  assert.ok(mainContent.includes('bleHeartRate.js'), 'src/main.js should import bleHeartRate.js');
});

test('[Tier 1 | F1] index.html is modularized with HTML partials in src/templates/', () => {
  const rawIndexHtml = readProjectFile('index.html');
  const rawLineCount = rawIndexHtml.split('\n').length;
  assert.ok(rawLineCount < 600, `Expected source index.html to be modular (<600 lines), found ${rawLineCount}`);
  assert.ok(projectFileExists('src/templates'), 'src/templates directory should exist');
});

test('[Tier 1 | F1] Assembled HTML preserves all 292+ DOM IDs across all 5 tabs and 5 modals', () => {
  const assembledHtml = getAssembledIndexHtml();
  const ids = extractHtmlIds(assembledHtml);
  assert.ok(ids.size >= 292, `Expected at least 292 DOM IDs in assembled HTML, found ${ids.size}`);

  const landmarkIds = [
    'appContainer',
    'tabPlanner',
    'tabSafetyBeacon',
    'tabHealth',
    'tabEvents',
    'tabSaved',
    'map',
    'planningSheet',
    'navInstructionCard',
    'modalUpgradePremium',
    'modalSafetyDisclaimer',
    'modalSpotifyPlaylists',
    'modalAppSettings',
    'badgeUnlockToast'
  ];
  for (const id of landmarkIds) {
    assert.ok(ids.has(id), `Expected landmark DOM ID "#${id}" in assembled HTML`);
  }
});

// =============================================================================
// F2: Build-time Tailwind CSS & FontAwesome
// =============================================================================

test('[Tier 1 | F2] tailwind.config.js exists and defines custom terracotta, obsidian, and cream palettes', () => {
  assert.ok(projectFileExists('tailwind.config.js'), 'tailwind.config.js must exist');
  const twConfig = readProjectFile('tailwind.config.js');
  assert.ok(twConfig.includes('darkMode'), 'tailwind.config.js must configure darkMode');
  assert.ok(twConfig.includes('terracotta'), 'tailwind.config.js must define terracotta color');
  assert.ok(twConfig.includes('#E15A2B'), 'tailwind.config.js must include #E15A2B terracotta hex');
  assert.ok(twConfig.includes('obsidian'), 'tailwind.config.js must define obsidian color');
  assert.ok(twConfig.includes('cream'), 'tailwind.config.js must define cream color');
});

test('[Tier 1 | F2] postcss.config.js exists and enables tailwindcss and autoprefixer plugins', () => {
  assert.ok(projectFileExists('postcss.config.js'), 'postcss.config.js must exist');
  const postcssConfig = readProjectFile('postcss.config.js');
  assert.ok(postcssConfig.includes('tailwindcss'), 'postcss.config.js must include tailwindcss');
  assert.ok(postcssConfig.includes('autoprefixer'), 'postcss.config.js must include autoprefixer');
});

test('[Tier 1 | F2] src/styles/main.css bundles @fortawesome/fontawesome-free and @tailwind directives', () => {
  assert.ok(projectFileExists('src/styles/main.css'), 'src/styles/main.css must exist');
  const css = readProjectFile('src/styles/main.css');
  assert.ok(css.includes('@fortawesome/fontawesome-free'), 'src/styles/main.css must import FontAwesome locally');
  assert.ok(css.includes('@tailwind base'), 'src/styles/main.css must include @tailwind base');
  assert.ok(css.includes('@tailwind components'), 'src/styles/main.css must include @tailwind components');
  assert.ok(css.includes('@tailwind utilities'), 'src/styles/main.css must include @tailwind utilities');
});

test('[Tier 1 | F2] index.html has zero runtime CDN links to cdn.tailwindcss.com or cdnjs.cloudflare.com', () => {
  const rawHtml = readProjectFile('index.html');
  const assembledHtml = getAssembledIndexHtml();
  assert.ok(!rawHtml.includes('cdn.tailwindcss.com'), 'index.html must not load cdn.tailwindcss.com');
  assert.ok(!rawHtml.includes('cdnjs.cloudflare.com'), 'index.html must not load FontAwesome from cdnjs.cloudflare.com');
  assert.ok(!assembledHtml.includes('cdn.tailwindcss.com'), 'assembled HTML must not load cdn.tailwindcss.com');
  assert.ok(!assembledHtml.includes('cdnjs.cloudflare.com'), 'assembled HTML must not load cdnjs.cloudflare.com');
});

test('[Tier 1 | F2] vite.config.js and public/sw.js precache compiled offline assets', () => {
  const viteConfig = readProjectFile('vite.config.js');
  const swContent = readProjectFile('public/sw.js');
  assert.ok(
    viteConfig.includes('PRECACHE_ASSETS') || swContent.includes('PRECACHE_ASSETS'),
    'Service Worker precache asset list must be configured'
  );
  assert.ok(
    viteConfig.includes('sw.js') || swContent.includes('/assets/'),
    'Vite build or Service Worker must precache compiled assets for offline launch'
  );
});

// =============================================================================
// F3: Selective D3 Imports
// =============================================================================

test('[Tier 1 | F3] src/hrZoneChart.js uses selective imports from d3-selection, d3-scale, and d3-axis', () => {
  const chartSource = readProjectFile('src/hrZoneChart.js');
  assert.ok(!chartSource.includes("from 'd3'"), 'src/hrZoneChart.js must not import monolithic d3');
  assert.ok(!chartSource.includes('from "d3"'), 'src/hrZoneChart.js must not import monolithic d3');
  assert.ok(chartSource.includes('d3-selection'), 'src/hrZoneChart.js must import from d3-selection');
  assert.ok(chartSource.includes('d3-scale'), 'src/hrZoneChart.js must import from d3-scale');
  assert.ok(chartSource.includes('d3-axis'), 'src/hrZoneChart.js must import from d3-axis');
});

test('[Tier 1 | F3] renderD3HeartRateZonesBarChart mounts SVG with viewBox and accessibility attributes', async () => {
  const { document } = setupMockBrowserEnv();
  const { calculateHeartRateZones } = await import('../../src/trainingPlan.js');
  const { renderD3HeartRateZonesBarChart } = await import('../../src/hrZoneChart.js');

  const container = document.createElement('div');
  const zoneData = calculateHeartRateZones(188, [], 148);
  const model = renderD3HeartRateZonesBarChart(container, zoneData, { isDark: true });

  assert.ok(model, 'renderD3HeartRateZonesBarChart should return chartModel');
  const svg = container.querySelector('svg');
  assert.ok(svg, 'SVG element should be mounted inside container');
  assert.equal(svg.getAttribute('viewBox'), '0 0 356 198');
  assert.equal(svg.getAttribute('role'), 'img');
  assert.ok(svg.getAttribute('aria-label').includes('188 bpm'));
});

test('[Tier 1 | F3] renderD3HeartRateZonesBarChart renders 5 zone bars (Z1–Z5) with data attributes', async () => {
  const { document } = setupMockBrowserEnv();
  const { calculateHeartRateZones } = await import('../../src/trainingPlan.js');
  const { renderD3HeartRateZonesBarChart } = await import('../../src/hrZoneChart.js');

  const container = document.createElement('div');
  const zoneData = calculateHeartRateZones(188, [], 148);
  renderD3HeartRateZonesBarChart(container, zoneData, { isDark: true });

  const bars = container.querySelectorAll('.d3-hr-zone-bar');
  assert.equal(bars.length, 5);
  assert.deepEqual(
    bars.map((b) => b.getAttribute('data-zone-code')),
    ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']
  );
  assert.equal(bars[1].getAttribute('data-zone-bpm'), '113–131');
});

test('[Tier 1 | F3] renderD3HeartRateZonesBarChart renders Y-axis ticks, gridlines, durations, and percentages', async () => {
  const { document } = setupMockBrowserEnv();
  const { calculateHeartRateZones } = await import('../../src/trainingPlan.js');
  const { renderD3HeartRateZonesBarChart } = await import('../../src/hrZoneChart.js');

  const container = document.createElement('div');
  const zoneData = calculateHeartRateZones(188, [], 148);
  renderD3HeartRateZonesBarChart(container, zoneData, { isDark: false });

  assert.ok(container.querySelector('.d3-hr-gridlines'), 'Should render gridlines group');
  assert.ok(container.querySelector('.d3-hr-y-axis'), 'Should render Y-axis group');
  assert.equal(container.querySelectorAll('.d3-hr-bar-duration').length, 5);
  assert.equal(container.querySelectorAll('.d3-hr-bar-pct').length, 5);
});

test('[Tier 1 | F3] renderD3HeartRateZonesBarChart highlights live HR zone and fires onZoneClick callback', async () => {
  const { document } = setupMockBrowserEnv();
  const { calculateHeartRateZones } = await import('../../src/trainingPlan.js');
  const { renderD3HeartRateZonesBarChart } = await import('../../src/hrZoneChart.js');

  const container = document.createElement('div');
  const zoneData = calculateHeartRateZones(188, [], 148); // 148 bpm -> Z3 live zone
  let clickedZone = null;
  renderD3HeartRateZonesBarChart(container, zoneData, {
    isDark: true,
    onZoneClick: (d) => {
      clickedZone = d;
    }
  });

  const zoneLabels = container.querySelectorAll('.d3-hr-x-zone');
  assert.equal(zoneLabels[2].textContent, 'Z3 •');

  const groups = container.querySelectorAll('.d3-hr-zone-group');
  groups[2].dispatchEvent({ type: 'click' });
  assert.ok(clickedZone, 'Clicking a bar group should invoke onZoneClick');
  assert.equal(clickedZone.code, 'Z3');
});

// =============================================================================
// F4: Calibrate OSRM-Snapped Loop Distances
// =============================================================================

test('[Tier 1 | F4] fetchStreetSnappedLoopFromOsrm returns street-snapped path, distanceMiles, and maneuvers', async () => {
  const { fetch } = setupMockBrowserEnv();
  const { fetchStreetSnappedLoopFromOsrm } = await import('../../src/gpsEngine.js');

  const waypoints = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3920, lng: -81.7058 },
    { lat: 41.3920, lng: -81.6980 },
    { lat: 41.3857, lng: -81.6980 },
    { lat: 41.3857, lng: -81.7058 }
  ];

  const snapped = await fetchStreetSnappedLoopFromOsrm(waypoints, 'Greenway Loop', { fetchImpl: fetch });
  assert.ok(snapped, 'Expected snapped route result');
  assert.ok(Array.isArray(snapped.path) && snapped.path.length >= 3);
  assert.ok(snapped.distanceMiles > 0);
  assert.ok(Array.isArray(snapped.maneuvers) && snapped.maneuvers.length >= 2);
  assert.equal(snapped.path[0].lat, 41.3857);
  assert.equal(snapped.path[snapped.path.length - 1].lat, 41.3857);
});

test('[Tier 1 | F4] fetchStreetSnappedLoopFromOsrm calibrates loop radius when initial OSRM distance deviates >10%', async () => {
  const { fetch } = setupMockBrowserEnv({
    fetchOptions: { osrmDetourFactor: 1.45 } // 45% detour causes >10% deviation on first pass
  });
  const { fetchStreetSnappedLoopFromOsrm } = await import('../../src/gpsEngine.js');

  const waypoints = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3940, lng: -81.7058 },
    { lat: 41.3940, lng: -81.6950 },
    { lat: 41.3857, lng: -81.6950 },
    { lat: 41.3857, lng: -81.7058 }
  ];

  const snapped = await fetchStreetSnappedLoopFromOsrm(waypoints, 'Calibrated 5K', {
    targetDistanceMiles: 3.1,
    fetchImpl: fetch
  });

  assert.ok(snapped, 'Expected calibrated OSRM result');
  assert.ok(
    fetch.calls.filter((c) => c.url.includes('router.project-osrm.org')).length >= 2,
    'Expected fetchStreetSnappedLoopFromOsrm to make a calibration refinement OSRM request when deviation > 10%'
  );
});

test('[Tier 1 | F4] Calibrated OSRM loop distance converges within 10% of targetDistanceMiles', async () => {
  const { fetch } = setupMockBrowserEnv({
    fetchOptions: { osrmDetourFactor: 1.38 }
  });
  const { fetchStreetSnappedLoopFromOsrm } = await import('../../src/gpsEngine.js');

  const waypoints = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3950, lng: -81.7058 },
    { lat: 41.3950, lng: -81.6940 },
    { lat: 41.3857, lng: -81.6940 },
    { lat: 41.3857, lng: -81.7058 }
  ];

  const target = 3.1;
  const snapped = await fetchStreetSnappedLoopFromOsrm(waypoints, 'Calibrated 5K', {
    targetDistanceMiles: target,
    fetchImpl: fetch
  });

  assert.ok(snapped);
  const relativeDiff = Math.abs(snapped.distanceMiles - target) / target;
  assert.ok(
    relativeDiff <= 0.12,
    `Expected calibrated distance (${snapped.distanceMiles} mi) to be within ~10% of ${target} mi`
  );
});

test('[Tier 1 | F4] generateMultipleLoopChoices updates choice.distance and choice.estMinutes from snapped.distanceMiles', async () => {
  setupMockBrowserEnv({
    fetchOptions: { fixedOsrmDistanceMeters: 5230 } // 3.25 miles
  });
  const { generateMultipleLoopChoices } = await import('../../src/mapController.js');

  const choices = generateMultipleLoopChoices(41.3857, -81.7058, 'West Creek Greenway', 3.1);
  assert.equal(choices.length, 4);

  // Wait for async OSRM snapping promises to settle
  await new Promise((r) => setTimeout(r, 40));

  assert.equal(choices[0].distance, 3.25);
  assert.ok(choices[0].estMinutes > 0);
});

test('[Tier 1 | F4] generateMultipleLoopChoices updates store.activeRoute and UI cards after OSRM calibration', async () => {
  const { document } = setupMockBrowserEnv({
    fetchOptions: { fixedOsrmDistanceMeters: 4989 } // 3.10 miles
  });
  const { store } = await import('../../src/state/store.js');
  const { generateMultipleLoopChoices } = await import('../../src/mapController.js');

  generateMultipleLoopChoices(41.3857, -81.7058, 'Parma Town Center', 3.1);
  await new Promise((r) => setTimeout(r, 40));

  assert.ok(store.activeRoute, 'store.activeRoute should be populated');
  assert.equal(store.activeRoute.distance, 3.1);
  const choicesList = document.getElementById('routeChoicesList');
  if (choicesList) {
    assert.ok(choicesList.innerHTML.includes('3.10'), 'Route choices list should render calibrated 3.10 distance');
  }
});

// =============================================================================
// F5: Street-Snap Waypoint Loops via OSRM
// =============================================================================

test('[Tier 1 | F5] fetchStreetSnappedLoopFromOsrm includes options.preserveWaypoint in OSRM query anchors', async () => {
  const { fetch } = setupMockBrowserEnv();
  const { fetchStreetSnappedLoopFromOsrm } = await import('../../src/gpsEngine.js');

  const waypoint = { lat: 41.391234, lng: -81.701234 };
  const path = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3880, lng: -81.7040 },
    waypoint,
    { lat: 41.3930, lng: -81.6990 },
    { lat: 41.3857, lng: -81.7058 }
  ];

  await fetchStreetSnappedLoopFromOsrm(path, 'Waypoint Loop', {
    preserveWaypoint: waypoint,
    fetchImpl: fetch
  });

  const osrmCall = fetch.calls.find((c) => c.url.includes('router.project-osrm.org'));
  assert.ok(osrmCall, 'Expected OSRM request');
  assert.ok(
    osrmCall.url.includes(`${waypoint.lng.toFixed(6)},${waypoint.lat.toFixed(6)}`),
    `Expected OSRM URL (${osrmCall.url}) to preserve waypoint coordinate`
  );
});

test('[Tier 1 | F5] fetchStreetSnappedLoopFromOsrm preserves index 3 waypoint automatically on 9-point waypoint loops', async () => {
  const { fetch } = setupMockBrowserEnv();
  const { fetchStreetSnappedLoopFromOsrm } = await import('../../src/gpsEngine.js');

  const pinnedWaypoint = { lat: 41.393456, lng: -81.698765 };
  const ninePointPath = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3875, lng: -81.7040 },
    { lat: 41.3905, lng: -81.7015 },
    pinnedWaypoint, // index 3
    { lat: 41.3950, lng: -81.6960 },
    { lat: 41.3920, lng: -81.6930 },
    { lat: 41.3890, lng: -81.6970 },
    { lat: 41.3870, lng: -81.7010 },
    { lat: 41.3857, lng: -81.7058 }
  ];

  await fetchStreetSnappedLoopFromOsrm(ninePointPath, 'Waypoint Loop', { fetchImpl: fetch });
  const osrmCall = fetch.calls.find((c) => c.url.includes('router.project-osrm.org'));
  assert.ok(osrmCall);
  assert.ok(
    osrmCall.url.includes(`${pinnedWaypoint.lng.toFixed(6)},${pinnedWaypoint.lat.toFixed(6)}`),
    '9-point waypoint loop must include index 3 waypoint in OSRM anchor coordinates'
  );
});

test('[Tier 1 | F5] generateLoopChoicesWithWaypoint builds 4 waypoint loop choices with choice.waypoint metadata', async () => {
  setupMockBrowserEnv();
  const { generateLoopChoicesWithWaypoint } = await import('../../src/mapController.js');

  const choices = generateLoopChoicesWithWaypoint(
    41.3857,
    -81.7058,
    41.3925,
    -81.6995,
    'Custom Pinned Landmark',
    3.5
  );

  assert.equal(choices.length, 4);
  choices.forEach((choice) => {
    assert.ok(choice.waypoint, 'Expected choice.waypoint metadata');
    assert.equal(choice.waypoint.lat, 41.3925);
    assert.equal(choice.waypoint.lng, -81.6995);
  });
});

test('[Tier 1 | F5] generateLoopChoicesWithWaypoint calls fetchStreetSnappedLoopFromOsrm for all 4 choices', async () => {
  const { fetch } = setupMockBrowserEnv();
  const { generateLoopChoicesWithWaypoint } = await import('../../src/mapController.js');

  generateLoopChoicesWithWaypoint(41.3857, -81.7058, 41.3925, -81.6995, 'Reservoir Pin', 3.5);
  await new Promise((r) => setTimeout(r, 50));

  const osrmCalls = fetch.calls.filter((c) => c.url.includes('router.project-osrm.org'));
  assert.ok(osrmCalls.length >= 4, `Expected at least 4 OSRM street-snap calls for waypoint loops, got ${osrmCalls.length}`);
});

test('[Tier 1 | F5] generateLoopChoicesWithWaypoint updates choice.path, choice.distance, and choice.maneuvers from OSRM', async () => {
  setupMockBrowserEnv({
    fetchOptions: { fixedOsrmDistanceMeters: 5793 } // 3.60 miles
  });
  const { generateLoopChoicesWithWaypoint } = await import('../../src/mapController.js');

  const choices = generateLoopChoicesWithWaypoint(41.3857, -81.7058, 41.3925, -81.6995, 'Scenic Overlook', 3.5);
  await new Promise((r) => setTimeout(r, 50));

  assert.equal(choices[0].distance, 3.6);
  assert.ok(choices[0].maneuvers.some((m) => m.text.includes('West Creek Greenway Trail') || m.text.includes('Parkview')));
});

// =============================================================================
// F6: Real OSM Overpass Safety Scoring & Surface Filtering
// =============================================================================

test('[Tier 1 | F6] fetchOsmSafetyAndSurfaceMetrics queries Overpass API and computes sidewalkPct, litPct, and safetyScore', async () => {
  const { fetch } = setupMockBrowserEnv();
  const { fetchOsmSafetyAndSurfaceMetrics } = await import('../../src/gpsEngine.js');

  const metrics = await fetchOsmSafetyAndSurfaceMetrics(41.3857, -81.7058, 1200, { fetchImpl: fetch });
  assert.ok(metrics, 'Expected OSM safety and surface metrics object');
  assert.equal(metrics.source, 'overpass');
  assert.ok(metrics.sidewalkPct >= 50 && metrics.sidewalkPct <= 100);
  assert.ok(metrics.litPct >= 50 && metrics.litPct <= 100);
  assert.ok(metrics.safetyScore >= 8.0 && metrics.safetyScore <= 10.0);
  assert.ok(metrics.trailRatio >= 0 && metrics.trailRatio <= 1);
  assert.ok(metrics.quietRoadRatio >= 0 && metrics.quietRoadRatio <= 1);
});

test('[Tier 1 | F6] filterAndRankRoutesBySurface prioritizes trail/greenway routes when surfaceFilter is "trail"', async () => {
  const { filterAndRankRoutesBySurface } = await import('../../src/gpsEngine.js');

  const sampleChoices = [
    { id: 'c1', title: 'Quiet Neighborhood Loop', traitTag: 'Low-Traffic Streets', sidewalkPct: '96%', litPct: '95%', safetyScore: '9.6' },
    { id: 'c2', title: 'Greenway Lit Loop', traitTag: ' Dedicated Greenway Trail', sidewalkPct: '100%', litPct: '98%', safetyScore: '9.9' },
    { id: 'c3', title: 'Hill Vista Training Loop', traitTag: 'Incline & Stamina', sidewalkPct: '94%', litPct: '92%', safetyScore: '9.5' }
  ];

  const ranked = filterAndRankRoutesBySurface(sampleChoices, 'trail');
  assert.ok(ranked.length === 3);
  assert.ok(ranked[0].title.toLowerCase().includes('greenway') || ranked[0].traitTag.toLowerCase().includes('trail'));
});

test('[Tier 1 | F6] filterAndRankRoutesBySurface prioritizes quiet residential roads when surfaceFilter is "road"', async () => {
  const { filterAndRankRoutesBySurface } = await import('../../src/gpsEngine.js');

  const sampleChoices = [
    { id: 'c1', title: 'Greenway Lit Loop', traitTag: 'Dedicated Trail', sidewalkPct: '98%', litPct: '94%', safetyScore: '9.7' },
    { id: 'c2', title: 'Quiet Neighborhood Loop', traitTag: 'Quiet Residential Roads', sidewalkPct: '99%', litPct: '96%', safetyScore: '9.8' },
    { id: 'c3', title: 'Hill Vista Training Loop', traitTag: 'Incline Climb', sidewalkPct: '92%', litPct: '90%', safetyScore: '9.4' }
  ];

  const ranked = filterAndRankRoutesBySurface(sampleChoices, 'road');
  assert.ok(
    ranked[0].title.toLowerCase().includes('neighborhood') ||
      ranked[0].traitTag.toLowerCase().includes('road') ||
      ranked[0].traitTag.toLowerCase().includes('street')
  );
});

test('[Tier 1 | F6] filterAndRankRoutesBySurface prioritizes highest litPct routes when surfaceFilter is "lit"', async () => {
  const { filterAndRankRoutesBySurface } = await import('../../src/gpsEngine.js');

  const sampleChoices = [
    { id: 'c1', title: 'Wooded Trail Circuit', traitTag: 'Canopy Path', sidewalkPct: '95%', litPct: '78%', safetyScore: '9.2' },
    { id: 'c2', title: 'Boulevard Night Loop', traitTag: '100% Streetlamps', sidewalkPct: '100%', litPct: '100%', safetyScore: '9.9' },
    { id: 'c3', title: 'Suburban Connector', traitTag: 'Quiet Streets', sidewalkPct: '94%', litPct: '88%', safetyScore: '9.5' }
  ];

  const ranked = filterAndRankRoutesBySurface(sampleChoices, 'lit');
  assert.equal(ranked[0].id, 'c2');
});

test('[Tier 1 | F6] Surface filter pills (.surface-filter-btn) exist for trail, road, and lit in assembled HTML', () => {
  const { document } = setupMockBrowserEnv();
  const pills = document.querySelectorAll('.surface-filter-btn');
  const surfaces = pills.map((p) => p.getAttribute('data-surface'));
  assert.ok(surfaces.includes('trail'), 'Expected data-surface="trail" button');
  assert.ok(surfaces.includes('road'), 'Expected data-surface="road" button');
  assert.ok(surfaces.includes('lit'), 'Expected data-surface="lit" button');
});

// =============================================================================
// F7: Real Elevation Profiles & GPX `<ele>` Tags via Open-Meteo
// =============================================================================

test('[Tier 1 | F7] fetchRouteElevationProfile queries Open-Meteo Elevation API and sets pt.ele in meters', async () => {
  const { fetch } = setupMockBrowserEnv({
    fetchOptions: { elevationsMeters: [205.4, 212.8, 224.1, 218.0, 205.4] }
  });
  const { fetchRouteElevationProfile } = await import('../../src/gpsEngine.js');

  const path = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3880, lng: -81.7040 },
    { lat: 41.3910, lng: -81.7010 },
    { lat: 41.3885, lng: -81.6990 },
    { lat: 41.3857, lng: -81.7058 }
  ];

  const profile = await fetchRouteElevationProfile(path, { fetchImpl: fetch });
  assert.ok(profile, 'Expected elevation profile result');
  assert.ok(fetch.calls.some((c) => c.url.includes('api.open-meteo.com/v1/elevation')));
  assert.equal(path[0].ele, 205.4);
  assert.equal(path[2].ele, 224.1);
});

test('[Tier 1 | F7] fetchRouteElevationProfile computes gainMeters, gainFeet, maxMeters, maxFeet, and SVG paths', async () => {
  const { fetch } = setupMockBrowserEnv({
    fetchOptions: { elevationsMeters: [200.0, 210.0, 225.0, 215.0, 200.0] }
  });
  const { fetchRouteElevationProfile } = await import('../../src/gpsEngine.js');

  const path = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3870, lng: -81.7040 },
    { lat: 41.3890, lng: -81.7020 },
    { lat: 41.3875, lng: -81.7000 },
    { lat: 41.3857, lng: -81.7058 }
  ];

  const profile = await fetchRouteElevationProfile(path, { fetchImpl: fetch });
  assert.equal(Math.round(profile.gainMeters), 25);
  assert.equal(Math.round(profile.gainFeet), 82);
  assert.equal(profile.maxMeters, 225);
  assert.ok(profile.svgStrokePath.startsWith('M '));
  assert.ok(profile.svgFillPath.includes('Z'));
  assert.equal(profile.svgPoints.length, 5);
});

test('[Tier 1 | F7] buildRouteGpxString writes real per-point <ele> tags in meters instead of hardcoded 210.0', async () => {
  const { buildRouteGpxString } = await import('../../src/gpsEngine.js');

  const routeData = {
    title: 'West Creek Real Elevation Loop',
    path: [
      { lat: 41.3857, lng: -81.7058, ele: 214.6 },
      { lat: 41.3890, lng: -81.7020, ele: 231.2 },
      { lat: 41.3857, lng: -81.7058, ele: 214.6 }
    ]
  };

  const gpx = buildRouteGpxString(routeData);
  assert.ok(gpx.includes('<gpx'), 'Should output valid GPX root element');
  assert.ok(gpx.includes('<ele>214.6</ele>'), 'Should include <ele>214.6</ele>');
  assert.ok(gpx.includes('<ele>231.2</ele>'), 'Should include <ele>231.2</ele>');
  assert.ok(!gpx.includes('<ele>210.0</ele>'), 'Should not hardcode <ele>210.0</ele>');
});

test('[Tier 1 | F7] updateElevationChartSVG updates #elevSvgStroke, #elevSvgFill, and #elevProfileStats', async () => {
  const { document } = setupMockBrowserEnv({
    fetchOptions: { elevationsMeters: [202.0, 218.0, 234.0, 215.0, 202.0] }
  });
  const { updateElevationChartSVG } = await import('../../src/mapController.js');

  const routeData = {
    title: 'Vista Climb Loop',
    path: [
      { lat: 41.3857, lng: -81.7058 },
      { lat: 41.3870, lng: -81.7040 },
      { lat: 41.3890, lng: -81.7020 },
      { lat: 41.3875, lng: -81.7000 },
      { lat: 41.3857, lng: -81.7058 }
    ]
  };

  await updateElevationChartSVG(routeData);

  const strokeEl = document.getElementById('elevSvgStroke');
  const fillEl = document.getElementById('elevSvgFill');
  const statsEl = document.getElementById('elevProfileStats');

  assert.ok(strokeEl.getAttribute('d').startsWith('M '), 'Stroke SVG path should be dynamically updated');
  assert.ok(fillEl.getAttribute('d').endsWith('Z'), 'Fill SVG path should close with Z');
  assert.ok(statsEl.textContent.includes('Gain'), 'Elevation profile stats should display Gain');
});

test('[Tier 1 | F7] #elevRunnerDot updates both cx and cy along the true elevation curve during navigation', async () => {
  const { document } = setupMockBrowserEnv({
    fetchOptions: { elevationsMeters: [200.0, 240.0, 210.0] }
  });
  const { store } = await import('../../src/state/store.js');
  const { updateElevationChartSVG, updateNavStep } = await import('../../src/mapController.js');

  store.activeRoute = {
    title: 'Ridge Climb',
    distance: 3.1,
    path: [
      { lat: 41.3857, lng: -81.7058 },
      { lat: 41.3900, lng: -81.7000 },
      { lat: 41.3857, lng: -81.7058 }
    ],
    maneuvers: [
      { text: 'Start on Ridge', dist: 'Start', icon: 'fa-arrow-up' },
      { text: 'Crest Summit', dist: 'In 1.5 mi', icon: 'fa-arrow-turn-up-left' },
      { text: 'Finish Loop', dist: 'In 1.6 mi', icon: 'fa-flag-checkered' }
    ]
  };

  await updateElevationChartSVG(store.activeRoute);
  const dot = document.getElementById('elevRunnerDot');
  updateNavStep(1, true, false); // midpoint (summit)

  const cx = Number(dot.getAttribute('cx'));
  const cy = Number(dot.getAttribute('cy'));
  assert.ok(Number.isFinite(cx) && cx > 100 && cx < 200);
  assert.ok(Number.isFinite(cy) && cy < 32, `Expected runner dot cy (${cy}) at summit to move above baseline 32`);
});

// =============================================================================
// F8: Off-Route Detection (>50m) & Auto-Rerouting
// =============================================================================

test('[Tier 1 | F8] pointToSegmentDistanceMeters computes exact perpendicular distance and closest point', async () => {
  const { pointToSegmentDistanceMeters } = await import('../../src/gpsEngine.js');

  const segA = { lat: 41.3857, lng: -81.7058 };
  const segB = { lat: 41.3857, lng: -81.6958 }; // East-West segment
  const runnerNorth = { lat: 41.3863, lng: -81.7008 }; // ~66.7m north of midpoint

  const res = pointToSegmentDistanceMeters(runnerNorth, segA, segB);
  assert.ok(res.distanceMeters > 62 && res.distanceMeters < 72);
  assert.ok(res.t > 0.45 && res.t < 0.55);
  assert.ok(Math.abs(res.closestPoint.lat - 41.3857) < 0.0001);
});

test('[Tier 1 | F8] distanceToPolylineMeters finds minimum distance across multi-segment route path', async () => {
  const { distanceToPolylineMeters } = await import('../../src/gpsEngine.js');

  const path = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3900, lng: -81.7058 },
    { lat: 41.3900, lng: -81.7000 }
  ];
  const pointNearSeg1 = { lat: 41.3901, lng: -81.7030 }; // ~11m north of segment 1

  const result = distanceToPolylineMeters(pointNearSeg1, path);
  assert.equal(result.closestSegmentIndex, 1);
  assert.ok(result.minDistanceMeters > 8 && result.minDistanceMeters < 15);
});

test('[Tier 1 | F8] evaluateOffRouteDeviation detects when runner deviates >50m from activeRoute.path', async () => {
  const { evaluateOffRouteDeviation } = await import('../../src/gpsEngine.js');

  const path = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3900, lng: -81.7058 }
  ];

  const onRoute = evaluateOffRouteDeviation({ lat: 41.3875, lng: -81.7057 }, path, 50);
  assert.equal(onRoute.isOffRoute, false);
  assert.ok(onRoute.deviationMeters < 20);

  const offRoute = evaluateOffRouteDeviation({ lat: 41.3875, lng: -81.7048 }, path, 50); // ~83m east
  assert.equal(offRoute.isOffRoute, true);
  assert.ok(offRoute.deviationMeters > 50);
});

test('[Tier 1 | F8] handleRealGpsPositionUpdate sets store.isOffRoute and triggers HUD + voice alert when >50m off-route', async () => {
  const { document, spokenUtterances } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { handleRealGpsPositionUpdate } = await import('../../src/mapController.js');

  store.isNavigating = true;
  store.navIsPaused = false;
  store.isVoiceMuted = false;
  store.lastRerouteTimestamp = 0;
  store.lastAcceptedGpsCoord = { lat: 41.3857, lng: -81.7058 };
  store.activeRoute = {
    title: 'Greenway Loop',
    distance: 3.1,
    path: [
      { lat: 41.3857, lng: -81.7058 },
      { lat: 41.3900, lng: -81.7058 },
      { lat: 41.3857, lng: -81.7058 }
    ],
    maneuvers: [
      { text: 'Head out', dist: 'Start', lat: 41.3857, lng: -81.7058 },
      { text: 'Finish', dist: 'In 3.1 mi', lat: 41.3857, lng: -81.7058 }
    ]
  };

  // Move ~95m east of route polyline
  await handleRealGpsPositionUpdate({
    coords: { latitude: 41.3860, longitude: -81.7046, accuracy: 8, speed: 3.2 }
  });

  assert.equal(store.isOffRoute, true);
  const navSub = document.getElementById('navSubText') || document.getElementById('navInstructionText');
  assert.ok(
    spokenUtterances.some((u) => u.toLowerCase().includes('off route') || u.toLowerCase().includes('rerout')) ||
      (navSub && navSub.textContent.toLowerCase().includes('off route')),
    'Expected voice or HUD off-route alert'
  );
});

test('[Tier 1 | F8] handleRealGpsPositionUpdate auto-reroutes via OSRM when runner deviates >50m', async () => {
  const { fetch } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { handleRealGpsPositionUpdate } = await import('../../src/mapController.js');

  store.isNavigating = true;
  store.navIsPaused = false;
  store.lastRerouteTimestamp = 0;
  store.lastAcceptedGpsCoord = { lat: 41.3857, lng: -81.7058 };
  store.activeRoute = {
    title: 'Greenway Loop',
    distance: 3.1,
    path: [
      { lat: 41.3857, lng: -81.7058 },
      { lat: 41.3900, lng: -81.7058 },
      { lat: 41.3857, lng: -81.7058 }
    ],
    maneuvers: [
      { text: 'Head out', dist: 'Start', lat: 41.3857, lng: -81.7058 },
      { text: 'Finish', dist: 'In 3.1 mi', lat: 41.3857, lng: -81.7058 }
    ]
  };

  await handleRealGpsPositionUpdate({
    coords: { latitude: 41.3860, longitude: -81.7045, accuracy: 8, speed: 3.2 }
  });
  await new Promise((r) => setTimeout(r, 40));

  assert.ok(store.lastRerouteTimestamp > 0, 'Expected store.lastRerouteTimestamp to be updated');
  assert.ok(
    fetch.calls.some((c) => c.url.includes('router.project-osrm.org')),
    'Expected automatic OSRM reroute call when >50m off-route'
  );
});

// =============================================================================
// F9: Marathon Plan Branch in `generate4WeekPlan`
// =============================================================================

test('[Tier 1 | F9] generate4WeekPlan("marathon") returns Marathon Peak Block with targetDistance 26.2', async () => {
  const { generate4WeekPlan } = await import('../../src/trainingPlan.js');
  const plan = generate4WeekPlan('marathon', 510);

  assert.equal(plan.goalId, 'marathon');
  assert.equal(plan.goalName, 'Marathon Peak Block');
  assert.equal(plan.targetDistance, 26.2);
  assert.equal(plan.weeks.length, 4);
  assert.ok(plan.totalMiles >= 120, `Expected marathon 4-week totalMiles >= 120, got ${plan.totalMiles}`);
});

test('[Tier 1 | F9] Marathon plan builds progressive mileage through Week 3 and tapers in Week 4 to 26.2 mi race', async () => {
  const { generate4WeekPlan } = await import('../../src/trainingPlan.js');
  const plan = generate4WeekPlan('marathon', 510);

  assert.ok(plan.weeks[1].targetMiles > plan.weeks[0].targetMiles, 'Week 2 > Week 1');
  assert.ok(plan.weeks[2].targetMiles > plan.weeks[1].targetMiles, 'Week 3 peak > Week 2');
  assert.ok(plan.weeks[3].targetMiles < plan.weeks[2].targetMiles, 'Week 4 taper < Week 3');

  const raceDay = plan.weeks[3].days[3];
  assert.equal(raceDay.dist, 26.2);
  assert.equal(raceDay.type, 'race');
});

test('[Tier 1 | F9] Marathon plan utilizes paces.marathonPaceFormatted for tempo/race sessions', async () => {
  const { generate4WeekPlan, calculatePaces } = await import('../../src/trainingPlan.js');
  const paces = calculatePaces(480); // 8:00/mi -> marathonPace = 8:30/mi
  const plan = generate4WeekPlan('marathon', 480);

  assert.equal(paces.marathonPaceFormatted, `8'30"/mi`);
  const week1Wed = plan.weeks[0].days[1];
  const raceDay = plan.weeks[3].days[3];
  assert.equal(week1Wed.pace, paces.marathonPaceFormatted);
  assert.equal(raceDay.pace, paces.marathonPaceFormatted);
});

test('[Tier 1 | F9] Fresh marathon plan sets completed: false on all 16 workouts across Weeks 1–4', async () => {
  const { generate4WeekPlan } = await import('../../src/trainingPlan.js');
  const plan = generate4WeekPlan('marathon', 510);

  plan.weeks.forEach((w) => {
    w.days.forEach((d) => {
      assert.equal(d.completed, false, `Expected ${w.title} ${d.day} to have completed: false`);
    });
  });
});

test('[Tier 1 | F9] Assembled HTML includes the Marathon goal selector button (data-goal="marathon")', () => {
  const { document } = setupMockBrowserEnv();
  const goalButtons = document.querySelectorAll('.btn-plan-goal');
  const goals = goalButtons.map((btn) => btn.getAttribute('data-goal'));
  assert.ok(goals.includes('marathon'), `Expected .btn-plan-goal[data-goal="marathon"], found: ${goals.join(', ')}`);
});

// =============================================================================
// F10: Remove Hardcoded Completed Workouts on Fresh 5K Plans
// =============================================================================

test('[Tier 1 | F10] generate4WeekPlan("5k") Week 1 Monday and Wednesday have completed: false', async () => {
  const { generate4WeekPlan } = await import('../../src/trainingPlan.js');
  const plan5k = generate4WeekPlan('5k', 510);

  assert.equal(plan5k.weeks[0].days[0].day, 'Mon');
  assert.equal(plan5k.weeks[0].days[0].completed, false);
  assert.equal(plan5k.weeks[0].days[1].day, 'Wed');
  assert.equal(plan5k.weeks[0].days[1].completed, false);
});

test('[Tier 1 | F10] Every single workout across all 4 weeks of a fresh 5K plan has completed: false', async () => {
  const { generate4WeekPlan } = await import('../../src/trainingPlan.js');
  const plan5k = generate4WeekPlan('5k', 510);

  const completedCount = plan5k.weeks
    .flatMap((w) => w.days)
    .filter((d) => d.completed === true).length;
  assert.equal(completedCount, 0);
});

test('[Tier 1 | F10] All 5 training goals (5k, 10k, half, marathon, base) initialize with 0 completed workouts', async () => {
  const { generate4WeekPlan } = await import('../../src/trainingPlan.js');
  for (const goalId of ['5k', '10k', 'half', 'marathon', 'base']) {
    const plan = generate4WeekPlan(goalId, 500);
    const anyCompleted = plan.weeks.some((w) => w.days.some((d) => d.completed));
    assert.equal(anyCompleted, false, `Goal "${goalId}" must have 0 pre-completed workouts`);
  }
});

test('[Tier 1 | F10] Assembled HTML #planWeekCompletionStatus defaults to "0 / 4 Done"', () => {
  const { document } = setupMockBrowserEnv();
  const statusBadge = document.getElementById('planWeekCompletionStatus');
  assert.ok(statusBadge, 'Expected #planWeekCompletionStatus element in HTML');
  assert.equal(statusBadge.textContent.trim(), '0 / 4 Done');
});

test('[Tier 1 | F10] Saving and reloading a fresh 5K plan preserves 0 / 4 completed status in Week 1', async () => {
  setupMockBrowserEnv();
  const { generate4WeekPlan, saveActivePlan, loadActivePlan } = await import('../../src/trainingPlan.js');
  const fresh5k = generate4WeekPlan('5k', 510);
  saveActivePlan(fresh5k);
  const loaded = loadActivePlan();
  assert.ok(loaded);
  assert.equal(loaded.weeks[0].days.filter((d) => d.completed).length, 0);
});

// =============================================================================
// F11: Fix Time-of-Day Badge Evaluation (`early_bird` & `night_owl`)
// =============================================================================

test('[Tier 1 | F11] evaluateBadgesFromWorkouts unlocks early_bird from a 6:15 AM workout completedAt timestamp', async () => {
  setupMockBrowserEnv({
    initialLocalStorage: {
      paceplot_unlocked_badges: JSON.stringify(['pace_5k'])
    }
  });
  const { evaluateBadgesFromWorkouts, getUnlockedBadges } = await import('../../src/badges.js');

  evaluateBadgesFromWorkouts([
    {
      routeTitle: 'Dawn Patrol Loop',
      distance: 3.1,
      elevationGain: 40,
      completedAt: '2026-05-10T06:15:00'
    }
  ]);

  const unlocked = getUnlockedBadges();
  assert.ok(unlocked.includes('early_bird'), 'Expected early_bird to unlock for a 06:15 local completedAt timestamp');
});

test('[Tier 1 | F11] evaluateBadgesFromWorkouts unlocks night_owl from a 9:10 PM workout completedAt timestamp', async () => {
  setupMockBrowserEnv({
    initialLocalStorage: {
      paceplot_unlocked_badges: JSON.stringify(['pace_5k'])
    }
  });
  const { evaluateBadgesFromWorkouts, getUnlockedBadges } = await import('../../src/badges.js');

  evaluateBadgesFromWorkouts([
    {
      routeTitle: 'Starlight Greenway Loop',
      distance: 3.1,
      elevationGain: 40,
      completedAt: '2026-05-10T21:10:00'
    }
  ]);

  const unlocked = getUnlockedBadges();
  assert.ok(unlocked.includes('night_owl'), 'Expected night_owl to unlock for a 21:10 local completedAt timestamp');
});

test('[Tier 1 | F11] evaluateBadgesFromWorkouts does NOT unlock early_bird or night_owl for a 1:30 PM workout', async () => {
  setupMockBrowserEnv({
    initialLocalStorage: {
      paceplot_unlocked_badges: JSON.stringify(['pace_5k'])
    }
  });
  const { evaluateBadgesFromWorkouts, getUnlockedBadges } = await import('../../src/badges.js');

  evaluateBadgesFromWorkouts([
    {
      routeTitle: 'Lunchtime Tempo',
      distance: 3.1,
      elevationGain: 40,
      completedAt: '2026-05-10T13:30:00'
    }
  ]);

  const unlocked = getUnlockedBadges();
  assert.ok(!unlocked.includes('early_bird'), 'Midday workout must not unlock early_bird');
  assert.ok(!unlocked.includes('night_owl'), 'Midday workout must not unlock night_owl');
});

test('[Tier 1 | F11] evaluateBadgesFromWorkouts unlocks both early_bird and night_owl from multi-workout history', async () => {
  setupMockBrowserEnv({
    initialLocalStorage: {
      paceplot_unlocked_badges: JSON.stringify([])
    }
  });
  const { evaluateBadgesFromWorkouts, getUnlockedBadges } = await import('../../src/badges.js');

  evaluateBadgesFromWorkouts([
    { routeTitle: 'Morning Run', distance: 3.2, completedAt: '2026-05-09T05:45:00' },
    { routeTitle: 'Evening Run', distance: 4.0, completedAt: '2026-05-10T20:30:00' }
  ]);

  const unlocked = getUnlockedBadges();
  assert.ok(unlocked.includes('early_bird'));
  assert.ok(unlocked.includes('night_owl'));
});

test('[Tier 1 | F11] addRunActivity in src/firebase.js preserves activityData.completedAt timestamp', () => {
  const firebaseSource = readProjectFile('src/firebase.js');
  assert.ok(
    firebaseSource.includes('activityData.completedAt'),
    'addRunActivity must preserve activityData.completedAt when provided'
  );
});

// =============================================================================
// F12: Complete Offline Workout Queue & Background Sync
// =============================================================================

test('[Tier 1 | F12] enqueueOfflineWorkout persists workout to localStorage["paceplot_offline_workout_queue"]', async () => {
  const { localStorage } = setupMockBrowserEnv({ onLine: false });
  const { enqueueOfflineWorkout, getOfflineWorkoutQueue } = await import('../../src/firebase.js');

  await enqueueOfflineWorkout(
    {
      routeTitle: 'Offline Park Loop',
      distance: 3.1,
      durationSeconds: 1560,
      avgPace: "8'23\"",
      completedAt: '2026-05-10T06:20:00.000Z'
    },
    localStorage
  );

  const queued = getOfflineWorkoutQueue(localStorage);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].routeTitle, 'Offline Park Loop');
  assert.equal(queued[0].completedAt, '2026-05-10T06:20:00.000Z');
});

test('[Tier 1 | F12] enqueueOfflineWorkout mirrors queued workouts into CacheStorage at /__offline_workout_queue', async () => {
  const { localStorage, caches } = setupMockBrowserEnv({ onLine: false });
  const { enqueueOfflineWorkout } = await import('../../src/firebase.js');

  await enqueueOfflineWorkout(
    {
      routeTitle: 'Cached Offline Run',
      distance: 4.5,
      durationSeconds: 2200,
      completedAt: '2026-05-10T07:30:00.000Z'
    },
    localStorage
  );

  const cachedResp = await caches.match('/__offline_workout_queue');
  assert.ok(cachedResp, 'Expected /__offline_workout_queue entry in CacheStorage');
  const payload = await cachedResp.json();
  assert.ok(Array.isArray(payload) && payload.length === 1);
  assert.equal(payload[0].routeTitle, 'Cached Offline Run');
});

test('[Tier 1 | F12] getOfflineWorkoutQueue returns empty array when storage is empty and parses queued items cleanly', async () => {
  const storage = createMemoryStorage();
  const { getOfflineWorkoutQueue, enqueueOfflineWorkout } = await import('../../src/firebase.js');

  assert.deepEqual(getOfflineWorkoutQueue(storage), []);
  await enqueueOfflineWorkout({ routeTitle: 'Run A', distance: 2.0, durationSeconds: 900 }, storage);
  await enqueueOfflineWorkout({ routeTitle: 'Run B', distance: 5.0, durationSeconds: 2400 }, storage);
  assert.equal(getOfflineWorkoutQueue(storage).length, 2);
});

test('[Tier 1 | F12] flushOfflineWorkoutQueue uploads queued workouts when online and clears queue + CacheStorage', async () => {
  const { localStorage, caches } = setupMockBrowserEnv({ onLine: true });
  const { enqueueOfflineWorkout, flushOfflineWorkoutQueue, getOfflineWorkoutQueue } = await import('../../src/firebase.js');

  await enqueueOfflineWorkout(
    {
      routeTitle: 'Morning Offline 5K',
      distance: 3.1,
      durationSeconds: 1500,
      completedAt: '2026-05-10T06:10:00.000Z'
    },
    localStorage
  );

  const uploaded = [];
  const res = await flushOfflineWorkoutQueue({
    storage: localStorage,
    isOnline: true,
    user: { uid: 'runner_123' },
    uploadFn: async (item) => {
      uploaded.push(item);
      return 'doc_id_1';
    }
  });

  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0].completedAt, '2026-05-10T06:10:00.000Z');
  assert.equal(getOfflineWorkoutQueue(localStorage).length, 0);
  const remainingCache = await caches.match('/__offline_workout_queue');
  assert.equal(remainingCache, undefined);
  assert.ok(res.flushedCount >= 1 || res.synced >= 1 || Array.isArray(res));
});

test('[Tier 1 | F12] public/sw.js syncOfflineWorkoutsAndRoutes reads /__offline_workout_queue and notifies clients', () => {
  const swSource = readProjectFile('public/sw.js');
  assert.ok(swSource.includes('/__offline_workout_queue'));
  assert.ok(swSource.includes('PACEPLOT_BACKGROUND_SYNC_COMPLETE'));
  assert.ok(
    swSource.includes('.json()') || swSource.includes('queuedWorkouts'),
    'Service Worker should read queued workout payload from /__offline_workout_queue before notifying clients'
  );
});

// =============================================================================
// F13: Sync Subscription & Training Plan State to Firestore
// =============================================================================

test('[Tier 1 | F13] firestore.rules isValidUserProfile allows activeTrainingPlan and updatedAt on /users/{userId}', () => {
  const rules = readProjectFile('firestore.rules');
  assert.ok(rules.includes('activeTrainingPlan'), 'firestore.rules must allow activeTrainingPlan in isValidUserProfile');
  assert.ok(rules.includes('updatedAt'), 'firestore.rules must allow updatedAt in isValidUserProfile');
});

test('[Tier 1 | F13] src/firebase.js exports syncUserProfileState and subscribeUserProfile', async () => {
  setupMockBrowserEnv();
  const firebaseMod = await import('../../src/firebase.js');
  assert.equal(typeof firebaseMod.syncUserProfileState, 'function');
  assert.equal(typeof firebaseMod.subscribeUserProfile, 'function');
});

test('[Tier 1 | F13] hydrateSubscriptionFromCloud restores pro_active and trial_active states from cloud profile', async () => {
  const storage = createMemoryStorage();
  const { hydrateSubscriptionFromCloud, SUBSCRIPTION_STATUS } = await import('../../src/premium.js');

  const proState = hydrateSubscriptionFromCloud(
    {
      subscriptionStatus: 'pro_active',
      tier: 'annual'
    },
    storage
  );
  assert.equal(proState.status, SUBSCRIPTION_STATUS.PRO_ACTIVE);
  assert.equal(proState.hasAccess, true);

  const futureExpiry = Date.now() + 3 * 86400 * 1000;
  const storage2 = createMemoryStorage();
  const trialState = hydrateSubscriptionFromCloud(
    {
      subscriptionStatus: 'trial_active',
      tier: 'monthly',
      trialStartedAt: Date.now() - 86400 * 1000,
      trialExpiresAt: futureExpiry
    },
    storage2
  );
  assert.equal(trialState.status, SUBSCRIPTION_STATUS.TRIAL_ACTIVE);
  assert.equal(trialState.hasAccess, true);
});

test('[Tier 1 | F13] hydrateSubscriptionFromCloud enforces trial_expired even if localStorage was wiped', async () => {
  const emptyLocalStorage = createMemoryStorage();
  const { hydrateSubscriptionFromCloud, getSubscriptionState, SUBSCRIPTION_STATUS } = await import('../../src/premium.js');

  const pastExpiry = Date.now() - 60000;
  hydrateSubscriptionFromCloud(
    {
      subscriptionStatus: 'trial_expired',
      tier: 'annual',
      trialStartedAt: pastExpiry - 7 * 86400 * 1000,
      trialExpiresAt: pastExpiry
    },
    emptyLocalStorage
  );

  const current = getSubscriptionState(Date.now(), emptyLocalStorage);
  assert.equal(current.status, SUBSCRIPTION_STATUS.TRIAL_EXPIRED);
  assert.equal(current.hasAccess, false);
  assert.equal(current.canStartTrial, false);
});

test('[Tier 1 | F13] hydrateTrainingPlanFromCloud restores activeTrainingPlan into localStorage', async () => {
  const storage = createMemoryStorage();
  const { generate4WeekPlan, hydrateTrainingPlanFromCloud } = await import('../../src/trainingPlan.js');

  const marathonPlan = generate4WeekPlan('marathon', 490);
  const hydrated = hydrateTrainingPlanFromCloud({ activeTrainingPlan: marathonPlan }, storage);

  assert.ok(hydrated);
  assert.equal(hydrated.goalId, 'marathon');
  assert.equal(hydrated.targetDistance, 26.2);
  const storedRaw = storage.getItem('paceplot_active_training_plan');
  assert.ok(storedRaw && JSON.parse(storedRaw).goalId === 'marathon');
});

// =============================================================================
// F14: Live SafeGuard Beacon Session Document (`/beacons/{sessionId}`)
// =============================================================================

test('[Tier 1 | F14] firestore.rules defines isValidBeaconSession and match /beacons/{sessionId}', () => {
  const rules = readProjectFile('firestore.rules');
  assert.ok(rules.includes('isValidBeaconSession'), 'firestore.rules must define isValidBeaconSession');
  assert.ok(rules.includes('match /beacons/{sessionId}'), 'firestore.rules must define match /beacons/{sessionId}');
});

test('[Tier 1 | F14] src/firebase.js exports upsertBeaconSession and subscribeBeaconSession', async () => {
  setupMockBrowserEnv();
  const firebaseMod = await import('../../src/firebase.js');
  assert.equal(typeof firebaseMod.upsertBeaconSession, 'function');
  assert.equal(typeof firebaseMod.subscribeBeaconSession, 'function');
});

test('[Tier 1 | F14] src/safeGuard.js exports setupSafeGuardHandlers, syncLiveBeaconSession, initLiveBeaconViewer, and getOrCreateBeaconSessionId', async () => {
  setupMockBrowserEnv();
  const safeGuard = await import('../../src/safeGuard.js');
  assert.equal(typeof safeGuard.setupSafeGuardHandlers, 'function');
  assert.equal(typeof safeGuard.syncLiveBeaconSession, 'function');
  assert.equal(typeof safeGuard.initLiveBeaconViewer, 'function');
  assert.equal(typeof safeGuard.getOrCreateBeaconSessionId, 'function');
});

test('[Tier 1 | F14] syncLiveBeaconSession constructs live telemetry payload with lat, lng, batteryPct, etaText, pace, and sosActive', async () => {
  setupMockBrowserEnv({ batteryLevel: 0.84 });
  const { store } = await import('../../src/state/store.js');
  const { syncLiveBeaconSession } = await import('../../src/safeGuard.js');

  store.currentUserGpsCoord = { lat: 41.3865, lng: -81.7042 };
  store.liveGpsDistanceMiles = 1.45;
  store.activeRoute = { title: 'West Creek Safe Loop', distance: 3.1 };

  const payload = await syncLiveBeaconSession({
    active: true,
    sosActive: false,
    pace: "8'15\""
  });

  assert.ok(payload, 'Expected beacon session telemetry payload');
  assert.equal(payload.lat, 41.3865);
  assert.equal(payload.lng, -81.7042);
  assert.equal(payload.active, true);
  assert.equal(payload.sosActive, false);
  assert.ok(payload.batteryPct >= 0 && payload.batteryPct <= 100);
  assert.ok(typeof payload.etaText === 'string');
});

test('[Tier 1 | F14] initLiveBeaconViewer activates live tracking mode when URL contains ?track=stride-safe-...', async () => {
  setupMockBrowserEnv({ url: 'http://localhost:3000/?track=stride-safe-9a2b' });
  const { initLiveBeaconViewer } = await import('../../src/safeGuard.js');

  const trackedSnapshots = [];
  const sessionInfo = initLiveBeaconViewer({
    subscribeFn: (sessionId, onUpdate) => {
      trackedSnapshots.push(sessionId);
      onUpdate({
        sessionId,
        runnerName: 'Alex Runner',
        routeTitle: 'Emerald Necklace 5K',
        lat: 41.3872,
        lng: -81.7031,
        pace: "8'10\"/mi",
        distanceMiles: 2.1,
        batteryPct: 91,
        etaText: '~9 min remaining',
        active: true,
        sosActive: false
      });
      return () => {};
    }
  });

  assert.equal(trackedSnapshots[0], 'stride-safe-9a2b');
  assert.ok(sessionInfo);
});

// =============================================================================
// F15: Client-Side Spotify PKCE OAuth for Production / Capacitor
// =============================================================================

test('[Tier 1 | F15] initiateSpotifyOAuthPopup constructs client-side PKCE authorize URL when /api/spotify/auth/url is unavailable', async () => {
  const { window, localStorage } = setupMockBrowserEnv({
    fetchOptions: { disableSpotifyDevMiddleware: true }
  });
  const { setCustomSpotifyClientId, initiateSpotifyOAuthPopup } = await import('../../src/spotify.js');

  setCustomSpotifyClientId('spotify_prod_client_id_abc');
  const res = await initiateSpotifyOAuthPopup();

  assert.equal(res.opened, true);
  assert.equal(window.openedWindows.length, 1);
  const authUrl = window.openedWindows[0].url;
  assert.ok(authUrl.startsWith('https://accounts.spotify.com/authorize'));
  assert.ok(authUrl.includes('client_id=spotify_prod_client_id_abc'));
  assert.ok(authUrl.includes('code_challenge_method=S256'));
  assert.ok(localStorage.getItem('paceplot_spotify_pkce_verifier'));
});

test('[Tier 1 | F15] handleSpotifyOAuthCallbackCode exchanges code directly with https://accounts.spotify.com/api/token', async () => {
  const { fetch, localStorage } = setupMockBrowserEnv({
    fetchOptions: { disableSpotifyDevMiddleware: true }
  });
  const {
    setCustomSpotifyClientId,
    handleSpotifyOAuthCallbackCode,
    isSpotifyConnected
  } = await import('../../src/spotify.js');

  setCustomSpotifyClientId('spotify_prod_client_id_abc');
  localStorage.setItem('paceplot_spotify_pkce_verifier', 'verifier_1234567890');
  localStorage.setItem('paceplot_spotify_ActiveState', 'state_xyz');

  const ok = await handleSpotifyOAuthCallbackCode('auth_code_999', 'state_xyz');
  assert.equal(ok, true);
  assert.equal(isSpotifyConnected(), true);
  assert.ok(
    fetch.calls.some((c) => c.url.includes('accounts.spotify.com/api/token')),
    'Expected direct token exchange with https://accounts.spotify.com/api/token'
  );
});

test('[Tier 1 | F15] src/spotify.js supports direct PKCE refresh_token exchange against https://accounts.spotify.com/api/token', () => {
  const spotifySource = readProjectFile('src/spotify.js');
  assert.ok(
    spotifySource.includes('https://accounts.spotify.com/api/token'),
    'src/spotify.js must support direct token exchange/refresh against https://accounts.spotify.com/api/token'
  );
  assert.ok(
    spotifySource.includes('https://accounts.spotify.com/authorize'),
    'src/spotify.js must construct https://accounts.spotify.com/authorize URLs directly on the client'
  );
});

test('[Tier 1 | F15] Static OAuth callback page public/auth/callback/index.html exists and dispatches OAUTH_AUTH_SUCCESS', () => {
  assert.ok(
    projectFileExists('public/auth/callback/index.html'),
    'public/auth/callback/index.html must exist for static production and Capacitor builds'
  );
  const callbackHtml = readProjectFile('public/auth/callback/index.html');
  assert.ok(callbackHtml.includes('OAUTH_AUTH_SUCCESS'), 'Callback page must post OAUTH_AUTH_SUCCESS message');
});

test('[Tier 1 | F15] initSpotifyController accepts window.location.origin postMessage and ?code=&state= query callbacks', () => {
  const spotifySource = readProjectFile('src/spotify.js');
  assert.ok(
    spotifySource.includes('window.location.origin'),
    'initSpotifyController must accept postMessage from window.location.origin'
  );
});

// =============================================================================
// F16: Metric / Imperial (`km` vs `mi` & `°C` vs `°F`) Unit Toggle
// =============================================================================

test('[Tier 1 | F16] src/units.js persists unit system in localStorage and notifies onUnitSystemChange listeners', async () => {
  const storage = createMemoryStorage();
  const {
    UNITS_STORAGE_KEY,
    getUnitSystem,
    setUnitSystem,
    toggleUnitSystem,
    onUnitSystemChange
  } = await import('../../src/units.js');

  assert.equal(getUnitSystem(storage), 'imperial');
  const observed = [];
  const unsub = onUnitSystemChange((sys) => observed.push(sys));

  assert.equal(setUnitSystem('metric', storage), 'metric');
  assert.equal(storage.getItem(UNITS_STORAGE_KEY), 'metric');
  assert.equal(getUnitSystem(storage), 'metric');

  assert.equal(toggleUnitSystem(storage), 'imperial');
  unsub();
  assert.deepEqual(observed, ['metric', 'imperial']);
});

test('[Tier 1 | F16] milesToKm, kmToMiles, feetToMeters, metersToFeet, and fahrenheitToCelsius convert accurately', async () => {
  const {
    milesToKm,
    kmToMiles,
    feetToMeters,
    metersToFeet,
    fahrenheitToCelsius
  } = await import('../../src/units.js');

  assert.ok(Math.abs(milesToKm(3.106856) - 5.0) < 0.01);
  assert.ok(Math.abs(kmToMiles(5.0) - 3.106856) < 0.01);
  assert.ok(Math.abs(feetToMeters(100) - 30.48) < 0.01);
  assert.ok(Math.abs(metersToFeet(30.48) - 100) < 0.01);
  assert.equal(fahrenheitToCelsius(68), 20);
  assert.equal(fahrenheitToCelsius(32), 0);
});

test('[Tier 1 | F16] formatDistance and formatShortDistance format distances in Imperial and Metric', async () => {
  const { formatDistance, formatShortDistance } = await import('../../src/units.js');

  assert.equal(formatDistance(3.1, 'imperial', 2), '3.10 mi');
  assert.equal(formatDistance(3.1, 'metric', 2), '4.99 km');

  assert.equal(formatShortDistance(100, 'imperial'), 'In 330 ft');
  assert.equal(formatShortDistance(100, 'metric'), 'In 100 m');
  assert.equal(formatShortDistance(800, 'metric'), 'In 0.8 km');
});

test('[Tier 1 | F16] formatPaceValue, formatElevation, formatTemperature, and formatWindSpeed format both systems', async () => {
  const {
    formatPaceValue,
    formatElevation,
    formatTemperature,
    formatWindSpeed
  } = await import('../../src/units.js');

  assert.equal(formatPaceValue(510, 'imperial', true), `8'30"/mi`);
  assert.equal(formatPaceValue(510, 'metric', true), `5'17"/km`);
  assert.equal(formatElevation('+42 ft', 'imperial'), '+42 ft');
  assert.equal(formatElevation('+42 ft', 'metric'), '+13 m');
  assert.equal(formatTemperature(64, 'imperial'), '64°F');
  assert.equal(formatTemperature(64, 'metric'), '18°C');
  assert.equal(formatWindSpeed(6, 'imperial'), '6 mph');
  assert.equal(formatWindSpeed(6, 'metric'), '10 km/h');
});

test('[Tier 1 | F16] Assembled HTML includes Metric / Imperial unit toggle control in #modalAppSettings', () => {
  const html = getAssembledIndexHtml();
  assert.ok(
    html.includes('btnUnitSystemToggle') ||
      html.includes('unitImperialBtn') ||
      html.includes('unitMetricBtn') ||
      html.includes('data-unit-system'),
    'Expected Metric/Imperial unit toggle button in #modalAppSettings HTML'
  );
});

// =============================================================================
// F17: Leaflet Fallback Feature Parity
// =============================================================================

test('[Tier 1 | F17] initLeafletFallback initializes window.__activeLeafletMap and populates initial loop choices', async () => {
  const { window, document } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { initLeafletFallback } = await import('../../src/mapController.js');

  store.googleMap = null;
  store.currentRouteChoices = [];
  const mapEl = document.getElementById('map') || document.createElement('div');

  initLeafletFallback(mapEl);
  assert.ok(window.__activeLeafletMap, 'window.__activeLeafletMap should be set');
  assert.ok(store.currentRouteChoices.length >= 4, 'initLeafletFallback should generate initial 4 route choices');
});

test('[Tier 1 | F17] renderRoute and fitRouteBounds update Leaflet polylines, start marker, and UI when googleMap is null', async () => {
  const { window, document, L } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { initLeafletFallback, renderRoute } = await import('../../src/mapController.js');

  store.googleMap = null;
  initLeafletFallback(document.getElementById('map') || document.createElement('div'));
  const prevPolylineCount = L.createdPolylines.length;

  renderRoute({
    title: 'Leaflet Parity Loop',
    distance: 4.5,
    elevation: '+65 ft',
    safetyScore: '9.9',
    sidewalkPct: '100%',
    litPct: '98%',
    center: { lat: 41.3857, lng: -81.7058 },
    zoom: 15,
    path: [
      { lat: 41.3857, lng: -81.7058 },
      { lat: 41.3900, lng: -81.7000 },
      { lat: 41.3857, lng: -81.7058 }
    ]
  });

  assert.ok(L.createdPolylines.length > prevPolylineCount, 'renderRoute should draw Leaflet polylines');
  assert.ok(window.__activeLeafletMap._boundsFitted, 'fitRouteBounds should fit bounds on window.__activeLeafletMap');
  const titleEl = document.getElementById('routeHeaderTitle');
  if (titleEl) {
    assert.ok(titleEl.textContent.includes('Leaflet Parity Loop'));
  }
});

test('[Tier 1 | F17] updateRunnerMapMarker creates and updates runner marker on window.__activeLeafletMap', async () => {
  const { window, document, L } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { initLeafletFallback, updateRunnerMapMarker } = await import('../../src/mapController.js');

  store.googleMap = null;
  initLeafletFallback(document.getElementById('map') || document.createElement('div'));
  const markersBefore = L.createdMarkers.length;

  updateRunnerMapMarker({ lat: 41.3882, lng: -81.7021 });
  assert.ok(L.createdMarkers.length > markersBefore, 'Expected runner marker created on Leaflet map');

  updateRunnerMapMarker({ lat: 41.3895, lng: -81.7010 });
  assert.equal(window.__activeLeafletMap.getCenter().lat, 41.3895);
});

test('[Tier 1 | F17] handleMapLongPress and updateWaypointMarker place markers on window.__activeLeafletMap', async () => {
  const { document, L } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { initLeafletFallback, handleMapLongPress, updateWaypointMarker } = await import('../../src/mapController.js');

  store.googleMap = null;
  initLeafletFallback(document.getElementById('map') || document.createElement('div'));
  const markersBefore = L.createdMarkers.length;

  await handleMapLongPress({ lat: 41.3910, lng: -81.7015 });
  assert.ok(L.createdMarkers.length > markersBefore, 'handleMapLongPress should add droppedPinMarker on Leaflet map');

  const prompt = document.getElementById('droppedPinPrompt');
  if (prompt) {
    assert.equal(prompt.classList.contains('hidden'), false);
  }

  const markersBeforeWp = L.createdMarkers.length;
  updateWaypointMarker(41.3920, -81.7005);
  assert.ok(L.createdMarkers.length > markersBeforeWp, 'updateWaypointMarker should add waypointMarker on Leaflet map');
});

test('[Tier 1 | F17] Real GPS breadcrumb polyline renders on window.__activeLeafletMap during navigation', async () => {
  const { document, L } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { initLeafletFallback, handleRealGpsPositionUpdate } = await import('../../src/mapController.js');

  store.googleMap = null;
  initLeafletFallback(document.getElementById('map') || document.createElement('div'));
  store.isNavigating = true;
  store.navIsPaused = false;
  store.lastAcceptedGpsCoord = { lat: 41.3857, lng: -81.7058 };
  store.liveGpsBreadcrumbCoords = [{ lat: 41.3857, lng: -81.7058 }];
  store.activeRoute = {
    title: 'Leaflet Breadcrumb Loop',
    distance: 3.1,
    path: [
      { lat: 41.3857, lng: -81.7058 },
      { lat: 41.3900, lng: -81.7058 },
      { lat: 41.3857, lng: -81.7058 }
    ],
    maneuvers: [{ text: 'Start', dist: 'Start', lat: 41.3857, lng: -81.7058 }]
  };

  const polylinesBefore = L.createdPolylines.length;
  await handleRealGpsPositionUpdate({
    coords: { latitude: 41.3860, longitude: -81.7058, accuracy: 6, speed: 3.1 }
  });

  assert.ok(L.createdPolylines.length > polylinesBefore, 'Expected GPS breadcrumb polyline on Leaflet fallback map');
});
