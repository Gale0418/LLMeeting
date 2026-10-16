import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { updateProviderDiagnostic } from "../src/background/diagnostics.js";
import { createStateStorageQueue, safePersistState } from "../src/background/statePersistence.js";
import { boundRecoveryPrompts, rememberRecoveryPrompt } from "../src/shared/recoveryPrompts.js";
import { isProviderId } from "../src/shared/providers.js";

const source = await readFile("src/background/service-worker.js", "utf8");
const page = await readFile("src/content/provider-page.js", "utf8");
const section = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));

function clockHarness(script, extras = {}) {
  const clock = { now: 0, delays: [] };
  const context = vm.createContext({ Date: { now: () => clock.now }, ...extras,
    delay: async ms => { assert.ok(ms > 0); clock.delays.push(ms); clock.now += ms; } });
  vm.runInContext(script, context);
  return { context, clock };
}

const pollingSource = section(page, "  async function waitFor(getValue", "  function delay(ms)");
for (const name of ["waitFor", "waitForOptional"]) {
  test(`${name} detects a newly rendered control within 50ms and backs off on slow pages`, async () => {
    const { context, clock } = clockHarness(pollingSource);
    const control = { ready: true };
    const wait = (getter, timeout) => name === "waitFor" ? context[name](getter, timeout, "missing") : context[name](getter, timeout);
    assert.equal(await wait(() => control, 3000), control);
    assert.equal(clock.delays.length, 0);
    assert.equal(await wait(() => clock.now >= 75 ? control : null, 3000), control);
    assert.equal(clock.now, 100); // Previous fixed polling would detect it at 250ms.
    clock.now = 0; clock.delays.length = 0;
    assert.equal(await wait(() => clock.now >= 1100 ? control : null, 3000), control);
    assert.equal(clock.now, 1250);
    assert.equal(clock.delays.filter(ms => ms === 50).length, 20);
    assert.equal(clock.delays.at(-1), 250);
  });

  test(`${name} respects the timeout budget and cancellation`, async () => {
    const { context, clock } = clockHarness(pollingSource);
    const wait = abort => name === "waitFor" ? context[name](() => null, 125, "missing", abort) : context[name](() => null, 125, abort);
    if (name === "waitFor") await assert.rejects(wait(() => {}), /missing/);
    else assert.equal(await wait(() => {}), null);
    assert.equal(clock.now, 125);
    clock.now = 0;
    await assert.rejects(wait(() => { if (clock.now >= 50) throw new Error("cancelled"); }), /cancelled/);
    assert.equal(clock.now, 50);
  });
}

test("new tab detection checks early, backs off, and retains the 45 second deadline", async () => {
  const script = section(source, "async function waitForProviderTab(", "async function refreshOverloadedProvider");
  let readyAt = 175;
  const { context, clock } = clockHarness(script, {
    chrome: { tabs: { get: async id => ({ id, status: clock.now >= readyAt ? "complete" : "loading" }) } },
    isProviderTabReady: tab => tab.status === "complete",
  });
  assert.equal((await context.waitForProviderTab(7, { label: "Synthetic" })).id, 7);
  assert.equal(clock.now, 200); // Previous fixed polling would detect it at 500ms.
  clock.now = 0; clock.delays.length = 0; readyAt = Infinity;
  await assert.rejects(context.waitForProviderTab(7, { label: "Synthetic" }), /尚未就緒/);
  assert.equal(clock.now, 45000);
  assert.equal(clock.delays.filter(ms => ms === 100).length, 20);
  assert.ok(clock.delays.includes(500));
});

