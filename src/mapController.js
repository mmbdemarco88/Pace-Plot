import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
let L = null;
function getLeaflet() {
  if (typeof window !== 'undefined' && window.L) return window.L;
  return L;
}
async function ensureLeaflet() {
  const existing = getLeaflet();
  if (existing) return existing;
  if (typeof window === 'undefined') return null;
  const mod = await import('leaflet');
  L = mod.default || mod;
  return L;
}
import { store, escapeHtml } from './state/store.js';
import { fetchRouteWeather } from './weather.js';
import { THEME_MODES, getStoredTheme } from './theme.js';
import {
  haversineDistanceMeters,
  computeLiveGpsPace,
  evaluateGpsFixMovement,
  fetchStreetSnappedLoopFromOsrm,
  fetchOsmSafetyAndSurfaceMetrics,
  filterAndRankRoutesBySurface,
  fetchRouteElevationProfile,
  buildRouteGpxString,
  evaluateOffRouteDeviation
} from './gpsEngine.js';
import {
  addSavedRoute,
  addRunActivity,
  enqueueOfflineWorkout
} from './firebase.js';
import { evaluateBadgesFromWorkouts } from './badges.js';
import {
  playTurnChime,
  speakInstruction,
  renderManeuversPreviewList,
  formatManeuverDistDisplay
} from './voiceNav.js';
import { reverseGeocodeCoordinate } from './geocoder.js';
import { syncLiveBeaconSession } from './safeGuard.js';
import {
  getUnitSystem,
  formatDistance,
  formatShortDistance,
  formatPaceValue,
  formatElevation,
  formatTemperature,
  formatWindSpeed
} from './units.js';

export const ROUTES = {
  parma: {
    title: 'West Creek Greenway Safe Loop',
    flavorTitle: 'West Creek Greenway Safe Loop',
    locationName: '6611 Ridge Rd, Parma, OH 44129',
    fullAddress: '6611 Ridge Rd, Parma, OH 44129',
    center: { lat: 41.3857, lng: -81.7058 },
    zoom: 15,
    distance: 3.1,
    elevation: '+42 ft',
    safetyScore: '9.8',
    sidewalkPct: '98%',
    litPct: '100%',
    safetyTags: ['100% Pedestrian Greenway', 'Night Lit', 'No Crossings'],
    path: [
      { lat: 41.3835, lng: -81.709 },
      { lat: 41.386, lng: -81.7082 },
      { lat: 41.3895, lng: -81.7065 },
      { lat: 41.392, lng: -81.702 },
      { lat: 41.3905, lng: -81.698 },
      { lat: 41.387, lng: -81.7005 },
      { lat: 41.3845, lng: -81.704 },
      { lat: 41.3835, lng: -81.709 }
    ],
    maneuvers: [
      { text: 'Start run heading North on West Creek Greenway', dist: 'Start', icon: 'fa-arrow-up', note: 'Paved multi-use trail' },
      { text: 'In 250 feet, bear right at the creek bridge fork', dist: 'In 250 ft', icon: 'fa-arrow-turn-up-right', note: 'Pedestrian bridge' },
      { text: 'Continue straight along Watershed path for 0.8 miles', dist: 'In 800 ft', icon: 'fa-arrow-up', note: 'Lit paved corridor' },
      { text: 'Turn sharp right onto Keystone Trail connector', dist: 'In 150 ft', icon: 'fa-arrow-right', note: 'Buffered sidewalk' },
      { text: 'Turn right onto Meadow Perimeter loop', dist: 'In 100 ft', icon: 'fa-arrow-right', note: 'Scenic parkway' },
      { text: 'Approaching finish line! Final 200 feet ahead.', dist: 'In 200 ft', icon: 'fa-flag-checkered', note: 'Loop closing' }
    ]
  },
  centralpark: {
    title: 'Central Park Reservoir Perimeter',
    flavorTitle: 'Central Park Reservoir Perimeter',
    locationName: 'Central Park Reservoir, 5th Ave & E 90th St, New York, NY 10128',
    fullAddress: 'Central Park Reservoir, 5th Ave & E 90th St, New York, NY 10128',
    center: { lat: 40.785091, lng: -73.968285 },
    zoom: 15,
    distance: 4.0,
    elevation: '+65 ft',
    safetyScore: '9.6',
    sidewalkPct: '100%',
    litPct: '95%',
    safetyTags: ['Traffic-Free', 'High Foot Traffic', 'Emergency Callboxes'],
    path: [
      { lat: 40.7812, lng: -73.9665 },
      { lat: 40.7865, lng: -73.962 },
      { lat: 40.791, lng: -73.959 },
      { lat: 40.793, lng: -73.9635 },
      { lat: 40.7895, lng: -73.971 },
      { lat: 40.784, lng: -73.9725 },
      { lat: 40.7812, lng: -73.9665 }
    ],
    maneuvers: [
      { text: 'Start North on Reservoir Inner Track', dist: 'Start', icon: 'fa-arrow-up', note: 'Crushed stone surface' },
      { text: 'Continue along North Meadow connector', dist: 'In 500 ft', icon: 'fa-arrow-up', note: 'Car-free pedestrian drive' },
      { text: 'Turn left onto West Drive pedestrian lane', dist: 'In 200 ft', icon: 'fa-arrow-left', note: 'Dedicated running lane' },
      { text: 'Loop back East towards the south reservoir pump house', dist: 'In 300 ft', icon: 'fa-arrow-right', note: 'Well-lit circuit' },
      { text: 'Final sprint to the start line', dist: 'In 100 ft', icon: 'fa-flag-checkered', note: 'Finish ahead' }
    ]
  },
  austin: {
    title: 'Lady Bird Lake Boardwalk Loop',
    flavorTitle: 'Lady Bird Lake Boardwalk Loop',
    locationName: '1820 S Lakeshore Blvd, Austin, TX 78741',
    fullAddress: '1820 S Lakeshore Blvd, Austin, TX 78741',
    center: { lat: 30.2505, lng: -97.734 },
    zoom: 15,
    distance: 5.0,
    elevation: '+35 ft',
    safetyScore: '9.5',
    sidewalkPct: '96%',
    litPct: '90%',
    safetyTags: ['Boardwalk', 'Water Stations', 'High Visibility'],
    path: [
      { lat: 30.254, lng: -97.741 },
      { lat: 30.252, lng: -97.731 },
      { lat: 30.248, lng: -97.722 },
      { lat: 30.245, lng: -97.728 },
      { lat: 30.249, lng: -97.739 },
      { lat: 30.254, lng: -97.741 }
    ],
    maneuvers: [
      { text: 'Head East on Ann & Roy Butler Hike-and-Bike Trail', dist: 'Start', icon: 'fa-arrow-up', note: 'Crushed granite trail' },
      { text: 'Step onto Lake Boardwalk bridge section', dist: 'In 400 ft', icon: 'fa-arrow-up', note: 'Continuous handrails & lighting' },
      { text: 'Cross Congress Avenue pedestrian underpass', dist: 'In 150 ft', icon: 'fa-arrow-right', note: 'Grade separated crossing' },
      { text: 'Complete the southern lakefront loop', dist: 'In 100 ft', icon: 'fa-flag-checkered', note: 'Start line ahead' }
    ]
  },
  chicago: {
    title: 'Lakefront Trail & Museum Campus',
    flavorTitle: 'Lakefront Trail & Museum Campus',
    locationName: '1400 S DuSable Lake Shore Dr, Chicago, IL 60605',
    fullAddress: '1400 S DuSable Lake Shore Dr, Chicago, IL 60605',
    center: { lat: 41.866, lng: -87.615 },
    zoom: 15,
    distance: 3.5,
    elevation: '+20 ft',
    safetyScore: '9.7',
    sidewalkPct: '100%',
    litPct: '98%',
    safetyTags: ['Divided Pedestrian/Bike Lanes', 'Lake Michigan', 'Lit'],
    path: [
      { lat: 41.862, lng: -87.614 },
      { lat: 41.868, lng: -87.612 },
      { lat: 41.874, lng: -87.616 },
      { lat: 41.871, lng: -87.62 },
      { lat: 41.864, lng: -87.618 },
      { lat: 41.862, lng: -87.614 }
    ],
    maneuvers: [
      { text: 'Head North on Chicago Lakefront Trail (Pedestrian Lane)', dist: 'Start', icon: 'fa-arrow-up', note: 'Paved greenway' },
      { text: 'Bear right towards Adler Planetarium peninsula', dist: 'In 300 ft', icon: 'fa-arrow-turn-up-right', note: 'Open lakefront view' },
      { text: 'Loop around waterfront promenade', dist: 'In 200 ft', icon: 'fa-arrow-left', note: 'Pedestrian-only plaza' },
      { text: 'Arriving back at Museum Campus trailhead', dist: 'In 100 ft', icon: 'fa-flag-checkered', note: 'Complete loop' }
    ]
  }
};

// Ensure store.activeRoute is initialized
if (!store.activeRoute) {
  store.activeRoute = ROUTES[store.activeKey] || ROUTES.parma;
}

// Leaflet layer references for full fallback parity (F17)
let leafletTileLayer = null;
let leafletGlowPolyline = null;
let leafletCorePolyline = null;
let leafletStartMarker = null;
let leafletRunnerMarker = null;
let leafletDroppedPinMarker = null;
let leafletWaypointMarker = null;
let leafletBreadcrumbPolyline = null;
let lastBeaconSyncMs = 0;

let onWorkoutsUpdatedCallback = null;
export function setOnWorkoutsUpdatedCallback(cb) {
  onWorkoutsUpdatedCallback = cb;
}

function getLeafletMap() {
  return typeof window !== 'undefined' ? window.__activeLeafletMap : null;
}

