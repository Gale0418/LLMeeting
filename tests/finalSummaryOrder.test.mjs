import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { entitlementsForPlan } from "../src/shared/entitlements.js";

test("all-anonymous summary returns an explicit failure when no judges return results", async () => {
  const source = await readFile("src/background/service-worker.js", "utf8");
  const section = source.slice(source.indexOf("async function runFinalSummary"), source.indexOf("async function finishImposterReveal"));
  const context = {
    runtimeState: { summaryStrategy: "allAnonymous" },
    engine: { buildFinalJobs: () => [] },
    runController: { assertCurrent() {} },
    runFastProviderJobs: async () => [],
  };
  vm.createContext(context);
  vm.runInContext(`${section}\nglobalThis.run = runFinalSummary;`, context);
  const result = await context.run({});
  assert.equal(result.ok, false);
  assert.match(result.error, /沒有可用的裁判結果/);
});

test("explicit sheep-mode preference overrides legacy Pro, while absent preference migrates it", async () => {
  const source = await readFile("src/background/service-worker.js", "utf8");
  const section = source.slice(source.indexOf("async function getEntitlements"), source.indexOf("async function ensureRuntimeStateRetention"));
  for (const [preference, expected] of [[false, false], [true, true], [undefined, true], ["false", true]]) {
    const context = {
      ENTITLEMENT_STORAGE_KEY: "plan",
      SHEEP_MODE_STORAGE_KEY: "sheep",
      entitlementsForPlan,
      chrome: { storage: { local: { async get(key) { return { [key]: key === "plan" ? "pro" : preference }; } } } },
    };
    vm.createContext(context);
    vm.runInContext(`${section}\nglobalThis.get = getEntitlements;`, context);
    assert.equal((await context.get()).sheepMode, expected);
  }
});

test("all-anonymous summary ordering and fallback labels do not depend on reply timing", async () => {
  const source = await readFile("src/background/service-worker.js", "utf8");
  const section = source.slice(source.indexOf("async function runFinalSummary"), source.indexOf("async function finishImposterReveal"));
  const context = {
    runtimeState: { summaryStrategy: "allAnonymous" },
    PROVIDERS: [{ id: "chatgpt" }, { id: "gemini" }, { id: "grok" }],
    engine: {
      buildFinalJobs: () => [{ provider: "grok" }, { provider: "chatgpt" }],
      snapshot: () => ({ anonymousNames: {} }),
    },
    runController: { assertCurrent() {} },
    async runFastProviderJobs() {
      context.runtimeState.summaries = { chatgpt: "second reply", grok: "first reply" };
      return [{ ok: true }, { ok: true }];
    },
  };
  vm.createContext(context);
  vm.runInContext(`${section}\nglobalThis.run = runFinalSummary;`, context);
  const result = await context.run({});
  assert.equal(result.content, "匿名參與者（暱稱未取得）：\nfirst reply\n\n匿名參與者（暱稱未取得）：\nsecond reply");
});
