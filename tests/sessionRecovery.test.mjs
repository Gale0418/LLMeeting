import test from "node:test";
import assert from "node:assert/strict";
import { DebateEngine } from "../src/background/debateEngine.js";
import { pendingReplyRepairs } from "../src/shared/meetingRecovery.js";

import {
  isSessionExpired,
  normalizeSnapshot,
  recoverSession,
  SESSION_RETENTION_MS,
} from "../src/background/sessionRecovery.js";

const mockCreateIdleState = (providers = ["chatgpt", "gemini"]) => ({
  status: "idle",
  busy: false,
  phase: "done",
  message: "",
  activeProviders: providers,
  transcript: null,
  summary: "",
  sourceSummary: "",
  workflowCheckpoint: null,
  errors: [],
});

test("isSessionExpired detects sessions older than 24 hours", () => {
  const now = 1000000;
  const freshState = { savedAt: now - 1000 };
  const expiredState = { savedAt: now - SESSION_RETENTION_MS - 1 };

  assert.equal(isSessionExpired(freshState, now), false);
  assert.equal(isSessionExpired(expiredState, now), true);
  assert.equal(isSessionExpired(null, now), false);
  assert.equal(isSessionExpired({}, now), false);
});

test("normalizeSnapshot normalizes corrupted snapshots safely", () => {
  assert.equal(normalizeSnapshot(null, mockCreateIdleState), null);
  assert.equal(normalizeSnapshot(123, mockCreateIdleState), null);
  assert.equal(normalizeSnapshot("corrupted", mockCreateIdleState), null);

  const malformed = {
    busy: "yes",
    status: 123,
    activeProviders: "invalid",
    errors: "not-an-array",
  };

  const normalized = normalizeSnapshot(malformed, mockCreateIdleState);
  assert.equal(normalized.busy, true);
  assert.equal(typeof normalized.status, "string");
  assert.equal(Array.isArray(normalized.errors), true);
  assert.equal(Array.isArray(normalized.activeProviders), true);
});

test("recoverSession handles null or corrupted state without crashing", () => {
  const nullResult = recoverSession(null, mockCreateIdleState);
  assert.equal(nullResult.state.status, "idle");
  assert.equal(nullResult.shouldPersist, false);

  const corruptedResult = recoverSession("invalid json", mockCreateIdleState);
  assert.equal(corruptedResult.state.status, "idle");
  assert.equal(corruptedResult.shouldPersist, false);
});

test("recoverSession handles expired sessions by clearing transcript and setting message", () => {
  const now = Date.now();
  const expired = {
    savedAt: now - SESSION_RETENTION_MS - 5000,
    status: "done",
    activeProviders: ["chatgpt"],
  };

  const result = recoverSession(expired, mockCreateIdleState, now);
  assert.equal(result.state.transcript, null);
  assert.equal(result.shouldPersist, true);
  assert.ok(result.state.message.includes("超過 24 小時"));
});

test("recoverSession resets busy/running state to error on interrupted sessions", () => {
  const now = Date.now();
  const interrupted = {
    savedAt: now - 1000,
    busy: true,
    status: "running",
    activeProviders: ["chatgpt"],
    workflowCheckpoint: { provider: "chatgpt", phase: "polling" },
  };

  const result = recoverSession(interrupted, mockCreateIdleState, now);
  assert.equal(result.state.busy, false);
  assert.equal(result.state.status, "error");
  assert.equal(result.shouldPersist, true);
  assert.ok(result.state.message.includes("背景程序在執行期間中斷"));
  assert.ok(result.state.message.includes("chatgpt"));
});

function interruptedCritiqueState({ checkpointProvider = "chatgpt", allSubmitted = false, savedReplies = {} } = {}) {
  const providers = ["chatgpt", "gemini", "grok", "claude", "meta"];
  const engine = new DebateEngine(providers, "chatgpt", 3);
  engine.start("恢復測試問題");
  for (const provider of providers) engine.recordAnswer(provider, `${provider} 首輪回答`);
  engine.buildCritiqueJobs(1);
  for (const provider of providers) engine.recordCritique(provider, `${provider} 第一輪互評`, 1);
  engine.buildCritiqueJobs(2);
  for (const [provider, content] of Object.entries(savedReplies)) engine.recordCritique(provider, content, 2);

  return {
    savedAt: Date.now(),
    busy: true,
    status: "running",
    phase: "critique-2",
    mode: "fast",
    question: "恢復測試問題",
    activeProviders: providers,
    transcript: engine.snapshot(),
    providerDiagnostics: Object.fromEntries(providers.map((provider) => [provider, {
      stage: "submitted",
      phase: allSubmitted ? "critique-2" : "critique",
    }])),
    workflowCheckpoint: {
      stage: allSubmitted ? "collecting" : "submitting",
      provider: checkpointProvider,
      phase: "critique-2",
      round: 2,
    },
  };
}

