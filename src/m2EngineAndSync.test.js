import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  fetchStreetSnappedLoopFromOsrm,
  fetchOsmSafetyAndSurfaceMetrics,
  filterAndRankRoutesBySurface,
  fetchRouteElevationProfile,
  buildRouteGpxString,
  pointToSegmentDistanceMeters,
  distanceToPolylineMeters,
  evaluateOffRouteDeviation
} from './gpsEngine.js';

import {
  OFFLINE_WORKOUT_QUEUE_KEY,
  enqueueOfflineWorkout,
  getOfflineWorkoutQueue,
  flushOfflineWorkoutQueue
} from './firebase.js';

import {
  SUBSCRIPTION_STATUS,
  hydrateSubscriptionFromCloud,
  getSubscriptionState
} from './premium.js';

import {
  generate4WeekPlan,
  saveActivePlan
} from './trainingPlan.js';

import {
  buildSpotifyAuthorizeUrl,
  exchangeSpotifyPkceTokenDirect,
  refreshSpotifyTokenDirect
} from './spotify.js';

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
}

function createMemoryCacheStorage() {
  const cachesMap = new Map();
  return {
    async open(name) {
      if (!cachesMap.has(name)) {
        cachesMap.set(name, new Map());
      }
      const bucket = cachesMap.get(name);
      return {
        async put(key, response) {
          bucket.set(key, response);
        },
        async match(key) {
          return bucket.get(key) || null;
        },
        async delete(key) {
          return bucket.delete(key);
        }
      };
    }
  };
}

const SAMPLE_WAYPOINTS = [
  { lat: 30.2672, lng: -97.7431 },
  { lat: 30.2712, lng: -97.7431 },
  { lat: 30.2752, lng: -97.7391 },
  { lat: 30.2752, lng: -97.7341 },
  { lat: 30.2712, lng: -97.7311 },
  { lat: 30.2672, lng: -97.7341 },
  { lat: 30.2652, lng: -97.7391 },
  { lat: 30.2672, lng: -97.7431 }
];

// F4: OSRM Distance Calibration
test('F4: fetchStreetSnappedLoopFromOsrm calibrates anchor offsets when snapped distance deviates >10% from targetDistanceMiles', async () => {
  let callCount = 0;
  const requestedUrls = [];

  const mockFetch = async (url) => {
    callCount++;
    requestedUrls.push(url);
    // First call returns 4.50 mi (45% over 3.10 mi target); second call returns 3.12 mi (within 10%)
    const meters = callCount === 1 ? 4.5 * 1609.344 : 3.12 * 1609.344;
    return {
      ok: true,
      async json() {
        return {
          routes: [
            {
              distance: meters,
              geometry: {
                coordinates: [
                  [-97.7431, 30.2672],
                  [-97.741, 30.271],
                  [-97.736, 30.271],
                  [-97.7431, 30.2672]
                ]
              },
              legs: [
                {
                  steps: [
                    { distance: 800, name: 'Congress Ave', maneuver: { type: 'depart', modifier: 'straight', location: [-97.7431, 30.2672] } },
                    { distance: 900, name: 'Lady Bird Trail', maneuver: { type: 'turn', modifier: 'right', location: [-97.741, 30.271] } }
                  ]
                }
              ]
            }
          ]
        };
      }
    };
  };

  const result = await fetchStreetSnappedLoopFromOsrm(SAMPLE_WAYPOINTS, 'Greenway Loop', {
    targetDistanceMiles: 3.1,
    fetchImpl: mockFetch
  });

  assert.ok(result);
  assert.equal(callCount, 2);
  assert.equal(result.distanceMiles, 3.12);
  assert.ok(Array.isArray(result.path) && result.path.length >= 4);
  assert.ok(Array.isArray(result.maneuvers) && result.maneuvers.length >= 2);
  assert.notEqual(requestedUrls[0], requestedUrls[1]);
});