export async function initGoogleMaps() {
  if (typeof document === 'undefined') return;
  const mapElement = document.getElementById('map');
  if (!mapElement) return;

  const apiKey = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY || '';

  try {
    setOptions({
      key: apiKey,
      v: 'weekly'
    });

    const { Map } = await importLibrary('maps');
    const { ColorScheme } = await importLibrary('core');
    store.markerLib = await importLibrary('marker');
    store.googleMapsLib = window.google.maps;

    const initialCenter = store.activeRoute.center;
    const isInitialDark = getStoredTheme() === THEME_MODES.DARK;

    store.googleMap = new Map(mapElement, {
      center: initialCenter,
      zoom: store.activeRoute.zoom || 15,
      mapId: 'DEMO_MAP_ID',
      colorScheme: isInitialDark
        ? ColorScheme?.DARK || 'DARK'
        : ColorScheme?.LIGHT || 'LIGHT',
      internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
      disableDefaultUI: true,
      gestureHandling: 'greedy',
      zoomControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });
    store.googleMap.__colorSchemeEnum = ColorScheme;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userPos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          if (store.markerLib?.AdvancedMarkerElement && store.googleMap) {
            const userDot = document.createElement('div');
            userDot.innerHTML =
              '<div style="background-color:#0284c7; width:14px; height:14px; border-radius:50%; border:2.5px solid #ffffff; box-shadow:0 0 10px rgba(2,132,199,0.9);"></div>';
            new store.markerLib.AdvancedMarkerElement({
              map: store.googleMap,
              position: userPos,
              title: 'Your Current Location',
              content: userDot
            });
          }
        },
        () => {},
        { timeout: 4000, enableHighAccuracy: false }
      );
    }

    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(() => {
        if (store.googleMap) {
          window.google.maps.event.trigger(store.googleMap, 'resize');
        }
      });
      resizeObserver.observe(mapElement);
      const wrapper = document.getElementById('mapWrapper');
      if (wrapper) resizeObserver.observe(wrapper);
    }

    generateMultipleLoopChoices(
      store.activeRoute.center.lat,
      store.activeRoute.center.lng,
      store.activeRoute.locationName || 'West Creek Greenway',
      store.currentSelectedDistance
    );

    let startPixel = null;
    store.googleMap.addListener('mousedown', (e) => {
      if (!e || !e.latLng) return;
      store.isLongPressTriggered = false;
      const downLatLng = e.latLng;
      startPixel = e.pixel;
      clearTimeout(store.longPressTimer);
      store.longPressTimer = setTimeout(() => {
        store.isLongPressTriggered = true;
        handleMapLongPress(downLatLng);
      }, 500);
    });

    store.googleMap.addListener('mouseup', () => clearTimeout(store.longPressTimer));
    store.googleMap.addListener('dragstart', () => {
      clearTimeout(store.longPressTimer);
      store.isLongPressTriggered = false;
    });
    store.googleMap.addListener('mousemove', (e) => {
      if (startPixel && e.pixel) {
        if (Math.abs(e.pixel.x - startPixel.x) > 8 || Math.abs(e.pixel.y - startPixel.y) > 8) {
          clearTimeout(store.longPressTimer);
        }
      }
    });
    store.googleMap.addListener('contextmenu', (e) => {
      if (!e || !e.latLng) return;
      clearTimeout(store.longPressTimer);
      store.isLongPressTriggered = true;
      handleMapLongPress(e.latLng);
    });

    store.googleMap.addListener('click', async (e) => {
      if (store.isLongPressTriggered) {
        store.isLongPressTriggered = false;
        return;
      }
      if (!e || !e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      const tappedAddress = await reverseGeocodeCoordinate(lat, lng, `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      const inputSearch = document.getElementById('inputLocationSearch');
      if (inputSearch) inputSearch.value = tappedAddress;
      if (store.activeWaypointCoords) {
        generateLoopChoicesWithWaypoint(
          lat,
          lng,
          store.activeWaypointCoords.lat,
          store.activeWaypointCoords.lng,
          tappedAddress,
          store.currentSelectedDistance
        );
      } else {
        generateMultipleLoopChoices(lat, lng, tappedAddress, store.currentSelectedDistance);
      }
      zoomMapOntoCoordinate({ lat, lng }, 16);
    });

    setTimeout(() => {
      if (store.googleMap) {
        window.google.maps.event.trigger(store.googleMap, 'resize');
        fitRouteBounds(store.activeRoute);
      }
    }, 150);
  } catch (err) {
    console.error('Google Maps initialization error:', err);
    initLeafletFallback(mapElement);
  }
}

export async function initLeafletFallback(mapElement) {
  try {
    const leaflet = getLeaflet() || (await ensureLeaflet());
    if (!leaflet || !mapElement) return null;
    leafletTileLayer = null;
    leafletGlowPolyline = null;
    leafletCorePolyline = null;
    leafletStartMarker = null;
    leafletRunnerMarker = null;
    leafletDroppedPinMarker = null;
    leafletWaypointMarker = null;
    leafletBreadcrumbPolyline = null;
    mapElement.innerHTML = '';
    const center = store.activeRoute?.center || { lat: 41.3857, lng: -81.7058 };
    const map = leaflet.map(mapElement, {
      zoomControl: false,
      attributionControl: false
    }).setView([center.lat, center.lng], store.activeRoute?.zoom || 15);

    leafletTileLayer = leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    if (typeof window !== 'undefined') {
      window.__activeLeafletMap = map;
    }

    // Long press / contextmenu / tap handlers for Leaflet parity (F17)
    let pressTimer = null;
    let longPressed = false;
    map.on('mousedown', (e) => {
      longPressed = false;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        longPressed = true;
        handleMapLongPress({ lat: e.latlng.lat, lng: e.latlng.lng });
      }, 500);
    });
    map.on('mouseup', () => clearTimeout(pressTimer));
    map.on('dragstart', () => {
      clearTimeout(pressTimer);
      longPressed = false;
    });
    map.on('contextmenu', (e) => {
      clearTimeout(pressTimer);
      longPressed = true;
      handleMapLongPress({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    map.on('click', async (e) => {
      if (longPressed) {
        longPressed = false;
        return;
      }
      if (!e?.latlng) return;
      const { lat, lng } = e.latlng;
      const tappedAddress = await reverseGeocodeCoordinate(lat, lng, `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      const inputSearch = document.getElementById('inputLocationSearch');
      if (inputSearch) inputSearch.value = tappedAddress;
      if (store.activeWaypointCoords) {
        generateLoopChoicesWithWaypoint(
          lat,
          lng,
          store.activeWaypointCoords.lat,
          store.activeWaypointCoords.lng,
          tappedAddress,
          store.currentSelectedDistance
        );
      } else {
        generateMultipleLoopChoices(lat, lng, tappedAddress, store.currentSelectedDistance);
      }
      zoomMapOntoCoordinate({ lat, lng }, 16);
    });

    if (store.currentRouteChoices.length === 0) {
      generateMultipleLoopChoices(
        center.lat,
        center.lng,
        store.activeRoute?.locationName || 'West Creek Greenway',
        store.currentSelectedDistance
      );
    } else {
      renderRoute(store.activeRoute);
    }
    return map;
  } catch (e) {
    console.warn('Leaflet fallback notice:', e);
    return null;
  }
}

