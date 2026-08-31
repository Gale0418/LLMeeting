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

test("provider readiness has a stable service-worker boundary and status mapping", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.match(script, /message\.type === "aiDebate:checkReadiness"/);
  assert.match(script, /async function checkReadinessRequest\(message = \{\}, readinessToken\)/);
  assert.match(script, /Array\.isArray\(message\.activeProviders\)/);
  assert.match(script, /preflightResults: results/);
  assert.match(script, /sendProviderMessage\(effectiveTabId, \{[\s\S]*phase: "readiness"[\s\S]*\}, "aiDebate:checkReadiness"\)/);
  for (const code of [
    "READY",
    "TAB_NOT_FOUND",
    "WRONG_URL",
    "LOGIN_REQUIRED",
    "INPUT_NOT_FOUND",
    "SEND_UNAVAILABLE",
    "GENERATING",
    "PROVIDER_ERROR",
    "CONTENT_SCRIPT_UNAVAILABLE",
    "TIMEOUT",
  ]) {
    assert.match(script, new RegExp(`"${code}"`));
  }
});

test("provider messaging repairs stale content scripts through a version handshake", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.match(script, /PROVIDER_CONTENT_SCRIPT_VERSION = "0\.5\.0-readiness\.4"/);
  assert.match(script, /type: "aiDebate:getCapabilities"/);
  assert.match(script, /capabilities\?\.contentScriptVersion !== PROVIDER_CONTENT_SCRIPT_VERSION/);
  assert.match(script, /await ensureProviderContentScript\(tabId\)/);
  assert.match(script, /CONTENT_SCRIPT_VERSION_MISMATCH/);
});

