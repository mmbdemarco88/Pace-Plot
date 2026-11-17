// -----------------------------------------------------------------------------
// Pace Plot — Tier 5: White-Box Adversarial Hardening Suite (`tier5_adversarial.test.js`)
// 22 Adversarial Tests verifying edge cases, security boundaries, race conditions,
// malformed inputs, storage failures, and build/SW parity.
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  setupMockBrowserEnv,
  createMemoryStorage,
  createMockCacheStorage,
  readProjectFile,
  PROJECT_ROOT
} from './helpers.js';

// 1. Truncated 16-bit BLE HR packet [0x01, 0x48] & out-of-range >240
test('[Tier 5 | Adv 01] parseBleHeartRateMeasurement rejects truncated 16-bit packet [0x01, 0x48] and >240 BPM', async () => {
  const { parseBleHeartRateMeasurement } = await import('../../src/gpsEngine.js');

  // 16-bit flag set (0x01) with only 2 bytes -> must return null instead of reading 8-bit 0x48 (72)
  const truncatedBuf = new Uint8Array([0x01, 0x48]).buffer;
  assert.equal(parseBleHeartRateMeasurement(new DataView(truncatedBuf)), null);

  // Out-of-range 16-bit BPM (>240)
  const high16Buf = new Uint8Array([0x01, 0xf5, 0x00]).buffer; // 245 BPM
  assert.equal(parseBleHeartRateMeasurement(new DataView(high16Buf)), null);

  // Valid 16-bit BPM (300ms? no, 185 BPM)
  const valid16Buf = new Uint8Array([0x01, 0xb9, 0x00]).buffer;
  assert.equal(parseBleHeartRateMeasurement(new DataView(valid16Buf)), 185);
});

// 2. Antipodal haversineDistanceMeters (no NaN) & null coords
test('[Tier 5 | Adv 02] haversineDistanceMeters handles antipodal points without NaN and rejects null/empty coords', async () => {
  const { haversineDistanceMeters } = await import('../../src/gpsEngine.js');

  const antipodal = haversineDistanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
  assert.ok(Number.isFinite(antipodal));
  assert.ok(antipodal > 20000000); // ~half Earth circumference

  assert.equal(haversineDistanceMeters({ lat: null, lng: -81.7 }, { lat: 41.3, lng: -81.7 }), 0);
  assert.equal(haversineDistanceMeters({ lat: '', lng: '' }, { lat: 41.3, lng: -81.7 }), 0);
  assert.equal(haversineDistanceMeters(null, { lat: 41.3, lng: -81.7 }), 0);
  assert.equal(haversineDistanceMeters({ lat: NaN, lng: 0 }, { lat: 0, lng: 0 }), 0);
});

// 3. filterAndRankRoutesBySurface with string percentages ('95%', '100%')
test('[Tier 5 | Adv 03] filterAndRankRoutesBySurface parses string percentages like "95%" and "100%" accurately', async () => {
  const { filterAndRankRoutesBySurface } = await import('../../src/gpsEngine.js');

  const choices = [
    { id: 'low', title: 'Dim Alley', litPct: '20%', sidewalkPct: '30%' },
    { id: 'high', title: 'Bright Blvd', litPct: '100%', sidewalkPct: '95%' }
  ];

  const rankedLit = filterAndRankRoutesBySurface(choices, 'lit');
  assert.equal(rankedLit[0].id, 'high');
  assert.ok(rankedLit[0].surfaceMatchScore > rankedLit[1].surfaceMatchScore);
});

// 4. buildRouteGpxString with malformed coords (no NaN) + XML entity escaping
test('[Tier 5 | Adv 04] buildRouteGpxString filters malformed coords (no NaN) and escapes XML entities', async () => {
  const { buildRouteGpxString } = await import('../../src/gpsEngine.js');

  const gpx = buildRouteGpxString({
    title: `Oak & "Pine" <Trail> '5K'`,
    path: [
      null,
      { lat: NaN, lng: -81.7 },
      { lat: '', lng: '' },
      { lat: 41.3857, lng: -81.7058, ele: 225.4 },
      { lat: 'bad', lng: -81.7 },
      { lat: 41.3867, lng: -81.7048, ele: null }
    ]
  });

  assert.ok(!gpx.includes('NaN'));
  assert.ok(gpx.includes('Oak &amp; &quot;Pine&quot; &lt;Trail&gt; &apos;5K&apos;'));
  assert.ok(gpx.includes('<trkpt lat="41.385700" lon="-81.705800"><ele>225.4</ele></trkpt>'));
  assert.ok(gpx.includes('<trkpt lat="41.386700" lon="-81.704800"><ele>210.0</ele></trkpt>'));
});

