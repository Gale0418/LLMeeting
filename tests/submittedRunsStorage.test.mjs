import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("src/background/service-worker.js", "utf8");
const start = source.indexOf("function submittedRunsMessageProvider(");
const end = source.indexOf("\nchrome.runtime.onInstalled", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const storageCode = source.slice(start, end);

function createStorageHarness() {
  const values = new Map();
  const context = {
    URL,
    Date: class extends Date { static now() { return 2_000_000; } },
    PROVIDERS: [
      { id: "chatgpt", matchPatterns: ["https://chatgpt.com/*"] },
      { id: "claude", matchPatterns: ["https://claude.ai/*"] },
    ],
    SUBMITTED_RUNS_STORAGE_PREFIX: "aiDebate.submittedRuns.v1.",
    SUBMITTED_RUNS_TTL_MS: 1_800_000,
    MAX_SUBMITTED_RUNS_PER_TAB: 50,
    enqueueSubmittedRunStorage: (operation) => operation(),
    urlMatchesPattern(url, pattern) {
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      return new RegExp(`^${escaped}$`).test(url);
    },
    chrome: {
      runtime: { id: "extension-id" },
      storage: { session: {
        async get(key) { return { [key]: values.get(key) }; },
        async set(record) { for (const [key, value] of Object.entries(record)) values.set(key, value); },
        async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key); },
      } },
      tabs: { onRemoved: { addListener(listener) { context.removeTabData = listener; } } },
    },
  };
  vm.createContext(context);
  vm.runInContext(storageCode, context);
  return { context, values };
}

test("submitted-run storage bridge permits same-origin SPA routes but rejects unrelated frames and origins", () => {
  const { context } = createStorageHarness();
  const sender = { id: "extension-id", frameId: 0, tab: { id: 4, url: "https://chatgpt.com/c/one" }, url: "https://chatgpt.com/c/one" };

  assert.equal(context.submittedRunsMessageProvider(sender), "chatgpt");
  assert.equal(context.submittedRunsMessageProvider({ ...sender,
    tab: { ...sender.tab, url: "https://chatgpt.com/c/two" } }), "chatgpt");
  assert.equal(context.submittedRunsMessageProvider({ ...sender, frameId: 3 }), "");
  assert.equal(context.submittedRunsMessageProvider({ ...sender, id: "other-extension" }), "");
  assert.equal(context.submittedRunsMessageProvider({ ...sender, tab: { ...sender.tab, id: undefined } }), "");
  assert.equal(context.submittedRunsMessageProvider({ ...sender, url: "https://claude.ai/chat" }), "");
  assert.equal(context.submittedRunsMessageProvider({ ...sender, tab: { ...sender.tab, url: "https://claude.ai/chat" } }), "");
  assert.equal(context.submittedRunsMessageProvider({ ...sender, tab: { ...sender.tab, pendingUrl: "https://claude.ai/chat" } }), "");
  assert.equal(context.submittedRunsMessageProvider({ ...sender, tab: { ...sender.tab, pendingUrl: "not a url" } }), "");
});

test("submitted-run storage is tab/provider scoped and prunes expired entries", async () => {
  const { context, values } = createStorageHarness();
  const key = context.submittedRunsStorageKey(4, "chatgpt");
  const live = ["live", { providerId: "chatgpt", submittedAt: 1_900_000, prompt: "secret" }];
  const expired = ["old", { providerId: "chatgpt", submittedAt: 100_000, prompt: "expired" }];
  const otherProvider = ["claude", { providerId: "claude", submittedAt: 1_900_000, prompt: "other" }];

  await context.handleSubmittedRunsMessage({ type: "aiDebate:submittedRuns:set", runs: [live, expired, otherProvider] }, 4, "chatgpt");
  assert.deepEqual(values.get(key).map(([id]) => id), ["live"]);
  assert.equal(values.has(context.submittedRunsStorageKey(5, "chatgpt")), false);
  assert.equal(values.has(context.submittedRunsStorageKey(4, "claude")), false);

  const response = await context.handleSubmittedRunsMessage({ type: "aiDebate:submittedRuns:get" }, 4, "chatgpt");
  assert.equal(response.ok, true);
  assert.equal(response.runs[0][1].prompt, "secret");
  await context.removeTabData(4);
  assert.equal(values.has(key), false);
});
