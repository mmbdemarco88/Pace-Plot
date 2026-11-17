import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { resolveHtmlIncludes } from '../vite.config.js';
import { store, escapeHtml } from './state/store.js';
import * as voiceNav from './voiceNav.js';
import * as geocoder from './geocoder.js';
import * as safeGuard from './safeGuard.js';
import * as bleHeartRate from './bleHeartRate.js';
import * as mapController from './mapController.js';
import { setUnitSystem, getUnitSystem, formatDistance, formatPaceValue } from './units.js';

const ROOT = process.cwd();

test('M3: store.js initializes currentPlanWeek=0 and navSecondsElapsed=0', () => {
  assert.equal(store.currentPlanWeek, 0);
  assert.equal(store.navSecondsElapsed, 0);
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
});

test('M3: Extracted modules export all required PROJECT.md §5 symbols without circular-import crashes', () => {
  // voiceNav.js
  for (const fn of ['initSpeechSynthesis', 'playTurnChime', 'speakInstruction', 'renderManeuversPreviewList']) {
    assert.equal(typeof voiceNav[fn], 'function', `voiceNav.${fn} must be a function`);
  }

  // geocoder.js
  for (const fn of ['setupLocationSearch', 'reverseGeocodeCoordinate']) {
    assert.equal(typeof geocoder[fn], 'function', `geocoder.${fn} must be a function`);
  }

  // safeGuard.js
  for (const fn of ['setupSafeGuardHandlers', 'syncLiveBeaconSession', 'initLiveBeaconViewer', 'getOrCreateBeaconSessionId']) {
    assert.equal(typeof safeGuard[fn], 'function', `safeGuard.${fn} must be a function`);
  }

  // bleHeartRate.js
  assert.equal(typeof bleHeartRate.setupBleHeartRateMonitor, 'function', 'bleHeartRate.setupBleHeartRateMonitor must be a function');

  // mapController.js
  const mapExports = [
    'initGoogleMaps',
    'initLeafletFallback',
    'renderRoute',
    'fitRouteBounds',
    'updateRouteInfoUI',
    'updateElevationChartSVG',
    'updateWeatherBadgeForRoute',
    'generateMultipleLoopChoices',
    'generateLoopFromCoords',
    'generateLoopChoicesWithWaypoint',
    'renderRouteChoicesList',
    'zoomMapOntoCoordinate',
    'locateUserRealGpsAndMapLoops',
    'handleMapLongPress',
    'updateWaypointMarker',
    'updateRunnerMapMarker',
    'handleRealGpsPositionUpdate',
    'startNavigation',
    'stopNavigation',
    'updateNavStep',
    'setSheetCollapsed'
  ];
  for (const fn of mapExports) {
    assert.equal(typeof mapController[fn], 'function', `mapController.${fn} must be a function`);
  }

  // Verify leaf modules do not import main.js or mapController.js
  for (const rel of ['src/voiceNav.js', 'src/geocoder.js', 'src/safeGuard.js', 'src/bleHeartRate.js']) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
    assert.equal(src.includes('main.js'), false, `${rel} must not import main.js`);
    assert.equal(src.includes('mapController.js'), false, `${rel} must not import mapController.js`);
  }
});

test('M3: index.html is modular (<600 lines), assembles partials cleanly with zero CDN links & zero duplicate IDs', () => {
  const indexRaw = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  const lineCount = indexRaw.split('\n').length;
  assert.ok(lineCount < 600, `index.html should be < 600 lines, got ${lineCount}`);
  assert.ok(indexRaw.includes('<!-- @include src/templates/'), 'index.html should include src/templates/*.html');
  assert.equal(indexRaw.includes('cdn.tailwindcss.com'), false, 'index.html must not include cdn.tailwindcss.com');
  assert.equal(indexRaw.includes('cdnjs.cloudflare.com'), false, 'index.html must not include cloudflare FontAwesome');

  const assembled = resolveHtmlIncludes(indexRaw, ROOT);
  const idMatches = [...assembled.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(idMatches.length > 200, 'Assembled HTML should preserve all DOM IDs');
  const seen = new Set();
  const dups = [];
  for (const id of idMatches) {
    if (seen.has(id)) dups.push(id);
    seen.add(id);
  }
  assert.deepEqual(dups, [], `Duplicate DOM IDs found: ${dups.join(', ')}`);

  // Required M3 UI elements
  assert.ok(assembled.includes('data-goal="marathon"'), 'Marathon goal button must exist');
  assert.ok(assembled.includes('0 / 4 Done'), 'Initial planWeekCompletionStatus must be 0 / 4 Done');
  assert.ok(assembled.includes('id="btnUnitSystemToggle"'), 'Unit toggle container must exist');
  assert.ok(assembled.includes('id="unitImperialBtn"') && assembled.includes('data-unit-system="imperial"'));
  assert.ok(assembled.includes('id="unitMetricBtn"') && assembled.includes('data-unit-system="metric"'));
});

test('M3: Leaflet fallback parity & Metric/Imperial units integration', () => {
  const memStorage = (() => {
    const map = new Map();
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k)
    };
  })();

  setUnitSystem('metric', memStorage);
  assert.equal(getUnitSystem(memStorage), 'metric');
  assert.equal(formatDistance(3.1, 'metric'), '4.99 km');
  assert.equal(formatPaceValue(510, 'metric'), '5\'17"/km');

  setUnitSystem('imperial', memStorage);
  assert.equal(getUnitSystem(memStorage), 'imperial');
  assert.equal(formatDistance(3.1, 'imperial'), '3.10 mi');
  assert.equal(formatPaceValue(510, 'imperial'), '8\'30"/mi');

  // Verify mapController handles Leaflet fallback hooks safely in non-DOM/mock environment
  const mockPolylines = [];
  const mockMarkers = [];
  const mockLeafletMap = {
    fitBounds: () => {},
    panTo: () => {},
    setView: () => {},
    removeLayer: () => {},
    invalidateSize: () => {}
  };
  globalThis.window = globalThis.window || {};
  globalThis.window.__activeLeafletMap = mockLeafletMap;

  // Calling renderRoute, fitRouteBounds, updateRunnerMapMarker, updateWaypointMarker should not throw
  const route = mapController.ROUTES.parma;
  assert.doesNotThrow(() => {
    mapController.fitRouteBounds(route);
    mapController.updateWaypointMarker(41.386, -81.705);
    mapController.updateRunnerMapMarker({ lat: 41.385, lng: -81.706 });
  });
  void mockPolylines;
  void mockMarkers;
  delete globalThis.window.__activeLeafletMap;
});
