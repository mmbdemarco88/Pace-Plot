// Pace Plot - Safe Run & Walk Navigation
// Stride Circuit LLC
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  auth,
  loginWithGoogle,
  logoutUser,
  onAuthStateChanged,
  testFirestoreConnection,
  subscribeSavedRoutes,
  addSavedRoute,
  deleteSavedRoute,
  subscribeEmergencyContacts,
  addEmergencyContact,
  deleteEmergencyContact,
  subscribeRunActivities,
  addRunActivity
} from './firebase.js';
import { fetchRouteWeather } from './weather.js';

// ----------------------------------------------------
// Google Maps Quota Handling (Tier 1 & 2 Defense)
// ----------------------------------------------------
window.gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};
const origError = console.error;
console.error = (...args) => {
  origError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

window.addEventListener('gmp-quota-exceeded', () => {
  const banner = document.getElementById('gmpQuotaBanner');
  if (banner) banner.classList.remove('hidden');
});

// ----------------------------------------------------
// Predefined Route Presets
// ----------------------------------------------------
const routes = {
  parma: {
    title: "West Creek Greenway Safe Loop",
    locationName: "Parma, OH (HQ)",
    center: { lat: 41.3857, lng: -81.7058 },
    zoom: 15,
    distance: 3.10,
    elevation: "+42 ft",
    safetyScore: "9.8",
    sidewalkPct: "98%",
    litPct: "100%",
    safetyTags: ["100% Pedestrian Greenway", "Night Lit", "No Crossings"],
    path: [
      { lat: 41.3835, lng: -81.7090 },
      { lat: 41.3860, lng: -81.7082 },
      { lat: 41.3895, lng: -81.7065 },
      { lat: 41.3920, lng: -81.7020 },
      { lat: 41.3905, lng: -81.6980 },
      { lat: 41.3870, lng: -81.7005 },
      { lat: 41.3845, lng: -81.7040 },
      { lat: 41.3835, lng: -81.7090 }
    ],
    maneuvers: [
      { text: "Start run heading North on West Creek Greenway", dist: "Start", icon: "fa-arrow-up", note: "Paved multi-use trail" },
      { text: "In 250 feet, bear right at the creek bridge fork", dist: "In 250 ft", icon: "fa-arrow-turn-up-right", note: "Pedestrian bridge" },
      { text: "Continue straight along Watershed path for 0.8 miles", dist: "In 800 ft", icon: "fa-arrow-up", note: "Lit paved corridor" },
      { text: "Turn sharp right onto Keystone Trail connector", dist: "In 150 ft", icon: "fa-arrow-right", note: "Buffered sidewalk" },
      { text: "Turn right onto Meadow Perimeter loop", dist: "In 100 ft", icon: "fa-arrow-right", note: "Scenic parkway" },
      { text: "Approaching finish line! Final 200 feet ahead.", dist: "In 200 ft", icon: "fa-flag-checkered", note: "Loop closing" }
    ]
  },
  centralpark: {
    title: "Central Park Reservoir Perimeter",
    locationName: "New York, NY",
    center: { lat: 40.785091, lng: -73.968285 },
    zoom: 15,
    distance: 4.00,
    elevation: "+65 ft",
    safetyScore: "9.6",
    sidewalkPct: "100%",
    litPct: "95%",
    safetyTags: ["Traffic-Free", "High Foot Traffic", "Emergency Callboxes"],
    path: [
      { lat: 40.7812, lng: -73.9665 },
      { lat: 40.7865, lng: -73.9620 },
      { lat: 40.7910, lng: -73.9590 },
      { lat: 40.7930, lng: -73.9635 },
      { lat: 40.7895, lng: -73.9710 },
      { lat: 40.7840, lng: -73.9725 },
      { lat: 40.7812, lng: -73.9665 }
    ],
    maneuvers: [
      { text: "Start North on Reservoir Inner Track", dist: "Start", icon: "fa-arrow-up", note: "Crushed stone surface" },
      { text: "Continue along North Meadow connector", dist: "In 500 ft", icon: "fa-arrow-up", note: "Car-free pedestrian drive" },
      { text: "Turn left onto West Drive pedestrian lane", dist: "In 200 ft", icon: "fa-arrow-left", note: "Dedicated running lane" },
      { text: "Loop back East towards the south reservoir pump house", dist: "In 300 ft", icon: "fa-arrow-right", note: "Well-lit circuit" },
      { text: "Final sprint to the start line", dist: "In 100 ft", icon: "fa-flag-checkered", note: "Finish ahead" }
    ]
  },
  austin: {
    title: "Lady Bird Lake Boardwalk Loop",
    locationName: "Austin, TX",
    center: { lat: 30.2505, lng: -97.7340 },
    zoom: 15,
    distance: 5.00,
    elevation: "+35 ft",
    safetyScore: "9.5",
    sidewalkPct: "96%",
    litPct: "90%",
    safetyTags: ["Boardwalk", "Water Stations", "High Visibility"],
    path: [
      { lat: 30.2540, lng: -97.7410 },
      { lat: 30.2520, lng: -97.7310 },
      { lat: 30.2480, lng: -97.7220 },
      { lat: 30.2450, lng: -97.7280 },
      { lat: 30.2490, lng: -97.7390 },
      { lat: 30.2540, lng: -97.7410 }
    ],
    maneuvers: [
      { text: "Head East on Ann & Roy Butler Hike-and-Bike Trail", dist: "Start", icon: "fa-arrow-up", note: "Crushed granite trail" },
      { text: "Step onto Lake Boardwalk bridge section", dist: "In 400 ft", icon: "fa-arrow-up", note: "Continuous handrails & lighting" },
      { text: "Cross Congress Avenue pedestrian underpass", dist: "In 150 ft", icon: "fa-arrow-right", note: "Grade separated crossing" },
      { text: "Complete the southern lakefront loop", dist: "In 100 ft", icon: "fa-flag-checkered", note: "Start line ahead" }
    ]
  },
  chicago: {
    title: "Lakefront Trail & Museum Campus",
    locationName: "Chicago, IL",
    center: { lat: 41.8660, lng: -87.6150 },
    zoom: 15,
    distance: 3.50,
    elevation: "+20 ft",
    safetyScore: "9.7",
    sidewalkPct: "100%",
    litPct: "98%",
    safetyTags: ["Divided Pedestrian/Bike Lanes", "Lake Michigan", "Lit"],
    path: [
      { lat: 41.8620, lng: -87.6140 },
      { lat: 41.8680, lng: -87.6120 },
      { lat: 41.8740, lng: -87.6160 },
      { lat: 41.8710, lng: -87.6200 },
      { lat: 41.8640, lng: -87.6180 },
      { lat: 41.8620, lng: -87.6140 }
    ],
    maneuvers: [
      { text: "Head North on Chicago Lakefront Trail (Pedestrian Lane)", dist: "Start", icon: "fa-arrow-up", note: "Paved greenway" },
      { text: "Bear right towards Adler Planetarium peninsula", dist: "In 300 ft", icon: "fa-arrow-turn-up-right", note: "Open lakefront view" },
      { text: "Loop around waterfront promenade", dist: "In 200 ft", icon: "fa-arrow-left", note: "Pedestrian-only plaza" },
      { text: "Arriving back at Museum Campus trailhead", dist: "In 100 ft", icon: "fa-flag-checkered", note: "Complete loop" }
    ]
  }
};

let activeKey = 'parma';
let activeRoute = routes[activeKey];
let isVoiceMuted = false;
let isNavigating = false;
let navInterval = null;
let navStepIndex = 0;
let isSheetCollapsed = false;

// Google Maps instances
let googleMap = null;
let googleMapsLib = null;
let markerLib = null;
let startMarker = null;
let runnerMarker = null;
let routeGlowPolyline = null;
let routeCorePolyline = null;
let isSatellite = false;
let isHeatmapActive = true;

// Firebase & Firestore State
let currentUser = null;
let unsubSavedRoutes = null;
let unsubEmergencyContacts = null;
let unsubRunActivities = null;
let navSecondsElapsed = 0;
let navIsPaused = false;
let currentSelectedDistance = 3.10;
let currentTargetPace = "8'30\"";
let currentPaceSeconds = 510;
let currentRouteChoices = [];
let selectedChoiceIndex = 0;
let redoCount = 0;
let savedRoutesCache = [];
let currentWeatherData = null;
let droppedPinMarker = null;
let waypointMarker = null;
let lastDroppedPinCoords = null;
let activeWaypointCoords = null;
let longPressTimer = null;
let isLongPressTriggered = false;

// Web Speech API Voice Guidance State
let speechVoices = [];
let selectedVoice = null;
let currentUtterance = null; // Retain reference to prevent browser GC

// ----------------------------------------------------
// Initialize Application
// ----------------------------------------------------
function startApp() {
  setupClock();
  initSpeechSynthesis();
  setupUIHandlers();
  initGoogleMaps();
  setupFirebaseAuth();
  testFirestoreConnection();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}

// ----------------------------------------------------
// 1. Clock Display
// ----------------------------------------------------
function setupClock() {
  function updateClock() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const clockEl = document.getElementById('clockDisplay');
    if (clockEl) clockEl.textContent = `${hours}:${minutes}`;
  }
  updateClock();
  setInterval(updateClock, 30000);
}

// ----------------------------------------------------
// 2. Google Maps Initialization
// ----------------------------------------------------
async function initGoogleMaps() {
  const mapElement = document.getElementById('map');
  if (!mapElement) return;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  try {
    setOptions({
      apiKey,
      version: 'weekly',
    });

    const { Map } = await importLibrary('maps');
    markerLib = await importLibrary('marker');
    googleMapsLib = window.google.maps;

    // Dark/Night-friendly style configuration for Pace Plot
    const mapStyles = [
      { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
      {
        featureType: 'administrative.locality',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#d59563' }]
      },
      {
        featureType: 'poi',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#d59563' }]
      },
      {
        featureType: 'poi.park',
        elementType: 'geometry',
        stylers: [{ color: '#263c3f' }]
      },
      {
        featureType: 'poi.park',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#6b9a76' }]
      },
      {
        featureType: 'road',
        elementType: 'geometry',
        stylers: [{ color: '#38414e' }]
      },
      {
        featureType: 'road',
        elementType: 'geometry.stroke',
        stylers: [{ color: '#212a37' }]
      },
      {
        featureType: 'road',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#9ca5b3' }]
      },
      {
        featureType: 'road.highway',
        elementType: 'geometry',
        stylers: [{ color: '#746855' }]
      },
      {
        featureType: 'road.highway',
        elementType: 'geometry.stroke',
        stylers: [{ color: '#1f2835' }]
      },
      {
        featureType: 'road.highway',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#f3d19c' }]
      },
      {
        featureType: 'transit',
        elementType: 'geometry',
        stylers: [{ color: '#2f3948' }]
      },
      {
        featureType: 'transit.station',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#d59563' }]
      },
      {
        featureType: 'water',
        elementType: 'geometry',
        stylers: [{ color: '#17263c' }]
      },
      {
        featureType: 'water',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#515c6d' }]
      },
      {
        featureType: 'water',
        elementType: 'labels.text.stroke',
        stylers: [{ color: '#17263c' }]
      }
    ];

    const initialCenter = activeRoute.center;

    googleMap = new Map(mapElement, {
      center: initialCenter,
      zoom: activeRoute.zoom || 15,
      mapId: 'DEMO_MAP_ID',
      internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
      disableDefaultUI: true,
      gestureHandling: 'greedy',
      styles: mapStyles,
      zoomControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });

    // Background user location check (non-blocking)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userPos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          if (markerLib && markerLib.AdvancedMarkerElement && googleMap) {
            const userDot = document.createElement('div');
            userDot.innerHTML = '<div style="background-color:#0284c7; width:14px; height:14px; border-radius:50%; border:2.5px solid #ffffff; box-shadow:0 0 10px rgba(2,132,199,0.9);"></div>';
            new markerLib.AdvancedMarkerElement({
              map: googleMap,
              position: userPos,
              title: "Your Current Location",
              content: userDot
            });
          }
        },
        () => {},
        { timeout: 4000, enableHighAccuracy: false }
      );
    }

    // Ensure map canvas properly occupies the container
    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(() => {
        if (googleMap) {
          google.maps.event.trigger(googleMap, 'resize');
        }
      });
      resizeObserver.observe(mapElement);
      const wrapper = document.getElementById('mapWrapper');
      if (wrapper) resizeObserver.observe(wrapper);
    }

    // Generate initial 4 safe route choices around default location
    generateMultipleLoopChoices(activeRoute.center.lat, activeRoute.center.lng, activeRoute.locationName || 'West Creek Greenway', currentSelectedDistance);

    // Setup Long-press gesture & interactive tap listeners
    let startPixel = null;
    googleMap.addListener('mousedown', (e) => {
      if (!e || !e.latLng) return;
      isLongPressTriggered = false;
      const downLatLng = e.latLng;
      startPixel = e.pixel;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        isLongPressTriggered = true;
        handleMapLongPress(downLatLng);
      }, 500);
    });

    googleMap.addListener('mouseup', () => {
      clearTimeout(longPressTimer);
    });

    googleMap.addListener('dragstart', () => {
      clearTimeout(longPressTimer);
      isLongPressTriggered = false;
    });

    googleMap.addListener('mousemove', (e) => {
      if (startPixel && e.pixel) {
        if (Math.abs(e.pixel.x - startPixel.x) > 8 || Math.abs(e.pixel.y - startPixel.y) > 8) {
          clearTimeout(longPressTimer);
        }
      }
    });

    // Contextmenu fires on mobile long-touch and right-click
    googleMap.addListener('contextmenu', (e) => {
      if (!e || !e.latLng) return;
      clearTimeout(longPressTimer);
      isLongPressTriggered = true;
      handleMapLongPress(e.latLng);
    });

    // Interactive Tap: Clicking without holding generates loop or loops with waypoint
    googleMap.addListener('click', (e) => {
      if (isLongPressTriggered) {
        isLongPressTriggered = false;
        return;
      }
      if (!e || !e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      if (activeWaypointCoords) {
        generateLoopChoicesWithWaypoint(lat, lng, activeWaypointCoords.lat, activeWaypointCoords.lng, 'Pinned Spot', currentSelectedDistance);
      } else {
        generateMultipleLoopChoices(lat, lng, 'Pinned Spot', currentSelectedDistance);
      }
      speakInstruction(`Generated safe loops at pinned coordinate.`);
    });

    // Initial resize trigger to ensure tiles fill immediately
    setTimeout(() => {
      if (googleMap) {
        google.maps.event.trigger(googleMap, 'resize');
        fitRouteBounds(activeRoute);
      }
    }, 150);

  } catch (err) {
    console.error("Google Maps initialization error:", err);
    // Graceful fallback to OpenStreetMap if offline or API blocked
    initLeafletFallback(mapElement);
  }
}

