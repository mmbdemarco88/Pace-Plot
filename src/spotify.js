// ----------------------------------------------------
// Pace Plot - Spotify Web API & Running Playlist Controller
// Supports Popup OAuth 2.0 (PKCE + Server Code Exchange),
// Live Spotify Connect Player API, Auto-Ducking for Voice Nav,
// and Web Audio API Cadence Synthesizer for Running Playlists
// ----------------------------------------------------

const SPOTIFY_STORAGE_KEY = 'paceplot_spotify_tokens';
const SPOTIFY_CLIENT_ID_KEY = 'paceplot_spotify_custom_client_id';
const SPOTIFY_VERIFIER_KEY = 'paceplot_spotify_pkce_verifier';
const SPOTIFY_STATE_KEY = 'paceplot_spotify_ActiveState';

// Curated Running Playlists (Used as immediate playable cadence playlists
// and synced alongside the user's personal Spotify playlists when connected)
export const RUNNING_PLAYLISTS = [
  {
    id: 'pl_cadence_170',
    uri: 'spotify:playlist:37i9dQZF1DX8JNefe0709J',
    name: '170 BPM Cadence Crusher',
    subtitle: 'Optimal Base & 5K Stride Lock',
    bpmRange: '168–172 BPM',
    targetPaceLabel: 'Base 8\'30"/mi',
    coverGradient: 'from-emerald-500 via-teal-600 to-stone-900',
    accentColor: '#1DB954',
    tracks: [
      {
        id: 'trk_1',
        title: 'Midnight Greenway Stride',
        artist: 'Variable Pulse · Stride Circuit',
        album: 'Run Safe Vol. 1',
        durationMs: 214000,
        bpm: 170,
        rootFreq: 110.0 // A2
      },
      {
        id: 'trk_2',
        title: 'Negative Split Horizon',
        artist: 'Kinetic Loop',
        album: 'Run Safe Vol. 1',
        durationMs: 198000,
        bpm: 172,
        rootFreq: 123.47 // B2
      },
      {
        id: 'trk_3',
        title: 'Asphalt & Starlight',
        artist: 'Nova Cadence',
        album: 'Night Lit Corridors',
        durationMs: 226000,
        bpm: 168,
        rootFreq: 130.81 // C3
      },
      {
        id: 'trk_4',
        title: 'West Creek Tempo',
        artist: 'Aero Runner',
        album: 'Emerald Necklace',
        durationMs: 205000,
        bpm: 170,
        rootFreq: 146.83 // D3
      }
    ]
  },
  {
    id: 'pl_tempo_178',
    uri: 'spotify:playlist:37i9dQZF1DX35oM5SPECmN',
    name: 'Tempo Threshold 178 BPM',
    subtitle: 'High-Output Speed & Interval Lock',
    bpmRange: '176–180 BPM',
    targetPaceLabel: 'Tempo 7\'30"/mi',
    coverGradient: 'from-orange-500 via-rose-600 to-stone-900',
    accentColor: '#E15A2B',
    tracks: [
      {
        id: 'trk_5',
        title: 'Lactate Threshold Drive',
        artist: 'Apex Velocity',
        album: 'Zone 4 Ignition',
        durationMs: 189000,
        bpm: 178,
        rootFreq: 130.81
      },
      {
        id: 'trk_6',
        title: 'Final Kilometer Surge',
        artist: 'Tracksmiths',
        album: 'PR Chaser',
        durationMs: 202000,
        bpm: 180,
        rootFreq: 146.83
      },
      {
        id: 'trk_7',
        title: 'Carbon Plate Bounce',
        artist: 'Sub-20 Collective',
        album: 'Zone 4 Ignition',
        durationMs: 195000,
        bpm: 176,
        rootFreq: 110.0
      }
    ]
  },
  {
    id: 'pl_night_synth',
    uri: 'spotify:playlist:37i9dQZF1DXdLEN7aqioXM',
    name: 'Night Lit Synthwave Run',
    subtitle: 'Illuminated Street & Park Loops',
    bpmRange: '162–166 BPM',
    targetPaceLabel: 'Steady 8\'45"/mi',
    coverGradient: 'from-sky-500 via-indigo-600 to-stone-900',
    accentColor: '#38bdf8',
    tracks: [
      {
        id: 'trk_8',
        title: 'Reflective Vest Glow',
        artist: 'Neon Headlamp',
        album: 'After Dusk Safe Run',
        durationMs: 232000,
        bpm: 164,
        rootFreq: 98.0 // G2
      },
      {
        id: 'trk_9',
        title: 'Boardwalk Reflections',
        artist: 'Lady Bird Synth',
        album: 'Austin Night Loop',
        durationMs: 218000,
        bpm: 166,
        rootFreq: 110.0
      },
      {
        id: 'trk_10',
        title: 'Reservoir Perimeter',
        artist: 'Central Park Grid',
        album: 'Manhattan Dusk',
        durationMs: 210000,
        bpm: 162,
        rootFreq: 123.47
      }
    ]
  },
  {
    id: 'pl_easy_recovery',
    uri: 'spotify:playlist:37i9dQZF1DX4sWSpwq3LiO',
    name: 'Zone 2 Easy Recovery Groove',
    subtitle: 'Conversational Aerobic Base',
    bpmRange: '152–158 BPM',
    targetPaceLabel: 'Easy 9\'45"/mi',
    coverGradient: 'from-amber-500 via-emerald-600 to-stone-900',
    accentColor: '#f59e0b',
    tracks: [
      {
        id: 'trk_11',
        title: 'Sunday Morning Shakeout',
        artist: 'Warmup Club',
        album: 'Conversational Pace',
        durationMs: 240000,
        bpm: 156,
        rootFreq: 130.81
      },
      {
        id: 'trk_12',
        title: 'Canopy Trail Breeze',
        artist: 'Greenway Acoustic',
        album: 'Easy Miles',
        durationMs: 224000,
        bpm: 154,
        rootFreq: 110.0
      }
    ]
  }
];