export function renderRoute(routeData) {
  if (!routeData) return;

  // 1. Google Maps rendering
  if (store.googleMap && store.googleMapsLib) {
    if (store.routeGlowPolyline) store.routeGlowPolyline.setMap(null);
    if (store.routeCorePolyline) store.routeCorePolyline.setMap(null);
    if (store.startMarker) store.startMarker.map = null;

    store.routeGlowPolyline = new store.googleMapsLib.Polyline({
      path: routeData.path,
      geodesic: true,
      strokeColor: '#C84B1A',
      strokeOpacity: store.isHeatmapActive ? 0.35 : 0.05,
      strokeWeight: 14,
      map: store.googleMap
    });

    store.routeCorePolyline = new store.googleMapsLib.Polyline({
      path: routeData.path,
      geodesic: true,
      strokeColor: '#C84B1A',
      strokeOpacity: 0.95,
      strokeWeight: 4.5,
      map: store.googleMap
    });

    const exactAddressCoord = routeData.center || routeData.path[0];
    const fullAddrLabel = routeData.fullAddress || routeData.locationName || routeData.title || 'Start / Finish Line';
    if (store.markerLib?.AdvancedMarkerElement && exactAddressCoord) {
      const startPinElement = document.createElement('div');
      startPinElement.className = 'relative flex flex-col items-center';
      startPinElement.innerHTML = `
        <div class="mb-1 px-2 py-0.5 rounded-lg bg-stone-950/90 text-white border border-terracotta/80 shadow-lg text-[10px] font-bold max-w-[230px] truncate pointer-events-none">
          <i class="fa-solid fa-location-dot text-terracotta mr-1"></i>${escapeHtml(fullAddrLabel)}
        </div>
        <div style="background-color:#C84B1A; width:26px; height:26px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 2px 10px rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px;">
          <i class="fa-solid fa-play"></i>
        </div>
      `;

      store.startMarker = new store.markerLib.AdvancedMarkerElement({
        map: store.googleMap,
        position: exactAddressCoord,
        title: fullAddrLabel,
        content: startPinElement
      });
    }
  }

  // 2. Leaflet fallback rendering (F17 parity)
  const leafletMap = getLeafletMap();
  const leaflet = getLeaflet();
  if (leafletMap && leaflet) {
    if (leafletGlowPolyline) leafletMap.removeLayer(leafletGlowPolyline);
    if (leafletCorePolyline) leafletMap.removeLayer(leafletCorePolyline);
    if (leafletStartMarker) leafletMap.removeLayer(leafletStartMarker);

    const latLngs = (routeData.path || []).map((p) => [p.lat, p.lng]);
    if (latLngs.length > 0) {
      leafletGlowPolyline = leaflet.polyline(latLngs, {
        color: '#C84B1A',
        opacity: store.isHeatmapActive ? 0.35 : 0.05,
        weight: 14
      }).addTo(leafletMap);

      leafletCorePolyline = leaflet.polyline(latLngs, {
        color: '#C84B1A',
        opacity: 0.95,
        weight: 4.5
      }).addTo(leafletMap);

      const startPt = routeData.center || routeData.path[0];
      if (startPt) {
        const icon = leaflet.divIcon({
          className: 'paceplot-leaflet-start',
          html: '<div style="background-color:#C84B1A; width:20px; height:20px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        leafletStartMarker = leaflet.marker([startPt.lat, startPt.lng], { icon }).addTo(leafletMap);
      }
    }
  }

  fitRouteBounds(routeData);
  updateRouteInfoUI(routeData);
  void updateElevationChartSVG(routeData);
  if (routeData.center) {
    void updateWeatherBadgeForRoute(routeData.center.lat, routeData.center.lng);
  }
}

export function fitRouteBounds(routeData) {
  if (!routeData) return;
  const path = Array.isArray(routeData.path) && routeData.path.length > 0 ? routeData.path : [];

  if (store.googleMap && store.googleMapsLib) {
    if (path.length === 0 && routeData.center) {
      store.googleMap.setCenter(routeData.center);
      store.googleMap.setZoom(routeData.zoom || 16);
    } else if (typeof window !== 'undefined' && window.__preserveSpotZoomUntil && Date.now() < window.__preserveSpotZoomUntil) {
      const focusPt = routeData.center || path[0];
      if (focusPt) {
        store.googleMap.setCenter(focusPt);
        if ((store.googleMap.getZoom() || 15) < 15.5) {
          store.googleMap.setZoom(16);
        }
      }
    } else {
      const bounds = new store.googleMapsLib.LatLngBounds();
      path.forEach((pt) => bounds.extend(pt));
      if (store.activeWaypointCoords) {
        bounds.extend(store.activeWaypointCoords);
      }
      store.googleMap.fitBounds(bounds, { top: 40, right: 22, bottom: 22, left: 22 });

      const targetZoom = Math.max(15, routeData.zoom || 15);
      setTimeout(() => {
        if (!store.googleMap) return;
        const z = store.googleMap.getZoom();
        if (typeof z === 'number') {
          if (z < 14.5) {
            store.googleMap.setCenter(routeData.center || path[0]);
            store.googleMap.setZoom(targetZoom);
          } else if (z > 17.5) {
            store.googleMap.setZoom(16);
          }
        }
      }, 60);
    }
  }

  const leafletMap = getLeafletMap();
  const leaflet = getLeaflet();
  if (leafletMap && leaflet) {
    if (path.length > 0) {
      const pts = path.map((p) => [p.lat, p.lng]);
      if (store.activeWaypointCoords) {
        pts.push([store.activeWaypointCoords.lat, store.activeWaypointCoords.lng]);
      }
      leafletMap.fitBounds(leaflet.latLngBounds(pts), { padding: [36, 36] });
    } else if (routeData.center) {
      leafletMap.setView([routeData.center.lat, routeData.center.lng], routeData.zoom || 16);
    }
  }
}

export async function updateElevationChartSVG(routeData) {
  if (!routeData || !Array.isArray(routeData.path) || routeData.path.length === 0) return null;
  try {
    const profile = await fetchRouteElevationProfile(routeData.path);
    if (!profile) return null;

    routeData.elevationsMeters = profile.elevationsMeters;
    routeData.svgPoints = profile.svgPoints;
    routeData.elevationGainFeet = profile.gainFeet;
    routeData.elevationMaxFeet = profile.maxFeet;

    const unitSystem = getUnitSystem();
    const gainStr = formatElevation(profile.gainFeet, unitSystem);
    const maxStr = formatElevation(profile.maxFeet, unitSystem).replace(/^\+/, '');
    routeData.elevation = gainStr;

    if (typeof document !== 'undefined') {
      const strokeEl = document.getElementById('elevSvgStroke');
      const fillEl = document.getElementById('elevSvgFill');
      const statsEl = document.getElementById('elevProfileStats');
      const gainEl = document.getElementById('metricGain');
      const kickerEl = document.getElementById('routeElevationKicker');

      if (strokeEl && profile.svgStrokePath) strokeEl.setAttribute('d', profile.svgStrokePath);
      if (fillEl && profile.svgFillPath) fillEl.setAttribute('d', profile.svgFillPath);
      if (statsEl) statsEl.textContent = `${gainStr} Gain · ${maxStr} Max`;
      if (gainEl) gainEl.innerHTML = `<i class="fa-solid fa-mountain text-xs"></i> ${gainStr} Gain`;
      if (kickerEl) kickerEl.textContent = gainStr;
    }

    return profile;
  } catch (_) {
    return null;
  }
}

export function updateRouteInfoUI(routeData) {
  if (typeof document === 'undefined' || !routeData) return;
  const titleEl = document.getElementById('routeTitle');
  const fullAddrSubEl = document.getElementById('selectedFullAddressText');
  const badgeEl = document.getElementById('routeMileageBadge');
  const compactTitleEl = document.getElementById('compactRouteTitle');
  const compactMileageEl = document.getElementById('compactRouteMileage');
  const sidewalkEl = document.getElementById('metricSidewalk');
  const litEl = document.getElementById('metricLit');
  const gainEl = document.getElementById('metricGain');
  const elevKickerEl = document.getElementById('routeElevationKicker');

  const unitSystem = getUnitSystem();
  const distNum = Number(routeData.distance || 3.1);
  const formattedDist = formatDistance(distNum, unitSystem);
  const [distVal, distUnit] = formattedDist.split(' ');

  const fullAddress = routeData.fullAddress || routeData.locationName || routeData.title || 'Selected Location';
  const flavorTitle = routeData.flavorTitle || routeData.title || 'Safe Loop';
  const optionCount = store.currentRouteChoices?.length ? store.currentRouteChoices.length : 4;
  const optionNum = (typeof store.selectedChoiceIndex === 'number' ? store.selectedChoiceIndex : 0) + 1;

  const gainLabel =
    routeData.elevationGainFeet !== undefined
      ? formatElevation(routeData.elevationGainFeet, unitSystem)
      : formatElevation(routeData.elevation || '+42 ft', unitSystem);
  const maxLabel =
    routeData.elevationMaxFeet !== undefined
      ? formatElevation(routeData.elevationMaxFeet, unitSystem).replace(/^\+/, '')
      : formatElevation(780, unitSystem).replace(/^\+/, '');

  if (titleEl) titleEl.textContent = fullAddress;
  if (fullAddrSubEl) {
    fullAddrSubEl.textContent = `${flavorTitle} · Option ${optionNum} of ${optionCount}`;
  }
  if (badgeEl) badgeEl.innerHTML = `${distVal} <span class="text-xs font-semibold text-stone-500">${distUnit}</span>`;
  if (compactTitleEl) compactTitleEl.textContent = `${fullAddress} · ${flavorTitle}`;
  if (compactMileageEl) compactMileageEl.textContent = formattedDist;
  if (elevKickerEl) elevKickerEl.textContent = gainLabel;

  if (sidewalkEl) sidewalkEl.innerHTML = `<i class="fa-solid fa-check text-xs"></i> ${escapeHtml(routeData.sidewalkPct || '98%')} Sidewalks`;
  if (litEl) litEl.innerHTML = `<i class="fa-solid fa-bolt text-xs"></i> ${escapeHtml(routeData.litPct || '100%')} Lit Streets`;
  if (gainEl) gainEl.innerHTML = `<i class="fa-solid fa-mountain text-xs"></i> ${gainLabel} Gain`;
  const elevProfileStats = document.getElementById('elevProfileStats');
  if (elevProfileStats) elevProfileStats.textContent = `${gainLabel} Gain · ${maxLabel} Max`;

  updateEstimatedDuration();
  renderManeuversPreviewList(routeData);
}

export async function updateWeatherBadgeForRoute(lat, lng) {
  if (typeof document === 'undefined') return;
  try {
    const weather = await fetchRouteWeather(lat, lng);
    store.currentWeatherData = weather;

    const unitSystem = getUnitSystem();
    const iconEl = document.getElementById('weatherIcon');
    const tempEl = document.getElementById('weatherTempDisplay');
    const windEl = document.getElementById('weatherWindDisplay');
    const rainContainer = document.getElementById('weatherRainContainer');
    const rainEl = document.getElementById('weatherRainDisplay');

    if (iconEl) iconEl.className = `fa-solid ${weather.icon} text-amber-400 text-xs`;
    if (tempEl) tempEl.textContent = formatTemperature(weather.tempF, unitSystem);
    if (windEl) {
      const dirSuffix = weather.windDir ? ` ${weather.windDir}` : '';
      windEl.textContent = `${formatWindSpeed(weather.windMph, unitSystem)}${dirSuffix}`;
    }

    if (rainContainer && rainEl) {
      const rainProb = Number(weather.rainProb ?? weather.precipChance ?? 0);
      if (rainProb > 5 || weather.condition === 'Rain' || weather.condition === 'Drizzle') {
        rainContainer.classList.remove('hidden');
        rainEl.textContent = `${rainProb}% rain`;
      } else {
        rainContainer.classList.add('hidden');
      }
    }
  } catch (err) {
    console.warn('Weather badge update failed:', err);
  }
}

function applyOsmMetricsToChoices(choices, osmMetrics) {
  if (!osmMetrics) return;
  choices.forEach((choice, idx) => {
    const offset = idx * 2;
    choice.sidewalkPct = `${Math.max(40, Math.min(100, osmMetrics.sidewalkPct - offset))}%`;
    choice.litPct = `${Math.max(30, Math.min(100, osmMetrics.litPct - offset))}%`;
    choice.safetyScore = Number(Math.max(5.0, Math.min(9.9, osmMetrics.safetyScore - idx * 0.1)).toFixed(1)).toString();
  });
}

export function generateMultipleLoopChoices(lat, lng, label = 'Custom Location', targetDist = 3.1, redoOffset = 0) {
  const flavors = [
    {
      titleSuffix: 'Greenway Lit Loop',
      safetyScore: '9.9',
      sidewalkPct: '100%',
      litPct: '100%',
      gainFactor: 8.0,
      baseHeading: 0.25 * Math.PI,
      traitTag: '100% Paved Trails · Night Lit',
      distMultiplier: 1.0,
      icon: 'fa-tree',
      color: '#10b981',
      wobbles: [1.0, 1.2, 0.95, 1.25, 1.1, 0.9, 1.15, 0.98],
      stepSuffix: 'along illuminated park greenway'
    },
    {
      titleSuffix: 'Scenic Waterfront Circuit',
      safetyScore: '9.7',
      sidewalkPct: '98%',
      litPct: '95%',
      gainFactor: 9.5,
      baseHeading: 0.75 * Math.PI,
      traitTag: 'Scenic Waterfront · Wide Buffer',
      distMultiplier: 1.03,
      icon: 'fa-water',
      color: '#0284c7',
      wobbles: [1.1, 0.95, 1.25, 1.05, 0.9, 1.2, 1.05, 0.95],
      stepSuffix: 'along scenic shoreline promenade'
    },
    {
      titleSuffix: 'Quiet Neighborhood Loop',
      safetyScore: '9.6',
      sidewalkPct: '97%',
      litPct: '92%',
      gainFactor: 6.5,
      baseHeading: 1.75 * Math.PI,
      traitTag: 'Calm Cul-de-Sacs · Zero Traffic',
      distMultiplier: 0.97,
      icon: 'fa-shield-heart',
      color: '#8b5cf6',
      wobbles: [0.95, 1.1, 1.0, 1.15, 1.2, 1.05, 0.92, 1.08],
      stepSuffix: 'through tranquil residential lanes'
    },
    {
      titleSuffix: 'Hill Vista Training Loop',
      safetyScore: '9.8',
      sidewalkPct: '99%',
      litPct: '96%',
      gainFactor: 14.0,
      baseHeading: 1.25 * Math.PI,
      traitTag: 'Rolling Hills · Cardio Focus',
      distMultiplier: 1.05,
      icon: 'fa-mountain',
      color: '#f59e0b',
      wobbles: [1.15, 1.05, 0.9, 1.2, 1.1, 1.25, 0.95, 1.0],
      stepSuffix: 'over rolling elevation overlooks'
    }
  ];

  const choices = flavors.map((f, idx) => {
    const routeDist = Number((targetDist * f.distMultiplier).toFixed(2));
    const radiusDeg = Math.max(0.0035, routeDist / (2 * Math.PI) / 65);
    const numPoints = 8;
    const path = [];
    const cosLat = Math.cos((lat * Math.PI) / 180) || 1;
    const headingAngle = f.baseHeading + redoOffset;

    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * 2 * Math.PI + headingAngle;
      const r = radiusDeg * f.wobbles[i];
      const offsetLat = r * Math.sin(angle) + radiusDeg * 0.45 * Math.sin(headingAngle);
      const offsetLng = (r * Math.cos(angle) + radiusDeg * 0.45 * Math.cos(headingAngle)) / cosLat;
      path.push({ lat: Number((lat + offsetLat).toFixed(6)), lng: Number((lng + offsetLng).toFixed(6)) });
    }
    path[0] = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    path.push({ ...path[0] });

    const elevGain = Math.round(18 + routeDist * f.gainFactor);
    const estTotalSeconds = routeDist * store.currentPaceSeconds;
    const estMins = Math.round(estTotalSeconds / 60);

    return {
      id: `choice-${idx + 1}-${Date.now()}`,
      title: `${label} ${f.titleSuffix}`,
      flavorTitle: f.titleSuffix,
      locationName: label,
      fullAddress: label,
      flavorIndex: idx,
      center: { lat, lng },
      zoom: routeDist > 5 ? 14 : routeDist > 2 ? 15 : 16,
      distance: routeDist,
      estMinutes: estMins,
      elevation: `+${elevGain} ft`,
      elevationGainFeet: elevGain,
      safetyScore: f.safetyScore,
      sidewalkPct: f.sidewalkPct,
      litPct: f.litPct,
      traitTag: f.traitTag,
      icon: f.icon,
      color: f.color,
      path,
      maneuvers: [
        { text: `Start run heading out from ${label}`, dist: 'Start', icon: 'fa-arrow-up', note: f.traitTag },
        { text: `In 350 feet, bear right ${f.stepSuffix}`, dist: 'In 350 ft', icon: 'fa-arrow-turn-up-right', note: `${f.sidewalkPct} sidewalk verified` },
        { text: `Continue along loop perimeter for ${(routeDist * 0.45).toFixed(1)} miles`, dist: 'In 800 ft', icon: 'fa-arrow-up', note: 'Low traffic, well-lit' },
        { text: 'Turn right onto return greenway connector', dist: 'In 300 ft', icon: 'fa-arrow-right', note: 'Dedicated pedestrian corridor' },
        { text: `Approaching ${label} start line! Final 200 feet ahead.`, dist: 'In 200 ft', icon: 'fa-flag-checkered', note: 'Closing safe loop' }
      ]
    };
  });

  const generatedChoices = filterAndRankRoutesBySurface(choices, store.activeSurfaceFilter, store.lastOsmMetrics || null);
  store.currentRouteChoices = generatedChoices;
  store.selectedChoiceIndex = 0;
  store.activeRoute = store.currentRouteChoices[0];

  if (store.isNavigating) stopNavigation();
  renderRoute(store.activeRoute);
  renderRouteChoicesList();
  updateEstimatedDuration();

  // F6: Query OSM Overpass safety/surface metrics and re-rank in-place
  fetchOsmSafetyAndSurfaceMetrics(lat, lng).then((osmMetrics) => {
    store.lastOsmMetrics = osmMetrics;
    if (store.currentRouteChoices === generatedChoices) {
      applyOsmMetricsToChoices(store.currentRouteChoices, osmMetrics);
      const ranked = filterAndRankRoutesBySurface(store.currentRouteChoices, store.activeSurfaceFilter, osmMetrics);
      const orderById = new Map(ranked.map((r, idx) => [r.id, { idx, surfaceMatchScore: r.surfaceMatchScore }]));
      store.currentRouteChoices.forEach((c) => {
        const info = orderById.get(c.id);
        if (info) c.surfaceMatchScore = info.surfaceMatchScore;
      });
      store.currentRouteChoices.sort((a, b) => (orderById.get(a.id)?.idx ?? 99) - (orderById.get(b.id)?.idx ?? 99));
      const activeIdx = store.currentRouteChoices.indexOf(store.activeRoute);
      store.selectedChoiceIndex = activeIdx >= 0 ? activeIdx : 0;
      if (!store.activeRoute && store.currentRouteChoices.length > 0) {
        store.activeRoute = store.currentRouteChoices[0];
      }
      updateRouteInfoUI(store.activeRoute);
      renderRouteChoicesList();
    }
  });

  // F4: Asynchronously snap loops to real streets/trails via OSRM with distance calibration
  store.currentRouteChoices.forEach((choice) => {
    fetchStreetSnappedLoopFromOsrm(choice.path, choice.traitTag, {
      targetDistanceMiles: choice.distance
    }).then((snapped) => {
      if (store.currentRouteChoices !== generatedChoices) return;
      if (!snapped || !Array.isArray(snapped.path) || snapped.path.length < 3) return;
      choice.path = snapped.path;
      if (Number.isFinite(snapped.distanceMiles) && snapped.distanceMiles > 0) {
        choice.distance = snapped.distanceMiles;
        choice.estMinutes = Math.max(1, Math.round((snapped.distanceMiles * store.currentPaceSeconds) / 60));
      }
      if (snapped.maneuvers && snapped.maneuvers.length >= 2) {
        choice.maneuvers = snapped.maneuvers;
      }
      if (store.activeRoute === choice && !store.isNavigating) {
        renderRoute(store.activeRoute);
        renderRouteChoicesList();
      } else {
        renderRouteChoicesList();
      }
    });
  });

  return store.currentRouteChoices;
}

export function generateLoopFromCoords(lat, lng, label = 'Custom Location', targetDist = 3.1) {
  return generateMultipleLoopChoices(lat, lng, label, targetDist, 0);
}

export function zoomMapOntoCoordinate(coord, zoomLevel = 16) {
  if (!coord) return;
  if (typeof window !== 'undefined') {
    window.__preserveSpotZoomUntil = Date.now() + 2800;
  }
  if (store.googleMap) {
    store.googleMap.panTo(coord);
    store.googleMap.setZoom(zoomLevel);
  }
  const leafletMap = getLeafletMap();
  if (leafletMap) {
    leafletMap.setView([coord.lat, coord.lng], zoomLevel);
  }
}

export function locateUserRealGpsAndMapLoops() {
  if (typeof document === 'undefined') return;
  const btnLocate = document.getElementById('btnLocateMyGps');
  const fallbackCoord =
    store.currentUserGpsCoord ||
    store.activeRoute?.path?.[0] ||
    store.activeRoute?.center ||
    { lat: 41.3857, lng: -81.7058 };

  zoomMapOntoCoordinate(fallbackCoord, 16);

  if (!('geolocation' in navigator)) return;

  if (btnLocate) {
    btnLocate.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i>';
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      store.currentUserGpsCoord = { lat, lng };

      if (btnLocate) {
        btnLocate.innerHTML = '<i class="fa-solid fa-location-arrow text-xs"></i>';
      }

      const fullAddressLabel = await reverseGeocodeCoordinate(lat, lng, `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      const inputSearch = document.getElementById('inputLocationSearch');
      if (inputSearch) inputSearch.value = fullAddressLabel;

      generateMultipleLoopChoices(lat, lng, fullAddressLabel, store.currentSelectedDistance, 0);
      zoomMapOntoCoordinate({ lat, lng }, 16);
    },
    () => {
      if (btnLocate) {
        btnLocate.innerHTML = '<i class="fa-solid fa-location-arrow text-xs"></i>';
      }
      zoomMapOntoCoordinate(fallbackCoord, 16);
    },
    { enableHighAccuracy: true, timeout: 4500, maximumAge: 60000 }
  );
}

export function clearDroppedPinMarker() {
  if (store.droppedPinMarker) {
    store.droppedPinMarker.map = null;
    store.droppedPinMarker = null;
  }
  const leafletMap = getLeafletMap();
  if (leafletMap && leafletDroppedPinMarker) {
    leafletMap.removeLayer(leafletDroppedPinMarker);
    leafletDroppedPinMarker = null;
  }
}

export function clearWaypointMarker() {
  if (store.waypointMarker) {
    store.waypointMarker.map = null;
    store.waypointMarker = null;
  }
  const leafletMap = getLeafletMap();
  if (leafletMap && leafletWaypointMarker) {
    leafletMap.removeLayer(leafletWaypointMarker);
    leafletWaypointMarker = null;
  }
}

export function handleMapLongPress(latLng) {
  if (!latLng) return;
  const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
  const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;
  store.lastDroppedPinCoords = { lat, lng };

  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate([40, 60, 40]);
    } catch (_) {}
  }

  playTurnChime();

  if (store.droppedPinMarker) {
    store.droppedPinMarker.map = null;
    store.droppedPinMarker = null;
  }
  if (store.markerLib?.AdvancedMarkerElement && store.googleMap) {
    const pinEl = document.createElement('div');
    pinEl.className = 'relative flex flex-col items-center cursor-pointer';
    pinEl.innerHTML = `
      <div style="background-color:#C84B1A; width:34px; height:34px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 4px 14px rgba(200,75,26,0.6); display:flex; align-items:center; justify-content:center; color:#fff; font-size:14px; animation: bounce 1s infinite;">
        <i class="fa-solid fa-location-dot"></i>
      </div>
      <div style="width:6px; height:6px; background-color:#C84B1A; border-radius:50%; margin-top:2px;"></div>
    `;
    store.droppedPinMarker = new store.markerLib.AdvancedMarkerElement({
      map: store.googleMap,
      position: { lat, lng },
      title: 'Dropped Pin',
      content: pinEl
    });
  }

  // Leaflet fallback dropped pin parity (F17)
  const leafletMap = getLeafletMap();
  const leafletPin = getLeaflet();
  if (leafletMap && leafletPin) {
    if (leafletDroppedPinMarker) leafletMap.removeLayer(leafletDroppedPinMarker);
    const icon = leafletPin.divIcon({
      className: 'paceplot-leaflet-pin',
      html: '<div style="background-color:#C84B1A; width:26px; height:26px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 4px 12px rgba(200,75,26,0.7);"></div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
    leafletDroppedPinMarker = leafletPin.marker([lat, lng], { icon }).addTo(leafletMap);
  }

  if (typeof document !== 'undefined') {
    const coordsText = document.getElementById('droppedPinCoordsText');
    if (coordsText) {
      coordsText.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
    const promptEl = document.getElementById('droppedPinPrompt');
    if (promptEl) {
      promptEl.classList.remove('hidden');
    }
  }

  speakInstruction('Pin dropped. Choose to set as start line or route waypoint.');
}

export function updateWaypointMarker(lat, lng) {
  if (store.googleMap) {
    if (store.waypointMarker) {
      store.waypointMarker.map = null;
      store.waypointMarker = null;
    }
    if (store.markerLib?.AdvancedMarkerElement) {
      const wpElement = document.createElement('div');
      wpElement.className = 'group relative flex items-center justify-center cursor-pointer';
      wpElement.innerHTML = `
        <div style="background: linear-gradient(135deg, #0284c7, #0369a1); width:28px; height:28px; border-radius:7px; transform:rotate(45deg); border:2.5px solid #ffffff; box-shadow:0 4px 12px rgba(2,132,199,0.5); display:flex; align-items:center; justify-content:center; color:#fff; font-size:12px;">
          <i class="fa-solid fa-diamond-turn-right" style="transform:rotate(-45deg);"></i>
        </div>
        <div class="absolute -top-6 whitespace-nowrap bg-stone-900/90 text-sky-300 text-[10px] font-bold px-2 py-0.5 rounded-md shadow border border-sky-500/40 pointer-events-none">
          Waypoint
        </div>
      `;
      store.waypointMarker = new store.markerLib.AdvancedMarkerElement({
        map: store.googleMap,
        position: { lat, lng },
        title: 'Active Waypoint',
        content: wpElement
      });
    }
  }

  const leafletMap = getLeafletMap();
  const leafletWp = getLeaflet();
  if (leafletMap && leafletWp) {
    if (leafletWaypointMarker) leafletMap.removeLayer(leafletWaypointMarker);
    const icon = leafletWp.divIcon({
      className: 'paceplot-leaflet-waypoint',
      html: '<div style="background:#0284c7; width:22px; height:22px; border-radius:6px; transform:rotate(45deg); border:2px solid #ffffff;"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
    leafletWaypointMarker = leafletWp.marker([lat, lng], { icon }).addTo(leafletMap);
  }
}

export function generateLoopChoicesWithWaypoint(originLat, originLng, wpLat, wpLng, label = 'Custom Location', targetDist = 3.1, redoOffset = 0) {
  const dLatDeg = wpLat - originLat;
  const cosLat = Math.cos((originLat * Math.PI) / 180) || 1;
  const dLngDeg = (wpLng - originLng) * cosLat;

  const directDistMiles = Math.max(0.1, Math.sqrt(Math.pow(dLatDeg * 69.0, 2) + Math.pow(dLngDeg * 69.0, 2)));
  const minLoopDist = Number((directDistMiles * 2.2).toFixed(2));
  const safeTarget = Number.isFinite(Number(targetDist)) && Number(targetDist) > 0 ? Number(targetDist) : 1.5;
  const effectiveTarget = Math.max(1.55, safeTarget, minLoopDist);

  const baseBearing = Math.atan2(dLatDeg, dLngDeg);
  const perpBearing = baseBearing + Math.PI / 2;
  const wpDistDeg = Math.sqrt(dLatDeg * dLatDeg + (wpLng - originLng) * (wpLng - originLng));

  const flavors = [
    {
      titleSuffix: 'Lit Trail Loop via Waypoint',
      safetyScore: '9.9',
      sidewalkPct: '100%',
      litPct: '100%',
      gainFactor: 8.0,
      traitTag: '100% Paved Trails · Via Waypoint',
      distMultiplier: 1.0,
      icon: 'fa-tree',
      color: '#10b981',
      lateralFlank: 0.35,
      apexExtension: 0.3,
      stepSuffix: 'along illuminated park greenway'
    },
    {
      titleSuffix: 'Scenic Shoreline via Waypoint',
      safetyScore: '9.7',
      sidewalkPct: '98%',
      litPct: '95%',
      gainFactor: 9.5,
      traitTag: 'Scenic Buffer · Dedicated Paths',
      distMultiplier: 1.05,
      icon: 'fa-water',
      color: '#0284c7',
      lateralFlank: -0.38,
      apexExtension: 0.4,
      stepSuffix: 'along scenic shoreline promenade'
    },
    {
      titleSuffix: 'Quiet Residential via Waypoint',
      safetyScore: '9.8',
      sidewalkPct: '99%',
      litPct: '94%',
      gainFactor: 6.5,
      traitTag: 'Calm Cul-de-Sacs · Zero Traffic',
      distMultiplier: 0.98,
      icon: 'fa-shield-heart',
      color: '#8b5cf6',
      lateralFlank: 0.45,
      apexExtension: 0.22,
      stepSuffix: 'through tranquil neighborhood lanes'
    },
    {
      titleSuffix: 'Cardio Vista Loop via Waypoint',
      safetyScore: '9.6',
      sidewalkPct: '97%',
      litPct: '92%',
      gainFactor: 14.0,
      traitTag: 'Rolling Hills · Waypoint Apex',
      distMultiplier: 1.08,
      icon: 'fa-mountain',
      color: '#f59e0b',
      lateralFlank: -0.5,
      apexExtension: 0.5,
      stepSuffix: 'over rolling elevation overlooks'
    }
  ];

  const choices = flavors.map((f, idx) => {
    const routeDist = Number((effectiveTarget * f.distMultiplier).toFixed(2));
    const path = [];
    const flankSign = f.lateralFlank >= 0 ? 1 : -1;
    const flankDistDeg = Math.max(0.003, wpDistDeg * Math.abs(f.lateralFlank));
    const apexDistDeg = Math.max(0.003, wpDistDeg * f.apexExtension);

    path.push({ lat: Number(originLat.toFixed(6)), lng: Number(originLng.toFixed(6)) });

    const p1Angle = perpBearing + flankSign * 0.25 + redoOffset;
    path.push({
      lat: Number((originLat + dLatDeg * 0.33 + flankDistDeg * 0.55 * Math.sin(p1Angle)).toFixed(6)),
      lng: Number((originLng + (wpLng - originLng) * 0.33 + (flankDistDeg * 0.55 * Math.cos(p1Angle)) / cosLat).toFixed(6))
    });

    const p2Angle = perpBearing + flankSign * 0.15 + redoOffset;
    path.push({
      lat: Number((originLat + dLatDeg * 0.68 + flankDistDeg * 0.35 * Math.sin(p2Angle)).toFixed(6)),
      lng: Number((originLng + (wpLng - originLng) * 0.68 + (flankDistDeg * 0.35 * Math.cos(p2Angle)) / cosLat).toFixed(6))
    });

    path.push({ lat: Number(wpLat.toFixed(6)), lng: Number(wpLng.toFixed(6)) });

    const apexAngle = baseBearing + flankSign * 0.2 + redoOffset;
    path.push({
      lat: Number((wpLat + apexDistDeg * Math.sin(apexAngle)).toFixed(6)),
      lng: Number((wpLng + (apexDistDeg * Math.cos(apexAngle)) / cosLat).toFixed(6))
    });

    const returnFlankAngle = perpBearing + Math.PI - flankSign * 0.2 + redoOffset;
    path.push({
      lat: Number((wpLat + apexDistDeg * 0.7 * Math.sin(apexAngle) + flankDistDeg * 0.7 * Math.sin(returnFlankAngle)).toFixed(6)),
      lng: Number((wpLng + (apexDistDeg * 0.7 * Math.cos(apexAngle) + flankDistDeg * 0.7 * Math.cos(returnFlankAngle)) / cosLat).toFixed(6))
    });

    path.push({
      lat: Number((originLat + dLatDeg * 0.66 + flankDistDeg * 0.6 * Math.sin(returnFlankAngle)).toFixed(6)),
      lng: Number((originLng + (wpLng - originLng) * 0.66 + (flankDistDeg * 0.6 * Math.cos(returnFlankAngle)) / cosLat).toFixed(6))
    });

    path.push({
      lat: Number((originLat + dLatDeg * 0.3 + flankDistDeg * 0.4 * Math.sin(returnFlankAngle)).toFixed(6)),
      lng: Number((originLng + (wpLng - originLng) * 0.3 + (flankDistDeg * 0.4 * Math.cos(returnFlankAngle)) / cosLat).toFixed(6))
    });

    path.push({ lat: Number(originLat.toFixed(6)), lng: Number(originLng.toFixed(6)) });

    const elevGain = Math.round(18 + routeDist * f.gainFactor);
    const estTotalSeconds = routeDist * store.currentPaceSeconds;
    const estMins = Math.round(estTotalSeconds / 60);

    return {
      id: `wp-choice-${idx + 1}-${Date.now()}`,
      title: `${label} ${f.titleSuffix}`,
      flavorTitle: f.titleSuffix,
      locationName: label,
      fullAddress: label,
      flavorIndex: idx,
      center: { lat: originLat, lng: originLng },
      waypoint: { lat: wpLat, lng: wpLng },
      zoom: routeDist > 5 ? 14 : routeDist > 2 ? 15 : 16,
      distance: routeDist,
      estMinutes: estMins,
      elevation: `+${elevGain} ft`,
      elevationGainFeet: elevGain,
      safetyScore: f.safetyScore,
      sidewalkPct: f.sidewalkPct,
      litPct: f.litPct,
      traitTag: f.traitTag,
      icon: f.icon,
      color: f.color,
      path,
      maneuvers: [
        { text: 'Depart start heading towards pinned waypoint', dist: 'Start', icon: 'fa-arrow-up', note: f.traitTag },
        { text: 'Follow illuminated sidewalk corridor', dist: `In ${(directDistMiles * 0.4).toFixed(1)} mi`, icon: 'fa-arrow-up', note: `${f.sidewalkPct} sidewalk verified` },
        { text: 'Arriving at pinned waypoint checkpoint', dist: `In ${(directDistMiles * 0.6).toFixed(1)} mi`, icon: 'fa-diamond-turn-right', note: 'Selected runner waypoint' },
        { text: `Bear right ${f.stepSuffix}`, dist: 'In 300 ft', icon: 'fa-arrow-turn-up-right', note: 'Wide pedestrian buffer' },
        { text: `Continue along loop perimeter for ${(routeDist * 0.35).toFixed(1)} miles`, dist: 'In 800 ft', icon: 'fa-arrow-up', note: 'Continuous street lighting' },
        { text: 'Approaching start line! Final 200 feet ahead.', dist: 'In 200 ft', icon: 'fa-flag-checkered', note: 'Closing safe loop' }
      ]
    };
  });

  const generatedChoices = filterAndRankRoutesBySurface(choices, store.activeSurfaceFilter, store.lastOsmMetrics || null);
  store.currentRouteChoices = generatedChoices;
  store.selectedChoiceIndex = 0;
  store.activeRoute = store.currentRouteChoices[0];

  if (store.isNavigating) stopNavigation();
  renderRoute(store.activeRoute);
  renderRouteChoicesList();
  updateEstimatedDuration();

  // F5: Street-snap waypoint loops via OSRM while preserving waypoint
  store.currentRouteChoices.forEach((choice) => {
    fetchStreetSnappedLoopFromOsrm(choice.path, choice.traitTag, {
      targetDistanceMiles: choice.distance,
      preserveWaypoint: choice.waypoint
    }).then((snapped) => {
      if (store.currentRouteChoices !== generatedChoices) return;
      if (!snapped || !Array.isArray(snapped.path) || snapped.path.length < 3) return;
      choice.path = snapped.path;
      if (Number.isFinite(snapped.distanceMiles) && snapped.distanceMiles > 0) {
        choice.distance = snapped.distanceMiles;
        choice.estMinutes = Math.max(1, Math.round((snapped.distanceMiles * store.currentPaceSeconds) / 60));
      }
      if (snapped.maneuvers && snapped.maneuvers.length >= 2) {
        choice.maneuvers = snapped.maneuvers;
      }
      if (store.activeRoute === choice && !store.isNavigating) {
        renderRoute(store.activeRoute);
        renderRouteChoicesList();
      } else {
        renderRouteChoicesList();
      }
    });
  });

  return store.currentRouteChoices;
}

export function renderRouteChoicesList() {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('routeChoicesList');
  if (!container) return;

  container.innerHTML = '';
  const unitSystem = getUnitSystem();

  store.currentRouteChoices.forEach((choice, idx) => {
    const isSelected = idx === store.selectedChoiceIndex;
    const isAlreadySaved = store.savedRoutesCache.some(
      (r) => r.title === choice.title && Math.abs(Number(r.distance) - Number(choice.distance)) < 0.1
    );
    const distLabel = formatDistance(Number(choice.distance || 3.1), unitSystem);
    const gainLabel =
      choice.elevationGainFeet !== undefined
        ? formatElevation(choice.elevationGainFeet, unitSystem)
        : formatElevation(choice.elevation || '+42 ft', unitSystem);

    const card = document.createElement('div');
    card.className = isSelected
      ? 'flex-shrink-0 w-[210px] snap-start p-2 rounded-xl border-2 border-terracotta bg-terracotta/5 dark:bg-terracotta/10 cursor-pointer transition shadow-sm'
      : 'flex-shrink-0 w-[210px] snap-start p-2 rounded-xl border border-stone-200 dark:border-stone-700/80 bg-white dark:bg-stone-800/70 hover:border-stone-300 dark:hover:border-stone-600 cursor-pointer transition';

    card.innerHTML = `
      <div class="flex items-center justify-between gap-1.5">
        <div class="flex items-center gap-1.5 min-w-0">
          <div class="w-5 h-5 rounded-md flex items-center justify-center text-[10px] text-white flex-shrink-0" style="background-color: ${escapeHtml(choice.color)}">
            <i class="fa-solid ${escapeHtml(choice.icon)}"></i>
          </div>
          <span class="text-[11px] font-extrabold text-stone-900 dark:text-white truncate">${escapeHtml(choice.flavorTitle)}</span>
        </div>
        <button class="btn-choice-save w-5 h-5 rounded-md flex items-center justify-center text-[10px] transition flex-shrink-0 ${
          isAlreadySaved
            ? 'bg-emerald-500/20 text-emerald-500'
            : 'bg-stone-100 dark:bg-stone-700 text-stone-500 hover:text-terracotta'
        }" title="Save route to Library">
          <i class="fa-${isAlreadySaved ? 'solid' : 'regular'} fa-bookmark"></i>
        </button>
      </div>
      <div class="flex items-center justify-between text-[10px] text-stone-500 dark:text-stone-400 mt-1">
        <span class="font-mono font-bold text-stone-900 dark:text-stone-100">${escapeHtml(distLabel)} · ~${choice.estMinutes}m</span>
        <span>${escapeHtml(gainLabel)} · ★${escapeHtml(choice.safetyScore)}</span>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-choice-save')) return;
      store.selectedChoiceIndex = idx;
      store.activeRoute = store.currentRouteChoices[idx];
      if (store.isNavigating) stopNavigation();
      renderRoute(store.activeRoute);
      renderRouteChoicesList();
      updateSaveButtonStatus();
      speakInstruction(`Selected ${choice.flavorTitle}. ${distLabel}.`);
    });

    const saveBtn = card.querySelector('.btn-choice-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveRouteWithDeduplication(choice, saveBtn);
      });
    }

    container.appendChild(card);
  });
}