// 5. fetchRouteElevationProfile with null path entries and null Open-Meteo elevation values
test('[Tier 5 | Adv 05] fetchRouteElevationProfile filters null path entries and interpolates null Open-Meteo elevations', async () => {
  const { fetchRouteElevationProfile } = await import('../../src/gpsEngine.js');

  let fetchedUrl = '';
  const mockFetch = async (url) => {
    fetchedUrl = url;
    return {
      ok: true,
      json: async () => ({ elevation: [100, null, 120] })
    };
  };

  const pathWithNulls = [
    null,
    { lat: 41.3857, lng: -81.7058 },
    { lat: NaN, lng: -81.7 },
    { lat: 41.3867, lng: -81.7048 },
    { lat: 41.3877, lng: -81.7038 }
  ];

  const profile = await fetchRouteElevationProfile(pathWithNulls, { fetchImpl: mockFetch });
  assert.ok(!fetchedUrl.includes('NaN'));
  assert.deepEqual(profile.elevationsMeters, [100, 110, 120]);
  assert.equal(profile.minMeters, 100);
  assert.equal(profile.maxMeters, 120);
});

// 6. fetchOsmSafetyAndSurfaceMetrics rejecting null/empty coords without fetching (0,0)
test('[Tier 5 | Adv 06] fetchOsmSafetyAndSurfaceMetrics rejects null or empty coords without calling fetch', async () => {
  const { fetchOsmSafetyAndSurfaceMetrics } = await import('../../src/gpsEngine.js');

  let fetchCalled = false;
  const mockFetch = async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({ elements: [] }) };
  };

  const resNull = await fetchOsmSafetyAndSurfaceMetrics(null, -81.7, 1200, { fetchImpl: mockFetch });
  const resEmpty = await fetchOsmSafetyAndSurfaceMetrics('', '', 1200, { fetchImpl: mockFetch });

  assert.equal(fetchCalled, false);
  assert.equal(resNull.source, 'fallback');
  assert.equal(resEmpty.source, 'fallback');
});

// 7. fetchRouteWeather rejecting NaN coords without fetching
test('[Tier 5 | Adv 07] fetchRouteWeather rejects NaN and Infinity coords without calling fetch', async () => {
  setupMockBrowserEnv();
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({}) };
  };

  const { fetchRouteWeather } = await import('../../src/weather.js');
  const w1 = await fetchRouteWeather(NaN, -81.7);
  const w2 = await fetchRouteWeather(41.38, Infinity);

  assert.equal(fetchCalled, false);
  assert.equal(w1.provider, 'Pace Plot Weather');
  assert.equal(w2.provider, 'Pace Plot Weather');
});

// 8. units.js formatters guarding Infinity, undefined, and already-metric '+42 m'
test('[Tier 5 | Adv 08] units.js formatters guard Infinity, undefined, and avoid double-converting "+42 m"', async () => {
  const {
    formatPaceValue,
    formatTemperature,
    formatWindSpeed,
    formatElevation
  } = await import('../../src/units.js');

  const paceInf = formatPaceValue(Infinity, 'imperial', true);
  assert.ok(!paceInf.includes('Infinity') && !paceInf.includes('NaN'));
  assert.equal(paceInf, `8'30"/mi`);

  const paceNeg = formatPaceValue(-100, 'metric', true);
  assert.equal(paceNeg, `5'17"/km`);

  const tempUndef = formatTemperature(undefined, 'metric');
  assert.ok(!tempUndef.includes('NaN'));
  assert.equal(tempUndef, '--°C');

  const windEmpty = formatWindSpeed('', 'imperial');
  assert.ok(!windEmpty.includes('NaN'));
  assert.equal(windEmpty, '-- mph');

  // Already-metric string '+42 m' must not be double-converted when unitSystem === 'metric'
  assert.equal(formatElevation('+42 m', 'metric'), '+42 m');
});

