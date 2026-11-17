import { store, escapeHtml } from './state/store.js';
import { addEmergencyContact, upsertBeaconSession, subscribeBeaconSession } from './firebase.js';
import { playTurnChime, speakInstruction } from './voiceNav.js';
import { formatDistance, formatPaceValue } from './units.js';

const BEACON_SESSION_STORAGE_KEY = 'paceplot_beacon_session_id';
const BEACON_ID_REGEX = /^stride-safe-[a-zA-Z0-9_-]+$/;
let beaconViewerMarker = null;
let beaconViewerMap = null;

export function getOrCreateBeaconSessionId(customStorage = null) {
  if (
    !customStorage &&
    store.beaconSessionId &&
    BEACON_ID_REGEX.test(store.beaconSessionId) &&
    store.beaconSessionId !== 'stride-safe-7b49'
  ) {
    return store.beaconSessionId;
  }
  const storage = customStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
  try {
    const stored = storage && typeof storage.getItem === 'function' ? storage.getItem(BEACON_SESSION_STORAGE_KEY) : null;
    if (stored && BEACON_ID_REGEX.test(stored.trim())) {
      const validId = stored.trim();
      if (!customStorage) store.beaconSessionId = validId;
      return validId;
    }
    const rand = Math.random().toString(36).slice(2, 8) || 'runner';
    const generated = `stride-safe-${rand}`;
    if (!customStorage) store.beaconSessionId = generated;
    if (storage && typeof storage.setItem === 'function') {
      storage.setItem(BEACON_SESSION_STORAGE_KEY, generated);
    }
    return generated;
  } catch (_) {
    return (!customStorage && store.beaconSessionId) || 'stride-safe-7b49';
  }
}

export async function syncLiveBeaconSession(overrides = {}) {
  const sessionId = getOrCreateBeaconSessionId();
  const trackingIdEl = typeof document !== 'undefined' ? document.getElementById('beaconTrackingId') : null;
  if (trackingIdEl) trackingIdEl.textContent = sessionId;

  const coord = store.currentUserGpsCoord || store.activeRoute?.center || { lat: 41.3857, lng: -81.7058 };
  let batteryPct = 88;
  try {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator && typeof navigator.getBattery === 'function') {
      const bat = await navigator.getBattery();
      if (bat && Number.isFinite(bat.level)) {
        batteryPct = Math.round(bat.level * 100);
      }
    }
  } catch (_) {}

  const totalDist = store.activeRoute?.distance || store.currentSelectedDistance || 3.1;
  const remDist = Math.max(0, totalDist - (store.liveGpsDistanceMiles || 0));
  const etaMins = Math.max(1, Math.round((remDist * (store.currentPaceSeconds || 510)) / 60));

  const payload = {
    lat: Number(coord.lat),
    lng: Number(coord.lng),
    batteryPct,
    etaText: `${etaMins}m remaining`,
    pace: formatPaceValue(store.currentPaceSeconds || 510),
    distanceMiles: Number((store.liveGpsDistanceMiles || 0).toFixed(2)),
    routeTitle: store.activeRoute?.title || 'Safe Loop',
    active: store.isNavigating,
    sosActive: false,
    updatedAt: new Date().toISOString(),
    ...overrides
  };
  payload.routeTitle = String(payload.routeTitle || 'Safe Loop').slice(0, 200);
  payload.etaText = String(payload.etaText || '').slice(0, 64);
  payload.pace = String(payload.pace || '').slice(0, 32);

  if (store.currentUser) {
    await upsertBeaconSession(sessionId, payload);
  }
  return { sessionId, ...payload };
}