test("debate warms and checks provider tabs sequentially before creating a formal engine run", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");
  const preflight = script.slice(script.indexOf("async function preflightProviderTabs"), script.indexOf("async function checkProviderTabReadiness"));
  const sequential = script.slice(script.indexOf("async function checkProviderTabsSequentially"), script.indexOf("async function checkProviderTabReadiness"));
  const questionStart = script.slice(script.indexOf("async function startQuestionDebate"), script.indexOf("async function startSummaryDebate"));

  assert.match(preflight, /checkProviderTabsSequentially\(uniqueProviderIds, hookedTabs, runToken\)/);
  assert.match(sequential, /for \(const providerId of providerIds\)/);
  assert.match(sequential, /await activateProviderTabForReadiness\(tab\)/);
  assert.match(sequential, /results\.push\(await checkProviderTabReadiness\(tab\.id, providerId\)\)/);
  assert.match(sequential, /finally \{[\s\S]*await restoreActiveTab\(originalTab\)/);
  assert.doesNotMatch(sequential, /Promise\.all/);
  assert.ok(questionStart.indexOf("await preflightProviderTabs") < questionStart.indexOf("new DebateEngine"));
  assert.match(script, /const providerTabs = \{ \.\.\.\(options\.hookedTabs \|\| \{\}\), \.\.\.preflight\.providerTabs \};/);
  assert.match(script, /openEnded: true,[\s\S]*interactiveMode: true,[\s\S]*debateRounds: 1/);
  const startHandler = script.slice(script.indexOf('if (message.type === "aiDebate:start")'), script.indexOf('if (message.type === "aiDebate:checkReadiness")'));
  assert.ok(startHandler.indexOf("await validateStartRequestBeforePreflight(message)") < startHandler.indexOf("await preflightStartRequest(message, reservationToken)"));
  assert.match(script, /error\.code = "SUMMARY_PROVIDER_DISABLED"/);
  assert.ok(startHandler.indexOf("await preflightStartRequest(message, reservationToken)") < startHandler.indexOf("runController.claim(reservationToken)"));
  assert.match(startHandler, /reservationToken = runController\.reserve\(\)/);
  assert.match(startHandler, /busy: true,[\s\S]*status: "running",[\s\S]*phase: "preflight-complete",[\s\S]*runController\.claim\(reservationToken\)/);
  assert.match(startHandler, /runController\.claim\(reservationToken\)/);
  assert.match(startHandler, /if \(!runToken\) \{[\s\S]*busy: false[\s\S]*preflightResults:/);
});

test("manual readiness uses the same foreground warm-up sequence", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");
  const handler = script.slice(script.indexOf("async function checkReadinessRequest"), script.indexOf("async function checkReadinessForProvider"));

  assert.match(handler, /checkProviderTabsSequentially\(\[\.\.\.new Set\(providerIds\)\], requestedTabs, readinessToken\)/);
  assert.match(script, /chrome\.tabs\.update\(tab\.id, \{ active: true \}\)/);
  assert.match(script, /activeTab\.active && activeTab\.status === "complete"/);
  assert.match(script, /await delay\(200\)/);
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

test("theater mode forces the interactive waiting path at the background boundary", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");
  const theaterStart = script.slice(
    script.indexOf("async function startTheaterDebate"),
    script.indexOf("async function startInteractiveDebate"),
  );

  assert.match(theaterStart, /\.\.\.options,[\s\S]*mode: "theater",[\s\S]*interactiveMode: true/);
  assert.match(script, /if \(options\.interactiveMode\) \{[\s\S]*status: "waiting_for_user"/);
});

test("free chat interactive mode waits after answers before the first critique", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");
  const interactiveDebate = script.slice(
    script.indexOf("async function startInteractiveDebate"),
    script.indexOf("function normalizeSummaryStrategy"),
  );
  const pauseBranch = interactiveDebate.indexOf('if (options.mode === "chat" && options.interactiveMode)');
  const critiqueLoop = interactiveDebate.indexOf("for (let round = 1; round <= debateRounds; round += 1)");

  assert.ok(pauseBranch >= 0);
  assert.ok(critiqueLoop > pauseBranch);
  assert.match(interactiveDebate.slice(pauseBranch, critiqueLoop), /status: "waiting_for_user"/);
  assert.match(interactiveDebate.slice(pauseBranch, critiqueLoop), /return runtimeState;/);
  assert.doesNotMatch(interactiveDebate.slice(pauseBranch, critiqueLoop), /buildCritiqueJobs/);
  assert.match(interactiveDebate.slice(critiqueLoop), /buildCritiqueJobs/);
});

test("imposter debates finish with deterministic reveal instead of the summary job", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");
  const revealStart = script.indexOf("async function finishImposterReveal");
  const revealEnd = script.indexOf("async function startQuestionDebate", revealStart);
  const revealHelper = script.slice(revealStart, revealEnd);
  const interactive = script.slice(
    script.indexOf("async function startInteractiveDebate"),
    script.indexOf("function normalizeSummaryStrategy"),
  );

  assert.match(revealHelper, /engine\.buildRevealJobs\(\)/);
  assert.match(revealHelper, /runFastProviderJobs\(revealJobs, "reveal", runToken\)/);
  const imposterBranch = interactive.indexOf('if (engine.interactionStyle === "imposter")');
  const skipSummaryBranch = interactive.indexOf("if (options.skipSummary)");
  assert.ok(imposterBranch >= 0 && imposterBranch < skipSummaryBranch);
  assert.match(interactive.slice(imposterBranch, skipSummaryBranch), /finishImposterReveal\(runToken\)/);
  assert.doesNotMatch(interactive.slice(imposterBranch, skipSummaryBranch), /buildRuntimeFinalJob/);
});
test("all imposter completion paths broadcast reveal jobs before summary handling", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");
  const interactive = script.slice(script.indexOf("async function startInteractiveDebate"), script.indexOf("function normalizeSummaryStrategy"));
  const rounds = script.slice(script.indexOf("async function runDebateRounds"), script.indexOf("async function handleNextRound"));
  const nextRound = script.slice(script.indexOf("async function handleNextRound"), script.indexOf("async function runSequentialProviderJobs"));

  assert.match(interactive, /finishImposterReveal\(runToken\)/);
  assert.match(rounds, /finishImposterReveal\(runToken\)/);
  assert.match(nextRound, /engine\.interactionStyle === "imposter"/);
  assert.match(nextRound, /finishImposterReveal\(runToken\)/);
  const revealBranchStart = rounds.indexOf('if (engine.interactionStyle === "imposter")');
  const summaryBranchStart = rounds.indexOf('if (runtimeState.skipSummary)');
  assert.ok(revealBranchStart >= 0 && summaryBranchStart > revealBranchStart);
  const revealBranch = rounds.slice(revealBranchStart, summaryBranchStart);
  assert.match(revealBranch, /return finishImposterReveal\(runToken\)/);
  assert.doesNotMatch(revealBranch, /buildRuntimeFinalJob/);
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
  assert.ok(nextRoundHandler.includes("runRevision = lifecycleRevision"));
  assert.ok(nextRoundHandler.includes("lifecycleRevision !== runRevision"));
  assert.ok(
    nextRoundHandler.indexOf("await publishState(runToken)") <
      nextRoundHandler.lastIndexOf("runController.cancel()"),
  );
});

