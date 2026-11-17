// Real-World GPS Tracking, Haversine Telemetry, OSRM Foot Routing & BLE Heart Rate Engine

const EARTH_RADIUS_METERS = 6371000;
const METERS_PER_MILE = 1609.344;

/**
 * Compute real-world Haversine distance between two GPS coordinates in meters.
 */
export function haversineDistanceMeters(coord1, coord2) {
  if (!coord1 || !coord2) return 0;
  if (
    coord1.lat == null || coord1.lng == null || coord1.lat === '' || coord1.lng === '' ||
    coord2.lat == null || coord2.lng == null || coord2.lat === '' || coord2.lng === ''
  ) {
    return 0;
  }
  const lat1 = Number(coord1.lat);
  const lng1 = Number(coord1.lng);
  const lat2 = Number(coord2.lat);
  const lng2 = Number(coord2.lng);
  if (!Number.isFinite(lat1) || !Number.isFinite(lng1) || !Number.isFinite(lat2) || !Number.isFinite(lng2)) {
    return 0;
  }

  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const aClamped = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(aClamped), Math.sqrt(1 - aClamped));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Compute Haversine distance in miles between two GPS coordinates.
 */
export function haversineDistanceMiles(coord1, coord2) {
  return haversineDistanceMeters(coord1, coord2) / METERS_PER_MILE;
}

/**
 * Compute total path length in miles for an array of {lat, lng} points.
 */
export function computePathDistanceMiles(path) {
  if (!Array.isArray(path) || path.length < 2) return 0;
  let meters = 0;
  for (let i = 1; i < path.length; i++) {
    meters += haversineDistanceMeters(path[i - 1], path[i]);
  }
  return Number((meters / METERS_PER_MILE).toFixed(2));
}

/**
 * Compute live running pace string (e.g., "8'24\"") from distance (miles), elapsed seconds, or GPS speed (m/s).
 */
export function computeLiveGpsPace(distanceMiles, elapsedSeconds, gpsSpeedMetersPerSec = null) {
  // Prefer instantaneous smoothed GPS speed if moving at >= 0.8 m/s (~33 min/mi walking or faster)
  if (Number.isFinite(gpsSpeedMetersPerSec) && gpsSpeedMetersPerSec >= 0.8) {
    const secondsPerMile = Math.round(METERS_PER_MILE / gpsSpeedMetersPerSec);
    if (secondsPerMile >= 180 && secondsPerMile <= 1800) {
      const mins = Math.floor(secondsPerMile / 60);
      const secs = String(secondsPerMile % 60).padStart(2, '0');
      return { formatted: `${mins}'${secs}"`, secondsPerMile };
    }
  }

  if (distanceMiles >= 0.01 && elapsedSeconds >= 5) {
    const secondsPerMile = Math.round(elapsedSeconds / distanceMiles);
    if (secondsPerMile >= 180 && secondsPerMile <= 1800) {
      const mins = Math.floor(secondsPerMile / 60);
      const secs = String(secondsPerMile % 60).padStart(2, '0');
      return { formatted: `${mins}'${secs}"`, secondsPerMile };
    }
  }

  return { formatted: `--'--"`, secondsPerMile: null };
}

/**
 * Evaluate whether a new GPS fix should be recorded as real movement
 * (filters out GPS jitter < 3m or inaccurate fixes > 65m accuracy).
 */
export function evaluateGpsFixMovement(lastCoord, newCoord, accuracyMeters = 15) {
  if (!newCoord || !Number.isFinite(newCoord.lat) || !Number.isFinite(newCoord.lng)) {
    return { accepted: false, deltaMeters: 0, deltaMiles: 0 };
  }
  if (Number.isFinite(accuracyMeters) && accuracyMeters > 80) {
    return { accepted: false, deltaMeters: 0, deltaMiles: 0 };
  }
  if (!lastCoord) {
    return { accepted: true, deltaMeters: 0, deltaMiles: 0 };
  }
  const deltaMeters = haversineDistanceMeters(lastCoord, newCoord);
  // Ignore tiny stationary GPS drift under 2.5 meters, or impossible teleports > 250m in a single tick
  if (deltaMeters < 2.5 || deltaMeters > 250) {
    return { accepted: false, deltaMeters, deltaMiles: 0 };
  }
  return {
    accepted: true,
    deltaMeters,
    deltaMiles: deltaMeters / METERS_PER_MILE
  };
}

