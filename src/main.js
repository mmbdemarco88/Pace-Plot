// Pace Plot - Safe Run & Walk Navigation
// Stride Circuit LLC
import './styles/main.css';
import 'leaflet/dist/leaflet.css';
import { store, escapeHtml } from './state/store.js';
import {
  auth,
  loginWithGoogle,
  logoutUser,
  onAuthStateChanged,
  testFirestoreConnection,
  subscribeSavedRoutes,
  deleteSavedRoute,
  subscribeEmergencyContacts,
  deleteEmergencyContact,
  subscribeRunActivities,
  addRunActivity,
  enqueueOfflineWorkout,
  flushOfflineWorkoutQueue,
  subscribeUserProfile
} from './firebase.js';
import {
  BADGES_CONFIG,
  getUnlockedBadges,
  renderBadgesGrid,
  evaluateBadgesFromWorkouts
} from './badges.js';
import {
  SUBSCRIPTION_STATUS,
  getSubscriptionState,
  startFreeTrial,
  openUpgradeModal,
  setupPremiumListeners,
  subscribePremiumState,
  updatePremiumUI,
  hydrateSubscriptionFromCloud
} from './premium.js';
import {
  generate4WeekPlan,
  saveActivePlan,
  loadActivePlan,
  hydrateTrainingPlanFromCloud,
  deriveHistoricalMaxHeartRate,
  calculateHeartRateZones,
  getStoredMaxHrOverride,
  setStoredMaxHrOverride,
  ZONE_HEX_PALETTE
} from './trainingPlan.js';
import {
  getSpotifyPlayerState,
  syncPlaylistToPaceSeconds
} from './spotify.js';
import {
  initSpotifyMiniPlayerUI,
  syncSpotifyHudAndPillUI
} from './spotifyUI.js';
import { THEME_MODES, getStoredTheme, initThemeController } from './theme.js';
import { renderD3HeartRateZonesBarChart } from './hrZoneChart.js';
import {
  getUnitSystem,
  setUnitSystem,
  onUnitSystemChange,
  formatDistance,
  formatPaceValue,
  formatTemperature,
  formatWindSpeed,
  milesToKm
} from './units.js';
import {
  initSpeechSynthesis,
  playTurnChime,
  speakInstruction,
  toggleVoiceMute,
  syncVoiceMuteUI
} from './voiceNav.js';
import { setupLocationSearch } from './geocoder.js';
import { setupSafeGuardHandlers, initLiveBeaconViewer } from './safeGuard.js';
import { setupBleHeartRateMonitor } from './bleHeartRate.js';
import {
  ROUTES,
  initGoogleMaps,
  renderRoute,
  fitRouteBounds,
  updateRouteInfoUI,
  generateMultipleLoopChoices,
  generateLoopFromCoords,
  generateLoopChoicesWithWaypoint,
  renderRouteChoicesList,
  zoomMapOntoCoordinate,
  updateWaypointMarker,
  clearDroppedPinMarker,
  clearWaypointMarker,
  saveRouteWithDeduplication,
  updateSaveButtonStatus,
  updateEstimatedDuration,
  syncHudGpsModeBadge,
  startNavigation,
  stopNavigation,
  setSheetCollapsed,
  setupMapAndRouteHandlers,
  setOnWorkoutsUpdatedCallback
} from './mapController.js';

// ----------------------------------------------------
// Google Maps Quota Handling (Tier 1 & 2 Defense)
// ----------------------------------------------------
if (typeof window !== 'undefined') {
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
}

// ----------------------------------------------------
// App Boot
// ----------------------------------------------------
function startApp() {
  setupClock();
  initSpeechSynthesis();
  initSafetyDisclaimer();
  initBadgesAndPremium();
  initTrainingPlan();
  renderHeartRateZonesUI();
  setOnWorkoutsUpdatedCallback(renderHeartRateZonesUI);
  initSpotifyMiniPlayerUI();
  setupUIHandlers();
  setupUnitSystemUI();
  setupMapAndRouteHandlers();
  setupLocationSearch({
    onSelectLocation: ({ fullAddress, lat, lng }) => {
      zoomMapOntoCoordinate({ lat, lng }, 16);
      generateMultipleLoopChoices(lat, lng, fullAddress, store.currentSelectedDistance);
      zoomMapOntoCoordinate({ lat, lng }, 16);
    }
  });
  setupSafeGuardHandlers();
  setupBleHeartRateMonitor({
    onHeartRateUpdate: () => renderHeartRateZonesUI()
  });
  initLiveBeaconViewer();
  initGoogleMaps();
  setupFirebaseAuth();
  testFirestoreConnection();
  initServiceWorker();
}

