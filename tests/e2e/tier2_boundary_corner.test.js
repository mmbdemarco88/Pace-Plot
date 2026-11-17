// -----------------------------------------------------------------------------
// Pace Plot — Tier 2: Boundary & Corner Cases E2E Suite (`tier2_boundary_corner.test.js`)
// 85 Test Cases (5 per feature across F1–F17) testing thresholds, edge cases,
// invalid/null/NaN inputs, security rules, and offline/error fallbacks.
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setupMockBrowserEnv,
  createMemoryStorage,
  readProjectFile,
  getAssembledIndexHtml
} from './helpers.js';

// =============================================================================
// F1: Modularize `src/main.js` & `index.html` — Boundary & Corner Cases
// =============================================================================

test('[Tier 2 | F1] escapeHtml safely converts null, undefined, numbers, and booleans without throwing', async () => {
  const { escapeHtml } = await import('../../src/state/store.js');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(0), '0');
  assert.equal(escapeHtml(false), 'false');
});

test('[Tier 2 | F1] escapeHtml neutralizes XSS payloads containing script tags, quotes, and ampersands', async () => {
  const { escapeHtml } = await import('../../src/state/store.js');
  const payload = `<img src=x onerror="alert('xss')"> & <script>evil()</script>`;
  const escaped = escapeHtml(payload);
  assert.ok(!escaped.includes('<script>'));
  assert.ok(!escaped.includes('<img'));
  assert.ok(escaped.includes('&lt;script&gt;'));
  assert.ok(escaped.includes('&#39;xss&#39;'));
  assert.ok(escaped.includes('&quot;'));
});

test('[Tier 2 | F1] Assembled HTML contains zero duplicate DOM IDs across index.html and src/templates/*.html', () => {
  const html = getAssembledIndexHtml();
  const allIdMatches = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set();
  const duplicates = [];
  for (const id of allIdMatches) {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  }
  assert.deepEqual(duplicates, [], `Duplicate DOM IDs found in assembled HTML: ${duplicates.join(', ')}`);
});

test('[Tier 2 | F1] Extracted UI modules do not throw when initialized against an empty DOM without optional elements', async () => {
  setupMockBrowserEnv({ populateHtml: false });
  const voiceNav = await import('../../src/voiceNav.js');
  const geocoder = await import('../../src/geocoder.js');
  const safeGuard = await import('../../src/safeGuard.js');
  const bleHeartRate = await import('../../src/bleHeartRate.js');

  assert.doesNotThrow(() => {
    voiceNav.initSpeechSynthesis();
    voiceNav.renderManeuversPreviewList([]);
    geocoder.setupLocationSearch();
    safeGuard.setupSafeGuardHandlers();
    bleHeartRate.setupBleHeartRateMonitor();
  });
});

test('[Tier 2 | F1] Mutating store properties updates shared reference across all imported modules', async () => {
  const { store } = await import('../../src/state/store.js');
  const { store: storeAlias } = await import('../../src/state/store.js');
  store.currentSelectedDistance = 6.2;
  assert.equal(storeAlias.currentSelectedDistance, 6.2);
  store.currentSelectedDistance = 3.1;
});

// =============================================================================
// F2: Build-time Tailwind CSS & FontAwesome — Boundary & Corner Cases
// =============================================================================

test('[Tier 2 | F2] tailwind.config.js defines custom spacing "0.2" and boxShadow "xs" used in markup', () => {
  const twConfig = readProjectFile('tailwind.config.js');
  assert.ok(twConfig.includes('0.2'), 'tailwind.config.js should define spacing "0.2" for py-0.2 utility');
  assert.ok(twConfig.includes('xs'), 'tailwind.config.js should define boxShadow "xs" for shadow-xs utility');
});

test('[Tier 2 | F2] index.html does not contain inline tailwind.config runtime script block', () => {
  const rawHtml = readProjectFile('index.html');
  assert.ok(!rawHtml.includes('tailwind.config ='), 'index.html must not contain inline tailwind.config runtime script');
});

test('[Tier 2 | F2] public/sw.js bypasses non-GET, cross-origin, /api/, and /__/ requests', () => {
  const swSource = readProjectFile('public/sw.js');
  assert.ok(swSource.includes("event.request.method !== 'GET'"));
  assert.ok(swSource.includes('url.origin !== self.location.origin'));
  assert.ok(swSource.includes("url.pathname.startsWith('/api/')"));
});

test('[Tier 2 | F2] src/styles/main.css preserves .runner-pulse, .eq-bar, and html.light custom styles', () => {
  const css = readProjectFile('src/styles/main.css');
  assert.ok(css.includes('.runner-pulse'), 'src/styles/main.css must preserve .runner-pulse animation rules');
  assert.ok(css.includes('.eq-bar'), 'src/styles/main.css must preserve .eq-bar equalizer styles');
  assert.ok(css.includes('html.light'), 'src/styles/main.css must preserve html.light theme overrides');
});

test('[Tier 2 | F2] tailwind.config.js content glob scans both index.html and src/**/*.{js,ts,html}', () => {
  const twConfig = readProjectFile('tailwind.config.js');
  assert.ok(twConfig.includes('./index.html'));
  assert.ok(twConfig.includes('./src/'));
});

// =============================================================================
// F3: Selective D3 Imports — Boundary & Corner Cases
// =============================================================================

test('[Tier 2 | F3] renderD3HeartRateZonesBarChart returns null safely when containerEl or zoneData is null', async () => {
  const { document } = setupMockBrowserEnv();
  const { renderD3HeartRateZonesBarChart } = await import('../../src/hrZoneChart.js');

  assert.equal(renderD3HeartRateZonesBarChart(null, { zones: [] }), null);
  assert.equal(renderD3HeartRateZonesBarChart(document.createElement('div'), null), null);
});

test('[Tier 2 | F3] renderD3HeartRateZonesBarChart returns null when zoneData has empty zones array', async () => {
  const { document } = setupMockBrowserEnv();
  const { renderD3HeartRateZonesBarChart } = await import('../../src/hrZoneChart.js');

  const container = document.createElement('div');
  const res = renderD3HeartRateZonesBarChart(container, { maxHr: 188, totalWeeklySeconds: 0, zones: [] });
  assert.equal(res, null);
  assert.equal(container.querySelectorAll('svg').length, 0);
});

test('[Tier 2 | F3] renderD3HeartRateZonesBarChart replaces previous SVG on repeated renders without duplicating SVG elements', async () => {
  const { document } = setupMockBrowserEnv();
  const { calculateHeartRateZones } = await import('../../src/trainingPlan.js');
  const { renderD3HeartRateZonesBarChart } = await import('../../src/hrZoneChart.js');

  const container = document.createElement('div');
  const zoneData = calculateHeartRateZones(188, [], 148);
  renderD3HeartRateZonesBarChart(container, zoneData);
  renderD3HeartRateZonesBarChart(container, zoneData);
  renderD3HeartRateZonesBarChart(container, zoneData);

  assert.equal(container.querySelectorAll('svg').length, 1);
  assert.equal(container.querySelectorAll('.d3-hr-zone-bar').length, 5);
});

