import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { shouldShowChatControls } from "../src/sidepanel/modeRules.js";
import { uiText, setLocale, t } from "../src/shared/i18n.js";
import { localizedFeatureLabel } from "../src/shared/i18n-catalog.js";

const source = await readFile("src/sidepanel/app.js", "utf8");

test("badge and feature-unavailable messages stay in the selected language", () => {
  try {
    for (const [locale, label] of [["zh_TW", "免費"], ["en", "Free"], ["ja", "無料"]]) {
      setLocale(locale);
      const badge = {textContent: "", setAttribute() {}};
      const context = vm.createContext({planBadge: badge, currentEntitlements: {sheepMode: false}, uiText,
        renderDebateModeState() {}, renderSummaryStrategyState() {}, currentLocale: locale, t, localizedFeatureLabel});
      const render = source.slice(source.indexOf("function renderEntitlementState("), source.indexOf("function renderDebateModeState("));
      const unavailable = source.match(/function localizedUnavailableMessage\([^]*?\n\}/)[0];
      vm.runInContext(render + unavailable, context);
      context.renderEntitlementState();
      assert.equal(badge.textContent, label);
      const message = context.localizedUnavailableMessage("fastDebate");
      assert.ok(message.includes(localizedFeatureLabel("fastDebate", locale)));
      if (locale !== "zh_TW") assert.doesNotMatch(message, /快速鬥技場|目前無法使用/);
    }
  } finally {setLocale("en");}
});