test("interrupted critique-2 pauses for manual recovery and queues providers still on critique-1", () => {
  const interrupted = interruptedCritiqueState();
  const result = recoverSession(interrupted, mockCreateIdleState);

  assert.equal(result.state.status, "waiting_for_user");
  assert.equal(result.state.busy, false);
  assert.equal(result.engine instanceof DebateEngine, true);
  assert.equal(result.state.repairPause.target, "critique");
  assert.equal(result.state.repairPause.pausedPhase, "critique-2");
  assert.deepEqual(result.state.repairPause.resumePlan,
    { type: "planned", nextRound: 3, scheduler: "fast", interactiveMode: false });
  assert.deepEqual(result.state.repairPause.remainingJobs.map(({ provider, phase, round }) => ({ provider, phase, round })),
    ["gemini", "grok", "claude", "meta"].map((provider) => ({ provider, phase: "critique-2", round: 2 })));
  assert.equal(result.state.repairPause.remainingJobs.length, 4);
  assert.ok(result.state.repairPause.remainingJobs.every((job) => job.prompt.length > 0));
  assert.deepEqual(pendingReplyRepairs(result.state).map(({ provider, phase }) => ({ provider, phase })), [
    { provider: "chatgpt", phase: "critique-2" },
  ]);
  assert.match(result.state.message, /不會自動重送/);
});

test("interrupted collecting marks every submitted missing critique as a manual repair", () => {
  const interrupted = interruptedCritiqueState({ allSubmitted: true });
  interrupted.providerDiagnostics.gemini.stage = "error";
  const result = recoverSession(interrupted, mockCreateIdleState);

  assert.equal(result.state.status, "waiting_for_user");
  assert.equal(result.state.repairPause.remainingJobs.length, 0);
  assert.deepEqual(pendingReplyRepairs(result.state).map(({ provider }) => provider),
    ["chatgpt", "gemini", "grok", "claude", "meta"]);
});

test("interrupted chat first round resumes to the user instead of starting critique", () => {
  const providers = ["chatgpt", "gemini"];
  const engine = new DebateEngine(providers, "chatgpt", 1, { openEnded: true });
  engine.start("自由聊天問題");
  const result = recoverSession({
    savedAt: Date.now(), busy: true, status: "running", phase: "first-round",
    mode: "chat", question: "自由聊天問題", activeProviders: providers,
    transcript: engine.snapshot(),
    workflowCheckpoint: { stage: "submitting", provider: "chatgpt", phase: "first-round" },
  }, mockCreateIdleState);

  assert.equal(result.state.status, "waiting_for_user");
  assert.deepEqual(result.state.repairPause.resumePlan,
    { type: "interactive", nextRound: 1, scheduler: "fast", interactiveMode: true });
});

test("first-round recovery rebuilds prompts from the transcript question", () => {
  const providers = ["chatgpt", "gemini"];
  const engine = new DebateEngine(providers);
  engine.start("來源摘要原文作為辯論題目");
  const result = recoverSession({
    savedAt: Date.now(), busy: true, status: "running", phase: "first-round",
    mode: "summary", question: "", activeProviders: providers,
    transcript: engine.snapshot(),
    workflowCheckpoint: { stage: "submitting", provider: "chatgpt", phase: "first-round" },
  }, mockCreateIdleState);

  assert.equal(result.state.status, "waiting_for_user");
  assert.ok(result.state.repairPause.remainingJobs[0].prompt.includes("來源摘要原文作為辯論題目"));
});

