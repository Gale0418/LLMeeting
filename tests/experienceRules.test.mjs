import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { hasMeetingContent, launchGuide, readinessRecovery } from "../src/sidepanel/experienceRules.js";

test("every readiness failure has a recovery path without encouraging duplicate submission", () => {
  for (const code of ["LOGIN_REQUIRED", "GENERATING", "INPUT_NOT_FOUND", "SEND_UNAVAILABLE", "WRONG_URL", "TAB_NOT_FOUND", "CONTENT_SCRIPT_UNAVAILABLE", "TIMEOUT", "PROVIDER_ERROR"]) {
    assert.ok(readinessRecovery(code).length > 15);
  }
  assert.match(readinessRecovery("GENERATING"), /不必再送/);
  assert.match(readinessRecovery("PROVIDER_ERROR"), /用量限制/);
  assert.doesNotMatch(readinessRecovery("<script>"), /<script>/);
  assert.equal(typeof readinessRecovery("constructor"), "string");
  assert.equal(typeof readinessRecovery("__proto__"), "string");
});

test("mode guidance explains outcome and summary source rather than making reliability claims", () => {
  assert.match(launchGuide("chat"), /沒有回合上限/);
  assert.match(launchGuide("summary"), /目前 AI 分頁/);
  assert.match(launchGuide("theater"), /人設/);
  assert.equal(launchGuide("unknown"), launchGuide("fast"));
  assert.equal(launchGuide("constructor"), launchGuide("fast"));
});

test("reset protection detects active or saved meeting but not empty startup", () => {
  assert.equal(hasMeetingContent(null), false);
  assert.equal(hasMeetingContent({ transcript: { answers: { chatgpt: "" } } }), false);
  for (const state of [{ busy: true }, { question: "test" }, { summary: "result" }, { reveal: { content: "reveal" } }, { transcript: { answers: { chatgpt: "reply" } } }]) {
    assert.equal(hasMeetingContent(state), true);
  }
});

const source = await readFile("src/sidepanel/app.js", "utf8");
function resetHarness({ confirm = true, sendMessage = async () => ({ ok: true, state: {} }) } = {}) {
  const messages = [];
  let sends = 0;
  const context = {
    resetButton: { disabled: false }, resetActionPending: false, latestState: { question: "keep" }, hasMeetingContent,
    confirm: () => confirm, chrome: { runtime: { sendMessage: (...args) => { sends++; return sendMessage(...args); } } },
    renderMessage: (message) => messages.push(message), renderState() {},
  };
  vm.createContext(context);
  const body = source.slice(source.indexOf("async function resetCurrentMeeting"), source.indexOf("clearLocalDataButton?.addEventListener"));
  vm.runInContext(`${body}\nglobalThis.reset = resetCurrentMeeting;`, context);
  return { context, messages, sends: () => sends };
}

test("canceling reset does not send a destructive operation", async () => {
  const h = resetHarness({ confirm: false });
  await h.context.reset();
  assert.equal(h.sends(), 0);
  assert.equal(h.context.resetButton.disabled, false);
});

test("reset transport failure preserves state and restores the control with honest feedback", async () => {
  const h = resetHarness({ sendMessage: async () => { throw new Error("channel closed"); } });
  await h.context.reset();
  assert.equal(h.context.latestState.question, "keep");
  assert.equal(h.context.resetButton.disabled, false);
  assert.match(h.messages[0], /結果尚未確認/);
});

test("state rendering cannot re-enable a second reset while the first request is pending", async () => {
  let resolve;
  const h = resetHarness({ sendMessage: () => new Promise((done) => { resolve = done; }) });
  const first = h.context.reset();
  h.context.resetButton.disabled = false;
  await h.context.reset();
  assert.equal(h.sends(), 1);
  resolve({ ok: true, state: {} });
  await first;
  assert.equal(h.context.resetActionPending, false);
});

test("recovery links use local Provider URLs, not returned diagnostic URLs or HTML", async () => {
  const { PROVIDERS } = await import("../src/shared/providers.js");
  const createElement = () => ({ children: [], append(...items) { this.children.push(...items); } });
  const container = { children: [], replaceChildren() { this.children = []; }, append(item) { this.children.push(item); } };
  const context = {
    providerRecovery: container, PROVIDERS, selectedProviderIds: () => ["gemini"], readinessRecovery,
    latestReadiness: { gemini: { ready: false, code: "LOGIN_REQUIRED", url: "javascript:alert(1)" }, meta: { ready: false, code: "TIMEOUT" } },
    readinessFailureLabel: () => "需要登入", document: { createElement },
  };
  vm.createContext(context);
  const body = source.slice(source.indexOf("function renderProviderRecovery"), source.indexOf("function readinessFailureLabel"));
  vm.runInContext(`${body}\nglobalThis.render = renderProviderRecovery;`, context);
  context.render({ busy: false, summaryStrategy: "allAnonymous", summaryProvider: "meta" });
  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].children[2].href, "https://gemini.google.com/");
  assert.equal(container.children[0].children[2].rel, "noopener noreferrer");
  context.render({ busy: true });
  assert.equal(container.hidden, true);
});