// 9. updateNavStep with empty maneuvers: [] and Metric unit formatting
test('[Tier 5 | Adv 09] updateNavStep handles empty maneuvers [] safely and formats Metric distances', async () => {
  const env = setupMockBrowserEnv({ initialLocalStorage: { paceplot_unit_system: 'metric' } });
  const { store } = await import('../../src/state/store.js');
  const { updateNavStep } = await import('../../src/mapController.js');

  store.activeRoute = {
    title: 'Test Loop',
    distance: 3.1,
    maneuvers: []
  };
  // Must not throw TypeError on empty maneuvers
  assert.doesNotThrow(() => updateNavStep(0, false, false));

  // With a valid maneuver in metric mode, HUD distance must be formatted in meters/km
  store.activeRoute.maneuvers = [
    { text: 'Turn right onto Oak St', dist: 'In 500 ft', icon: 'fa-arrow-turn-up-right', note: 'Safe' }
  ];
  updateNavStep(0, false, false);
  const hudDist = env.document.getElementById('navDistanceToTurn')?.textContent || '';
  assert.ok(hudDist.includes('m') && !hudDist.includes('ft'), `Expected metric distance, got: ${hudDist}`);
});

// 10. initLeafletFallback re-initialization without stale leafletRunnerMarker leak
test('[Tier 5 | Adv 10] initLeafletFallback resets stale leafletRunnerMarker on re-initialization', async () => {
  const env = setupMockBrowserEnv();
  const mapEl = env.document.getElementById('map') || env.document.createElement('div');
  const { initLeafletFallback, updateRunnerMapMarker } = await import('../../src/mapController.js');
  const { store } = await import('../../src/state/store.js');

  store.googleMap = null;
  const map1 = await initLeafletFallback(mapEl);
  assert.ok(map1);
  updateRunnerMapMarker({ lat: 41.3857, lng: -81.7058 });
  const marker1Count = map1._layers.length;
  assert.ok(marker1Count >= 1);

  // Re-initialize Leaflet on a fresh map instance
  const map2 = await initLeafletFallback(mapEl);
  assert.ok(map2);
  assert.notEqual(map1, map2);
  updateRunnerMapMarker({ lat: 41.3860, lng: -81.7060 });

  // Marker must be added to map2, not leaked/stuck on map1
  const map2HasMarker = map2._layers.some((l) => l._type === 'marker');
  assert.ok(map2HasMarker);
});

// 11. Stale OSRM response not overwriting newer generateMultipleLoopChoices
test('[Tier 5 | Adv 11] Stale OSRM response does not overwrite newer generateMultipleLoopChoices', async () => {
  setupMockBrowserEnv();
  const { store } = await import('../../src/state/store.js');
  const { generateMultipleLoopChoices } = await import('../../src/mapController.js');

  let resolveFirstOsrm = null;
  let callNum = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes('router.project-osrm.org')) {
      callNum++;
      if (callNum <= 3) {
        return await new Promise((resolve) => {
          resolveFirstOsrm = resolve;
        });
      }
      return {
        ok: true,
        json: async () => ({
          routes: [
            {
              distance: 5000,
              geometry: {
                coordinates: [
                  [-81.8, 41.5],
                  [-81.805, 41.505],
                  [-81.8, 41.51],
                  [-81.8, 41.5]
                ]
              },
              legs: [{ steps: [{ distance: 100, name: 'New St', maneuver: { type: 'depart', modifier: 'straight', location: [-81.8, 41.5] } }] }]
            }
          ]
        })
      };
    }
    return { ok: false, json: async () => ({}) };
  };

  const firstChoices = generateMultipleLoopChoices(41.3857, -81.7058, 'Old Location', 3.1);
  const oldFirstPath = firstChoices[0].path;

  const secondChoices = generateMultipleLoopChoices(41.5, -81.8, 'New Location', 3.1);
  assert.equal(store.currentRouteChoices, secondChoices);

  // Now resolve the stale first OSRM request
  if (resolveFirstOsrm) {
    resolveFirstOsrm({
      ok: true,
      json: async () => ({
        routes: [
          {
            distance: 9999,
            geometry: {
              coordinates: [
                [-81.7058, 41.3857],
                [-81.71, 41.39],
                [-81.7058, 41.395],
                [-81.7058, 41.3857]
              ]
            },
            legs: []
          }
        ]
      })
    });
  }
  await new Promise((r) => setTimeout(r, 30));

  // Stale response must NOT mutate firstChoices[0].path or overwrite store.currentRouteChoices
  assert.equal(store.currentRouteChoices, secondChoices);
  assert.equal(firstChoices[0].path, oldFirstPath);
});