// F5: Street-Snap Waypoint Loops via OSRM
test('F5: fetchStreetSnappedLoopFromOsrm preserves pinned waypoint via options.preserveWaypoint and 9-point index 3', async () => {
  const capturedUrls = [];
  const mockFetch = async (url) => {
    capturedUrls.push(url);
    return {
      ok: true,
      async json() {
        return {
          routes: [
            {
              distance: 3.1 * 1609.344,
              geometry: {
                coordinates: [
                  [-97.7431, 30.2672],
                  [-97.7385, 30.2745],
                  [-97.733, 30.269],
                  [-97.7431, 30.2672]
                ]
              },
              legs: []
            }
          ]
        };
      }
    };
  };

  const pinned = { lat: 30.2799, lng: -97.7388 };
  const res1 = await fetchStreetSnappedLoopFromOsrm(SAMPLE_WAYPOINTS, 'Waypoint Loop', {
    preserveWaypoint: pinned,
    fetchImpl: mockFetch
  });
  assert.ok(res1);
  assert.ok(capturedUrls[0].includes('-97.738800,30.279900'), 'Explicit preserveWaypoint must be in OSRM anchor URL');

  const nineWaypoints = [
    ...SAMPLE_WAYPOINTS.slice(0, 3),
    { lat: 30.2812, lng: -97.7377 },
    ...SAMPLE_WAYPOINTS.slice(3)
  ];
  assert.equal(nineWaypoints.length, 9);

  const res2 = await fetchStreetSnappedLoopFromOsrm(nineWaypoints, 'Waypoint Loop', {
    fetchImpl: mockFetch
  });
  assert.ok(res2);
  assert.ok(capturedUrls[1].includes('-97.737700,30.281200'), 'Index 3 waypoint in 9-point loop must be in OSRM anchor URL');
});

// F6: OSM Overpass Safety Scoring & Surface Filtering
test('F6: fetchOsmSafetyAndSurfaceMetrics computes Overpass metrics and falls back deterministically offline', async () => {
  const mockOverpassFetch = async () => ({
    ok: true,
    async json() {
      return {
        elements: [
          { tags: { highway: 'footway', lit: 'yes', surface: 'gravel' } },
          { tags: { highway: 'residential', sidewalk: 'both', lit: 'yes' } },
          { tags: { highway: 'cycleway', lit: 'no' } },
          { tags: { highway: 'living_street', sidewalk: 'left', lit: 'yes' } }
        ]
      };
    }
  });

  const liveMetrics = await fetchOsmSafetyAndSurfaceMetrics(30.2672, -97.7431, 1200, {
    fetchImpl: mockOverpassFetch
  });
  assert.equal(liveMetrics.source, 'overpass');
  assert.equal(liveMetrics.sidewalkPct, 100);
  assert.equal(liveMetrics.litPct, 75);
  assert.equal(liveMetrics.trailRatio, 0.5);
  assert.equal(liveMetrics.quietRoadRatio, 0.5);
  assert.ok(liveMetrics.safetyScore >= 8.5 && liveMetrics.safetyScore <= 10.0);

  const offlineMetrics = await fetchOsmSafetyAndSurfaceMetrics(30.2672, -97.7431, 1200, {
    fetchImpl: async () => {
      throw new Error('Network offline');
    }
  });
  assert.equal(offlineMetrics.source, 'fallback');
  assert.equal(offlineMetrics.sidewalkPct, 92);
  assert.equal(offlineMetrics.litPct, 88);
  assert.equal(offlineMetrics.safetyScore, 9.4);
});

test('F6: filterAndRankRoutesBySurface ranks choices for trail, road, and lit without mutating input', () => {
  const originalChoices = [
    { id: 'c_road', title: 'Quiet Neighborhood Street Loop', surfaceType: 'road', sidewalkPct: 96, litPct: 70, safetyScore: 9.0 },
    { id: 'c_trail', title: 'Greenway Creek Park Trail', surfaceType: 'trail', sidewalkPct: 88, litPct: 60, safetyScore: 9.2 },
    { id: 'c_lit', title: 'Night Illuminated Boulevard', surfaceType: 'lit', sidewalkPct: 94, litPct: 99, safetyScore: 9.6 }
  ];
  const snapshotBefore = JSON.stringify(originalChoices);

  const trailRanked = filterAndRankRoutesBySurface(originalChoices, 'trail', { trailRatio: 0.6, quietRoadRatio: 0.3, safetyScore: 9.4 });
  assert.equal(trailRanked[0].id, 'c_trail');
  assert.equal(trailRanked[0].surfaceFilter, 'trail');

  const roadRanked = filterAndRankRoutesBySurface(originalChoices, 'road', { trailRatio: 0.2, quietRoadRatio: 0.7, safetyScore: 9.1 });
  assert.equal(roadRanked[0].id, 'c_road');
  assert.equal(roadRanked[0].surfaceFilter, 'road');

  const litRanked = filterAndRankRoutesBySurface(originalChoices, 'lit');
  assert.equal(litRanked[0].id, 'c_lit');
  assert.equal(litRanked[0].surfaceFilter, 'lit');

  assert.equal(JSON.stringify(originalChoices), snapshotBefore, 'Input choices must not be mutated');
});