export async function saveRouteWithDeduplication(routeToSave, triggerBtn = null) {
  if (!routeToSave) return;

  if (!store.currentUser) {
    speakInstruction('Please sign in with Google in the top bar to save routes to your personal library.');
    const authBtn = document.getElementById('btnGoogleAuth') || document.getElementById('btnMobileAuth');
    if (authBtn) {
      authBtn.classList.add('ring-2', 'ring-terracotta');
      setTimeout(() => authBtn.classList.remove('ring-2', 'ring-terracotta'), 2000);
    }
    return;
  }

  const isDuplicate = store.savedRoutesCache.some(
    (r) => r.title === routeToSave.title && Math.abs(Number(r.distance) - Number(routeToSave.distance)) < 0.1
  );

  if (isDuplicate) {
    if (triggerBtn) {
      const origHtml = triggerBtn.innerHTML;
      triggerBtn.innerHTML = '<i class="fa-solid fa-check text-emerald-500"></i>';
      setTimeout(() => (triggerBtn.innerHTML = origHtml), 1500);
    }
    speakInstruction(`${routeToSave.flavorTitle || routeToSave.title} is already saved in your library.`);
    return;
  }

  try {
    await addSavedRoute({
      title: routeToSave.title,
      locationName: routeToSave.locationName || routeToSave.title,
      distance: Number(routeToSave.distance),
      elevation: routeToSave.elevation || '+42 ft',
      safetyScore: routeToSave.safetyScore || '9.8',
      sidewalkPct: routeToSave.sidewalkPct || '98%',
      litPct: routeToSave.litPct || '100%',
      traitTag: routeToSave.traitTag || 'Safe Loop',
      center: routeToSave.center,
      path: routeToSave.path,
      maneuvers: routeToSave.maneuvers
    });

    const saveLabel = document.getElementById('saveRouteToCloudLabel');
    if (saveLabel) {
      saveLabel.innerHTML = '<span class="text-emerald-500 font-bold">Saved!</span>';
    }
    if (triggerBtn) {
      triggerBtn.innerHTML = '<i class="fa-solid fa-bookmark text-emerald-500"></i>';
    }
    playTurnChime();
    speakInstruction('Route saved to your library.');
  } catch (err) {
    console.error('Error saving route:', err);
  }
}