/**
 * Parse standard Web Bluetooth GATT Heart Rate Measurement (0x2A37) DataView bytes.
 */
export function parseBleHeartRateMeasurement(dataView) {
  if (!dataView || typeof dataView.getUint8 !== 'function' || dataView.byteLength < 2) {
    return null;
  }
  const flags = dataView.getUint8(0);
  const is16Bit = (flags & 0x01) !== 0;
  let bpm = 0;
  if (is16Bit) {
    if (dataView.byteLength < 3) return null;
    bpm = dataView.getUint16(1, true);
  } else {
    bpm = dataView.getUint8(1);
  }
  return bpm >= 30 && bpm <= 240 ? bpm : null;
}

/**
 * Single OSRM foot routing request for a given list of {lat, lng} anchors.
 */
async function requestOsrmRoute(anchors, originCoord, fallbackLabel, fetchImpl) {
  const coordString = anchors.map((pt) => `${Number(pt.lng).toFixed(6)},${Number(pt.lat).toFixed(6)}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/foot/${coordString}?overview=full&geometries=geojson&steps=true`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res || !res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route || !route.geometry || !Array.isArray(route.geometry.coordinates)) {
      return null;
    }

    const snappedPath = route.geometry.coordinates.map(([lng, lat]) => ({
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6))
    }));

    if (snappedPath.length < 3) return null;

    // Reject if OSRM snapped more than 500m away from the requested start address
    if (haversineDistanceMeters(originCoord, snappedPath[0]) > 500) {
      return null;
    }

    // Anchor the start and finish of the loop directly at the exact chosen address coordinate
    if (haversineDistanceMeters(originCoord, snappedPath[0]) > 3) {
      snappedPath.unshift({ ...originCoord });
    } else {
      snappedPath[0] = { ...originCoord };
    }
    if (haversineDistanceMeters(originCoord, snappedPath[snappedPath.length - 1]) > 3) {
      snappedPath.push({ ...originCoord });
    } else {
      snappedPath[snappedPath.length - 1] = { ...originCoord };
    }

    const rawMiles = Number.isFinite(Number(route.distance))
      ? Number((Number(route.distance) / METERS_PER_MILE).toFixed(2))
      : 0;
    const distanceMiles = rawMiles > 0.2 ? rawMiles : computePathDistanceMiles(snappedPath);
    const maneuvers = [];

    (route.legs || []).forEach((leg) => {
      (leg.steps || []).forEach((step) => {
        if (!step || step.distance < 25) return;
        const streetName = step.name && step.name.trim() ? step.name.trim() : 'pedestrian pathway';
        const mod = step.maneuver?.modifier || 'straight';
        const type = step.maneuver?.type || 'continue';
        const loc = step.maneuver?.location; // [lng, lat]
        const distFeet = Math.round(step.distance * 3.28084);
        const distLabel =
          distFeet >= 1056
            ? `In ${(step.distance / METERS_PER_MILE).toFixed(1)} mi`
            : `In ${Math.max(50, Math.round(distFeet / 10) * 10)} ft`;

        let icon = 'fa-arrow-up';
        let actionVerb = 'Continue';
        if (type === 'depart') {
          actionVerb = 'Head out';
        } else if (type === 'arrive') {
          actionVerb = 'Finish loop';
          icon = 'fa-flag-checkered';
        } else if (mod.includes('left')) {
          actionVerb = mod.includes('slight') ? 'Bear left' : 'Turn left';
          icon = 'fa-arrow-turn-up-left';
        } else if (mod.includes('right')) {
          actionVerb = mod.includes('slight') ? 'Bear right' : 'Turn right';
          icon = 'fa-arrow-turn-up-right';
        }

        maneuvers.push({
          text: `${actionVerb} onto ${streetName}`,
          dist: maneuvers.length === 0 ? 'Start' : distLabel,
          icon,
          note: `${fallbackLabel} · Real Street Route`,
          lat: Array.isArray(loc) ? loc[1] : undefined,
          lng: Array.isArray(loc) ? loc[0] : undefined
        });
      });
    });

    return {
      path: snappedPath,
      distanceMiles,
      maneuvers: maneuvers.slice(0, 12)
    };
  } catch (_) {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Snap a loop of waypoints to actual pedestrian streets/sidewalks via OSRM Foot Routing API,
 * calibrating anchor radius toward targetDistanceMiles and preserving pinned waypoints when specified.
 */
export async function fetchStreetSnappedLoopFromOsrm(waypoints, fallbackLabel = 'Greenway Loop', options = {}) {
  if (!Array.isArray(waypoints) || waypoints.length < 3) return null;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return null;

  const originCoord = {
    lat: Number(Number(waypoints[0].lat).toFixed(6)),
    lng: Number(Number(waypoints[0].lng).toFixed(6))
  };

  const explicitWaypoint =
    options.preserveWaypoint &&
    Number.isFinite(Number(options.preserveWaypoint.lat)) &&
    Number.isFinite(Number(options.preserveWaypoint.lng))
      ? {
          lat: Number(options.preserveWaypoint.lat),
          lng: Number(options.preserveWaypoint.lng),
          __pinned: true
        }
      : null;

  const implicitWaypoint =
    !explicitWaypoint && waypoints.length === 9 && waypoints[3]
      ? { lat: Number(waypoints[3].lat), lng: Number(waypoints[3].lng), __pinned: true }
      : null;

  const pinnedWaypoint = explicitWaypoint || implicitWaypoint;

  let baseAnchors;
  if (pinnedWaypoint) {
    baseAnchors = [
      waypoints[0],
      waypoints[Math.max(1, Math.floor(waypoints.length * 0.22))],
      pinnedWaypoint,
      waypoints[Math.floor(waypoints.length * 0.55)],
      waypoints[Math.floor(waypoints.length * 0.78)],
      waypoints[0]
    ];
  } else {
    baseAnchors = [
      waypoints[0],
      waypoints[Math.floor(waypoints.length * 0.25)],
      waypoints[Math.floor(waypoints.length * 0.5)],
      waypoints[Math.floor(waypoints.length * 0.75)],
      waypoints[0]
    ];
  }

  let bestResult = await requestOsrmRoute(baseAnchors, originCoord, fallbackLabel, fetchImpl);
  if (!bestResult) return null;

  const targetMiles = Number(options.targetDistanceMiles);
  if (!Number.isFinite(targetMiles) || targetMiles <= 0) {
    return bestResult;
  }

  let currentResult = bestResult;
  const initialRelError = Math.abs(currentResult.distanceMiles - targetMiles) / targetMiles;
  if (initialRelError <= 0.05) {
    return bestResult;
  }

  let cumulativeScale = 1.0;
  for (let iter = 0; iter < 3; iter++) {
    const rawRatio = targetMiles / Math.max(0.1, currentResult.distanceMiles);
    const stepScale = Math.max(0.45, Math.min(2.2, rawRatio));
    cumulativeScale = Math.max(0.35, Math.min(3.0, cumulativeScale * stepScale));

    const scaledAnchors = baseAnchors.map((pt, idx) => {
      if (idx === 0 || idx === baseAnchors.length - 1 || pt.__pinned) {
        return pt;
      }
      return {
        lat: originCoord.lat + (Number(pt.lat) - originCoord.lat) * cumulativeScale,
        lng: originCoord.lng + (Number(pt.lng) - originCoord.lng) * cumulativeScale
      };
    });

    const nextResult = await requestOsrmRoute(scaledAnchors, originCoord, fallbackLabel, fetchImpl);
    if (!nextResult) break;

    currentResult = nextResult;
    if (
      Math.abs(nextResult.distanceMiles - targetMiles) <
      Math.abs(bestResult.distanceMiles - targetMiles)
    ) {
      bestResult = nextResult;
    }

    if (Math.abs(currentResult.distanceMiles - targetMiles) / targetMiles <= 0.05) {
      break;
    }
  }

  return bestResult;
}

/**
 * Query OpenStreetMap Overpass API for sidewalk, lighting, trail, and quiet-road metrics
 * around (lat, lng). Returns deterministic fallback metrics when offline or on error.
 */
export async function fetchOsmSafetyAndSurfaceMetrics(lat, lng, radiusMeters = 1200, options = {}) {
  const fallback = {
    sidewalkPct: 92,
    litPct: 88,
    safetyScore: 9.4,
    trailRatio: 0.35,
    quietRoadRatio: 0.55,
    source: 'fallback'
  };

  if (
    lat === null ||
    lng === null ||
    lat === '' ||
    lng === '' ||
    !Number.isFinite(Number(lat)) ||
    !Number.isFinite(Number(lng))
  ) {
    return fallback;
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return fallback;
  }

  const radius = Math.max(200, Math.min(5000, Math.round(Number(radiusMeters) || 1200)));
  const query = `[out:json][timeout:6];way(around:${radius},${Number(lat).toFixed(5)},${Number(lng).toFixed(5)})[highway];out tags;`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetchImpl('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res || !res.ok) return fallback;

    const data = await res.json();
    const elements = Array.isArray(data?.elements) ? data.elements.filter((el) => el && el.tags) : [];
    if (elements.length === 0) return fallback;

    let sidewalkCount = 0;
    let litYesCount = 0;
    let litTaggedCount = 0;
    let trailCount = 0;
    let quietRoadCount = 0;

    for (const el of elements) {
      const t = el.tags;
      const hw = String(t.highway || '').toLowerCase();
      const sw = String(t.sidewalk || '').toLowerCase();
      const lit = String(t.lit || '').toLowerCase();
      const surf = String(t.surface || '').toLowerCase();

      const isTrail =
        hw === 'footway' ||
        hw === 'path' ||
        hw === 'cycleway' ||
        hw === 'track' ||
        hw === 'bridleway' ||
        surf === 'gravel' ||
        surf === 'dirt' ||
        surf === 'unpaved' ||
        surf === 'compacted' ||
        surf === 'fine_gravel';

      const isQuietRoad =
        hw === 'residential' ||
        hw === 'living_street' ||
        hw === 'pedestrian' ||
        hw === 'service';

      const hasSidewalk =
        sw === 'both' ||
        sw === 'left' ||
        sw === 'right' ||
        sw === 'yes' ||
        sw === 'separate' ||
        hw === 'footway' ||
        hw === 'pedestrian' ||
        hw === 'path' ||
        hw === 'cycleway';

      if (hasSidewalk) sidewalkCount++;
      if (isTrail) trailCount++;
      if (isQuietRoad) quietRoadCount++;

      if (lit) {
        litTaggedCount++;
        if (lit === 'yes' || lit === '24/7' || lit === 'automatic') {
          litYesCount++;
        }
      }
    }

    const total = elements.length;
    const sidewalkPct = Math.round((sidewalkCount / total) * 100);
    const litPct =
      litTaggedCount > 0
        ? Math.round((litYesCount / litTaggedCount) * 100)
        : Math.min(95, Math.max(45, Math.round(55 + ((sidewalkCount + quietRoadCount) / (total * 2)) * 40)));
    const trailRatio = Number((trailCount / total).toFixed(2));
    const quietRoadRatio = Number((quietRoadCount / total).toFixed(2));
    const rawScore = 6.2 + (sidewalkPct / 100) * 2.0 + (litPct / 100) * 1.2 + quietRoadRatio * 0.6;
    const safetyScore = Number(Math.min(10.0, Math.max(5.5, rawScore)).toFixed(1));

    return {
      sidewalkPct,
      litPct,
      safetyScore,
      trailRatio,
      quietRoadRatio,
      source: 'overpass'
    };
  } catch (_) {
    clearTimeout(timeoutId);
    return fallback;
  }
}

/**
 * Re-score, annotate, and sort route choices for 'trail', 'road', or 'lit' surface filters
 * without mutating the input array or its objects.
 */
export function filterAndRankRoutesBySurface(choices, surfaceFilter = 'trail', osmMetrics = null) {
  if (!Array.isArray(choices) || choices.length === 0) return [];
  const filter = ['trail', 'road', 'lit'].includes(String(surfaceFilter || '').toLowerCase())
    ? String(surfaceFilter).toLowerCase()
    : 'trail';

  const scored = choices.map((choice, originalIndex) => {
    const copy = { ...choice };
    const text = `${copy.title || ''} ${copy.subtitle || ''} ${copy.surfaceType || ''} ${Array.isArray(copy.tags) ? copy.tags.join(' ') : ''}`.toLowerCase();
    const parsedSidewalk =
      copy.sidewalkPct != null && copy.sidewalkPct !== ''
        ? parseFloat(String(copy.sidewalkPct))
        : NaN;
    const sidewalkPct = Number.isFinite(parsedSidewalk)
      ? parsedSidewalk
      : (osmMetrics?.sidewalkPct ?? 85);
    const parsedLit =
      copy.litPct != null && copy.litPct !== ''
        ? parseFloat(String(copy.litPct))
        : NaN;
    const litPct = Number.isFinite(parsedLit)
      ? parsedLit
      : (osmMetrics?.litPct ?? 80);

    let matchScore = 50;
    if (filter === 'trail') {
      const hasTrailKeyword = /(trail|greenway|park|path|creek|river|gravel|nature|canopy)/.test(text);
      const isTrailType = copy.surfaceType === 'trail';
      matchScore =
        (isTrailType ? 35 : 0) +
        (hasTrailKeyword ? 30 : 0) +
        (osmMetrics?.trailRatio ?? 0.3) * 25 +
        sidewalkPct * 0.1;
    } else if (filter === 'road') {
      const hasRoadKeyword = /(road|street|sidewalk|avenue|boulevard|neighborhood|paved|corridor)/.test(text);
      const isRoadType = copy.surfaceType === 'road';
      matchScore =
        (isRoadType ? 35 : 0) +
        (hasRoadKeyword ? 30 : 0) +
        (osmMetrics?.quietRoadRatio ?? 0.5) * 20 +
        sidewalkPct * 0.15;
    } else if (filter === 'lit') {
      const hasLitKeyword = /(lit|night|illuminated|lamp|bright|safe)/.test(text);
      const isLitType = copy.surfaceType === 'lit';
      matchScore =
        (isLitType ? 30 : 0) +
        (hasLitKeyword ? 20 : 0) +
        litPct * 0.5;
    }

    copy.surfaceFilter = filter;
    copy.surfaceMatchScore = Number(matchScore.toFixed(2));
    if (osmMetrics && Number.isFinite(Number(osmMetrics.safetyScore))) {
      const baseSafety = Number(copy.safetyScore);
      const blended = Number.isFinite(baseSafety)
        ? (baseSafety * 0.6 + Number(osmMetrics.safetyScore) * 0.4)
        : Number(osmMetrics.safetyScore);
      copy.safetyScore = Number(Math.min(10, Math.max(5, blended)).toFixed(1));
    }

    return { copy, originalIndex };
  });

  scored.sort((a, b) => {
    if (b.copy.surfaceMatchScore !== a.copy.surfaceMatchScore) {
      return b.copy.surfaceMatchScore - a.copy.surfaceMatchScore;
    }
    return a.originalIndex - b.originalIndex;
  });

  return scored.map((entry) => entry.copy);
}

/**
 * Query Open-Meteo Elevation API for route coordinates (with deterministic offline fallback),
 * populate pt.ele (meters) on each path point, and return elevation stats & SVG paths.
 */
export async function fetchRouteElevationProfile(path, options = {}) {
  const emptyResult = {
    elevationsMeters: [],
    gainMeters: 0,
    gainFeet: 0,
    maxMeters: 0,
    maxFeet: 0,
    minMeters: 0,
    svgStrokePath: 'M 0 30 L 300 30',
    svgFillPath: 'M 0 30 L 300 30 L 300 60 L 0 60 Z',
    svgPoints: []
  };

  if (!Array.isArray(path) || path.length === 0) return emptyResult;

  const validPath = path.filter(
    (pt) =>
      pt &&
      typeof pt === 'object' &&
      pt.lat != null &&
      pt.lng != null &&
      pt.lat !== '' &&
      pt.lng !== '' &&
      Number.isFinite(Number(pt.lat)) &&
      Number.isFinite(Number(pt.lng))
  );
  if (validPath.length === 0) return emptyResult;

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const maxSamples = 50;
  const step = validPath.length > maxSamples ? (validPath.length - 1) / (maxSamples - 1) : 1;
  const sampleIndices = [];
  if (validPath.length <= maxSamples) {
    for (let i = 0; i < validPath.length; i++) sampleIndices.push(i);
  } else {
    for (let s = 0; s < maxSamples; s++) {
      sampleIndices.push(Math.min(validPath.length - 1, Math.round(s * step)));
    }
  }

  let sampledElevations = null;
  if (typeof fetchImpl === 'function') {
    const lats = sampleIndices.map((idx) => Number(validPath[idx].lat).toFixed(5)).join(',');
    const lngs = sampleIndices.map((idx) => Number(validPath[idx].lng).toFixed(5)).join(',');
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);
    try {
      const res = await fetchImpl(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res && res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.elevation) && data.elevation.length === sampleIndices.length) {
          const rawVals = data.elevation.map((v) =>
            v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null
          );
          const validIndices = rawVals.map((v, idx) => (v !== null ? idx : -1)).filter((idx) => idx !== -1);
          if (validIndices.length === 0) {
            sampledElevations = rawVals.map(() => 210);
          } else {
            sampledElevations = rawVals.map((v, idx) => {
              if (v !== null) return v;
              let prevIdx = -1;
              let nextIdx = -1;
              for (const vi of validIndices) {
                if (vi < idx) prevIdx = vi;
                else if (vi > idx && nextIdx === -1) nextIdx = vi;
              }
              if (prevIdx !== -1 && nextIdx !== -1) {
                const t = (idx - prevIdx) / (nextIdx - prevIdx);
                return rawVals[prevIdx] + t * (rawVals[nextIdx] - rawVals[prevIdx]);
              }
              return prevIdx !== -1 ? rawVals[prevIdx] : rawVals[nextIdx];
            });
          }
        }
      }
    } catch (_) {
      clearTimeout(timeoutId);
    }
  }

  const elevationsMeters = new Array(validPath.length);
  if (sampledElevations) {
    if (sampleIndices.length === validPath.length) {
      for (let i = 0; i < validPath.length; i++) {
        elevationsMeters[i] = Number(sampledElevations[i].toFixed(1));
      }
    } else {
      // Linearly interpolate sampled elevations to every path point
      let seg = 0;
      for (let i = 0; i < validPath.length; i++) {
        while (seg < sampleIndices.length - 2 && i > sampleIndices[seg + 1]) {
          seg++;
        }
        const i0 = sampleIndices[seg];
        const i1 = sampleIndices[seg + 1] ?? i0;
        const e0 = sampledElevations[seg];
        const e1 = sampledElevations[seg + 1] ?? e0;
        const t = i1 > i0 ? (i - i0) / (i1 - i0) : 0;
        elevationsMeters[i] = Number((e0 + t * (e1 - e0)).toFixed(1));
      }
    }
  } else {
    // Deterministic offline fallback curve
    for (let i = 0; i < validPath.length; i++) {
      const lat = Number(validPath[i]?.lat) || 0;
      const val = 210 + Math.sin(i * 0.45) * 6 + Math.cos(lat * 100) * 2;
      elevationsMeters[i] = Number(val.toFixed(1));
    }
  }

  for (let i = 0; i < validPath.length; i++) {
    if (validPath[i] && typeof validPath[i] === 'object') {
      validPath[i].ele = elevationsMeters[i];
    }
  }

  let gainMetersRaw = 0;
  for (let i = 1; i < elevationsMeters.length; i++) {
    const diff = elevationsMeters[i] - elevationsMeters[i - 1];
    if (diff > 0) gainMetersRaw += diff;
  }

  const gainMeters = Number(gainMetersRaw.toFixed(1));
  const gainFeet = Math.round(gainMeters / 0.3048);
  const maxMeters = Number(Math.max(...elevationsMeters).toFixed(1));
  const maxFeet = Math.round(maxMeters / 0.3048);
  const minMeters = Number(Math.min(...elevationsMeters).toFixed(1));

  const svgWidth = 300;
  const svgHeight = 60;
  const padTop = 6;
  const padBottom = 6;
  const usableHeight = svgHeight - padTop - padBottom;
  const span = maxMeters - minMeters;

  const svgPoints = elevationsMeters.map((eleMeters, idx) => {
    const x = validPath.length > 1 ? Number(((idx / (validPath.length - 1)) * svgWidth).toFixed(2)) : svgWidth / 2;
    const norm = span > 0.01 ? (eleMeters - minMeters) / span : 0.5;
    const y = Number((padTop + (1 - norm) * usableHeight).toFixed(2));
    return { x, y, eleMeters };
  });

  const svgStrokePath =
    svgPoints.length > 0
      ? `M ${svgPoints.map((p) => `${p.x} ${p.y}`).join(' L ')}`
      : 'M 0 30 L 300 30';
  const svgFillPath = `${svgStrokePath} L ${svgWidth} ${svgHeight} L 0 ${svgHeight} Z`;

  return {
    elevationsMeters,
    gainMeters,
    gainFeet,
    maxMeters,
    maxFeet,
    minMeters,
    svgStrokePath,
    svgFillPath,
    svgPoints
  };
}

