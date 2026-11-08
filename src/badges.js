// ----------------------------------------------------
// Pace Plot Runner Badges & Achievements System
// ----------------------------------------------------

export const BADGES_CONFIG = [
  {
    id: 'early_bird',
    title: 'Early Bird',
    subtitle: 'Run before 7:00 AM',
    icon: 'fa-sun',
    color: '#f59e0b',
    borderClass: 'border-amber-500/40 bg-amber-500/10 text-amber-500 dark:text-amber-400',
    category: 'Habit',
    requirement: 'Complete and log any verified run before 7:00 AM local time.',
    unlockedByDefault: true
  },
  {
    id: 'night_owl',
    title: 'Night Owl',
    subtitle: 'Safe run after 8:00 PM',
    icon: 'fa-moon',
    color: '#6366f1',
    borderClass: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-500 dark:text-indigo-400',
    category: 'Safety',
    requirement: 'Complete a well-lit street route after 8:00 PM.',
    unlockedByDefault: false
  },
  {
    id: 'pace_5k',
    title: '5K Finisher',
    subtitle: '3.1+ mile safe loop',
    icon: 'fa-medal',
    color: '#10b981',
    borderClass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400',
    category: 'Distance',
    requirement: 'Finish a verified 5K safe loop distance (3.10+ miles).',
    unlockedByDefault: true
  },
  {
    id: 'pace_10k',
    title: '10K Crusher',
    subtitle: '6.2+ mile distance',
    icon: 'fa-trophy',
    color: '#C84B1A',
    borderClass: 'border-terracotta/40 bg-terracotta/10 text-terracotta',
    category: 'Distance',
    requirement: 'Complete a 10K continuous distance (6.20+ miles).',
    unlockedByDefault: false
  },
  {
    id: 'half_marathon',
    title: 'Half Marathon',
    subtitle: '13.1+ miles volume',
    icon: 'fa-award',
    color: '#a855f7',
    borderClass: 'border-purple-500/40 bg-purple-500/10 text-purple-500 dark:text-purple-400',
    category: 'Endurance',
    requirement: 'Accumulate 13.1+ total miles of training volume.',
    unlockedByDefault: false
  },
  {
    id: 'marathon_milestone',
    title: 'Marathon Milestone',
    subtitle: '26.2+ lifetime miles',
    icon: 'fa-crown',
    color: '#eab308',
    borderClass: 'border-amber-400/50 bg-amber-400/15 text-amber-500 dark:text-amber-400',
    category: 'Legend',
    requirement: 'Surpass 26.2+ lifetime miles in Pace Plot run history.',
    unlockedByDefault: false
  },
  {
    id: 'safeguard_guardian',
    title: 'SafeGuard Guardian',
    subtitle: 'Emergency contact linked',
    icon: 'fa-shield-halved',
    color: '#0284c7',
    borderClass: 'border-sky-500/40 bg-sky-500/10 text-sky-500 dark:text-sky-400',
    category: 'Safety',
    requirement: 'Run with linked emergency safety contacts active.',
    unlockedByDefault: true
  },
  {
    id: 'weather_warrior',
    title: 'Weather Warrior',
    subtitle: 'Trained through rain',
    icon: 'fa-cloud-rain',
    color: '#3b82f6',
    borderClass: 'border-blue-500/40 bg-blue-500/10 text-blue-500 dark:text-blue-400',
    category: 'Resilience',
    requirement: 'Trained in rainy, wet, or adverse weather conditions.',
    unlockedByDefault: false
  },
  {
    id: 'elevation_master',
    title: 'Elevation Master',
    subtitle: '+100 ft total climb',
    icon: 'fa-mountain',
    color: '#f97316',
    borderClass: 'border-orange-500/40 bg-orange-500/10 text-orange-500 dark:text-orange-400',
    category: 'Cardio',
    requirement: 'Conquer over +100 ft cumulative elevation gain.',
    unlockedByDefault: true
  },
  {
    id: 'streak_fire',
    title: 'Consistent Stride',
    subtitle: '3+ workouts logged',
    icon: 'fa-fire',
    color: '#f43f5e',
    borderClass: 'border-rose-500/40 bg-rose-500/10 text-rose-500 dark:text-rose-400',
    category: 'Habit',
    requirement: 'Complete and record 3 or more total workouts in history.',
    unlockedByDefault: false
  }
];

const LOCAL_STORAGE_KEY = 'paceplot_unlocked_badges';

export function getUnlockedBadges() {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (_) {}
  // Default unlocked achievements for delightful out-of-box experience
  return ['early_bird', 'pace_5k', 'safeguard_guardian', 'elevation_master'];
}

export function saveUnlockedBadges(badgeIds) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(badgeIds));
  } catch (_) {}
}

export function unlockBadge(badgeId, onUnlockCallback = null) {
  const current = getUnlockedBadges();
  if (current.includes(badgeId)) return false;

  const badge = BADGES_CONFIG.find(b => b.id === badgeId);
  if (!badge) return false;

  current.push(badgeId);
  saveUnlockedBadges(current);

  renderBadgesGrid();
  showBadgeToast(badge);

  if (typeof onUnlockCallback === 'function') {
    onUnlockCallback(badge);
  }

  return true;
}