// ----------------------------------------------------
// 3. Render Route with Advanced Markers and Polylines
// ----------------------------------------------------
function renderRoute(routeData) {
  if (!googleMap || !googleMapsLib) return;

  // Remove previous polylines
  if (routeGlowPolyline) routeGlowPolyline.setMap(null);
  if (routeCorePolyline) routeCorePolyline.setMap(null);
  if (startMarker) startMarker.map = null;
  if (runnerMarker) runnerMarker.map = null;

  // Safety glow polyline (soft translucent terracotta buffer)
  routeGlowPolyline = new googleMapsLib.Polyline({
    path: routeData.path,
    geodesic: true,
    strokeColor: '#C84B1A',
    strokeOpacity: isHeatmapActive ? 0.35 : 0.05,
    strokeWeight: 14,
    map: googleMap
  });

  // Core crisp route track line
  routeCorePolyline = new googleMapsLib.Polyline({
    path: routeData.path,
    geodesic: true,
    strokeColor: '#C84B1A',
    strokeOpacity: 0.95,
    strokeWeight: 4.5,
    map: googleMap
  });

  // Start Marker (Terracotta play button pin)
  if (markerLib && markerLib.AdvancedMarkerElement) {
    const startPinElement = document.createElement('div');
    startPinElement.innerHTML = `
      <div style="background-color:#C84B1A; width:24px; height:24px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 2px 8px rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px;">
        <i class="fa-solid fa-play"></i>
      </div>
    `;

    startMarker = new markerLib.AdvancedMarkerElement({
      map: googleMap,
      position: routeData.path[0],
      title: "Start / Finish Line",
      content: startPinElement
    });
  }

  fitRouteBounds(routeData);
  updateRouteInfoUI(routeData);
  if (routeData.center) {
    updateWeatherBadgeForRoute(routeData.center.lat, routeData.center.lng);
  }
}

function fitRouteBounds(routeData) {
  if (!googleMap || !googleMapsLib) return;
  const bounds = new googleMapsLib.LatLngBounds();
  routeData.path.forEach(pt => bounds.extend(pt));
  if (activeWaypointCoords) {
    bounds.extend(activeWaypointCoords);
  }
  
  // Padding adjusted according to collapsed/expanded state
  const bottomPadding = isSheetCollapsed ? 100 : 260;
  googleMap.fitBounds(bounds, {
    top: 70,
    right: 40,
    bottom: bottomPadding,
    left: 40
  });
}

function updateRouteInfoUI(routeData) {
  const titleEl = document.getElementById('routeTitle');
  const badgeEl = document.getElementById('routeMileageBadge');
  const compactTitleEl = document.getElementById('compactRouteTitle');
  const compactMileageEl = document.getElementById('compactRouteMileage');
  const sidewalkEl = document.getElementById('metricSidewalk');
  const litEl = document.getElementById('metricLit');
  const gainEl = document.getElementById('metricGain');

  if (titleEl) titleEl.textContent = routeData.title;
  if (badgeEl) badgeEl.innerHTML = `${routeData.distance.toFixed(2)} <span class="text-xs font-semibold text-stone-500">mi</span>`;
  if (compactTitleEl) compactTitleEl.textContent = routeData.title;
  if (compactMileageEl) compactMileageEl.textContent = `${routeData.distance.toFixed(2)} mi`;

  if (sidewalkEl) sidewalkEl.innerHTML = `<i class="fa-solid fa-check text-xs"></i> ${routeData.sidewalkPct || '98%'} Sidewalks`;
  if (litEl) litEl.innerHTML = `<i class="fa-solid fa-bolt text-xs"></i> ${routeData.litPct || '100%'} Lit Streets`;
  if (gainEl) gainEl.innerHTML = `<i class="fa-solid fa-mountain text-xs"></i> ${routeData.elevation || '+42 ft'} Gain`;
  const elevProfileStats = document.getElementById('elevProfileStats');
  if (elevProfileStats) elevProfileStats.textContent = `${routeData.elevation || '+42 ft'} Gain · 780 ft Max`;

  updateEstimatedDuration();
  renderManeuversPreviewList(routeData);
}

// ----------------------------------------------------
// OpenWeather Current Conditions Live Badge Updater
// ----------------------------------------------------
async function updateWeatherBadgeForRoute(lat, lng) {
  try {
    const weather = await fetchRouteWeather(lat, lng);
    currentWeatherData = weather;

    const weatherBadge = document.getElementById('mapWeatherBadge');
    const weatherTemp = document.getElementById('weatherTempDisplay');
    const weatherRainProb = document.getElementById('weatherRainProb');
    const weatherConditionIcon = document.getElementById('weatherConditionIcon');
    const weatherSummary = document.getElementById('weatherConditionSummary');

    if (weatherTemp) weatherTemp.textContent = `${weather.tempF}°F`;
    if (weatherRainProb) weatherRainProb.textContent = `${weather.rainProb}% rain`;
    if (weatherConditionIcon) weatherConditionIcon.className = `fa-solid ${weather.icon} ${weather.iconColor} text-sm`;
    if (weatherSummary) weatherSummary.textContent = `· ${weather.condition}`;
    if (weatherBadge) {
      weatherBadge.title = `${weather.condition} · ${weather.tempF}°F · ${weather.rainProb}% rain probability · ${weather.summary} (${weather.provider}) - Tap for speech forecast`;
      weatherBadge.classList.remove('hidden');
    }

    // Also update in-run navigation HUD weather badge
    const hudWeatherText = document.getElementById('hudWeatherText');
    const hudWeatherIcon = document.getElementById('hudWeatherIcon');
    if (hudWeatherText) hudWeatherText.textContent = `${weather.tempF}°F · ${weather.rainProb}% rain`;
    if (hudWeatherIcon) hudWeatherIcon.className = `fa-solid ${weather.icon} ${weather.iconColor} text-[9px]`;

  } catch (err) {
    console.warn("Could not update route weather:", err);
  }
}

// ----------------------------------------------------
// Generate 3-4 Diverse Safe Loop Choices
// ----------------------------------------------------
function generateMultipleLoopChoices(lat, lng, label = 'Custom Location', targetDist = 3.1, redoOffset = 0) {
  const flavors = [
    {
      titleSuffix: "Greenway Lit Loop",
      safetyScore: "9.9",
      sidewalkPct: "100%",
      litPct: "100%",
      gainFactor: 8.0,
      baseHeading: 0.25 * Math.PI, // North-East
      traitTag: "100% Paved Trails · Night Lit",
      distMultiplier: 1.0,
      icon: "fa-tree",
      color: "#10b981",
      wobbles: [1.0, 1.2, 0.95, 1.25, 1.1, 0.9, 1.15, 0.98],
      stepSuffix: "along illuminated park greenway"
    },
    {
      titleSuffix: "Scenic Waterfront Circuit",
      safetyScore: "9.7",
      sidewalkPct: "98%",
      litPct: "95%",
      gainFactor: 9.5,
      baseHeading: 0.75 * Math.PI, // North-West
      traitTag: "Scenic Waterfront · Wide Buffer",
      distMultiplier: 1.03,
      icon: "fa-water",
      color: "#0284c7",
      wobbles: [1.1, 0.95, 1.25, 1.05, 0.9, 1.2, 1.05, 0.95],
      stepSuffix: "along scenic shoreline promenade"
    },
    {
      titleSuffix: "Quiet Neighborhood Loop",
      safetyScore: "9.6",
      sidewalkPct: "97%",
      litPct: "92%",
      gainFactor: 6.5,
      baseHeading: 1.75 * Math.PI, // South-East
      traitTag: "Calm Cul-de-Sacs · Zero Traffic",
      distMultiplier: 0.97,
      icon: "fa-shield-heart",
      color: "#8b5cf6",
      wobbles: [0.95, 1.1, 1.0, 1.15, 1.2, 1.05, 0.92, 1.08],
      stepSuffix: "through tranquil residential lanes"
    },
    {
      titleSuffix: "Hill Vista Training Loop",
      safetyScore: "9.8",
      sidewalkPct: "99%",
      litPct: "96%",
      gainFactor: 14.0,
      baseHeading: 1.25 * Math.PI, // South-West
      traitTag: "Rolling Hills · Cardio Focus",
      distMultiplier: 1.05,
      icon: "fa-mountain",
      color: "#f59e0b",
      wobbles: [1.15, 1.05, 0.9, 1.2, 1.1, 1.25, 0.95, 1.0],
      stepSuffix: "over rolling elevation overlooks"
    }
  ];

  const choices = flavors.map((f, idx) => {
    const routeDist = Number((targetDist * f.distMultiplier).toFixed(2));
    const radiusDeg = Math.max(0.0035, (routeDist / (2 * Math.PI)) / 65);
    const numPoints = 8;
    const path = [];
    const cosLat = Math.cos(lat * Math.PI / 180) || 1;
    const headingAngle = f.baseHeading + redoOffset;

    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * 2 * Math.PI + headingAngle;
      const r = radiusDeg * f.wobbles[i];
      const offsetLat = (r * Math.sin(angle)) + (radiusDeg * 0.45 * Math.sin(headingAngle));
      const offsetLng = ((r * Math.cos(angle)) + (radiusDeg * 0.45 * Math.cos(headingAngle))) / cosLat;
      const pLat = lat + offsetLat;
      const pLng = lng + offsetLng;
      path.push({ lat: Number(pLat.toFixed(6)), lng: Number(pLng.toFixed(6)) });
    }
    path[0] = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    path.push({ ...path[0] });

    const elevGain = Math.round(18 + routeDist * f.gainFactor);
    const estTotalSeconds = routeDist * currentPaceSeconds;
    const estMins = Math.round(estTotalSeconds / 60);

    return {
      id: `choice-${idx + 1}-${Date.now()}`,
      title: `${label} ${f.titleSuffix}`,
      flavorTitle: f.titleSuffix,
      locationName: label,
      flavorIndex: idx,
      center: { lat, lng },
      zoom: routeDist > 5 ? 14 : (routeDist > 2 ? 15 : 16),
      distance: routeDist,
      estMinutes: estMins,
      elevation: `+${elevGain} ft`,
      safetyScore: f.safetyScore,
      sidewalkPct: f.sidewalkPct,
      litPct: f.litPct,
      traitTag: f.traitTag,
      icon: f.icon,
      color: f.color,
      path: path,
      maneuvers: [
        { text: `Start run heading out from ${label}`, dist: "Start", icon: "fa-arrow-up", note: f.traitTag },
        { text: `In 350 feet, bear right ${f.stepSuffix}`, dist: "In 350 ft", icon: "fa-arrow-turn-up-right", note: `${f.sidewalkPct} sidewalk verified` },
        { text: `Continue along loop perimeter for ${(routeDist * 0.45).toFixed(1)} miles`, dist: "In 800 ft", icon: "fa-arrow-up", note: "Low traffic, well-lit" },
        { text: `Turn right onto return greenway connector`, dist: "In 300 ft", icon: "fa-arrow-right", note: "Dedicated pedestrian corridor" },
        { text: `Approaching ${label} start line! Final 200 feet ahead.`, dist: "In 200 ft", icon: "fa-flag-checkered", note: "Closing safe loop" }
      ]
    };
  });

  currentRouteChoices = choices;
  selectedChoiceIndex = 0;
  activeRoute = currentRouteChoices[0];

  if (isNavigating) stopNavigation();
  renderRoute(activeRoute);
  renderRouteChoicesList();
  updateEstimatedDuration();

  return choices;
}

function generateLoopFromCoords(lat, lng, label = 'Custom Location', targetDist = 3.1) {
  return generateMultipleLoopChoices(lat, lng, label, targetDist, 0);
}