/**
 * Generate a valid GPX 1.1 XML string using real per-point <ele> values in meters.
 */
export function buildRouteGpxString(routeData, elevationsMeters = null) {
  const escapeXml = (str) =>
    String(str || 'Pace Plot Route')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const title = escapeXml(routeData?.title || 'Pace Plot Safe Route');
  const path = Array.isArray(routeData?.path) ? routeData.path : [];

  const trkpts = path
    .map((pt, i) => {
      if (!pt || pt.lat == null || pt.lng == null || pt.lat === '' || pt.lng === '') return null;
      const latNum = Number(pt.lat);
      const lngNum = Number(pt.lng);
      if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
      const lat = latNum.toFixed(6);
      const lng = lngNum.toFixed(6);
      const rawEle = pt.ele ?? elevationsMeters?.[i] ?? 210.0;
      const ele =
        rawEle !== null && rawEle !== undefined && rawEle !== '' && Number.isFinite(Number(rawEle))
          ? Number(rawEle).toFixed(1)
          : '210.0';
      return `      <trkpt lat="${lat}" lon="${lng}"><ele>${ele}</ele></trkpt>`;
    })
    .filter(Boolean)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Pace Plot" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${title}</name>
  </metadata>
  <trk>
    <name>${title}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

/**
 * Compute shortest distance in meters from a GPS point to a line segment [segA, segB].
 */
export function pointToSegmentDistanceMeters(point, segA, segB) {
  if (!point || !segA || !segB) {
    return { distanceMeters: Infinity, closestPoint: null, t: 0 };
  }
  const pLat = Number(point.lat);
  const pLng = Number(point.lng);
  const aLat = Number(segA.lat);
  const aLng = Number(segA.lng);
  const bLat = Number(segB.lat);
  const bLng = Number(segB.lng);

  if (
    !Number.isFinite(pLat) ||
    !Number.isFinite(pLng) ||
    !Number.isFinite(aLat) ||
    !Number.isFinite(aLng) ||
    !Number.isFinite(bLat) ||
    !Number.isFinite(bLng)
  ) {
    return { distanceMeters: Infinity, closestPoint: null, t: 0 };
  }

  const cosLat = Math.cos((pLat * Math.PI) / 180);
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.max(0.01, cosLat);

  const ax = (aLng - pLng) * metersPerDegLng;
  const ay = (aLat - pLat) * metersPerDegLat;
  const bx = (bLng - pLng) * metersPerDegLng;
  const by = (bLat - pLat) * metersPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  let t = 0;
  if (lenSq > 0) {
    t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
  }

  const closestPoint = {
    lat: Number((aLat + t * (bLat - aLat)).toFixed(6)),
    lng: Number((aLng + t * (bLng - aLng)).toFixed(6))
  };

  return {
    distanceMeters: haversineDistanceMeters({ lat: pLat, lng: pLng }, closestPoint),
    closestPoint,
    t
  };
}

/**
 * Compute minimum distance in meters from a GPS point to a polyline path.
 */
export function distanceToPolylineMeters(point, path) {
  if (!point || !Array.isArray(path) || path.length === 0) {
    return { minDistanceMeters: Infinity, closestSegmentIndex: -1, closestPoint: null };
  }
  if (path.length === 1) {
    const pt = { lat: Number(path[0].lat), lng: Number(path[0].lng) };
    return {
      minDistanceMeters: haversineDistanceMeters(point, pt),
      closestSegmentIndex: 0,
      closestPoint: pt
    };
  }

  let minDistanceMeters = Infinity;
  let closestSegmentIndex = 0;
  let closestPoint = null;

  for (let i = 0; i < path.length - 1; i++) {
    const seg = pointToSegmentDistanceMeters(point, path[i], path[i + 1]);
    if (seg.distanceMeters < minDistanceMeters) {
      minDistanceMeters = seg.distanceMeters;
      closestSegmentIndex = i;
      closestPoint = seg.closestPoint;
    }
  }

  return { minDistanceMeters, closestSegmentIndex, closestPoint };
}

/**
 * Evaluate whether a runner's GPS point has deviated beyond thresholdMeters (default 50m)
 * from the active route polyline.
 */
export function evaluateOffRouteDeviation(point, path, thresholdMeters = 50) {
  const { minDistanceMeters, closestSegmentIndex, closestPoint } = distanceToPolylineMeters(point, path);
  const isOffRoute = Number.isFinite(minDistanceMeters) && minDistanceMeters > thresholdMeters;
  return {
    isOffRoute,
    deviationMeters: minDistanceMeters,
    closestSegmentIndex,
    closestPoint
  };
}

/**
 * Construct a complete, full human-readable address from Nominatim / Photon / OpenStreetMap properties
 * so choosing an address displays the entire street address, city, state, and zip code.
 */
export function formatFullPhotonAddress(props, fallback = 'Selected Location') {
  if (!props || typeof props !== 'object') return fallback;

  const addr = props.address && typeof props.address === 'object' ? props.address : props;

  const streetNumber = (addr.housenumber || addr.house_number)
    ? String(addr.housenumber || addr.house_number).trim()
    : '';
  const streetName = (addr.street || addr.road || addr.pedestrian || addr.footway)
    ? String(addr.street || addr.road || addr.pedestrian || addr.footway).trim()
    : '';
  const streetFull = [streetNumber, streetName].filter(Boolean).join(' ');

  const rawName = (props.name || addr.name || addr.amenity || addr.building || addr.leisure || addr.park)
    ? String(props.name || addr.name || addr.amenity || addr.building || addr.leisure || addr.park).trim()
    : '';
  const placeName = rawName && rawName !== streetName && rawName !== streetFull ? rawName : '';

  const city =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.suburb ||
    addr.municipality ||
    addr.hamlet ||
    addr.district ||
    addr.county ||
    '';

  const state = addr.state ? String(addr.state).trim() : '';
  const postcode = addr.postcode ? String(addr.postcode).trim() : '';
  const stateZip = [state, postcode].filter(Boolean).join(' ');

  const parts = [placeName, streetFull, city, stateZip].filter(Boolean);
  // Deduplicate adjacent identical segments (e.g. when placeName == city)
  const uniqueParts = parts.filter((part, idx) => idx === 0 || part.toLowerCase() !== parts[idx - 1].toLowerCase());

  if (uniqueParts.length === 0) {
    if (props.display_name) return String(props.display_name).trim();
    if (addr.country) return String(addr.country);
  }
  return uniqueParts.join(', ') || fallback;
}


