import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { DebateEngine } from "../src/background/debateEngine.js";
import { buildContinuationDraft, isRecoverableReply, MAX_MANUAL_REPLY_CHARS, pendingReplyRepairs } from "../src/shared/meetingRecovery.js";
import { PROVIDERS, isProviderId, normalizeProviderIds, providerLabel } from "../src/shared/providers.js";
import { shouldShowChatControls } from "../src/sidepanel/modeRules.js";
import { boundRecoveryPrompts, forgetRecoveryPrompt } from "../src/shared/recoveryPrompts.js";
import { recoverSession } from "../src/background/sessionRecovery.js";

test("departure resolves every fault slot for only that provider without deleting history", () => {
  const state = {departedProviders: ["grok"], transcript: {answers: {grok: "[錯誤：額度用完]", meta: "[錯誤：寫入失敗]"},
    critiqueRounds: [{grok: "[錯誤：等待回覆逾時]"}]}, summaries: {grok: "[服務狀態：額度用完]"}};
  assert.deepEqual(pendingReplyRepairs(state).map(p => p.provider), ["meta"]);
  assert.equal(state.transcript.answers.grok, "[錯誤：額度用完]");
  const restored = {...state, departedProviders: [], transcript: {...state.transcript, departedProviders: ["grok"]}};
  assert.deepEqual(pendingReplyRepairs(restored).map(p => p.provider), ["meta"]);
});

function failedMeeting(round = 7) {
  const engine = new DebateEngine(["chatgpt", "grok"], "chatgpt", 1, { openEnded: true });
  engine.start("原本的題目");
  engine.recordAnswer("chatgpt", "首輪 A");
  engine.recordAnswer("grok", "首輪 B");
  for (let i = 1; i <= round; i++) {
    if (i > 1) engine.addChatRound();
    engine.recordCritique("chatgpt", `GPT 第 ${i} 輪`, i);
    engine.recordCritique("grok", `Grok 第 ${i} 輪`, i);
  }
  engine.markProviderError("chatgpt", `critique-${round}`, "[送出提示] ChatGPT 未確認送出");
  return engine;
}

test("pending repairs include every fault stage and ignore quoted error text in valid replies", () => {
  const state = { transcript: { answers: { chatgpt: "無法載入這則回覆", gemini: "有人提到無法載入這則回覆，但這是有效回答。" },
    critiqueRounds: [{ grok: "[錯誤：未確認送出]" }], reveal: { reactions: { claude: "[服務狀態：讀取失敗]" } } },
    summaries: { meta: "[服務狀態：未取得總結]" }, sourceProvider: "chatgpt", sourceSummary: "[錯誤：來源失敗]" };
  assert.deepEqual(pendingReplyRepairs(state).map(({ provider, phase }) => [provider, phase]), [
    ["chatgpt", "first-round"], ["grok", "critique"], ["meta", "summary"], ["chatgpt", "source-summary"], ["claude", "reveal"],
  ]);
  assert.deepEqual(pendingReplyRepairs({ ...state, repairDiscarded: true }), []);
});

test("manual repair targets round seven and its complete text reaches the next prompt after restore", () => {
  const engine = failedMeeting();
  const before = engine.snapshot();
  const reply = "補回的完整回答\n另一段理由與最後一句。";
  engine.repairProviderReply({ provider: "chatgpt", phase: "critique-7", content: reply,
    expectedContent: before.critiqueRounds[6].chatgpt, sessionId: before.sessionId });
  const restored = DebateEngine.restore(engine.snapshot());
  const next = restored.addChatRound("接著聊");
  const jobs = restored.buildUserMessageJobs("接著聊", next);
  const peerPrompt = jobs.find(({ provider }) => provider === "grok").prompt;
  assert.ok(peerPrompt.includes("補回的完整回答") && peerPrompt.includes("另一段理由與最後一句。"));
  assert.equal(restored.snapshot().critiqueRounds[5].chatgpt, "GPT 第 6 輪");
  assert.equal(restored.snapshot().manualRepairs[0].source, "manual");
  assert.equal(restored.snapshot().errors[0].resolvedManually, true);
});