function initServiceWorker() {
  const statusBadge = document.getElementById('pwaDiagnosticStatusBadge');
  const manifestCheckEl = document.getElementById('pwaManifestCheckText');
  const swCheckEl = document.getElementById('pwaSwCheckText');
  const btnTopInstall = document.getElementById('btnTopInstallPwa');
  const topInstallLabel = document.getElementById('topInstallPwaLabel');
  const btnSettingsInstall = document.getElementById('btnSettingsInstallPwa');
  const settingsInstallLabel = document.getElementById('settingsInstallPwaLabel');
  const btnDownloadTwa = document.getElementById('btnDownloadTwaBundle');

  let manifestVerified = false;
  let swVerified = false;

  function updateDiagnosticBadge() {
    if (!statusBadge) return;
    if (manifestVerified && swVerified) {
      statusBadge.textContent = 'PWA & TWA Ready';
      statusBadge.className =
        'px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[9px] font-mono font-bold';
    } else if (manifestVerified || swVerified) {
      statusBadge.textContent = 'Partial Ready';
      statusBadge.className =
        'px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[9px] font-mono font-bold';
    }
  }

  fetch('/manifest.json', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((data) => {
      const hasIcons = Array.isArray(data?.icons) && data.icons.length >= 2;
      const hasScreenshots = Array.isArray(data?.screenshots) && data.screenshots.length >= 2;
      const hasShortcuts = Array.isArray(data?.shortcuts) && data.shortcuts.length >= 1;
      manifestVerified = Boolean(data && data.name && hasIcons && hasScreenshots && hasShortcuts);
      if (manifestCheckEl) {
        manifestCheckEl.textContent = manifestVerified
          ? `Verified · ${data.icons.length} Icons · ${data.screenshots.length} Shots`
          : 'Manifest Incomplete';
      }
      updateDiagnosticBadge();
    })
    .catch(() => {
      if (manifestCheckEl) manifestCheckEl.textContent = 'Check /manifest.json';
    });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(async (reg) => {
        swVerified = true;
        if (swCheckEl) swCheckEl.textContent = 'Active · Sync & Push Ready';
        updateDiagnosticBadge();

        try {
          if ('sync' in reg && reg.sync) {
            await reg.sync.register('paceplot-workout-sync');
          }
        } catch (_) {}

        try {
          if ('periodicSync' in reg && reg.periodicSync && navigator.permissions) {
            const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
            if (status.state === 'granted') {
              await reg.periodicSync.register('paceplot-weather-safety-sync', {
                minInterval: 12 * 60 * 60 * 1000
              });
            }
          }
        } catch (_) {}
      })
      .catch(() => {
        if (swCheckEl) swCheckEl.textContent = 'Registration Notice';
      });

    navigator.serviceWorker.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;
      if (msg.type === 'PACEPLOT_NOTIFICATION_ACTION') {
        if (msg.action === 'view-zones') {
          const healthTabBtn = document.querySelector('.bottom-nav-btn[data-target="tabHealth"]');
          if (healthTabBtn) healthTabBtn.click();
        } else if (msg.action === 'start-run' && !store.isNavigating) {
          startNavigation();
        }
      } else if (msg.type === 'PACEPLOT_BACKGROUND_SYNC_COMPLETE') {
        void flushOfflineWorkoutQueue();
      }
    });
  }

  // F12: Flush queued offline workouts when connectivity returns
  window.addEventListener('online', () => {
    void flushOfflineWorkoutQueue();
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    store.deferredPwaInstallPrompt = e;
    if (topInstallLabel) topInstallLabel.textContent = 'Install App';
    if (settingsInstallLabel) settingsInstallLabel.textContent = 'Install Pace Plot App';
  });

  window.addEventListener('appinstalled', () => {
    store.deferredPwaInstallPrompt = null;
    if (topInstallLabel) topInstallLabel.textContent = 'App Installed';
    if (settingsInstallLabel) settingsInstallLabel.textContent = 'Installed on Device';
    speakInstruction('Pace Plot app installed to your home screen.');
  });

  async function triggerPwaInstall() {
    if (store.deferredPwaInstallPrompt) {
      store.deferredPwaInstallPrompt.prompt();
      try {
        await store.deferredPwaInstallPrompt.userChoice;
      } catch (_) {}
      store.deferredPwaInstallPrompt = null;
    } else {
      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
      const msg = isIos
        ? 'On iPhone/iPad: Tap Share in Safari and select "Add to Home Screen" to install Pace Plot.'
        : 'In Chrome/Edge: Open the browser menu (⋮) and click "Install Pace Plot" or "Add to Home Screen".';
      if (settingsInstallLabel) settingsInstallLabel.textContent = 'Use Browser Menu -> Install';
      speakInstruction(msg, { forceSpeak: true });
    }
  }

  if (btnTopInstall) btnTopInstall.addEventListener('click', triggerPwaInstall);
  if (btnSettingsInstall) btnSettingsInstall.addEventListener('click', triggerPwaInstall);

  if (btnDownloadTwa) {
    btnDownloadTwa.addEventListener('click', () => {
      const twaConfig = {
        packageId: 'com.stridecircuit.paceplot',
        host: window.location.host,
        name: 'Pace Plot',
        launcherName: 'Pace Plot',
        display: 'standalone',
        themeColor: '#0B0C0E',
        backgroundColor: '#0B0C0E',
        startUrl: '/?source=twa',
        iconUrl: `${window.location.origin}/pwa-512x512.png`,
        maskableIconUrl: `${window.location.origin}/pwa-maskable-512x512.png`,
        shortcuts: [
          { name: 'Start Safe Loop', short_name: 'Start Run', url: '/?action=start-run' },
          { name: 'SafeGuard Beacon', short_name: 'SafeGuard', url: '/?tab=safeguard' }
        ]
      };
      const blob = new Blob([JSON.stringify(twaConfig, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'twa-manifest-paceplot.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      speakInstruction('Generated Android Play Store TWA configuration bundle.');
    });
  }

  const btnSettingsExportGpx = document.getElementById('btnSettingsExportGpx');
  if (btnSettingsExportGpx) {
    btnSettingsExportGpx.addEventListener('click', () => {
      const btnExportGpx = document.getElementById('btnExportGpx');
      if (btnExportGpx) btnExportGpx.click();
    });
  }
}

function initSafetyDisclaimer() {
  const modal = document.getElementById('modalSafetyDisclaimer');
  const checkbox = document.getElementById('checkAcknowledgeSafety');
  const btnAccept = document.getElementById('btnAcceptDisclaimer');
  const btnClose = document.getElementById('btnCloseDisclaimerModal');
  const btnTopSafety = document.getElementById('btnTopSafetyDisclaimer');
  const btnHealthSafety = document.getElementById('btnHealthSafetyDisclaimer');
  const btnSettingsSafety = document.getElementById('btnSettingsSafetyDisclaimer');
  if (!modal) return;

  const STORAGE_KEY = 'paceplot_safety_accepted_v1';
  const hasAccepted = localStorage.getItem(STORAGE_KEY) === 'true';
  if (!hasAccepted) {
    modal.classList.remove('hidden');
  }

  if (checkbox && btnAccept) {
    checkbox.addEventListener('change', (e) => {
      const checked = e.target.checked;
      btnAccept.disabled = !checked;
      if (checked) {
        btnAccept.classList.remove('bg-stone-700', 'text-stone-400', 'cursor-not-allowed');
        btnAccept.classList.add('bg-terracotta', 'hover:bg-terracotta-hover', 'text-white', 'cursor-pointer', 'shadow-terracotta/25');
      } else {
        btnAccept.classList.add('bg-stone-700', 'text-stone-400', 'cursor-not-allowed');
        btnAccept.classList.remove('bg-terracotta', 'hover:bg-terracotta-hover', 'text-white', 'cursor-pointer', 'shadow-terracotta/25');
      }
    });
  }

  if (btnAccept) {
    btnAccept.addEventListener('click', () => {
      if (checkbox && !checkbox.checked) return;
      localStorage.setItem(STORAGE_KEY, 'true');
      modal.classList.add('hidden');
      playTurnChime();
      speakInstruction('Safety guidelines acknowledged. Enjoy your run with Pace Plot.');
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  function reopenSafetyModal() {
    const settingsModal = document.getElementById('modalAppSettings');
    if (settingsModal) settingsModal.classList.add('hidden');
    if (checkbox) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));
    }
    modal.classList.remove('hidden');
  }
  if (btnTopSafety) btnTopSafety.addEventListener('click', reopenSafetyModal);
  if (btnHealthSafety) btnHealthSafety.addEventListener('click', reopenSafetyModal);
  if (btnSettingsSafety) btnSettingsSafety.addEventListener('click', reopenSafetyModal);
}

function initBadgesAndPremium() {
  renderBadgesGrid('badgesGridContainer', 'badgesProgressCount', 'badgesProgressBar');
  updatePremiumUI();
  setupPremiumListeners();
  subscribePremiumState(() => {
    updatePremiumUI();
    syncSpotifyHudAndPillUI(getSpotifyPlayerState());
  });
}

function getHistoricalPaceSeconds() {
  return deriveHistoricalPaceSeconds(store.historicalWorkoutsCache);
}

function deriveHistoricalPaceSeconds(workouts) {
  if (!Array.isArray(workouts) || workouts.length === 0) return 507;
  let totalDist = 0;
  let totalDuration = 0;
  workouts.forEach((w) => {
    if (w.distance > 0 && w.durationSeconds > 0) {
      totalDist += Number(w.distance);
      totalDuration += Number(w.durationSeconds);
    }
  });
  if (totalDist > 0 && totalDuration > 0) {
    return Math.round(totalDuration / totalDist);
  }
  return 507;
}

function initTrainingPlan() {
  const savedPlan = loadActivePlan();
  if (savedPlan && savedPlan.weeks && savedPlan.weeks.length === 4) {
    store.activeTrainingPlan = savedPlan;
    store.currentGoalId = savedPlan.goalId || '5k';
  } else {
    store.activeTrainingPlan = generate4WeekPlan(store.currentGoalId, getHistoricalPaceSeconds());
    saveActivePlan(store.activeTrainingPlan);
  }
  updateTrainingPlanUI();
}

function renderHeartRateZonesUI() {
  const overrideVal = getStoredMaxHrOverride();
  const maxHrData = deriveHistoricalMaxHeartRate(store.historicalWorkoutsCache, overrideVal);
  const activeMaxHr = maxHrData.effectiveMaxHr;
  const zoneData = calculateHeartRateZones(activeMaxHr, store.historicalWorkoutsCache, store.currentLiveSensorHr || 148);
  const zones = zoneData.zones;

  const badgeEl = document.getElementById('detectedMaxHrBadge');
  const sourceLabelEl = document.getElementById('maxHrSourceLabel');
  const liveHrLabelEl = document.getElementById('liveHrDisplayHealth');
  const maxHrRangeInput = document.getElementById('maxHrCalibrationRange');
  const maxHrDisplayLabel = document.getElementById('maxHrCalibrationValue');

  if (badgeEl) badgeEl.textContent = `${activeMaxHr} bpm Max`;
  if (sourceLabelEl) {
    if (maxHrData.isCustomOverride) {
      sourceLabelEl.textContent = `Custom Calibrated (${maxHrData.effectiveMaxHr} bpm)`;
    } else {
      sourceLabelEl.textContent = `Historical Peak (${maxHrData.totalWorkoutsAnalyzed} workouts · ${maxHrData.detectedMaxHr} bpm)`;
    }
  }
  if (liveHrLabelEl) liveHrLabelEl.textContent = `${store.currentLiveSensorHr} bpm`;
  if (maxHrRangeInput) maxHrRangeInput.value = activeMaxHr;
  if (maxHrDisplayLabel) maxHrDisplayLabel.textContent = `${activeMaxHr} bpm`;

  const currentZone = zoneData.activeZone || zones.find((z) => store.currentLiveSensorHr >= z.minBpm && store.currentLiveSensorHr <= z.maxBpm) || zones[2];
  const zoneBadge = document.getElementById('currentZoneBadge');
  if (zoneBadge && currentZone) {
    const currentZoneColor = ZONE_HEX_PALETTE[currentZone.zone]?.fill || '#10b981';
    zoneBadge.textContent = `Z${currentZone.zone} · ${currentZone.name}`;
    zoneBadge.style.backgroundColor = `${currentZoneColor}20`;
    zoneBadge.style.color = currentZoneColor;
    zoneBadge.style.borderColor = `${currentZoneColor}40`;
  }

  const totalZoneMinutes = Math.round((zoneData.totalDurationSeconds || 0) / 60);

  const totalWeeklyMinutesEl = document.getElementById('hrZonesTotalWeeklyTime');
  if (totalWeeklyMinutesEl) {
    const hrs = Math.floor(totalZoneMinutes / 60);
    const mins = totalZoneMinutes % 60;
    totalWeeklyMinutesEl.textContent = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  }

  const d3TotalBadge = document.getElementById('d3ChartTotalTimeBadge');
  if (d3TotalBadge) {
    d3TotalBadge.textContent = `${totalZoneMinutes}m total`;
  }

  zones.forEach((z) => {
    const seg = document.getElementById(`hrBarZ${z.zone}`);
    if (seg) {
      const pct = Math.max(4, z.percentage || 0);
      seg.style.width = `${pct}%`;
      seg.title = `Zone ${z.zone} (${z.name}): ${Math.round((z.durationSeconds || 0) / 60)} min (${pct}%)`;
    }
  });

  const chartContainer = document.getElementById('d3HrZonesChartContainer') || document.getElementById('hrZonesD3ChartContainer');
  renderD3HeartRateZonesBarChart(chartContainer, zoneData);

  const breakdownContainer = document.getElementById('hrZonesBreakdownList');
  if (breakdownContainer) {
    breakdownContainer.innerHTML = '';
    zones.forEach((z) => {
      const mins = Math.round((z.durationSeconds || 0) / 60);
      const pct = z.percentage || 0;
      const isCurrent = currentZone && currentZone.zone === z.zone;
      const fillHex = ZONE_HEX_PALETTE[z.zone]?.fill || '#10b981';

      const row = document.createElement('div');
      row.className = `p-2 rounded-xl border transition flex items-center justify-between text-xs ${
        isCurrent
          ? 'bg-stone-100 dark:bg-stone-700/70 border-terracotta/50 shadow-sm'
          : 'bg-stone-50/70 dark:bg-stone-900/40 border-stone-200/60 dark:border-stone-700/60'
      }`;

      row.innerHTML = `
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <div class="w-3 h-3 rounded-full flex-shrink-0" style="background-color: ${fillHex}"></div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="font-bold text-stone-900 dark:text-white">Z${z.zone} · ${escapeHtml(z.name)}</span>
              ${isCurrent ? '<span class="px-1.5 py-0.2 rounded bg-terracotta text-white text-[9px] font-bold">LIVE</span>' : ''}
            </div>
            <p class="text-[10px] text-stone-500 dark:text-stone-400 truncate">${escapeHtml(z.benefit || '')}</p>
          </div>
        </div>
        <div class="text-right flex-shrink-0 ml-2">
          <p class="font-mono font-bold text-stone-900 dark:text-white">${z.minBpm}–${z.maxBpm} bpm</p>
          <p class="text-[10px] text-stone-500 font-mono">${mins} min (${pct}%)</p>
        </div>
      `;
      breakdownContainer.appendChild(row);
    });
  }
}

function updateTrainingPlanUI() {
  if (!store.activeTrainingPlan) return;

  const basePaceDisplay = document.getElementById('planBasePaceDisplay');
  const predictedFinish = document.getElementById('planPredictedFinish');
  const zoneEasyPace = document.getElementById('zoneEasyPace');
  const zoneTempoPace = document.getElementById('zoneTempoPace');
  const zoneIntervalPace = document.getElementById('zoneIntervalPace');
  const trainingGoalBadge = document.getElementById('trainingGoalBadge');
  const weekVolumeBadge = document.getElementById('weekVolumeBadge');
  const planWeekHeadline = document.getElementById('planWeekHeadline');
  const planWeekFocus = document.getElementById('planWeekFocus');
  const planWeekCompletionStatus = document.getElementById('planWeekCompletionStatus');

  const p = store.activeTrainingPlan;
  const currentWeek = p.weeks[store.currentPlanWeek] || p.weeks[0];
  const unitSystem = getUnitSystem();

  if (basePaceDisplay) basePaceDisplay.textContent = formatPaceValue(p.basePaceSeconds, unitSystem);
  if (predictedFinish) predictedFinish.textContent = p.predictedTime;
  if (zoneEasyPace && p.paces) zoneEasyPace.textContent = formatPaceValue(p.paces.easyPaceSeconds || p.basePaceSeconds + 55, unitSystem);
  if (zoneTempoPace && p.paces) zoneTempoPace.textContent = formatPaceValue(p.paces.tempoPaceSeconds || p.basePaceSeconds + 15, unitSystem);
  if (zoneIntervalPace && p.paces) zoneIntervalPace.textContent = formatPaceValue(p.paces.intervalPaceSeconds || p.basePaceSeconds - 25, unitSystem);
  if (trainingGoalBadge) trainingGoalBadge.textContent = p.goalName;

  if (weekVolumeBadge) {
    weekVolumeBadge.textContent = `Week ${store.currentPlanWeek + 1}: ${formatDistance(Number(currentWeek.targetMiles || 0), unitSystem, 1)}`;
  }
  if (planWeekHeadline) planWeekHeadline.textContent = currentWeek.title;
  if (planWeekFocus) planWeekFocus.textContent = currentWeek.focus;

  const completedCount = currentWeek.days.filter((d) => d.completed).length;
  if (planWeekCompletionStatus) {
    planWeekCompletionStatus.textContent = `${completedCount} / ${currentWeek.days.length} Done`;
  }

  document.querySelectorAll('.btn-plan-goal').forEach((btn) => {
    const isMatch = btn.getAttribute('data-goal') === store.currentGoalId;
    btn.classList.toggle('bg-terracotta', isMatch);
    btn.classList.toggle('text-white', isMatch);
    btn.classList.toggle('shadow-sm', isMatch);
    btn.classList.toggle('active', isMatch);
    btn.classList.toggle('bg-stone-100', !isMatch);
    btn.classList.toggle('dark:bg-stone-700/60', !isMatch);
    btn.classList.toggle('text-stone-700', !isMatch);
    btn.classList.toggle('dark:text-stone-300', !isMatch);
  });

  renderPlanWorkouts(currentWeek);
}

function renderPlanWorkouts(weekData) {
  const container = document.getElementById('planWorkoutsList');
  if (!container) return;

  const unitSystem = getUnitSystem();
  container.innerHTML = '';
  weekData.days.forEach((d) => {
    const card = document.createElement('div');
    card.className = `p-3 rounded-2xl border transition-all ${
      d.completed
        ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-500/30'
        : 'bg-stone-50 dark:bg-stone-800/80 border-stone-200 dark:border-stone-700/80 hover:border-terracotta/40'
    }`;

    let typeBadgeColor = 'bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300';
    if (d.type === 'interval' || d.type === 'race') typeBadgeColor = 'bg-rose-500/10 text-rose-500 border border-rose-500/20';
    else if (d.type === 'tempo') typeBadgeColor = 'bg-amber-500/10 text-amber-500 border border-amber-500/20';
    else if (d.type === 'long') typeBadgeColor = 'bg-terracotta/10 text-terracotta border border-terracotta/20';
    else if (d.type === 'easy') typeBadgeColor = 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20';

    const distText = formatDistance(Number(d.dist || 0), unitSystem, 1);

    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-start gap-2.5 min-w-0 flex-1">
          <button class="btn-toggle-workout-done w-6 h-6 rounded-lg border mt-0.5 flex items-center justify-center transition flex-shrink-0 cursor-pointer ${
            d.completed
              ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
              : 'border-stone-300 dark:border-stone-600 hover:border-emerald-500 bg-white dark:bg-stone-700 text-transparent'
          }" title="${d.completed ? 'Mark Incomplete' : 'Mark Completed'}">
            <i class="fa-solid fa-check text-xs"></i>
          </button>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-xs font-black text-stone-900 dark:text-white">${escapeHtml(d.day)}: ${escapeHtml(d.title)}</span>
              <span class="text-[9px] px-1.5 py-0.2 rounded font-extrabold ${typeBadgeColor}">${escapeHtml(d.zone)}</span>
            </div>
            <p class="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 leading-snug">${escapeHtml(d.desc)}</p>
            <div class="flex items-center gap-2 mt-1.5 text-[10px]">
              <span class="font-mono font-bold text-terracotta">${escapeHtml(distText)}</span>
              <span>·</span>
              <span class="font-mono text-stone-500">Target: <strong class="text-stone-800 dark:text-stone-200">${escapeHtml(d.pace)}</strong></span>
            </div>
          </div>
        </div>

        <button class="btn-plan-map-route py-1.5 px-2.5 rounded-xl bg-terracotta hover:bg-terracotta-hover text-white text-[11px] font-bold flex items-center gap-1 shadow-sm active:scale-95 transition flex-shrink-0 cursor-pointer" data-dist="${d.dist}" data-title="${escapeHtml(d.title)}">
          <i class="fa-solid fa-map-location-dot text-[10px]"></i>
          <span>Map Route</span>
        </button>
      </div>
    `;

    const doneBtn = card.querySelector('.btn-toggle-workout-done');
    if (doneBtn) {
      doneBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        d.completed = !d.completed;
        saveActivePlan(store.activeTrainingPlan);
        updateTrainingPlanUI();
        playTurnChime();
        if (d.completed) {
          speakInstruction(`Workout completed! ${distText} marked off.`);
        }
      });
    }

    const mapBtn = card.querySelector('.btn-plan-map-route');
    if (mapBtn) {
      mapBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dist = parseFloat(mapBtn.getAttribute('data-dist')) || 3.1;
        const title = mapBtn.getAttribute('data-title') || 'Training Run';

        const mapNavBtn = document.querySelector('.bottom-nav-btn[data-target="tabPlanner"]');
        if (mapNavBtn) mapNavBtn.click();

        store.currentSelectedDistance = dist;
        const origin = store.activeRoute?.path?.[0] || store.activeRoute?.center || { lat: 41.3857, lng: -81.7058 };
        generateMultipleLoopChoices(origin.lat, origin.lng, title, dist, 0);

        const slider = document.getElementById('distanceSlider');
        const sliderDisplay = document.getElementById('targetDistanceDisplay');
        if (slider) slider.value = dist;
        if (sliderDisplay) sliderDisplay.textContent = formatDistance(dist, getUnitSystem(), 1);

        playTurnChime();
        speakInstruction(`Loaded ${formatDistance(dist, getUnitSystem(), 1)} training route for ${title}. Option 1 selected.`);
      });
    }

    container.appendChild(card);
  });
}

function setupClock() {
  const clockEl = document.getElementById('clockDisplay');
  if (!clockEl) return;
  const update = () => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const mins = now.getMinutes().toString().padStart(2, '0');
    clockEl.textContent = `${hours}:${mins}`;
  };
  update();
  setInterval(update, 30000);
}

// ----------------------------------------------------
// F16: Metric / Imperial Unit System UI Wiring
// ----------------------------------------------------
function syncUnitSystemButtonsUI(unitSystem = getUnitSystem()) {
  const impBtn = document.getElementById('unitImperialBtn');
  const metBtn = document.getElementById('unitMetricBtn');
  const statusLabel = document.getElementById('settingsUnitsStatusLabel');

  if (impBtn && metBtn) {
    const isMetric = unitSystem === 'metric';
    impBtn.className = !isMetric
      ? 'px-2.5 py-1 rounded-lg bg-terracotta text-white text-[11px] font-bold transition cursor-pointer'
      : 'px-2.5 py-1 rounded-lg text-stone-600 dark:text-stone-300 text-[11px] font-bold transition cursor-pointer';
    metBtn.className = isMetric
      ? 'px-2.5 py-1 rounded-lg bg-terracotta text-white text-[11px] font-bold transition cursor-pointer'
      : 'px-2.5 py-1 rounded-lg text-stone-600 dark:text-stone-300 text-[11px] font-bold transition cursor-pointer';
  }
  if (statusLabel) {
    statusLabel.textContent = unitSystem === 'metric' ? 'Metric (km, m, °C)' : 'Imperial (mi, ft, °F)';
  }

  // Update distance preset button labels
  document.querySelectorAll('.dist-preset-btn').forEach((btn) => {
    const miles = parseFloat(btn.getAttribute('data-dist'));
    if (!Number.isFinite(miles)) return;
    if (unitSystem === 'metric') {
      if (Math.abs(miles - 3.1) < 0.1) btn.textContent = '5K';
      else if (Math.abs(miles - 6.2) < 0.1) btn.textContent = '10K';
      else btn.textContent = `${milesToKm(miles).toFixed(1)}k`;
    } else {
      if (Math.abs(miles - 3.1) < 0.1) btn.textContent = '5K';
      else if (Math.abs(miles - 6.2) < 0.1) btn.textContent = '10K';
      else btn.textContent = `${miles}mi`;
    }
  });

  // Update target distance label
  const targetDistDisplay = document.getElementById('targetDistanceDisplay');
  if (targetDistDisplay) {
    const d = store.currentSelectedDistance || 3.1;
    let label = unitSystem === 'metric' ? `${milesToKm(d).toFixed(1)} km` : `${d.toFixed(1)} miles`;
    if (Math.abs(d - 3.1) < 0.1) label += ' (5K)';
    if (Math.abs(d - 6.2) < 0.1) label += ' (10K)';
    targetDistDisplay.textContent = label;
  }

  // Update pace preset labels
  document.querySelectorAll('.pace-preset-btn').forEach((btn) => {
    const paceStr = btn.getAttribute('data-pace') || '8:30';
    const label = btn.getAttribute('data-label') || 'Base';
    const [m, s] = paceStr.split(':').map(Number);
    const secPerMile = (m || 8) * 60 + (s || 0);
    const formatted = formatPaceValue(secPerMile, unitSystem, false);
    const subSpan = btn.querySelector('span:last-child');
    if (subSpan && subSpan !== btn) {
      subSpan.textContent = formatted;
    } else if (btn.childElementCount === 0) {
      btn.textContent = `${label} ${formatted}`;
    }
  });
}

function setupUnitSystemUI() {
  const impBtn = document.getElementById('unitImperialBtn');
  const metBtn = document.getElementById('unitMetricBtn');

  if (impBtn) {
    impBtn.addEventListener('click', () => setUnitSystem('imperial'));
  }
  if (metBtn) {
    metBtn.addEventListener('click', () => setUnitSystem('metric'));
  }

  syncUnitSystemButtonsUI(getUnitSystem());

  onUnitSystemChange((unitSystem) => {
    syncUnitSystemButtonsUI(unitSystem);
    if (store.activeRoute) {
      updateRouteInfoUI(store.activeRoute);
      if (store.activeRoute.center) {
        const w = store.currentWeatherData;
        if (w) {
          const tempEl = document.getElementById('weatherTempDisplay');
          if (tempEl) tempEl.textContent = formatTemperature(w.tempF, unitSystem);
          const windEl = document.getElementById('weatherWindDisplay');
          if (windEl) {
            const dirSuffix = w.windDir ? ` ${w.windDir}` : '';
            windEl.textContent = `${formatWindSpeed(w.windMph, unitSystem)}${dirSuffix}`;
          }
        }
      }
    }
    renderRouteChoicesList();
    updateTrainingPlanUI();
    renderCloudWorkouts(store.historicalWorkoutsCache || []);
    renderCloudRoutes(store.savedRoutesCache || []);
  });
}

// ----------------------------------------------------
// General UI Handlers (Settings, Tabs, Plan, Theme)
// ----------------------------------------------------
function setupUIHandlers() {
  const modalAppSettings = document.getElementById('modalAppSettings');
  const btnOpenSettingsModal = document.getElementById('btnOpenSettingsModal');
  const btnMapOpenSettings = document.getElementById('btnMapOpenSettings');
  const btnSheetOpenSettings = document.getElementById('btnSheetOpenSettings');
  const btnCloseSettingsModal = document.getElementById('btnCloseSettingsModal');

  function openAppSettingsModal() {
    if (modalAppSettings) modalAppSettings.classList.remove('hidden');
  }
  function closeAppSettingsModal() {
    if (modalAppSettings) modalAppSettings.classList.add('hidden');
  }

  [btnOpenSettingsModal, btnMapOpenSettings, btnSheetOpenSettings].forEach((btn) => {
    if (btn) btn.addEventListener('click', openAppSettingsModal);
  });
  if (btnCloseSettingsModal) btnCloseSettingsModal.addEventListener('click', closeAppSettingsModal);
  if (modalAppSettings) {
    modalAppSettings.addEventListener('click', (e) => {
      if (e.target === modalAppSettings) closeAppSettingsModal();
    });
  }

  const sheetDragHandle = document.getElementById('sheetDragHandle');
  const btnToggleSheet = document.getElementById('btnToggleSheet');
  const btnExpandFromCompact = document.getElementById('btnExpandFromCompact');
  const compactHeaderSelectArea = document.getElementById('compactHeaderSelectArea');
  const routeHeaderSummaryRow = document.getElementById('routeHeaderSummaryRow');

  if (sheetDragHandle) sheetDragHandle.addEventListener('click', () => setSheetCollapsed(!store.isSheetCollapsed));
  if (btnToggleSheet) {
    btnToggleSheet.addEventListener('click', (e) => {
      e.stopPropagation();
      setSheetCollapsed(!store.isSheetCollapsed);
    });
  }
  if (btnExpandFromCompact) btnExpandFromCompact.addEventListener('click', () => setSheetCollapsed(false));
  if (compactHeaderSelectArea) {
    compactHeaderSelectArea.addEventListener('click', () => {
      const sel = window.getSelection ? window.getSelection().toString() : '';
      if (sel && sel.length > 0) return;
      setSheetCollapsed(false);
    });
  }

  if (routeHeaderSummaryRow) {
    routeHeaderSummaryRow.addEventListener('click', (e) => {
      if (e.target.closest('#btnToggleSheet')) return;
      const sel = window.getSelection ? window.getSelection().toString() : '';
      if (sel && sel.length > 0) return;
      const targetPt = store.activeRoute?.path?.[0] || store.activeRoute?.center;
      if (targetPt && store.googleMap) {
        store.googleMap.panTo(targetPt);
        if ((store.googleMap.getZoom() || 15) < 15) store.googleMap.setZoom(16);
      }
      const detailsEl = document.getElementById('sheetExpandedDetails');
      const drawerBtn = document.getElementById('btnToggleDetailedDrawer');
      if (detailsEl && drawerBtn) drawerBtn.click();
    });
  }

  const btnToggleDetailedDrawer = document.getElementById('btnToggleDetailedDrawer');
  const sheetExpandedDetails = document.getElementById('sheetExpandedDetails');
  const btnDrawerChevron = document.getElementById('btnDrawerChevron');
  const btnDrawerToggleLabel = document.getElementById('btnDrawerToggleLabel');

  if (btnToggleDetailedDrawer && sheetExpandedDetails) {
    btnToggleDetailedDrawer.addEventListener('click', () => {
      const isHidden = sheetExpandedDetails.classList.contains('hidden');
      if (isHidden) {
        sheetExpandedDetails.classList.remove('hidden');
        if (btnDrawerChevron) btnDrawerChevron.className = 'fa-solid fa-chevron-down text-[9px] text-terracotta';
        if (btnDrawerToggleLabel) btnDrawerToggleLabel.textContent = 'Hide';
        btnToggleDetailedDrawer.classList.add('bg-terracotta/10', 'border-terracotta/30', 'text-terracotta');
      } else {
        sheetExpandedDetails.classList.add('hidden');
        if (btnDrawerChevron) btnDrawerChevron.className = 'fa-solid fa-chevron-up text-[9px] text-stone-400';
        if (btnDrawerToggleLabel) btnDrawerToggleLabel.textContent = 'Turns';
        btnToggleDetailedDrawer.classList.remove('bg-terracotta/10', 'border-terracotta/30', 'text-terracotta');
      }
    });
  }

  const audioVoiceToggleBtn = document.getElementById('audioVoiceToggle');
  if (audioVoiceToggleBtn) {
    audioVoiceToggleBtn.addEventListener('click', () => {
      const muted = toggleVoiceMute();
      if (!muted) speakInstruction('Voice navigation active', { forceSpeak: true });
    });
  }
  syncVoiceMuteUI();

  const btnStartNav = document.getElementById('btnStartNavigation');
  const compactBtnStartNav = document.getElementById('compactBtnStartNav');
  if (btnStartNav) {
    btnStartNav.addEventListener('click', () => {
      if (!store.isNavigating) startNavigation();
      else stopNavigation();
    });
  }
  if (compactBtnStartNav) {
    compactBtnStartNav.addEventListener('click', () => {
      if (!store.isNavigating) startNavigation();
      else stopNavigation();
    });
  }

  const mapWeatherBadge = document.getElementById('mapWeatherBadge');
  if (mapWeatherBadge) {
    mapWeatherBadge.addEventListener('click', () => {
      if (store.currentWeatherData) {
        const tempStr = formatTemperature(store.currentWeatherData.tempF);
        speakInstruction(
          `Current weather: ${tempStr}, ${store.currentWeatherData.condition}. Rain probability is ${store.currentWeatherData.rainProb} percent. ${store.currentWeatherData.summary}.`,
          { forceSpeak: true }
        );
      } else {
        speakInstruction('Checking live weather conditions for route.', { forceSpeak: true });
      }
    });
  }

  const btnHudPauseResume = document.getElementById('btnHudPauseResume');
  const hudPauseIcon = document.getElementById('hudPauseIcon');
  const hudPauseText = document.getElementById('hudPauseText');
  if (btnHudPauseResume) {
    btnHudPauseResume.addEventListener('click', () => {
      if (!store.isNavigating) return;
      store.navIsPaused = !store.navIsPaused;
      if (store.navIsPaused) {
        if (hudPauseIcon) hudPauseIcon.className = 'fa-solid fa-play text-emerald-400 text-[11px]';
        if (hudPauseText) hudPauseText.textContent = 'Resume';
        speakInstruction('Run paused.', { forceSpeak: true });
      } else {
        if (hudPauseIcon) hudPauseIcon.className = 'fa-solid fa-pause text-amber-400 text-[11px]';
        if (hudPauseText) hudPauseText.textContent = 'Pause';
        speakInstruction('Run resumed.', { forceSpeak: true });
      }
    });
  }

  const btnHudStop = document.getElementById('btnHudStop');
  if (btnHudStop) btnHudStop.addEventListener('click', () => stopNavigation());

  const btnHudSos = document.getElementById('btnHudSos');
  if (btnHudSos) {
    btnHudSos.addEventListener('click', () => {
      const beaconTabBtn = document.querySelector('.bottom-nav-btn[data-target="tabSafetyBeacon"]');
      if (beaconTabBtn) beaconTabBtn.click();
      const testSosBtn = document.getElementById('btnTriggerTestSOS');
      if (testSosBtn) testSosBtn.click();
    });
  }

  const btnHudRepeatVoice = document.getElementById('btnHudRepeatVoice');
  if (btnHudRepeatVoice) {
    btnHudRepeatVoice.addEventListener('click', () => {
      const maneuvers = store.activeRoute?.maneuvers || [];
      if (!maneuvers.length) return;
      const m = maneuvers[store.navStepIndex % maneuvers.length];
      if (m) speakInstruction(`Repeating: ${m.dist ? m.dist + ', ' : ''}${m.text}. ${m.note || ''}`, { playChime: true, forceSpeak: true });
    });
  }

  store.isSimulationMode = false;
  syncHudGpsModeBadge();

  const navInstructionText = document.getElementById('navInstructionText');
  if (navInstructionText) {
    navInstructionText.addEventListener('click', () => {
      const maneuvers = store.activeRoute?.maneuvers || [];
      if (!maneuvers.length) return;
      const m = maneuvers[store.navStepIndex % maneuvers.length];
      if (m) speakInstruction(`${m.dist ? m.dist + ', ' : ''}${m.text}. ${m.note || ''}`, { playChime: true, forceSpeak: true });
    });
  }

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

  const distPresetBtns = document.querySelectorAll('.dist-preset-btn');
  const distanceSlider = document.getElementById('distanceSlider');
  const targetDistDisplay = document.getElementById('targetDistanceDisplay');

  distPresetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const dist = parseFloat(btn.getAttribute('data-dist'));
      if (!dist) return;

      distPresetBtns.forEach((b) => {
        b.classList.remove('bg-white', 'dark:bg-stone-700', 'text-stone-900', 'dark:text-white', 'shadow-sm', 'active');
        b.classList.add('text-stone-600', 'dark:text-stone-300');
      });
      btn.classList.add('bg-white', 'dark:bg-stone-700', 'text-stone-900', 'dark:text-white', 'shadow-sm', 'active');
      btn.classList.remove('text-stone-600', 'dark:text-stone-300');

      store.currentSelectedDistance = dist;
      if (distanceSlider) distanceSlider.value = dist.toString();
      syncUnitSystemButtonsUI(getUnitSystem());

      const center = store.activeRoute?.center || { lat: 41.3857, lng: -81.7058 };
      const locName = store.activeRoute?.locationName || store.activeRoute?.title || 'Safe Loop';
      generateLoopFromCoords(center.lat, center.lng, locName, dist);
      speakInstruction(`${formatDistance(dist, getUnitSystem(), 1)} safe loop selected.`);
    });
  });

  const btnToggleCustomDist = document.getElementById('btnToggleCustomDist');
  const customSliderContainer = document.getElementById('customSliderContainer');
  if (btnToggleCustomDist && customSliderContainer) {
    btnToggleCustomDist.addEventListener('click', () => customSliderContainer.classList.toggle('hidden'));
  }

  if (distanceSlider) {
    distanceSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const unitSystem = getUnitSystem();
      let label = unitSystem === 'metric' ? `${milesToKm(val).toFixed(1)} km` : `${val.toFixed(1)} miles`;
      if (Math.abs(val - 3.1) < 0.1) label += ' (5K)';
      if (Math.abs(val - 6.2) < 0.1) label += ' (10K)';
      if (targetDistDisplay) targetDistDisplay.textContent = label;
    });

    distanceSlider.addEventListener('change', (e) => {
      const dist = parseFloat(e.target.value);
      store.currentSelectedDistance = dist;
      const center = store.activeRoute?.center || { lat: 41.3857, lng: -81.7058 };
      const locName = store.activeRoute?.locationName || store.activeRoute?.title || 'Safe Loop';
      generateLoopFromCoords(center.lat, center.lng, locName, dist);
      speakInstruction(`${formatDistance(dist, getUnitSystem(), 1)} loop generated.`);
    });
  }

  const pacePresetBtns = document.querySelectorAll('.pace-preset-btn');
  pacePresetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      pacePresetBtns.forEach((b) => {
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
      store.currentPaceSeconds = mins * 60 + secs;
      store.currentTargetPace = `${mins}'${secs ? String(secs).padStart(2, '0') + '"' : '00"'}`;

      updateEstimatedDuration();
      const matchedPl = syncPlaylistToPaceSeconds(store.currentPaceSeconds);
      playTurnChime();
      speakInstruction(
        `Target pace set to ${label}, ${formatPaceValue(store.currentPaceSeconds)}.${
          matchedPl ? ` Synced playlist to ${matchedPl.name}.` : ''
        }`
      );
    });
  });

  const btnRedoChoices = document.getElementById('btnRedoChoices');
  const btnGenerateAiRoute = document.getElementById('btnGenerateAiRoute');

  function triggerRedoChoices() {
    store.redoCount++;
    const center = store.activeRoute?.center || { lat: 41.3857, lng: -81.7058 };
    const locName = store.activeRoute?.locationName || store.activeRoute?.title?.split(' ')[0] || 'Safe Loop';
    const redoOffset = store.redoCount * 0.55;

    if (btnRedoChoices) {
      btnRedoChoices.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-terracotta text-[9px]"></i><span>...</span>';
    }
    if (btnGenerateAiRoute) {
      btnGenerateAiRoute.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-terracotta"></i> <span>Re-Calculating...</span>';
    }

    setTimeout(() => {
      if (store.activeWaypointCoords) {
        generateLoopChoicesWithWaypoint(
          center.lat,
          center.lng,
          store.activeWaypointCoords.lat,
          store.activeWaypointCoords.lng,
          locName,
          store.currentSelectedDistance,
          redoOffset
        );
        playTurnChime();
        speakInstruction('Recalculated 4 alternative safe routes via waypoint. Option 1 selected.');
      } else {
        generateMultipleLoopChoices(center.lat, center.lng, locName, store.currentSelectedDistance, redoOffset);
        playTurnChime();
        speakInstruction(`Generated 4 fresh safe routes around ${locName}. Option 1 selected.`);
      }
      if (btnRedoChoices) btnRedoChoices.innerHTML = '<i class="fa-solid fa-arrows-rotate text-[9px]"></i><span>Redo</span>';
      if (btnGenerateAiRoute) btnGenerateAiRoute.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles text-terracotta"></i> <span>Re-Map AI Loop</span>';
    }, 350);
  }

  if (btnRedoChoices) btnRedoChoices.addEventListener('click', triggerRedoChoices);
  if (btnGenerateAiRoute) btnGenerateAiRoute.addEventListener('click', triggerRedoChoices);

  const btnSetPinAsStart = document.getElementById('btnSetPinAsStart');
  const btnSetPinAsWaypoint = document.getElementById('btnSetPinAsWaypoint');
  const btnDismissDroppedPin = document.getElementById('btnDismissDroppedPin');

  if (btnSetPinAsStart) {
    btnSetPinAsStart.addEventListener('click', () => {
      if (!store.lastDroppedPinCoords) return;
      const { lat, lng } = store.lastDroppedPinCoords;
      store.activeWaypointCoords = null;
      clearWaypointMarker();
      clearDroppedPinMarker();
      const promptEl = document.getElementById('droppedPinPrompt');
      if (promptEl) promptEl.classList.add('hidden');
      generateMultipleLoopChoices(lat, lng, 'Pinned Start Line', store.currentSelectedDistance, 0);
      playTurnChime();
      speakInstruction('New start line set at pinned coordinate. Generated 4 safe loop routes.');
    });
  }

  if (btnSetPinAsWaypoint) {
    btnSetPinAsWaypoint.addEventListener('click', () => {
      if (!store.lastDroppedPinCoords) return;
      const wpLat = store.lastDroppedPinCoords.lat;
      const wpLng = store.lastDroppedPinCoords.lng;
      const origin = store.activeRoute?.path?.[0] || store.activeRoute?.center || { lat: 41.3857, lng: -81.7058 };

      clearDroppedPinMarker();
      const promptEl = document.getElementById('droppedPinPrompt');
      if (promptEl) promptEl.classList.add('hidden');

      store.activeWaypointCoords = { lat: wpLat, lng: wpLng };
      updateWaypointMarker(wpLat, wpLng);
      const locName = store.activeRoute?.locationName || 'Custom Route';
      generateLoopChoicesWithWaypoint(origin.lat, origin.lng, wpLat, wpLng, locName, store.currentSelectedDistance, 0);
      playTurnChime();
      speakInstruction('Waypoint locked. Recalculated 4 safe loops passing through your waypoint.');
    });
  }

  if (btnDismissDroppedPin) {
    btnDismissDroppedPin.addEventListener('click', () => {
      clearDroppedPinMarker();
      const promptEl = document.getElementById('droppedPinPrompt');
      if (promptEl) promptEl.classList.add('hidden');
      store.lastDroppedPinCoords = null;
    });
  }

  // Bottom Navigation Tabs
  const tabBtns = document.querySelectorAll('.bottom-nav-btn');
  const tabSections = document.querySelectorAll('.tab-content');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      tabBtns.forEach((b) => {
        b.classList.remove('text-terracotta');
        b.classList.add('text-stone-500', 'dark:text-stone-400');
        const pill = b.querySelector('div');
        if (pill) pill.classList.remove('bg-terracotta/15');
      });
      btn.classList.add('text-terracotta');
      btn.classList.remove('text-stone-500', 'dark:text-stone-400');
      const activePill = btn.querySelector('div');
      if (activePill) activePill.classList.add('bg-terracotta/15');

      tabSections.forEach((sec) => sec.classList.add('hidden'));
      const targetSec = document.getElementById(targetId);
      if (targetSec) targetSec.classList.remove('hidden');

      if (targetId === 'tabPlanner') {
        setTimeout(() => {
          if (store.googleMap && window.google?.maps?.event) {
            window.google.maps.event.trigger(store.googleMap, 'resize');
            fitRouteBounds(store.activeRoute);
          }
          if (window.__activeLeafletMap) {
            window.__activeLeafletMap.invalidateSize();
            fitRouteBounds(store.activeRoute);
          }
        }, 150);
      }
    });
  });

  // Share button copy
  const shareBtn = document.getElementById('btnShareRoute');
  const toastEl = document.getElementById('exportStatusToast');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(`https://stride-circuit-llc.polsia.io/route-preview?id=${store.activeKey}`);
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
  const presetSelect = document.getElementById('locationPreset');
  document.querySelectorAll('.btn-plan-from-event').forEach((btn) => {
    btn.addEventListener('click', () => {
      const loc = btn.getAttribute('data-location') || 'parma';
      if (presetSelect) presetSelect.value = loc;
      if (ROUTES[loc]) {
        if (store.isNavigating) stopNavigation();
        store.activeKey = loc;
        store.activeRoute = ROUTES[loc];
        renderRoute(store.activeRoute);
      }
      const mapTabBtn = document.querySelector('.bottom-nav-btn[data-target="tabPlanner"]');
      if (mapTabBtn) mapTabBtn.click();
      speakInstruction('Race coordinates loaded on map. Ready to navigate.');
    });
  });

  // Saved Routes: "Load"
  document.querySelectorAll('.btn-load-saved').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-preset') || 'parma';
      if (ROUTES[key]) {
        if (store.isNavigating) stopNavigation();
        store.activeKey = key;
        store.activeRoute = ROUTES[key];
        renderRoute(store.activeRoute);
      }
      const mapTabBtn = document.querySelector('.bottom-nav-btn[data-target="tabPlanner"]');
      if (mapTabBtn) mapTabBtn.click();
      speakInstruction(`Loaded ${store.activeRoute.title} from library.`);
    });
  });

  const btnNewRouteAction = document.getElementById('btnNewRouteAction');
  if (btnNewRouteAction) {
    btnNewRouteAction.addEventListener('click', () => {
      const mapTabBtn = document.querySelector('.bottom-nav-btn[data-target="tabPlanner"]');
      if (mapTabBtn) mapTabBtn.click();
      setSheetCollapsed(false);
      speakInstruction('Select starting location and target distance to map a new route.');
    });
  }

  // Device Frame Viewport Toggle
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
        if (store.googleMap && window.google?.maps?.event) {
          window.google.maps.event.trigger(store.googleMap, 'resize');
          fitRouteBounds(store.activeRoute);
        }
        if (window.__activeLeafletMap) {
          window.__activeLeafletMap.invalidateSize();
          fitRouteBounds(store.activeRoute);
        }
      }, 300);
    });
  }

  // Persistent Theme Toggle
  const settingsThemeStatusLabel = document.getElementById('settingsThemeStatusLabel');
  function updateSettingsThemeStatusLabel(theme) {
    if (settingsThemeStatusLabel) {
      settingsThemeStatusLabel.textContent =
        theme === THEME_MODES.DARK ? 'Dark Mode · Saved in LocalStorage' : 'Light Mode · Saved in LocalStorage';
    }
  }
  updateSettingsThemeStatusLabel(getStoredTheme());
  initThemeController((theme) => {
    updateSettingsThemeStatusLabel(theme);
    renderHeartRateZonesUI();
    const mapEl = document.getElementById('map');
    if (mapEl && store.googleMap) mapEl.style.filter = '';
  });

  // Health Connect toggle
  const btnToggleHealthConnect = document.getElementById('btnToggleHealthConnect');
  if (btnToggleHealthConnect) {
    btnToggleHealthConnect.addEventListener('click', () => {
      const isConn = btnToggleHealthConnect.textContent.trim() === 'Connected';
      if (isConn) {
        btnToggleHealthConnect.textContent = 'Connect';
        btnToggleHealthConnect.className =
          'px-3 py-1 rounded-lg text-xs font-semibold bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-300 transition';
      } else {
        btnToggleHealthConnect.textContent = 'Connected';
        btnToggleHealthConnect.className = 'px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition';
        speakInstruction('Health Connect biometrics synchronized.');
      }
    });
  }

  // Max HR Calibration Controls
  const maxHrRangeInput = document.getElementById('maxHrCalibrationRange');
  const maxHrDisplayLabel = document.getElementById('maxHrCalibrationValue');
  const btnResetMaxHr = document.getElementById('btnResetMaxHrAuto');
  if (maxHrRangeInput) {
    maxHrRangeInput.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (maxHrDisplayLabel) maxHrDisplayLabel.textContent = `${val} bpm`;
      setStoredMaxHrOverride(val);
      renderHeartRateZonesUI();
    });
  }
  if (btnResetMaxHr) {
    btnResetMaxHr.addEventListener('click', () => {
      setStoredMaxHrOverride(null);
      renderHeartRateZonesUI();
      playTurnChime();
      speakInstruction('Max heart rate reset to automatic historical workout peak.');
    });
  }

  // Training Plan Goal & Week Selectors (including Marathon F9)
  document.querySelectorAll('.btn-plan-goal').forEach((btn) => {
    btn.addEventListener('click', () => {
      const goal = btn.getAttribute('data-goal') || '5k';
      store.currentGoalId = goal;
      store.activeTrainingPlan = generate4WeekPlan(goal, getHistoricalPaceSeconds());
      saveActivePlan(store.activeTrainingPlan);
      updateTrainingPlanUI();
      playTurnChime();
      speakInstruction(`${store.activeTrainingPlan.goalName} 4-week plan generated.`);
    });
  });

  document.querySelectorAll('.btn-plan-week').forEach((btn) => {
    btn.addEventListener('click', () => {
      const weekIdx = parseInt(btn.getAttribute('data-week'), 10) || 0;
      store.currentPlanWeek = weekIdx;
      document.querySelectorAll('.btn-plan-week').forEach((b) => {
        b.classList.remove('bg-white', 'dark:bg-stone-700', 'text-stone-900', 'dark:text-white', 'shadow-sm', 'active');
        b.classList.add('text-stone-600', 'dark:text-stone-400');
      });
      btn.classList.add('bg-white', 'dark:bg-stone-700', 'text-stone-900', 'dark:text-white', 'shadow-sm', 'active');
      btn.classList.remove('text-stone-600', 'dark:text-stone-400');
      updateTrainingPlanUI();
    });
  });

  const btnRegeneratePlan = document.getElementById('btnRegeneratePlan');
  if (btnRegeneratePlan) {
    btnRegeneratePlan.addEventListener('click', () => {
      store.activeTrainingPlan = generate4WeekPlan(store.currentGoalId, getHistoricalPaceSeconds());
      saveActivePlan(store.activeTrainingPlan);
      updateTrainingPlanUI();
      playTurnChime();
      speakInstruction('Training plan recalibrated from your workout history.');
    });
  }
}

