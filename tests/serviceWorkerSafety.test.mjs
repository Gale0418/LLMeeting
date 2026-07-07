import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