test("manual repair refuses a stale meeting, changed slot, non-error, or oversized paste without mutation", () => {
  const engine = failedMeeting();
  const original = engine.snapshot();
  const request = { provider: "chatgpt", phase: "critique-7", content: "補入",
    expectedContent: original.critiqueRounds[6].chatgpt, sessionId: original.sessionId };
  for (const override of [{ sessionId: "other" }, { phase: "critique-6" }, { expectedContent: "changed" },
    { content: "" }, { content: "a".repeat(MAX_MANUAL_REPLY_CHARS + 1) }, { content: "[錯誤：test]" }, { provider: "meta" }]) {
    assert.throws(() => engine.repairProviderReply({ ...request, ...override }));
    assert.deepEqual(engine.snapshot(), original);
  }
  engine.repairProviderReply(request);
  assert.throws(() => engine.repairProviderReply(request), /不是故障回覆/);
});

test("first-round manual repair supports legacy snapshots and anonymous speaker names", () => {
  const engine = new DebateEngine(["chatgpt", "grok"], "grok", 1, { summaryStrategy: "allAnonymous" });
  engine.start("test");
  engine.markProviderError("chatgpt", "first-round", "未確認送出");
  engine.recordAnswer("grok", "首輪");
  const snapshot = engine.snapshot();
  delete snapshot.sessionId;
  const restored = DebateEngine.restore(snapshot);
  restored.repairProviderReply({ provider: "chatgpt", phase: "first-round", content: "我的暱稱是：小羊\n回答已補入",
    expectedContent: snapshot.answers.chatgpt, sessionId: restored.snapshot().sessionId });
  assert.equal(restored.snapshot().answers.chatgpt, "我的暱稱是：小羊\n回答已補入");
  assert.ok(restored.snapshot().sessionId);
});

test("continuation copies each successful reply once, retains user's words, and rejects empty/oversized drafts", () => {
  const replies = [{ ok: true, provider: "chatgpt", content: "完整 GPT 回答\n最後一句" },
    { ok: false, provider: "grok", error: "失敗" }, { ok: true, provider: "gemini", content: "完整 Gemini 回答" }];
  const draft = buildContinuationDraft(replies, "我的新想法");
  assert.equal(draft.split("完整 GPT 回答").length - 1, 1);
  assert.ok(draft.includes("最後一句") && draft.endsWith("我的新想法"));
  assert.ok(!draft.includes("失敗"));
  assert.equal(buildContinuationDraft(replies, "我的新想法"), draft);
  assert.throws(() => buildContinuationDraft([]), /沒有可接續/);
  assert.throws(() => buildContinuationDraft([{ ok: true, provider: "chatgpt", content: "a".repeat(60000) }]), /超過/);
});

const source = await readFile("src/background/service-worker.js", "utf8");
const recoverySource = source.slice(source.indexOf("async function captureLinkedReplies"), source.indexOf("function validateNextRound"));

test("automatic resume rejects cancelled tokens or a cleared pause before changing state", async () => {
  const body = source.slice(source.indexOf("async function resumeRepairedMeeting"), source.indexOf("function recordProviderResult"));
  const cancelled = () => Object.assign(new Error("cancelled"), { code: "RUN_CANCELLED" });
  const original = { status: "idle", repairPause: null };
  const context = vm.createContext({ runtimeState: original, createRunCancelledError: cancelled,
    runController: { assertCurrent() { throw cancelled(); } } });
  vm.runInContext(body, context);
  await assert.rejects(context.resumeRepairedMeeting(1), { code: "RUN_CANCELLED" });
  assert.equal(context.runtimeState, original);
  context.runController.assertCurrent = () => {};
  await assert.rejects(context.resumeRepairedMeeting(1), { code: "RUN_CANCELLED" });
  assert.equal(context.runtimeState, original);
});

test("reading state cannot overwrite a completed auto-resume with an older busy snapshot", async () => {
  const body = source.slice(source.indexOf("async function getRuntimeState"), source.indexOf("function resumeCompletedRepairIfReady"));
  let resolveEntitlements;
  let signalReadStarted;
  const readStarted = new Promise((resolve) => { signalReadStarted = resolve; });
  const context = vm.createContext({ runtimeState: { status: "running", busy: true },
    ensureRuntimeStateRetention: async () => {}, getEntitlements: () => new Promise((resolve) => {
      resolveEntitlements = resolve; signalReadStarted();
    }) });
  vm.runInContext(body, context);
  const pending = context.getRuntimeState();
  await readStarted;
  context.runtimeState = { status: "done", busy: false, summary: "已完成" };
  resolveEntitlements({ plan: "free" });
  const state = await pending;
  assert.equal(state.status, "done");
  assert.equal(state.busy, false);
  assert.equal(state.summary, "已完成");
});