// Internal Player & Connection State
let spotifyTokens = loadStoredTokens();
let spotifyUserProfile = null;
let userSpotifyPlaylists = [];
let activePlaylistIndex = 0;
let activeTrackIndex = 0;
let isPlaying = false;
let isShuffle = false;
let volumePercent = 82;
let isDuckedForVoice = false;
let autoDuckEnabled = true;
let cadenceSyncEnabled = true;
let progressMs = 42000;
let progressTimer = null;
let spotifyPollTimer = null;
let activeRemoteDeviceName = null;
let isUsingRemoteSpotifyPlayback = false;
let previewAudioElement = null;

// Web Audio API Cadence Beat Synthesizer state
let beatAudioCtx = null;
let beatSchedulerTimer = null;
let beatStep = 0;
let synthAudioEnabled = true;

const stateListeners = new Set();

function loadStoredTokens() {
  try {
    const raw = localStorage.getItem(SPOTIFY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function saveStoredTokens(tokens) {
  spotifyTokens = tokens;
  try {
    if (tokens) {
      localStorage.setItem(SPOTIFY_STORAGE_KEY, JSON.stringify(tokens));
    } else {
      localStorage.removeItem(SPOTIFY_STORAGE_KEY);
    }
  } catch (_) {}
}

export function getCustomSpotifyClientId() {
  try {
    return localStorage.getItem(SPOTIFY_CLIENT_ID_KEY) || '';
  } catch (_) {
    return '';
  }
}

export function setCustomSpotifyClientId(clientId) {
  try {
    if (clientId && clientId.trim()) {
      localStorage.setItem(SPOTIFY_CLIENT_ID_KEY, clientId.trim());
    } else {
      localStorage.removeItem(SPOTIFY_CLIENT_ID_KEY);
    }
  } catch (_) {}
}

export function isSpotifyConnected() {
  return Boolean(spotifyTokens && spotifyTokens.access_token);
}

export function getAllPlaylists() {
  return [... userSpotifyPlaylists, ...RUNNING_PLAYLISTS];
}

export function getActivePlaylist() {
  const all = getAllPlaylists();
  return all[activePlaylistIndex] || RUNNING_PLAYLISTS[0];
}

export function getActiveTrack() {
  const pl = getActivePlaylist();
  const tracks = pl?.tracks || RUNNING_PLAYLISTS[0].tracks;
  return tracks[activeTrackIndex % tracks.length] || tracks[0];
}

export function getSpotifyPlayerState() {
  const pl = getActivePlaylist();
  const track = getActiveTrack();
  return {
    connected: isSpotifyConnected(),
    userProfile: spotifyUserProfile,
    deviceName: activeRemoteDeviceName || (isSpotifyConnected() ? 'Spotify Web API' : 'Pace Plot Cadence Synth'),
    isRemoteSpotify: isUsingRemoteSpotifyPlayback,
    isPlaying,
    isShuffle,
    volumePercent,
    isDuckedForVoice,
    autoDuckEnabled,
    cadenceSyncEnabled,
    synthAudioEnabled,
    progressMs,
    durationMs: track?.durationMs || 210000,
    playlist: pl,
    track,
    playlists: getAllPlaylists(),
    activePlaylistIndex,
    activeTrackIndex
  };
}

export function subscribeSpotifyState(listener) {
  stateListeners.add(listener);
  listener(getSpotifyPlayerState());
  return () => stateListeners.delete(listener);
}

function notifyListeners() {
  const snapshot = getSpotifyPlayerState();
  stateListeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (e) {
      console.warn('Spotify state listener error:', e);
    }
  });
}

export function formatTrackTime(ms) {
  const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = (totalSec % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

// ----------------------------------------------------
// PKCE Cryptographic Helpers for Spotify OAuth 2.0
// ----------------------------------------------------
function generateRandomString(length = 64) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values)
    .map((x) => possible[x % possible.length])
    .join('');
}

async function generateCodeChallenge(codeVerifier) {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ----------------------------------------------------
// Spotify OAuth Popup Flow (Follows oauth-integration skill)
// ----------------------------------------------------
export async function initiateSpotifyOAuthPopup(callbacks = {}) {
  try {
    const codeVerifier = generateRandomString(64);
    try {
      localStorage.setItem(SPOTIFY_VERIFIER_KEY, codeVerifier);
    } catch (_) {}

    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const redirectUri = `${window.location.origin}/auth/callback`;
    const customClientId = getCustomSpotifyClientId();

    const queryParams = new URLSearchParams({
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      state: 'paceplot_spotify_oauth'
    });
    if (customClientId) {
      queryParams.set('client_id', customClientId);
    }

    const res = await fetch(`/api/spotify/auth/url?${queryParams.toString()}`);
    if (!res.ok) {
      throw new Error('Could not fetch Spotify authorization URL');
    }

    const data = await res.json();
    if (!data.configured || !data.url) {
      if (typeof callbacks.onNeedsConfig === 'function') {
        callbacks.onNeedsConfig(data.redirectUri || redirectUri);
      }
      return { opened: false, reason: 'missing_client_id', redirectUri: data.redirectUri || redirectUri };
    }

    // Open Spotify's authorization endpoint directly in the popup window
    const authWindow = window.open(
      data.url,
      'spotify_oauth_popup',
      'width=520,height=720,menubar=no,toolbar=no,location=no,status=no'
    );

    if (!authWindow) {
      if (typeof callbacks.onPopupBlocked === 'function') {
        callbacks.onPopupBlocked();
      }
      return { opened: false, reason: 'popup_blocked' };
    }

    return { opened: true, redirectUri };
  } catch (err) {
    console.error('Spotify OAuth initiation error:', err);
    if (typeof callbacks.onError === 'function') {
      callbacks.onError(err);
    }
    return { opened: false, reason: 'error', error: err };
  }
}

export async function handleSpotifyOAuthCallbackCode(code) {
  if (!code) return false;
  const redirectUri = `${window.location.origin}/auth/callback`;
  const codeVerifier = localStorage.getItem(SPOTIFY_VERIFIER_KEY) || '';
  const customClientId = getCustomSpotifyClientId();

  try {
    const res = await fetch('/api/spotify/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grantType: 'authorization_code',
        code,
        redirectUri,
        codeVerifier,
        clientId: customClientId || undefined
      })
    });

    const tokenData = await res.json();
    if (tokenData && tokenData.access_token) {
      const expiresAt = Date.now() + (Number(tokenData.expires_in || 3600) * 1000);
      saveStoredTokens({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || spotifyTokens?.refresh_token || '',
        expires_at: expiresAt
      });
      await syncSpotifyAccountData();
      notifyListeners();
      return true;
    }
  } catch (err) {
    console.error('Spotify token exchange error:', err);
  }
  return false;
}

