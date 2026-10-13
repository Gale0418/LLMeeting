import test from 'node:test';
import assert from 'node:assert/strict';
import { initBackgroundControls } from '../src/sidepanel/backgroundControls.js';

class Target {
  listeners = new Map();

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener();
  }
}

function fixture({ reduced = false, saved, noStorage = false } = {}) {
  const shell = { dataset: {} };
  const backgroundToggle = Object.assign(new Target(), { checked: false });
  const motionToggle = Object.assign(new Target(), { checked: false, disabled: false });
  const document = Object.assign(new Target(), {
    hidden: false,
    querySelector: () => shell,
    getElementById: (id) => ({
      circuitBackgroundToggle: backgroundToggle,
      circuitMotionToggle: motionToggle
    })[id] || null
  });
  const values = new Map(saved === undefined ? [] : [[
    'llmeeting.backgroundControls.v1',
    typeof saved === 'string' ? saved : JSON.stringify(saved)
  ]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  const mediaListeners = new Set();
  const media = {
    matches: reduced,
    addEventListener: (_type, listener) => mediaListeners.add(listener),
    removeEventListener: (_type, listener) => mediaListeners.delete(listener),
    change: (matches) => {
      media.matches = matches;
      for (const listener of mediaListeners) listener();
    }
  };
  return { shell, backgroundToggle, motionToggle, document, storage: noStorage ? null : storage, values, media };
}

test('persists the background and motion choices and pauses while the document is hidden', () => {
  const f = fixture();
  const destroy = initBackgroundControls({ ...f, matchMedia: () => f.media });

  assert.deepEqual(f.shell.dataset, { circuitBackground: 'on', circuitMotion: 'on', pageHidden: 'false' });
  f.backgroundToggle.checked = false;
  f.backgroundToggle.dispatch('change');
  assert.equal(f.shell.dataset.circuitBackground, 'off');
  assert.equal(f.motionToggle.disabled, true);
  f.motionToggle.checked = false;
  f.motionToggle.dispatch('change');
  assert.deepEqual(JSON.parse(f.values.get('llmeeting.backgroundControls.v1')), { background: false, motion: false });

  f.document.hidden = true;
  f.document.dispatch('visibilitychange');
  assert.equal(f.shell.dataset.pageHidden, 'true');
  destroy();
  f.document.hidden = false;
  f.document.dispatch('visibilitychange');
  assert.equal(f.shell.dataset.pageHidden, 'true');
});

test('reduced motion disables animation without overriding the saved preference', () => {
  const f = fixture({ reduced: true });
  initBackgroundControls({ ...f, matchMedia: () => f.media });

  assert.equal(f.motionToggle.checked, false);
  assert.equal(f.motionToggle.disabled, true);
  assert.equal(f.shell.dataset.circuitMotion, 'off');
  f.media.change(false);
  assert.equal(f.motionToggle.checked, true);
  assert.equal(f.shell.dataset.circuitMotion, 'on');
});

test('null, array, and unreadable preferences fall back to defaults', () => {
  for (const saved of [null, [], 'not-json']) {
    const f = fixture({ saved });
    initBackgroundControls({ ...f, matchMedia: () => f.media });
    assert.equal(f.backgroundToggle.checked, true);
    assert.equal(f.motionToggle.checked, true);
    assert.equal(f.shell.dataset.circuitMotion, 'on');
  }
});

test('controls remain interactive when local storage is unavailable', () => {
  const f = fixture({ noStorage: true });
  initBackgroundControls({ ...f, matchMedia: () => f.media });

  f.backgroundToggle.checked = false;
  f.backgroundToggle.dispatch('change');
  assert.equal(f.shell.dataset.circuitBackground, 'off');
  f.backgroundToggle.checked = true;
  f.backgroundToggle.dispatch('change');
  f.motionToggle.checked = false;
  f.motionToggle.dispatch('change');
  assert.equal(f.shell.dataset.circuitBackground, 'on');
  assert.equal(f.shell.dataset.circuitMotion, 'off');
});