// ----------------------------------------------------
// Firebase Authentication & Cloud Firestore Sync (F12, F13)
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
    if (store.currentUser) {
      try {
        await logoutUser();
        speakInstruction('Signed out of Google account.');
      } catch (err) {
        console.error('Sign out error:', err);
      }
    } else {
      try {
        await loginWithGoogle();
        speakInstruction('Signed in with Google. Cloud library synced.');
      } catch (err) {
        console.error('Sign in error:', err);
      }
    }
  }

  if (btnGoogleAuth) btnGoogleAuth.addEventListener('click', handleAuthClick);
  if (btnMobileAuth) btnMobileAuth.addEventListener('click', handleAuthClick);

  if (btnSaveRouteToCloud) {
    btnSaveRouteToCloud.addEventListener('click', async () => {
      await saveRouteWithDeduplication(store.activeRoute);
    });
  }

  if (btnDemoRecordRun) {
    btnDemoRecordRun.addEventListener('click', async () => {
      if (!store.currentUser) {
        speakInstruction('Please sign in with Google to log workouts to cloud.');
        try {
          await loginWithGoogle();
        } catch (_) {
          return;
        }
      }

      const workoutData = {
        routeTitle: store.activeRoute?.title || 'Demo Run',
        distance: Number(store.activeRoute?.distance || 3.1),
        durationSeconds: 1572,
        avgPace: "8'27\"",
        avgHeartRate: 148,
        calories: 342,
        completedAt: new Date().toISOString()
      };

      evaluateBadgesFromWorkouts([workoutData], { weather: store.currentWeatherData }, (badge) => {
        playTurnChime();
        speakInstruction(`Achievement unlocked: ${badge.title} badge! ${badge.subtitle}`);
      });

      store.historicalWorkoutsCache = [workoutData, ...store.historicalWorkoutsCache];
      renderHeartRateZonesUI();

      if (store.currentUser && navigator.onLine !== false) {
        try {
          await addRunActivity(workoutData);
          playTurnChime();
          speakInstruction('Workout logged to cloud history.');
        } catch (_) {
          await enqueueOfflineWorkout(workoutData);
        }
      } else {
        await enqueueOfflineWorkout(workoutData);
        playTurnChime();
        speakInstruction('Workout queued locally. Will sync when online.');
      }
    });
  }

  onAuthStateChanged(auth, (user) => {
    store.currentUser = user;

    if (user) {
      const displayName = user.displayName || user.email?.split('@')[0] || 'Runner';
      const shortName = displayName.split(' ')[0];

      if (googleAuthLabel) googleAuthLabel.textContent = displayName;
      if (btnGoogleAuth) btnGoogleAuth.title = `Signed in as ${user.email} (Click to sign out)`;
      if (mobileAuthLabel) mobileAuthLabel.textContent = shortName;

      if (contactsSyncStatus) {
        contactsSyncStatus.className =
          'px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 flex items-center gap-1';
        contactsSyncStatus.innerHTML = '<i class="fa-solid fa-cloud-check"></i> Cloud Synced';
      }
      if (workoutSyncBadge) {
        workoutSyncBadge.className =
          'px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400';
        workoutSyncBadge.textContent = 'Cloud Synced';
      }
      if (cloudRoutesBadge) {
        cloudRoutesBadge.className =
          'px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400';
        cloudRoutesBadge.textContent = 'Cloud Synced';
      }

      if (store.unsubSavedRoutes) store.unsubSavedRoutes();
      if (store.unsubEmergencyContacts) store.unsubEmergencyContacts();
      if (store.unsubRunActivities) store.unsubRunActivities();
      if (store.unsubUserProfile) store.unsubUserProfile();

      store.unsubSavedRoutes = subscribeSavedRoutes(user.uid, renderCloudRoutes);
      store.unsubEmergencyContacts = subscribeEmergencyContacts(user.uid, renderCloudContacts);
      store.unsubRunActivities = subscribeRunActivities(user.uid, renderCloudWorkouts);

      // F13: Subscribe to /users/{userId} profile for subscription & training plan hydration
      store.unsubUserProfile = subscribeUserProfile(user.uid, (profile) => {
        if (!profile) return;
        hydrateSubscriptionFromCloud(profile);
        const hydratedPlan = hydrateTrainingPlanFromCloud(profile);
        if (hydratedPlan) {
          store.activeTrainingPlan = hydratedPlan;
          store.currentGoalId = hydratedPlan.goalId || store.currentGoalId;
          updateTrainingPlanUI();
        }
      });

      // F12: Flush any queued offline workouts now that user is authenticated
      void flushOfflineWorkoutQueue();
    } else {
      if (googleAuthLabel) googleAuthLabel.textContent = 'Sign In';
      if (btnGoogleAuth) btnGoogleAuth.title = 'Sign In with Google';
      if (mobileAuthLabel) mobileAuthLabel.textContent = 'Sign In';

      if (contactsSyncStatus) {
        contactsSyncStatus.className =
          'px-1.5 py-0.5 rounded text-[9px] font-bold bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300';
        contactsSyncStatus.textContent = 'Saved on Device';
      }
      if (workoutSyncBadge) {
        workoutSyncBadge.className =
          'px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400';
        workoutSyncBadge.textContent = 'Local Only';
      }
      if (cloudRoutesBadge) {
        cloudRoutesBadge.className =
          'px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400';
        cloudRoutesBadge.textContent = 'Sign in to sync';
      }

      if (store.unsubSavedRoutes) {
        store.unsubSavedRoutes();
        store.unsubSavedRoutes = null;
      }
      if (store.unsubEmergencyContacts) {
        store.unsubEmergencyContacts();
        store.unsubEmergencyContacts = null;
      }
      if (store.unsubRunActivities) {
        store.unsubRunActivities();
        store.unsubRunActivities = null;
      }
      if (store.unsubUserProfile) {
        store.unsubUserProfile();
        store.unsubUserProfile = null;
      }

      store.savedRoutesCache = [];
      updateSaveButtonStatus();
      renderRouteChoicesList();

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

function renderCloudRoutes(routesList) {
  store.savedRoutesCache = routesList || [];
  updateSaveButtonStatus();
  renderRouteChoicesList();

  const container = document.getElementById('cloudSavedRoutesList');
  if (!container) return;

  if (!routesList || routesList.length === 0) {
    container.innerHTML = `
      <div class="p-4 rounded-2xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-center text-xs text-stone-500 space-y-1">
        <i class="fa-solid fa-bookmark text-stone-400 text-base"></i>
        <p class="font-medium">No saved cloud routes yet.</p>
        <p class="text-[11px] text-stone-400">Tap "Save" in the route planner to store your custom loops.</p>
      </div>
    `;
    return;
  }

  const unitSystem = getUnitSystem();
  container.innerHTML = '';
  routesList.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'p-3.5 rounded-2xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-sm flex items-center justify-between gap-2';
    card.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-10 h-10 rounded-xl bg-terracotta/15 text-terracotta flex items-center justify-center flex-shrink-0">
          <i class="fa-solid fa-cloud text-base"></i>
        </div>
        <div class="min-w-0">
          <h3 class="font-bold text-sm text-stone-900 dark:text-white truncate">${escapeHtml(r.title)}</h3>
          <p class="text-xs text-stone-500 truncate">${escapeHtml(formatDistance(Number(r.distance || 3.1), unitSystem))} · ${escapeHtml(r.sidewalkPct || '98%')} Sidewalk</p>
        </div>
      </div>
      <div class="flex items-center gap-1.5 flex-shrink-0">
        <button class="btn-load-cloud-route px-3 py-1.5 rounded-lg bg-terracotta/10 text-terracotta hover:bg-terracotta hover:text-white text-xs font-bold transition">
          Load
        </button>
        <button class="btn-delete-cloud-route w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-700 hover:bg-rose-500 hover:text-white text-stone-400 flex items-center justify-center text-xs transition" title="Delete Route">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;

    card.querySelector('.btn-load-cloud-route')?.addEventListener('click', () => {
      if (store.isNavigating) stopNavigation();
      store.activeRoute = {
        title: r.title,
        locationName: r.locationName || r.title,
        center: r.center || { lat: 41.3857, lng: -81.7058 },
        zoom: 15,
        distance: Number(r.distance || 3.1),
        elevation: r.elevation || '+42 ft',
        safetyScore: r.safetyScore || '9.8',
        sidewalkPct: r.sidewalkPct || '98%',
        litPct: r.litPct || '100%',
        path: r.path || r.pathCoordinates || ROUTES.parma.path,
        maneuvers: r.maneuvers || ROUTES.parma.maneuvers
      };
      renderRoute(store.activeRoute);
      const mapTabBtn = document.querySelector('.bottom-nav-btn[data-target="tabPlanner"]');
      if (mapTabBtn) mapTabBtn.click();
      speakInstruction(`Loaded ${r.title} from cloud library.`);
    });

    card.querySelector('.btn-delete-cloud-route')?.addEventListener('click', async () => {
      try {
        await deleteSavedRoute(r.id);
      } catch (err) {
        console.error('Error deleting route:', err);
      }
    });

    container.appendChild(card);
  });
}

function renderCloudContacts(contactsList) {
  const container = document.getElementById('emergencyContactsList');
  if (!container) return;

  if (!contactsList || contactsList.length === 0) {
    container.innerHTML = '<div class="text-xs text-stone-400 text-center py-2">No emergency contacts synced yet.</div>';
    return;
  }

  container.innerHTML = '';
  contactsList.forEach((c) => {
    const initials = (c.name || 'EC')
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const card = document.createElement('div');
    card.className = 'p-2.5 rounded-xl bg-stone-50 dark:bg-stone-700/40 border border-stone-100 dark:border-stone-700 flex items-center justify-between gap-2';
    card.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-full bg-terracotta/15 text-terracotta font-bold text-xs flex items-center justify-center flex-shrink-0">
          ${escapeHtml(initials)}
        </div>
        <div class="min-w-0">
          <h4 class="text-xs font-bold text-stone-900 dark:text-white truncate">${escapeHtml(c.name)}</h4>
          <p class="text-[10px] text-stone-500 truncate">${escapeHtml(c.phone)} • Live Link Recipient</p>
        </div>
      </div>
      <div class="flex items-center gap-1.5 flex-shrink-0">
        <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">Active</span>
        <button class="btn-del-contact text-stone-400 hover:text-rose-500 text-xs transition" title="Remove Contact">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `;
    card.querySelector('.btn-del-contact')?.addEventListener('click', () => deleteEmergencyContact(c.id));
    container.appendChild(card);
  });
}

function renderCloudWorkouts(workoutsList) {
  store.historicalWorkoutsCache = workoutsList || [];
  renderHeartRateZonesUI();

  if (store.historicalWorkoutsCache.length > 0) {
    evaluateBadgesFromWorkouts(store.historicalWorkoutsCache, { weather: store.currentWeatherData }, () => {});
  }

  const container = document.getElementById('cloudWorkoutsList');
  if (!container) return;

  if (!workoutsList || workoutsList.length === 0) {
    container.innerHTML = `
      <div class="p-3 rounded-xl bg-stone-50 dark:bg-stone-700/40 border border-stone-100 dark:border-stone-700 text-center text-xs text-stone-500">
        Complete a navigation loop or tap "Demo Record Run" to log activity to Cloud.
      </div>
    `;
    return;
  }

  const unitSystem = getUnitSystem();
  container.innerHTML = '';
  workoutsList.forEach((w) => {
    const mins = Math.floor((w.durationSeconds || 1500) / 60);
    const secs = ((w.durationSeconds || 0) % 60).toString().padStart(2, '0');
    const distText = formatDistance(Number(w.distance || 3.1), unitSystem);
    const item = document.createElement('div');
    item.className = 'p-2.5 rounded-xl bg-stone-50 dark:bg-stone-700/40 border border-stone-100 dark:border-stone-700 flex items-center justify-between text-xs';
    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center flex-shrink-0">
          <i class="fa-solid fa-person-running"></i>
        </div>
        <div class="min-w-0">
          <h4 class="font-bold text-stone-900 dark:text-white truncate">${escapeHtml(w.routeTitle || 'Safe Run Loop')}</h4>
          <p class="text-[10px] text-stone-500">${escapeHtml(distText)} · ${mins}:${secs} · ${escapeHtml(w.avgPace || "8'30\"")}</p>
        </div>
      </div>
      <div class="text-right flex-shrink-0">
        <span class="font-mono font-bold text-rose-500 text-xs">${w.avgHeartRate || 148} bpm</span>
        <p class="text-[9px] text-stone-400">${w.calories || 340} kcal</p>
      </div>
    `;
    container.appendChild(item);
  });
}


if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
  } else {
    startApp();
  }
}