export function initLiveBeaconViewer(options = {}) {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const trackId = params.get('track');
  if (!trackId || !BEACON_ID_REGEX.test(trackId)) return null;

  const trackingIdEl = document.getElementById('beaconTrackingId');
  if (trackingIdEl) trackingIdEl.textContent = trackId;

  if (typeof store.unsubBeaconSession === 'function') {
    store.unsubBeaconSession();
  }

  const subscribeFn = typeof options.subscribeFn === 'function' ? options.subscribeFn : subscribeBeaconSession;

  store.unsubBeaconSession = subscribeFn(
    trackId,
    (data) => {
      if (!data) return;
      const lat = Number(data.lat);
      const lng = Number(data.lng);
      if (window.__activeLeafletMap && window.L && Number.isFinite(lat) && Number.isFinite(lng)) {
        const map = window.__activeLeafletMap;
        if (!beaconViewerMarker || beaconViewerMap !== map) {
          const icon = window.L.divIcon({
            className: 'paceplot-leaflet-beacon',
            html: '<div style="background-color:#10b981; width:18px; height:18px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 2px 8px rgba(16,185,129,0.8);"></div>',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
          });
          beaconViewerMarker = window.L.marker([lat, lng], { icon }).addTo(map);
          beaconViewerMap = map;
        } else {
          beaconViewerMarker.setLatLng([lat, lng]);
        }
        if (typeof map.panTo === 'function') {
          map.panTo([lat, lng]);
        }
      }
      const toast = document.getElementById('testSmsToast');
      if (toast) {
        const distText = formatDistance(Number(data.distanceMiles || 0));
        toast.textContent = `Live Beacon (${trackId}): ${lat.toFixed(4)}, ${lng.toFixed(4)} · ${distText} · Battery ${data.batteryPct ?? '--'}%${data.sosActive ? ' · SOS ACTIVE!' : ''}`;
        toast.classList.remove('hidden');
      }
    },
    () => {}
  );
  return trackId;
}