// F7: Open-Meteo Elevation Profile & GPX <ele> Tags
test('F7: fetchRouteElevationProfile queries Open-Meteo, interpolates >50 pts, sets pt.ele, and buildRouteGpxString embeds <ele>', async () => {
  const longPath = Array.from({ length: 65 }, (_, i) => ({
    lat: 30.2672 + i * 0.0002,
    lng: -97.7431 + i * 0.0002
  }));

  const mockElevFetch = async (url) => {
    assert.ok(url.startsWith('https://api.open-meteo.com/v1/elevation?'));
    const latParam = new URL(url).searchParams.get('latitude').split(',');
    assert.equal(latParam.length, 50, 'Should sample down to 50 points for Open-Meteo');
    return {
      ok: true,
      async json() {
        return {
          elevation: latParam.map((_, idx) => 150 + idx * 0.5)
        };
      }
    };
  };

  const profile = await fetchRouteElevationProfile(longPath, { fetchImpl: mockElevFetch });
  assert.equal(profile.elevationsMeters.length, 65);
  assert.ok(Math.abs(longPath[0].ele - 150) < 0.2);
  assert.ok(Math.abs(longPath[64].ele - 174.5) < 0.2);
  assert.ok(profile.gainMeters > 20);
  assert.ok(profile.gainFeet > 65);
  assert.equal(profile.svgPoints.length, 65);
  assert.ok(profile.svgStrokePath.startsWith('M '));
  assert.ok(profile.svgFillPath.endsWith('Z'));

  const gpx = buildRouteGpxString({ title: 'Austin & Creek <Loop>', path: longPath.slice(0, 3) });
  assert.ok(gpx.includes('<gpx version="1.1"'));
  assert.ok(gpx.includes('Austin &amp; Creek &lt;Loop&gt;'));
  assert.ok(gpx.includes(`<ele>${longPath[0].ele.toFixed(1)}</ele>`));
  assert.ok(!gpx.includes('<ele>210.0</ele>'), 'Should use real Open-Meteo elevation rather than hardcoded 210.0');

  // Offline fallback
  const fallbackPath = [{ lat: 30.26, lng: -97.74 }, { lat: 30.27, lng: -97.73 }];
  const fallbackProfile = await fetchRouteElevationProfile(fallbackPath, {
    fetchImpl: async () => {
      throw new Error('Offline');
    }
  });
  assert.equal(fallbackProfile.elevationsMeters.length, 2);
  assert.ok(Number.isFinite(fallbackPath[0].ele));
});

// F8: Off-Route Detection (>50m)
test('F8: pointToSegmentDistanceMeters, distanceToPolylineMeters, and evaluateOffRouteDeviation detect >50m off-route', () => {
  const path = [
    { lat: 30.2672, lng: -97.7431 },
    { lat: 30.2772, lng: -97.7431 } // ~1.11km due north
  ];

  // On-route midpoint (~0m deviation)
  const onRoutePt = { lat: 30.2722, lng: -97.7431 };
  const seg = pointToSegmentDistanceMeters(onRoutePt, path[0], path[1]);
  assert.ok(seg.distanceMeters < 1);
  assert.ok(Math.abs(seg.t - 0.5) < 0.01);

  const onRouteEval = evaluateOffRouteDeviation(onRoutePt, path, 50);
  assert.equal(onRouteEval.isOffRoute, false);
  assert.ok(onRouteEval.deviationMeters < 1);

  // ~96m east of the route (~0.001 deg lng at lat 30.27)
  const offRoutePt = { lat: 30.2722, lng: -97.7421 };
  const polyDist = distanceToPolylineMeters(offRoutePt, path);
  assert.equal(polyDist.closestSegmentIndex, 0);
  assert.ok(polyDist.minDistanceMeters > 80 && polyDist.minDistanceMeters < 120);

  const offRouteEval = evaluateOffRouteDeviation(offRoutePt, path, 50);
  assert.equal(offRouteEval.isOffRoute, true);
  assert.ok(offRouteEval.deviationMeters > 50);
});