// 12. Geocoder Enter submit suppressing stale debounced search dropdown
test('[Tier 5 | Adv 12] Geocoder Enter submit suppresses stale debounced search dropdown', async () => {
  const env = setupMockBrowserEnv();
  const { setupLocationSearch } = await import('../../src/geocoder.js');

  let resolveDelayedSearch = null;
  let fetchCount = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes('nominatim.openstreetmap.org/search')) {
      fetchCount++;
      if (fetchCount === 1) {
        // Delayed debounced search
        return await new Promise((resolve) => {
          resolveDelayedSearch = resolve;
        });
      }
      return {
        ok: true,
        json: async () => [{ lat: '41.39', lon: '-81.71', display_name: 'Submitted Park, Parma, OH' }]
      };
    }
    return { ok: false, json: async () => ({}) };
  };

  let selected = null;
  setupLocationSearch({ onSelectLocation: (loc) => { selected = loc; } });

  const input = env.document.getElementById('inputLocationSearch');
  const list = env.document.getElementById('searchSuggestionsList');

  // Simulate typing -> triggers debounced performSearch after 280ms
  input.value = 'Parma';
  input.dispatchEvent({ type: 'input', target: input });
  await new Promise((r) => setTimeout(r, 310));

  // Now press Enter -> submitAddressSearchNow increments latestSearchId
  input.value = 'Submitted Park';
  input.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault() {} });
  await new Promise((r) => setTimeout(r, 30));

  assert.ok(selected);
  assert.ok(list.classList.contains('hidden'));

  // Resolve the earlier delayed debounced search
  if (resolveDelayedSearch) {
    resolveDelayedSearch({
      ok: true,
      json: async () => [{ lat: '41.38', lon: '-81.70', display_name: 'Stale Suggestion' }]
    });
  }
  await new Promise((r) => setTimeout(r, 30));

  // Dropdown must remain hidden!
  assert.ok(list.classList.contains('hidden'));
});

// 13. Spotify OAuth CSRF: empty returnedState rejected when expectedState is set
test('[Tier 5 | Adv 13] handleSpotifyOAuthCallbackCode rejects empty returnedState when expectedState is set', async () => {
  setupMockBrowserEnv({ initialLocalStorage: { paceplot_spotify_ActiveState: 'secret_csrf_123' } });
  const { handleSpotifyOAuthCallbackCode } = await import('../../src/spotify.js');

  const okEmpty = await handleSpotifyOAuthCallbackCode('auth_code_xyz', '');
  const okMissing = await handleSpotifyOAuthCallbackCode('auth_code_xyz');

  assert.equal(okEmpty, false);
  assert.equal(okMissing, false);
});

// 14. Spotify postMessage ignoring lookalike https://localhost.attacker.com
test('[Tier 5 | Adv 14] initSpotifyController ignores postMessage from lookalike https://localhost.attacker.com', async () => {
  const env = setupMockBrowserEnv({ initialLocalStorage: { paceplot_spotify_ActiveState: 's1' } });
  let callbackInvoked = false;
  let spotifyTokenFetchCalled = false;
  globalThis.fetch = async (url) => {
    if (String(url).includes('spotify.com') || String(url).includes('/api/spotify')) {
      spotifyTokenFetchCalled = true;
    }
    return { ok: false, json: async () => ({}) };
  };

  const { initSpotifyController } = await import('../../src/spotify.js');
  initSpotifyController(() => {
    callbackInvoked = true;
  });

  // Dispatch malicious postMessage from lookalike origin
  env.window.dispatchEvent({
    type: 'message',
    origin: 'https://localhost.attacker.com',
    data: { type: 'OAUTH_AUTH_SUCCESS', provider: 'spotify', code: 'evil_code', state: 's1' }
  });
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(callbackInvoked, false);
  assert.equal(spotifyTokenFetchCalled, false);
});

