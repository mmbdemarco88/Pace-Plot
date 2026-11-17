// ----------------------------------------------------
// Pace Plot - Spotify Running Audio Mini-Player & Drawer UI
// ----------------------------------------------------
import { escapeHtml } from './state/store.js';
import {
  SUBSCRIPTION_STATUS,
  getSubscriptionState,
  startFreeTrial,
  openUpgradeModal,
  updatePremiumUI
} from './premium.js';
import {
  initSpotifyController,
  subscribeSpotifyState,
  getSpotifyPlayerState,
  formatTrackTime,
  initiateSpotifyOAuthPopup,
  connectWithAccessTokenDirect,
  disconnectSpotifyAccount,
  getCustomSpotifyClientId,
  setCustomSpotifyClientId,
  togglePlayPause,
  skipNextTrack,
  skipPreviousTrack,
  toggleShuffleState,
  selectPlaylistByIndex,
  selectTrackByIndex,
  seekTrackProgress,
  setPlayerVolume,
  setAutoDuckOnVoice,
  setSynthAudioEnabled,
  pausePlaybackForPaywall
} from './spotify.js';
import { playTurnChime, speakInstruction } from './voiceNav.js';

export function requireSpotifyPremiumAccess(actionLabel = 'control Spotify Running Audio') {
  const sub = getSubscriptionState();
  if (sub.hasAccess) return true;

  pausePlaybackForPaywall();
  const paywallMessage =
    sub.status === SUBSCRIPTION_STATUS.TRIAL_EXPIRED
      ? `Your 7-Day Free Trial has expired. Upgrade to Pace Plot PRO to ${actionLabel}.`
      : `Spotify Running Audio is a Pace Plot PRO feature. Start your 7-Day Free Trial or upgrade to PRO to ${actionLabel}.`;

  openUpgradeModal(paywallMessage);
  playTurnChime();
  speakInstruction(paywallMessage);
  return false;
}

