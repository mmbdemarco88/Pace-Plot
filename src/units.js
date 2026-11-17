// ----------------------------------------------------
// Pace Plot — Metric / Imperial Unit System & Formatting Module
// ----------------------------------------------------

export const UNITS_STORAGE_KEY = 'paceplot_unit_system';

const unitListeners = new Set();

export function getUnitSystem(storage = globalThis.localStorage) {
  try {
    if (storage && typeof storage.getItem === 'function') {
      const stored = storage.getItem(UNITS_STORAGE_KEY);
      if (stored === 'metric') {
        return 'metric';
      }
    }
  } catch (_) {}
  return 'imperial';
}

export function setUnitSystem(system, storage = globalThis.localStorage) {
  const normalized = system === 'metric' ? 'metric' : 'imperial';
  try {
    if (storage && typeof storage.setItem === 'function') {
      storage.setItem(UNITS_STORAGE_KEY, normalized);
    }
  } catch (_) {}

  unitListeners.forEach((listener) => {
    try {
      listener(normalized);
    } catch (_) {}
  });

  return normalized;
}

export function toggleUnitSystem(storage = globalThis.localStorage) {
  const current = getUnitSystem(storage);
  const next = current === 'metric' ? 'imperial' : 'metric';
  return setUnitSystem(next, storage);
}

export function onUnitSystemChange(listener) {
  if (typeof listener === 'function') {
    unitListeners.add(listener);
  }
  return () => {
    unitListeners.delete(listener);
  };
}

export function milesToKm(miles) {
  return Number(miles) * 1.609344;
}

export function kmToMiles(km) {
  return Number(km) / 1.609344;
}

export function feetToMeters(feet) {
  return Number(feet) * 0.3048;
}

export function metersToFeet(meters) {
  return Number(meters) / 0.3048;
}

export function fahrenheitToCelsius(tempF) {
  return Math.round(((Number(tempF) - 32) * 5) / 9);
}

export function formatDistance(miles, unitSystem = getUnitSystem(), decimals = 2) {
  const m = Number(miles) || 0;
  if (unitSystem === 'metric') {
    const km = milesToKm(m);
    return `${km.toFixed(decimals)} km`;
  }
  return `${m.toFixed(decimals)} mi`;
}

export function formatShortDistance(meters, unitSystem = getUnitSystem()) {
  const m = Math.max(0, Number(meters) || 0);
  if (unitSystem === 'metric') {
    if (m >= 320) {
      return `In ${(m / 1000).toFixed(1)} km`;
    }
    return `In ${Math.max(1, Math.round(m))} m`;
  }

  const feet = metersToFeet(m);
  if (feet >= 1056) {
    return `In ${(m / 1609.344).toFixed(1)} mi`;
  }
  return `In ${Math.max(10, Math.round(feet / 10) * 10)} ft`;
}

export function formatPaceValue(secondsPerMile, unitSystem = getUnitSystem(), includeUnit = true) {
  const raw =
    secondsPerMile === null || secondsPerMile === undefined || secondsPerMile === ''
      ? NaN
      : Number(secondsPerMile);
  const safeVal = Number.isFinite(raw) && raw > 0 ? raw : 510;
  const secPerMile = Math.max(60, Math.round(safeVal));
  const sec = unitSystem === 'metric'
    ? Math.round(secPerMile / 1.609344)
    : Math.round(secPerMile);
  const mins = Math.floor(sec / 60);
  const rem = String(sec % 60).padStart(2, '0');
  const unit = unitSystem === 'metric' ? '/km' : '/mi';
  return `${mins}'${rem}"${includeUnit ? unit : ''}`;
}

export function formatElevation(feetOrMetersOrStr, unitSystem = getUnitSystem(), inputIsMeters = false) {
  const rawStr = String(feetOrMetersOrStr ?? '').trim();
  const hasExplicitPlus = rawStr.startsWith('+');
  const match = rawStr.match(/[-+]?\d+(\.\d+)?/);
  const numVal = match ? Number(match[0]) : (Number(feetOrMetersOrStr) || 0);
  const effectiveInputIsMeters = inputIsMeters || /(?:^|\d|\s)m$/i.test(rawStr);

  let valueInTargetUnit = numVal;
  if (unitSystem === 'metric' && !effectiveInputIsMeters) {
    valueInTargetUnit = feetToMeters(numVal);
  } else if (unitSystem !== 'metric' && effectiveInputIsMeters) {
    valueInTargetUnit = metersToFeet(numVal);
  }

  const rounded = Math.round(valueInTargetUnit);
  const prefix = (hasExplicitPlus || rounded >= 0) && rounded >= 0 ? '+' : '';
  const unit = unitSystem === 'metric' ? ' m' : ' ft';
  return `${prefix}${rounded}${unit}`;
}

export function formatTemperature(tempF, unitSystem = getUnitSystem()) {
  if (tempF === null || tempF === undefined || tempF === '' || !Number.isFinite(Number(tempF))) {
    return unitSystem === 'metric' ? '--°C' : '--°F';
  }
  if (unitSystem === 'metric') {
    return `${fahrenheitToCelsius(tempF)}°C`;
  }
  return `${Math.round(Number(tempF))}°F`;
}

export function formatWindSpeed(windMph, unitSystem = getUnitSystem()) {
  if (windMph === null || windMph === undefined || windMph === '' || !Number.isFinite(Number(windMph))) {
    return unitSystem === 'metric' ? '-- km/h' : '-- mph';
  }
  if (unitSystem === 'metric') {
    return `${Math.round(milesToKm(windMph))} km/h`;
  }
  return `${Math.round(Number(windMph))} mph`;
}