export function updateSaveButtonStatus() {
  if (typeof document === 'undefined') return;
  const saveLabel = document.getElementById('saveRouteToCloudLabel');
  if (!saveLabel || !store.activeRoute) return;

  const currentIsSaved = store.savedRoutesCache.some(
    (r) => r.title === store.activeRoute.title && Math.abs(Number(r.distance) - Number(store.activeRoute.distance)) < 0.1
  );

  if (currentIsSaved) {
    saveLabel.innerHTML = '<span class="text-emerald-500 font-bold">Saved</span>';
  } else {
    saveLabel.textContent = 'Save';
  }
}

export function updateEstimatedDuration() {
  if (typeof document === 'undefined') return;
  const dist = store.activeRoute?.distance || store.currentSelectedDistance || 3.1;
  const totalSeconds = dist * store.currentPaceSeconds;
  const mins = Math.max(1, Math.round(totalSeconds / 60));
  const paceStr = formatPaceValue(store.currentPaceSeconds);

  const paceDisplay = document.getElementById('targetPaceDisplay');
  if (paceDisplay) paceDisplay.textContent = `${paceStr} (~${mins} min)`;

  const estDurationText = document.getElementById('estDurationText');
  if (estDurationText) estDurationText.textContent = `~${mins} min at ${paceStr}`;

  const hudTargetPaceLabel = document.getElementById('hudTargetPaceLabel');
  if (hudTargetPaceLabel) hudTargetPaceLabel.textContent = paceStr;
}