export function initSpotifyMiniPlayerUI() {
  initSpotifyController((state) => {
    playTurnChime();
    speakInstruction(`Spotify account connected. Synced ${state.playlists.length} running playlists.`);
  });

  const modal = document.getElementById('modalSpotifyPlaylists');
  const btnCloseModal = document.getElementById('btnCloseSpotifyModal');
  const btnTopBarSpotify = document.getElementById('btnTopBarSpotify');
  const btnMapQuickSpotify = document.getElementById('btnMapQuickSpotify');
  const btnMapSpotifyOpenDrawer = document.getElementById('btnMapSpotifyOpenDrawer');
  const btnHudSpotifyExpand = document.getElementById('btnHudSpotifyExpand');
  const btnHudSpotifyPlaylists = document.getElementById('btnHudSpotifyPlaylists');
  const btnHudSpotifyConnectStatus = document.getElementById('btnHudSpotifyConnectStatus');
  const btnHudUnlockSpotifyPro = document.getElementById('btnHudUnlockSpotifyPro');
  const btnSpotifyGateStartTrial = document.getElementById('btnSpotifyGateStartTrial');
  const btnSpotifyGateOpenPaywall = document.getElementById('btnSpotifyGateOpenPaywall');

  const btnHudPlayPause = document.getElementById('btnHudSpotifyPlayPause');
  const btnHudPrev = document.getElementById('btnHudSpotifyPrev');
  const btnHudNext = document.getElementById('btnHudSpotifyNext');
  const btnHudShuffle = document.getElementById('btnHudSpotifyShuffle');
  const hudProgressTrack = document.getElementById('hudSpotifyProgressTrack');

  const btnMapPlayPause = document.getElementById('btnMapSpotifyPlayPause');
  const btnMapNext = document.getElementById('btnMapSpotifyNext');

  const btnOAuthConnect = document.getElementById('btnSpotifyOAuthConnect');
  const btnToggleConfigForm = document.getElementById('btnToggleSpotifyConfigForm');
  const configForm = document.getElementById('spotifyConfigForm');
  const inputClientId = document.getElementById('inputSpotifyClientId');
  const inputDirectToken = document.getElementById('inputSpotifyDirectToken');
  const btnSaveConfig = document.getElementById('btnSaveSpotifyConfig');
  const configFeedback = document.getElementById('spotifyConfigFeedback');
  const redirectUriDisplay = document.getElementById('spotifyRedirectUriDisplay');

  const volumeSlider = document.getElementById('spotifyVolumeSlider');
  const volumeValue = document.getElementById('spotifyVolumeValue');
  const toggleAutoDuck = document.getElementById('toggleSpotifyAutoDuck');
  const toggleSynthAudio = document.getElementById('toggleSpotifySynthAudio');

  if (redirectUriDisplay) redirectUriDisplay.textContent = `${window.location.origin}/auth/callback`;
  if (inputClientId) inputClientId.value = getCustomSpotifyClientId();

  function openSpotifyModal() {
    const settingsModal = document.getElementById('modalAppSettings');
    if (settingsModal) settingsModal.classList.add('hidden');
    if (modal) {
      modal.classList.remove('hidden');
      syncSpotifyHudAndPillUI(getSpotifyPlayerState());
      renderSpotifyModalLists(getSpotifyPlayerState());
    }
  }
  function closeSpotifyModal() {
    if (modal) modal.classList.add('hidden');
  }

  [
    btnTopBarSpotify,
    btnMapQuickSpotify,
    btnMapSpotifyOpenDrawer,
    btnHudSpotifyExpand,
    btnHudSpotifyPlaylists,
    btnHudSpotifyConnectStatus
  ].forEach((btn) => {
    if (btn) btn.addEventListener('click', openSpotifyModal);
  });

  if (btnCloseModal) btnCloseModal.addEventListener('click', closeSpotifyModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeSpotifyModal();
    });
  }

  if (btnHudUnlockSpotifyPro) {
    btnHudUnlockSpotifyPro.addEventListener('click', (e) => {
      e.stopPropagation();
      requireSpotifyPremiumAccess('play & sync Spotify Running Audio in your navigation HUD');
    });
  }

  if (btnSpotifyGateStartTrial) {
    btnSpotifyGateStartTrial.addEventListener('click', () => {
      startFreeTrial();
      updatePremiumUI();
      syncSpotifyHudAndPillUI(getSpotifyPlayerState());
      playTurnChime();
      speakInstruction('7-Day Free Trial activated! Spotify Running Audio is now unlocked.');
    });
  }

  if (btnSpotifyGateOpenPaywall) {
    btnSpotifyGateOpenPaywall.addEventListener('click', () => {
      closeSpotifyModal();
      openUpgradeModal('Upgrade to Pace Plot PRO for unlimited Spotify Running Audio, Pace-BPM syncing, and live turn-cue ducking.');
    });
  }

  if (btnHudPlayPause) {
    btnHudPlayPause.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!requireSpotifyPremiumAccess('play Spotify Running Audio')) return;
      togglePlayPause();
    });
  }
  if (btnMapPlayPause) {
    btnMapPlayPause.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!requireSpotifyPremiumAccess('play Spotify Running Audio')) return;
      togglePlayPause();
    });
  }
  if (btnHudNext) {
    btnHudNext.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!requireSpotifyPremiumAccess('skip tracks on Spotify')) return;
      skipNextTrack();
    });
  }
  if (btnMapNext) {
    btnMapNext.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!requireSpotifyPremiumAccess('skip tracks on Spotify')) return;
      skipNextTrack();
    });
  }
  if (btnHudPrev) {
    btnHudPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!requireSpotifyPremiumAccess('change tracks on Spotify')) return;
      skipPreviousTrack();
    });
  }
  if (btnHudShuffle) {
    btnHudShuffle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!requireSpotifyPremiumAccess('shuffle Spotify playlists')) return;
      toggleShuffleState();
    });
  }

  if (hudProgressTrack) {
    hudProgressTrack.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!requireSpotifyPremiumAccess('seek Spotify tracks')) return;
      const rect = hudProgressTrack.getBoundingClientRect();
      if (rect.width > 0) {
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        seekTrackProgress(pct * 100);
      }
    });
  }

  if (btnOAuthConnect) {
    btnOAuthConnect.addEventListener('click', async () => {
      if (!requireSpotifyPremiumAccess('connect your Spotify account')) return;
      const current = getSpotifyPlayerState();
      if (current.connected) {
        disconnectSpotifyAccount();
        speakInstruction('Spotify account disconnected.');
        return;
      }

      btnOAuthConnect.disabled = true;
      const origHtml = btnOAuthConnect.innerHTML;
      btnOAuthConnect.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Opening...</span>';

      const result = await initiateSpotifyOAuthPopup();
      btnOAuthConnect.disabled = false;
      btnOAuthConnect.innerHTML = origHtml;

      if (result && result.reason === 'missing_client_id') {
        if (configForm) configForm.classList.remove('hidden');
        if (configFeedback) {
          configFeedback.textContent = 'Enter your Spotify App ID or paste a session token below.';
          configFeedback.className = 'text-[10px] text-amber-400 font-medium';
          configFeedback.classList.remove('hidden');
        }
      }
    });
  }

  if (btnToggleConfigForm && configForm) {
    btnToggleConfigForm.addEventListener('click', () => configForm.classList.toggle('hidden'));
  }

  if (btnSaveConfig) {
    btnSaveConfig.addEventListener('click', async () => {
      if (!requireSpotifyPremiumAccess('configure your Spotify API credentials')) return;
      const clientIdVal = inputClientId ? inputClientId.value.trim() : '';
      const tokenVal = inputDirectToken ? inputDirectToken.value.trim() : '';

      if (clientIdVal) setCustomSpotifyClientId(clientIdVal);

      if (tokenVal) {
        const ok = await connectWithAccessTokenDirect(tokenVal);
        if (ok) {
          if (configFeedback) {
            configFeedback.textContent = 'Connected! Loaded your real Spotify playlists.';
            configFeedback.className = 'text-[10px] text-emerald-400 font-semibold';
            configFeedback.classList.remove('hidden');
          }
          if (inputDirectToken) inputDirectToken.value = '';
          playTurnChime();
          return;
        } else {
          if (configFeedback) {
            configFeedback.textContent = 'Token verification failed (invalid or expired token).';
            configFeedback.className = 'text-[10px] text-rose-400 font-semibold';
            configFeedback.classList.remove('hidden');
          }
          return;
        }
      }

      if (clientIdVal) {
        if (configFeedback) {
          configFeedback.textContent = 'Client ID saved! Click "Connect Spotify" above to sign in with Spotify.';
          configFeedback.className = 'text-[10px] text-emerald-400 font-semibold';
          configFeedback.classList.remove('hidden');
        }
      }
    });
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      const rawVal = parseFloat(e.target.value);
      const maxAttr = parseFloat(volumeSlider.max);
      const volPct = maxAttr > 0 && maxAttr <= 1 ? rawVal * 100 : rawVal;
      setPlayerVolume(volPct);
      if (volumeValue) volumeValue.textContent = `${Math.round(volPct)}%`;
    });
  }

  if (toggleAutoDuck) {
    toggleAutoDuck.addEventListener('change', (e) => setAutoDuckOnVoice(e.target.checked));
  }
  if (toggleSynthAudio) {
    toggleSynthAudio.addEventListener('change', (e) => setSynthAudioEnabled(e.target.checked));
  }

  subscribeSpotifyState((state) => {
    syncSpotifyHudAndPillUI(state);
    if (modal && !modal.classList.contains('hidden')) {
      renderSpotifyModalLists(state);
    }
  });

  syncSpotifyHudAndPillUI(getSpotifyPlayerState());
}