export function setupSafeGuardHandlers() {
  if (typeof document === 'undefined') return;
  const sessionId = getOrCreateBeaconSessionId();
  const trackingId = document.getElementById('beaconTrackingId');
  if (trackingId && (!trackingId.textContent || trackingId.textContent === 'stride-safe-7b49')) {
    trackingId.textContent = sessionId;
  }

  const btnCopyTracking = document.getElementById('btnCopyTrackingLink');
  const copyLinkText = document.getElementById('copyLinkText');
  if (btnCopyTracking) {
    btnCopyTracking.addEventListener('click', () => {
      const id = getOrCreateBeaconSessionId();
      if (trackingId) trackingId.textContent = id;
      void syncLiveBeaconSession({ active: store.isNavigating });
      const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://stridecircuit.com';
      const link = `${origin}/?track=${encodeURIComponent(id)}`;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link);
        }
      } catch (_) {}
      if (copyLinkText) {
        copyLinkText.textContent = 'Copied!';
        setTimeout(() => (copyLinkText.textContent = 'Copy'), 2000);
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

  if (contactsList) {
    try {
      const rawParsed = JSON.parse(localStorage.getItem('paceplot_local_contacts_v1') || '[]');
      const savedLocal = Array.isArray(rawParsed) ? rawParsed : [];
      if (!Array.isArray(rawParsed)) {
        localStorage.setItem('paceplot_local_contacts_v1', '[]');
      }
      if (savedLocal.length > 0) {
        savedLocal.forEach((c) => {
          if (!c || !c.name) return;
          const card = document.createElement('div');
          card.className = 'p-2.5 rounded-xl bg-stone-50 dark:bg-stone-700/40 border border-stone-100 dark:border-stone-700 flex items-center justify-between';
          card.innerHTML = `
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 font-bold text-xs flex items-center justify-center">
                ${escapeHtml(c.name.slice(0, 2).toUpperCase())}
              </div>
              <div>
                <h4 class="text-xs font-bold text-stone-900 dark:text-white">${escapeHtml(c.name)}</h4>
                <p class="text-[10px] text-stone-500">${escapeHtml(c.phone || '')} • Live Link Recipient</p>
              </div>
            </div>
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">Saved</span>
          `;
          contactsList.appendChild(card);
        });
      }
    } catch (_) {}
  }

  if (btnSaveContact && contactsList) {
    btnSaveContact.addEventListener('click', async () => {
      const nameInput = document.getElementById('newContactName');
      const phoneInput = document.getElementById('newContactPhone');
      const name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : 'Emergency Contact';
      const phone = phoneInput && phoneInput.value.trim() ? phoneInput.value.trim() : '(216) 555-0100';

      if (store.currentUser) {
        try {
          await addEmergencyContact({ name, phone, role: 'Emergency Contact' });
          if (nameInput) nameInput.value = '';
          if (phoneInput) phoneInput.value = '';
          if (addContactForm) addContactForm.classList.add('hidden');
          speakInstruction('New emergency contact synced to Stride SafeGuard cloud.');
        } catch (err) {
          console.error('Error adding contact to Firestore:', err);
        }
      } else {
        try {
          const rawParsed = JSON.parse(localStorage.getItem('paceplot_local_contacts_v1') || '[]');
          const savedLocal = Array.isArray(rawParsed) ? rawParsed : [];
          savedLocal.push({ name, phone });
          localStorage.setItem('paceplot_local_contacts_v1', JSON.stringify(savedLocal));
        } catch (_) {}

        const newCard = document.createElement('div');
        newCard.className = 'p-2.5 rounded-xl bg-stone-50 dark:bg-stone-700/40 border border-stone-100 dark:border-stone-700 flex items-center justify-between';
        newCard.innerHTML = `
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 font-bold text-xs flex items-center justify-center">
              ${escapeHtml(name.slice(0, 2).toUpperCase())}
            </div>
            <div>
              <h4 class="text-xs font-bold text-stone-900 dark:text-white">${escapeHtml(name)}</h4>
              <p class="text-[10px] text-stone-500">${escapeHtml(phone)} • Live Link Recipient</p>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">Saved</span>
        `;

        contactsList.appendChild(newCard);
        if (nameInput) nameInput.value = '';
        if (phoneInput) phoneInput.value = '';
        if (addContactForm) addContactForm.classList.add('hidden');
        speakInstruction('New emergency contact saved.');
      }
    });
  }

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
      speakInstruction('Emergency warning! Immobility detected. Alerting emergency contacts in 45 seconds.');
      void syncLiveBeaconSession({ active: true, sosActive: true });

      clearInterval(sosInterval);
      sosInterval = setInterval(() => {
        count--;
        sosSecondsEl.textContent = count.toString();
        if (count === 30 || count === 15) {
          playTurnChime();
        }
        if (count <= 0) {
          clearInterval(sosInterval);
          sosBanner.innerHTML =
            '<div class="text-center font-bold text-sm"><i class="fa-solid fa-paper-plane mr-2"></i>Emergency SMS dispatched to all contacts with live GPS coordinates.</div>';
          speakInstruction('Emergency distress SMS dispatched to contacts.');
        }
      }, 1000);
    });
  }

  if (btnCancelSos && sosBanner) {
    btnCancelSos.addEventListener('click', () => {
      clearInterval(sosInterval);
      sosBanner.classList.add('hidden');
      void syncLiveBeaconSession({ sosActive: false });
      speakInstruction('Emergency alert cancelled. You are marked safe.');
    });
  }

  const btnSendTestSms = document.getElementById('btnSendTestBeaconSms');
  const testSmsToast = document.getElementById('testSmsToast');
  if (btnSendTestSms) {
    btnSendTestSms.addEventListener('click', async () => {
      playTurnChime();
      if (navigator.vibrate) {
        try {
          navigator.vibrate([60, 40, 80]);
        } catch (_) {}
      }

      const coord = store.currentUserGpsCoord || store.activeRoute?.center || { lat: 41.3857, lng: -81.7058 };
      let batteryPct = '88%';
      try {
        if ('getBattery' in navigator && typeof navigator.getBattery === 'function') {
          const bat = await navigator.getBattery();
          if (bat && Number.isFinite(bat.level)) {
            batteryPct = `${Math.round(bat.level * 100)}%`;
          }
        }
      } catch (_) {}

      void syncLiveBeaconSession({ active: true });

      const mapsUrl = `https://www.google.com/maps?q=${coord.lat.toFixed(6)},${coord.lng.toFixed(6)}`;
      const paceText = formatPaceValue(store.currentPaceSeconds || 510);
      const messageBody = `Pace Plot SafeGuard Live Beacon: I am out on a run (${store.activeRoute?.title || 'Safe Loop'}, target pace ${paceText}, battery ${batteryPct}). Live GPS coordinates: ${mapsUrl}`;

      if (testSmsToast) {
        testSmsToast.textContent = `Live GPS link ready (${coord.lat.toFixed(4)}, ${coord.lng.toFixed(4)}) · Battery ${batteryPct}`;
        testSmsToast.classList.remove('hidden');
        setTimeout(() => testSmsToast.classList.add('hidden'), 5000);
      }

      try {
        if (navigator.share) {
          await navigator.share({
            title: 'Pace Plot Live GPS Safety Beacon',
            text: messageBody,
            url: mapsUrl
          });
          return;
        }
      } catch (_) {}

      window.location.href = `sms:?body=${encodeURIComponent(messageBody)}`;
    });
  }
}
