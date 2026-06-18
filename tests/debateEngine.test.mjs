import test from "node:test";
import assert from "node:assert/strict";

import { DebateEngine, normalizeDebateRounds } from "../src/background/debateEngine.js";

test("engine starts a fixed first-round debate for all providers", () => {
  const engine = new DebateEngine();
  const jobs = engine.start("天為什麼是藍的？");

  assert.equal(engine.snapshot().phase, "first-round");
  assert.deepEqual(
    jobs.map((job) => [job.provider, job.phase, job.prompt]),
    [
      ["chatgpt", "first-round", "天為什麼是藍的？"],
      ["gemini", "first-round", "天為什麼是藍的？"],
      ["grok", "first-round", "天為什麼是藍的？"],
      ["claude", "first-round", "天為什麼是藍的？"],
    ],
  );
});

test("engine builds critique jobs after all first answers are recorded", () => {
  const engine = new DebateEngine();
  engine.start("天為什麼是藍的？");
  engine.recordAnswer("chatgpt", "是散射。");
  engine.recordAnswer("gemini", "就是藍的呀~");
  engine.recordAnswer("grok", "我不知道。");
  engine.recordAnswer("claude", "需要看光的波長。");

  const jobs = engine.buildCritiqueJobs();

  assert.equal(engine.snapshot().phase, "critique");
  assert.equal(jobs.length, 4);
  assert.match(jobs.find((job) => job.provider === "chatgpt").prompt, /Gemini:\n就是藍的呀~/);
  assert.match(jobs.find((job) => job.provider === "chatgpt").prompt, /Claude:\n需要看光的波長。/);
  assert.doesNotMatch(jobs.find((job) => job.provider === "chatgpt").prompt, /ChatGPT:\n是散射。/);
});

test("engine builds final ChatGPT summary job after all critiques are recorded", () => {
  const engine = new DebateEngine();
  engine.start("天為什麼是藍的？");
  engine.recordAnswer("chatgpt", "是散射。");
  engine.recordAnswer("gemini", "就是藍的呀~");
  engine.recordAnswer("grok", "我不知道。");
  engine.recordAnswer("claude", "需要看光的波長。");
  engine.buildCritiqueJobs();
  engine.recordCritique("chatgpt", "Gemini 太草率。");
  engine.recordCritique("gemini", "GPT 比較完整。");
  engine.recordCritique("grok", "我同意散射。");
  engine.recordCritique("claude", "需要補充大氣散射。");

  const job = engine.buildFinalJob();

  assert.equal(engine.snapshot().phase, "summary");
  assert.equal(job.provider, "chatgpt");
  assert.equal(job.phase, "summary");
  assert.match(job.prompt, /第一輪回答:/);
  assert.match(job.prompt, /第二輪互評:/);
  assert.match(job.prompt, /Gemini 太草率。/);
});

test("engine can run multiple critique rounds before the final summary", () => {
  const engine = new DebateEngine(["chatgpt", "gemini", "grok"], "chatgpt", 2);
  engine.start("天為什麼是藍的？");
  engine.recordAnswer("chatgpt", "是散射。");
  engine.recordAnswer("gemini", "大氣讓它看起來藍。");
  engine.recordAnswer("grok", "短波長散射比較強。");

  const firstCritiqueJobs = engine.buildCritiqueJobs(1);
  engine.recordCritique("chatgpt", "Gemini 少了瑞利散射。", 1);
  engine.recordCritique("gemini", "GPT 說法正確但可以更白話。", 1);
  engine.recordCritique("grok", "兩者都該提到短波長。", 1);

  const secondCritiqueJobs = engine.buildCritiqueJobs(2);
  engine.recordCritique("chatgpt", "我接受 Gemini 的白話補充。", 2);
  engine.recordCritique("gemini", "我補上瑞利散射。", 2);
  engine.recordCritique("grok", "共識是短波長散射。", 2);

  const job = engine.buildFinalJob();
  const snapshot = engine.snapshot();

  assert.equal(snapshot.debateRounds, 2);
  assert.equal(snapshot.critiqueRounds.length, 2);
  assert.equal(firstCritiqueJobs[0].round, 1);
  assert.equal(secondCritiqueJobs[0].phase, "critique-2");
  assert.match(secondCritiqueJobs.find((item) => item.provider === "chatgpt").prompt, /上一輪對話/);
  assert.match(job.prompt, /第二輪互評:/);
  assert.match(job.prompt, /第三輪互評:/);
  assert.match(job.prompt, /我補上瑞利散射。/);
});