test("stop remembers a preflight reservation before the control operation cancels it", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");
  const stopHandler = script.slice(
    script.indexOf('if (message.type === "aiDebate:stop")'),
    script.indexOf("return false;", script.indexOf('if (message.type === "aiDebate:stop")')),
  );

  assert.ok(
    stopHandler.indexOf("const hadActiveOperation = runtimeState.busy || runController.isReserved()") <
      stopHandler.indexOf('beginControlOperation("stop")'),
  );
  assert.match(stopHandler, /runtimeState\.busy \|\| hadActiveOperation/);
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

test("parallel starts are serialized before validation and preflight", async () => {
  const storageData = { "aiDebate.currentState": undefined };
  let onMessage;
  const chrome = {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener(listener) { onMessage = listener; } },
      sendMessage() { return Promise.resolve(); },
    },
    storage: {
      local: {
        async get(key) { return { [key]: storageData[key] }; },
        async set(values) { Object.assign(storageData, values); },
        async remove(key) { delete storageData[key]; },
      },
    },
  };
  globalThis.chrome = chrome;
  await import("../src/background/service-worker.js?parallel-start-regression");

  const responses = [];
  const first = new Promise((resolve) => {
    responses.push(resolve);
    assert.equal(onMessage({ type: "aiDebate:start", mode: "basic", question: "" }, {}, resolve), true);
  });
  const second = new Promise((resolve) => {
    responses.push(resolve);
    assert.equal(onMessage({ type: "aiDebate:start", mode: "basic", question: "第二個" }, {}, resolve), true);
  });

  const secondResponse = await second;
  const firstResponse = await first;
  assert.equal(secondResponse.code, "BUSY");
  assert.equal(firstResponse.ok, false);
  assert.equal(storageData["aiDebate.currentState"].busy, false);
});

test("manual readiness never clears an active run state", async () => {
  const stored = {
    "aiDebate.currentState": {
      busy: false,
      status: "idle",
      phase: "idle",
      mode: "idle",
      errors: [],
      providerTabs: {},
      preflightResults: [],
      transcript: null,
      savedAt: Date.now(),
    },
  };
  let onMessage;
  const chrome = {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener(listener) { onMessage = listener; } },
      sendMessage() { return Promise.resolve(); },
    },
    storage: {
      local: {
        async get(key) { return { [key]: stored[key] }; },
        async set(values) { Object.assign(stored, values); },
        async remove(key) { delete stored[key]; },
      },
    },
  };
  globalThis.chrome = chrome;
  await import("../src/background/service-worker.js?readiness-busy-regression");

  const readiness = new Promise((resolve) => {
    assert.equal(onMessage({ type: "aiDebate:checkReadiness", provider: "grok" }, {}, resolve), true);
  });
  const start = new Promise((resolve) => {
    assert.equal(onMessage({ type: "aiDebate:start", mode: "basic", question: "" }, {}, resolve), true);
  });

  const response = await readiness;
  const startResponse = await start;
  assert.equal(response.ok, false);
  assert.equal(startResponse.ok, false);
  assert.equal(startResponse.code, "BUSY");
  assert.equal(stored["aiDebate.currentState"].busy, false);
});

