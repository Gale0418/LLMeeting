import test from "node:test";
import assert from "node:assert/strict";

import { DebateEngine } from "../src/background/debateEngine.js";
import { recoverSession } from "../src/background/sessionRecovery.js";

function createIdleState() {
  return {
    busy: false,
    status: "idle",
    phase: "idle",
    message: "等待開始",
    errors: [],
  };
}

function waitingSession() {
  const engine = new DebateEngine(["chatgpt", "gemini"]);
  engine.start("要喝紅茶還是咖啡？");
  engine.recordAnswer("chatgpt", "紅茶");
  engine.recordAnswer("gemini", "咖啡");
  const jobs = engine.buildCritiqueJobs(1);
  engine.recordCritique("chatgpt", "咖啡也不錯", jobs[0].round);
  engine.recordCritique("gemini", "紅茶更溫和", jobs[1].round);

  return {
    busy: false,
    status: "waiting_for_user",
    phase: "waiting_for_user",
    mode: "chat",
    message: "等待主人發言或選擇下一步...",
    errors: [],
    transcript: engine.snapshot(),
  };
}

test("missing stored state recovers as idle", () => {
  const recovered = recoverSession(undefined, createIdleState);

  assert.deepEqual(recovered.state, createIdleState());
  assert.equal(recovered.engine, null);
  assert.equal(recovered.shouldPersist, false);
});

test("interrupted running state becomes a visible recoverable error", () => {
  const recovered = recoverSession({
    ...waitingSession(),
    busy: true,
    status: "running",
    phase: "critique",
  }, createIdleState);

  assert.equal(recovered.state.busy, false);
  assert.equal(recovered.state.status, "error");
  assert.equal(recovered.state.phase, "done");
  assert.match(recovered.state.message, /背景程序.*中斷/);
  assert.equal(recovered.shouldPersist, true);
});

test("waiting interactive session restores its debate engine", () => {
  const stored = waitingSession();
  const recovered = recoverSession(stored, createIdleState);

  assert.equal(recovered.state.status, "waiting_for_user");
  assert.equal(recovered.engine.snapshot().originalQuestion, "要喝紅茶還是咖啡？");
  assert.equal(recovered.engine.addChatRound(), 2);
  assert.equal(recovered.shouldPersist, false);
});

test("corrupt waiting session falls back to idle with an explanation", () => {
  const recovered = recoverSession({
    ...waitingSession(),
    transcript: { nope: true },
  }, createIdleState);

  assert.equal(recovered.state.busy, false);
  assert.equal(recovered.state.status, "idle");
  assert.match(recovered.state.message, /無法恢復先前對話/);
  assert.equal(recovered.engine, null);
  assert.equal(recovered.shouldPersist, true);
});
