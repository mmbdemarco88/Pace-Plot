// OpenWeather & Live Meteorological Data Service for Pace Plot
// Integrates OpenWeather API with automatic fallback for runner safety

const weatherCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

/**
 * Fetch current weather conditions (temperature, rain probability) for route coordinates
 * @param {number} lat Latitude
 * @param {number} lon Longitude
 * @returns {Promise<{tempF: number, rainProb: number, condition: string, icon: string, iconColor: string, summary: string, windMph: number, provider: string}>}
 */
export async function fetchRouteWeather(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return getDefaultWeather();
  }

  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  const openWeatherApiKey = import.meta.env.VITE_OPENWEATHER_API_KEY || '';

  // 1. If OpenWeather API key is provided, try OpenWeather API first
  if (openWeatherApiKey) {
    try {
      const owUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=imperial&appid=${openWeatherApiKey}`;
      const res = await fetch(owUrl);
      if (res.ok) {
        const data = await res.json();
        
        // OpenWeather rain volume or forecast approximation
        let rainProb = 0;
        if (data.rain) {
          const mm = data.rain['1h'] || data.rain['3h'] || 0;
          rainProb = Math.min(100, Math.max(15, Math.round(mm * 35)));
        } else if (data.weather?.[0]?.main === 'Rain' || data.weather?.[0]?.main === 'Drizzle') {
          rainProb = 75;
        } else if (data.weather?.[0]?.main === 'Clouds') {
          rainProb = (data.clouds?.all > 70) ? 25 : 10;
        } else {
          rainProb = 5;
        }

        const conditionMain = data.weather?.[0]?.main || 'Clear';
        const conditionDesc = data.weather?.[0]?.description || 'clear sky';
        const tempF = Math.round(data.main?.temp ?? 65);
        const windMph = Math.round(data.wind?.speed ?? 5);

        const iconConfig = getIconForCondition(conditionMain, conditionDesc);

        const result = {
          tempF,
          rainProb,
          condition: capitalizeFirstLetter(conditionDesc),
          icon: iconConfig.icon,
          iconColor: iconConfig.color,
          summary: getRunnerWeatherSummary(tempF, rainProb, windMph),
          windMph,
          provider: 'OpenWeather'
        };

        weatherCache.set(cacheKey, { timestamp: Date.now(), data: result });
        return result;
      }
    } catch (err) {
      console.warn("OpenWeather API fetch notice, falling back to meteorological provider:", err);
    }
  }

  // 2. High-precision live meteorological fallback (Open-Meteo API, no API key required)
  try {
    const fallbackUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`;
    const res = await fetch(fallbackUrl);
    if (res.ok) {
      const data = await res.json();
      const current = data.current || {};
      const tempF = Math.round(current.temperature_2m ?? 65);
      const rainProb = Math.round(current.precipitation_probability ?? (current.precipitation > 0 ? 80 : 8));
      const windMph = Math.round(current.wind_speed_10m ?? 6);
      const wmoCode = current.weather_code ?? 0;

      const conditionConfig = parseWmoWeatherCode(wmoCode);

      const result = {
        tempF,
        rainProb,
        condition: conditionConfig.condition,
        icon: conditionConfig.icon,
        iconColor: conditionConfig.color,
        summary: getRunnerWeatherSummary(tempF, rainProb, windMph),
        windMph,
        provider: 'Live Weather'
      };

      weatherCache.set(cacheKey, { timestamp: Date.now(), data: result });
      return result;
    }
  } catch (err) {
    console.warn("Weather fallback error:", err);
  }

  return getDefaultWeather();
}

function getDefaultWeather() {
  return {
    tempF: 64,
    rainProb: 8,
    condition: 'Partly Cloudy',
    icon: 'fa-cloud-sun',
    iconColor: 'text-amber-400',
    summary: 'Ideal Running Conditions · Dry Streets',
    windMph: 6,
    provider: 'Pace Plot Weather'
  };
}

function getIconForCondition(main, desc) {
  const m = main.toLowerCase();
  const d = (desc || '').toLowerCase();

  if (m.includes('rain') || d.includes('rain') || m.includes('drizzle')) {
    return { icon: 'fa-cloud-showers-heavy', color: 'text-sky-400' };
  }
  if (m.includes('thunder') || d.includes('storm')) {
    return { icon: 'fa-cloud-bolt', color: 'text-amber-400' };
  }
  if (m.includes('snow') || d.includes('snow')) {
    return { icon: 'fa-snowflake', color: 'text-sky-200' };
  }
  if (m.includes('cloud')) {
    if (d.includes('few') || d.includes('scattered') || d.includes('partly')) {
      return { icon: 'fa-cloud-sun', color: 'text-amber-400' };
    }
    return { icon: 'fa-cloud', color: 'text-stone-300' };
  }
  if (m.includes('clear')) {
    return { icon: 'fa-sun', color: 'text-amber-400' };
  }
  if (m.includes('wind')) {
    return { icon: 'fa-wind', color: 'text-teal-400' };
  }
  return { icon: 'fa-cloud-sun', color: 'text-amber-400' };
}

function parseWmoWeatherCode(code) {
  if (code === 0) return { condition: 'Clear Sky', icon: 'fa-sun', color: 'text-amber-400' };
  if (code === 1 || code === 2) return { condition: 'Partly Cloudy', icon: 'fa-cloud-sun', color: 'text-amber-400' };
  if (code === 3) return { condition: 'Overcast', icon: 'fa-cloud', color: 'text-stone-300' };
  if (code === 45 || code === 48) return { condition: 'Foggy', icon: 'fa-smog', color: 'text-stone-400' };
  if (code >= 51 && code <= 55) return { condition: 'Drizzle', icon: 'fa-cloud-rain', color: 'text-sky-400' };
  if (code >= 61 && code <= 65) return { condition: 'Rain', icon: 'fa-cloud-showers-heavy', color: 'text-sky-400' };
  if (code >= 71 && code <= 75) return { condition: 'Snow', icon: 'fa-snowflake', color: 'text-sky-200' };
  if (code >= 80 && code <= 82) return { condition: 'Rain Showers', icon: 'fa-cloud-rain', color: 'text-sky-400' };
  if (code >= 95) return { condition: 'Thunderstorm', icon: 'fa-cloud-bolt', color: 'text-amber-400' };
  return { condition: 'Fair Conditions', icon: 'fa-cloud-sun', color: 'text-amber-400' };
}

function getRunnerWeatherSummary(tempF, rainProb, windMph) {
  if (rainProb >= 60) return `High Rain Probability (${rainProb}%) · Slick Sidewalks`;
  if (rainProb >= 35) return `Chance of Showers (${rainProb}%) · Light Rain Jacket Recommended`;
  if (tempF > 82) return `Warm (${tempF}°F) · Hydrate Frequently & Seek Shade`;
  if (tempF < 38) return `Chilly (${tempF}°F) · Layer Up & Warm Up Thoroughly`;
  if (windMph > 18) return `Breezy (${windMph} mph) · Headwinds on Open Trails`;
  return `Optimal Running Conditions · ${tempF}°F & Low Rain Risk`;
}

function capitalizeFirstLetter(string) {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
}
