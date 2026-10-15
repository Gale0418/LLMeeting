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

  dispatch(type, event) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
}

function fixture({ reduced = false, saved, noStorage = false, date = new Date(2026, 9, 12, 12) } = {}) {
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
  let nextTimerId = 0;
  const timers = new Map();
  const cancelledTimers = [];
  const fakeSetTimeout = (callback, delay) => {
    const id = ++nextTimerId;
    timers.set(id, { callback, delay });
    return id;
  };
  const fakeClearTimeout = (id) => {
    cancelledTimers.push(id);
    timers.delete(id);
  };
  let currentDate = date;
  return {
    shell, backgroundToggle, motionToggle, document,
    storage: noStorage ? null : storage, values, media,
    now: () => new Date(currentDate),
    setNow: (nextDate) => { currentDate = nextDate; },
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    timers,
    cancelledTimers,
    fireTimer: (id = timers.keys().next().value) => {
      const timer = timers.get(id);
      if (!timer) throw new Error(`No timer ${id} is scheduled`);
      timers.delete(id);
      timer.callback();
    }
  };
}

test('persists the background and motion choices and pauses while the document is hidden', () => {
  const f = fixture();
  const destroy = initBackgroundControls({ ...f, matchMedia: () => f.media });

  assert.deepEqual(f.shell.dataset, { circuitBackground: 'on', circuitMotion: 'on', weekdayTheme: 'red', pageHidden: 'false' });
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
  assert.equal(f.timers.size, 0);
  destroy();
  f.document.hidden = false;
  f.document.dispatch('visibilitychange');
  assert.equal(f.shell.dataset.pageHidden, 'true');
});

test('maps each local weekday to its theme', () => {
  const themes = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'white'];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const date = new Date(2026, 9, 12 + weekday, 12);
    const f = fixture({ date });
    const destroy = initBackgroundControls({ ...f, matchMedia: () => f.media });
    assert.equal(f.shell.dataset.weekdayTheme, themes[weekday]);
    destroy();
  }
});

test('each completed packet wave gets a fresh wait and speed, with no extra timers or hidden work', () => {
  const f = fixture();
  const properties = new Map();
  const route = Object.assign(new Target(), { style: { setProperty: (key, value) => properties.set(key, value) } });
  f.document.querySelectorAll = () => [route];
  const samples = [.1, .2, .3, .4, .5, .6, .7, .8];
  let calls = 0;
  const destroy = initBackgroundControls({ ...f, matchMedia: () => f.media, random: () => samples[calls++] });
  const initial = new Map(properties);
  route.dispatch('animationend', { animationName: 'circuitGlow' });
  assert.equal(calls, 2, 'only the head schedules the next batch');
  route.dispatch('animationend', { animationName: 'circuitHead' });
  assert.equal(calls, 4);
  assert.notEqual(properties.get('--travel'), initial.get('--travel'));
  assert.ok(parseFloat(properties.get('--phase')) > 0, 'the next wave waits before appearing');
  for (const layer of ['glow', 'current', 'head']) assert.match(properties.get(`--${layer}-animation`), /Next$/);
  const next = new Map(properties);
  route.dispatch('animationend', { animationName: 'circuitHeadNext' });
  assert.equal(calls, 6, 'the following wave also resamples');
  assert.notEqual(properties.get('--phase'), next.get('--phase'));
  assert.notEqual(properties.get('--travel'), next.get('--travel'));
  assert.equal(f.timers.size, 1, 'only the existing midnight timer is scheduled');
  f.document.hidden = true;
  f.document.dispatch('visibilitychange');
  route.dispatch('animationend', { animationName: 'circuitHead' });
  assert.equal(calls, 6);
  assert.equal(f.timers.size, 0);
  f.document.hidden = false;
  f.document.dispatch('visibilitychange');
  assert.equal(calls, 8, 'a boundary event queued while hidden resumes when visible');
  f.media.change(true);
  route.dispatch('animationend', { animationName: 'circuitHead' });
  assert.equal(calls, 8, 'reduced motion does not start more waves');
  destroy();
  assert.equal(route.listeners.get('animationend').size, 0);
  assert.equal(f.timers.size, 0);
});