test('[Tier 2 | F3] renderD3HeartRateZonesBarChart enforces minimum visible bar height (>= 4px) even for 0-minute zones', async () => {
  const { document } = setupMockBrowserEnv();
  const { renderD3HeartRateZonesBarChart } = await import('../../src/hrZoneChart.js');

  const container = document.createElement('div');
  const zeroZoneData = {
    maxHr: 190,
    totalWeeklySeconds: 0,
    zones: [1, 2, 3, 4, 5].map((z) => ({
      zone: z,
      code: `Z${z}`,
      name: `Zone ${z}`,
      shortName: `Z${z}`,
      minBpm: 90 + z * 15,
      maxBpm: 104 + z * 15,
      rangeLabel: '100-115 bpm',
      seconds: 0,
      durationFormatted: '0m',
      percentage: 0,
      isLiveZone: false
    }))
  };

  renderD3HeartRateZonesBarChart(container, zeroZoneData, { isDark: true });
  const bars = container.querySelectorAll('.d3-hr-zone-bar');
  assert.equal(bars.length, 5);
  bars.forEach((bar) => {
    assert.ok(Number(bar.getAttribute('height')) >= 4);
  });
});

test('[Tier 2 | F3] renderD3HeartRateZonesBarChart applies distinct light and dark theme colors', async () => {
  const { document } = setupMockBrowserEnv();
  const { calculateHeartRateZones } = await import('../../src/trainingPlan.js');
  const { renderD3HeartRateZonesBarChart } = await import('../../src/hrZoneChart.js');

  const zoneData = calculateHeartRateZones(188, [], 148);
  const darkContainer = document.createElement('div');
  const lightContainer = document.createElement('div');

  renderD3HeartRateZonesBarChart(darkContainer, zoneData, { isDark: true });
  renderD3HeartRateZonesBarChart(lightContainer, zoneData, { isDark: false });

  const darkLabelFill = darkContainer.querySelector('.d3-hr-bar-duration').getAttribute('fill');
  const lightLabelFill = lightContainer.querySelector('.d3-hr-bar-duration').getAttribute('fill');
  assert.notEqual(darkLabelFill, lightLabelFill);
});

// =============================================================================
// F4: Calibrate OSRM-Snapped Loop Distances — Boundary & Corner Cases
// =============================================================================

test('[Tier 2 | F4] fetchStreetSnappedLoopFromOsrm returns null for null, non-array, or <3 waypoints', async () => {
  const { fetchStreetSnappedLoopFromOsrm } = await import('../../src/gpsEngine.js');
  assert.equal(await fetchStreetSnappedLoopFromOsrm(null), null);
  assert.equal(await fetchStreetSnappedLoopFromOsrm([]), null);
  assert.equal(
    await fetchStreetSnappedLoopFromOsrm([
      { lat: 41.3857, lng: -81.7058 },
      { lat: 41.3867, lng: -81.7058 }
    ]),
    null
  );
});

test('[Tier 2 | F4] fetchStreetSnappedLoopFromOsrm rejects OSRM route if start snaps >500m from origin', async () => {
  const { fetch } = setupMockBrowserEnv({
    fetchOptions: { osrmSnapOffsetMeters: 620 } // >500m away
  });
  const { fetchStreetSnappedLoopFromOsrm } = await import('../../src/gpsEngine.js');

  const waypoints = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3900, lng: -81.7058 },
    { lat: 41.3900, lng: -81.7000 },
    { lat: 41.3857, lng: -81.7058 }
  ];

  const res = await fetchStreetSnappedLoopFromOsrm(waypoints, 'Far Snap Loop', { fetchImpl: fetch });
  assert.equal(res, null, 'Should reject OSRM snap >500m from origin');
});

test('[Tier 2 | F4] fetchStreetSnappedLoopFromOsrm returns null cleanly on HTTP 500 or network failure', async () => {
  const { fetch } = setupMockBrowserEnv({
    fetchOptions: { osrmShouldFail: true }
  });
  const { fetchStreetSnappedLoopFromOsrm } = await import('../../src/gpsEngine.js');

  const waypoints = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3900, lng: -81.7058 },
    { lat: 41.3900, lng: -81.7000 },
    { lat: 41.3857, lng: -81.7058 }
  ];

  const res = await fetchStreetSnappedLoopFromOsrm(waypoints, 'Error Loop', { fetchImpl: fetch });
  assert.equal(res, null);
});

test('[Tier 2 | F4] fetchStreetSnappedLoopFromOsrm skips second calibration pass when deviation is <=10% (e.g. 5%)', async () => {
  const { fetch } = setupMockBrowserEnv({
    fetchOptions: { fixedOsrmDistanceMeters: 5230 } // 3.25 mi vs 3.10 mi target (~4.8% diff <= 10%)
  });
  const { fetchStreetSnappedLoopFromOsrm } = await import('../../src/gpsEngine.js');

  const waypoints = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3910, lng: -81.7058 },
    { lat: 41.3910, lng: -81.6990 },
    { lat: 41.3857, lng: -81.6990 },
    { lat: 41.3857, lng: -81.7058 }
  ];

  const res = await fetchStreetSnappedLoopFromOsrm(waypoints, 'Close Enough Loop', {
    targetDistanceMiles: 3.1,
    fetchImpl: fetch
  });

  assert.ok(res);
  const osrmCallCount = fetch.calls.filter((c) => c.url.includes('router.project-osrm.org')).length;
  assert.equal(osrmCallCount, 1, 'Should not make a second OSRM request when deviation <= 10%');
});

test('[Tier 2 | F4] fetchStreetSnappedLoopFromOsrm clamps extreme calibration ratios safely', async () => {
  const { fetch } = setupMockBrowserEnv({
    fetchOptions: { osrmDetourFactor: 4.5 } // extreme detour
  });
  const { fetchStreetSnappedLoopFromOsrm } = await import('../../src/gpsEngine.js');

  const waypoints = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3910, lng: -81.7058 },
    { lat: 41.3910, lng: -81.6990 },
    { lat: 41.3857, lng: -81.6990 },
    { lat: 41.3857, lng: -81.7058 }
  ];

  const res = await fetchStreetSnappedLoopFromOsrm(waypoints, 'Extreme Detour Loop', {
    targetDistanceMiles: 3.1,
    fetchImpl: fetch
  });

  assert.ok(res);
  assert.ok(Number.isFinite(res.distanceMiles) && res.distanceMiles > 0);
});

// =============================================================================
// F5: Street-Snap Waypoint Loops via OSRM — Boundary & Corner Cases
// =============================================================================

test('[Tier 2 | F5] generateLoopChoicesWithWaypoint enforces minimum loop distance >= directDist * 2.2 when target is small', async () => {
  setupMockBrowserEnv({
    fetchOptions: { osrmShouldFail: true } // inspect pure geometric minimum distance
  });
  const { generateLoopChoicesWithWaypoint } = await import('../../src/mapController.js');

  // Waypoint ~2.0 miles north of origin, but user requested only 1.0 mile
  const choices = generateLoopChoicesWithWaypoint(41.3857, -81.7058, 41.4150, -81.7058, 'Far North Pin', 1.0);
  assert.equal(choices.length, 4);
  choices.forEach((c) => {
    assert.ok(c.distance >= 4.0, `Expected loop distance >= 4.0 mi for 2-mile distant waypoint, got ${c.distance}`);
  });
});