export function syncSpotifyHudAndPillUI(state) {
  if (!state) return;
  const sub = getSubscriptionState();
  const hasProAccess = sub.hasAccess;

  const track = state.track || {
    title: 'Midnight Stride (168 BPM)',
    artist: 'Pace Plot Running Mix',
    bpm: 168,
    durationMs: 214000,
    albumColor: '#E15A2B'
  };
  const playlist = state.playlists?.[state.activePlaylistIndex] || { name: '170 BPM Tempo Stride' };

  const mapSpotifyPill = document.getElementById('mapSpotifyFloatingPill');
  if (mapSpotifyPill) mapSpotifyPill.classList.toggle('hidden', !hasProAccess);

  const hudSpotifyMiniPlayer = document.getElementById('hudSpotifyMiniPlayer');
  if (hudSpotifyMiniPlayer) hudSpotifyMiniPlayer.classList.toggle('hidden', !hasProAccess);

  const hudPaywallOverlay = document.getElementById('hudSpotifyPaywallOverlay');
  if (hudPaywallOverlay) hudPaywallOverlay.classList.toggle('hidden', hasProAccess);

  const modalPaywallGate = document.getElementById('spotifyModalPaywallGate');
  if (modalPaywallGate) modalPaywallGate.classList.toggle('hidden', hasProAccess);

  const mapPillLockBadge = document.getElementById('mapSpotifyProLockBadge');
  const mapPillControls = document.getElementById('mapSpotifyQuickControls');
  if (mapPillLockBadge) mapPillLockBadge.classList.toggle('hidden', hasProAccess);
  if (mapPillControls) mapPillControls.classList.toggle('hidden', !hasProAccess);

  if (!hasProAccess && state.isPlaying) pausePlaybackForPaywall();

  const hudTrackTitle = document.getElementById('hudSpotifyTrackTitle');
  const hudTrackArtist = document.getElementById('hudSpotifyTrackArtist');
  const hudTrackBpm = document.getElementById('hudSpotifyTrackBpm');
  const hudPlayIcon = document.getElementById('hudSpotifyPlayIcon');
  const hudShuffleBtn = document.getElementById('btnHudSpotifyShuffle');
  const hudAlbumArt = document.getElementById('hudSpotifyAlbumArt');
  const hudEqOverlay = document.getElementById('hudSpotifyEqOverlay');
  const hudProgressBar = document.getElementById('hudSpotifyProgressBar');
  const hudTimeElapsed = document.getElementById('hudSpotifyTimeElapsed');
  const hudTimeDuration = document.getElementById('hudSpotifyTimeDuration');
  const hudPlaylistName = document.getElementById('hudSpotifyPlaylistName');
  const hudConnectBadge = document.getElementById('btnHudSpotifyConnectStatus');
  const hudDuckingBadge = document.getElementById('hudSpotifyDuckingBadge');

  if (hudTrackTitle) hudTrackTitle.textContent = track.title;
  if (hudTrackArtist) hudTrackArtist.textContent = track.artist;
  if (hudTrackBpm) hudTrackBpm.textContent = `${track.bpm || 165} BPM`;
  if (hudPlaylistName) hudPlaylistName.textContent = playlist.name;

  if (hudPlayIcon) {
    hudPlayIcon.className = state.isPlaying ? 'fa-solid fa-pause text-xs' : 'fa-solid fa-play text-xs ml-0.5';
  }
  if (hudShuffleBtn) {
    hudShuffleBtn.classList.toggle('text-[#1DB954]', state.isShuffle);
    hudShuffleBtn.classList.toggle('text-stone-400', !state.isShuffle);
  }
  if (hudEqOverlay) hudEqOverlay.classList.toggle('eq-playing', state.isPlaying);
  if (hudAlbumArt) {
    const artUrl = track.artworkUrl || track.albumArtUrl;
    const safeArtUrl =
      typeof artUrl === 'string' &&
      /^https?:\/\//i.test(artUrl.trim()) &&
      !/['"()\\\r\n]/.test(artUrl)
        ? artUrl.trim()
        : '';
    if (safeArtUrl) {
      hudAlbumArt.style.backgroundImage = `url('${safeArtUrl}')`;
      hudAlbumArt.style.backgroundSize = 'cover';
      hudAlbumArt.style.backgroundPosition = 'center';
    } else {
      hudAlbumArt.style.backgroundImage = 'none';
      hudAlbumArt.style.background = `linear-gradient(135deg, ${track.albumColor || '#E15A2B'}, #1DB954)`;
    }
  }

  const dur = track.durationMs || 210000;
  const pct = Math.max(0, Math.min(100, (state.progressMs / dur) * 100));
  if (hudProgressBar) hudProgressBar.style.width = `${pct.toFixed(1)}%`;
  if (hudTimeElapsed) hudTimeElapsed.textContent = formatTrackTime(state.progressMs);
  if (hudTimeDuration) hudTimeDuration.textContent = formatTrackTime(dur);

  if (hudDuckingBadge) hudDuckingBadge.classList.toggle('hidden', !state.isDuckedForVoice);

  if (hudConnectBadge) {
    if (state.connected) {
      hudConnectBadge.textContent = state.userProfile?.displayName ? `${state.userProfile.displayName}` : 'Spotify Connected';
      hudConnectBadge.className =
        'px-2 py-0.5 rounded-full bg-[#1DB954]/20 text-[#1DB954] border border-[#1DB954]/30 text-[9px] font-bold hover:opacity-90 transition cursor-pointer';
    } else {
      hudConnectBadge.textContent = 'Built-in Running Mix';
      hudConnectBadge.className =
        'px-2 py-0.5 rounded-full bg-stone-800 text-stone-400 border border-stone-700 text-[9px] font-bold hover:text-white transition cursor-pointer';
    }
  }

  const mapTitle = document.getElementById('mapSpotifyTrackTitle');
  const mapPlayIcon = document.getElementById('mapSpotifyPlayIcon');
  const mapEqBars = document.getElementById('mapSpotifyEqBars');
  const topBtn = document.getElementById('btnTopBarSpotify');

  if (mapTitle) mapTitle.textContent = !hasProAccess ? 'Spotify Audio · PRO' : state.isPlaying ? track.title : playlist.name;
  if (mapPlayIcon) mapPlayIcon.className = state.isPlaying ? 'fa-solid fa-pause text-[10px]' : 'fa-solid fa-play text-[10px] ml-0.5';
  if (mapEqBars) mapEqBars.classList.toggle('eq-playing', state.isPlaying);
  if (topBtn) topBtn.classList.toggle('ring-2', state.isPlaying && hasProAccess);

  const modalStatusText = document.getElementById('spotifyConnectionStatusText');
  const btnOAuthConnect = document.getElementById('btnSpotifyOAuthConnect');
  if (modalStatusText) {
    modalStatusText.textContent = state.connected
      ? `Connected as ${state.userProfile?.displayName || 'Spotify Runner'} (${state.playlists.length} playlists)`
      : 'Playing built-in Pace Plot Running Audio (Connect Spotify for personal playlists)';
  }
  if (btnOAuthConnect) {
    if (state.connected) {
      btnOAuthConnect.innerHTML = '<i class="fa-solid fa-link-slash"></i><span>Disconnect</span>';
      btnOAuthConnect.className =
        'px-3 py-1.5 rounded-xl bg-stone-700 hover:bg-stone-600 text-stone-200 text-xs font-bold flex items-center gap-1.5 transition flex-shrink-0 cursor-pointer';
    } else {
      btnOAuthConnect.innerHTML = '<i class="fa-brands fa-spotify"></i><span>Connect Spotify</span>';
      btnOAuthConnect.className =
        'px-3 py-1.5 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-stone-950 text-xs font-extrabold flex items-center gap-1.5 transition flex-shrink-0 cursor-pointer';
    }
  }
}

export function renderSpotifyModalLists(state) {
  const playlistsContainer = document.getElementById('spotifyPlaylistsContainer');
  const tracksContainer = document.getElementById('spotifyTracksContainer');
  const countBadge = document.getElementById('spotifyPlaylistCountBadge');
  if (!playlistsContainer || !tracksContainer || !state) return;

  const playlists = state.playlists || [];
  if (countBadge) countBadge.textContent = `${playlists.length} Playlists`;

  playlistsContainer.innerHTML = '';
  playlists.forEach((pl, idx) => {
    const isActive = idx === state.activePlaylistIndex;
    const chip = document.createElement('button');
    chip.className = isActive
      ? 'flex-shrink-0 px-3 py-2 rounded-2xl bg-[#1DB954]/20 border border-[#1DB954] text-left transition cursor-pointer min-w-[140px]'
      : 'flex-shrink-0 px-3 py-2 rounded-2xl bg-stone-800/80 border border-stone-700 hover:border-stone-500 text-left transition cursor-pointer min-w-[140px]';
    chip.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <span class="text-[11px] font-extrabold ${isActive ? 'text-[#1DB954]' : 'text-white'} truncate max-w-[110px]">${escapeHtml(pl.name)}</span>
        <span class="text-[9px] font-mono px-1.5 py-0.2 rounded bg-stone-900 text-amber-400">${escapeHtml(pl.bpmRange || '165 BPM')}</span>
      </div>
      <div class="text-[10px] text-stone-400 truncate mt-0.5">${escapeHtml(pl.description || `${pl.tracks?.length || 0} tracks`)}</div>
    `;
    chip.addEventListener('click', async () => {
      if (!requireSpotifyPremiumAccess('switch Spotify running playlists')) return;
      await selectPlaylistByIndex(idx);
      playTurnChime();
    });
    playlistsContainer.appendChild(chip);
  });

  const activePl = playlists[state.activePlaylistIndex];
  const tracks = activePl?.tracks || [];
  tracksContainer.innerHTML = '';
  if (tracks.length === 0) {
    tracksContainer.innerHTML = '<div class="text-xs text-stone-400 text-center py-4">Select a playlist above to view tracks.</div>';
    return;
  }

  tracks.forEach((tr, tIdx) => {
    const isCurrent = tIdx === state.activeTrackIndex;
    const row = document.createElement('div');
    row.className = isCurrent
      ? 'p-2 rounded-xl bg-[#1DB954]/15 border border-[#1DB954]/40 flex items-center justify-between gap-2 cursor-pointer transition'
      : 'p-2 rounded-xl bg-stone-800/60 hover:bg-stone-800 border border-stone-800 flex items-center justify-between gap-2 cursor-pointer transition';
    row.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] flex-shrink-0" style="background: linear-gradient(135deg, ${escapeHtml(tr.albumColor || '#1DB954')}, #1c1917);">
          <i class="fa-solid ${isCurrent && state.isPlaying ? 'fa-volume-high text-[#1DB954]' : 'fa-play'}"></i>
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-xs font-bold ${isCurrent ? 'text-[#1DB954]' : 'text-white'} truncate">${escapeHtml(tr.title)}</div>
          <div class="text-[10px] text-stone-400 truncate">${escapeHtml(tr.artist)}</div>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0 text-[10px] font-mono">
        <span class="text-amber-400 font-bold">${escapeHtml(String(tr.bpm ?? 165))} BPM</span>
        <span class="text-stone-400">${formatTrackTime(tr.durationMs || 200000)}</span>
      </div>
    `;
    row.addEventListener('click', () => {
      if (!requireSpotifyPremiumAccess('play Spotify running tracks')) return;
      selectTrackByIndex(tIdx);
    });
    tracksContainer.appendChild(row);
  });
}