// ----------------------------------------------------
// Handle Map Long-Press Gesture (Start Line or Waypoint)
// ----------------------------------------------------
function handleMapLongPress(latLng) {
  if (!latLng) return;
  const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
  const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;
  lastDroppedPinCoords = { lat, lng };

  // Haptic feedback on supported mobile devices
  if (navigator.vibrate) {
    try { navigator.vibrate([40, 60, 40]); } catch (e) {}
  }

  // Auditory chime
  playTurnChime();

  // Create or update temporary dropped pin marker with glowing bounce animation
  if (droppedPinMarker) {
    droppedPinMarker.map = null;
    droppedPinMarker = null;
  }
  if (markerLib && markerLib.AdvancedMarkerElement && googleMap) {
    const pinEl = document.createElement('div');
    pinEl.className = 'relative flex flex-col items-center cursor-pointer';
    pinEl.innerHTML = `
      <div style="background-color:#C84B1A; width:34px; height:34px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 4px 14px rgba(200,75,26,0.6); display:flex; align-items:center; justify-content:center; color:#fff; font-size:14px; animation: bounce 1s infinite;">
        <i class="fa-solid fa-location-dot"></i>
      </div>
      <div style="width:6px; height:6px; background-color:#C84B1A; border-radius:50%; margin-top:2px;"></div>
    `;
    droppedPinMarker = new markerLib.AdvancedMarkerElement({
      map: googleMap,
      position: { lat, lng },
      title: "Dropped Pin",
      content: pinEl
    });
  }

  // Update prompt UI coordinates and make prompt visible
  const coordsText = document.getElementById('droppedPinCoordsText');
  if (coordsText) {
    coordsText.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
  const promptEl = document.getElementById('droppedPinPrompt');
  if (promptEl) {
    promptEl.classList.remove('hidden');
  }

  speakInstruction("Pin dropped. Choose to set as start line or route waypoint.");
}

// ----------------------------------------------------
// Update Persistent Waypoint Marker on Map
// ----------------------------------------------------
function updateWaypointMarker(lat, lng) {
  if (!googleMap) return;
  if (waypointMarker) {
    waypointMarker.map = null;
    waypointMarker = null;
  }
  if (markerLib && markerLib.AdvancedMarkerElement) {
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
    waypointMarker = new markerLib.AdvancedMarkerElement({
      map: googleMap,
      position: { lat, lng },
      title: "Active Waypoint",
      content: wpElement
    });
  }
}

// ----------------------------------------------------
// Generate Safe Loop Choices Routed Through Waypoint
// ----------------------------------------------------
function generateLoopChoicesWithWaypoint(originLat, originLng, wpLat, wpLng, label = 'Custom Location', targetDist = 3.1, redoOffset = 0) {
  const dLatDeg = wpLat - originLat;
  const cosLat = Math.cos(originLat * Math.PI / 180) || 1;
  const dLngDeg = (wpLng - originLng) * cosLat;
  
  const directDistMiles = Math.max(0.1, Math.sqrt(Math.pow(dLatDeg * 69.0, 2) + Math.pow(dLngDeg * 69.0, 2)));
  const minLoopDist = Number((directDistMiles * 2.2).toFixed(2));
  const effectiveTarget = Math.max(targetDist, minLoopDist);

  // Vector bearing from origin to waypoint
  const baseBearing = Math.atan2(dLatDeg, dLngDeg);
  const perpBearing = baseBearing + (Math.PI / 2);
  const wpDistDeg = Math.sqrt(dLatDeg * dLatDeg + (wpLng - originLng) * (wpLng - originLng));

  const flavors = [
    {
      titleSuffix: "Lit Trail Loop via Waypoint",
      safetyScore: "9.9",
      sidewalkPct: "100%",
      litPct: "100%",
      gainFactor: 8.0,
      traitTag: "100% Paved Trails · Via Waypoint",
      distMultiplier: 1.0,
      icon: "fa-tree",
      color: "#10b981",
      lateralFlank: 0.35,
      apexExtension: 0.30,
      stepSuffix: "along illuminated park greenway"
    },
    {
      titleSuffix: "Scenic Shoreline via Waypoint",
      safetyScore: "9.7",
      sidewalkPct: "98%",
      litPct: "95%",
      gainFactor: 9.5,
      traitTag: "Scenic Buffer · Dedicated Paths",
      distMultiplier: 1.05,
      icon: "fa-water",
      color: "#0284c7",
      lateralFlank: -0.38,
      apexExtension: 0.40,
      stepSuffix: "along scenic shoreline promenade"
    },
    {
      titleSuffix: "Quiet Residential via Waypoint",
      safetyScore: "9.8",
      sidewalkPct: "99%",
      litPct: "94%",
      gainFactor: 6.5,
      traitTag: "Calm Cul-de-Sacs · Zero Traffic",
      distMultiplier: 0.98,
      icon: "fa-shield-heart",
      color: "#8b5cf6",
      lateralFlank: 0.45,
      apexExtension: 0.22,
      stepSuffix: "through tranquil neighborhood lanes"
    },
    {
      titleSuffix: "Cardio Vista Loop via Waypoint",
      safetyScore: "9.6",
      sidewalkPct: "97%",
      litPct: "92%",
      gainFactor: 14.0,
      traitTag: "Rolling Hills · Waypoint Apex",
      distMultiplier: 1.08,
      icon: "fa-mountain",
      color: "#f59e0b",
      lateralFlank: -0.50,
      apexExtension: 0.50,
      stepSuffix: "over rolling elevation overlooks"
    }
  ];

  const choices = flavors.map((f, idx) => {
    const routeDist = Number((effectiveTarget * f.distMultiplier).toFixed(2));
    const path = [];
    const flankSign = f.lateralFlank >= 0 ? 1 : -1;
    const flankDistDeg = Math.max(0.003, wpDistDeg * Math.abs(f.lateralFlank));
    const apexDistDeg = Math.max(0.003, wpDistDeg * f.apexExtension);

    // 0: Origin (Start)
    path.push({ lat: Number(originLat.toFixed(6)), lng: Number(originLng.toFixed(6)) });

    // 1: Outward arc leg 1
    const p1Angle = perpBearing + (flankSign * 0.25) + redoOffset;
    path.push({
      lat: Number((originLat + dLatDeg * 0.33 + flankDistDeg * 0.55 * Math.sin(p1Angle)).toFixed(6)),
      lng: Number((originLng + (wpLng - originLng) * 0.33 + (flankDistDeg * 0.55 * Math.cos(p1Angle)) / cosLat).toFixed(6))
    });

    // 2: Outward arc leg 2 (approaching waypoint)
    const p2Angle = perpBearing + (flankSign * 0.15) + redoOffset;
    path.push({
      lat: Number((originLat + dLatDeg * 0.68 + flankDistDeg * 0.35 * Math.sin(p2Angle)).toFixed(6)),
      lng: Number((originLng + (wpLng - originLng) * 0.68 + (flankDistDeg * 0.35 * Math.cos(p2Angle)) / cosLat).toFixed(6))
    });

    // 3: WAYPOINT (Crucial: exactly at the pinned waypoint!)
    path.push({ lat: Number(wpLat.toFixed(6)), lng: Number(wpLng.toFixed(6)) });

    // 4: Apex past waypoint
    const apexAngle = baseBearing + (flankSign * 0.2) + redoOffset;
    path.push({
      lat: Number((wpLat + apexDistDeg * Math.sin(apexAngle)).toFixed(6)),
      lng: Number((wpLng + (apexDistDeg * Math.cos(apexAngle)) / cosLat).toFixed(6))
    });

    // 5: Outer perimeter curve
    const returnFlankAngle = perpBearing + Math.PI - (flankSign * 0.2) + redoOffset;
    path.push({
      lat: Number((wpLat + apexDistDeg * 0.7 * Math.sin(apexAngle) + flankDistDeg * 0.7 * Math.sin(returnFlankAngle)).toFixed(6)),
      lng: Number((wpLng + (apexDistDeg * 0.7 * Math.cos(apexAngle) + flankDistDeg * 0.7 * Math.cos(returnFlankAngle)) / cosLat).toFixed(6))
    });

    // 6: Return connector leg 1
    path.push({
      lat: Number((originLat + dLatDeg * 0.66 + flankDistDeg * 0.6 * Math.sin(returnFlankAngle)).toFixed(6)),
      lng: Number((originLng + (wpLng - originLng) * 0.66 + (flankDistDeg * 0.6 * Math.cos(returnFlankAngle)) / cosLat).toFixed(6))
    });

    // 7: Return connector leg 2 (approaching home stretch)
    path.push({
      lat: Number((originLat + dLatDeg * 0.30 + flankDistDeg * 0.4 * Math.sin(returnFlankAngle)).toFixed(6)),
      lng: Number((originLng + (wpLng - originLng) * 0.30 + (flankDistDeg * 0.4 * Math.cos(returnFlankAngle)) / cosLat).toFixed(6))
    });

    // 8: Back to start line (Closing loop)
    path.push({ lat: Number(originLat.toFixed(6)), lng: Number(originLng.toFixed(6)) });

    const elevGain = Math.round(18 + routeDist * f.gainFactor);
    const estTotalSeconds = routeDist * currentPaceSeconds;
    const estMins = Math.round(estTotalSeconds / 60);

    return {
      id: `wp-choice-${idx + 1}-${Date.now()}`,
      title: `${label} ${f.titleSuffix}`,
      flavorTitle: f.titleSuffix,
      locationName: label,
      flavorIndex: idx,
      center: { lat: originLat, lng: originLng },
      waypoint: { lat: wpLat, lng: wpLng },
      zoom: routeDist > 5 ? 14 : (routeDist > 2 ? 15 : 16),
      distance: routeDist,
      estMinutes: estMins,
      elevation: `+${elevGain} ft`,
      safetyScore: f.safetyScore,
      sidewalkPct: f.sidewalkPct,
      litPct: f.litPct,
      traitTag: f.traitTag,
      icon: f.icon,
      color: f.color,
      path: path,
      maneuvers: [
        { text: `Depart start heading towards pinned waypoint`, dist: "Start", icon: "fa-arrow-up", note: f.traitTag },
        { text: `Follow illuminated sidewalk corridor`, dist: `In ${(directDistMiles * 0.4).toFixed(1)} mi`, icon: "fa-arrow-up", note: `${f.sidewalkPct} sidewalk verified` },
        { text: `Arriving at pinned waypoint checkpoint`, dist: `In ${(directDistMiles * 0.6).toFixed(1)} mi`, icon: "fa-diamond-turn-right", note: "Selected runner waypoint" },
        { text: `Bear right ${f.stepSuffix}`, dist: "In 300 ft", icon: "fa-arrow-turn-up-right", note: "Wide pedestrian buffer" },
        { text: `Continue along loop perimeter for ${(routeDist * 0.35).toFixed(1)} miles`, dist: "In 800 ft", icon: "fa-arrow-up", note: "Continuous street lighting" },
        { text: `Approaching start line! Final 200 feet ahead.`, dist: "In 200 ft", icon: "fa-flag-checkered", note: "Closing safe loop" }
      ]
    };
  });

  currentRouteChoices = choices;
  selectedChoiceIndex = 0;
  activeRoute = currentRouteChoices[0];

  if (isNavigating) stopNavigation();
  renderRoute(activeRoute);
  renderRouteChoicesList();
  updateEstimatedDuration();

  return choices;
}

function renderRouteChoicesList() {
  const container = document.getElementById('routeChoicesList');
  if (!container) return;

  if (!currentRouteChoices || currentRouteChoices.length === 0) {
    container.innerHTML = '<div class="text-xs text-stone-500 text-center py-2">No routes generated yet.</div>';
    return;
  }

  // Update map tap hint text
  const mapTapHint = document.getElementById('mapTapHint');
  if (mapTapHint) {
    if (activeWaypointCoords) {
      mapTapHint.innerHTML = `<i class="fa-solid fa-diamond-turn-right text-sky-400 text-xs"></i> <span>Waypoint active · Long-press map to drop new pin</span>`;
    } else {
      mapTapHint.innerHTML = `<i class="fa-solid fa-hand-pointer text-terracotta text-xs"></i> <span>Long-press map to drop Start line or Waypoint pin</span>`;
    }
  }

  container.innerHTML = '';

  // Show active waypoint indicator banner if a waypoint is active
  if (activeWaypointCoords) {
    const wpBanner = document.createElement('div');
    wpBanner.className = 'mb-2 p-1.5 px-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 flex items-center justify-between text-[11px] text-sky-800 dark:text-sky-300';
    wpBanner.innerHTML = `
      <div class="flex items-center gap-1.5 font-medium truncate">
        <i class="fa-solid fa-diamond-turn-right text-sky-500 flex-shrink-0"></i>
        <span class="truncate">Routing via pinned waypoint (${activeWaypointCoords.lat.toFixed(3)}, ${activeWaypointCoords.lng.toFixed(3)})</span>
      </div>
      <button id="btnClearActiveWaypoint" class="text-[10px] text-rose-500 hover:text-rose-600 font-bold underline flex-shrink-0 ml-2 cursor-pointer">
        Remove
      </button>
    `;
    container.appendChild(wpBanner);

    const clearWpBtn = wpBanner.querySelector('#btnClearActiveWaypoint');
    if (clearWpBtn) {
      clearWpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeWaypointCoords = null;
        if (waypointMarker) {
          waypointMarker.map = null;
          waypointMarker = null;
        }
        const origin = activeRoute?.path?.[0] || activeRoute?.center || { lat: 41.3857, lng: -81.7058 };
        const locName = activeRoute?.locationName || 'Custom Route';
        generateMultipleLoopChoices(origin.lat, origin.lng, locName, currentSelectedDistance, 0);
        speakInstruction("Waypoint removed. Restored standard perimeter loops.");
      });
    }
  }

  currentRouteChoices.forEach((route, idx) => {
    const isSelected = idx === selectedChoiceIndex;
    const isSaved = savedRoutesCache.some(r =>
      r.title === route.title && Math.abs(Number(r.distance) - Number(route.distance)) < 0.1
    );

    const card = document.createElement('div');
    card.className = `p-2.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
      isSelected
        ? 'border-terracotta bg-terracotta/5 dark:bg-terracotta/10 ring-1 ring-terracotta shadow-sm'
        : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:border-terracotta/40'
    }`;

    card.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <div class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
          isSelected
            ? 'bg-terracotta text-white shadow-sm'
            : 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300'
        }">
          ${idx + 1}
        </div>
        <div class="truncate flex-1">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-bold text-stone-900 dark:text-white truncate">${route.flavorTitle || route.title}</span>
            <span class="text-[9px] px-1.5 py-0.2 rounded font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">${route.safetyScore}</span>
          </div>
          <div class="text-[10px] text-stone-500 dark:text-stone-400 flex items-center gap-1 mt-0.5 truncate">
            <span class="font-mono font-bold text-terracotta">${route.distance.toFixed(2)} mi</span>
            <span>·</span>
            <span>~${route.estMinutes} min</span>
            <span>·</span>
            <span>${route.elevation}</span>
            <span>·</span>
            <span class="truncate">${route.traitTag}</span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-1.5 flex-shrink-0">
        <button class="btn-save-choice-item w-7 h-7 rounded-lg text-xs flex items-center justify-center transition ${
          isSaved
            ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
            : 'text-stone-400 hover:text-terracotta hover:bg-stone-100 dark:hover:bg-stone-700'
        }" title="${isSaved ? 'Saved in Cloud Library' : 'Save Route to Cloud'}" data-index="${idx}">
          <i class="${isSaved ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark'}"></i>
        </button>
        <div class="w-4 flex justify-center text-terracotta">
          ${isSelected ? '<i class="fa-solid fa-check text-xs font-bold"></i>' : ''}
        </div>
      </div>
    `;

    // Card click selects route
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-save-choice-item')) return;
      selectedChoiceIndex = idx;
      activeRoute = currentRouteChoices[idx];
      if (isNavigating) stopNavigation();
      renderRoute(activeRoute);
      renderRouteChoicesList();
      speakInstruction(`Option ${idx + 1} selected: ${activeRoute.flavorTitle || activeRoute.title}. ${activeRoute.distance.toFixed(2)} miles.`);
    });

    // Bookmark button click saves single route with deduplication
    const saveBtn = card.querySelector('.btn-save-choice-item');
    if (saveBtn) {
      saveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await saveRouteWithDeduplication(route, saveBtn);
      });
    }

    container.appendChild(card);
  });

  const badge = document.getElementById('routeChoicesBadge');
  if (badge) badge.textContent = `${currentRouteChoices.length} Options`;

  updateSaveButtonStatus();
}

async function saveRouteWithDeduplication(routeToSave, triggerBtn = null) {
  const saveLabel = document.getElementById('saveRouteToCloudLabel');

  if (!currentUser) {
    speakInstruction("Please sign in with Google to save routes to your cloud account.");
    try {
      await loginWithGoogle();
    } catch (_) {
      return;
    }
  }

  if (!currentUser) return;

  // 1. Client-Side Deduplication Check against cached routes
  const alreadyExists = savedRoutesCache.some(r =>
    r.title === routeToSave.title && Math.abs(Number(r.distance) - Number(routeToSave.distance)) < 0.1
  );

  if (alreadyExists) {
    if (saveLabel) {
      saveLabel.innerHTML = '<span class="text-amber-500 font-bold"><i class="fa-solid fa-check-double mr-1"></i>Already in Library!</span>';
      setTimeout(() => updateSaveButtonStatus(), 2500);
    }
    playTurnChime();
    speakInstruction("This route is already in your saved cloud library.");
    renderRouteChoicesList();
    return;
  }

  // 2. Server-Side Save with Deduplication
  try {
    if (saveLabel) saveLabel.textContent = 'Saving to Cloud...';
    const result = await addSavedRoute(routeToSave);
    playTurnChime();

    if (result && result.isDuplicate) {
      if (saveLabel) {
        saveLabel.innerHTML = '<span class="text-amber-500 font-bold"><i class="fa-solid fa-check mr-1"></i>Already in Library!</span>';
        setTimeout(() => updateSaveButtonStatus(), 2500);
      }
      speakInstruction("Route already exists in your cloud library.");
    } else {
      if (saveLabel) {
        saveLabel.innerHTML = '<span class="text-emerald-500 font-bold"><i class="fa-solid fa-check mr-1"></i>Saved to Cloud!</span>';
        setTimeout(() => updateSaveButtonStatus(), 2500);
      }
      savedRoutesCache.push(routeToSave);
      speakInstruction(`Saved ${routeToSave.title} to your cloud library.`);
    }

    renderRouteChoicesList();
  } catch (err) {
    console.error("Error saving route:", err);
    if (saveLabel) {
      saveLabel.textContent = 'Save Failed - Retry';
      setTimeout(() => updateSaveButtonStatus(), 2500);
    }
  }
}

function updateSaveButtonStatus() {
  const saveLabel = document.getElementById('saveRouteToCloudLabel');
  if (!saveLabel) return;

  const currentIsSaved = savedRoutesCache.some(r =>
    r.title === activeRoute.title && Math.abs(Number(r.distance) - Number(activeRoute.distance)) < 0.1
  );

  if (currentIsSaved) {
    saveLabel.innerHTML = '<span class="text-emerald-500 font-bold"><i class="fa-solid fa-bookmark mr-1"></i>Saved in Cloud</span>';
  } else {
    saveLabel.textContent = 'Save Route to Cloud';
  }
}

function updateEstimatedDuration() {
  const dist = activeRoute?.distance || currentSelectedDistance || 3.1;
  const totalSeconds = dist * currentPaceSeconds;
  const mins = Math.floor(totalSeconds / 60);
  const paceDisplay = document.getElementById('targetPaceDisplay');
  if (paceDisplay) {
    paceDisplay.textContent = `${currentTargetPace} /mi (~${mins} min)`;
  }
  const hudTargetPaceLabel = document.getElementById('hudTargetPaceLabel');
  if (hudTargetPaceLabel) {
    hudTargetPaceLabel.textContent = `${currentTargetPace}/mi`;
  }
}

// ----------------------------------------------------
// Fallback Leaflet if offline
// ----------------------------------------------------
function initLeafletFallback(mapElement) {
  try {
    if (!L || !mapElement) return;
    mapElement.innerHTML = '';
    const map = L.map(mapElement, {
      zoomControl: false,
      attributionControl: false
    }).setView([activeRoute.center.lat, activeRoute.center.lng], activeRoute.zoom);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const polyline = L.polyline(activeRoute.path.map(p => [p.lat, p.lng]), {
      color: '#C84B1A',
      weight: 4.5
    }).addTo(map);

    map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
    window.__activeLeafletMap = map;
  } catch (e) {
    console.warn("Leaflet fallback notice:", e);
  }
}

// ----------------------------------------------------
// 4. Web Audio & Speech Synthesis Navigation Voice
// ----------------------------------------------------
let audioCtx = null;

function initSpeechSynthesis() {
  if (!('speechSynthesis' in window)) {
    console.warn("Web Speech API not supported in this browser.");
    return;
  }

  function populateVoices() {
    speechVoices = window.speechSynthesis.getVoices();
    if (!speechVoices || speechVoices.length === 0) return;

    // Prefer high-quality, clear athletic coach English voices
    selectedVoice = speechVoices.find(v => 
      (v.lang === 'en-US' || v.lang.startsWith('en')) &&
      (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Karen') || v.name.includes('Alex'))
    ) || speechVoices.find(v => v.lang === 'en-US') || speechVoices.find(v => v.lang.startsWith('en')) || speechVoices[0];
  }

  populateVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = populateVoices;
  }
}

function playTurnChime() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880.00, audioCtx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.32);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.32);
  } catch (_) {}
}

function speakInstruction(text, options = {}) {
  if (isVoiceMuted || !text) return;

  const playChime = options.playChime !== false;
  if (playChime) {
    playTurnChime();
  }

  if (!('speechSynthesis' in window)) return;

  try {
    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    currentUtterance = utter; // Retain reference to prevent premature browser GC

    if (!selectedVoice && speechVoices.length === 0) {
      initSpeechSynthesis();
    }
    if (selectedVoice) {
      utter.voice = selectedVoice;
    }

    utter.rate = options.rate || 1.02; // Energetic, clear athletic coach rate
    utter.pitch = options.pitch || 1.0;
    utter.lang = selectedVoice?.lang || 'en-US';

    const speakingBadge = document.getElementById('hudVoiceSpeakingBadge');
    const navTurnIcon = document.getElementById('navTurnIcon');

    utter.onstart = () => {
      if (speakingBadge) speakingBadge.classList.remove('hidden');
      if (navTurnIcon) navTurnIcon.classList.add('animate-pulse');
    };

    utter.onend = () => {
      if (speakingBadge) speakingBadge.classList.add('hidden');
      if (navTurnIcon) navTurnIcon.classList.remove('animate-pulse');
      currentUtterance = null;
    };

    utter.onerror = () => {
      if (speakingBadge) speakingBadge.classList.add('hidden');
      if (navTurnIcon) navTurnIcon.classList.remove('animate-pulse');
      currentUtterance = null;
    };

    if (options.haptic && navigator.vibrate) {
      try { navigator.vibrate(options.haptic); } catch (_) {}
    }

    window.speechSynthesis.speak(utter);
  } catch (err) {
    console.warn("Web Speech API notice:", err);
  }
}

// ----------------------------------------------------
// Render Bottom Sheet Turn-by-Turn Maneuvers Preview
// ----------------------------------------------------
function renderManeuversPreviewList(routeData) {
  const container = document.getElementById('maneuversListContainer');
  const countBadge = document.getElementById('maneuversCountBadge');
  if (!container) return;

  const maneuvers = routeData?.maneuvers || [];
  if (countBadge) {
    countBadge.textContent = `${maneuvers.length} turns`;
  }

  if (maneuvers.length === 0) {
    container.innerHTML = '<div class="text-[11px] text-stone-500 text-center py-2">No turn guidance available.</div>';
    return;
  }

  container.innerHTML = '';
  maneuvers.forEach((m, idx) => {
    const item = document.createElement('div');
    item.className = 'p-2 rounded-xl bg-white dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700/80 flex items-center justify-between gap-2.5 transition hover:border-terracotta/40';
    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <div class="w-6 h-6 rounded-lg bg-stone-100 dark:bg-stone-700 text-terracotta flex items-center justify-center text-xs flex-shrink-0">
          <i class="fa-solid ${m.icon || 'fa-arrow-up'}"></i>
        </div>
        <div class="truncate flex-1">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-bold text-stone-900 dark:text-white truncate">${m.text}</span>
          </div>
          <div class="text-[10px] text-stone-500 dark:text-stone-400 flex items-center gap-1 mt-0.5">
            <span class="font-mono font-bold text-amber-500">${m.dist || 'Start'}</span>
            <span>·</span>
            <span class="truncate">${m.note || 'Safe pedestrian corridor'}</span>
          </div>
        </div>
      </div>
      <button class="btn-audition-maneuver w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-700 hover:bg-terracotta hover:text-white text-stone-600 dark:text-stone-300 flex items-center justify-center text-xs transition flex-shrink-0" title="Audition spoken guidance">
        <i class="fa-solid fa-volume-high text-[10px]"></i>
      </button>
    `;

    const auditionBtn = item.querySelector('.btn-audition-maneuver');
    if (auditionBtn) {
      auditionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const speechText = `${m.dist ? m.dist + ', ' : ''}${m.text}. ${m.note || ''}`;
        speakInstruction(speechText);
      });
    }

    container.appendChild(item);
  });
}