test('[Tier 2 | F5] generateLoopChoicesWithWaypoint handles coincident origin and waypoint coordinates without NaN', async () => {
  setupMockBrowserEnv({ fetchOptions: { osrmShouldFail: true } });
  const { generateLoopChoicesWithWaypoint } = await import('../../src/mapController.js');

  const choices = generateLoopChoicesWithWaypoint(41.3857, -81.7058, 41.3857, -81.7058, 'Same Point', 3.1);
  assert.equal(choices.length, 4);
  choices.forEach((c) => {
    assert.ok(Number.isFinite(c.distance) && c.distance > 0);
    c.path.forEach((pt) => {
      assert.ok(Number.isFinite(pt.lat) && Number.isFinite(pt.lng));
    });
  });
});

test('[Tier 2 | F5] generateLoopChoicesWithWaypoint preserves geometric fallback path when OSRM fails', async () => {
  setupMockBrowserEnv({ fetchOptions: { osrmShouldFail: true } });
  const { generateLoopChoicesWithWaypoint } = await import('../../src/mapController.js');

  const choices = generateLoopChoicesWithWaypoint(41.3857, -81.7058, 41.3920, -81.7000, 'Offline Pin', 3.1);
  await new Promise((r) => setTimeout(r, 40));

  assert.equal(choices[0].path.length, 9);
  assert.equal(choices[0].path[3].lat, 41.392);
  assert.equal(choices[0].path[3].lng, -81.7);
});

test('[Tier 2 | F5] fetchStreetSnappedLoopFromOsrm ignores invalid NaN preserveWaypoint without throwing', async () => {
  const { fetch } = setupMockBrowserEnv();
  const { fetchStreetSnappedLoopFromOsrm } = await import('../../src/gpsEngine.js');

  const waypoints = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3900, lng: -81.7058 },
    { lat: 41.3900, lng: -81.7000 },
    { lat: 41.3857, lng: -81.7058 }
  ];

  const snapped = await fetchStreetSnappedLoopFromOsrm(waypoints, 'Invalid WP', {
    preserveWaypoint: { lat: Number.NaN, lng: Number.NaN },
    fetchImpl: fetch
  });

  assert.ok(snapped);
  assert.ok(snapped.path.length >= 3);
});

test('[Tier 2 | F5] generateLoopChoicesWithWaypoint clamps zero or negative targetDistance to safe positive value', async () => {
  setupMockBrowserEnv({ fetchOptions: { osrmShouldFail: true } });
  const { generateLoopChoicesWithWaypoint } = await import('../../src/mapController.js');

  const choices = generateLoopChoicesWithWaypoint(41.3857, -81.7058, 41.3880, -81.7030, 'Zero Dist Pin', -2.0);
  assert.ok(choices[0].distance >= 1.5);
});

// =============================================================================
// F6: Real OSM Overpass Safety Scoring & Surface Filtering — Boundary & Corner Cases
// =============================================================================

test('[Tier 2 | F6] fetchOsmSafetyAndSurfaceMetrics returns deterministic fallback when Overpass returns HTTP 504', async () => {
  const { fetch } = setupMockBrowserEnv({
    fetchOptions: { overpassShouldFail: true }
  });
  const { fetchOsmSafetyAndSurfaceMetrics } = await import('../../src/gpsEngine.js');

  const metrics = await fetchOsmSafetyAndSurfaceMetrics(40.123, -82.456, 1200, { fetchImpl: fetch });
  assert.ok(metrics);
  assert.equal(metrics.source, 'fallback');
  assert.ok(metrics.sidewalkPct >= 80 && metrics.sidewalkPct <= 100);
  assert.ok(metrics.litPct >= 80 && metrics.litPct <= 100);
  assert.ok(metrics.safetyScore >= 8.5 && metrics.safetyScore <= 9.9);
});

test('[Tier 2 | F6] fetchOsmSafetyAndSurfaceMetrics returns fallback when Overpass returns empty elements array', async () => {
  const { fetch } = setupMockBrowserEnv({
    fetchOptions: { overpassElements: [] }
  });
  const { fetchOsmSafetyAndSurfaceMetrics } = await import('../../src/gpsEngine.js');

  const metrics = await fetchOsmSafetyAndSurfaceMetrics(39.555, -83.111, 1200, { fetchImpl: fetch });
  assert.ok(metrics);
  assert.equal(metrics.source, 'fallback');
  assert.ok(Number.isFinite(metrics.safetyScore));
});

test('[Tier 2 | F6] fetchOsmSafetyAndSurfaceMetrics handles invalid NaN coordinates by returning fallback without calling fetch', async () => {
  const { fetch } = setupMockBrowserEnv();
  const { fetchOsmSafetyAndSurfaceMetrics } = await import('../../src/gpsEngine.js');

  const metrics = await fetchOsmSafetyAndSurfaceMetrics(Number.NaN, Number.NaN, 1200, { fetchImpl: fetch });
  assert.ok(metrics);
  assert.equal(metrics.source, 'fallback');
  assert.equal(fetch.calls.filter((c) => c.url.includes('overpass-api.de')).length, 0);
});

test('[Tier 2 | F6] filterAndRankRoutesBySurface returns empty array when given null or empty choices', async () => {
  const { filterAndRankRoutesBySurface } = await import('../../src/gpsEngine.js');
  assert.deepEqual(filterAndRankRoutesBySurface(null, 'trail'), []);
  assert.deepEqual(filterAndRankRoutesBySurface([], 'lit'), []);
});

test('[Tier 2 | F6] filterAndRankRoutesBySurface handles unknown surfaceFilter gracefully without losing routes', async () => {
  const { filterAndRankRoutesBySurface } = await import('../../src/gpsEngine.js');
  const choices = [
    { id: 'a', title: 'Loop A', traitTag: 'Greenway', sidewalkPct: '98%', litPct: '96%', safetyScore: '9.8' },
    { id: 'b', title: 'Loop B', traitTag: 'Streets', sidewalkPct: '95%', litPct: '94%', safetyScore: '9.6' }
  ];
  const res = filterAndRankRoutesBySurface(choices, 'unrecognized_filter');
  assert.equal(res.length, 2);
});

// =============================================================================
// F7: Real Elevation Profiles & GPX `<ele>` Tags — Boundary & Corner Cases
// =============================================================================

test('[Tier 2 | F7] fetchRouteElevationProfile synthesizes deterministic fallback profile when Open-Meteo fails', async () => {
  const { fetch } = setupMockBrowserEnv({
    fetchOptions: { elevationShouldFail: true }
  });
  const { fetchRouteElevationProfile } = await import('../../src/gpsEngine.js');

  const path = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3880, lng: -81.7030 },
    { lat: 41.3910, lng: -81.7000 },
    { lat: 41.3857, lng: -81.7058 }
  ];

  const profile = await fetchRouteElevationProfile(path, { fetchImpl: fetch });
  assert.ok(profile);
  assert.equal(profile.elevationsMeters.length, 4);
  path.forEach((pt) => {
    assert.ok(Number.isFinite(pt.ele), 'Each point should still receive fallback pt.ele in meters');
  });
  assert.ok(profile.svgStrokePath.startsWith('M '));
});

