import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionHealth, healthPhase } from '../src/sidepanel/sessionHealth.js';

test('health distinguishes active repair from historical fault and keeps departed providers', () => {
  const state = { status: 'running', busy: true, activeProviders: ['chatgpt'],
    debugEvents: [{ provider: 'meta', phase: 'critique-2', timestamp: 10 }],
    transcript: { manualRepairs: [{ provider: 'meta', phase: 'critique-2', repairedAt: 20 }] },
    departedProviders: ['claude'], departures: [{ provider: 'claude', departedAt: 30 }] };
  const before = JSON.stringify(state);
  const model = sessionHealth(state);
  assert.equal(model.headline, '討論進行中');
  assert.deepEqual(model.events.map(e => e.kind), ['departure', 'repair', 'fault']);
  assert.deepEqual(model.counts, { faults: 1, repairs: 1, departures: 1 });
  assert.ok(model.providers.includes('claude'));
  assert.equal(JSON.stringify(state), before);
  assert.equal(sessionHealth({ ...state, repairPause: {} }).headline, '已暫停，請先處理故障');
});
test('empty, done, stopped, and ordinary user waiting are distinct', () => {
  assert.equal(sessionHealth().headline, '等待開始');
  assert.equal(sessionHealth({ status: 'done' }).headline, '本場已完成');
  assert.equal(sessionHealth({ status: 'waiting_for_user' }).headline, '等待你的補充');
  assert.equal(sessionHealth({ status: 'idle', message: '本次會議已停止，紀錄仍保留；可重新開始。' }).headline, '本場已停止');
});
test('timeline is bounded, handles missing dates, and hides unknown provider ids', () => {
  const events = Array.from({ length: 200 }, (_, timestamp) => ({ provider: 'chatgpt', timestamp }));
  const model = sessionHealth({ debugEvents: events, transcript: { manualRepairs: [{ provider: 'meta', repairedAt: Infinity }] } });
  assert.equal(model.events.length, 100);
  assert.equal(model.events[0].at, 199);
  assert.equal(sessionHealth({ debugEvents: [{ provider: 'meta', timestamp: Infinity }] }).events[0].at, null);
  assert.equal(sessionHealth({ debugEvents: [{ provider: '<script>' }] }).events.length, 0);
});
test('phase labels translate known UI fragments, without leaking technical phases', () => {
  assert.equal(healthPhase('critique-3', s => `translated:${s}`), 'translated:交叉評析 3');
  assert.equal(healthPhase('critique', s => s), '交叉評析 1');
  assert.equal(healthPhase('summary', s => s), '最終裁決');
  assert.equal(healthPhase('unknown raw stage', s => s), '');
});