// 15. Spotify UI XSS escaping in renderSpotifyModalLists (bpmRange, bpm)
test('[Tier 5 | Adv 15] renderSpotifyModalLists escapes XSS payloads in pl.bpmRange and tr.bpm', async () => {
  const env = setupMockBrowserEnv();
  const ensureEl = (id) => {
    let el = env.document.getElementById(id);
    if (!el) {
      el = env.document.createElement('div');
      el.id = id;
      env.document.body.appendChild(el);
    }
    return el;
  };
  const playlistsEl = ensureEl('spotifyPlaylistsContainer');
  const tracksEl = ensureEl('spotifyTracksContainer');
  ensureEl('spotifyPlaylistCountBadge');

  const { renderSpotifyModalLists } = await import('../../src/spotifyUI.js');

  renderSpotifyModalLists({
    activePlaylistIndex: 0,
    activeTrackIndex: 0,
    isPlaying: false,
    playlists: [
      {
        name: 'Safe Mix',
        bpmRange: `<img src=x onerror="alert(1)">`,
        description: 'Tempo',
        tracks: [
          {
            title: 'Track 1',
            artist: 'Artist 1',
            bpm: `<script>xss()</script>`,
            durationMs: 180000
          }
        ]
      }
    ]
  });

  const plHtml = playlistsEl.innerHTML;
  const trHtml = tracksEl.innerHTML;

  assert.ok(!plHtml.includes('<img src=x'));
  assert.ok(plHtml.includes('&lt;img src=x'));
  assert.ok(!trHtml.includes('<script>xss()</script>'));
  assert.ok(trHtml.includes('&lt;script&gt;xss()&lt;/script&gt;'));
});

// 16. Offline queue partial failure retention (Run A succeeds, Run B retained)
test('[Tier 5 | Adv 16] flushOfflineWorkoutQueue retains Run B when Run A succeeds and Run B fails', async () => {
  setupMockBrowserEnv();
  const storage = createMemoryStorage();
  const mockCaches = createMockCacheStorage();
  const { enqueueOfflineWorkout, flushOfflineWorkoutQueue, getOfflineWorkoutQueue } = await import('../../src/firebase.js');

  await enqueueOfflineWorkout({ routeTitle: 'Run A', distance: 3.1, completedAt: '2026-11-15T08:00:00Z' }, storage, mockCaches);
  await enqueueOfflineWorkout({ routeTitle: 'Run B', distance: 5.0, completedAt: '2026-11-15T09:00:00Z' }, storage, mockCaches);

  const res = await flushOfflineWorkoutQueue({
    storage,
    cacheStorage: mockCaches,
    isOnline: true,
    user: { uid: 'u1' },
    uploadFn: async (item) => {
      if (item.routeTitle === 'Run B') throw new Error('Network drop');
      return 'doc_A';
    }
  });

  assert.equal(res.flushedCount, 1);
  assert.equal(res.remainingCount, 1);
  const remaining = getOfflineWorkoutQueue(storage);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].routeTitle, 'Run B');
});

// 17. Offline queue QuotaExceededError graceful fallback to CacheStorage
test('[Tier 5 | Adv 17] enqueueOfflineWorkout falls back to CacheStorage when localStorage throws QuotaExceededError', async () => {
  setupMockBrowserEnv();
  const quotaStorage = {
    getItem: () => '[]',
    setItem: () => {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    }
  };
  const mockCaches = createMockCacheStorage();
  const { enqueueOfflineWorkout } = await import('../../src/firebase.js');

  const queue = await enqueueOfflineWorkout(
    { routeTitle: 'Quota Run', distance: 4.0, completedAt: '2026-11-15T10:00:00Z' },
    quotaStorage,
    mockCaches
  );

  assert.ok(Array.isArray(queue));
  assert.equal(queue.length, 1);
  const cache = await mockCaches.open('paceplot-v1.2.0');
  const cachedResp = await cache.match('/__offline_workout_queue');
  assert.ok(cachedResp);
  const parsed = await cachedResp.json();
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].routeTitle, 'Quota Run');
});

// 18. SafeGuard corrupt non-array JSON in paceplot_local_contacts_v1 recovery
test('[Tier 5 | Adv 18] setupSafeGuardHandlers recovers from corrupt non-array JSON in paceplot_local_contacts_v1', async () => {
  const env = setupMockBrowserEnv({ initialLocalStorage: { paceplot_local_contacts_v1: '{"corrupt":true}' } });
  const ensureEl = (id, tag = 'div') => {
    let el = env.document.getElementById(id);
    if (!el) {
      el = env.document.createElement(tag);
      el.id = id;
      env.document.body.appendChild(el);
    }
    return el;
  };
  ensureEl('emergencyContactsList');
  const btnSave = ensureEl('btnSaveNewContact', 'button');
  const nameInput = ensureEl('newContactName', 'input');
  const phoneInput = ensureEl('newContactPhone', 'input');

  const { store } = await import('../../src/state/store.js');
  const { setupSafeGuardHandlers } = await import('../../src/safeGuard.js');

  store.currentUser = null;
  setupSafeGuardHandlers();

  assert.equal(env.localStorage.getItem('paceplot_local_contacts_v1'), '[]');

  // Adding a contact should succeed without throwing TypeError: savedLocal.push is not a function
  nameInput.value = 'Jane Doe';
  phoneInput.value = '555-0199';
  assert.doesNotThrow(() => {
    btnSave.click();
  });
  const saved = JSON.parse(env.localStorage.getItem('paceplot_local_contacts_v1'));
  assert.ok(Array.isArray(saved) && saved.length === 1 && saved[0].name === 'Jane Doe');
});