function submissionHarness({ holdWrite, cancelOnTab = false } = {}) {
  const writes = [], sends = [], broadcasts = [], sequence = [];
  let cancelled = false, release;
  const held = new Promise(resolve => { release = resolve; });
  const job = { provider: "chatgpt", phase: "critique-4", round: 4, prompt: "Exact synthetic prompt\n完整原文" };
  const { context, clock } = clockHarness("", {
    JSON, Number, isProviderId, updateProviderDiagnostic, rememberRecoveryPrompt, boundRecoveryPrompts,
    enqueueStateStorage: createStateStorageQueue(), safePersistState,
    STORAGE_KEY: "test-state", MAX_DEBUG_EVENTS: 100, MAX_PERSISTED_TEXT_CHARS: 12000, MAX_PERSISTED_TRANSCRIPT_CHARS: 120000,
    lifecycleRevision: 0,
    runtimeState: { recoveryPrompts: {}, providerDiagnostics: {}, providerTabs: {}, errors: [], savedAt: 1 },
    runController: { assertCurrent() { if (cancelled) throw Object.assign(new Error("cancelled"), { code: "RUN_CANCELLED" }); }, isCurrent: () => !cancelled },
    getOrCreateProviderTab: async () => { if (cancelOnTab) cancelled = true; return { id: 7, url: "https://chatgpt.com/" }; },
    createRunId: () => "test-run", providerLabel: () => "Synthetic", phaseLabel: () => "Synthetic",
    createWorkflowCheckpoint: (stage, job, extra) => ({ stage, ...job, ...extra }),
    sendProviderMessage: async (...args) => { sequence.push("send"); sends.push(args); return { ok: true, runId: "test-run" }; },
    isRunCancelledError: error => error.code === "RUN_CANCELLED",
    chrome: {
      tabs: { update: async () => {}, get: async id => ({ id, active: true, status: "complete" }) },
      runtime: { sendMessage: async message => { broadcasts.push(message); } },
      storage: { local: { set: async payload => {
        writes.push(JSON.parse(JSON.stringify(payload["test-state"])));
        sequence.push(`write:${writes.length}`);
        if (writes.length === holdWrite) await held;
      } } },
    },
  });
  vm.runInContext([
    section(source, "async function submitProviderJob(", "async function collectProviderJob("),
    section(source, "async function activateProviderTabForReadiness(", "async function restoreActiveTab("),
    section(source, "async function publishState(", "async function setProviderDiagnostic(").replace("export function", "function"),
    section(source, "async function setProviderDiagnostic(", "async function getRuntimeState("),
  ].join("\n"), context);
  return { context, clock, job, writes, sends, broadcasts, sequence, release, cancel: () => { cancelled = true; } };
}

test("ready tab submission uses two durable writes before sending and retains exact recovery data", async () => {
  const h = submissionHarness();
  assert.equal((await h.context.submitProviderJob(h.job, 1)).ok, true);
  const sendIndex = h.sequence.indexOf("send");
  assert.deepEqual(h.sequence.slice(0, sendIndex), ["write:1", "write:2"]);
  assert.equal(h.writes[0].recoveryPrompts.chatgpt.prompt, h.job.prompt);
  assert.equal(h.writes[1].workflowCheckpoint.stage, "submitting");
  assert.equal(h.writes[1].workflowCheckpoint.prompt, h.job.prompt);
  assert.equal(h.writes[1].providerDiagnostics.chatgpt.tabId, 7);
  assert.equal(h.clock.delays[0], 200); // Foreground paint window, previously 750ms.
  assert.equal(h.sends.length, 1);
});

for (const holdWrite of [1, 2]) {
  test(`submission cannot pass pending durable write ${holdWrite}; cancellation prevents dispatch`, async () => {
    const h = submissionHarness({ holdWrite });
    const run = h.context.submitProviderJob(h.job, 1);
    // Drain microtasks until the selected storage call is in flight.
    for (let turns = 0; turns < 50 && h.writes.length < holdWrite; turns++) await Promise.resolve();
    assert.equal(h.writes.length, holdWrite);
    assert.equal(h.sends.length, 0);
    h.cancel(); h.release();
    await assert.rejects(run, { code: "RUN_CANCELLED" });
    assert.equal(h.sends.length, 0);
  });
}

test("cancelling while obtaining the tab leaves its diagnostic and dispatch untouched", async () => {
  const h = submissionHarness({ cancelOnTab: true });
  await assert.rejects(h.context.submitProviderJob(h.job, 1), { code: "RUN_CANCELLED" });
  assert.equal(h.context.runtimeState.providerDiagnostics.chatgpt.stage, "opening-tab");
  assert.equal(h.sends.length, 0);
});
