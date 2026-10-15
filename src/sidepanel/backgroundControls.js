const PREFERENCE_KEY = 'llmeeting.backgroundControls.v1';

function readPreferences(storage) {
  try {
    const raw = storage?.getItem?.(PREFERENCE_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
      return { background: true, motion: true };
    }
    return {
      background: typeof saved.background === 'boolean' ? saved.background : true,
      motion: typeof saved.motion === 'boolean' ? saved.motion : true
    };
  } catch {
    return { background: true, motion: true };
  }
}

export function initBackgroundControls({
  document = globalThis.document,
  storage,
  windowObject = globalThis.window,
  matchMedia = globalThis.matchMedia?.bind(globalThis),
  now = () => new Date(),
  setTimeout = globalThis.setTimeout?.bind(globalThis),
  clearTimeout = globalThis.clearTimeout?.bind(globalThis)
} = {}) {
  const shell = document?.querySelector('.shell');
  const backgroundToggle = document?.getElementById('circuitBackgroundToggle');
  const motionToggle = document?.getElementById('circuitMotionToggle');
  if (!shell) return () => {};

  // Sample once per panel: independent speeds keep the lanes from marching
  // together, without animation timers or work on every frame.
  for (const route of document.querySelectorAll?.('.circuit-route') || []) {
    const travel = 7 + Math.random() * 7;
    route.style.setProperty('--travel', `${travel.toFixed(3)}s`);
    route.style.setProperty('--phase', `${(-Math.random() * travel).toFixed(3)}s`);
  }

  if (storage === undefined) {
    try {
      storage = globalThis.localStorage;
    } catch {
      storage = null;
    }
  }

  let preferences = readPreferences(storage);
  const reducedMotion = matchMedia?.('(prefers-reduced-motion: reduce)') || { matches: false };
  const weekdayThemes = ['white', 'red', 'orange', 'yellow', 'green', 'blue', 'purple'];
  let midnightTimer = null;

  const persist = () => {
    try {
      storage?.setItem?.(PREFERENCE_KEY, JSON.stringify(preferences));
    } catch {
      // Keep the controls usable when storage is unavailable or full.
    }
  };

  const render = () => {
    shell.dataset.circuitBackground = preferences.background ? 'on' : 'off';
    shell.dataset.circuitMotion = preferences.motion && !reducedMotion.matches ? 'on' : 'off';
    if (backgroundToggle) backgroundToggle.checked = preferences.background;
    if (motionToggle) {
      motionToggle.checked = preferences.motion && !reducedMotion.matches;
      motionToggle.disabled = !preferences.background || reducedMotion.matches;
    }
  };
  const refreshWeekdayTheme = () => {
    shell.dataset.weekdayTheme = weekdayThemes[now().getDay()];
  };
  const clearMidnightTimer = () => {
    if (midnightTimer === null) return;
    clearTimeout?.(midnightTimer);
    midnightTimer = null;
  };
  const scheduleMidnightRefresh = () => {
    clearMidnightTimer();
    if (document.hidden || typeof setTimeout !== 'function') return;
    const current = now();
    const nextMidnight = new Date(current);
    nextMidnight.setHours(24, 0, 0, 0);
    midnightTimer = setTimeout(() => {
      midnightTimer = null;
      if (document.hidden) return;
      refreshWeekdayTheme();
      scheduleMidnightRefresh();
    }, Math.max(0, nextMidnight.getTime() - current.getTime()));
  };

  const onBackgroundChange = () => {
    preferences.background = backgroundToggle.checked;
    persist();
    render();
  };
  const onMotionChange = () => {
    preferences.motion = motionToggle.checked;
    persist();
    render();
  };
  const onVisibilityChange = () => {
    shell.dataset.pageHidden = document.hidden ? 'true' : 'false';
    if (document.hidden) {
      clearMidnightTimer();
      return;
    }
    refreshWeekdayTheme();
    scheduleMidnightRefresh();
  };
  // Extension options and side panels share this origin's local preferences.
  const onStorageChange = (event) => {
    if (event.key !== PREFERENCE_KEY && event.key !== null) return;
    if (event.storageArea && event.storageArea !== storage) return;
    preferences = readPreferences(storage);
    render();
  };

  backgroundToggle?.addEventListener('change', onBackgroundChange);
  motionToggle?.addEventListener('change', onMotionChange);
  windowObject?.addEventListener('storage', onStorageChange);
  document.addEventListener('visibilitychange', onVisibilityChange);
  reducedMotion.addEventListener?.('change', render);
  render();
  onVisibilityChange();

  return () => {
    backgroundToggle?.removeEventListener('change', onBackgroundChange);
    motionToggle?.removeEventListener('change', onMotionChange);
    windowObject?.removeEventListener('storage', onStorageChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    reducedMotion.removeEventListener?.('change', render);
    clearMidnightTimer();
  };
}

if (typeof document !== 'undefined') initBackgroundControls();