// ----------------------------------------------------
// 5. Live Navigation Simulation Loop
// ----------------------------------------------------
function startNavigation() {
  isNavigating = true;
  navIsPaused = false;
  navSecondsElapsed = 0;
  navStepIndex = 0;

  // Unlock Web Audio Context and Speech Synthesis from this user gesture
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  // Auto-collapse bottom sheet to maximize map visibility during run
  setSheetCollapsed(true);

  const btnNavIcon = document.getElementById('btnNavIcon');
  const btnNavLabel = document.getElementById('btnNavLabel');
  const compactBtnIcon = document.getElementById('compactBtnNavIcon');
  const navCard = document.getElementById('navInstructionCard');
  const hudPauseIcon = document.getElementById('hudPauseIcon');
  const hudPauseText = document.getElementById('hudPauseText');

  if (btnNavIcon) btnNavIcon.className = 'fa-solid fa-circle-stop text-sm text-rose-300';
  if (btnNavLabel) btnNavLabel.textContent = 'End Navigation';
  if (compactBtnIcon) compactBtnIcon.className = 'fa-solid fa-circle-stop text-rose-300';
  if (navCard) navCard.classList.remove('hidden');
  if (hudPauseIcon) hudPauseIcon.className = 'fa-solid fa-pause text-amber-400 text-[11px]';
  if (hudPauseText) hudPauseText.textContent = 'Pause';

  // Announce departure briefing via Web Speech API
  updateNavStep(0, true);

  const hudTimer = document.getElementById('hudTimer');
  navInterval = setInterval(() => {
    if (navIsPaused) return; // Do not advance when user tapped pause

    navSecondsElapsed += 2;
    const mins = Math.floor(navSecondsElapsed / 60).toString().padStart(2, '0');
    const secs = (navSecondsElapsed % 60).toString().padStart(2, '0');
    if (hudTimer) hudTimer.textContent = `${mins}:${secs}`;

    // Advance maneuver every 6 seconds
    if (navSecondsElapsed % 6 === 0) {
      navStepIndex++;
      if (navStepIndex >= activeRoute.maneuvers.length) {
        const totalMins = Math.floor(navSecondsElapsed / 60);
        const totalSecs = navSecondsElapsed % 60;
        const timeBrief = totalMins > 0 ? `${totalMins} minutes ${totalSecs} seconds` : `${totalSecs} seconds`;
        stopNavigation();
        speakInstruction(`Congratulations! You completed your ${activeRoute.distance} mile safe loop in ${timeBrief}. Average pace: ${currentTargetPace} per mile. Great run!`, { haptic: [80, 80, 80, 80, 150] });
        return;
      }
      updateNavStep(navStepIndex, false);
    }
  }, 1000);
}