async function requestScreenWakeLock() {
  try {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && navigator.wakeLock) {
      store.wakeLockSentinel = await navigator.wakeLock.request('screen');
    }
  } catch (_) {}
}

async function releaseScreenWakeLock() {
  try {
    if (store.wakeLockSentinel) {
      await store.wakeLockSentinel.release();
      store.wakeLockSentinel = null;
    }
  } catch (_) {}
}

export function syncHudGpsModeBadge() {
  if (typeof document === 'undefined') return;
  const modeBtn = document.getElementById('btnHudToggleSimMode');
  const modeIcon = document.getElementById('hudGpsModeIcon');
  const modeText = document.getElementById('hudGpsModeText');
  if (!modeBtn || !modeIcon || !modeText) return;

  if (store.isSimulationMode) {
    modeBtn.className =
      'text-[10px] text-amber-300 font-bold flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded-lg hover:bg-amber-500/30 transition cursor-pointer';
    modeIcon.className = 'fa-solid fa-wand-magic-sparkles text-[9px]';
    modeText.textContent = 'Sim Preview';
  } else {
    modeBtn.className =
      'text-[10px] text-emerald-400 font-bold flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-lg hover:bg-emerald-500/25 transition cursor-pointer';
    modeIcon.className = 'fa-solid fa-satellite-dish text-[9px]';
    modeText.textContent = 'Live GPS';
  }
}