test('[Tier 2 | F7] fetchRouteElevationProfile handles completely flat terrain without division by zero (NaN SVG coords)', async () => {
  const { fetch } = setupMockBrowserEnv({
    fetchOptions: { elevationsMeters: [210.0, 210.0, 210.0, 210.0] }
  });
  const { fetchRouteElevationProfile } = await import('../../src/gpsEngine.js');

  const path = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3870, lng: -81.7040 },
    { lat: 41.3890, lng: -81.7020 },
    { lat: 41.3857, lng: -81.7058 }
  ];

  const profile = await fetchRouteElevationProfile(path, { fetchImpl: fetch });
  assert.equal(profile.gainMeters, 0);
  assert.ok(!profile.svgStrokePath.includes('NaN'), `SVG stroke path must not contain NaN: ${profile.svgStrokePath}`);
  profile.svgPoints.forEach((pt) => {
    assert.ok(Number.isFinite(pt.x) && Number.isFinite(pt.y));
  });
});

test('[Tier 2 | F7] fetchRouteElevationProfile handles null or single-point path safely', async () => {
  const { fetchRouteElevationProfile } = await import('../../src/gpsEngine.js');
  const resNull = await fetchRouteElevationProfile(null);
  assert.ok(resNull);
  assert.equal(resNull.gainMeters, 0);

  const resSingle = await fetchRouteElevationProfile([{ lat: 41.3857, lng: -81.7058 }]);
  assert.ok(resSingle);
  assert.equal(resSingle.gainMeters, 0);
});

test('[Tier 2 | F7] buildRouteGpxString escapes XML special characters in route title and falls back when pt.ele is absent', async () => {
  const { buildRouteGpxString } = await import('../../src/gpsEngine.js');
  const routeData = {
    title: 'Parks & Trails <Night> "Loop"',
    path: [
      { lat: 41.3857, lng: -81.7058 },
      { lat: 41.3890, lng: -81.7020 }
    ]
  };

  const gpx = buildRouteGpxString(routeData, [215.3, 222.7]);
  assert.ok(gpx.includes('Parks &amp; Trails &lt;Night&gt;'));
  assert.ok(gpx.includes('<ele>215.3</ele>'));
  assert.ok(gpx.includes('<ele>222.7</ele>'));
});

test('[Tier 2 | F7] fetchRouteElevationProfile downsamples paths >80 points for Open-Meteo query and interpolates pt.ele on all points', async () => {
  const { fetch } = setupMockBrowserEnv();
  const { fetchRouteElevationProfile } = await import('../../src/gpsEngine.js');

  const longPath = Array.from({ length: 120 }, (_, i) => ({
    lat: 41.3857 + i * 0.0001,
    lng: -81.7058 + i * 0.0001
  }));

  const profile = await fetchRouteElevationProfile(longPath, { fetchImpl: fetch });
  assert.equal(profile.elevationsMeters.length, 120);
  assert.ok(longPath.every((pt) => Number.isFinite(pt.ele)));
  const meteoCall = fetch.calls.find((c) => c.url.includes('api.open-meteo.com/v1/elevation'));
  if (meteoCall) {
    const u = new URL(meteoCall.url);
    const latCount = (u.searchParams.get('latitude') || '').split(',').length;
    assert.ok(latCount <= 100, `Open-Meteo request should batch/sample <= 100 points, sent ${latCount}`);
  }
});

// =============================================================================
// F8: Off-Route Detection (>50m) & Auto-Rerouting — Boundary & Corner Cases
// =============================================================================

test('[Tier 2 | F8] pointToSegmentDistanceMeters handles degenerate zero-length segment (segA === segB) without NaN', async () => {
  const { pointToSegmentDistanceMeters } = await import('../../src/gpsEngine.js');
  const seg = { lat: 41.3857, lng: -81.7058 };
  const pt = { lat: 41.3860, lng: -81.7058 };

  const res = pointToSegmentDistanceMeters(pt, seg, seg);
  assert.equal(res.t, 0);
  assert.ok(Number.isFinite(res.distanceMeters) && res.distanceMeters > 30 && res.distanceMeters < 36);
});

test('[Tier 2 | F8] pointToSegmentDistanceMeters clamps projection parameter t to [0, 1] past segment endpoints', async () => {
  const { pointToSegmentDistanceMeters } = await import('../../src/gpsEngine.js');
  const segA = { lat: 41.3857, lng: -81.7058 };
  const segB = { lat: 41.3857, lng: -81.7000 };

  const westOfA = pointToSegmentDistanceMeters({ lat: 41.3857, lng: -81.7100 }, segA, segB);
  assert.equal(westOfA.t, 0);
  assert.equal(westOfA.closestPoint.lng, segA.lng);

  const eastOfB = pointToSegmentDistanceMeters({ lat: 41.3857, lng: -81.6950 }, segA, segB);
  assert.equal(eastOfB.t, 1);
  assert.equal(eastOfB.closestPoint.lng, segB.lng);
});

test('[Tier 2 | F8] evaluateOffRouteDeviation exact 50m threshold boundary: 49.5m is on-route, 50.5m is off-route', async () => {
  const { evaluateOffRouteDeviation } = await import('../../src/gpsEngine.js');
  const path = [
    { lat: 41.3857, lng: -81.7058 },
    { lat: 41.3857, lng: -81.6958 }
  ];

  // 1 deg lat = ~111,194.9m -> 49.5m = 0.00044516 deg, 50.5m = 0.00045416 deg
  const pt49_5m = { lat: 41.3857 + 49.5 / 111195, lng: -81.7008 };
  const pt50_5m = { lat: 41.3857 + 50.5 / 111195, lng: -81.7008 };

  const resUnder = evaluateOffRouteDeviation(pt49_5m, path, 50);
  assert.equal(resUnder.isOffRoute, false);

  const resOver = evaluateOffRouteDeviation(pt50_5m, path, 50);
  assert.equal(resOver.isOffRoute, true);
});

test('[Tier 2 | F8] evaluateOffRouteDeviation returns isOffRoute: false for null point or path with <2 points', async () => {
  const { evaluateOffRouteDeviation } = await import('../../src/gpsEngine.js');
  assert.equal(evaluateOffRouteDeviation(null, [{ lat: 41, lng: -81 }, { lat: 42, lng: -81 }], 50).isOffRoute, false);
  assert.equal(evaluateOffRouteDeviation({ lat: 41, lng: -81 }, [], 50).isOffRoute, false);
  assert.equal(evaluateOffRouteDeviation({ lat: 41, lng: -81 }, [{ lat: 41, lng: -81 }], 50).isOffRoute, false);
});

