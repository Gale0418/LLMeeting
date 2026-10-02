import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("src/sidepanel/app.js", "utf8");
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

test("plain text reveal fallback also avoids provider order labels", () => {
  const body = source.slice(source.indexOf("function buildTranscriptText"));
  assert.doesNotMatch(body, /`參與者 \$\{index \+ 1\}`/);
  assert.match(body, /state\.reveal\.anonymous \? \(anonymousLabel \|\| "匿名參與者（暱稱未取得）"\)/);
});

function harness(sendMessage) {
  const messages = [];
  const context = {
    latestState: { busy: false },
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
  const { context } = harness(() => {
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