function runtimeHarness(overrides = {}) {
  const context = vm.createContext({
    DebateEngine, PROVIDERS, isProviderId, normalizeProviderIds, providerLabel, isRecoverableReply, MAX_MANUAL_REPLY_CHARS, pendingReplyRepairs, forgetRecoveryPrompt,
    runtimeState: { transcript: failedMeeting().snapshot(), errors: [], busy: false, mode: "fast", summary: "舊總結", summaries: { chatgpt: "舊總結" } },
    runController: { assertCurrent() {} },
    getCurrentActiveTab: async () => ({ id: 99 }),
    restoreActiveTab: async () => {}, activateProviderTabForReadiness: async () => {},
    ensureProviderContentScript: async () => {}, providerRpc: (promise) => promise,
    publishState: async () => {}, READINESS_TIMEOUT_MS: 15000,
    isProviderTabReady: () => true, isProviderLoginTab: () => false,
    isRunCancelledError: (error) => error.code === "RUN_CANCELLED",
    chrome: { tabs: { get: async (id) => ({ id, url: "https://chatgpt.com/", status: "complete" }),
      sendMessage: async () => ({ ok: true, content: "目前的完整回答" }) } },
    ...overrides,
  });
  vm.runInContext(recoverySource, context);
  return context;
}

test("capture only reads explicitly linked active tabs and restores the active tab on partial failure", async () => {
  const messages = [];
  let restored;
  const context = runtimeHarness({
    runtimeState: { transcript: null, errors: [], busy: false },
    restoreActiveTab: async (tab) => { restored = tab.id; },
    chrome: { tabs: { get: async (id) => ({ id }), sendMessage: async (id, payload) => {
      messages.push({ id, payload });
      return id === 8 ? { ok: false, error: "AI 還在生成" } : { ok: true, content: "完整回答" };
    } } },
  });
  const replies = await context.captureLinkedReplies({ activeProviders: ["chatgpt", "grok"], hookedTabs: { chatgpt: 7, grok: 8, meta: 9 } }, 1);
  assert.deepEqual(messages.map(({ id }) => id), [7, 8]);
  assert.ok(messages.every(({ payload }) => payload.type === "aiDebate:readCurrentReply" && !payload.prompt));
  assert.equal(replies[0].content, "完整回答");
  assert.equal(replies[1].ok, false);
  assert.equal(restored, 99);
});

test("manual repair updates runtime, invalidates the old summary, and opens continued discussion", async () => {
  const context = runtimeHarness();
  const before = context.runtimeState.transcript;
  const result = await context.repairMeetingReply({ sessionId: before.sessionId, originalQuestion: before.originalQuestion,
    provider: "chatgpt", phase: "critique-7", expectedContent: before.critiqueRounds[6].chatgpt, content: "完整補入內容" }, 1);
  assert.equal(result.ok, true);
  assert.equal(context.runtimeState.transcript.critiqueRounds[6].chatgpt, "完整補入內容");
  assert.equal(context.runtimeState.summary, "");
  assert.equal(context.runtimeState.phase, "waiting_for_user");
  assert.equal(shouldShowChatControls("fast", context.runtimeState), true);
  const stale = { ...before, sessionId: "wrong" };
  await assert.rejects(context.repairMeetingReply({ sessionId: stale.sessionId }, 1), /會議已變更/);
});

function persistedSnapshot(state) {
  const context = vm.createContext({ boundRecoveryPrompts, isProviderId });
  for (const name of ["MAX_PERSISTED_TRANSCRIPT_CHARS", "MAX_PERSISTED_TEXT_CHARS", "MAX_DEBUG_EVENTS"]) {
    vm.runInContext(source.match(new RegExp(`const ${name} = \\d+;`))[0], context);
  }
  vm.runInContext(source.slice(source.indexOf("export function createBoundedPersistedState"),
    source.indexOf("async function setProviderDiagnostic")).replace("export function", "function"), context);
  return JSON.parse(JSON.stringify(context.createBoundedPersistedState(state)));
}