test("debate round count is clamped to the supported one through five range", () => {
  assert.equal(normalizeDebateRounds(-1), 1);
  assert.equal(normalizeDebateRounds(0), 1);
  assert.equal(normalizeDebateRounds(3), 3);
  assert.equal(normalizeDebateRounds(99), 5);
});

test("engine restores an interactive session and builds the next round", () => {
  const original = new DebateEngine(
    ["chatgpt", "gemini"],
    "gemini",
    1,
    { interactionStyle: "casual" },
  );
  original.start("恢復測試");
  original.recordAnswer("chatgpt", "GPT 答案");
  original.recordAnswer("gemini", "Gemini 答案");
  original.buildCritiqueJobs(1);
  original.recordCritique("chatgpt", "GPT 互動", 1);
  original.recordCritique("gemini", "Gemini 互動", 1);

  const restored = DebateEngine.restore(original.snapshot());
  const round = restored.addChatRound("主人補充");
  const jobs = restored.buildUserMessageJobs("主人補充", round);

  assert.equal(restored.summaryProvider, "gemini");
  assert.equal(jobs[0].round, 2);
  assert.match(jobs[0].prompt, /主人補充/);
  assert.equal(restored.snapshot().critiqueRounds[1].USER, "主人補充");
});

test("interactive rounds can continue beyond the configured five-round limit", () => {
  const providers = ["chatgpt", "gemini"];
  const engine = new DebateEngine(providers, "chatgpt", 5);
  engine.start("第六輪測試");
  providers.forEach((id) => engine.recordAnswer(id, `${id} answer`));
  for (let round = 1; round <= 5; round += 1) {
    engine.buildCritiqueJobs(round);
    providers.forEach((id) => engine.recordCritique(id, `${id} round ${round}`, round));
  }

  const sixthRound = engine.addChatRound("第六輪插話");
  const jobs = engine.buildUserMessageJobs("第六輪插話", sixthRound);
  jobs.forEach((job) => engine.recordCritique(job.provider, "sixth", job.round));

  assert.equal(sixthRound, 6);
  assert.deepEqual([...new Set(jobs.map((job) => job.round))], [6]);
  assert.doesNotThrow(() => engine.buildFinalJob());
});

test("engine rejects a critique write outside the existing round range", () => {
  const engine = new DebateEngine(["chatgpt", "gemini"]);
  engine.start("跳輪測試");

  assert.throws(
    () => engine.recordCritique("chatgpt", "bad", 2),
    /Unknown critique round: 2/,
  );
});

test("engine records provider errors without blocking the next phase", () => {
  const engine = new DebateEngine();
  engine.start("天為什麼是藍的？");
  engine.recordAnswer("chatgpt", "是散射。");
  engine.markProviderError("gemini", "first-round", "timeout");
  engine.recordAnswer("grok", "我不知道。");
  engine.recordAnswer("claude", "需要看光的波長。");

  const jobs = engine.buildCritiqueJobs();

  assert.equal(jobs.length, 4);
  assert.match(jobs.find((job) => job.provider === "chatgpt").prompt, /Gemini:\n\[錯誤：timeout\]/);
});

test("engine supports optional Claude as a participant", () => {
  const engine = new DebateEngine(["chatgpt", "gemini", "grok", "claude"]);
  const jobs = engine.start("比較四個 AI 的觀點");

  assert.deepEqual(jobs.map((job) => job.provider), ["chatgpt", "gemini", "grok", "claude"]);

  engine.recordAnswer("chatgpt", "GPT 回答");
  engine.recordAnswer("gemini", "Gemini 回答");
  engine.recordAnswer("grok", "Grok 回答");
  engine.recordAnswer("claude", "Claude 回答");

  const critiqueJobs = engine.buildCritiqueJobs();
  const chatgptPrompt = critiqueJobs.find((job) => job.provider === "chatgpt").prompt;

  assert.match(chatgptPrompt, /Claude:\nClaude 回答/);
});

test("engine rejects debates with fewer than two active providers", () => {
  assert.throws(
    () => new DebateEngine(["chatgpt"]),
    /至少需要 2 家 AI/,
  );
});

test("engine rejects unknown active or summary providers", () => {
  assert.throws(
    () => new DebateEngine(["chatgpt", "unknown"]),
    /Unknown provider: unknown/,
  );

  assert.throws(
    () => new DebateEngine(["chatgpt", "gemini"], "unknown"),
    /Unknown provider: unknown/,
  );
});