// F11 & F12: Offline Workout Queue, completedAt preservation & SW sync
test('F11 & F12: enqueueOfflineWorkout preserves completedAt, flushes when online & signed in, and sw.js delivers queuedWorkouts', async () => {
  const storage = createMemoryStorage();
  const cacheStorage = createMemoryCacheStorage();
  const originalCompletedAt = '2026-11-10T06:15:00.000Z';

  await enqueueOfflineWorkout(
    {
      routeTitle: 'Dawn 5K',
      distance: 3.1,
      durationSeconds: 1560,
      completedAt: originalCompletedAt
    },
    storage,
    cacheStorage
  );

  const queued = getOfflineWorkoutQueue(storage);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].completedAt, originalCompletedAt);
  assert.ok(storage.getItem(OFFLINE_WORKOUT_QUEUE_KEY));

  // Verify CacheStorage mirror
  const cache = await cacheStorage.open('paceplot-v1.2.0');
  const cachedRes = await cache.match('/__offline_workout_queue');
  assert.ok(cachedRes);
  const cachedJson = await cachedRes.json();
  assert.equal(cachedJson.length, 1);

  // Should NOT flush when offline or signed out
  const offlineRes = await flushOfflineWorkoutQueue({
    storage,
    cacheStorage,
    isOnline: false,
    currentUser: { uid: 'u1' },
    addRunActivityImpl: async () => 'doc_1'
  });
  assert.equal(offlineRes.flushedCount, 0);
  assert.equal(offlineRes.remainingCount, 1);

  const signedOutRes = await flushOfflineWorkoutQueue({
    storage,
    cacheStorage,
    isOnline: true,
    currentUser: null,
    addRunActivityImpl: async () => 'doc_1'
  });
  assert.equal(signedOutRes.flushedCount, 0);
  assert.equal(signedOutRes.remainingCount, 1);

  // Should flush when online & signed in, preserving completedAt
  const uploaded = [];
  const onlineRes = await flushOfflineWorkoutQueue({
    storage,
    cacheStorage,
    isOnline: true,
    currentUser: { uid: 'u1' },
    addRunActivityImpl: async (item) => {
      uploaded.push(item);
      return 'doc_1';
    }
  });
  assert.equal(onlineRes.flushedCount, 1);
  assert.equal(onlineRes.remainingCount, 0);
  assert.equal(uploaded[0].completedAt, originalCompletedAt);
  assert.equal(getOfflineWorkoutQueue(storage).length, 0);
  assert.equal(await cache.match('/__offline_workout_queue'), null);

  // Verify sw.js reads queuedWorkouts and only deletes when clientsList.length > 0
  const swSource = fs.readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf-8');
  assert.ok(swSource.includes('queuedWorkouts'));
  assert.ok(swSource.includes('PACEPLOT_BACKGROUND_SYNC_COMPLETE'));
  assert.ok(swSource.includes('clientsList.length > 0'));
});