test('updates at local midnight and schedules only one next refresh', () => {
  const f = fixture({ date: new Date(2026, 9, 12, 23, 59, 30) });
  const destroy = initBackgroundControls({ ...f, matchMedia: () => f.media });

  assert.equal(f.shell.dataset.weekdayTheme, 'red');
  assert.equal(f.timers.size, 1);
  const [timerId, timer] = f.timers.entries().next().value;
  assert.equal(timer.delay, 30_000);
  f.setNow(new Date(2026, 9, 13, 0, 0, 0));
  f.fireTimer(timerId);
  assert.equal(f.shell.dataset.weekdayTheme, 'orange');
  assert.equal(f.timers.size, 1);
  destroy();
  assert.equal(f.timers.size, 0);
});

test('clears the midnight timer while hidden and refreshes immediately when visible', () => {
  const f = fixture({ date: new Date(2026, 9, 12, 23, 59, 30) });
  const destroy = initBackgroundControls({ ...f, matchMedia: () => f.media });
  const [timerId] = f.timers.keys();

  f.document.hidden = true;
  f.document.dispatch('visibilitychange');
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.cancelledTimers, [timerId]);
  f.setNow(new Date(2026, 9, 13, 0, 1, 0));
  f.document.hidden = false;
  f.document.dispatch('visibilitychange');
  assert.equal(f.shell.dataset.weekdayTheme, 'orange');
  assert.equal(f.timers.size, 1);

  const [activeTimerId] = f.timers.keys();
  destroy();
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.cancelledTimers, [timerId, activeTimerId]);
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

test('a side panel without settings controls still follows external preferences and weekday colors', () => {
  const f = fixture({ saved: { background: false, motion: false } });
  const windowObject = new Target();
  f.document.getElementById = () => null;
  const destroy = initBackgroundControls({ ...f, windowObject, matchMedia: () => f.media });
  assert.equal(f.shell.dataset.circuitBackground, 'off');
  assert.equal(f.shell.dataset.circuitMotion, 'off');
  assert.equal(f.shell.dataset.weekdayTheme, 'red');

  const key = 'llmeeting.backgroundControls.v1';
  f.values.set(key, JSON.stringify({ background: true, motion: true }));
  windowObject.dispatch('storage', { key: 'unrelated', storageArea: f.storage });
  assert.equal(f.shell.dataset.circuitBackground, 'off');
  windowObject.dispatch('storage', { key, storageArea: {} });
  assert.equal(f.shell.dataset.circuitBackground, 'off');
  windowObject.dispatch('storage', { key, storageArea: f.storage });
  assert.equal(f.shell.dataset.circuitBackground, 'on');
  assert.equal(f.shell.dataset.circuitMotion, 'on');
  f.media.change(true);
  assert.equal(f.shell.dataset.circuitMotion, 'off');

  destroy();
  assert.equal(windowObject.listeners.get('storage').size, 0);
  assert.equal(f.timers.size, 0);
});

test('an open options page reflects other options windows and cleared storage without writing back', () => {
  const f = fixture();
  const windowObject = new Target();
  let writes = 0;
  const setItem = f.storage.setItem;
  f.storage.setItem = (...args) => { writes += 1; setItem(...args); };
  const destroy = initBackgroundControls({ ...f, windowObject, matchMedia: () => f.media });
  const key = 'llmeeting.backgroundControls.v1';
  f.values.set(key, JSON.stringify({ background: false, motion: true }));
  windowObject.dispatch('storage', { key, storageArea: f.storage });
  assert.equal(f.backgroundToggle.checked, false);
  assert.equal(f.motionToggle.disabled, true);
  f.values.clear();
  windowObject.dispatch('storage', { key: null, storageArea: f.storage });
  assert.equal(f.backgroundToggle.checked, true);
  assert.equal(f.motionToggle.disabled, false);
  assert.equal(writes, 0);
  destroy();
});
