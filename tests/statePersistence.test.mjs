import test from "node:test";
import assert from "node:assert/strict";

import {
  createStateStorageQueue,
  degradeStateForStorage,
  safePersistState,
} from "../src/background/statePersistence.js";

test("state storage queue removes data only after an accepted earlier write finishes", async () => {
  const enqueue = createStateStorageQueue();
  let stored;
  let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  const write = enqueue(async () => { await delayed; stored = { transcript: "old" }; });
  const clear = enqueue(() => { stored = undefined; });
  await Promise.resolve();
  release();
  await Promise.all([write, clear]);
  assert.equal(stored, undefined);
});

test("state storage queue continues after a failed write without losing clear or new writes", async () => {
  const enqueue = createStateStorageQueue();
  const actions = [];
  await assert.rejects(enqueue(() => { throw new Error("quota"); }), /quota/);
  await enqueue(() => actions.push("clear"));
  await enqueue(() => actions.push("new"));
  assert.deepEqual(actions, ["clear", "new"]);
});
import { DebateEngine } from "../src/background/debateEngine.js";

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

test("quota degradation preserves current debate round slots and a recoverable latest round", async () => {
  const engine = new DebateEngine(["chatgpt", "gemini"], "chatgpt", 1, { openEnded: true });
  engine.start("請討論儲存韌性");
  engine.recordAnswer("chatgpt", "甲".repeat(3000));
  engine.recordAnswer("gemini", "乙".repeat(3000));
  for (let round = 1; round <= 6; round += 1) {
    if (round > 1) engine.addChatRound();
    engine.buildCritiqueJobs(round);
    engine.recordCritique("chatgpt", `${round}：${"甲".repeat(3000)}`, round);
    engine.recordCritique("gemini", `${round}：${"乙".repeat(3000)}`, round);
  }
  let attempts = 0;
  let saved;
  const storage = { local: { async set(value) {
    attempts += 1;
    if (attempts === 1) throw new Error("QUOTA_BYTES exceeded");
    saved = value.state;
  } } };

  assert.equal(await safePersistState(storage, {
    status: "waiting_for_user",
    transcript: engine.snapshot(),
  }), true);
  assert.equal(attempts, 2);
  assert.equal(saved.transcript.critiqueRounds.length, 6);
  assert.ok(saved.transcript.critiqueRounds[0].chatgpt.length <= 201);
  assert.ok(saved.transcript.critiqueRounds[5].chatgpt.length <= 1001);
  const restored = DebateEngine.restore(saved.transcript);
  assert.equal(restored.snapshot().openEnded, true);
  assert.equal(restored.snapshot().currentCritiqueRound, 6);
  assert.equal(restored.addChatRound(), 7);
});

test("quota degradation retains the last completed round when a newer round is incomplete", () => {
  const state = {
    transcript: {
      activeProviders: ["chatgpt", "gemini"],
      critiqueRounds: [
        { chatgpt: "舊".repeat(1000), gemini: "舊".repeat(1000) },
        { chatgpt: "末".repeat(1000), gemini: "末".repeat(1000) },
        { chatgpt: "新".repeat(1000), gemini: "" },
      ],
    },
  };
  const degraded = degradeStateForStorage(state).transcript.critiqueRounds;
  assert.ok(degraded[0].chatgpt.length <= 201);
  assert.ok(degraded[1].chatgpt.length > 200 && degraded[1].chatgpt.length <= 1001);
  assert.ok(degraded[2].chatgpt.length > 200 && degraded[2].chatgpt.length <= 1001);
});

test("safePersistState falls back to minimal state if degraded state still exceeds quota", async () => {
  let callCount = 0;
  let finalSaved = null;

  const chromeStorage = {
    local: {
      async get() { return {}; },
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

test("unknown previous checkpoint is never replaced after quota and read failures", async () => {
  let writes = 0;
  const storage = { local: {
    async set() { writes += 1; throw new Error("quota exceeded"); },
    async get() { throw new Error("temporarily unavailable"); },
  } };
  assert.equal(await safePersistState(storage, { status: "done" }), false);
  assert.equal(writes, 2);
});

test("cancelled persistence cannot retry an old snapshot after the first write fails", async () => {
  let writes = 0;
  let current = true;
  const storage = { local: { async set() {
    writes += 1;
    current = false;
    throw new Error("quota");
  } } };
  assert.equal(await safePersistState(storage, { status: "running" }, "state", { isCurrent: () => current }), false);
  assert.equal(writes, 1);
});

test("cancelled persistence cannot write minimal metadata after an awaited read", async () => {
  let writes = 0;
  let current = true;
  const storage = { local: {
    async set() { writes += 1; throw new Error("quota"); },
    async get() { current = false; return {}; },
  } };
  assert.equal(await safePersistState(storage, { status: "running" }, "state", { isCurrent: () => current }), false);
  assert.equal(writes, 2);
});

test("quota failures never overwrite a recoverable earlier transcript with minimal state", async () => {
  const key = "aiDebate.currentState";
  const previous = { transcript: { originalQuestion: "已保存的會議" }, status: "waiting_for_user" };
  let writes = 0;
  const storage = { local: {
    async get(requestedKey) {
      assert.equal(requestedKey, key);
      return { [key]: previous };
    },
    async set() {
      writes += 1;
      throw new Error("QUOTA_BYTES exceeded");
    },
  } };
  const result = await safePersistState(storage, {
    status: "waiting_for_user",
    transcript: { originalQuestion: "太長的新內容" },
  }, key);
  assert.equal(result, false);
  assert.equal(writes, 2);
  assert.equal(previous.transcript.originalQuestion, "已保存的會議");
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