export function showBadgeToast(badge) {
  const toast = document.getElementById('badgeUnlockToast');
  const icon = document.getElementById('toastBadgeIcon');
  const title = document.getElementById('toastBadgeTitle');
  const desc = document.getElementById('toastBadgeDesc');

  if (!toast) return;

  if (icon) icon.className = `fa-solid ${badge.icon}`;
  if (title) title.textContent = badge.title;
  if (desc) desc.textContent = badge.subtitle || badge.requirement;

  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4500);
}

export function evaluateBadgesFromWorkouts(workouts = [], context = {}, onUnlockCallback = null) {
  const currentUnlocked = getUnlockedBadges();
  const newlyUnlocked = [];

  // Calculate totals
  let totalMiles = 0;
  let totalGain = 0;
  const currentHour = new Date().getHours();

  workouts.forEach(w => {
    totalMiles += Number(w.distance || 0);
    totalGain += Number(w.elevationGain || 35);
  });

  // 1. Early bird (before 7 AM)
  if (currentHour < 7 && !currentUnlocked.includes('early_bird')) {
    newlyUnlocked.push('early_bird');
  }

  // 2. Night owl (after 8 PM = 20:00)
  if (currentHour >= 20 && !currentUnlocked.includes('night_owl')) {
    newlyUnlocked.push('night_owl');
  }

  // 3. 5K Finisher
  if (workouts.some(w => Number(w.distance) >= 3.0) && !currentUnlocked.includes('pace_5k')) {
    newlyUnlocked.push('pace_5k');
  }

  // 4. 10K Crusher
  if (workouts.some(w => Number(w.distance) >= 6.0) && !currentUnlocked.includes('pace_10k')) {
    newlyUnlocked.push('pace_10k');
  }

  // 5. Half marathon volume (13.1 mi)
  if (totalMiles >= 13.1 && !currentUnlocked.includes('half_marathon')) {
    newlyUnlocked.push('half_marathon');
  }

  // 6. Marathon milestone (26.2 mi)
  if (totalMiles >= 26.2 && !currentUnlocked.includes('marathon_milestone')) {
    newlyUnlocked.push('marathon_milestone');
  }

  // 7. Streak master (3+ runs)
  if (workouts.length >= 3 && !currentUnlocked.includes('streak_fire')) {
    newlyUnlocked.push('streak_fire');
  }

  // 8. Elevation master (+100 ft)
  if (totalGain >= 100 && !currentUnlocked.includes('elevation_master')) {
    newlyUnlocked.push('elevation_master');
  }

  // 9. Weather warrior
  if (context.weather && (context.weather.rainProb > 20 || context.weather.condition?.toLowerCase().includes('rain')) && !currentUnlocked.includes('weather_warrior')) {
    newlyUnlocked.push('weather_warrior');
  }

  // Unlock each newly qualified badge
  newlyUnlocked.forEach(badgeId => {
    unlockBadge(badgeId, onUnlockCallback);
  });

  renderBadgesGrid();
}

export function renderBadgesGrid(onBadgeClick = null) {
  const grid = document.getElementById('badgesGrid');
  const countBadge = document.getElementById('badgesUnlockedBadge');
  const progressPct = document.getElementById('badgesProgressPct');
  const progressBar = document.getElementById('badgesProgressBar');

  if (!grid) return;

  const unlockedIds = getUnlockedBadges();
  const unlockedCount = unlockedIds.length;
  const totalCount = BADGES_CONFIG.length;
  const pct = Math.round((unlockedCount / totalCount) * 100);

  if (countBadge) countBadge.textContent = `${unlockedCount} / ${totalCount} Unlocked`;
  if (progressPct) progressPct.textContent = `${pct}%`;
  if (progressBar) progressBar.style.width = `${pct}%`;

  grid.innerHTML = '';

  BADGES_CONFIG.forEach(b => {
    const isUnlocked = unlockedIds.includes(b.id);
    const card = document.createElement('div');
    card.className = `p-2.5 rounded-2xl border transition-all cursor-pointer flex items-center gap-2.5 ${
      isUnlocked
        ? 'bg-stone-50/80 dark:bg-stone-800/80 border-stone-200 dark:border-stone-700 shadow-sm hover:border-terracotta/40'
        : 'bg-stone-100/40 dark:bg-stone-800/30 border-dashed border-stone-200 dark:border-stone-700/60 opacity-60 hover:opacity-80'
    }`;
    card.setAttribute('data-badge-id', b.id);
    card.title = `${b.title} - ${b.requirement}`;

    card.innerHTML = `
      <div class="w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0 border ${
        isUnlocked
          ? b.borderClass
          : 'bg-stone-200/50 dark:bg-stone-700/50 border-stone-300 dark:border-stone-600 text-stone-400'
      }">
        <i class="fa-solid ${isUnlocked ? b.icon : 'fa-lock'}"></i>
      </div>
      <div class="truncate flex-1 min-w-0">
        <div class="flex items-center gap-1">
          <span class="text-xs font-bold text-stone-900 dark:text-white truncate ${isUnlocked ? '' : 'text-stone-400'}">${b.title}</span>
          ${isUnlocked ? '<i class="fa-solid fa-circle-check text-emerald-500 text-[10px]"></i>' : ''}
        </div>
        <p class="text-[10px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
          ${isUnlocked ? b.subtitle : b.requirement}
        </p>
      </div>
    `;

    card.addEventListener('click', () => {
      if (typeof onBadgeClick === 'function') {
        onBadgeClick(b, isUnlocked);
      }
    });

    grid.appendChild(card);
  });
}
