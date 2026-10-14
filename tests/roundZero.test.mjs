import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoundZero, linkedContextProviders } from '../src/shared/roundZero.js';
import { DebateEngine } from '../src/background/debateEngine.js';

test('round zero quotes loaded conversations once per provider and preserves the new user note', () => {
  const content = 'User:\n原問題\n\nAI:\n  code  with spaces\n第二行';
  const result = buildRoundZero([
    { ok: true, provider: 'chatgpt', content, messageCount: 2 },
    { ok: true, provider: 'chatgpt', content: 'duplicate' },
    { ok: true, provider: 'gemini', content: 'AI:\n另一份背景', messageCount: 1 },
  ], '我的補充');
  assert.equal(result.question.split(content).length - 1, 1);
  assert.ok(result.question.endsWith('我的補充'));
  assert.ok(!result.question.includes('duplicate'));
  assert.equal(result.roundZero.sources.length, 2);
  assert.equal(result.roundZero.sources[0].content, content);
  assert.equal(result.roundZero.userText, '我的補充');

  const engine = new DebateEngine(['chatgpt', 'gemini']);
  const jobs = engine.start(result.question, { roundZero: result.roundZero });
  for (const job of jobs) assert.equal(job.prompt.split(content).length - 1, 1);
  result.roundZero.sources[0].content = 'mutated';
  assert.equal(engine.snapshot().roundZero.sources[0].content, content);
  assert.equal(DebateEngine.restore(engine.snapshot()).snapshot().roundZero.sources[0].content, content);
});

test('only explicitly chosen participating tabs supply context', () => {
  assert.deepEqual(linkedContextProviders(['chatgpt', 'gemini', 'chatgpt'], { chatgpt: 7, grok: 9 }), ['chatgpt']);
  assert.deepEqual(linkedContextProviders(['chatgpt'], {}), []);
  assert.deepEqual(linkedContextProviders(['chatgpt'], { chatgpt: null }), ['chatgpt'], 'invalid explicit choices must be rejected by the reader, never silently dropped');
});

test('empty new tabs preserve ordinary questions, and a loaded conversation can start without a new note', () => {
  assert.deepEqual(buildRoundZero([{ ok: true, provider: 'chatgpt', content: '', empty: true }], '這次問題'),
    { question: '這次問題', roundZero: null });
  assert.throws(() => buildRoundZero([], ''), /請輸入本次問題/);
  assert.ok(buildRoundZero([{ ok: true, provider: 'chatgpt', content: '舊對話' }], '').question.includes('舊對話'));
  assert.throws(() => buildRoundZero([{ ok: true, provider: 'chatgpt', content: 'a'.repeat(60000) }], '補充'), /60,000/);
});
