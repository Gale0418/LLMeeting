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
  random = Math.random,
  now = () => new Date(),
  setTimeout = globalThis.setTimeout?.bind(globalThis),
  clearTimeout = globalThis.clearTimeout?.bind(globalThis)
} = {}) {
  const shell = document?.querySelector('.shell');
  const backgroundToggle = document?.getElementById('circuitBackgroundToggle');
  const motionToggle = document?.getElementById('circuitMotionToggle');
  if (!shell) return () => {};

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
  const routeListeners = [];
  const resumeWaves = [];
  for (const route of document.querySelectorAll?.('.circuit-route') || []) {
    let alternate = false;
    let wavePending = false;
    const sampleWave = (initial = false) => {
      const travel = 7 + random() * 7;
      route.style.setProperty('--travel', `${travel.toFixed(3)}s`);
      route.style.setProperty('--phase', `${(initial ? -random() * travel : .5 + random() * 4).toFixed(3)}s`);
      // Alternate equivalent keyframes to restart all layers together without
      // forcing layout or scheduling timers for individual packets.
      for (const layer of ['Glow', 'Current', 'Head']) {
        route.style.setProperty(`--${layer.toLowerCase()}-animation`, `circuit${layer}${alternate ? 'Next' : ''}`);
      }
    };
    const resumeWave = () => {
      if (!wavePending) return;
      if (document.hidden || !preferences.background || !preferences.motion || reducedMotion.matches) return;
      wavePending = false;
      alternate = !alternate;
      sampleWave();
    };
    const onWaveEnd = (event) => {
      if (!['circuitHead', 'circuitHeadNext'].includes(event.animationName)) return;
      wavePending = true;
      resumeWave();
    };
    sampleWave(true);
    route.addEventListener('animationend', onWaveEnd);
    routeListeners.push([route, onWaveEnd]);
    resumeWaves.push(resumeWave);
  }

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
    for (const resumeWave of resumeWaves) resumeWave();
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
    for (const resumeWave of resumeWaves) resumeWave();
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
    for (const [route, listener] of routeListeners) route.removeEventListener('animationend', listener);
  };
}

if (typeof document !== 'undefined') initBackgroundControls();
