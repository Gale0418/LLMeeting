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
  matchMedia = globalThis.matchMedia?.bind(globalThis)
} = {}) {
  const shell = document?.querySelector('.shell');
  const backgroundToggle = document?.getElementById('circuitBackgroundToggle');
  const motionToggle = document?.getElementById('circuitMotionToggle');
  if (!shell || !backgroundToggle || !motionToggle) return () => {};

  if (storage === undefined) {
    try {
      storage = globalThis.localStorage;
    } catch {
      storage = null;
    }
  }

  const preferences = readPreferences(storage);
  const reducedMotion = matchMedia?.('(prefers-reduced-motion: reduce)') || { matches: false };

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
    backgroundToggle.checked = preferences.background;
    motionToggle.checked = preferences.motion && !reducedMotion.matches;
    motionToggle.disabled = !preferences.background || reducedMotion.matches;
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
  };

  backgroundToggle.addEventListener('change', onBackgroundChange);
  motionToggle.addEventListener('change', onMotionChange);
  document.addEventListener('visibilitychange', onVisibilityChange);
  reducedMotion.addEventListener?.('change', render);
  render();
  onVisibilityChange();

  return () => {
    backgroundToggle.removeEventListener('change', onBackgroundChange);
    motionToggle.removeEventListener('change', onMotionChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    reducedMotion.removeEventListener?.('change', render);
  };
}

if (typeof document !== 'undefined') initBackgroundControls();