// 19. badges.js ignoring missing/invalid completedAt (never using system clock)
test('[Tier 5 | Adv 19] evaluateBadgesFromWorkouts skips time-of-day badges when completedAt is missing or invalid', async () => {
  setupMockBrowserEnv({ initialLocalStorage: { paceplot_unlocked_badges: '[]' } });
  const { evaluateBadgesFromWorkouts, getUnlockedBadges } = await import('../../src/badges.js');

  evaluateBadgesFromWorkouts([
    { routeTitle: 'No Date', distance: 2.0 },
    { routeTitle: 'Bad Date', distance: 2.0, completedAt: 'not-a-real-date' }
  ]);

  const unlocked = getUnlockedBadges();
  assert.ok(!unlocked.includes('early_bird'));
  assert.ok(!unlocked.includes('night_owl'));
});

// 20. premium.js locking corrupted NaN trialExpiresAt as TRIAL_EXPIRED
test('[Tier 5 | Adv 20] getSubscriptionState locks corrupted NaN trialExpiresAt as TRIAL_EXPIRED with hasAccess false', async () => {
  const storage = createMemoryStorage({
    paceplot_subscription_status: 'trial_active',
    paceplot_trial_started_at: 'invalid',
    paceplot_trial_expires_at: 'not-a-timestamp'
  });
  const { getSubscriptionState, SUBSCRIPTION_STATUS } = await import('../../src/premium.js');

  const state = getSubscriptionState(Date.now(), storage);
  assert.equal(state.status, SUBSCRIPTION_STATUS.TRIAL_EXPIRED);
  assert.equal(state.hasAccess, false);
  assert.equal(state.isExpired, true);
  assert.equal(state.trialExpiresAt, null);
});

// 21. trainingPlan.js generate4WeekPlan clamping extreme/negative basePaceSeconds
test('[Tier 5 | Adv 21] generate4WeekPlan clamps/falls back for negative, zero, and NaN basePaceSeconds', async () => {
  const { generate4WeekPlan } = await import('../../src/trainingPlan.js');

  const negPlan = generate4WeekPlan('5k', -300);
  const nanPlan = generate4WeekPlan('marathon', NaN);
  const zeroPlan = generate4WeekPlan('10k', 0);

  assert.equal(negPlan.paces.marathonPace, 540);
  assert.equal(nanPlan.paces.marathonPace, 540);
  assert.equal(zeroPlan.paces.marathonPace, 540);
  assert.equal(negPlan.weeks.length, 4);
});

// 22. vite.config.js + public/sw.js precache parity (no deleted screenshot-*.png in PRECACHE_ASSETS)
test('[Tier 5 | Adv 22] public/sw.js and vite.config.js maintain precache parity with no deleted screenshot-*.png', () => {
  const swSource = readProjectFile('public/sw.js');
  const precacheMatch = swSource.match(/const PRECACHE_ASSETS = \[([\s\S]*?)\];/);
  assert.ok(precacheMatch, 'PRECACHE_ASSETS array should exist in public/sw.js');
  const precacheBlock = precacheMatch[1];

  assert.ok(!precacheBlock.includes('screenshot-narrow.png'));
  assert.ok(!precacheBlock.includes('screenshot-wide.png'));
  assert.ok(!precacheBlock.includes('screenshot-health.png'));

  // Also verify www/sw.js if www/ exists from build
  const wwwSwPath = path.resolve(PROJECT_ROOT, 'www/sw.js');
  if (fs.existsSync(wwwSwPath)) {
    const wwwSw = fs.readFileSync(wwwSwPath, 'utf-8');
    const wwwMatch = wwwSw.match(/const PRECACHE_ASSETS = \[([\s\S]*?)\];/);
    assert.ok(wwwMatch);
    assert.ok(!wwwMatch[1].includes('screenshot-narrow.png'));
    assert.ok(!wwwMatch[1].includes('screenshot-wide.png'));
    assert.ok(!wwwMatch[1].includes('screenshot-health.png'));
  }
});
