// Real-World GPS Tracking, Haversine Telemetry, OSRM Foot Routing & BLE Heart Rate Engine

const EARTH_RADIUS_METERS = 6371000;
const METERS_PER_MILE = 1609.344;

/**
 * Compute real-world Haversine distance between two GPS coordinates in meters.
 */
export function haversineDistanceMeters(coord1, coord2) {
  if (!coord1 || !coord2) return 0;
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
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  if (is16Bit && dataView.byteLength >= 3) {
    bpm = dataView.getUint16(1, true);
  } else {
    bpm = dataView.getUint8(1);
  }
  return bpm >= 30 && bpm <= 240 ? bpm : null;
}

/**
 * Snap a loop of waypoints to actual pedestrian streets/sidewalks via OSRM Foot Routing API,
 * returning real street-snapped coordinates and turn-by-turn street maneuvers.
 */
export async function fetchStreetSnappedLoopFromOsrm(waypoints, fallbackLabel = 'Safe Pedestrian Loop') {
  if (!Array.isArray(waypoints) || waypoints.length < 3) return null;

  // Sample 5 key loop anchor points (Start -> North/East -> Apex -> Return -> Start)
  const anchors = [
    waypoints[0],
    waypoints[Math.floor(waypoints.length * 0.25)],
    waypoints[Math.floor(waypoints.length * 0.5)],
    waypoints[Math.floor(waypoints.length * 0.75)],
    waypoints[0]
  ];

  const coordString = anchors.map((pt) => `${pt.lng.toFixed(6)},${pt.lat.toFixed(6)}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/foot/${coordString}?overview=full&geometries=geojson&steps=true`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route || !route.geometry || !Array.isArray(route.geometry.coordinates)) {
      return null;
    }

    const snappedPath = route.geometry.coordinates.map(([lng, lat]) => ({
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6))
    }));

    const distanceMiles = Number((route.distance / METERS_PER_MILE).toFixed(2));
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
      distanceMiles: distanceMiles > 0.2 ? distanceMiles : computePathDistanceMiles(snappedPath),
      maneuvers: maneuvers.slice(0, 12)
    };
  } catch (_) {
    clearTimeout(timeoutId);
    return null;
  }
}
