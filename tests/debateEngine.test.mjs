import test from "node:test";
import assert from "node:assert/strict";

import { DebateEngine } from "../src/background/debateEngine.js";

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
