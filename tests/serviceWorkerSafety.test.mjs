import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { entitlementsForPlan } from "../src/shared/entitlements.js";
test("fast provider jobs submit prompts before collecting replies", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.match(script, /runFastProviderJobs/);
  assert.match(script, /submitProviderJob/);
  assert.match(script, /collectProviderJob/);
  assert.match(script, /submittedJobs\.push\(submitted\)/);
  assert.match(script, /await activateProviderTab\(tab\)/);
});

test("free basic debate uses sequential provider jobs while pro workflows are gated", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.match(script, /startBasicDebate/);
  assert.match(script, /runSequentialProviderJobs/);
  assert.match(script, /requireProFeature\("fastDebate"\)/);
  assert.match(script, /requireProFeature\("summaryDebate"\)/);
  assert.match(script, /async function startChatDebate\([^)]*\) \{[\s\S]*?requireProFeature\("chatMode"\)/);
  assert.match(script, /async function startTheaterDebate\([^)]*\) \{[\s\S]*?requireProFeature\("chatMode"\)/);
  assert.match(script, /requireProFeature\("observerChair"\)/);
  assert.match(script, /requireProFeature\("anonymousReview"\)/);
});

test("service worker forwards selected debate round count into the engine", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.match(script, /debateRounds/);
  assert.match(script, /normalizeDebateRounds/);
  assert.match(script, /new DebateEngine\(activeProviders, summaryProvider, debateRounds, \{/);
  assert.match(script, /for \(let roundNumber = 1; roundNumber <= engine\.debateRounds; roundNumber \+= 1\)/);
});

test("new provider tabs open as active pages instead of dormant background tabs", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.match(script, /chrome\.tabs\.create\(\{ url: provider\.startUrl, active: true \}\)/);
});

test("summary debate starts from the current provider tab and returns the final prompt there", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.match(script, /startSummaryDebate/);
  assert.match(script, /getActiveProviderTab/);
  assert.match(script, /sourceProvider/);
  assert.match(script, /summaryProvider: sourceProvider/);
});

test("runtime state refreshes entitlements even after a completed debate", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.doesNotMatch(script, /if \(runtimeState\.status !== "idle" \|\| runtimeState\.busy\) \{\s+return runtimeState;\s+\}/);
  assert.match(script, /entitlements: await getEntitlements\(\)/);
});

test("service worker restores stored state once before handling messages", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.match(script, /recoverSession/);
  assert.match(script, /ensureRuntimeInitialized/);
  assert.match(script, /initializationPromise/);
});

test("run tokens replace the process-local abort flag", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.match(script, /new RunController\(\)/);
  assert.match(script, /runController\.assertCurrent\(runToken\)/);
  assert.match(script, /isRunCancelledError/);
  assert.doesNotMatch(script, /\bisAborted\b/);
});

test("service worker persists workflow checkpoints and supports clearing local debate data", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.match(script, /workflowCheckpoint/);
  assert.match(script, /createWorkflowCheckpoint/);
  assert.match(script, /aiDebate:clearLocalData/);
  assert.match(script, /chrome\.storage\.local\.remove\(STORAGE_KEY\)/);
  assert.match(script, /aiDebate:clearSubmittedRuns/);
});

test("provider overload and quota error codes survive the service-worker boundary", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.match(script, /providerResponseError/);
  assert.match(script, /response\?\.code \|\| "PROVIDER_AUTOMATION_FAILED"/);
  assert.match(script, /formatProviderFailure/);
  assert.match(script, /code: error\.code \|\| "PROVIDER_AUTOMATION_FAILED"/);
  assert.match(script, /error\.providerContent = response\?\.providerContent/);
  assert.match(script, /errorContent: error\.providerContent/);
  assert.match(script, /result\.errorContent \|\| ""/);
  assert.match(script, /OVERLOAD_REFRESH_RETRIES = 3/);
  assert.match(script, /error\.code === "PROVIDER_OVERLOADED"/);
  assert.match(script, /chrome\.tabs\.reload\(tabId\)/);
  assert.match(script, /overload-refresh/);
});

test("Meta input write failures refresh once and preserve retry counters", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.match(script, /META_INPUT_REFRESH_RETRIES = 1/);
  assert.match(script, /error\.code === "PROVIDER_INPUT_WRITE_FAILED"/);
  assert.match(script, /job\.provider === "meta"/);
  assert.match(script, /refreshMetaInputProvider/);
  assert.match(script, /meta-input-refresh/);
  assert.match(script, /metaInputRetryCount \+ 1/);
});