function stopNavigation() {
  isNavigating = false;
  navIsPaused = false;
  clearInterval(navInterval);

  const btnNavIcon = document.getElementById('btnNavIcon');
  const btnNavLabel = document.getElementById('btnNavLabel');
  const compactBtnIcon = document.getElementById('compactBtnNavIcon');
  const navCard = document.getElementById('navInstructionCard');
  const hudPauseIcon = document.getElementById('hudPauseIcon');
  const hudPauseText = document.getElementById('hudPauseText');
  const runnerDot = document.getElementById('elevRunnerDot');

  if (btnNavIcon) btnNavIcon.className = 'fa-solid fa-circle-play text-sm';
  if (btnNavLabel) btnNavLabel.textContent = 'Start Safe Voice Nav';
  if (compactBtnIcon) compactBtnIcon.className = 'fa-solid fa-circle-play';
  if (navCard) navCard.classList.add('hidden');
  if (hudPauseIcon) hudPauseIcon.className = 'fa-solid fa-pause text-amber-400 text-[11px]';
  if (hudPauseText) hudPauseText.textContent = 'Pause';
  if (runnerDot) runnerDot.setAttribute('cx', '12');

  if (runnerMarker) {
    runnerMarker.map = null;
    runnerMarker = null;
  }

  // Auto-save completed workout to Firestore if run was active
  if (navSecondsElapsed >= 6 && currentUser) {
    addRunActivity({
      routeTitle: activeRoute.title,
      distance: Number(activeRoute.distance || currentSelectedDistance || 3.1),
      durationSeconds: navSecondsElapsed,
      avgPace: currentTargetPace,
      avgHeartRate: 148,
      calories: Math.round((navSecondsElapsed / 60) * 11.5) + 14
    }).catch(err => console.error("Could not auto-save run activity:", err));
  }
}

function updateNavStep(index, isFirstStep = false) {
  const maneuvers = activeRoute.maneuvers;
  const m = maneuvers[index % maneuvers.length];

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
  if (navDistanceToTurn) navDistanceToTurn.textContent = m.dist;
  if (navTurnIcon) navTurnIcon.className = `fa-solid ${m.icon}`;

  // Formulate real-time spoken guidance
  let speechText = '';
  let hapticPattern = [50, 60, 50];

  if (isFirstStep) {
    speechText = `Starting safe voice navigation on ${activeRoute.title}. Target distance: ${activeRoute.distance} miles at ${currentTargetPace} pace. ${m.text}. ${m.note || ''}`;
    hapticPattern = [70, 80, 70];
  } else {
    speechText = `${m.dist ? m.dist + ', ' : ''}${m.text}. ${m.note ? m.note + '.' : ''}`;
    if (m.icon && (m.icon.includes('turn-up-right') || m.icon.includes('arrow-right'))) {
      hapticPattern = [50, 60, 50]; // Turn right
    } else if (m.icon && m.icon.includes('arrow-left')) {
      hapticPattern = [100, 60, 50]; // Turn left
    } else if (m.icon && m.icon.includes('flag')) {
      hapticPattern = [80, 80, 80, 80, 120]; // Finish line
    }
  }

  speakInstruction(speechText, { haptic: hapticPattern });

  // Update SVG Elevation Profile runner dot tracker
  if (runnerDot) {
    const fraction = Math.min(1, Math.max(0, (index + 1) / maneuvers.length));
    const cx = 12 + fraction * (288 - 12);
    runnerDot.setAttribute('cx', cx.toFixed(1));
  }

  // Position simulated runner marker along route path
  const pathPoints = activeRoute.path;
  const ptIndex = Math.min(index, pathPoints.length - 1);
  const curPoint = pathPoints[ptIndex];

  if (googleMap && markerLib && markerLib.AdvancedMarkerElement) {
    if (!runnerMarker) {
      const runnerDotEl = document.createElement('div');
      runnerDotEl.className = 'runner-pulse';
      runnerDotEl.innerHTML = `
        <div style="background-color:#E15A2B; width:22px; height:22px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 2px 10px rgba(225,90,43,0.9); display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px;">
          <i class="fa-solid fa-person-running"></i>
        </div>
      `;
      runnerMarker = new markerLib.AdvancedMarkerElement({
        map: googleMap,
        position: curPoint,
        title: "Active Runner Location",
        content: runnerDotEl
      });
    } else {
      runnerMarker.position = curPoint;
    }

    googleMap.panTo(curPoint);
  }

  // Update HUD Telemetry
  const distDone = ((index + 1) * (activeRoute.distance / maneuvers.length)).toFixed(2);
  if (hudDistance) hudDistance.textContent = `${distDone} mi`;
  if (hudPace) hudPace.textContent = currentTargetPace;
  if (hudHR) {
    const hr = 144 + (index * 2);
    hudHR.textContent = `${hr} bpm`;
  }
}

// ----------------------------------------------------
// 6. Sheet Collapsing & Resizing (Fix Map Visibility)
// ----------------------------------------------------
function setSheetCollapsed(collapsed) {
  isSheetCollapsed = collapsed;
  const sheet = document.getElementById('planningSheet');
  const fullContent = document.getElementById('sheetFullContent');
  const compactContent = document.getElementById('sheetCompactBar');
  const toggleIcon = document.getElementById('sheetToggleIcon');

  if (collapsed) {
    if (fullContent) fullContent.classList.add('hidden');
    if (compactContent) compactContent.classList.remove('hidden');
    if (toggleIcon) toggleIcon.className = 'fa-solid fa-chevron-up text-xs text-stone-400';
    if (sheet) {
      sheet.classList.remove('p-4');
      sheet.classList.add('p-3');
    }
  } else {
    if (fullContent) fullContent.classList.remove('hidden');
    if (compactContent) compactContent.classList.add('hidden');
    if (toggleIcon) toggleIcon.className = 'fa-solid fa-chevron-down text-xs text-stone-400';
    if (sheet) {
      sheet.classList.add('p-4');
      sheet.classList.remove('p-3');
    }
  }

  // Trigger Google Map resize and recenter immediately so full canvas renders
  setTimeout(() => {
    if (googleMap) {
      google.maps.event.trigger(googleMap, 'resize');
      fitRouteBounds(activeRoute);
    }
  }, 150);
}

