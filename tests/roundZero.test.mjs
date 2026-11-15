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
});

test('long raw source remains lossless while the prompt quote is bounded and the full new question survives', () => {
  const content = `AI:\n${'舊內容'.repeat(20000)}`;
  const userText = `這是完整的新問題 ${'問題'.repeat(40000)}`;
  const result = buildRoundZero([{ ok: true, provider: 'chatgpt', content, messageCount: 1 }], userText);

  assert.equal(result.roundZero.sources[0].content, content);
  assert.equal(result.roundZero.userText, userText);
  assert.ok(result.question.endsWith(userText));
  assert.ok(result.roundZero.sources[0].quote.length < content.length);
  assert.match(result.roundZero.sources[0].quote, /省略/);
});

test('round zero fairly budgets sources and keeps the latest complete messages with an omission marker', () => {
  const old = 'o'.repeat(13000);
  const recent = 'n'.repeat(13000);
  const result = buildRoundZero([
    { ok: true, provider: 'chatgpt', content: `User:\n${old}\n\nAI:\n${recent}`, messageCount: 2,
      messages: [{ role: 'User', text: old }, { role: 'AI', text: recent }] },
    { ok: true, provider: 'gemini', content: `AI:\n${recent}`, messageCount: 1,
      messages: [{ role: 'AI', text: recent }] },
  ], '請接續');

  const [first, second] = result.roundZero.sources;
  assert.equal(first.content, `User:\n${old}\n\nAI:\n${recent}`);
  assert.ok(first.quote.includes('AI:\n' + recent));
  assert.ok(!first.quote.includes('User:\n' + old));
  assert.match(first.quote, /較舊或超限內容已省略/);
  assert.ok(first.quote.length <= 24000);
  assert.ok(second.quote.length <= 24000);
  assert.equal(first.omission.omittedMessages, 1);
  assert.equal(first.omission.omittedChars, old.length);
});