test("nextRound validates phase, mode, and action before starting a run", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");
  const nextRoundHandler = script.slice(
    script.indexOf('if (message.type === "aiDebate:nextRound")'),
    script.indexOf('if (message.type === "aiDebate:stop")'),
  );

  assert.ok(
    nextRoundHandler.indexOf("validateNextRound(message.action)") <
      nextRoundHandler.indexOf("runToken = runController.start()"),
  );
  assert.ok(nextRoundHandler.includes("if (!runToken) {"));
});

test("runtime retention and entitlement fallback are explicit", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.ok(script.includes("await ensureRuntimeStateRetention();"));
  assert.ok(script.includes("if (!Number.isFinite(runtimeState.savedAt))"));
  assert.equal(script.includes("savedAt: Date.now(),\n  };\n  let stateToPublish"), false);
  assert.ok(script.includes("return runtimeState.entitlements || cachedEntitlements || entitlementsForPlan()"));
  assert.ok(script.includes("createIdleState(undefined, runtimeState.entitlements)"));
});

test("Reset clears the local author entitlement and publishes Free immediately", async () => {
  const storageData = {
    "aiDebate.entitlementPlan": "pro",
    "aiDebate.currentState": {
      savedAt: Date.now(),
      busy: false,
      status: "idle",
      entitlements: entitlementsForPlan("pro"),
    },
  };
  const sentMessages = [];
  let onMessage;
  const chrome = {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener(listener) { onMessage = listener; } },
      sendMessage(message) {
        sentMessages.push(message);
        return Promise.resolve();
      },
    },
    storage: {
      local: {
        async get(key) {
          return { [key]: storageData[key] };
        },
        async set(values) {
          Object.assign(storageData, values);
        },
        async remove(key) {
          delete storageData[key];
        },
      },
    },
  };

  globalThis.chrome = chrome;
  await import("../src/background/service-worker.js?reset-regression");

  const response = await new Promise((resolve) => {
    assert.equal(onMessage({ type: "aiDebate:reset" }, {}, resolve), true);
  });

  assert.equal(response.ok, true);
  assert.equal(response.state.entitlements.plan, "free");
  assert.equal(response.state.entitlements.isPro, false);
  assert.equal(storageData["aiDebate.entitlementPlan"], undefined);
  assert.equal(storageData["aiDebate.currentState"].entitlements.plan, "free");
  assert.equal(sentMessages.at(-1).state.entitlements.plan, "free");
});
test("unbound providers always open a fresh tab while explicit bindings are reused", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");
  const helper = script.slice(
    script.indexOf("async function getOrCreateProviderTab"),
    script.indexOf("async function activateProviderTab"),
  );

  assert.ok(helper.includes("chrome.tabs.get(boundTabId)"));
  assert.ok(helper.includes("chrome.tabs.create({ url: provider.startUrl, active: true })"));
  assert.equal(helper.includes("chrome.tabs.query"), false);
  assert.ok(helper.indexOf("chrome.tabs.get(boundTabId)") < helper.indexOf("chrome.tabs.create"));
});

test("overload recovery failures are converted to provider results", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.ok(script.includes("try {\n        await refreshOverloadedProvider"));
  assert.ok(script.includes("catch (retryError)"));
  assert.ok(script.includes("error = retryError;"));
});

test("service worker resolves chair strategies and routes anonymous summaries to a fresh tab", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.match(script, /summaryStrategy/);
  assert.match(script, /resolveSummaryProvider/);
  assert.match(script, /resolveRandomProvider/);
  assert.match(script, /observerChair/);
  assert.match(script, /至少需勾選 3 家 AI/);
  assert.match(script, /anonymousReview/);
  assert.match(script, /forceNewTab: runtimeState\.summaryStrategy === "anonymousReview"/);
  assert.match(script, /getOrCreateProviderTab\(job\.provider, \{ forceNewTab: Boolean\(job\.forceNewTab\) \}\)/);
});

test("summary provider messages use a longer phase-aware timeout", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  const generalTimeout = Number(script.match(/const PROVIDER_TIMEOUT_MS = (\d+)/)?.[1]);
  const summaryTimeout = Number(script.match(/const SUMMARY_PROVIDER_TIMEOUT_MS = (\d+)/)?.[1]);

  assert.ok(Number.isFinite(generalTimeout));
  assert.ok(Number.isFinite(summaryTimeout));
  assert.ok(summaryTimeout > generalTimeout);
  assert.match(script, /phase === "summary" \|\| phase === "source-summary"/);
  assert.match(script, /timeoutMs: getProviderTimeoutMs\(job\.phase\)/);
});