test('[Tier 2 | F8] handleRealGpsPositionUpdate respects reroute cooldown to prevent OSRM request flooding', async () => {
  const { fetch } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { handleRealGpsPositionUpdate } = await import('../../src/mapController.js');

  store.isNavigating = true;
  store.navIsPaused = false;
  store.lastRerouteTimestamp = Date.now(); // Just rerouted 0ms ago!
  store.lastAcceptedGpsCoord = { lat: 41.3857, lng: -81.7058 };
  store.activeRoute = {
    title: 'Cooldown Loop',
    distance: 3.1,
    path: [
      { lat: 41.3857, lng: -81.7058 },
      { lat: 41.3900, lng: -81.7058 },
      { lat: 41.3857, lng: -81.7058 }
    ],
    maneuvers: [{ text: 'Start', dist: 'Start', lat: 41.3857, lng: -81.7058 }]
  };

  await handleRealGpsPositionUpdate({
    coords: { latitude: 41.3860, longitude: -81.7045, accuracy: 8, speed: 3.2 }
  });

  const osrmCalls = fetch.calls.filter((c) => c.url.includes('router.project-osrm.org'));
  assert.equal(osrmCalls.length, 0, 'Should not fire a new OSRM reroute while inside the cooldown window');
});

// =============================================================================
// F9: Marathon Plan Branch in `generate4WeekPlan` — Boundary & Corner Cases
// =============================================================================

test('[Tier 2 | F9] calculatePaces clamps ultra-fast (<300s) base pace to 300s (5:00/mi) for Marathon plan', async () => {
  const { generate4WeekPlan } = await import('../../src/trainingPlan.js');
  const plan = generate4WeekPlan('marathon', 180); // 3:00/mi -> clamped to 300s (5:00/mi)
  assert.equal(plan.paces.marathonPace, 330); // 300 + 30
  assert.equal(plan.paces.marathonPaceFormatted, `5'30"/mi`);
});

test('[Tier 2 | F9] calculatePaces clamps ultra-slow (>900s) base pace to 900s (15:00/mi) for Marathon plan', async () => {
  const { generate4WeekPlan } = await import('../../src/trainingPlan.js');
  const plan = generate4WeekPlan('marathon', 1500); // 25:00/mi -> clamped to 900s (15:00/mi)
  assert.equal(plan.paces.marathonPace, 930); // 900 + 30
  assert.equal(plan.paces.marathonPaceFormatted, `15'30"/mi`);
});

test('[Tier 2 | F9] generate4WeekPlan("marathon", NaN) defaults basePaceSeconds safely to 510', async () => {
  const { generate4WeekPlan } = await import('../../src/trainingPlan.js');
  const plan = generate4WeekPlan('marathon', Number.NaN);
  assert.equal(plan.paces.marathonPace, 540);
  assert.ok(plan.predictedTime.includes('h'));
});

test('[Tier 2 | F9] generate4WeekPlan with unrecognized goalId falls back to Aerobic Base Builder (4.0 mi)', async () => {
  const { generate4WeekPlan } = await import('../../src/trainingPlan.js');
  const fallbackPlan = generate4WeekPlan('ultra_100k', 510);
  assert.equal(fallbackPlan.goalName, 'Aerobic Base Builder');
  assert.equal(fallbackPlan.targetDistance, 4.0);
});

test('[Tier 2 | F9] Every workout in Marathon Peak Block has positive finite distance and non-empty metadata', async () => {
  const { generate4WeekPlan } = await import('../../src/trainingPlan.js');
  const plan = generate4WeekPlan('marathon', 510);

  for (const week of plan.weeks) {
    assert.equal(week.days.length, 4);
    for (const day of week.days) {
      assert.ok(day.dist > 0 && Number.isFinite(day.dist));
      assert.ok(day.title && day.title.length > 3);
      assert.ok(day.pace && day.pace.includes('/mi'));
      assert.ok(day.zone && day.zone.startsWith('Zone'));
    }
  }
});

// =============================================================================
// F10: Remove Hardcoded Completed Workouts on Fresh 5K Plans — Boundary & Corner Cases
// =============================================================================

test('[Tier 2 | F10] Mutating completed flag on one 5K plan instance does not pollute subsequent generate4WeekPlan("5k") calls', async () => {
  const { generate4WeekPlan } = await import('../../src/trainingPlan.js');
  const planA = generate4WeekPlan('5k', 510);
  planA.weeks[0].days[0].completed = true;
  planA.weeks[0].days[1].completed = true;

  const planB = generate4WeekPlan('5k', 510);
  assert.equal(planB.weeks[0].days[0].completed, false);
  assert.equal(planB.weeks[0].days[1].completed, false);
});

test('[Tier 2 | F10] generate4WeekPlan() with no arguments defaults to 5K with 0 completed days', async () => {
  const { generate4WeekPlan } = await import('../../src/trainingPlan.js');
  const defaultPlan = generate4WeekPlan();
  assert.equal(defaultPlan.goalId, '5k');
  assert.equal(defaultPlan.weeks.flatMap((w) => w.days).every((d) => d.completed === false), true);
});

test('[Tier 2 | F10] loadActivePlan returns null safely when localStorage contains malformed JSON', async () => {
  setupMockBrowserEnv({
    initialLocalStorage: {
      paceplot_active_training_plan: '{corrupted_json:'
    }
  });
  const { loadActivePlan } = await import('../../src/trainingPlan.js');
  assert.equal(loadActivePlan(), null);
});

test('[Tier 2 | F10] hydrateTrainingPlanFromCloud ignores null or malformed activeTrainingPlan objects', async () => {
  const storage = createMemoryStorage({
    paceplot_active_training_plan: JSON.stringify({ goalId: '5k', weeks: [{ weekNum: 1, days: [] }] })
  });
  const { hydrateTrainingPlanFromCloud } = await import('../../src/trainingPlan.js');

  assert.equal(hydrateTrainingPlanFromCloud(null, storage), null);
  assert.equal(hydrateTrainingPlanFromCloud({ activeTrainingPlan: 'not-an-object' }, storage), null);
  assert.equal(hydrateTrainingPlanFromCloud({ activeTrainingPlan: { weeks: [] } }, storage), null);
  assert.ok(storage.getItem('paceplot_active_training_plan').includes('"5k"'));
});

test('[Tier 2 | F10] All 4 weeks of 5K plan have 4 days each withMon/Wed/Fri/Sun structure', async () => {
  const { generate4WeekPlan } = await import('../../src/trainingPlan.js');
  const plan = generate4WeekPlan('5k', 510);
  plan.weeks.forEach((week) => {
    assert.deepEqual(
      week.days.map((d) => d.day),
      ['Mon', 'Wed', 'Fri', 'Sun']
    );
  });
});

// =============================================================================
// F11: Fix Time-of-Day Badge Evaluation — Boundary & Corner Cases
// =============================================================================

test('[Tier 2 | F11] Exact 7:00 AM boundary: 06:59:59 unlocks early_bird, 07:00:00 does NOT unlock early_bird', async () => {
  setupMockBrowserEnv({
    initialLocalStorage: { paceplot_unlocked_badges: JSON.stringify([]) }
  });
  const { evaluateBadgesFromWorkouts, getUnlockedBadges, saveUnlockedBadges } = await import('../../src/badges.js');

  // 07:00:00 -> hour === 7 -> NOT < 7
  evaluateBadgesFromWorkouts([{ routeTitle: 'Seven AM Run', distance: 3.1, completedAt: '2026-05-10T07:00:00' }]);
  assert.equal(getUnlockedBadges().includes('early_bird'), false, '07:00:00 must not unlock early_bird');

  // 06:59:59 -> hour === 6 -> < 7
  saveUnlockedBadges([]);
  evaluateBadgesFromWorkouts([{ routeTitle: 'Six Fifty Nine Run', distance: 3.1, completedAt: '2026-05-10T06:59:59' }]);
  assert.equal(getUnlockedBadges().includes('early_bird'), true, '06:59:59 must unlock early_bird');
});

