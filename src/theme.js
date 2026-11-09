// ----------------------------------------------------
// Pace Plot - Persistent Theme Controller (Dark / Light)
// Stores user preference in LocalStorage ('paceplot_theme')
// and synchronizes across the entire application UI & Map
// ----------------------------------------------------

export const THEME_STORAGE_KEY = 'paceplot_theme';
export const THEME_MODES = {
  DARK: 'dark',
  LIGHT: 'light'
};

const themeListeners = new Set();

function getStorage(customStorage) {
  if (customStorage) return customStorage;
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

export function normalizeTheme(value) {
  return value === THEME_MODES.LIGHT ? THEME_MODES.LIGHT : THEME_MODES.DARK;
}

export function getStoredTheme(customStorage = null) {
  const store = getStorage(customStorage);
  try {
    const saved = store ? store.getItem(THEME_STORAGE_KEY) : null;
    if (saved === THEME_MODES.LIGHT || saved === THEME_MODES.DARK) {
      return saved;
    }
  } catch (_) {}
  return THEME_MODES.DARK;
}

export function setStoredTheme(theme, customStorage = null) {
  const normalized = normalizeTheme(theme);
  const store = getStorage(customStorage);
  try {
    if (store) {
      store.setItem(THEME_STORAGE_KEY, normalized);
    }
  } catch (_) {}

  if (typeof document !== 'undefined') {
    applyThemeToDOM(normalized);
  }

  themeListeners.forEach((fn) => {
    try {
      fn(normalized);
    } catch (_) {}
  });

  return normalized;
}

export function toggleStoredTheme(customStorage = null) {
  const current = getStoredTheme(customStorage);
  const next = current === THEME_MODES.DARK ? THEME_MODES.LIGHT : THEME_MODES.DARK;
  return setStoredTheme(next, customStorage);
}

export function subscribeThemeChange(listener) {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

export function applyThemeToDOM(theme) {
  if (typeof document === 'undefined') return;
  const normalized = normalizeTheme(theme);
  const isDark = normalized === THEME_MODES.DARK;

  const root = document.documentElement;
  root.classList.toggle('dark', isDark);
  root.classList.toggle('light', !isDark);
  root.setAttribute('data-theme', normalized);
  root.style.colorScheme = normalized;

  // Update all theme icons & labels across Desktop Top Bar and In-App Navigation Bar
  const iconClass = isDark ? 'fa-solid fa-moon' : 'fa-solid fa-sun text-amber-500';
  const nextLabel = isDark ? 'Dark' : 'Light';
  const buttonTitle = isDark
    ? 'Dark Mode Active — Click to switch to Light Mode'
    : 'Light Mode Active — Click to switch to Dark Mode';

  ['themeIcon', 'appThemeIcon'].forEach((id) => {
    const iconEl = document.getElementById(id);
    if (iconEl) iconEl.className = iconClass;
  });

  const labelEl = document.getElementById('themeModeLabel');
  if (labelEl) {
    labelEl.textContent = nextLabel;
  }

  ['toggleTheme', 'btnAppThemeToggle'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.title = buttonTitle;
      btn.setAttribute('aria-label', buttonTitle);
      btn.setAttribute('aria-pressed', String(isDark));
    }
  });
}

export function initThemeController(onThemeChange = null) {
  if (typeof onThemeChange === 'function') {
    subscribeThemeChange(onThemeChange);
  }

  const initialTheme = getStoredTheme();
  // Persist default if not yet written so LocalStorage always has an explicit value
  setStoredTheme(initialTheme);

  if (typeof document !== 'undefined') {
    ['toggleTheme', 'btnAppThemeToggle'].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          toggleStoredTheme();
        });
      }
    });
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === THEME_STORAGE_KEY && e.newValue) {
        const synced = normalizeTheme(e.newValue);
        applyThemeToDOM(synced);
        themeListeners.forEach((fn) => {
          try {
            fn(synced);
          } catch (_) {}
        });
      }
    });
  }

  return initialTheme;
}
