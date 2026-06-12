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