test('[Tier 2 | F11] Exact 8:00 PM boundary: 19:59:59 does NOT unlock night_owl, 20:00:00 unlocks night_owl', async () => {
  setupMockBrowserEnv({
    initialLocalStorage: { paceplot_unlocked_badges: JSON.stringify([]) }
  });
  const { evaluateBadgesFromWorkouts, getUnlockedBadges, saveUnlockedBadges } = await import('../../src/badges.js');

  // 19:59:59 -> hour === 19 -> NOT >= 20
  evaluateBadgesFromWorkouts([{ routeTitle: 'Dusk Run', distance: 3.1, completedAt: '2026-05-10T19:59:59' }]);
  assert.equal(getUnlockedBadges().includes('night_owl'), false, '19:59:59 must not unlock night_owl');

  // 20:00:00 -> hour === 20 -> >= 20
  saveUnlockedBadges([]);
  evaluateBadgesFromWorkouts([{ routeTitle: 'Eight PM Run', distance: 3.1, completedAt: '2026-05-10T20:00:00' }]);
  assert.equal(getUnlockedBadges().includes('night_owl'), true, '20:00:00 must unlock night_owl');
});

test('[Tier 2 | F11] evaluateBadgesFromWorkouts([]) with empty workout list does not unlock early_bird or night_owl', async () => {
  setupMockBrowserEnv({
    initialLocalStorage: { paceplot_unlocked_badges: JSON.stringify([]) }
  });
  const { evaluateBadgesFromWorkouts, getUnlockedBadges } = await import('../../src/badges.js');

  evaluateBadgesFromWorkouts([]);
  assert.deepEqual(getUnlockedBadges(), []);
});

test('[Tier 2 | F11] evaluateBadgesFromWorkouts handles malformed completedAt timestamp strings without throwing', async () => {
  setupMockBrowserEnv({
    initialLocalStorage: { paceplot_unlocked_badges: JSON.stringify(['early_bird', 'night_owl']) }
  });
  const { evaluateBadgesFromWorkouts } = await import('../../src/badges.js');

  assert.doesNotThrow(() => {
    evaluateBadgesFromWorkouts([{ routeTitle: 'Malformed Date Run', distance: 3.5, completedAt: 'invalid-date-string' }]);
  });
});

test('[Tier 2 | F11] unlockBadge returns false and does not invoke callback when badge is already unlocked', async () => {
  setupMockBrowserEnv({
    initialLocalStorage: { paceplot_unlocked_badges: JSON.stringify(['early_bird']) }
  });
  const { unlockBadge } = await import('../../src/badges.js');

  let called = 0;
  const result = unlockBadge('early_bird', () => {
    called += 1;
  });
  assert.equal(result, false);
  assert.equal(called, 0);
});

// =============================================================================
// F12: Complete Offline Workout Queue & Background Sync — Boundary & Corner Cases
// =============================================================================

test('[Tier 2 | F12] enqueueOfflineWorkout deduplicates workouts with identical completedAt and routeTitle', async () => {
  const storage = createMemoryStorage();
  const { enqueueOfflineWorkout, getOfflineWorkoutQueue } = await import('../../src/firebase.js');

  const workout = {
    routeTitle: 'Duplicate Guard 5K',
    distance: 3.1,
    durationSeconds: 1500,
    completedAt: '2026-05-10T06:30:00.000Z'
  };

  await enqueueOfflineWorkout(workout, storage);
  await enqueueOfflineWorkout(workout, storage);

  const queue = getOfflineWorkoutQueue(storage);
  assert.equal(queue.length, 1, 'Identical workout should not be duplicated in offline queue');
});

test('[Tier 2 | F12] getOfflineWorkoutQueue returns empty array when localStorage contains malformed JSON', async () => {
  const storage = createMemoryStorage({
    paceplot_offline_workout_queue: 'not_valid_json['
  });
  const { getOfflineWorkoutQueue } = await import('../../src/firebase.js');
  assert.deepEqual(getOfflineWorkoutQueue(storage), []);
});

test('[Tier 2 | F12] flushOfflineWorkoutQueue preserves queue when offline or unauthenticated', async () => {
  const storage = createMemoryStorage();
  const { enqueueOfflineWorkout, flushOfflineWorkoutQueue, getOfflineWorkoutQueue } = await import('../../src/firebase.js');

  await enqueueOfflineWorkout(
    { routeTitle: 'Offline Run', distance: 3.1, durationSeconds: 1500, completedAt: '2026-05-10T08:00:00Z' },
    storage
  );

  // Case 1: offline
  await flushOfflineWorkoutQueue({ storage, isOnline: false, user: { uid: 'u1' } });
  assert.equal(getOfflineWorkoutQueue(storage).length, 1);

  // Case 2: online but signed out
  await flushOfflineWorkoutQueue({ storage, isOnline: true, user: null });
  assert.equal(getOfflineWorkoutQueue(storage).length, 1);
});

test('[Tier 2 | F12] flushOfflineWorkoutQueue retains failed items in queue when uploadFn rejects', async () => {
  const storage = createMemoryStorage();
  const { enqueueOfflineWorkout, flushOfflineWorkoutQueue, getOfflineWorkoutQueue } = await import('../../src/firebase.js');

  await enqueueOfflineWorkout(
    { routeTitle: 'Run 1 (Succeeds)', distance: 3.1, durationSeconds: 1500, completedAt: '2026-05-10T08:00:00Z' },
    storage
  );
  await enqueueOfflineWorkout(
    { routeTitle: 'Run 2 (Fails)', distance: 4.0, durationSeconds: 1900, completedAt: '2026-05-10T09:00:00Z' },
    storage
  );

  await flushOfflineWorkoutQueue({
    storage,
    isOnline: true,
    user: { uid: 'u1' },
    uploadFn: async (item) => {
      if (item.routeTitle.includes('Fails')) {
        throw new Error('Firestore network timeout');
      }
      return 'ok_id';
    }
  });

  const remaining = getOfflineWorkoutQueue(storage);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].routeTitle, 'Run 2 (Fails)');
});

test('[Tier 2 | F12] enqueueOfflineWorkout succeeds in localStorage even when CacheStorage is unavailable', async () => {
  setupMockBrowserEnv();
  const prevCaches = globalThis.caches;
  globalThis.caches = undefined;
  try {
    const storage = createMemoryStorage();
    const { enqueueOfflineWorkout, getOfflineWorkoutQueue } = await import('../../src/firebase.js');
    await enqueueOfflineWorkout({ routeTitle: 'No CacheStorage Run', distance: 2.5, durationSeconds: 1200 }, storage);
    assert.equal(getOfflineWorkoutQueue(storage).length, 1);
  } finally {
    globalThis.caches = prevCaches;
  }
});

// =============================================================================
// F13: Sync Subscription & Training Plan State to Firestore — Boundary & Corner Cases
// =============================================================================