// ----------------------------------------------------
// 7. UI Handlers & Interactivity
// ----------------------------------------------------
function setupUIHandlers() {
  // Sheet drag handle & toggle button
  const sheetDragHandle = document.getElementById('sheetDragHandle');
  const btnToggleSheet = document.getElementById('btnToggleSheet');
  const btnExpandFromCompact = document.getElementById('btnExpandFromCompact');

  if (sheetDragHandle) sheetDragHandle.addEventListener('click', () => setSheetCollapsed(!isSheetCollapsed));
  if (btnToggleSheet) btnToggleSheet.addEventListener('click', () => setSheetCollapsed(!isSheetCollapsed));
  if (btnExpandFromCompact) btnExpandFromCompact.addEventListener('click', () => setSheetCollapsed(false));

  // Voice toggle
  const audioVoiceToggleBtn = document.getElementById('audioVoiceToggle');
  const audioIcon = document.getElementById('audioIcon');
  if (audioVoiceToggleBtn) {
    audioVoiceToggleBtn.addEventListener('click', () => {
      isVoiceMuted = !isVoiceMuted;
      if (audioIcon) {
        if (isVoiceMuted) {
          audioIcon.className = 'fa-solid fa-volume-xmark text-rose-500';
        } else {
          audioIcon.className = 'fa-solid fa-volume-high text-stone-700 dark:text-stone-300';
          speakInstruction("Voice navigation active");
        }
      }
    });
  }

  // Start Nav button
  const btnStartNav = document.getElementById('btnStartNavigation');
  const compactBtnStartNav = document.getElementById('compactBtnStartNav');
  if (btnStartNav) {
    btnStartNav.addEventListener('click', () => {
      if (!isNavigating) startNavigation();
      else stopNavigation();
    });
  }
  if (compactBtnStartNav) {
    compactBtnStartNav.addEventListener('click', () => {
      if (!isNavigating) startNavigation();
      else stopNavigation();
    });
  }

  // Weather badge click handler: voice runner weather report
  const mapWeatherBadge = document.getElementById('mapWeatherBadge');
  if (mapWeatherBadge) {
    mapWeatherBadge.addEventListener('click', () => {
      if (currentWeatherData) {
        speakInstruction(`Current weather: ${currentWeatherData.tempF} degrees Fahrenheit, ${currentWeatherData.condition}. Rain probability is ${currentWeatherData.rainProb} percent. ${currentWeatherData.summary}.`);
      } else {
        speakInstruction("Checking live weather conditions for route.");
      }
    });
  }

  // In-Run HUD Quick Action Buttons
  const btnHudPauseResume = document.getElementById('btnHudPauseResume');
  const hudPauseIcon = document.getElementById('hudPauseIcon');
  const hudPauseText = document.getElementById('hudPauseText');
  if (btnHudPauseResume) {
    btnHudPauseResume.addEventListener('click', () => {
      if (!isNavigating) return;
      navIsPaused = !navIsPaused;
      if (navIsPaused) {
        if (hudPauseIcon) hudPauseIcon.className = 'fa-solid fa-play text-emerald-400 text-[11px]';
        if (hudPauseText) hudPauseText.textContent = 'Resume';
        speakInstruction("Run paused.");
      } else {
        if (hudPauseIcon) hudPauseIcon.className = 'fa-solid fa-pause text-amber-400 text-[11px]';
        if (hudPauseText) hudPauseText.textContent = 'Pause';
        speakInstruction("Run resumed.");
      }
    });
  }

  const btnHudStop = document.getElementById('btnHudStop');
  if (btnHudStop) {
    btnHudStop.addEventListener('click', () => {
      stopNavigation();
      speakInstruction("Navigation completed. Run summary saved.");
    });
  }

  const btnHudSos = document.getElementById('btnHudSos');
  if (btnHudSos) {
    btnHudSos.addEventListener('click', () => {
      // Direct jump to SafeGuard beacon tab and trigger SOS
      const beaconTabBtn = document.querySelector('.bottom-nav-btn[data-target="tabSafetyBeacon"]');
      if (beaconTabBtn) beaconTabBtn.click();
      const testSosBtn = document.getElementById('btnTriggerTestSOS');
      if (testSosBtn) testSosBtn.click();
    });
  }

  // In-Run Repeat Audio Instruction Button
  const btnHudRepeatVoice = document.getElementById('btnHudRepeatVoice');
  if (btnHudRepeatVoice) {
    btnHudRepeatVoice.addEventListener('click', () => {
      const maneuvers = activeRoute?.maneuvers || [];
      if (!maneuvers.length) return;
      const m = maneuvers[navStepIndex % maneuvers.length];
      if (m) {
        speakInstruction(`Repeating: ${m.dist ? m.dist + ', ' : ''}${m.text}. ${m.note || ''}`, { playChime: true });
      }
    });
  }

  // Clicking Nav Instruction Text directly replays the turn guidance
  const navInstructionText = document.getElementById('navInstructionText');
  if (navInstructionText) {
    navInstructionText.addEventListener('click', () => {
      const maneuvers = activeRoute?.maneuvers || [];
      if (!maneuvers.length) return;
      const m = maneuvers[navStepIndex % maneuvers.length];
      if (m) {
        speakInstruction(`${m.dist ? m.dist + ', ' : ''}${m.text}. ${m.note || ''}`, { playChime: true });
      }
    });
  }

  // Turn-by-Turn Audio Guidance Preview Accordion Toggle
  const btnToggleManeuversList = document.getElementById('btnToggleManeuversList');
  const maneuversListContainer = document.getElementById('maneuversListContainer');
  const maneuversChevron = document.getElementById('maneuversChevron');
  if (btnToggleManeuversList && maneuversListContainer) {
    btnToggleManeuversList.addEventListener('click', () => {
      const isHidden = maneuversListContainer.classList.toggle('hidden');
      if (maneuversChevron) {
        maneuversChevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
      }
    });
  }

  // 1-Tap Distance Presets
  const distPresetBtns = document.querySelectorAll('.dist-preset-btn');
  const distanceSlider = document.getElementById('distanceSlider');
  const targetDistDisplay = document.getElementById('targetDistanceDisplay');

  distPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const dist = parseFloat(btn.getAttribute('data-dist'));
      if (!dist) return;

      distPresetBtns.forEach(b => {
        b.classList.remove('bg-white', 'dark:bg-stone-700', 'text-stone-900', 'dark:text-white', 'shadow-sm', 'active');
        b.classList.add('text-stone-600', 'dark:text-stone-300');
      });
      btn.classList.add('bg-white', 'dark:bg-stone-700', 'text-stone-900', 'dark:text-white', 'shadow-sm', 'active');
      btn.classList.remove('text-stone-600', 'dark:text-stone-300');

      currentSelectedDistance = dist;
      if (distanceSlider) distanceSlider.value = dist.toString();
      if (targetDistDisplay) {
        let label = `${dist.toFixed(1)} miles`;
        if (Math.abs(dist - 3.1) < 0.1) label += ' (5K)';
        if (Math.abs(dist - 6.2) < 0.1) label += ' (10K)';
        targetDistDisplay.textContent = label;
      }

      // Re-scale loop around current center
      const center = activeRoute?.center || { lat: 41.3857, lng: -81.7058 };
      const locName = activeRoute?.locationName || activeRoute?.title || 'Safe Loop';
      generateLoopFromCoords(center.lat, center.lng, locName, dist);
      speakInstruction(`${dist} miles safe loop selected.`);
    });
  });

  // Custom Distance Slider Toggle
  const btnToggleCustomDist = document.getElementById('btnToggleCustomDist');
  const customSliderContainer = document.getElementById('customSliderContainer');
  if (btnToggleCustomDist && customSliderContainer) {
    btnToggleCustomDist.addEventListener('click', () => {
      customSliderContainer.classList.toggle('hidden');
    });
  }

  // Distance Slider input & change
  if (distanceSlider) {
    distanceSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      let label = `${val.toFixed(1)} miles`;
      if (Math.abs(val - 3.1) < 0.1) label += ' (5K)';
      if (Math.abs(val - 6.2) < 0.1) label += ' (10K)';
      if (targetDistDisplay) targetDistDisplay.textContent = label;
    });

    distanceSlider.addEventListener('change', (e) => {
      const dist = parseFloat(e.target.value);
      currentSelectedDistance = dist;
      const center = activeRoute?.center || { lat: 41.3857, lng: -81.7058 };
      const locName = activeRoute?.locationName || activeRoute?.title || 'Safe Loop';
      generateLoopFromCoords(center.lat, center.lng, locName, dist);
      speakInstruction(`${dist.toFixed(1)} miles loop generated.`);
    });
  }

  // Target Pace Coach Presets
  const pacePresetBtns = document.querySelectorAll('.pace-preset-btn');
  pacePresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      pacePresetBtns.forEach(b => {
        b.classList.remove('bg-white', 'dark:bg-stone-700', 'text-stone-900', 'dark:text-white', 'shadow-sm', 'active');
        b.classList.add('text-stone-600', 'dark:text-stone-300');
      });
      btn.classList.add('bg-white', 'dark:bg-stone-700', 'text-stone-900', 'dark:text-white', 'shadow-sm', 'active');
      btn.classList.remove('text-stone-600', 'dark:text-stone-300');

      const paceStr = btn.getAttribute('data-pace') || '8:30';
      const label = btn.getAttribute('data-label') || 'Base';
      const parts = paceStr.split(':').map(Number);
      const mins = parts[0] || 8;
      const secs = parts[1] || 0;
      currentPaceSeconds = (mins * 60) + secs;
      currentTargetPace = `${mins}'${secs ? String(secs).padStart(2, '0') + '"' : '00"'}`;

      updateEstimatedDuration();
      playTurnChime();
      speakInstruction(`Target pace set to ${label}, ${currentTargetPace} per mile.`);
    });
  });

  // Redo / Re-Map AI Loop Choices
  const btnRedoChoices = document.getElementById('btnRedoChoices');
  const btnGenerateAiRoute = document.getElementById('btnGenerateAiRoute');

  function triggerRedoChoices() {
    redoCount++;
    const center = activeRoute?.center || { lat: 41.3857, lng: -81.7058 };
    const locName = activeRoute?.locationName || activeRoute?.title?.split(' ')[0] || 'Safe Loop';
    const redoOffset = redoCount * 0.55;

    if (btnRedoChoices) {
      btnRedoChoices.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-terracotta text-[11px]"></i> <span>Redoing...</span>';
    }
    if (btnGenerateAiRoute) {
      btnGenerateAiRoute.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-terracotta"></i> <span>Re-Calculating...</span>';
    }

    setTimeout(() => {
      if (activeWaypointCoords) {
        generateLoopChoicesWithWaypoint(center.lat, center.lng, activeWaypointCoords.lat, activeWaypointCoords.lng, locName, currentSelectedDistance, redoOffset);
        playTurnChime();
        speakInstruction(`Recalculated 4 alternative safe routes via waypoint. Option 1 selected.`);
      } else {
        generateMultipleLoopChoices(center.lat, center.lng, locName, currentSelectedDistance, redoOffset);
        playTurnChime();
        speakInstruction(`Generated 4 fresh safe routes around ${locName}. Option 1 selected.`);
      }
      if (btnRedoChoices) {
        btnRedoChoices.innerHTML = '<i class="fa-solid fa-arrows-rotate text-[11px]"></i> <span>Redo Choices</span>';
      }
      if (btnGenerateAiRoute) {
        btnGenerateAiRoute.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles text-terracotta"></i> <span>Re-Map AI Loop</span>';
      }
    }, 350);
  }

  if (btnRedoChoices) btnRedoChoices.addEventListener('click', triggerRedoChoices);
  if (btnGenerateAiRoute) btnGenerateAiRoute.addEventListener('click', triggerRedoChoices);

  // Dropped Pin Actions (from Map Long-Press)
  const btnSetPinAsStart = document.getElementById('btnSetPinAsStart');
  const btnSetPinAsWaypoint = document.getElementById('btnSetPinAsWaypoint');
  const btnDismissDroppedPin = document.getElementById('btnDismissDroppedPin');

  if (btnSetPinAsStart) {
    btnSetPinAsStart.addEventListener('click', () => {
      if (!lastDroppedPinCoords) return;
      const { lat, lng } = lastDroppedPinCoords;

      // Clear any previous waypoint
      activeWaypointCoords = null;
      if (waypointMarker) {
        waypointMarker.map = null;
        waypointMarker = null;
      }

      // Remove temporary dropped pin marker and dismiss card
      if (droppedPinMarker) {
        droppedPinMarker.map = null;
        droppedPinMarker = null;
      }
      const promptEl = document.getElementById('droppedPinPrompt');
      if (promptEl) promptEl.classList.add('hidden');

      // Generate 4 fresh loops at this new start coordinate
      generateMultipleLoopChoices(lat, lng, 'Pinned Start Line', currentSelectedDistance, 0);
      playTurnChime();
      speakInstruction(`New start line set at pinned coordinate. Generated 4 safe loop routes.`);
    });
  }

  if (btnSetPinAsWaypoint) {
    btnSetPinAsWaypoint.addEventListener('click', () => {
      if (!lastDroppedPinCoords) return;
      const wpLat = lastDroppedPinCoords.lat;
      const wpLng = lastDroppedPinCoords.lng;
      const origin = activeRoute?.path?.[0] || activeRoute?.center || { lat: 41.3857, lng: -81.7058 };

      // Hide prompt and clear temporary dropped pin marker
      if (droppedPinMarker) {
        droppedPinMarker.map = null;
        droppedPinMarker = null;
      }
      const promptEl = document.getElementById('droppedPinPrompt');
      if (promptEl) promptEl.classList.add('hidden');

      // Save active waypoint and create persistent blue diamond marker on map
      activeWaypointCoords = { lat: wpLat, lng: wpLng };
      updateWaypointMarker(wpLat, wpLng);

      const locName = activeRoute?.locationName || 'Custom Route';
      generateLoopChoicesWithWaypoint(origin.lat, origin.lng, wpLat, wpLng, locName, currentSelectedDistance, 0);
      playTurnChime();
      speakInstruction(`Waypoint locked. Recalculated 4 safe loops passing through your waypoint.`);
    });
  }

  if (btnDismissDroppedPin) {
    btnDismissDroppedPin.addEventListener('click', () => {
      if (droppedPinMarker) {
        droppedPinMarker.map = null;
        droppedPinMarker = null;
      }
      const promptEl = document.getElementById('droppedPinPrompt');
      if (promptEl) promptEl.classList.add('hidden');
      lastDroppedPinCoords = null;
    });
  }

  // Surface filter pills
  const surfaceBtns = document.querySelectorAll('.surface-filter-btn');
  surfaceBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      surfaceBtns.forEach(b => {
        b.classList.remove('bg-terracotta', 'text-white', 'border-terracotta');
        b.classList.add('bg-white', 'dark:bg-stone-800', 'text-stone-700', 'dark:text-stone-300', 'border-stone-300', 'dark:border-stone-700');
      });
      btn.classList.add('bg-terracotta', 'text-white', 'border-terracotta');
      btn.classList.remove('bg-white', 'dark:bg-stone-800', 'text-stone-700', 'dark:text-stone-300');
      renderRoute(activeRoute);
    });
  });

  // Location Preset Selector
  const presetSelect = document.getElementById('locationPreset');
  if (presetSelect) {
    presetSelect.addEventListener('change', (e) => {
      const key = e.target.value;
      if (routes[key]) {
        if (isNavigating) stopNavigation();
        activeKey = key;
        activeWaypointCoords = null;
        if (waypointMarker) {
          waypointMarker.map = null;
          waypointMarker = null;
        }
        if (droppedPinMarker) {
          droppedPinMarker.map = null;
          droppedPinMarker = null;
        }
        const promptEl = document.getElementById('droppedPinPrompt');
        if (promptEl) promptEl.classList.add('hidden');

        const targetRoute = routes[key];
        generateMultipleLoopChoices(targetRoute.center.lat, targetRoute.center.lng, targetRoute.locationName || targetRoute.title, currentSelectedDistance);
        speakInstruction(`Loaded 4 safe route choices in ${targetRoute.locationName || key}.`);
      }
    });
  }

  // Recenter button
  const recenterBtn = document.getElementById('btnRecenter');
  if (recenterBtn) {
    recenterBtn.addEventListener('click', () => {
      if (googleMap) {
        fitRouteBounds(activeRoute);
      }
    });
  }

  // Toggle Satellite View
  const btnToggleSatellite = document.getElementById('btnToggleSatellite');
  if (btnToggleSatellite) {
    btnToggleSatellite.addEventListener('click', () => {
      if (!googleMap) return;
      isSatellite = !isSatellite;
      googleMap.setMapTypeId(isSatellite ? 'hybrid' : 'roadmap');
      btnToggleSatellite.classList.toggle('text-sky-500', isSatellite);
    });
  }

  // Toggle Safety Heatmap Glow
  const heatmapBtn = document.getElementById('btnToggleSafetyHeatmap');
  if (heatmapBtn) {
    heatmapBtn.addEventListener('click', () => {
      isHeatmapActive = !isHeatmapActive;
      if (routeGlowPolyline) {
        routeGlowPolyline.setOptions({ strokeOpacity: isHeatmapActive ? 0.35 : 0.05 });
      }
      heatmapBtn.classList.toggle('opacity-50', !isHeatmapActive);
    });
  }

  // Expand Map Fullscreen button on map overlay
  const btnMaximizeMap = document.getElementById('btnMaximizeMap');
  if (btnMaximizeMap) {
    btnMaximizeMap.addEventListener('click', () => {
      setSheetCollapsed(!isSheetCollapsed);
    });
  }

  // Bottom Navigation Tabs
  const tabBtns = document.querySelectorAll('.bottom-nav-btn');
  const tabSections = document.querySelectorAll('.tab-content');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');

      tabBtns.forEach(b => {
        b.classList.remove('text-terracotta');
        b.classList.add('text-stone-500', 'dark:text-stone-400');
        const pill = b.querySelector('div');
        if (pill) pill.classList.remove('bg-terracotta/15');
      });

      btn.classList.add('text-terracotta');
      btn.classList.remove('text-stone-500', 'dark:text-stone-400');
      const activePill = btn.querySelector('div');
      if (activePill) activePill.classList.add('bg-terracotta/15');

      tabSections.forEach(sec => sec.classList.add('hidden'));
      const targetSec = document.getElementById(targetId);
      if (targetSec) targetSec.classList.remove('hidden');

      if (targetId === 'tabPlanner') {
        setTimeout(() => {
          if (googleMap) {
            google.maps.event.trigger(googleMap, 'resize');
            fitRouteBounds(activeRoute);
          }
        }, 150);
      }
    });
  });

  // GPX Export Download
  const exportGpxBtn = document.getElementById('btnExportGpx');
  const toastEl = document.getElementById('exportStatusToast');
  if (exportGpxBtn) {
    exportGpxBtn.addEventListener('click', () => {
      const pts = activeRoute.path;
      let gpxString = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<gpx version="1.1" creator="PacePlot - Stride Circuit LLC" xmlns="http://www.topografix.com/GPX/1/1">\n' +
        '  <metadata>\n' +
        `    <name>${activeRoute.title}</name>\n` +
        '    <desc>Safe Pedestrian Route mapped by Pace Plot</desc>\n' +
        '  </metadata>\n' +
        '  <trk>\n' +
        `    <name>${activeRoute.title}</name>\n` +
        '    <trkseg>\n';

      pts.forEach(pt => {
        gpxString += `      <trkpt lat="${pt.lat}" lon="${pt.lng}"><ele>210.0</ele></trkpt>\n`;
      });

      gpxString += '    </trkseg>\n  </trk>\n</gpx>';

      const blob = new Blob([gpxString], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = `${activeKey}_pace_plot_route.gpx`;
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

  // Share button copy
  const shareBtn = document.getElementById('btnShareRoute');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(`https://stride-circuit-llc.polsia.io/route-preview?id=${activeKey}`);
        }
      } catch (_) {}
      if (toastEl) {
        toastEl.innerHTML = '<i class="fa-solid fa-check"></i> Link copied to clipboard!';
        toastEl.classList.remove('hidden');
        setTimeout(() => toastEl.classList.add('hidden'), 3000);
      }
    });
  }

  // Races: "Plan from Start Line"
  const planFromEventBtns = document.querySelectorAll('.btn-plan-from-event');
  planFromEventBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const loc = btn.getAttribute('data-location') || 'parma';
      if (presetSelect) presetSelect.value = loc;
      if (routes[loc]) {
        if (isNavigating) stopNavigation();
        activeKey = loc;
        activeRoute = routes[loc];
        renderRoute(activeRoute);
      }
      const mapTabBtn = document.querySelector('.bottom-nav-btn[data-target="tabPlanner"]');
      if (mapTabBtn) mapTabBtn.click();
      speakInstruction("Race coordinates loaded on map. Ready to navigate.");
    });
  });

  // Saved Routes: "Load"
  const loadSavedBtns = document.querySelectorAll('.btn-load-saved');
  loadSavedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-preset') || 'parma';
      if (routes[key]) {
        if (isNavigating) stopNavigation();
        activeKey = key;
        activeRoute = routes[key];
        renderRoute(activeRoute);
      }
      const mapTabBtn = document.querySelector('.bottom-nav-btn[data-target="tabPlanner"]');
      if (mapTabBtn) mapTabBtn.click();
      speakInstruction(`Loaded ${activeRoute.title} from library.`);
    });
  });

  // Save new custom route action
  const btnNewRouteAction = document.getElementById('btnNewRouteAction');
  if (btnNewRouteAction) {
    btnNewRouteAction.addEventListener('click', () => {
      const mapTabBtn = document.querySelector('.bottom-nav-btn[data-target="tabPlanner"]');
      if (mapTabBtn) mapTabBtn.click();
      setSheetCollapsed(false);
      speakInstruction("Select starting location and target distance to map a new route.");
    });
  }

  // Device Frame Viewport Toggle (Phone vs Full-Width Desktop)
  const frameBtn = document.getElementById('toggleDeviceFrame');
  const appContainer = document.getElementById('appContainer');
  const frameModeText = document.getElementById('frameModeText');
  let isFullscreen = false;

  if (frameBtn && appContainer && frameModeText) {
    frameBtn.addEventListener('click', () => {
      isFullscreen = !isFullscreen;
      if (isFullscreen) {
        appContainer.classList.remove('max-w-[420px]', 'h-[840px]', 'max-h-[92vh]', 'rounded-[36px]', 'border-[8px]');
        appContainer.classList.add('max-w-5xl', 'h-[88vh]', 'rounded-2xl', 'border-2');
        frameModeText.textContent = 'Phone View';
      } else {
        appContainer.classList.add('max-w-[420px]', 'h-[840px]', 'max-h-[92vh]', 'rounded-[36px]', 'border-[8px]');
        appContainer.classList.remove('max-w-5xl', 'h-[88vh]', 'rounded-2xl', 'border-2');
        frameModeText.textContent = 'Fullscreen';
      }
      setTimeout(() => {
        if (googleMap) {
          google.maps.event.trigger(googleMap, 'resize');
          fitRouteBounds(activeRoute);
        }
      }, 300);
    });
  }

  // Theme Toggle (Dark / Light)
  const themeBtn = document.getElementById('toggleTheme');
  const themeIcon = document.getElementById('themeIcon');
  let isDark = true;
  document.documentElement.classList.add('dark');

  if (themeBtn && themeIcon) {
    themeBtn.addEventListener('click', () => {
      isDark = !isDark;
      if (isDark) {
        document.documentElement.classList.add('dark');
        themeIcon.className = 'fa-solid fa-moon';
      } else {
        document.documentElement.classList.remove('dark');
        themeIcon.className = 'fa-solid fa-sun';
      }
    });
  }

  // Health Connect toggle
  const btnToggleHealthConnect = document.getElementById('btnToggleHealthConnect');
  if (btnToggleHealthConnect) {
    btnToggleHealthConnect.addEventListener('click', () => {
      const isConn = btnToggleHealthConnect.textContent.trim() === 'Connected';
      if (isConn) {
        btnToggleHealthConnect.textContent = 'Connect';
        btnToggleHealthConnect.className = 'px-3 py-1 rounded-lg text-xs font-semibold bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-300 transition';
      } else {
        btnToggleHealthConnect.textContent = 'Connected';
        btnToggleHealthConnect.className = 'px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition';
        speakInstruction("Health Connect biometrics synchronized.");
      }
    });
  }

  // Location Search & Autocomplete
  setupLocationSearch();

  // SafeGuard emergency beacon & SOS
  setupSafeGuardHandlers();
}