test("interrupted recovery never queues an AI that already left this meeting", () => {
  const engine = new DebateEngine(["chatgpt", "gemini", "meta"], "chatgpt", 1);
  engine.start("離席後背景中斷");
  engine.departProvider("meta");
  const result = recoverSession({
    savedAt: Date.now(), busy: true, status: "running", phase: "first-round", mode: "fast",
    activeProviders: engine.activeProviders, departedProviders: ["meta"], transcript: engine.snapshot(),
    workflowCheckpoint: {stage: "submitting", provider: "chatgpt", phase: "first-round"},
  }, mockCreateIdleState);
  assert.deepEqual(result.engine.participatingProviders, ["chatgpt", "gemini"]);
  assert.deepEqual(result.state.repairPause.remainingJobs.map(j=>j.provider), ["gemini"]);
  assert.equal(pendingReplyRepairs(result.state).some(p=>p.provider === "meta"), false);
});

test("interrupted imposter first round keeps the existing error fallback", () => {
  const providers = ["chatgpt", "gemini"];
  const engine = new DebateEngine(providers, "chatgpt", 2, { interactionStyle: "imposter" });
  engine.start("內鬼模式問題");
  const result = recoverSession({
    savedAt: Date.now(), busy: true, status: "running", phase: "first-round",
    mode: "fast", question: "內鬼模式問題", activeProviders: providers,
    transcript: engine.snapshot(),
    workflowCheckpoint: { stage: "submitting", provider: "chatgpt", phase: "first-round" },
  }, mockCreateIdleState);

  assert.equal(result.state.status, "error");
  assert.equal(result.engine, null);
});

test("interrupted recovery preserves a reply already recorded for the checkpoint provider", () => {
  const interrupted = interruptedCritiqueState({ savedReplies: { chatgpt: "已記錄的第二輪回答" } });
  const result = recoverSession(interrupted, mockCreateIdleState);

  assert.equal(result.engine.snapshot().critiqueRounds[1].chatgpt, "已記錄的第二輪回答");
  assert.equal(pendingReplyRepairs(result.state).some((repair) => repair.provider === "chatgpt"), false);
  assert.equal(result.state.repairPause.remainingJobs.some((job) => job.provider === "chatgpt"), false);
});

test("busy session without a workflow checkpoint retains the existing error fallback", () => {
  const interrupted = {
    savedAt: Date.now(), busy: true, status: "running", phase: "first-round",
    mode: "fast", question: "沒有檢查點", activeProviders: ["chatgpt", "gemini"],
    transcript: new DebateEngine(["chatgpt", "gemini"]).snapshot(),
  };
  const result = recoverSession(interrupted, mockCreateIdleState);

  assert.equal(result.state.status, "error");
  assert.equal(result.engine, null);
  assert.match(result.state.message, /背景程序在執行期間中斷/);
});

test("recoverSession handles corrupted transcript when status is waiting_for_user", () => {
  const waitingCorrupted = {
    savedAt: Date.now(),
    status: "waiting_for_user",
    transcript: "invalid_transcript_structure",
  };

  const result = recoverSession(waitingCorrupted, mockCreateIdleState);
  assert.equal(result.state.status, "idle");
  assert.equal(result.shouldPersist, true);
  assert.ok(result.state.message.includes("無法恢復先前對話"));
});

test("reload preserves a repair pause, deferred jobs, and the original round plan", () => {
  const engine = new DebateEngine(["chatgpt", "gemini"], "chatgpt", 3);
  engine.start("故障後重載");
  engine.markProviderError("chatgpt", "first-round", "未確認送出");
  const repairPause = { target: "answer", pausedPhase: "first-round",
    remainingJobs: [{ provider: "gemini", phase: "first-round", prompt: "尚未送出的完整提示" }],
    resumePlan: { type: "planned", nextRound: 1, scheduler: "fast", interactiveMode: false } };
  const result = recoverSession(JSON.parse(JSON.stringify({
    savedAt: Date.now(), status: "waiting_for_user", phase: "waiting_for_user", busy: false,
    activeProviders: engine.activeProviders, transcript: engine.snapshot(), repairPause,
  })), mockCreateIdleState);
  assert.equal(result.state.status, "waiting_for_user");
  assert.equal(result.state.busy, false);
  assert.deepEqual(result.state.repairPause, repairPause);
  assert.equal(result.engine.debateRounds, 3);
  assert.equal(pendingReplyRepairs(result.state).length, 1);
  assert.equal(result.shouldPersist, false);
});