test("reset survives storage quota failure and notifies only provider tabs", async () => {
  const stored = {
    "aiDebate.currentState": {
      busy: false,
      status: "idle",
      phase: "idle",
      mode: "idle",
      errors: [],
      providerTabs: { grok: 1 },
      savedAt: Date.now(),
    },
    "aiDebate.entitlementPlan": "pro",
  };
  const sent = [];
  let onMessage;
  const chrome = {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener(listener) { onMessage = listener; } },
      sendMessage() { return Promise.resolve(); },
    },
    storage: {
      local: {
        async get(key) { return { [key]: stored[key] }; },
        async set() { const error = new Error("QUOTA_BYTES"); error.code = "QUOTA_BYTES"; throw error; },
        async remove(key) { delete stored[key]; },
      },
    },
    tabs: {
      async get(tabId) { return { id: tabId, status: "loading", url: "https://grok.com/" }; },
      async query() {
        return [
          { id: 1, status: "loading", url: "https://grok.com/" },
          { id: 2, status: "complete", url: "https://example.com/" },
        ];
      },
      async sendMessage(tabId, message) {
        sent.push({ tabId, message });
        return { ok: true };
      },
    },
  };
  globalThis.chrome = chrome;
  await import("../src/background/service-worker.js?quota-abort-regression");

  const response = await new Promise((resolve) => {
    assert.equal(onMessage({ type: "aiDebate:reset" }, {}, resolve), true);
  });

  assert.equal(response.ok, true);
  assert.equal(response.state.entitlements.plan, "free");
  assert.deepEqual(sent, [{ tabId: 1, message: { type: "aiDebate:abortAutomation" } }]);
});

test("readiness falls back to a fresh provider tab when the requested tab is stale", async () => {
  const stored = { "aiDebate.currentState": undefined };
  let onMessage;
  let created = 0;
  const chrome = {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener(listener) { onMessage = listener; } },
      sendMessage() { return Promise.resolve(); },
    },
    storage: {
      local: {
        async get(key) { return { [key]: stored[key] }; },
        async set(values) { Object.assign(stored, values); },
        async remove(key) { delete stored[key]; },
      },
    },
    tabs: {
      async get(tabId) {
        if (tabId === 404) throw new Error("No such tab");
        return { id: tabId, status: "complete", url: "https://grok.com/" };
      },
      async create() { created += 1; return { id: 405 }; },
      async update() {},
      async sendMessage(_tabId, message) {
        if (message.type === "aiDebate:getCapabilities") {
          return { contentScriptVersion: "0.5.0-readiness.4" };
        }
        return { ready: true, status: "ready", checks: {} };
      },
    },
    scripting: { async executeScript() {} },
  };
  globalThis.chrome = chrome;
  await import("../src/background/service-worker.js?stale-readiness-regression");

  const response = await new Promise((resolve) => {
    assert.equal(onMessage({ type: "aiDebate:checkReadiness", provider: "grok", tabId: 404 }, {}, resolve), true);
  });

  assert.equal(response.ok, true);
  assert.equal(response.code, "READY");
  assert.equal(response.tabId, 405);
  assert.equal(created, 1);
});
test("unbound providers always open a fresh tab while explicit bindings are reused", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");
  const helperStart = script.indexOf("async function getOrCreateProviderTab");
  const helper = script.slice(
    helperStart,
    script.indexOf("async function activateProviderTab(", helperStart),
  );

  assert.match(helper, /candidateTabIds\.push\(options\.preferredTabId\)[\s\S]*candidateTabIds\.push\(boundTabId\)[\s\S]*for \(const candidateTabId of candidateTabIds\)/);
  assert.ok(helper.includes("chrome.tabs.create({ url: provider.startUrl, active: true })"));
  assert.equal(helper.includes("chrome.tabs.query"), false);
  assert.ok(helper.indexOf("for (const candidateTabId of candidateTabIds)") < helper.indexOf("chrome.tabs.create"));
});

test("provider abort and cleanup messages cannot block control operations forever", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");
  const notifyStart = script.indexOf("async function notifyProviderAbortOperations");
  const notify = script.slice(notifyStart, script.indexOf("async function finishWithError", notifyStart));

  assert.match(script, /const PROVIDER_CONTROL_TIMEOUT_MS = 3000/);
  assert.equal((notify.match(/withProviderControlTimeout\(/g) || []).length, 3);
  assert.match(notify, /Promise\.race\(\[promise, timeout\]\)/);
  assert.match(notify, /clearTimeout\(timeoutId\)/);
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
