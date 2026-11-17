import { store, escapeHtml } from './state/store.js';
import { formatFullPhotonAddress } from './gpsEngine.js';

export async function reverseGeocodeCoordinate(lat, lng, fallbackLabel = null) {
  let fullAddress = fallbackLabel || `Pinned Location (${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)})`;

  try {
    const nomRev = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`,
      { headers: { 'Accept-Language': 'en-US,en' } }
    );
    if (nomRev.ok) {
      const nomData = await nomRev.json();
      if (nomData && (nomData.address || nomData.display_name)) {
        fullAddress = formatFullPhotonAddress(nomData, nomData.display_name || fullAddress);
        return fullAddress;
      }
    }
  } catch (_) {}

  try {
    const revRes = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`);
    if (revRes.ok) {
      const revData = await revRes.json();
      const props = revData?.features?.[0]?.properties;
      if (props) {
        fullAddress = formatFullPhotonAddress(props, fullAddress);
      }
    }
  } catch (_) {}

  return fullAddress;
}

export function setupLocationSearch({ onSelectLocation } = {}) {
  if (typeof document === 'undefined') return;
  const inputSearch = document.getElementById('inputLocationSearch');
  const btnSearchSubmit = document.getElementById('btnSearchSubmit');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const suggestionsList = document.getElementById('searchSuggestionsList');
  let searchDebounceTimer = null;
  let placesSessionToken = null;
  let latestSearchId = 0;

  async function fetchAddressCandidates(query) {
    const trimmed = (query || '').trim();
    if (trimmed.length < 2) return [];

    const results = [];
    const seenKeys = new Set();

    function addCandidate(cand) {
      if (!cand || !cand.fullAddress) return;
      const key = cand.fullAddress.toLowerCase().replace(/\s+/g, ' ');
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      results.push(cand);
    }

    const nominatimPromise = (async () => {
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(trimmed)}`;
        const res = await fetch(nomUrl, {
          headers: { 'Accept-Language': 'en-US,en' }
        });
        if (!res.ok) return [];
        const items = await res.json();
        if (!Array.isArray(items)) return [];
        return items
          .filter((it) => it && it.lat !== undefined && it.lon !== undefined)
          .map((it) => {
            const fullAddress = formatFullPhotonAddress(it, it.display_name || trimmed);
            const addr = it.address || {};
            const secondary = [
              addr.city || addr.town || addr.village || addr.suburb || addr.county || '',
              addr.state || '',
              addr.postcode || ''
            ]
              .filter(Boolean)
              .join(', ');
            return {
              fullAddress,
              secondaryText: secondary || it.type || 'Street Address',
              lat: Number(it.lat),
              lon: Number(it.lon)
            };
          });
      } catch (_) {
        return [];
      }
    })();

    const googlePlacesPromise = (async () => {
      try {
        if (!window.google || !window.google.maps || !window.google.maps.importLibrary) return [];
        const { AutocompleteSuggestion, AutocompleteSessionToken } = await window.google.maps.importLibrary('places');
        if (!AutocompleteSuggestion || typeof AutocompleteSuggestion.fetchAutocompleteSuggestions !== 'function') {
          return [];
        }
        if (!placesSessionToken && AutocompleteSessionToken) {
          placesSessionToken = new AutocompleteSessionToken();
        }
        const biasCenter = store.activeRoute?.center || { lat: 41.3857, lng: -81.7058 };
        const req = {
          input: trimmed,
          origin: biasCenter,
          language: 'en-US',
          region: 'us',
          internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio']
        };
        if (placesSessionToken) {
          req.sessionToken = placesSessionToken;
        }
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
        if (!Array.isArray(suggestions) || suggestions.length === 0) return [];
        return suggestions
          .map((s) => s?.placePrediction)
          .filter(Boolean)
          .slice(0, 5)
          .map((pred) => {
            const textStr = pred.text ? pred.text.toString() : trimmed;
            const secStr = pred.secondaryText ? pred.secondaryText.toString() : 'Verified Google Maps Address';
            return {
              fullAddress: textStr,
              secondaryText: secStr,
              placePrediction: pred
            };
          });
      } catch (_) {
        return [];
      }
    })();

    const photonPromise = (async () => {
      try {
        const bias = store.activeRoute?.center || { lat: 41.3857, lng: -81.7058 };
        const apiUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&lat=${bias.lat}&lon=${bias.lng}&limit=4`;
        const res = await fetch(apiUrl);
        if (!res.ok) return [];
        const data = await res.json();
        if (!Array.isArray(data?.features)) return [];
        return data.features
          .filter((f) => Array.isArray(f?.geometry?.coordinates))
          .map((feat) => {
            const p = feat.properties || {};
            const fullAddress = formatFullPhotonAddress(p, trimmed);
            const secondary = [
              p.city || p.town || p.village || p.county || '',
              p.state || '',
              p.postcode || ''
            ]
              .filter(Boolean)
              .join(', ');
            return {
              fullAddress,
              secondaryText: secondary || 'Park / Landmark',
              lat: Number(feat.geometry.coordinates[1]),
              lon: Number(feat.geometry.coordinates[0])
            };
          });
      } catch (_) {
        return [];
      }
    })();

    const [nomItems, gmpItems, photonItems] = await Promise.all([
      nominatimPromise,
      googlePlacesPromise,
      photonPromise
    ]);

    nomItems.forEach(addCandidate);
    gmpItems.forEach(addCandidate);
    photonItems.forEach(addCandidate);

    return results.slice(0, 6);
  }

  async function resolveCandidateCoordinates(cand) {
    if (!cand) return null;
    if (typeof cand.lat === 'number' && typeof cand.lon === 'number' && !Number.isNaN(cand.lat) && !Number.isNaN(cand.lon)) {
      return {
        fullAddress: cand.fullAddress,
        lat: cand.lat,
        lon: cand.lon
      };
    }

    if (cand.placePrediction && typeof cand.placePrediction.toPlace === 'function') {
      try {
        const place = cand.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location']
        });
        placesSessionToken = null;
        if (place.location) {
          const lat = typeof place.location.lat === 'function' ? place.location.lat() : place.location.lat;
          const lon = typeof place.location.lng === 'function' ? place.location.lng() : place.location.lng;
          const resolvedAddr = place.formattedAddress || cand.fullAddress;
          return {
            fullAddress: resolvedAddr,
            lat: Number(lat),
            lon: Number(lon)
          };
        }
      } catch (_) {}
    }

    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(cand.fullAddress)}`;
      const res = await fetch(nomUrl);
      if (res.ok) {
        const arr = await res.json();
        if (Array.isArray(arr) && arr[0]) {
          return {
            fullAddress: formatFullPhotonAddress(arr[0], cand.fullAddress),
            lat: Number(arr[0].lat),
            lon: Number(arr[0].lon)
          };
        }
      }
    } catch (_) {}

    return null;
  }

  function selectSearchedLocation(fullAddress, lat, lon) {
    if (inputSearch) {
      inputSearch.value = fullAddress;
      inputSearch.blur();
    }
    if (suggestionsList) suggestionsList.classList.add('hidden');
    if (btnClearSearch) btnClearSearch.classList.remove('hidden');

    store.currentUserGpsCoord = { lat, lng: lon };

    if (typeof onSelectLocation === 'function') {
      onSelectLocation({ fullAddress, lat, lng: lon });
    }
  }

  async function performSearch(query) {
    const trimmed = (query || '').trim();
    if (trimmed.length < 2) {
      if (suggestionsList) suggestionsList.classList.add('hidden');
      return [];
    }

    const reqId = ++latestSearchId;
    const candidates = await fetchAddressCandidates(trimmed);
    if (reqId !== latestSearchId) return candidates;

    if (!suggestionsList) return candidates;
    suggestionsList.innerHTML = '';

    if (candidates.length === 0) {
      suggestionsList.innerHTML = '<div class="p-3 text-stone-500 text-center text-xs">No matching street address or landmark found. Try adding city or state.</div>';
      suggestionsList.classList.remove('hidden');
      return [];
    }

    candidates.forEach((cand) => {
      const item = document.createElement('div');
      item.className = 'p-2.5 hover:bg-stone-100 dark:hover:bg-stone-700 cursor-pointer border-b border-stone-100 dark:border-stone-700 last:border-none flex items-start gap-2.5 transition';
      item.innerHTML = `
        <i class="fa-solid fa-location-dot text-terracotta text-xs flex-shrink-0 mt-1"></i>
        <div class="min-w-0 flex-1">
          <div class="font-bold text-stone-900 dark:text-white break-words leading-snug">${escapeHtml(cand.fullAddress)}</div>
          <div class="text-[10px] text-stone-500 break-words leading-tight mt-0.5">${escapeHtml(cand.secondaryText || '')}</div>
        </div>
      `;

      item.addEventListener('click', async () => {
        const resolved = await resolveCandidateCoordinates(cand);
        if (resolved) {
          selectSearchedLocation(resolved.fullAddress, resolved.lat, resolved.lon);
        }
      });

      suggestionsList.appendChild(item);
    });

    suggestionsList.classList.remove('hidden');
    return candidates;
  }

  async function submitAddressSearchNow(query) {
    const trimmed = (query || '').trim();
    if (!trimmed) return;

    clearTimeout(searchDebounceTimer);
    latestSearchId++;
    if (btnSearchSubmit) {
      btnSearchSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }

    try {
      const candidates = await fetchAddressCandidates(trimmed);
      if (candidates.length > 0) {
        const resolved = await resolveCandidateCoordinates(candidates[0]);
        if (resolved) {
          selectSearchedLocation(resolved.fullAddress, resolved.lat, resolved.lon);
          return;
        }
      }

      if (window.google?.maps?.importLibrary) {
        try {
          const { Place } = await window.google.maps.importLibrary('places');
          if (Place && typeof Place.searchByText === 'function') {
            const { places } = await Place.searchByText({
              textQuery: trimmed,
              fields: ['displayName', 'formattedAddress', 'location'],
              maxResultCount: 1,
              language: 'en-US',
              region: 'us',
              internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio']
            });
            if (places && places[0] && places[0].location) {
              const p = places[0];
              const lat = typeof p.location.lat === 'function' ? p.location.lat() : p.location.lat;
              const lon = typeof p.location.lng === 'function' ? p.location.lng() : p.location.lng;
              selectSearchedLocation(p.formattedAddress || p.displayName || trimmed, Number(lat), Number(lon));
              return;
            }
          }
        } catch (_) {}
      }
    } finally {
      if (btnSearchSubmit) {
        btnSearchSubmit.innerHTML = '<i class="fa-solid fa-arrow-right"></i>';
      }
    }
  }

  if (inputSearch) {
    inputSearch.addEventListener('input', (e) => {
      const val = e.target.value;
      if (btnClearSearch) {
        if (val.length > 0) btnClearSearch.classList.remove('hidden');
        else btnClearSearch.classList.add('hidden');
      }
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => performSearch(val), 280);
    });

    inputSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void submitAddressSearchNow(inputSearch.value);
      } else if (e.key === 'Escape') {
        if (suggestionsList) suggestionsList.classList.add('hidden');
      }
    });
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      if (inputSearch) {
        inputSearch.value = '';
        inputSearch.focus();
      }
      btnClearSearch.classList.add('hidden');
      if (suggestionsList) suggestionsList.classList.add('hidden');
    });
  }

  if (btnSearchSubmit) {
    btnSearchSubmit.addEventListener('click', () => {
      if (inputSearch) {
        void submitAddressSearchNow(inputSearch.value);
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (suggestionsList && inputSearch && !suggestionsList.contains(e.target) && e.target !== inputSearch) {
      suggestionsList.classList.add('hidden');
    }
  });
}