// F13: Subscription & Training Plan Cloud Hydration + Firestore Rules
test('F13: hydrateSubscriptionFromCloud and saveActivePlan work cleanly and firestore.rules allows activeTrainingPlan & updatedAt', () => {
  const storage = createMemoryStorage();
  const futureExpiry = Date.now() + 5 * 24 * 3600 * 1000;

  const trialState = hydrateSubscriptionFromCloud(
    {
      subscriptionStatus: SUBSCRIPTION_STATUS.TRIAL_ACTIVE,
      tier: 'monthly',
      trialStartedAt: Date.now() - 86400000,
      trialExpiresAt: futureExpiry
    },
    storage
  );
  assert.equal(trialState.status, SUBSCRIPTION_STATUS.TRIAL_ACTIVE);
  assert.equal(trialState.hasAccess, true);
  assert.equal(trialState.tier, 'monthly');

  const proState = hydrateSubscriptionFromCloud(
    { subscriptionStatus: SUBSCRIPTION_STATUS.PRO_ACTIVE, tier: 'annual' },
    storage
  );
  assert.equal(proState.status, SUBSCRIPTION_STATUS.PRO_ACTIVE);
  assert.equal(proState.hasAccess, true);
  assert.equal(getSubscriptionState(Date.now(), storage).status, SUBSCRIPTION_STATUS.PRO_ACTIVE);

  const plan = generate4WeekPlan('marathon', 510);
  saveActivePlan(plan, storage);
  const storedPlan = JSON.parse(storage.getItem('paceplot_active_training_plan'));
  assert.equal(storedPlan.goalId, 'marathon');

  const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');
  assert.ok(rules.includes("'activeTrainingPlan'"));
  assert.ok(rules.includes("'updatedAt'"));
  assert.ok(rules.includes('data.trialStartedAt == null || data.trialStartedAt is number'));
  assert.ok(rules.includes('data.activeTrainingPlan == null || data.activeTrainingPlan is map'));
});

// F14: SafeGuard Beacon Firestore Rules
test('F14: firestore.rules defines isValidBeaconSession and /beacons/{sessionId} public read & owner write', () => {
  const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');
  assert.ok(rules.includes('function isValidBeaconSession(data)'));
  assert.ok(rules.includes('match /beacons/{sessionId}'));
  assert.ok(rules.includes('allow read: if isValidId(sessionId);'));
  assert.ok(rules.includes('isValidBeaconSession(request.resource.data)'));
});

// F15: Client-Side Spotify PKCE OAuth & Static Callback
test('F15: buildSpotifyAuthorizeUrl, exchangeSpotifyPkceTokenDirect, refreshSpotifyTokenDirect, and public/auth/callback/index.html', async () => {
  const authUrl = buildSpotifyAuthorizeUrl({
    clientId: 'test_client_123',
    redirectUri: 'https://paceplot.app/auth/callback',
    codeChallenge: 'challenge_abc',
    state: 'state_xyz'
  });
  assert.ok(authUrl.startsWith('https://accounts.spotify.com/authorize?'));
  const parsed = new URL(authUrl);
  assert.equal(parsed.searchParams.get('client_id'), 'test_client_123');
  assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(parsed.searchParams.get('code_challenge'), 'challenge_abc');
  assert.equal(parsed.searchParams.get('state'), 'state_xyz');

  let capturedBody = '';
  const mockTokenFetch = async (url, init) => {
    assert.equal(url, 'https://accounts.spotify.com/api/token');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
    capturedBody = init.body;
    return {
      ok: true,
      status: 200,
      async json() {
        return { access_token: 'sp_acc_1', refresh_token: 'sp_ref_1', expires_in: 3600 };
      }
    };
  };

  const exRes = await exchangeSpotifyPkceTokenDirect({
    code: 'auth_code_1',
    redirectUri: 'https://paceplot.app/auth/callback',
    codeVerifier: 'verifier_123',
    clientId: 'test_client_123',
    fetchImpl: mockTokenFetch
  });
  assert.equal(exRes.ok, true);
  assert.equal(exRes.data.access_token, 'sp_acc_1');
  assert.ok(capturedBody.includes('grant_type=authorization_code'));
  assert.ok(capturedBody.includes('code_verifier=verifier_123'));

  const refRes = await refreshSpotifyTokenDirect({
    refreshToken: 'sp_ref_1',
    clientId: 'test_client_123',
    fetchImpl: mockTokenFetch
  });
  assert.equal(refRes.ok, true);
  assert.ok(capturedBody.includes('grant_type=refresh_token'));
  assert.ok(capturedBody.includes('refresh_token=sp_ref_1'));

  const callbackPath = path.resolve(process.cwd(), 'public/auth/callback/index.html');
  assert.equal(fs.existsSync(callbackPath), true);
  const callbackHtml = fs.readFileSync(callbackPath, 'utf-8');
  assert.ok(callbackHtml.includes('OAUTH_AUTH_SUCCESS'));
  assert.ok(callbackHtml.includes('spotify_code='));
});
