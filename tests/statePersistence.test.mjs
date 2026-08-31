import test from "node:test";
import assert from "node:assert/strict";

import {
  degradeStateForStorage,
  safePersistState,
} from "../src/background/statePersistence.js";

test("degradeStateForStorage trims transcript rounds to last 3 and truncates long text", () => {
  const longText = "a".repeat(2000);
  const state = {
    status: "done",
    transcript: {
      topic: "test",
      rounds: [
        { round: 1, responses: { chatgpt: { text: "r1" } } },
        { round: 2, responses: { chatgpt: { text: "r2" } } },
        { round: 3, responses: { chatgpt: { text: "r3" } } },
        { round: 4, responses: { chatgpt: { text: "r4" } } },
        { round: 5, responses: { chatgpt: { text: longText } } },
      ],
    },
    summary: "s".repeat(4000),
  };

  const degraded = degradeStateForStorage(state);

  assert.equal(degraded.transcript.rounds.length, 3);
  assert.equal(degraded.transcript.rounds[0].round, 3);
  assert.equal(degraded.transcript.rounds[2].round, 5);
  assert.equal(degraded.transcript.rounds[2].responses.chatgpt.text.length, 1000);
  assert.ok(degraded.summary.endsWith("(已截斷)"));
});

test("safePersistState handles normal storage set successfully", async () => {
  let saved = null;
  const chromeStorage = {
    local: {
      async set(data) {
        saved = data;
      },
    },
  };

  const ok = await safePersistState(chromeStorage, { status: "running", busy: true });
  assert.equal(ok, true);
  assert.equal(saved.state.status, "running");
});

test("safePersistState degrades state on QuotaExceededError and retries", async () => {
  let callCount = 0;
  let finalSaved = null;

  const chromeStorage = {
    local: {
      async set(data) {
        callCount += 1;
        if (callCount === 1) {
          const err = new Error("QuotaExceededError: Storage limit reached");
          err.name = "QuotaExceededError";
          throw err;
        }
        finalSaved = data;
      },
    },
  };

  const state = {
    status: "done",
    transcript: {
      rounds: Array.from({ length: 10 }, (_, i) => ({ round: i + 1, responses: {} })),
    },
  };

  const ok = await safePersistState(chromeStorage, state);
  assert.equal(ok, true);
  assert.equal(callCount, 2);
  assert.equal(finalSaved.state.transcript.rounds.length, 3);
});

test("safePersistState falls back to minimal state if degraded state still exceeds quota", async () => {
  let callCount = 0;
  let finalSaved = null;

  const chromeStorage = {
    local: {
      async set(data) {
        callCount += 1;
        if (callCount <= 2) {
          throw new Error("QUOTA_BYTES_PER_ITEM exceeded");
        }
        finalSaved = data;
      },
    },
  };

  const state = {
    status: "running",
    busy: true,
    activeProviders: ["chatgpt", "gemini"],
    message: "Running debate",
  };

  const ok = await safePersistState(chromeStorage, state);
  assert.equal(ok, true);
  assert.equal(callCount, 3);
  assert.equal(finalSaved.state.status, "running");
  assert.equal(finalSaved.state.busy, false);
  assert.equal(finalSaved.state.message, "Running debate");
});

test("safePersistState catches failure on minimal state write without throwing", async () => {
  const chromeStorage = {
    local: {
      async set() {
        throw new Error("Persistent storage error");
      },
    },
  };

  const ok = await safePersistState(chromeStorage, { status: "done" });
  assert.equal(ok, false);
});