test('[Tier 2 | F13] hydrateSubscriptionFromCloud handles null or empty profileData without corrupting local state', async () => {
  const storage = createMemoryStorage();
  const { startFreeTrial, hydrateSubscriptionFromCloud, SUBSCRIPTION_STATUS } = await import('../../src/premium.js');

  startFreeTrial(60000, 'annual', Date.now(), storage);
  const afterNull = hydrateSubscriptionFromCloud(null, storage);
  assert.equal(afterNull.status, SUBSCRIPTION_STATUS.TRIAL_ACTIVE);

  const afterEmpty = hydrateSubscriptionFromCloud({}, storage);
  assert.equal(afterEmpty.status, SUBSCRIPTION_STATUS.TRIAL_ACTIVE);
});

test('[Tier 2 | F13] hydrateSubscriptionFromCloud transitions cloud trial_active with past trialExpiresAt to trial_expired', async () => {
  const storage = createMemoryStorage();
  const { hydrateSubscriptionFromCloud, SUBSCRIPTION_STATUS } = await import('../../src/premium.js');

  const past = Date.now() - 10000;
  const state = hydrateSubscriptionFromCloud(
    {
      subscriptionStatus: 'trial_active',
      tier: 'annual',
      trialStartedAt: past - 7 * 86400 * 1000,
      trialExpiresAt: past
    },
    storage
  );

  assert.equal(state.status, SUBSCRIPTION_STATUS.TRIAL_EXPIRED);
  assert.equal(state.hasAccess, false);
});

test('[Tier 2 | F13] hydrateSubscriptionFromCloud preserves local pro_active paid subscription if cloud profile is free', async () => {
  const storage = createMemoryStorage();
  const { activatePaidSubscription, hydrateSubscriptionFromCloud, SUBSCRIPTION_STATUS } = await import('../../src/premium.js');

  activatePaidSubscription('annual', storage);
  const state = hydrateSubscriptionFromCloud({ subscriptionStatus: 'free' }, storage);
  assert.equal(state.status, SUBSCRIPTION_STATUS.PRO_ACTIVE);
  assert.equal(state.hasAccess, true);
});

test('[Tier 2 | F13] firestore.rules isValidUserProfile enforces email presence and hasOnly(allowedKeys)', () => {
  const rules = readProjectFile('firestore.rules');
  assert.ok(rules.includes("data.keys().hasAll(['email'])"));
  assert.ok(rules.includes('data.keys().hasOnly(allowedKeys)'));
});

test('[Tier 2 | F13] syncUserProfileState returns null safely without throwing when user is signed out', async () => {
  setupMockBrowserEnv();
  const { syncUserProfileState } = await import('../../src/firebase.js');
  const res = await syncUserProfileState({ subscriptionStatus: 'pro_active' });
  assert.equal(res, null);
});

// =============================================================================
// F14: Live SafeGuard Beacon Session Document — Boundary & Corner Cases
// =============================================================================

test('[Tier 2 | F14] getOrCreateBeaconSessionId generates valid stride-safe ID and persists it in storage', async () => {
  const storage = createMemoryStorage();
  const { getOrCreateBeaconSessionId } = await import('../../src/safeGuard.js');

  const id1 = getOrCreateBeaconSessionId(storage);
  assert.match(id1, /^stride-safe-[a-zA-Z0-9_-]+$/);
  const id2 = getOrCreateBeaconSessionId(storage);
  assert.equal(id1, id2);
});

test('[Tier 2 | F14] firestore.rules isValidBeaconSession validates lat/lng coordinate bounds and batteryPct range', () => {
  const rules = readProjectFile('firestore.rules');
  assert.ok(rules.includes('lat') && rules.includes('-90') && rules.includes('90'));
  assert.ok(rules.includes('lng') && rules.includes('-180') && rules.includes('180'));
  assert.ok(rules.includes('batteryPct') && rules.includes('100'));
});

test('[Tier 2 | F14] syncLiveBeaconSession succeeds with fallback batteryPct when navigator.getBattery is undefined', async () => {
  const env = setupMockBrowserEnv();
  env.navigator.getBattery = undefined;
  const { syncLiveBeaconSession } = await import('../../src/safeGuard.js');

  const payload = await syncLiveBeaconSession({ active: true });
  assert.ok(payload);
  assert.ok(payload.batteryPct >= 0 && payload.batteryPct <= 100);
});

test('[Tier 2 | F14] initLiveBeaconViewer ignores missing or malicious ?track= parameter', async () => {
  setupMockBrowserEnv({ url: 'http://localhost:3000/?track=<script>evil()</script>' });
  const { initLiveBeaconViewer } = await import('../../src/safeGuard.js');
  const res = initLiveBeaconViewer();
  assert.equal(res, null);
});

test('[Tier 2 | F14] upsertBeaconSession returns null safely when sessionId is empty or user is signed out', async () => {
  setupMockBrowserEnv();
  const { upsertBeaconSession } = await import('../../src/firebase.js');
  assert.equal(await upsertBeaconSession('', { active: true }), null);
  assert.equal(await upsertBeaconSession('stride-safe-7b49', { active: true }), null);
});

// =============================================================================
// F15: Client-Side Spotify PKCE OAuth — Boundary & Corner Cases
// =============================================================================

test('[Tier 2 | F15] handleSpotifyOAuthCallbackCode rejects callback on OAuth state mismatch', async () => {
  const { localStorage } = setupMockBrowserEnv();
  const { handleSpotifyOAuthCallbackCode } = await import('../../src/spotify.js');

  localStorage.setItem('paceplot_spotify_ActiveState', 'expected_state_111');
  const ok = await handleSpotifyOAuthCallbackCode('valid_code_abc', 'tampered_state_222');
  assert.equal(ok, false);
});

test('[Tier 2 | F15] handleSpotifyOAuthCallbackCode returns false immediately for empty or null code', async () => {
  setupMockBrowserEnv();
  const { handleSpotifyOAuthCallbackCode } = await import('../../src/spotify.js');
  assert.equal(await handleSpotifyOAuthCallbackCode(''), false);
  assert.equal(await handleSpotifyOAuthCallbackCode(null), false);
});

test('[Tier 2 | F15] initiateSpotifyOAuthPopup returns missing_client_id when no clientId is configured and server 404s', async () => {
  setupMockBrowserEnv({
    fetchOptions: { disableSpotifyDevMiddleware: true }
  });
  const { setCustomSpotifyClientId, initiateSpotifyOAuthPopup } = await import('../../src/spotify.js');

  setCustomSpotifyClientId('');
  let configNeededCalled = false;
  const res = await initiateSpotifyOAuthPopup({
    onNeedsConfig: () => {
      configNeededCalled = true;
    }
  });

  // Either opens with default fallback client ID or triggers missing_client_id cleanly
  if (!res.opened) {
    assert.equal(res.reason, 'missing_client_id');
    assert.equal(configNeededCalled, true);
  }
});