for (const phase of ["critique-7", "summary", "source-summary"]) {
  test(`manual ${phase} repair survives persisted question compaction in either direction`, async () => {
    const transcript = failedMeeting().snapshot();
    transcript.originalQuestion = "公開合成長題目".repeat(3000);
    const fault = "[服務狀態：總結讀取失敗]";
    const full = { transcript, errors: [], busy: false, mode: "fast", savedAt: Date.now(),
      summaries: { chatgpt: fault }, sourceProvider: "chatgpt", sourceSummary: fault };
    const persisted = persistedSnapshot(full);
    assert.notEqual(persisted.transcript.originalQuestion, transcript.originalQuestion);
    assert.equal(persisted.transcript.sessionId, transcript.sessionId);
    const restored = recoverSession(persisted, () => ({})).state;
    for (const [visible, runtime] of [[full, restored], [persisted, full]]) {
      const context = runtimeHarness({ runtimeState: structuredClone(runtime) });
      const expectedContent = phase === "critique-7" ? visible.transcript.critiqueRounds[6].chatgpt : fault;
      const result = await context.repairMeetingReply({ sessionId: visible.transcript.sessionId,
        originalQuestion: visible.transcript.originalQuestion, provider: "chatgpt", phase,
        expectedContent, content: "完整補回內容" }, 1);
      assert.equal(result.ok, true);
      const current = context.runtimeState;
      assert.equal(phase === "critique-7" ? current.transcript.critiqueRounds[6].chatgpt :
        phase === "source-summary" ? current.sourceSummary : current.summaries.chatgpt, "完整補回內容");
      assert.equal(current.transcript.sessionId, transcript.sessionId);
    }
  });
}

test("runtime repair rejects missing identity, a different meeting with the same question, and changed fault slots", async () => {
  for (const override of [{ sessionId: undefined }, { sessionId: "" }, { sessionId: "other-meeting" },
    { expectedContent: "[錯誤：另一段故障]" }, { phase: "critique-6" }, { provider: "grok" }]) {
    const context = runtimeHarness();
    const before = structuredClone(context.runtimeState);
    const transcript = before.transcript;
    await assert.rejects(context.repairMeetingReply({ sessionId: transcript.sessionId,
      originalQuestion: transcript.originalQuestion, provider: "chatgpt", phase: "critique-7",
      expectedContent: transcript.critiqueRounds[6].chatgpt, content: "必須保留的草稿", ...override }, 1));
    assert.equal(JSON.stringify(context.runtimeState), JSON.stringify(before));
  }
});

test("repairing a historical fault during a summary pause preserves collected judge replies", async () => {
  const context = runtimeHarness();
  const before = context.runtimeState.transcript;
  context.runtimeState.repairPause = { target: "summary", remainingJobs: [], resumePlan: { type: "summary" } };
  context.runtimeState.summaries = { chatgpt: "已成功的裁判總結", grok: "[服務狀態：總結讀取失敗]" };
  await context.repairMeetingReply({ sessionId: before.sessionId, originalQuestion: before.originalQuestion,
    provider: "chatgpt", phase: "critique-7", expectedContent: before.critiqueRounds[6].chatgpt, content: "完整补回互評" }, 1);
  assert.equal(context.runtimeState.summaries.chatgpt, "已成功的裁判總結");
  assert.equal(context.runtimeState.summaries.grok, "[服務狀態：總結讀取失敗]");
  assert.equal(pendingReplyRepairs(context.runtimeState).length, 1);
  assert.equal(context.runtimeState.phase, "waiting_for_user");
});

test("capture cancellation sends no prompt and restores focus", async () => {
  let restored = false;
  let checks = 0;
  const context = runtimeHarness({
    runtimeState: { transcript: null, errors: [], busy: false },
    runController: { assertCurrent() { if (++checks > 1) throw Object.assign(new Error("cancelled"), { code: "RUN_CANCELLED" }); } },
    restoreActiveTab: async () => { restored = true; },
  });
  await assert.rejects(context.captureLinkedReplies({ activeProviders: ["chatgpt", "grok"], hookedTabs: { chatgpt: 7 } }, 1), /cancelled/);
  assert.equal(restored, true);
});