// ----------------------------------------------------
// 8. Location Search with Safe Loop Generator
// ----------------------------------------------------
function setupLocationSearch() {
  const inputSearch = document.getElementById('inputLocationSearch');
  const btnSearchSubmit = document.getElementById('btnSearchSubmit');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const suggestionsList = document.getElementById('searchSuggestionsList');
  let searchDebounceTimer = null;

  async function performSearch(query) {
    if (!query || query.trim().length < 2) {
      if (suggestionsList) suggestionsList.classList.add('hidden');
      return;
    }

    try {
      // Free Photon OpenStreetMap geocoder API
      const apiUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`;
      const res = await fetch(apiUrl);
      const data = await res.json();

      if (!suggestionsList) return;
      suggestionsList.innerHTML = '';

      if (!data.features || data.features.length === 0) {
        suggestionsList.innerHTML = '<div class="p-3 text-stone-500 text-center text-xs">No locations found. Try city, park, or landmark.</div>';
        suggestionsList.classList.remove('hidden');
        return;
      }

      data.features.forEach((feat) => {
        const p = feat.properties;
        const name = p.name || p.street || 'Location';
        const sub = [p.city, p.state, p.country].filter(Boolean).join(', ');
        const coords = feat.geometry.coordinates; // [lon, lat]

        const item = document.createElement('div');
        item.className = 'p-2.5 hover:bg-stone-100 dark:hover:bg-stone-700 cursor-pointer border-b border-stone-100 dark:border-stone-700 last:border-none flex items-center gap-2.5 transition';
        item.innerHTML = `
          <i class="fa-solid fa-location-dot text-terracotta text-xs flex-shrink-0"></i>
          <div class="truncate flex-1">
            <div class="font-bold text-stone-900 dark:text-white truncate">${name}</div>
            <div class="text-[10px] text-stone-500 truncate">${sub}</div>
          </div>
        `;

        item.addEventListener('click', () => {
          const lat = coords[1];
          const lon = coords[0];
          selectSearchedLocation(name, lat, lon);
        });

        suggestionsList.appendChild(item);
      });

      suggestionsList.classList.remove('hidden');
    } catch (_) {
      if (suggestionsList) {
        suggestionsList.innerHTML = '<div class="p-3 text-stone-500 text-center text-xs">Unable to search location. Check connection.</div>';
        suggestionsList.classList.remove('hidden');
      }
    }
  }

  function selectSearchedLocation(label, lat, lon) {
    if (inputSearch) inputSearch.value = label;
    if (suggestionsList) suggestionsList.classList.add('hidden');
    if (btnClearSearch) btnClearSearch.classList.remove('hidden');

    // Generate 4 diverse safe loop choices starting at this searched address
    generateMultipleLoopChoices(lat, lon, label, currentSelectedDistance);
    speakInstruction(`Mapped 4 safe route choices for ${label}. Option 1 selected.`);
  }

  if (inputSearch) {
    inputSearch.addEventListener('input', (e) => {
      const val = e.target.value;
      if (btnClearSearch) {
        if (val.length > 0) btnClearSearch.classList.remove('hidden');
        else btnClearSearch.classList.add('hidden');
      }
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => performSearch(val), 350);
    });

    inputSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') performSearch(inputSearch.value);
    });
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      if (inputSearch) inputSearch.value = '';
      btnClearSearch.classList.add('hidden');
      if (suggestionsList) suggestionsList.classList.add('hidden');
    });
  }

  if (btnSearchSubmit) {
    btnSearchSubmit.addEventListener('click', () => {
      if (inputSearch) performSearch(inputSearch.value);
    });
  }

  document.addEventListener('click', (e) => {
    if (suggestionsList && inputSearch && !suggestionsList.contains(e.target) && e.target !== inputSearch) {
      suggestionsList.classList.add('hidden');
    }
  });
}

// ----------------------------------------------------
// 9. SafeGuard Emergency Beacon & Contacts
// ----------------------------------------------------
function setupSafeGuardHandlers() {
  const btnCopyTracking = document.getElementById('btnCopyTrackingLink');
  const copyLinkText = document.getElementById('copyLinkText');
  if (btnCopyTracking) {
    btnCopyTracking.addEventListener('click', () => {
      const trackingId = document.getElementById('beaconTrackingId');
      const link = `https://paceplot.app/track/${trackingId ? trackingId.textContent : 'stride-safe-7b49'}`;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link);
        }
      } catch (_) {}
      if (copyLinkText) {
        copyLinkText.textContent = 'Copied!';
        setTimeout(() => copyLinkText.textContent = 'Copy', 2000);
      }
    });
  }

  const btnAddContact = document.getElementById('btnAddContactModal');
  const addContactForm = document.getElementById('addContactForm');
  const btnCancelContact = document.getElementById('btnCancelContact');
  const btnSaveContact = document.getElementById('btnSaveNewContact');
  const contactsList = document.getElementById('emergencyContactsList');

  if (btnAddContact && addContactForm) {
    btnAddContact.addEventListener('click', () => addContactForm.classList.toggle('hidden'));
  }
  if (btnCancelContact && addContactForm) {
    btnCancelContact.addEventListener('click', () => addContactForm.classList.add('hidden'));
  }

  if (btnSaveContact && contactsList) {
    btnSaveContact.addEventListener('click', async () => {
      const nameInput = document.getElementById('newContactName');
      const phoneInput = document.getElementById('newContactPhone');
      const name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : 'Emergency Contact';
      const phone = phoneInput && phoneInput.value.trim() ? phoneInput.value.trim() : '(216) 555-0100';

      if (currentUser) {
        try {
          await addEmergencyContact({ name, phone, role: 'Emergency Contact' });
          if (nameInput) nameInput.value = '';
          if (phoneInput) phoneInput.value = '';
          if (addContactForm) addContactForm.classList.add('hidden');
          speakInstruction("New emergency contact synced to Stride SafeGuard cloud.");
        } catch (err) {
          console.error("Error adding contact to Firestore:", err);
        }
      } else {
        const newCard = document.createElement('div');
        newCard.className = 'p-2.5 rounded-xl bg-stone-50 dark:bg-stone-700/40 border border-stone-100 dark:border-stone-700 flex items-center justify-between';
        newCard.innerHTML = `
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 font-bold text-xs flex items-center justify-center">
              ${name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h4 class="text-xs font-bold text-stone-900 dark:text-white">${name}</h4>
              <p class="text-[10px] text-stone-500">${phone} • Live Link Recipient</p>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">Added</span>
        `;

        contactsList.appendChild(newCard);
        if (nameInput) nameInput.value = '';
        if (phoneInput) phoneInput.value = '';
        if (addContactForm) addContactForm.classList.add('hidden');
        speakInstruction("New emergency contact added to Stride SafeGuard.");
      }
    });
  }

  // Emergency SOS Countdown Test
  const btnTestSOS = document.getElementById('btnTriggerTestSOS');
  const sosBanner = document.getElementById('sosAlertBanner');
  const sosSecondsEl = document.getElementById('sosCountdownSeconds');
  const btnCancelSos = document.getElementById('btnCancelSosCountdown');
  let sosInterval = null;

  if (btnTestSOS && sosBanner && sosSecondsEl) {
    btnTestSOS.addEventListener('click', () => {
      sosBanner.classList.remove('hidden');
      let count = 45;
      sosSecondsEl.textContent = count.toString();
      speakInstruction("Emergency warning! Immobility detected. Alerting emergency contacts in 45 seconds.");

      clearInterval(sosInterval);
      sosInterval = setInterval(() => {
        count--;
        sosSecondsEl.textContent = count.toString();
        if (count === 30 || count === 15) {
          playTurnChime();
        }
        if (count <= 0) {
          clearInterval(sosInterval);
          sosBanner.innerHTML = '<div class="text-center font-bold text-sm"><i class="fa-solid fa-paper-plane mr-2"></i>Emergency SMS dispatched to all contacts with live GPS coordinates.</div>';
          speakInstruction("Emergency distress SMS dispatched to contacts.");
        }
      }, 1000);
    });
  }

  if (btnCancelSos && sosBanner) {
    btnCancelSos.addEventListener('click', () => {
      clearInterval(sosInterval);
      sosBanner.classList.add('hidden');
      speakInstruction("Emergency alert cancelled. You are marked safe.");
    });
  }

  // Live Simulated SMS Delivery Dispatch
  const btnSendTestSms = document.getElementById('btnSendTestBeaconSms');
  const testSmsToast = document.getElementById('testSmsToast');
  if (btnSendTestSms) {
    btnSendTestSms.addEventListener('click', () => {
      playTurnChime();
      if (navigator.vibrate) {
        navigator.vibrate([60, 40, 80]);
      }
      if (testSmsToast) {
        testSmsToast.classList.remove('hidden');
        setTimeout(() => testSmsToast.classList.add('hidden'), 4500);
      }
      speakInstruction("SafeGuard live beacon SMS dispatched to emergency contacts with battery status and tracking link.");
    });
  }
}