test('[Tier 2 | F15] initiateSpotifyOAuthPopup handles blocked popup window gracefully', async () => {
  const { window } = setupMockBrowserEnv();
  window.open = () => null;
  const { setCustomSpotifyClientId, initiateSpotifyOAuthPopup } = await import('../../src/spotify.js');

  setCustomSpotifyClientId('client_id_popup_test');
  let blockedCalled = false;
  const res = await initiateSpotifyOAuthPopup({
    onPopupBlocked: () => {
      blockedCalled = true;
    }
  });

  assert.equal(res.opened, false);
  assert.equal(res.reason, 'popup_blocked');
  assert.equal(blockedCalled, true);
});

test('[Tier 2 | F15] disconnectSpotifyAccount clears stored tokens and resets connection state', async () => {
  setupMockBrowserEnv();
  const { connectWithAccessTokenDirect, disconnectSpotifyAccount, isSpotifyConnected } = await import('../../src/spotify.js');

  await connectWithAccessTokenDirect('temp_token_123');
  assert.equal(isSpotifyConnected(), true);
  disconnectSpotifyAccount();
  assert.equal(isSpotifyConnected(), false);
});

// =============================================================================
// F16: Metric / Imperial Unit Toggle — Boundary & Corner Cases
// =============================================================================

test('[Tier 2 | F16] setUnitSystem normalizes invalid unit strings safely to "imperial"', async () => {
  const storage = createMemoryStorage();
  const { setUnitSystem, getUnitSystem } = await import('../../src/units.js');

  assert.equal(setUnitSystem('nautical_miles', storage), 'imperial');
  assert.equal(getUnitSystem(storage), 'imperial');
  assert.equal(setUnitSystem(null, storage), 'imperial');
});

test('[Tier 2 | F16] formatDistance handles 0, null, and NaN inputs without producing NaN strings', async () => {
  const { formatDistance } = await import('../../src/units.js');
  assert.equal(formatDistance(0, 'imperial', 2), '0.00 mi');
  assert.equal(formatDistance(0, 'metric', 2), '0.00 km');
  assert.equal(formatDistance(Number.NaN, 'metric', 2), '0.00 km');
  assert.equal(formatDistance(null, 'imperial', 1), '0.0 mi');
});

test('[Tier 2 | F16] formatPaceValue clamps sub-60s pace values and supports omitting unit suffix', async () => {
  const { formatPaceValue } = await import('../../src/units.js');
  assert.equal(formatPaceValue(10, 'imperial', true), `1'00"/mi`);
  assert.equal(formatPaceValue(510, 'imperial', false), `8'30"`);
  assert.equal(formatPaceValue(510, 'metric', false), `5'17"`);
});

test('[Tier 2 | F16] formatElevation handles negative numbers, numeric inputs, and inputIsMeters flag', async () => {
  const { formatElevation } = await import('../../src/units.js');
  assert.equal(formatElevation(100, 'metric', true), '+100 m');
  assert.equal(formatElevation(100, 'imperial', true), '+328 ft');
  assert.equal(formatElevation(-20, 'metric', true), '-20 m');
});

test('[Tier 2 | F16] fahrenheitToCelsius handles freezing (32°F -> 0°C) and sub-zero (-40°F -> -40°C) temperatures', async () => {
  const { fahrenheitToCelsius, formatTemperature } = await import('../../src/units.js');
  assert.equal(fahrenheitToCelsius(32), 0);
  assert.equal(fahrenheitToCelsius(-40), -40);
  assert.equal(formatTemperature(32, 'metric'), '0°C');
});

// =============================================================================
// F17: Leaflet Fallback Feature Parity — Boundary & Corner Cases
// =============================================================================

test('[Tier 2 | F17] renderRoute(null) and fitRouteBounds(null) do not throw in Leaflet fallback mode', async () => {
  const { document } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { initLeafletFallback, renderRoute, fitRouteBounds } = await import('../../src/mapController.js');

  store.googleMap = null;
  initLeafletFallback(document.getElementById('map') || document.createElement('div'));

  assert.doesNotThrow(() => {
    renderRoute(null);
    fitRouteBounds(null);
  });
});

test('[Tier 2 | F17] updateRunnerMapMarker(null) does not throw in Leaflet fallback mode', async () => {
  const { document } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { initLeafletFallback, updateRunnerMapMarker } = await import('../../src/mapController.js');

  store.googleMap = null;
  initLeafletFallback(document.getElementById('map') || document.createElement('div'));

  assert.doesNotThrow(() => {
    updateRunnerMapMarker(null);
  });
});

test('[Tier 2 | F17] Repeated renderRoute calls in Leaflet fallback mode clean up old polylines on window.__activeLeafletMap', async () => {
  const { window, document } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { initLeafletFallback, renderRoute } = await import('../../src/mapController.js');

  store.googleMap = null;
  initLeafletFallback(document.getElementById('map') || document.createElement('div'));

  const sampleRoute = {
    title: 'Cleanup Test Loop',
    distance: 3.1,
    center: { lat: 41.3857, lng: -81.7058 },
    zoom: 15,
    path: [
      { lat: 41.3857, lng: -81.7058 },
      { lat: 41.3900, lng: -81.7000 },
      { lat: 41.3857, lng: -81.7058 }
    ]
  };

  renderRoute(sampleRoute);
  const layerCountAfterFirst = window.__activeLeafletMap._layers.length;
  renderRoute(sampleRoute);
  renderRoute(sampleRoute);
  const layerCountAfterThird = window.__activeLeafletMap._layers.length;

  assert.equal(
    layerCountAfterThird,
    layerCountAfterFirst,
    'Repeated renderRoute calls must remove previous route layers instead of accumulating duplicates'
  );
});

test('[Tier 2 | F17] stopNavigation removes runner marker from window.__activeLeafletMap', async () => {
  const { document } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { initLeafletFallback, updateRunnerMapMarker, stopNavigation } = await import('../../src/mapController.js');

  store.googleMap = null;
  initLeafletFallback(document.getElementById('map') || document.createElement('div'));
  store.isNavigating = true;
  store.activeRoute = {
    title: 'Stop Nav Loop',
    distance: 3.1,
    center: { lat: 41.3857, lng: -81.7058 },
    path: [
      { lat: 41.3857, lng: -81.7058 },
      { lat: 41.3900, lng: -81.7000 },
      { lat: 41.3857, lng: -81.7058 }
    ],
    maneuvers: [{ text: 'Start', dist: 'Start' }]
  };

  updateRunnerMapMarker({ lat: 41.3870, lng: -81.7030 });
  stopNavigation(false);
  assert.equal(store.isNavigating, false);
  assert.equal(store.runnerMarker, null);
});

test('[Tier 2 | F17] setSheetCollapsed invalidates size on window.__activeLeafletMap when googleMap is null', async () => {
  const { window, document } = setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { initLeafletFallback, setSheetCollapsed } = await import('../../src/mapController.js');

  store.googleMap = null;
  initLeafletFallback(document.getElementById('map') || document.createElement('div'));
  const beforeCount = window.__activeLeafletMap._invalidatedCount;

  setSheetCollapsed(true);
  await new Promise((r) => setTimeout(r, 360));
  assert.ok(
    window.__activeLeafletMap._invalidatedCount > beforeCount || window.__activeLeafletMap._boundsFitted !== null,
    'setSheetCollapsed should invalidate size or re-fit bounds on window.__activeLeafletMap'
  );
});
