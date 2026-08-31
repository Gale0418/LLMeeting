import test from "node:test";
import assert from "node:assert/strict";

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