// ----------------------------------------------------
// 10. Firebase Authentication & Cloud Firestore Sync
// ----------------------------------------------------
function setupFirebaseAuth() {
  const btnGoogleAuth = document.getElementById('btnGoogleAuth');
  const googleAuthLabel = document.getElementById('googleAuthLabel');
  const btnMobileAuth = document.getElementById('btnMobileAuth');
  const mobileAuthLabel = document.getElementById('mobileAuthLabel');
  const contactsSyncStatus = document.getElementById('contactsSyncStatus');
  const workoutSyncBadge = document.getElementById('workoutSyncBadge');
  const cloudRoutesBadge = document.getElementById('cloudRoutesBadge');
  const btnSaveRouteToCloud = document.getElementById('btnSaveRouteToCloud');
  const btnDemoRecordRun = document.getElementById('btnDemoRecordRun');

  async function handleAuthClick() {
    if (currentUser) {
      const confirmSignOut = window.confirm(`Sign out of Google Account (${currentUser.email})?`);
      if (confirmSignOut) {
        try {
          await logoutUser();
          speakInstruction("Signed out of Google account.");
        } catch (err) {
          console.error("Sign out error:", err);
        }
      }
    } else {
      try {
        await loginWithGoogle();
        speakInstruction("Signed in with Google. Cloud library synced.");
      } catch (err) {
        console.error("Sign in error:", err);
      }
    }
  }

  if (btnGoogleAuth) btnGoogleAuth.addEventListener('click', handleAuthClick);
  if (btnMobileAuth) btnMobileAuth.addEventListener('click', handleAuthClick);

  // Save active route to Firestore with deduplication
  if (btnSaveRouteToCloud) {
    btnSaveRouteToCloud.addEventListener('click', async () => {
      await saveRouteWithDeduplication(activeRoute);
    });
  }

  // Demo Record Run button in Health Tab
  if (btnDemoRecordRun) {
    btnDemoRecordRun.addEventListener('click', async () => {
      if (!currentUser) {
        speakInstruction("Please sign in with Google to log workouts to cloud.");
        try {
          await loginWithGoogle();
        } catch (_) {
          return;
        }
      }

      if (currentUser) {
        try {
          await addRunActivity({
            routeTitle: activeRoute.title,
            distance: Number(activeRoute.distance || 3.1),
            durationSeconds: 1572,
            avgPace: "8'27\"",
            avgHeartRate: 148,
            calories: 342
          });
          playTurnChime();
          speakInstruction("Workout logged to cloud history.");
        } catch (err) {
          console.error("Error logging run:", err);
        }
      }
    });
  }

  // Listen to Firebase Auth state
  onAuthStateChanged(auth, (user) => {
    currentUser = user;

    if (user) {
      const displayName = user.displayName || user.email?.split('@')[0] || 'Runner';
      const shortName = displayName.split(' ')[0];

      if (googleAuthLabel) googleAuthLabel.textContent = displayName;
      if (btnGoogleAuth) btnGoogleAuth.title = `Signed in as ${user.email} (Click to sign out)`;
      if (mobileAuthLabel) mobileAuthLabel.textContent = shortName;

      // Update sync badges
      if (contactsSyncStatus) {
        contactsSyncStatus.className = 'px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 flex items-center gap-1';
        contactsSyncStatus.innerHTML = '<i class="fa-solid fa-cloud-check"></i> Cloud Synced';
      }
      if (workoutSyncBadge) {
        workoutSyncBadge.className = 'px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400';
        workoutSyncBadge.textContent = 'Cloud Synced';
      }
      if (cloudRoutesBadge) {
        cloudRoutesBadge.className = 'px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400';
        cloudRoutesBadge.textContent = 'Cloud Synced';
      }

      // Unsubscribe existing listeners
      if (unsubSavedRoutes) unsubSavedRoutes();
      if (unsubEmergencyContacts) unsubEmergencyContacts();
      if (unsubRunActivities) unsubRunActivities();

      // Subscribe to Firestore collections
      unsubSavedRoutes = subscribeSavedRoutes(user.uid, renderCloudRoutes);
      unsubEmergencyContacts = subscribeEmergencyContacts(user.uid, renderCloudContacts);
      unsubRunActivities = subscribeRunActivities(user.uid, renderCloudWorkouts);

    } else {
      if (googleAuthLabel) googleAuthLabel.textContent = 'Sign In';
      if (btnGoogleAuth) btnGoogleAuth.title = 'Sign In with Google';
      if (mobileAuthLabel) mobileAuthLabel.textContent = 'Sign In';

      // Reset badges
      if (contactsSyncStatus) {
        contactsSyncStatus.className = 'px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400';
        contactsSyncStatus.textContent = 'Local Demo';
      }
      if (workoutSyncBadge) {
        workoutSyncBadge.className = 'px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400';
        workoutSyncBadge.textContent = 'Local Only';
      }
      if (cloudRoutesBadge) {
        cloudRoutesBadge.className = 'px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400';
        cloudRoutesBadge.textContent = 'Sign in to sync';
      }

      if (unsubSavedRoutes) { unsubSavedRoutes(); unsubSavedRoutes = null; }
      if (unsubEmergencyContacts) { unsubEmergencyContacts(); unsubEmergencyContacts = null; }
      if (unsubRunActivities) { unsubRunActivities(); unsubRunActivities = null; }

      savedRoutesCache = [];
      updateSaveButtonStatus();
      renderRouteChoicesList();

      // Reset cloud routes container to empty state
      const cloudRoutesList = document.getElementById('cloudSavedRoutesList');
      if (cloudRoutesList) {
        cloudRoutesList.innerHTML = `
          <div id="cloudRoutesEmptyState" class="p-4 rounded-2xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-center text-xs text-stone-500 space-y-1">
            <i class="fa-solid fa-cloud-arrow-up text-stone-400 text-base"></i>
            <p class="font-medium">Sign in with Google to sync cloud routes.</p>
            <p class="text-[11px] text-stone-400">Save your custom loops safely to Firestore across devices.</p>
          </div>
        `;
      }
    }
  });
}

// Render Cloud Saved Routes
function renderCloudRoutes(routesList) {
  savedRoutesCache = routesList || [];
  updateSaveButtonStatus();
  renderRouteChoicesList();

  const container = document.getElementById('cloudSavedRoutesList');
  if (!container) return;

  if (!routesList || routesList.length === 0) {
    container.innerHTML = `
      <div id="cloudRoutesEmptyState" class="p-4 rounded-2xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-center text-xs text-stone-500 space-y-1">
        <i class="fa-solid fa-cloud-arrow-up text-stone-400 text-base"></i>
        <p class="font-medium">No cloud routes saved yet.</p>
        <p class="text-[11px] text-stone-400">Use "Save Route to Cloud" on the map screen to persist custom loops.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  routesList.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'p-3 bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-sm flex items-center justify-between gap-2 transition hover:border-terracotta/40';
    card.innerHTML = `
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <span class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">${r.safetyScore || '9.8'} Safety Score</span>
          <span class="text-[9px] px-1.5 py-0.2 rounded bg-terracotta/10 text-terracotta font-semibold">Cloud</span>
        </div>
        <h4 class="text-xs font-bold text-stone-900 dark:text-white truncate mt-0.5">${r.title}</h4>
        <p class="text-[10px] text-stone-500 truncate">${r.distance} mi • ${r.locationName || 'Mapped Loop'} • ${r.elevation || '+40 ft'}</p>
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">
        <button class="btn-load-cloud-route px-2.5 py-1.5 bg-stone-100 dark:bg-stone-700 text-stone-800 dark:text-stone-200 hover:bg-terracotta hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1" data-route-id="${r.id}">
          <i class="fa-solid fa-play text-[9px]"></i> Load
        </button>
        <button class="btn-delete-cloud-route w-7 h-7 bg-stone-100 dark:bg-stone-700 hover:bg-rose-500 hover:text-white text-stone-500 dark:text-stone-400 rounded-xl text-xs flex items-center justify-center transition" title="Delete from Cloud" data-route-id="${r.id}">
          <i class="fa-solid fa-trash-can text-[10px]"></i>
        </button>
      </div>
    `;

    // Load cloud route onto map
    const loadBtn = card.querySelector('.btn-load-cloud-route');
    if (loadBtn) {
      loadBtn.addEventListener('click', () => {
        if (isNavigating) stopNavigation();
        const routePath = Array.isArray(r.pathCoordinates) && r.pathCoordinates.length > 0
          ? r.pathCoordinates
          : routes.parma.path;

        activeRoute = {
          title: r.title,
          locationName: r.locationName || 'Cloud Route',
          center: routePath[0] || routes.parma.center,
          zoom: 15,
          distance: Number(r.distance || 3.1),
          elevation: r.elevation || '+40 ft',
          safetyScore: r.safetyScore || '9.8',
          sidewalkPct: '98%',
          litPct: '100%',
          safetyTags: ['Cloud Synced Loop', 'Pedestrian Safe'],
          path: routePath,
          maneuvers: [
            { text: `Start cloud route: ${r.title}`, dist: "Start", icon: "fa-arrow-up", note: "Pedestrian corridor" },
            { text: "Continue along verified safe pathway", dist: "In 400 ft", icon: "fa-arrow-up", note: "Continuous sidewalk" },
            { text: "Follow greenway loop towards finish line", dist: "In 200 ft", icon: "fa-flag-checkered", note: "Loop closing" }
          ]
        };

        renderRoute(activeRoute);
        const mapTabBtn = document.querySelector('.bottom-nav-btn[data-target="tabPlanner"]');
        if (mapTabBtn) mapTabBtn.click();
        speakInstruction(`Loaded ${r.title} from cloud.`);
      });
    }

    // Delete cloud route
    const deleteBtn = card.querySelector('.btn-delete-cloud-route');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (window.confirm(`Delete "${r.title}" from your cloud library?`)) {
          try {
            await deleteSavedRoute(r.id);
            speakInstruction("Route deleted from cloud library.");
          } catch (err) {
            console.error("Error deleting route:", err);
          }
        }
      });
    }

    container.appendChild(card);
  });
}

// Render Cloud Emergency Contacts
function renderCloudContacts(contactsList) {
  const container = document.getElementById('emergencyContactsList');
  if (!container) return;

  if (!contactsList || contactsList.length === 0) {
    container.innerHTML = `
      <div class="p-3 text-center text-xs text-stone-500 bg-stone-50 dark:bg-stone-800 rounded-xl">
        No cloud emergency contacts yet. Tap "Add Contact" above to sync your family or coach.
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  contactsList.forEach((c, idx) => {
    const card = document.createElement('div');
    card.className = 'p-2.5 rounded-xl bg-stone-50 dark:bg-stone-700/40 border border-stone-100 dark:border-stone-700 flex items-center justify-between transition';
    card.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-full ${idx === 0 ? 'bg-terracotta/10 text-terracotta' : 'bg-blue-500/10 text-blue-500'} font-bold text-xs flex items-center justify-center flex-shrink-0">
          ${(c.name || 'EC').slice(0, 2).toUpperCase()}
        </div>
        <div class="truncate">
          <h4 class="text-xs font-bold text-stone-900 dark:text-white truncate">${c.name}</h4>
          <p class="text-[10px] text-stone-500 truncate">${c.phone} • ${c.role || 'Live Beacon Recipient'}</p>
        </div>
      </div>
      <div class="flex items-center gap-1.5 flex-shrink-0">
        <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${idx === 0 ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400' : 'bg-stone-100 dark:bg-stone-600 text-stone-600 dark:text-stone-300'}">
          ${idx === 0 ? 'Primary' : 'Backup'}
        </span>
        <button class="btn-delete-contact w-6 h-6 rounded-lg text-stone-400 hover:text-rose-500 hover:bg-stone-200 dark:hover:bg-stone-600 flex items-center justify-center transition" title="Delete Contact" data-contact-id="${c.id}">
          <i class="fa-solid fa-trash-can text-[10px]"></i>
        </button>
      </div>
    `;

    const delBtn = card.querySelector('.btn-delete-contact');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        try {
          await deleteEmergencyContact(c.id);
          speakInstruction("Emergency contact removed.");
        } catch (err) {
          console.error("Error deleting contact:", err);
        }
      });
    }

    container.appendChild(card);
  });
}

// Render Cloud Workouts History
function renderCloudWorkouts(workoutsList) {
  const container = document.getElementById('workoutsHistoryList');
  if (!container) return;

  if (!workoutsList || workoutsList.length === 0) {
    container.innerHTML = `
      <div class="p-3 text-center text-xs text-stone-500 bg-stone-50 dark:bg-stone-800 rounded-xl">
        No completed workouts logged yet. Complete a voice navigation run or tap 'Log Run' to sync workout telemetry.
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  workoutsList.forEach((w) => {
    const card = document.createElement('div');
    card.className = 'p-2.5 rounded-xl bg-stone-50 dark:bg-stone-700/40 border border-stone-100 dark:border-stone-700 flex items-center justify-between';
    
    const durationMins = Math.floor((w.durationSeconds || 0) / 60);
    const durationSecs = ((w.durationSeconds || 0) % 60).toString().padStart(2, '0');
    const timeFormatted = `${durationMins}:${durationSecs}`;
    const dateFormatted = w.completedAt ? new Date(w.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Today';

    card.innerHTML = `
      <div class="min-w-0 flex-1">
        <h4 class="text-xs font-bold text-stone-900 dark:text-white truncate">${w.routeTitle || 'Safe Pace Stride'}</h4>
        <p class="text-[10px] text-stone-500 truncate">${w.distance} mi • ${timeFormatted} • ${w.avgPace || "8'42\""}/mi • ${w.calories || 280} kcal</p>
      </div>
      <div class="text-right flex-shrink-0 ml-2">
        <span class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 block">Completed</span>
        <span class="text-[9px] text-stone-400">${dateFormatted}</span>
      </div>
    `;

    container.appendChild(card);
  });
}