export function updateRunnerMapMarker(coord) {
  if (!coord) return;

  if (store.googleMap && store.markerLib?.AdvancedMarkerElement) {
    if (!store.runnerMarker) {
      const runnerDotEl = document.createElement('div');
      runnerDotEl.className = 'runner-pulse';
      runnerDotEl.innerHTML = `
        <div style="background-color:#E15A2B; width:22px; height:22px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 2px 10px rgba(225,90,43,0.9); display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px;">
          <i class="fa-solid fa-person-running"></i>
        </div>
      `;
      store.runnerMarker = new store.markerLib.AdvancedMarkerElement({
        map: store.googleMap,
        position: coord,
        title: 'Active Runner GPS Location',
        content: runnerDotEl
      });
    } else {
      store.runnerMarker.position = coord;
    }
    store.googleMap.panTo(coord);
  }

  const leafletMap = getLeafletMap();
  const leafletRunner = getLeaflet();
  if (leafletMap && leafletRunner) {
    if (!leafletRunnerMarker) {
      const icon = leafletRunner.divIcon({
        className: 'paceplot-leaflet-runner',
        html: '<div style="background-color:#E15A2B; width:18px; height:18px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 2px 8px rgba(225,90,43,0.9);"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });
      leafletRunnerMarker = leafletRunner.marker([coord.lat, coord.lng], { icon }).addTo(leafletMap);
    } else {
      leafletRunnerMarker.setLatLng([coord.lat, coord.lng]);
    }
    leafletMap.panTo([coord.lat, coord.lng]);
  }
}

export function handleRealGpsPositionUpdate(position) {
  if (!store.isNavigating || store.navIsPaused || store.isSimulationMode || !position || !position.coords) return;

  const newCoord = {
    lat: position.coords.latitude,
    lng: position.coords.longitude
  };
  store.currentUserGpsCoord = newCoord;

  updateRunnerMapMarker(newCoord);

  const moveEval = evaluateGpsFixMovement(store.lastAcceptedGpsCoord, newCoord, position.coords.accuracy);
  if (moveEval.accepted) {
    store.liveGpsDistanceMiles += moveEval.deltaMiles;
    store.lastAcceptedGpsCoord = newCoord;
    store.liveGpsBreadcrumbCoords.push(newCoord);

    if (store.googleMap && store.googleMapsLib && store.liveGpsBreadcrumbCoords.length >= 2) {
      if (!store.gpsBreadcrumbPolyline) {
        store.gpsBreadcrumbPolyline = new store.googleMapsLib.Polyline({
          path: store.liveGpsBreadcrumbCoords,
          geodesic: true,
          strokeColor: '#10b981',
          strokeOpacity: 0.95,
          strokeWeight: 5,
          zIndex: 25,
          map: store.googleMap
        });
      } else {
        store.gpsBreadcrumbPolyline.setPath(store.liveGpsBreadcrumbCoords);
      }
    }

    const leafletMap = getLeafletMap();
    const leafletBc = getLeaflet();
    if (leafletMap && leafletBc && store.liveGpsBreadcrumbCoords.length >= 2) {
      const latLngs = store.liveGpsBreadcrumbCoords.map((p) => [p.lat, p.lng]);
      if (!leafletBreadcrumbPolyline) {
        leafletBreadcrumbPolyline = leafletBc.polyline(latLngs, {
          color: '#10b981',
          opacity: 0.95,
          weight: 5
        }).addTo(leafletMap);
      } else {
        leafletBreadcrumbPolyline.setLatLngs(latLngs);
      }
    }
  }

  // F8: Off-route detection (>50m) & auto-rerouting
  if (store.activeRoute?.path?.length >= 2) {
    const offRouteEval = evaluateOffRouteDeviation(newCoord, store.activeRoute.path, 50);
    const navInstructionText = typeof document !== 'undefined' ? document.getElementById('navInstructionText') : null;
    const navSubText = typeof document !== 'undefined' ? document.getElementById('navSubText') : null;

    if (offRouteEval.isOffRoute) {
      store.isOffRoute = true;
      if (navInstructionText) navInstructionText.textContent = 'Off Route Detected — Recalculating';
      if (navSubText) {
        navSubText.textContent = `Deviated ${Math.round(offRouteEval.deviationMeters)} m from planned safe loop`;
      }
      const now = Date.now();
      if (now - (store.lastRerouteTimestamp || 0) >= 15000) {
        store.lastRerouteTimestamp = now;
        speakInstruction('Off route detected. Recalculating return path.');
        const nextPathIdx =
          offRouteEval.closestSegmentIndex >= 0
            ? Math.min(offRouteEval.closestSegmentIndex + 1, store.activeRoute.path.length - 1)
            : Math.min(store.navStepIndex + 1, store.activeRoute.path.length - 1);
        const targetNext =
          store.activeRoute.path[nextPathIdx] ||
          store.activeRoute.center ||
          newCoord;
        const finishPt = store.activeRoute.center || store.activeRoute.path[0] || newCoord;
        const routeDistMiles = Number.isFinite(Number(store.activeRoute.distance))
          ? Number(store.activeRoute.distance)
          : 3.1;
        fetchStreetSnappedLoopFromOsrm([newCoord, targetNext, finishPt], store.activeRoute.traitTag, {
          targetDistanceMiles: Math.max(0.5, routeDistMiles - (Number(store.liveGpsDistanceMiles) || 0))
        }).then((snapped) => {
          if (snapped?.path?.length >= 3 && store.isNavigating) {
            store.activeRoute.path = snapped.path;
            if (snapped.maneuvers?.length >= 2) {
              store.activeRoute.maneuvers = snapped.maneuvers;
              store.navStepIndex = 0;
            }
            renderRoute(store.activeRoute);
          }
        });
      }
    } else if (store.isOffRoute) {
      store.isOffRoute = false;
    }
  }

  // Throttled live SafeGuard Beacon sync (F14)
  if (Date.now() - lastBeaconSyncMs >= 10000) {
    lastBeaconSyncMs = Date.now();
    void syncLiveBeaconSession({ active: true });
  }

  if (typeof document === 'undefined') return;
  const unitSystem = getUnitSystem();
  const hudDistance = document.getElementById('hudDistance');
  const hudPace = document.getElementById('hudPace');
  const hudPaceStatus = document.getElementById('hudPaceStatus');
  const healthCalories = document.getElementById('healthCalories');

  if (hudDistance) {
    hudDistance.textContent = formatDistance(store.liveGpsDistanceMiles, unitSystem);
  }

  const livePace = computeLiveGpsPace(store.liveGpsDistanceMiles, store.navSecondsElapsed, position.coords.speed);
  if (hudPace) {
    hudPace.textContent = livePace.secondsPerMile
      ? formatPaceValue(livePace.secondsPerMile, unitSystem, false)
      : formatPaceValue(store.currentPaceSeconds, unitSystem, false);
  }
  if (hudPaceStatus && livePace.secondsPerMile) {
    const diff = livePace.secondsPerMile - store.currentPaceSeconds;
    if (Math.abs(diff) <= 15) {
      hudPaceStatus.className = 'font-bold text-emerald-400 flex items-center gap-1';
      hudPaceStatus.innerHTML = '<i class="fa-solid fa-circle-check text-[10px]"></i><span>On Pace</span>';
    } else if (diff < -15) {
      hudPaceStatus.className = 'font-bold text-sky-400 flex items-center gap-1';
      hudPaceStatus.innerHTML = '<i class="fa-solid fa-bolt text-[10px]"></i><span>Ahead of Pace</span>';
    } else {
      hudPaceStatus.className = 'font-bold text-amber-400 flex items-center gap-1';
      hudPaceStatus.innerHTML = '<i class="fa-solid fa-gauge-high text-[10px]"></i><span>Push Pace</span>';
    }
  }

  if (healthCalories && store.liveGpsDistanceMiles > 0) {
    const burned = Math.round(store.liveGpsDistanceMiles * 105);
    healthCalories.innerHTML = `${burned} <span class="text-[10px] font-sans font-normal text-stone-400">kcal</span>`;
  }

  const maneuvers = store.activeRoute?.maneuvers || [];
  const nextStepIdx = store.navStepIndex + 1;
  if (nextStepIdx < maneuvers.length) {
    const nextManeuver = maneuvers[nextStepIdx];
    const targetPt =
      nextManeuver.lat && nextManeuver.lng
        ? { lat: nextManeuver.lat, lng: nextManeuver.lng }
        : store.activeRoute.path[Math.min(nextStepIdx, store.activeRoute.path.length - 1)];

    if (targetPt) {
      const distMeters = haversineDistanceMeters(newCoord, targetPt);
      const navDistanceToTurn = document.getElementById('navDistanceToTurn');
      if (navDistanceToTurn) {
        navDistanceToTurn.textContent = formatShortDistance(distMeters, unitSystem);
      }

      if (distMeters <= 35) {
        store.navStepIndex = nextStepIdx;
        updateNavStep(store.navStepIndex, false, true);
      }
    }
  }
}

export function startNavigation() {
  store.isNavigating = true;
  store.navIsPaused = false;
  store.navSecondsElapsed = 0;
  store.navStepIndex = 0;
  store.liveGpsDistanceMiles = 0;
  store.lastAcceptedGpsCoord = null;
  store.liveGpsBreadcrumbCoords = [];
  store.isOffRoute = false;
  store.lastRerouteTimestamp = 0;

  if (store.gpsBreadcrumbPolyline) {
    store.gpsBreadcrumbPolyline.setMap(null);
    store.gpsBreadcrumbPolyline = null;
  }
  const leafletMap = getLeafletMap();
  if (leafletMap && leafletBreadcrumbPolyline) {
    leafletMap.removeLayer(leafletBreadcrumbPolyline);
    leafletBreadcrumbPolyline = null;
  }

  if (store.audioCtx && store.audioCtx.state === 'suspended') {
    store.audioCtx.resume();
  }
  void requestScreenWakeLock();
  void syncLiveBeaconSession({ active: true, sosActive: false });
  lastBeaconSyncMs = Date.now();

  setSheetCollapsed(true);

  if (typeof document !== 'undefined') {
    const btnNavIcon = document.getElementById('btnNavIcon');
    const btnNavLabel = document.getElementById('btnNavLabel');
    const compactBtnIcon = document.getElementById('compactBtnNavIcon');
    const navCard = document.getElementById('navInstructionCard');
    const mapSpotifyPill = document.getElementById('mapSpotifyFloatingPill');
    const hudPauseIcon = document.getElementById('hudPauseIcon');
    const hudPauseText = document.getElementById('hudPauseText');
    const hudDistance = document.getElementById('hudDistance');
    const hudTimer = document.getElementById('hudTimer');

    if (btnNavIcon) btnNavIcon.className = 'fa-solid fa-circle-stop text-sm text-rose-300';
    if (btnNavLabel) btnNavLabel.textContent = 'End Navigation';
    if (compactBtnIcon) compactBtnIcon.className = 'fa-solid fa-circle-play text-rose-300';
    if (navCard) navCard.classList.remove('hidden');
    if (mapSpotifyPill) mapSpotifyPill.classList.add('hidden');
    if (hudPauseIcon) hudPauseIcon.className = 'fa-solid fa-pause text-amber-400 text-[11px]';
    if (hudPauseText) hudPauseText.textContent = 'Pause';
    if (hudDistance) hudDistance.textContent = formatDistance(0);
    if (hudTimer) hudTimer.textContent = '00:00';
  }

  syncHudGpsModeBadge();
  updateNavStep(0, true, !store.isSimulationMode);

  if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
    if (store.gpsWatchId !== null) {
      navigator.geolocation.clearWatch(store.gpsWatchId);
    }
    store.gpsWatchId = navigator.geolocation.watchPosition(
      handleRealGpsPositionUpdate,
      (err) => console.warn('[GPS] watchPosition warning:', err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  }

  clearInterval(store.navInterval);
  store.navInterval = setInterval(() => {
    if (store.navIsPaused) return;

    store.navSecondsElapsed += 1;
    const hrs = Math.floor(store.navSecondsElapsed / 3600);
    const mins = Math.floor((store.navSecondsElapsed % 3600) / 60)
      .toString()
      .padStart(2, '0');
    const secs = (store.navSecondsElapsed % 60).toString().padStart(2, '0');
    const hudTimer = typeof document !== 'undefined' ? document.getElementById('hudTimer') : null;
    if (hudTimer) {
      hudTimer.textContent = hrs > 0 ? `${hrs}:${mins}:${secs}` : `${mins}:${secs}`;
    }

    if (store.isSimulationMode && store.navSecondsElapsed % 6 === 0) {
      store.navStepIndex++;
      if (store.navStepIndex >= store.activeRoute.maneuvers.length) {
        const totalMins = Math.floor(store.navSecondsElapsed / 60);
        const totalSecs = store.navSecondsElapsed % 60;
        const timeBrief = totalMins > 0 ? `${totalMins} minutes ${totalSecs} seconds` : `${totalSecs} seconds`;
        const distBrief = formatDistance(store.activeRoute.distance);
        stopNavigation();
        speakInstruction(`Route preview completed for ${distBrief} safe loop in ${timeBrief}.`, {
          haptic: [80, 80, 80, 80, 150]
        });
        return;
      }
      updateNavStep(store.navStepIndex, false, false);
    }
  }, 1000);
}

export function stopNavigation() {
  store.isNavigating = false;
  store.navIsPaused = false;
  store.isOffRoute = false;
  clearInterval(store.navInterval);
  if (store.gpsWatchId !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(store.gpsWatchId);
    store.gpsWatchId = null;
  }
  void releaseScreenWakeLock();
  void syncLiveBeaconSession({ active: false });

  if (typeof document !== 'undefined') {
    const btnNavIcon = document.getElementById('btnNavIcon');
    const btnNavLabel = document.getElementById('btnNavLabel');
    const compactBtnIcon = document.getElementById('compactBtnNavIcon');
    const navCard = document.getElementById('navInstructionCard');
    const mapSpotifyPill = document.getElementById('mapSpotifyFloatingPill');
    const hudPauseIcon = document.getElementById('hudPauseIcon');
    const hudPauseText = document.getElementById('hudPauseText');
    const runnerDot = document.getElementById('elevRunnerDot');

    if (btnNavIcon) btnNavIcon.className = 'fa-solid fa-circle-play text-sm';
    if (btnNavLabel) btnNavLabel.textContent = 'Start Safe Voice Nav';
    if (compactBtnIcon) compactBtnIcon.className = 'fa-solid fa-circle-play';
    if (navCard) navCard.classList.add('hidden');
    if (mapSpotifyPill) mapSpotifyPill.classList.remove('hidden');
    if (hudPauseIcon) hudPauseIcon.className = 'fa-solid fa-pause text-amber-400 text-[11px]';
    if (hudPauseText) hudPauseText.textContent = 'Pause';
    if (runnerDot) {
      runnerDot.setAttribute('cx', '12');
      runnerDot.setAttribute('cy', '32');
    }
  }

  if (store.runnerMarker) {
    store.runnerMarker.map = null;
    store.runnerMarker = null;
  }
  const leafletMap = getLeafletMap();
  if (leafletMap && leafletRunnerMarker) {
    leafletMap.removeLayer(leafletRunnerMarker);
    leafletRunnerMarker = null;
  }

  const recordedMiles =
    store.liveGpsDistanceMiles >= 0.05
      ? Number(store.liveGpsDistanceMiles.toFixed(2))
      : Number(store.activeRoute.distance || store.currentSelectedDistance || 3.1);

  if (store.navSecondsElapsed >= 5) {
    const livePace = computeLiveGpsPace(recordedMiles, store.navSecondsElapsed);
    const workoutData = {
      routeTitle: store.activeRoute.title,
      distance: recordedMiles,
      durationSeconds: store.navSecondsElapsed,
      avgPace: livePace.secondsPerMile ? livePace.formatted : store.currentTargetPace,
      avgHeartRate: store.currentLiveSensorHr || 148,
      calories: Math.max(12, Math.round(recordedMiles * 105)),
      completedAt: new Date().toISOString()
    };
    evaluateBadgesFromWorkouts([workoutData], { weather: store.currentWeatherData }, (badge) => {
      playTurnChime();
      speakInstruction(`Achievement unlocked: ${badge.title} badge! ${badge.subtitle}`);
    });
    store.historicalWorkoutsCache = [workoutData, ...store.historicalWorkoutsCache];
    if (typeof onWorkoutsUpdatedCallback === 'function') {
      onWorkoutsUpdatedCallback();
    }

    const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    if (store.currentUser && isOnline) {
      addRunActivity(workoutData).catch(() => {
        void enqueueOfflineWorkout(workoutData);
      });
    } else {
      void enqueueOfflineWorkout(workoutData);
    }
  }
}

export function updateNavStep(index, isFirstStep = false, isRealGpsMode = true) {
  const maneuvers = store.activeRoute?.maneuvers;
  if (!Array.isArray(maneuvers) || maneuvers.length === 0) return;
  const m = maneuvers[index % maneuvers.length];

  const unitSystem = getUnitSystem();
  const displayDist = unitSystem === 'metric' ? formatManeuverDistDisplay(m, unitSystem) : (m.dist || '');
  if (typeof document !== 'undefined') {
    const navInstructionText = document.getElementById('navInstructionText');
    const navSubText = document.getElementById('navSubText');
    const navDistanceToTurn = document.getElementById('navDistanceToTurn');
    const navTurnIcon = document.getElementById('navTurnIcon');
    const hudDistance = document.getElementById('hudDistance');
    const hudPace = document.getElementById('hudPace');
    const hudHR = document.getElementById('hudHR');
    const runnerDot = document.getElementById('elevRunnerDot');

    if (navInstructionText) navInstructionText.textContent = m.text;
    if (navSubText) navSubText.textContent = m.note;
    if (navDistanceToTurn) navDistanceToTurn.textContent = displayDist;
    if (navTurnIcon) navTurnIcon.className = `fa-solid ${m.icon}`;

    if (runnerDot) {
      const fraction = Math.min(1, Math.max(0, (index + 1) / maneuvers.length));
      const svgPoints = store.activeRoute?.svgPoints;
      if (Array.isArray(svgPoints) && svgPoints.length > 0) {
        const ptIdx = Math.min(svgPoints.length - 1, Math.round(fraction * (svgPoints.length - 1)));
        const pt = svgPoints[ptIdx];
        runnerDot.setAttribute('cx', pt.x.toFixed(1));
        runnerDot.setAttribute('cy', pt.y.toFixed(1));
      } else {
        const cx = 12 + fraction * (288 - 12);
        runnerDot.setAttribute('cx', cx.toFixed(1));
      }
    }

    if (!isRealGpsMode) {
      const distDone = (index + 1) * (store.activeRoute.distance / maneuvers.length);
      if (hudDistance) hudDistance.textContent = formatDistance(distDone, unitSystem);
      if (hudPace) hudPace.textContent = formatPaceValue(store.currentPaceSeconds, unitSystem, false);
    }
    if (hudHR) {
      if (!store.isBleHrConnected) {
        store.currentLiveSensorHr = 144 + index * 2;
      }
      hudHR.textContent = `${store.currentLiveSensorHr} bpm`;
      if (typeof onWorkoutsUpdatedCallback === 'function') {
        onWorkoutsUpdatedCallback();
      }
    }
  }

  let speechText = '';
  let hapticPattern = [50, 60, 50];

  if (isFirstStep) {
    const distBrief = formatDistance(store.activeRoute.distance, unitSystem);
    const paceBrief = formatPaceValue(store.currentPaceSeconds, unitSystem);
    speechText = `Live GPS tracking active on ${store.activeRoute.title}. Target distance: ${distBrief} at ${paceBrief} pace. ${m.text}. ${m.note || ''}`;
    hapticPattern = [70, 80, 70];
  } else {
    speechText = `${displayDist ? displayDist + ', ' : ''}${m.text}. ${m.note ? m.note + '.' : ''}`;
    if (m.icon && (m.icon.includes('turn-up-right') || m.icon.includes('arrow-right'))) {
      hapticPattern = [50, 60, 50];
    } else if (m.icon && m.icon.includes('arrow-left')) {
      hapticPattern = [100, 60, 50];
    } else if (m.icon && m.icon.includes('flag')) {
      hapticPattern = [80, 80, 80, 80, 120];
    }
  }

  speakInstruction(speechText, { haptic: hapticPattern });

  const pathPoints = Array.isArray(store.activeRoute?.path) ? store.activeRoute.path : [];
  if (pathPoints.length > 0) {
    const ptIndex = Math.min(index, pathPoints.length - 1);
    const curPoint = store.currentUserGpsCoord && isRealGpsMode ? store.currentUserGpsCoord : pathPoints[ptIndex];
    updateRunnerMapMarker(curPoint);
  } else if (store.currentUserGpsCoord && isRealGpsMode) {
    updateRunnerMapMarker(store.currentUserGpsCoord);
  }
}

export function setSheetCollapsed(collapsed) {
  store.isSheetCollapsed = collapsed;
  if (typeof document === 'undefined') return;
  const sheet = document.getElementById('planningSheet');
  const fullContent = document.getElementById('sheetFullContent');
  const compactContent = document.getElementById('sheetCompactBar');
  const toggleIcon = document.getElementById('sheetToggleIcon');
  const settingsSheetStatus = document.getElementById('settingsSheetStatus');

  if (collapsed) {
    if (fullContent) fullContent.classList.add('hidden');
    if (compactContent) compactContent.classList.remove('hidden');
    if (toggleIcon) toggleIcon.className = 'fa-solid fa-chevron-up text-xs text-stone-400';
    if (settingsSheetStatus) {
      settingsSheetStatus.textContent = 'Minimized';
      settingsSheetStatus.className = 'text-[9px] font-mono text-emerald-500 font-bold';
    }
    if (sheet) {
      sheet.classList.remove('p-4');
      sheet.classList.add('p-3');
    }
  } else {
    if (fullContent) fullContent.classList.remove('hidden');
    if (compactContent) compactContent.classList.add('hidden');
    if (toggleIcon) toggleIcon.className = 'fa-solid fa-chevron-down text-xs text-stone-400';
    if (settingsSheetStatus) {
      settingsSheetStatus.textContent = 'Expanded';
      settingsSheetStatus.className = 'text-[9px] font-mono text-stone-400';
    }
    if (sheet) {
      sheet.classList.add('p-3.5');
      sheet.classList.remove('p-3');
    }
  }

  setTimeout(() => {
    if (store.googleMap && window.google?.maps?.event) {
      window.google.maps.event.trigger(store.googleMap, 'resize');
      fitRouteBounds(store.activeRoute);
    }
    const leafletMap = getLeafletMap();
    if (leafletMap) {
      leafletMap.invalidateSize();
      fitRouteBounds(store.activeRoute);
    }
  }, 150);
}

export function setupMapAndRouteHandlers() {
  if (typeof document === 'undefined') return;

  // Surface filter pills (F6)
  const surfaceBtns = document.querySelectorAll('.surface-filter-btn');
  surfaceBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      surfaceBtns.forEach((b) => {
        b.classList.remove('bg-terracotta', 'text-white', 'border-terracotta');
        b.classList.add(
          'bg-white',
          'dark:bg-stone-800',
          'text-stone-700',
          'dark:text-stone-300',
          'border-stone-300',
          'dark:border-stone-700'
        );
      });
      btn.classList.add('bg-terracotta', 'text-white', 'border-terracotta');
      btn.classList.remove('bg-white', 'dark:bg-stone-800', 'text-stone-700', 'dark:text-stone-300');

      store.activeSurfaceFilter = btn.getAttribute('data-surface') || 'trail';
      if (store.currentRouteChoices.length > 0) {
        const ranked = filterAndRankRoutesBySurface(
          store.currentRouteChoices,
          store.activeSurfaceFilter,
          store.lastOsmMetrics || null
        );
        store.currentRouteChoices = ranked;
        store.selectedChoiceIndex = 0;
        store.activeRoute = ranked[0];
        renderRoute(store.activeRoute);
        renderRouteChoicesList();
      } else {
        renderRoute(store.activeRoute);
      }
    });
  });

  // Location Preset Selector
  const presetSelect = document.getElementById('locationPreset');
  if (presetSelect) {
    presetSelect.addEventListener('change', (e) => {
      const key = e.target.value;
      if (ROUTES[key]) {
        if (store.isNavigating) stopNavigation();
        store.activeKey = key;
        store.activeWaypointCoords = null;
        if (store.waypointMarker) {
          store.waypointMarker.map = null;
          store.waypointMarker = null;
        }
        if (store.droppedPinMarker) {
          store.droppedPinMarker.map = null;
          store.droppedPinMarker = null;
        }
        const leafletMap = getLeafletMap();
        if (leafletMap) {
          if (leafletWaypointMarker) {
            leafletMap.removeLayer(leafletWaypointMarker);
            leafletWaypointMarker = null;
          }
          if (leafletDroppedPinMarker) {
            leafletMap.removeLayer(leafletDroppedPinMarker);
            leafletDroppedPinMarker = null;
          }
        }
        const promptEl = document.getElementById('droppedPinPrompt');
        if (promptEl) promptEl.classList.add('hidden');

        const targetRoute = ROUTES[key];
        generateMultipleLoopChoices(
          targetRoute.center.lat,
          targetRoute.center.lng,
          targetRoute.locationName || targetRoute.title,
          store.currentSelectedDistance
        );
        speakInstruction(`Loaded 4 safe route choices in ${targetRoute.locationName || key}.`);
      }
    });
  }

  // Locate My Real GPS button
  const btnLocateMyGps = document.getElementById('btnLocateMyGps');
  if (btnLocateMyGps) {
    btnLocateMyGps.addEventListener('click', () => locateUserRealGpsAndMapLoops());
  }

  // Recenter button (Google Maps + Leaflet parity)
  const recenterBtn = document.getElementById('btnRecenter');
  if (recenterBtn) {
    recenterBtn.addEventListener('click', () => {
      const targetPt =
        store.activeRoute?.path?.[0] ||
        store.activeRoute?.center ||
        store.currentUserGpsCoord ||
        { lat: 41.3857, lng: -81.7058 };
      fitRouteBounds(store.activeRoute);
      if (store.googleMap) {
        store.googleMap.panTo(targetPt);
        if ((store.googleMap.getZoom() || 15) < 15) {
          store.googleMap.setZoom(15);
        }
      }
      const leafletMap = getLeafletMap();
      if (leafletMap) {
        leafletMap.panTo([targetPt.lat, targetPt.lng]);
        if (leafletMap.getZoom() < 15) {
          leafletMap.setZoom(15);
        }
      }
    });
  }

  // Toggle Satellite View (Google Maps + Leaflet parity)
  const btnToggleSatellite = document.getElementById('btnToggleSatellite');
  const settingsSatelliteStatus = document.getElementById('settingsSatelliteStatus');
  if (btnToggleSatellite) {
    btnToggleSatellite.addEventListener('click', () => {
      store.isSatellite = !store.isSatellite;
      if (store.googleMap) {
        store.googleMap.setMapTypeId(store.isSatellite ? 'hybrid' : 'roadmap');
      }
      const leafletMap = getLeafletMap();
      const leafletSat = getLeaflet();
      if (leafletMap && leafletSat) {
        if (leafletTileLayer) leafletMap.removeLayer(leafletTileLayer);
        leafletTileLayer = leafletSat.tileLayer(
          store.isSatellite
            ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          { maxZoom: 19 }
        ).addTo(leafletMap);
      }
      btnToggleSatellite.classList.toggle('border-sky-500', store.isSatellite);
      btnToggleSatellite.classList.toggle('bg-sky-500/10', store.isSatellite);
      if (settingsSatelliteStatus) {
        settingsSatelliteStatus.textContent = store.isSatellite ? 'Hybrid On' : 'Roadmap';
        settingsSatelliteStatus.className = store.isSatellite
          ? 'text-[9px] font-mono text-sky-400 font-bold'
          : 'text-[9px] font-mono text-stone-400';
      }
    });
  }

  // Toggle Safety Heatmap Glow (Google Maps + Leaflet parity)
  const heatmapBtn = document.getElementById('btnToggleSafetyHeatmap');
  const settingsHeatmapStatus = document.getElementById('settingsHeatmapStatus');
  if (heatmapBtn) {
    heatmapBtn.addEventListener('click', () => {
      store.isHeatmapActive = !store.isHeatmapActive;
      if (store.routeGlowPolyline) {
        store.routeGlowPolyline.setOptions({ strokeOpacity: store.isHeatmapActive ? 0.35 : 0.05 });
      }
      if (leafletGlowPolyline) {
        leafletGlowPolyline.setStyle({ opacity: store.isHeatmapActive ? 0.35 : 0.05 });
      }
      heatmapBtn.classList.toggle('opacity-60', !store.isHeatmapActive);
      if (settingsHeatmapStatus) {
        settingsHeatmapStatus.textContent = store.isHeatmapActive ? 'Active' : 'Hidden';
        settingsHeatmapStatus.className = store.isHeatmapActive
          ? 'text-[9px] font-mono text-emerald-500 font-bold'
          : 'text-[9px] font-mono text-stone-400';
      }
    });
  }

  // Expand Map Fullscreen button inside Settings modal
  const btnMaximizeMap = document.getElementById('btnMaximizeMap');
  if (btnMaximizeMap) {
    btnMaximizeMap.addEventListener('click', () => setSheetCollapsed(!store.isSheetCollapsed));
  }

  // GPX Export Download (F7: real elevation tags via buildRouteGpxString)
  const exportGpxBtn = document.getElementById('btnExportGpx');
  const toastEl = document.getElementById('exportStatusToast');
  if (exportGpxBtn) {
    exportGpxBtn.addEventListener('click', async () => {
      if (!store.activeRoute) return;
      if (!store.activeRoute.elevationsMeters) {
        await updateElevationChartSVG(store.activeRoute);
      }
      const gpxString = buildRouteGpxString(store.activeRoute, store.activeRoute.elevationsMeters || null);
      const blob = new Blob([gpxString], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = `${store.activeKey}_pace_plot_route.gpx`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(url);

      if (toastEl) {
        toastEl.classList.remove('hidden');
        setTimeout(() => toastEl.classList.add('hidden'), 3000);
      }
    });
  }
}
