import { store, escapeHtml } from './state/store.js';
import { setVoiceNavigationDucking } from './spotify.js';
import { formatShortDistance, getUnitSystem } from './units.js';

export function initSpeechSynthesis() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  function populateVoices() {
    store.speechVoices = window.speechSynthesis.getVoices();
    if (!store.speechVoices || store.speechVoices.length === 0) return;

    store.selectedVoice =
      store.speechVoices.find(
        (v) =>
          (v.lang === 'en-US' || v.lang.startsWith('en')) &&
          (v.name.includes('Google') ||
            v.name.includes('Natural') ||
            v.name.includes('Samantha') ||
            v.name.includes('Daniel') ||
            v.name.includes('Karen') ||
            v.name.includes('Alex'))
      ) ||
      store.speechVoices.find((v) => v.lang === 'en-US') ||
      store.speechVoices.find((v) => v.lang.startsWith('en')) ||
      store.speechVoices[0];
  }

  populateVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = populateVoices;
  }
}

export function playTurnChime() {
  try {
    if (typeof window === 'undefined') return;
    if (!store.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      store.audioCtx = new AudioCtx();
    }
    if (store.audioCtx.state === 'suspended') {
      store.audioCtx.resume();
    }
    const osc = store.audioCtx.createOscillator();
    const gain = store.audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, store.audioCtx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880.0, store.audioCtx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.12, store.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, store.audioCtx.currentTime + 0.32);
    osc.connect(gain);
    gain.connect(store.audioCtx.destination);
    osc.start();
    osc.stop(store.audioCtx.currentTime + 0.32);
  } catch (_) {}
}

export function speakInstruction(text, options = {}) {
  if (store.isVoiceMuted || !text) return;
  if (!store.isNavigating && !options.forceSpeak) return;

  const playChime = options.playChime !== false;
  if (playChime) {
    playTurnChime();
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  try {
    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    store.currentUtterance = utter;

    if (!store.selectedVoice && store.speechVoices.length === 0) {
      initSpeechSynthesis();
    }
    if (store.selectedVoice) {
      utter.voice = store.selectedVoice;
    }

    utter.rate = options.rate || 1.02;
    utter.pitch = options.pitch || 1.0;
    utter.lang = store.selectedVoice?.lang || 'en-US';

    const speakingBadge = typeof document !== 'undefined' ? document.getElementById('hudVoiceSpeakingBadge') : null;
    const navTurnIcon = typeof document !== 'undefined' ? document.getElementById('navTurnIcon') : null;

    utter.onstart = () => {
      if (speakingBadge) speakingBadge.classList.remove('hidden');
      if (navTurnIcon) navTurnIcon.classList.add('animate-pulse');
      setVoiceNavigationDucking(true);
    };

    utter.onend = () => {
      if (speakingBadge) speakingBadge.classList.add('hidden');
      if (navTurnIcon) navTurnIcon.classList.remove('animate-pulse');
      setVoiceNavigationDucking(false);
      store.currentUtterance = null;
    };

    utter.onerror = () => {
      if (speakingBadge) speakingBadge.classList.add('hidden');
      if (navTurnIcon) navTurnIcon.classList.remove('animate-pulse');
      setVoiceNavigationDucking(false);
      store.currentUtterance = null;
    };

    if (options.haptic && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(options.haptic);
      } catch (_) {}
    }

    setVoiceNavigationDucking(true);
    setTimeout(() => {
      if (!window.speechSynthesis.speaking) {
        setVoiceNavigationDucking(false);
      }
    }, 3800);

    window.speechSynthesis.speak(utter);
  } catch (err) {
    setVoiceNavigationDucking(false);
    console.warn('Web Speech API notice:', err);
  }
}

export function formatManeuverDistDisplay(maneuver, unitSystem = getUnitSystem()) {
  if (maneuver && Number.isFinite(maneuver.distanceMeters)) {
    return formatShortDistance(maneuver.distanceMeters, unitSystem);
  }
  if (!maneuver?.dist) return 'Start';
  if (unitSystem === 'metric' && typeof maneuver.dist === 'string') {
    const ftMatch = maneuver.dist.match(/(\d+(?:\.\d+)?)\s*ft/i);
    if (ftMatch) {
      const meters = Number(ftMatch[1]) * 0.3048;
      return formatShortDistance(meters, 'metric');
    }
    const miMatch = maneuver.dist.match(/(\d+(?:\.\d+)?)\s*mi/i);
    if (miMatch) {
      const meters = Number(miMatch[1]) * 1609.344;
      return formatShortDistance(meters, 'metric');
    }
  }
  return maneuver.dist;
}

export function renderManeuversPreviewList(routeData) {
  if (typeof document === 'undefined') return;
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

  const unitSystem = getUnitSystem();
  container.innerHTML = '';
  maneuvers.forEach((m) => {
    const distLabel = formatManeuverDistDisplay(m, unitSystem);
    const item = document.createElement('div');
    item.className =
      'p-2 rounded-xl bg-white dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700/80 flex items-center justify-between gap-2.5 transition hover:border-terracotta/40';
    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <div class="w-6 h-6 rounded-lg bg-stone-100 dark:bg-stone-700 text-terracotta flex items-center justify-center text-xs flex-shrink-0">
          <i class="fa-solid ${escapeHtml(m.icon || 'fa-arrow-up')}"></i>
        </div>
        <div class="truncate flex-1">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-bold text-stone-900 dark:text-white truncate">${escapeHtml(m.text)}</span>
          </div>
          <div class="text-[10px] text-stone-500 dark:text-stone-400 flex items-center gap-1 mt-0.5">
            <span class="font-mono font-bold text-amber-500">${escapeHtml(distLabel)}</span>
            <span>·</span>
            <span class="truncate">${escapeHtml(m.note || 'Safe pedestrian corridor')}</span>
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
        const speechText = `${distLabel && distLabel !== 'Start' ? distLabel + ', ' : ''}${m.text}. ${m.note || ''}`;
        speakInstruction(speechText, { forceSpeak: true });
      });
    }

    container.appendChild(item);
  });
}

export function syncVoiceMuteUI() {
  if (typeof document === 'undefined') return;
  const audioIcon = document.getElementById('audioIcon');
  const settingsVoiceLabel = document.getElementById('settingsVoiceStatusLabel');
  const navMuteIcon = document.getElementById('navMuteIcon');
  const navMuteBtn = document.getElementById('btnNavMute');

  if (store.isVoiceMuted) {
    if (audioIcon) audioIcon.className = 'fa-solid fa-volume-xmark text-stone-400';
    if (settingsVoiceLabel) {
      settingsVoiceLabel.textContent = 'Voice Muted';
      settingsVoiceLabel.className = 'text-[10px] text-stone-400 font-semibold';
    }
    if (navMuteIcon) navMuteIcon.className = 'fa-solid fa-volume-xmark text-stone-400';
    if (navMuteBtn) navMuteBtn.title = 'Unmute Voice Guidance';
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }
  } else {
    if (audioIcon) audioIcon.className = 'fa-solid fa-volume-high';
    if (settingsVoiceLabel) {
      settingsVoiceLabel.textContent = 'Voice Active';
      settingsVoiceLabel.className = 'text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold';
    }
    if (navMuteIcon) navMuteIcon.className = 'fa-solid fa-volume-high';
    if (navMuteBtn) navMuteBtn.title = 'Mute Voice Guidance';
  }
}

export function toggleVoiceMute() {
  store.isVoiceMuted = !store.isVoiceMuted;
  syncVoiceMuteUI();
  return store.isVoiceMuted;
}
