// ----------------------------------------------------
// Pace Plot — Centralized Application State Store
// ----------------------------------------------------

export const store = {
  activeKey: 'parma',
  activeRoute: null,
  isVoiceMuted: false,
  isNavigating: false,
  navInterval: null,
  navStepIndex: 0,
  isSheetCollapsed: false,

  // Google Maps & Leaflet instances
  googleMap: null,
  googleMapsLib: null,
  markerLib: null,
  startMarker: null,
  runnerMarker: null,
  routeGlowPolyline: null,
  routeCorePolyline: null,
  isSatellite: false,
  isHeatmapActive: true,

  // Firebase & Firestore State
  currentUser: null,
  unsubSavedRoutes: null,
  unsubEmergencyContacts: null,
  unsubRunActivities: null,
  unsubUserProfile: null,
  unsubBeaconSession: null,

  // Navigation & Route Planner State
  navSecondsElapsed: 0,
  navIsPaused: false,
  currentSelectedDistance: 3.1,
  currentTargetPace: "8'30\"",
  currentPaceSeconds: 510,
  currentRouteChoices: [],
  selectedChoiceIndex: 0,
  redoCount: 0,
  savedRoutesCache: [],
  currentWeatherData: null,
  droppedPinMarker: null,
  waypointMarker: null,
  lastDroppedPinCoords: null,
  activeWaypointCoords: null,
  longPressTimer: null,
  isLongPressTriggered: false,

  // Web Speech API & Audio State
  speechVoices: [],
  selectedVoice: null,
  currentUtterance: null,
  audioCtx: null,

  // Custom Training Plan & Heart Rate Zones State
  currentGoalId: '5k',
  currentPlanWeek: 0,
  activeTrainingPlan: null,
  historicalWorkoutsCache: [],
  currentLiveSensorHr: 148,
  isBleHrConnected: false,
  bleHrDevice: null,

  // Real GPS Tracking, WakeLock & Breadcrumb State
  gpsWatchId: null,
  wakeLockSentinel: null,
  isSimulationMode: false,
  liveGpsDistanceMiles: 0,
  lastAcceptedGpsCoord: null,
  liveGpsBreadcrumbCoords: [],
  gpsBreadcrumbPolyline: null,
  currentUserGpsCoord: null,
  deferredPwaInstallPrompt: null,

  // Surface Filter, SafeGuard Beacon & Off-Route State
  activeSurfaceFilter: 'trail',
  beaconSessionId: 'stride-safe-7b49',
  lastRerouteTimestamp: 0,
  isOffRoute: false,
};

// HTML Entity Escaping Helper (DOM XSS Defense)
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