test("fault controls offer departure and departed faults have no repeat actions", () => {
  const body = source.slice(source.indexOf("function replyRecoveryControls"), source.indexOf("function renderReplyRecoveryNotice"));
  const context = {isRecoverableReply: s => /^\[錯誤/.test(s), escapeHTML: s => s, recoveryActionPending: false};
  vm.createContext(context);
  vm.runInContext(`${body}\nglobalThis.controls = replyRecoveryControls;`, context);
  assert.match(context.controls({}, "grok", "critique", "[錯誤：額度用完]"), /data-depart-provider="grok"/);
  const departed = context.controls({departedProviders: ["grok"]}, "grok", "critique", "[錯誤：額度用完]");
  assert.match(departed, /已離席/);
  assert.doesNotMatch(departed, /data-depart|data-repair/);
  assert.match(context.controls({busy: true}, "grok", "critique", "[錯誤：額度用完]"), /data-depart-phase="critique" disabled/);
});
const section = source.slice(source.indexOf("let chatActionPending"), source.indexOf("chatSendBtn?.addEventListener"));

test("failed provider preference persistence gives visible feedback and preserves chosen settings", async () => {
  const messages = [];
  let savedSelection;
  const context = {
    providerSelectionWrite: Promise.resolve(),
    selectedProviderIds: () => ["gemini", "meta"],
    PROVIDER_SELECTION_STORAGE_KEY: "prefs",
    chrome: { storage: { local: { async set(values) { savedSelection = values.prefs; throw new Error("quota"); } } } },
    renderMessage: (message) => messages.push(message),
  };
  vm.createContext(context);
  const body = source.slice(source.indexOf("async function persistProviderSelection"), source.indexOf("async function toggleProvider"));
  vm.runInContext(`${body}\nglobalThis.save = persistProviderSelection;`, context);
  await context.save();
  assert.deepEqual(savedSelection, ["gemini", "meta"]);
  assert.match(messages[0], /未能保存/);
});

test("anonymous UI fallback does not encode a fixed provider index", () => {
  const body = source.slice(source.indexOf("function meetingSpeakerLabel"), source.indexOf("function safeProviderClass"));
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${body}\nglobalThis.label = meetingSpeakerLabel;`, context);
  assert.equal(context.label({ summaryStrategy: "allAnonymous" }, "meta"), "匿名參與者（暱稱未取得）");
  assert.equal(context.label({ summaryStrategy: "allAnonymous", transcript: { anonymousNames: { meta: "小羊" } } }, "meta"), "小羊");
});

test("waiting focus moves only on entering the waiting phase, not on repeated state updates", () => {
  assert.match(source, /const wasWaiting = latestState\?\.phase === "waiting_for_user"/);
  assert.match(source, /if \(!wasWaiting\) chatInput\.focus\(\)/);
});

test("repair pauses show the interactive controls even in fast mode", () => {
  assert.equal(shouldShowChatControls("fast", {
    mode: "fast", phase: "waiting_for_user", repairPause: { target: "answer" },
  }), true);
  assert.match(source, /chatCritiqueBtn\.textContent = uiText\(isRepairPaused \? "繼續原流程" : "再互評"\)/);
  assert.match(source, /chatCritiqueBtn\?\.addEventListener\("click", \(\) => sendChatAction\(latestState\?\.repairPause \? "resume" : "critique"\)\)/);
});

test("manual reply lookup uses the exact answer, critique, summary, or reveal stage", () => {
  const body = source.slice(source.indexOf("function manualReplyContent"), source.indexOf("function manualReplyPhaseLabel"));
  const context = { isCritiquePhase: (phase) => phase === "critique" || /^critique-\d+$/.test(phase) };
  vm.createContext(context);
  vm.runInContext(`${body}\nglobalThis.get = manualReplyContent;`, context);
  const state = {
    summaryProvider: "gemini",
    transcript: {
      answers: { chatgpt: "[錯誤：答案]" },
      critiqueRounds: [{ gemini: "[錯誤：互評]" }],
      reveal: { reactions: { claude: "[錯誤：揭曉]" } },
    },
    summaries: { gemini: "[錯誤：總結]" },
  };
  assert.equal(context.get(state, "chatgpt", "first-round"), "[錯誤：答案]");
  assert.equal(context.get(state, "gemini", "critique"), "[錯誤：互評]");
  assert.equal(context.get(state, "gemini", "summary"), "[錯誤：總結]");
  assert.equal(context.get(state, "claude", "reveal"), "[錯誤：揭曉]");
  assert.equal(context.get(state, "chatgpt", "critique"), "");
});

test("recovery controls preserve summary and reveal phase identifiers", () => {
  const body = source.slice(source.indexOf("function replyRecoveryControls"), source.indexOf("function renderReplyRecoveryNotice"));
  const context = {
    recoveryActionPending: false,
    isRecoverableReply: (text) => typeof text === "string" && text.startsWith("[錯誤："),
    escapeHTML: (text) => String(text),
  };
  vm.createContext(context);
  vm.runInContext(`${body}\nglobalThis.render = replyRecoveryControls;`, context);
  const state = { busy: false, transcript: {} };
  assert.match(context.render(state, "gemini", "summary", "[錯誤：總結]"), /data-repair-phase="summary"/);
  assert.match(context.render(state, "claude", "reveal", "[錯誤：揭曉]"), /data-repair-phase="reveal"/);
});

test("a repaired reply retains the latest original fault as escaped visible evidence", () => {
  const body = source.slice(source.indexOf("function replyRecoveryControls"), source.indexOf("function renderReplyRecoveryNotice"));
  const escapeHTML = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const context = vm.createContext({ recoveryActionPending: false, escapeHTML, isRecoverableReply: () => false });
  vm.runInContext(`${body}\nglobalThis.render = replyRecoveryControls;`, context);
  const state = { transcript: { manualRepairs: [
    { provider: "meta", phase: "critique-2", originalError: "舊故障" },
    { provider: "meta", phase: "critique-2", originalError: "[錯誤：等待回覆逾時] <script>" },
  ] } };
  const html = context.render(state, "meta", "critique-2", "已補入正文");
  assert.match(html, /查看原故障/);
  assert.match(html, /等待回覆逾時/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /舊故障|<script>/);
});

test("repair pauses disable new meetings and continuation capture but leave reset available", () => {
  assert.match(source, /latestState\?\.repairPause \|\| hasPendingReplyRepairs\(latestState\)/);
  assert.match(source, /captureLinkedRepliesBtn\.disabled = disabled \|\| repairBlocked/);
  const buttonDisabling = source.slice(source.indexOf("function setActionButtonsDisabled"), source.indexOf("function meetingSpeakerLabel"));
  assert.doesNotMatch(buttonDisabling, /resetButton\.disabled\s*=/);
  assert.match(source, /if \(latestState\?\.repairPause\) \{[\s\S]*?action !== "resume"/);
});

test("re-enabling action buttons after a paste keeps supplement and summary locked until resume", () => {
  const body = source.slice(source.indexOf("function setActionButtonsDisabled"), source.indexOf("function meetingSpeakerLabel"));
  const context = { recoveryActionPending: false, latestState: { phase: "waiting_for_user", repairPause: {} },
    hasPendingReplyRepairs: () => false, basicDebateButton: {}, captureLinkedRepliesBtn: {}, cancelContinuationBtn: {},
    chatSendBtn: {}, chatCritiqueBtn: {}, chatSummarizeBtn: {}, checkReadinessButton: {},
    providerToggleEls: [], advancedControlEls: [] };
  vm.createContext(context);
  vm.runInContext(`${body}\nglobalThis.update = setActionButtonsDisabled;`, context);
  context.update(false);
  assert.equal(context.chatCritiqueBtn.disabled, false);
  assert.equal(context.chatSendBtn.disabled, true);
  assert.equal(context.chatSummarizeBtn.disabled, true);
  assert.equal(context.basicDebateButton.disabled, true);
  context.hasPendingReplyRepairs = () => true;
  context.update(false);
  assert.equal(context.chatCritiqueBtn.disabled, true);
});

test("plain text reveal fallback also avoids provider order labels", () => {
  const body = source.slice(source.indexOf("function buildTranscriptText"));
  assert.doesNotMatch(body, /`參與者 \$\{index \+ 1\}`/);
  assert.match(body, /state\.reveal\.anonymous \? \(anonymousLabel \|\| "匿名參與者（暱稱未取得）"\)/);
});

function harness(sendMessage) {
  const messages = [];
  const context = {
    recoveryActionPending: false,
    latestState: { busy: false },
    hasPendingReplyRepairs: () => false,
    chatInput: { value: "保留這段插話" },
    chatControls: { style: {} },
    chrome: { runtime: { sendMessage } },
    renderState(state) { context.latestState = state; },
    renderMessage(message) { messages.push(message); },
    renderDebateModeState() { context.chatControls.style.display = "block"; },
  };
  vm.createContext(context);
  vm.runInContext(`${section}\nglobalThis.send = sendChatAction;`, context);
  return { context, messages };
}

test("a lost receipt reconciles the running meeting without sending the action twice", async () => {
  const sent = [];
  const state = { busy: true, mode: "fast", question: "這場會議", phase: "critique" };
  const { context } = harness(async (message) => {
    sent.push(message.type);
    if (message.type === "aiDebate:getState") return { ok: true, state };
    throw new Error("The message channel closed before a response was received");
  });
  const result = await context.sendControlRequest({ type: "aiDebate:start", mode: "fast", question: "這場會議" });
  assert.equal(result.ok, true);
  assert.equal(result.transportRecovered, true);
  assert.equal(result.state, state);
  assert.deepEqual(sent, ["aiDebate:start", "aiDebate:getState"]);
});

test("accepted receipts refresh state instead of replacing a newer completion with busy state", async () => {
  const { context } = harness(async (message) => message.type === "aiDebate:getState"
    ? { ok: true, state: { busy: false, status: "done" } }
    : { ok: true, accepted: true, state: { busy: true, status: "running" } });
  const result = await context.sendControlRequest({ type: "aiDebate:start" });
  assert.equal(result.state.status, "done");
  assert.equal(result.state.busy, false);
});

test("failed user action with a state snapshot preserves the draft and displays its error", async () => {
  const { context, messages } = harness(async () => ({ ok: false, state: { busy: false }, error: "BUSY" }));
  await context.send("user_message", context.chatInput.value);
  assert.equal(context.chatInput.value, "保留這段插話");
  assert.deepEqual(messages, ["BUSY"]);
  assert.equal(context.chatControls.style.display, "block");
});

test("successful user action clears only the draft it actually submitted", async () => {
  const { context } = harness(async () => ({ ok: true, state: { busy: false } }));
  await context.send("user_message", context.chatInput.value);
  assert.equal(context.chatInput.value, "");
  context.chatInput.value = "另一段尚未送出的文字";
  await context.send("user_message", "先前的文字");
  assert.equal(context.chatInput.value, "另一段尚未送出的文字");
});

test("pending chat actions cannot submit twice and rejection restores controls", async () => {
  let reject;
  let sends = 0;
  const { context } = harness((message) => {
    if (message.type === "aiDebate:getState") return Promise.resolve({ ok: true, state: { busy: false } });
    sends += 1;
    return new Promise((_, fail) => { reject = fail; });
  });
  const first = context.send("user_message", context.chatInput.value);
  await context.send("critique");
  assert.equal(sends, 1);
  reject(new Error("channel closed"));
  await first;
  assert.equal(context.chatInput.value, "保留這段插話");
  assert.equal(context.chatControls.style.display, "block");
});

test("repair pause sends only resume and refuses it until all replies are repaired", async () => {
  const sent = [];
  const { context, messages } = harness(async (message) => {
    sent.push(message);
    return { ok: true, state: { busy: true } };
  });
  context.latestState = { busy: false, repairPause: { target: "answer" } };
  await context.send("resume");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].action, "resume");

  context.latestState = { busy: false, repairPause: { target: "answer" } };
  context.hasPendingReplyRepairs = () => true;
  await context.send("resume");
  assert.equal(sent.length, 1);
  assert.match(messages.at(-1), /補齊所有故障回覆/);
});