export async function connectWithAccessTokenDirect(accessToken) {
  if (!accessToken || !accessToken.trim()) return false;
  saveStoredTokens({
    access_token: accessToken.trim(),
    refresh_token: '',
    expires_at: Date.now() + 3600 * 1000
  });
  const ok = await syncSpotifyAccountData();
  notifyListeners();
  return ok;
}

export function disconnectSpotifyAccount() {
  saveStoredTokens(null);
  spotifyUserProfile = null;
  userSpotifyPlaylists = [];
  activeRemoteDeviceName = null;
  isUsingRemoteSpotifyPlayback = false;
  activePlaylistIndex = 0;
  activeTrackIndex = 0;
  if (spotifyPollTimer) {
    clearInterval(spotifyPollTimer);
    spotifyPollTimer = null;
  }
  notifyListeners();
}

// ----------------------------------------------------
// Real Spotify Web API Calls (https://api.spotify.com/v1)
// ----------------------------------------------------
async function spotifyApiFetch(endpoint, options = {}) {
  if (!spotifyTokens || !spotifyTokens.access_token) return null;

  // Refresh token if near expiry
  if (spotifyTokens.expires_at && Date.now() > spotifyTokens.expires_at - 60000 && spotifyTokens.refresh_token) {
    try {
      const refreshRes = await fetch('/api/spotify/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grantType: 'refresh_token',
          refreshToken: spotifyTokens.refresh_token,
          clientId: getCustomSpotifyClientId() || undefined
        })
      });
      if (refreshRes.ok) {
        const refreshed = await refreshRes.json();
        if (refreshed.access_token) {
          saveStoredTokens({
            ...spotifyTokens,
            access_token: refreshed.access_token,
            expires_at: Date.now() + (Number(refreshed.expires_in || 3600) * 1000)
          });
        }
      }
    } catch (_) {}
  }

  const url = endpoint.startsWith('http') ? endpoint : `https://api.spotify.com/v1${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${spotifyTokens.access_token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    // Token expired or revoked
    saveStoredTokens(null);
    notifyListeners();
    return null;
  }

  if (res.status === 204) {
    return { status: 204 };
  }

  if (!res.ok) {
    return null;
  }

  try {
    return await res.json();
  } catch (_) {
    return { status: res.status };
  }
}

export async function syncSpotifyAccountData() {
  if (!isSpotifyConnected()) return false;

  try {
    const [profile, playlistsData, playerData] = await Promise.all([
      spotifyApiFetch('/me'),
      spotifyApiFetch('/me/playlists?limit=8'),
      spotifyApiFetch('/me/player')
    ]);

    if (profile && profile.id) {
      spotifyUserProfile = {
        id: profile.id,
        displayName: profile.display_name || profile.id,
        product: profile.product || 'premium',
        avatarUrl: profile.images?.[0]?.url || null
      };
    }

    if (playlistsData && Array.isArray(playlistsData.items) && playlistsData.items.length > 0) {
      const loadedPlaylists = [];
      for (const item of playlistsData.items.slice(0, 5)) {
        loadedPlaylists.push({
          id: `spotify_${item.id}`,
          uri: item.uri,
          name: item.name || 'Spotify Playlist',
          subtitle: `${item.tracks?.total || 12} tracks · Spotify Library`,
          bpmRange: 'Spotify Sync',
          targetPaceLabel: 'Live Playlist',
          coverImage: item.images?.[0]?.url || null,
          coverGradient: 'from-emerald-600 via-green-700 to-stone-900',
          accentColor: '#1DB954',
          isRemotePlaylist: true,
          tracks: [
            {
              id: `sp_trk_${item.id}_0`,
              title: `${item.name} (Live Stream)`,
              artist: item.owner?.display_name || 'Spotify Running Mix',
              album: item.name,
              durationMs: 215000,
              bpm: 170,
              rootFreq: 110.0
            }
          ]
        });
      }
      userSpotifyPlaylists = loadedPlaylists;
    }

    if (playerData && playerData.item) {
      applyRemotePlaybackState(playerData);
    }

    // Start polling live Spotify playback every 5s while connected
    if (spotifyPollTimer) clearInterval(spotifyPollTimer);
    spotifyPollTimer = setInterval(pollRemoteSpotifyPlayer, 5000);

    notifyListeners();
    return Boolean(profile && profile.id);
  } catch (err) {
    console.warn('Error syncing Spotify account data:', err);
    return false;
  }
}

async function pollRemoteSpotifyPlayer() {
  if (!isSpotifyConnected()) return;
  const playerData = await spotifyApiFetch('/me/player');
  if (playerData && playerData.item) {
    applyRemotePlaybackState(playerData);
    notifyListeners();
  }
}

function applyRemotePlaybackState(playerData) {
  if (!playerData || !playerData.item) return;
  isUsingRemoteSpotifyPlayback = true;
  activeRemoteDeviceName = playerData.device?.name || 'Spotify Connect';
  isPlaying = Boolean(playerData.is_playing);
  isShuffle = Boolean(playerData.shuffle_state);
  if (typeof playerData.device?.volume_percent === 'number' && !isDuckedForVoice) {
    volumePercent = playerData.device.volume_percent;
  }
  progressMs = Number(playerData.progress_ms || 0);

  const item = playerData.item;
  const remoteTrack = {
    id: item.id || 'remote_track',
    title: item.name || 'Unknown Track',
    artist: Array.isArray(item.artists) ? item.artists.map((a) => a.name).join(', ') : 'Spotify Artist',
    album: item.album?.name || 'Spotify',
    artworkUrl: item.album?.images?.[0]?.url || null,
    durationMs: Number(item.duration_ms || 210000),
    previewUrl: item.preview_url || null,
    bpm: 170,
    rootFreq: 110.0
  };

  // Ensure current playlist reflects live track
  const activePl = getActivePlaylist();
  if (activePl) {
    activePl.tracks[activeTrackIndex] = remoteTrack;
  }
}

// ----------------------------------------------------
// Web Audio API Running Cadence Beat Synthesizer
// Generates crisp, musical running beats calibrated to Track BPM
// when playing in browser without requiring external MP3 hosts
// ----------------------------------------------------
function ensureBeatAudioContext() {
  if (!beatAudioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      beatAudioCtx = new AudioCtx();
    }
  }
  if (beatAudioCtx && beatAudioCtx.state === 'suspended') {
    beatAudioCtx.resume().catch(() => {});
  }
  return beatAudioCtx;
}

function scheduleSynthStep() {
  if (!isPlaying || !synthAudioEnabled || isUsingRemoteSpotifyPlayback) return;
  const ctx = ensureBeatAudioContext();
  if (!ctx) return;

  const track = getActiveTrack();
  const bpm = track?.bpm || 170;
  const rootFreq = track?.rootFreq || 110.0;
  const effectiveVol = (isDuckedForVoice ? Math.min(volumePercent, 22) : volumePercent) / 100;
  const masterLevel = Math.max(0.01, effectiveVol * 0.14);

  const now = ctx.currentTime;
  const stepInBar = beatStep % 8;

  // 1. Kick drum on every quarter note (steps 0, 2, 4, 6 -> exact running footstrike cadence!)
  if (stepInBar % 2 === 0) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.11);
    gain.gain.setValueAtTime(masterLevel * 1.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  // 2. Crisp off-beat hi-hat tick (steps 1, 3, 5, 7)
  if (stepInBar % 2 === 1) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(3200, now);
    gain.gain.setValueAtTime(masterLevel * 0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  // 3. Warm synth bass / arpeggio pulse on selected steps
  const chordRatios = [1, 1.2, 1.5, 1.2, 1.333, 1.5, 1.2, 1.0];
  const noteFreq = rootFreq * chordRatios[stepInBar];
  const bassOsc = ctx.createOscillator();
  const bassGain = ctx.createGain();
  bassOsc.type = 'triangle';
  bassOsc.frequency.setValueAtTime(noteFreq, now);
  bassGain.gain.setValueAtTime(masterLevel * 0.45, now);
  bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  bassOsc.connect(bassGain);
  bassGain.connect(ctx.destination);
  bassOsc.start(now);
  bassOsc.stop(now + 0.15);

  beatStep++;

  // Eighth-note interval: (60 / bpm / 2) * 1000 ms
  const stepMs = Math.max(120, Math.round((30 / bpm) * 1000));
  clearTimeout(beatSchedulerTimer);
  beatSchedulerTimer = setTimeout(scheduleSynthStep, stepMs);
}

function startLocalProgressAndSynth() {
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    if (!isPlaying) return;
    const track = getActiveTrack();
    const duration = track?.durationMs || 210000;
    progressMs += 1000;
    if (progressMs >= duration) {
      progressMs = 0;
      skipNextTrack();
      return;
    }
    notifyListeners();
  }, 1000);

  clearTimeout(beatSchedulerTimer);
  if (synthAudioEnabled && !isUsingRemoteSpotifyPlayback) {
    scheduleSynthStep();
  }
}

function stopLocalProgressAndSynth() {
  clearInterval(progressTimer);
  progressTimer = null;
  clearTimeout(beatSchedulerTimer);
  beatSchedulerTimer = null;
  if (previewAudioElement) {
    previewAudioElement.pause();
  }
}

// ----------------------------------------------------
// Transport Controls (Play/Pause, Next, Prev, Shuffle, Seek, Volume)
// ----------------------------------------------------
export async function togglePlayPause() {
  isPlaying = !isPlaying;

  if (isSpotifyConnected()) {
    const endpoint = isPlaying ? '/me/player/play' : '/me/player/pause';
    const res = await spotifyApiFetch(endpoint, { method: 'PUT' });
    if (res) {
      isUsingRemoteSpotifyPlayback = true;
    }
  }

  if (isPlaying) {
    ensureBeatAudioContext();
    startLocalProgressAndSynth();
  } else {
    stopLocalProgressAndSynth();
  }

  notifyListeners();
  return isPlaying;
}

export async function skipNextTrack() {
  const pl = getActivePlaylist();
  const tracks = pl?.tracks || RUNNING_PLAYLISTS[0].tracks;

  if (isShuffle && tracks.length > 1) {
    activeTrackIndex = (activeTrackIndex + 1 + Math.floor(Math.random() * (tracks.length - 1))) % tracks.length;
  } else {
    activeTrackIndex = (activeTrackIndex + 1) % tracks.length;
  }
  progressMs = 0;

  if (isSpotifyConnected()) {
    await spotifyApiFetch('/me/player/next', { method: 'POST' });
    setTimeout(pollRemoteSpotifyPlayer, 500);
  }

  if (isPlaying) {
    startLocalProgressAndSynth();
  }
  notifyListeners();
  return getActiveTrack();
}

export async function skipPreviousTrack() {
  if (progressMs > 5000) {
    progressMs = 0;
    if (isSpotifyConnected()) {
      await spotifyApiFetch('/me/player/seek?position_ms=0', { method: 'PUT' });
    }
    notifyListeners();
    return getActiveTrack();
  }

  const pl = getActivePlaylist();
  const tracks = pl?.tracks || RUNNING_PLAYLISTS[0].tracks;
  activeTrackIndex = (activeTrackIndex - 1 + tracks.length) % tracks.length;
  progressMs = 0;

  if (isSpotifyConnected()) {
    await spotifyApiFetch('/me/player/previous', { method: 'POST' });
    setTimeout(pollRemoteSpotifyPlayer, 500);
  }

  if (isPlaying) {
    startLocalProgressAndSynth();
  }
  notifyListeners();
  return getActiveTrack();
}

export async function toggleShuffleState() {
  isShuffle = !isShuffle;
  if (isSpotifyConnected()) {
    await spotifyApiFetch(`/me/player/shuffle?state=${isShuffle}`, { method: 'PUT' });
  }
  notifyListeners();
  return isShuffle;
}

export async function selectPlaylistByIndex(index, autoPlay = true) {
  const all = getAllPlaylists();
  if (index < 0 || index >= all.length) return;
  activePlaylistIndex = index;
  activeTrackIndex = 0;
  progressMs = 0;

  const selected = all[index];
  if (isSpotifyConnected() && selected.uri) {
    await spotifyApiFetch('/me/player/play', {
      method: 'PUT',
      body: JSON.stringify({ context_uri: selected.uri })
    });
  }

  if (autoPlay) {
    isPlaying = true;
    ensureBeatAudioContext();
    startLocalProgressAndSynth();
  }

  notifyListeners();
  return selected;
}

export async function selectTrackByIndex(trackIdx) {
  const pl = getActivePlaylist();
  if (!pl || !pl.tracks[trackIdx]) return;
  activeTrackIndex = trackIdx;
  progressMs = 0;
  isPlaying = true;
  ensureBeatAudioContext();
  startLocalProgressAndSynth();
  notifyListeners();
}

export async function seekTrackProgress(percent0to100) {
  const track = getActiveTrack();
  const duration = track?.durationMs || 210000;
  const clamped = Math.max(0, Math.min(100, Number(percent0to100) || 0));
  progressMs = Math.round((clamped / 100) * duration);

  if (isSpotifyConnected()) {
    await spotifyApiFetch(`/me/player/seek?position_ms=${progressMs}`, { method: 'PUT' });
  }
  notifyListeners();
}

export async function setPlayerVolume(newVolumePercent) {
  volumePercent = Math.max(0, Math.min(100, Math.round(Number(newVolumePercent) || 0)));
  if (isSpotifyConnected() && !isDuckedForVoice) {
    await spotifyApiFetch(`/me/player/volume?volume_percent=${volumePercent}`, { method: 'PUT' });
  }
  notifyListeners();
}

export function setAutoDuckOnVoice(enabled) {
  autoDuckEnabled = Boolean(enabled);
  notifyListeners();
}

export function setSynthAudioEnabled(enabled) {
  synthAudioEnabled = Boolean(enabled);
  if (isPlaying && synthAudioEnabled) {
    scheduleSynthStep();
  } else if (!synthAudioEnabled) {
    clearTimeout(beatSchedulerTimer);
  }
  notifyListeners();
}

// ----------------------------------------------------
// Voice Navigation Audio Ducking Hook
// Automatically lowers music volume during spoken turn prompts
// ----------------------------------------------------
export async function setVoiceNavigationDucking(duckActive) {
  if (!autoDuckEnabled) return;
  if (isDuckedForVoice === Boolean(duckActive)) return;

  isDuckedForVoice = Boolean(duckActive);
  if (isSpotifyConnected() && isPlaying) {
    const targetVol = isDuckedForVoice ? Math.max(15, Math.round(volumePercent * 0.3)) : volumePercent;
    spotifyApiFetch(`/me/player/volume?volume_percent=${targetVol}`, { method: 'PUT' }).catch(() => {});
  }
  notifyListeners();
}

// ----------------------------------------------------
// Sync Running Playlist to Runner Target Pace (Cadence Match)
// ----------------------------------------------------
export function syncPlaylistToPaceSeconds(paceSeconds) {
  if (!cadenceSyncEnabled) return null;
  const offset = userSpotifyPlaylists.length;
  let targetLocalIdx = 0; // default 170 BPM Base
  if (paceSeconds <= 465) {
    targetLocalIdx = 1; // Tempo 178 BPM
  } else if (paceSeconds >= 560) {
    targetLocalIdx = 3; // Easy Recovery 156 BPM
  } else {
    targetLocalIdx = 0; // 170 BPM Cadence Crusher
  }

  activePlaylistIndex = offset + targetLocalIdx;
  activeTrackIndex = 0;
  progressMs = 0;
  notifyListeners();
  return getActivePlaylist();
}

// Initialize OAuth postMessage listener & restore session if token exists
export function initSpotifyController(onConnectedCallback = null) {
  window.addEventListener('message', async (event) => {
    const origin = event.origin || '';
    if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
      return;
    }
    if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.provider === 'spotify') {
      const success = await handleSpotifyOAuthCallbackCode(event.data.code);
      if (success && typeof onConnectedCallback === 'function') {
        onConnectedCallback(getSpotifyPlayerState());
      }
    }
  });

  if (isSpotifyConnected()) {
    syncSpotifyAccountData();
  }
}
