import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

await import("../src/content/automation-core.js");
await import("../src/content/provider-driver.js");
await import("../src/content/provider-adapters.js");

const {
  assistantSnapshot,
  classifyProviderResponseError,
  ensurePromptSubmitted,
  formatStageError,
  hasFreshAssistantResponse,
  hasFreshProviderError,
  providerErrorFingerprint,
  isPromptEcho,
  matchesProviderLocation,
  normalizeProviderResponse,
} = globalThis.aiDebateAutomationCore;

async function loadProviderPageTestContext(overrides = {}) {
  const script = await readFile("src/content/provider-page.js", "utf8");
  const instrumentedScript = script.replace(
    /\}\)\(\);\s*$/,
    "globalThis.aiDebateProviderPageTest = {\n      assertProviderLocation,\n      abortAutomation,\n      contentMessageListener,\n      collectElements,\n      createResponseCandidateBuffer,\n      findInput,\n      findSendButton,\n      readAssistantSnapshot,\n      readCurrentConversation,\n      readCurrentConversationMessages,\n      isExistingConversationRoute,\n      readConversationElementText,\n      isGenerating,\n      resolveConfiguredSendButton,\n      resolveInput,\n      resolveLikelySendButton,\n      scoreInputCandidate,\n      scoreSendCandidate,\n      updateResponseCandidateBuffer,\n      userMessageContainsPrompt,\n      observeProviderSubmission,\n      waitForCompletion,\n      waitForGeminiSubmissionReady,\n      waitForInputWritten,\n      writeInput,\n    };\n})();",
  ).replace("      writeInput,\n", "      writeInput,\n      assertAutomationEpoch,\n      readBlockingServiceStatus,\n      readSubmittedResponse,\n      submittedRuns,\n      submitPrompt,\n");
  assert.notEqual(instrumentedScript, script);

  const context = {
    aiDebateAutomationCore: {
      assistantSnapshot: () => ({ count: 0, lastText: "" }),
      classifyProviderResponseError: () => null,
      ensurePromptSubmitted: () => {},
      formatStageError: (_stage, error) => error.message,
      hasFreshAssistantResponse: () => false,
      hasFreshProviderError: () => false,
      isPromptEcho: () => false,
      matchesProviderLocation: () => false,
      normalizeProviderResponse: (_providerId, text) => text,
      providerErrorFingerprint: () => "",
    },
    aiDebateProviderDriver: globalThis.aiDebateProviderDriver,
    aiDebateProviderAdapters: {},
    chrome: { runtime: { onMessage: { addListener: () => {} } } },
    location: {},
    sessionStorage: { getItem: () => "[]", setItem: () => {}, removeItem: () => {} },
    HTMLInputElement: class {},
    HTMLTextAreaElement: class {},
    HTMLButtonElement: class {},
    setTimeout,
    clearTimeout,
    ...overrides,
  };
  context.globalThis = context;
  vm.runInNewContext(instrumentedScript, context);
  return context;
}

test("provider location matching limits X to the Grok route", () => {
  const grok = {
    locations: [
      { host: "grok.com" },
      { host: "x.com", pathPrefixes: ["/i/grok"] },
    ],
  };
  assert.equal(matchesProviderLocation({ hostname: "grok.com", pathname: "/chat" }, grok), true);
  assert.equal(matchesProviderLocation({ hostname: "x.com", pathname: "/i/grok" }, grok), true);
  assert.equal(matchesProviderLocation({ hostname: "x.com", pathname: "/i/grok/abc" }, grok), true);
  assert.equal(matchesProviderLocation({ hostname: "x.com", pathname: "/home" }, grok), false);
});

function conversationFixture(entries, extra = {}) {
  const untouched = { click: 0, focus: 0, scroll: 0 };
  const fakeClock = { now: 0 };
  const loadingNode = {
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
  };
  const input = {
    tagName: "DIV",
    isContentEditable: true,
    disabled: false,
    getAttribute: name => ({ role: "textbox", contenteditable: "true", "data-testid": "chat-input" })[name] ?? null,
    getBoundingClientRect: () => ({ width: 400, height: 40 }),
  };
  const nodes = entries.map((entry, index) => {
    const element = {
      innerText: entry.text,
      textContent: entry.text,
      order: index,
      parentElement: null,
      disabled: false,
      getAttribute: name => entry.attributes?.[name] ?? null,
      getBoundingClientRect: () => ({ width: 200, height: 40 }),
      contains(other) {
        for (let parent = other.parentElement; parent; parent = parent.parentElement) if (parent === this) return true;
        return false;
      },
      closest: () => null,
      compareDocumentPosition(other) { return this.order < other.order ? 4 : 2; },
      cloneNode() {
        return {
          innerText: this.innerText,
          textContent: this.textContent,
          querySelectorAll: () => [],
        };
      },
      click() { untouched.click += 1; },
      focus() { untouched.focus += 1; },
      scrollIntoView() { untouched.scroll += 1; },
    };
    entry.element = element;
    return element;
  });
  for (const [index, entry] of entries.entries()) {
    if (Number.isInteger(entry.parent)) nodes[index].parentElement = nodes[entry.parent];
  }
  const context = {
    aiDebateAutomationCore: {
      ...globalThis.aiDebateAutomationCore,
      classifyProviderResponseError: () => null,
      matchesProviderLocation,
    },
    aiDebateProviderAdapters: globalThis.aiDebateProviderAdapters,
    location: { hostname: "grok.com", pathname: extra.pathname || "/", search: "", hash: "" },
    document: {
      readyState: extra.readyState || "complete",
      querySelectorAll(selector) {
        if (selector === "*") return [];
        if (selector === "main[aria-busy='true']" || selector === "[role='main'][aria-busy='true']") return extra.loading ? [loadingNode] : [];
        if (selector.includes("aria-busy='true'")) return [];
        if (selector.startsWith("main [data-")) return entries.filter(entry => entry.attributes).map(entry => entry.element);
        const roleSelector = selector.match(/\[(data-[\w-]+)='(user|assistant)'\]/i);
        if (roleSelector) return entries.filter(entry => entry.attributes?.[roleSelector[1]]?.toLowerCase() === roleSelector[2].toLowerCase()).map(entry => entry.element);
        if (selector.includes("user-message")) return entries.filter(entry => /user-message/i.test(entry.attributes?.["data-testid"] || "")).map(entry => entry.element);
        if (selector.includes("assistant-message")) return entries.filter(entry => /assistant-message/i.test(entry.attributes?.["data-testid"] || "")).map(entry => entry.element);
        if (globalThis.aiDebateProviderAdapters.grok.responseSelectors.includes(selector) || selector === "assistant" || selector === "assistant-duplicate") return entries.filter(entry => entry.role === "AI").map(entry => entry.element);
        if (globalThis.aiDebateProviderAdapters.grok.userMessageSelectors.includes(selector) || selector === "user") return entries.filter(entry => entry.role === "User").map(entry => entry.element);
        if (globalThis.aiDebateProviderAdapters.grok.errorSelectors.includes(selector) || selector === "error") return entries.filter(entry => entry.role === "Error").map(entry => entry.element);
        if (selector.startsWith("button[aria-label^='Stop")) return extra.generating ? [nodes[0]].filter(Boolean) : [];
        if (selector === globalThis.aiDebateProviderAdapters.grok.preferredInputSelector) return extra.inputReady ? [input] : [];
        return [];
      },
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
    Date: { now: () => fakeClock.now },
    setTimeout(callback, ms) {
      fakeClock.now += Number(ms) || 0;
      extra.onPoll?.(fakeClock.now, context);
      queueMicrotask(callback);
      return 1;
    },
    clearTimeout() {},
    ...extra,
  };
  return { nodes, untouched, context, entries, fakeClock, input };
}

test("current conversation reader returns user and AI text once in DOM order", async () => {
  const f = conversationFixture([
    { role: "User", text: "第一個問題" },
    { role: "AI", text: "第一個回答" },
    { role: "AI", text: "重複的巢狀回答", parent: 1 },
    { role: "User", text: "第二個問題" },
  ]);
  const context = await loadProviderPageTestContext(f.context);
  const result = context.aiDebateProviderPageTest.readCurrentConversationMessages({
    responseSelectors: ["assistant", "assistant-duplicate"],
    userMessageSelectors: ["user"],
  }, "grok");

  assert.deepEqual(JSON.parse(JSON.stringify(result)), [
    { role: "User", text: "第一個問題" },
    { role: "AI", text: "第一個回答" },
    { role: "User", text: "第二個問題" },
  ]);
  assert.deepEqual(f.untouched, { click: 0, focus: 0, scroll: 0 });
});

test("response snapshot is anchored after the submitted user turn and skips thinking status", async () => {
  const f = conversationFixture([
    { role: "AI", text: "舊回覆" },
    { role: "User", text: "這次提示" },
    { role: "AI", text: "正在思考…" },
    { role: "AI", text: "這次完整回答" },
  ]);
  const context = await loadProviderPageTestContext(f.context);
  const snapshot = context.aiDebateProviderPageTest.readAssistantSnapshot({
    responseSelectors: ["assistant"], userMessageSelectors: ["user"],
  }, "gemini", "這次提示");

  assert.equal(snapshot.lastText, "這次完整回答");
  assert.equal(snapshot.count, 1);
  const uncorrelated = context.aiDebateProviderPageTest.readAssistantSnapshot({
    responseSelectors: ["assistant"], userMessageSelectors: ["user"],
  }, "gemini", "不存在於此對話的提示");
  assert.equal(uncorrelated.lastText, "", "an unidentifiable user turn must not fall back to stale assistant text");
});

test("response completion waits through a brief generation signal gap", async () => {
  let now = 0;
  let generating = true;
  const assistant = { innerText: "答案內容", contains: () => false,
    getBoundingClientRect: () => ({ width: 400, height: 50 }) };
  const stop = { disabled: false, getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }) };
  const context = await loadProviderPageTestContext({
    aiDebateAutomationCore: globalThis.aiDebateAutomationCore,
    Date: class extends Date { static now() { return now; } },
    setTimeout: (callback, milliseconds) => { now += milliseconds; if (now >= 500) generating = false; callback(); return 0; },
    document: { querySelectorAll: (selector) => selector === ".assistant" ? [assistant]
      : selector === ".stop" && generating ? [stop] : [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  const api = context.aiDebateProviderPageTest;
  const config = { responseSelectors: [".assistant"], userMessageSelectors: [],
    stopSelectors: [".stop"], errorSelectors: [], requireGenerationEnd: true };
  const state = {};

  assert.equal(await api.waitForCompletion(config, "chatgpt", 120000, assistantSnapshot([]),
    "這次提示", [], () => {}, undefined, { pollBudgetMs: 1200, state }), null);
  assert.equal(await api.waitForCompletion(config, "chatgpt", 120000, assistantSnapshot([]),
    "這次提示", [], () => {}, undefined, { pollBudgetMs: 1800, state }), "答案內容", JSON.stringify(state));
});

test("Grok waits through a 2.5 second streaming gap before accepting later text", async () => {
  let now = 0;
  const assistant = { innerText: "只有開頭", contains: () => false,
    getBoundingClientRect: () => ({ width: 400, height: 50 }) };
  const stop = { disabled: false, getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }) };
  const context = await loadProviderPageTestContext({
    aiDebateAutomationCore: globalThis.aiDebateAutomationCore,
    Date: class extends Date { static now() { return now; } },
    setTimeout: (callback, ms) => {
      now += ms;
      if (now >= 3000) assistant.innerText = "只有開頭，現在已補齊最後一句。";
      callback();
      return 0;
    },
    document: { querySelectorAll: selector => selector === ".assistant" ? [assistant]
      : selector === ".stop" && (now < 500 || (now >= 3000 && now < 3500)) ? [stop] : [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  const config = { responseSelectors: [".assistant"], stopSelectors: [".stop"], errorSelectors: [],
    completionQuietMs: globalThis.aiDebateProviderAdapters.grok.completionQuietMs };

  assert.equal(await context.aiDebateProviderPageTest.waitForCompletion(config, "grok", 9000,
    assistantSnapshot([]), "這次提示", []), "只有開頭，現在已補齊最後一句。");
});

test("conversation serializer preserves paragraphs, BR, code indentation, and meaningful double spaces", async () => {
  const text = value => ({ nodeType: 3, textContent: value });
  const element = (tagName, children = [], attributes = {}) => ({
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    childNodes: children,
    getAttribute: name => attributes[name] ?? null,
  });
  const root = element("div", [
    element("p", [text("第一段")]),
    element("p", [text("第二段"), element("br"), text("接續")]),
    element("pre", [text("  const  x = 1;\r\n  return  x;")]),
    element("span", [text("分析 class 正文保留")], { class: "analysis" }),
    element("div", [text("內部思考不納入")], { class: "thought-process" }),
  ]);
  const context = await loadProviderPageTestContext({
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
  });
  const output = context.aiDebateProviderPageTest.readConversationElementText(root, "grok");

  assert.equal(output, "第一段\n第二段\n接續\n  const  x = 1;\n  return  x;\n分析 class 正文保留");
  assert.equal(root.childNodes.length, 5, "serialization must not mutate the source DOM");
});

test("current conversation reader reports a genuinely empty page without mutating it", async () => {
  const f = conversationFixture([], { inputReady: true });
  const context = await loadProviderPageTestContext(f.context);
  const result = await context.aiDebateProviderPageTest.readCurrentConversation({ provider: "grok" });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true, provider: "grok", content: "", messages: [], empty: true, messageCount: 0, loadedMessageCount: 0,
  });
  assert.deepEqual(f.untouched, { click: 0, focus: 0, scroll: 0 });
});

test("current conversation reader waits for delayed history before returning the snapshot", async () => {
  const f = conversationFixture([{ role: "Pending", text: "" }], {
    onPoll(now) {
      if (now >= 200) {
        f.entries[0].role = "User";
        f.entries[0].text = "延遲載入的舊問題";
        f.nodes[0].innerText = f.entries[0].text;
        f.nodes[0].textContent = f.entries[0].text;
      }
    },
  });
  const context = await loadProviderPageTestContext(f.context);
  const result = await context.aiDebateProviderPageTest.readCurrentConversation({ provider: "grok" });
  assert.equal(result.content, "User:\n延遲載入的舊問題");
  assert.equal(result.messageCount, 1);
});

test("current conversation reader rejects empty existing routes and waits for a ready composer on new routes", async () => {
  const existing = conversationFixture([], { pathname: "/chat/conversation-123", inputReady: true });
  const existingContext = await loadProviderPageTestContext(existing.context);
  await assert.rejects(
    existingContext.aiDebateProviderPageTest.readCurrentConversation({ provider: "grok" }),
    error => error.code === "PROVIDER_CONVERSATION_NOT_READY",
  );

  const newPageNotReady = conversationFixture([]);
  const newContext = await loadProviderPageTestContext(newPageNotReady.context);
  await assert.rejects(
    newContext.aiDebateProviderPageTest.readCurrentConversation({ provider: "grok" }),
    error => error.code === "PROVIDER_CONVERSATION_NOT_READY",
  );
});

test("current conversation reader rejects an unrecognized user turn even when an AI turn was read", async () => {
  const f = conversationFixture([
    { role: "AI", text: "已辨識的回答" },
    { role: "Unknown", text: "未辨識的使用者問題", attributes: { "data-message-author-role": "user" } },
  ]);
  const context = await loadProviderPageTestContext(f.context);
  await assert.rejects(
    context.aiDebateProviderPageTest.readCurrentConversation({ provider: "grok" }),
    error => error.code === "PROVIDER_CONVERSATION_UNREADABLE",
  );
});

test("current conversation read cancels if the provider route changes while history is loading", async () => {
  const f = conversationFixture([], {
    inputReady: true,
    onPoll(now, context) {
      if (now >= 100) context.location.pathname = "/home";
    },
  });
  const context = await loadProviderPageTestContext(f.context);
  await assert.rejects(
    context.aiDebateProviderPageTest.readCurrentConversation({ provider: "grok" }),
    error => error.code === "PROVIDER_CONVERSATION_NAVIGATED",
  );
});

test("current conversation read cancels when the automation epoch changes during its wait", async () => {
  let cancelled = false;
  let readerContext;
  const f = conversationFixture([], {
    inputReady: true,
    onPoll() {
      if (cancelled) return;
      cancelled = true;
      readerContext.aiDebateProviderPageTest.abortAutomation();
    },
  });
  readerContext = await loadProviderPageTestContext(f.context);
  await assert.rejects(
    readerContext.aiDebateProviderPageTest.readCurrentConversation({ provider: "grok" }),
    error => error.code === "PROVIDER_AUTOMATION_ABORTED",
  );
});

test("current conversation reader refuses to report empty when visible role-marked messages are unrecognized", async () => {
  const f = conversationFixture([{ role: "Unknown", text: "仍然載入中的使用者問題", attributes: { "data-message-author-role": "user" } }]);
  const context = await loadProviderPageTestContext(f.context);
  await assert.rejects(
    context.aiDebateProviderPageTest.readCurrentConversation({ provider: "grok" }),
    error => error.code === "PROVIDER_CONVERSATION_UNREADABLE",
  );
  assert.deepEqual(f.untouched, { click: 0, focus: 0, scroll: 0 });
});

test("aiDebate:readCurrentConversation RPC returns the exact read-only transcript contract", async () => {
  const f = conversationFixture([
    { role: "User", text: "請比較兩種做法" },
    { role: "AI", text: "第一種做法的優點" },
  ]);
  const context = await loadProviderPageTestContext(f.context);
  const result = await new Promise(resolve => {
    const accepted = context.aiDebateProviderPageTest.contentMessageListener(
      { type: "aiDebate:readCurrentConversation", provider: "grok" }, {}, resolve,
    );
    assert.equal(accepted, true);
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true,
    provider: "grok",
    content: "User:\n請比較兩種做法\n\nAI:\n第一種做法的優點",
    messages: [
      { role: "User", text: "請比較兩種做法" },
      { role: "AI", text: "第一種做法的優點" },
    ],
    empty: false,
    messageCount: 2,
    loadedMessageCount: 2,
  });
  assert.deepEqual(f.untouched, { click: 0, focus: 0, scroll: 0 });
});

test("current conversation RPC rejects active generation, service errors, and a single message over its safety cap", async () => {
  const generating = conversationFixture([{ role: "AI", text: "部分生成" }], { generating: true });
  const generatingReader = await loadProviderPageTestContext(generating.context);
  await assert.rejects(
    generatingReader.aiDebateProviderPageTest.readCurrentConversation({ provider: "grok" }),
    error => error.code === "PROVIDER_GENERATING",
  );

  const serviceError = conversationFixture([{ role: "Error", text: "An error occurred. Please try again." }]);
  const errorReader = await loadProviderPageTestContext(serviceError.context);
  await assert.rejects(
    errorReader.aiDebateProviderPageTest.readCurrentConversation({ provider: "grok" }),
    error => error.code === "PROVIDER_PAGE_ERROR",
  );

  const overlong = conversationFixture([{ role: "AI", text: "x".repeat(250001) }]);
  const reader = await loadProviderPageTestContext(overlong.context);
  await assert.rejects(
    reader.aiDebateProviderPageTest.readCurrentConversation({ provider: "grok" }),
    error => error.code === "PROVIDER_CONVERSATION_MESSAGE_TOO_LONG",
  );
  for (const f of [generating, serviceError, overlong]) {
    assert.deepEqual(f.untouched, { click: 0, focus: 0, scroll: 0 });
  }
});

test("current conversation reader returns the latest complete messages when aggregate history exceeds its cap", async () => {
  const text = "x".repeat(50000);
  const f = conversationFixture(Array.from({ length: 6 }, (_, index) => ({
    role: index % 2 ? "AI" : "User",
    text: `${index}:${text}`,
  })));
  const context = await loadProviderPageTestContext(f.context);
  const result = await context.aiDebateProviderPageTest.readCurrentConversation({ provider: "grok" });

  assert.equal(result.messageCount, 6);
  assert.equal(result.loadedMessageCount, result.messages.length);
  assert.ok(result.loadedMessageCount < result.messageCount);
  const selectedMessages = JSON.parse(JSON.stringify(result.messages));
  assert.deepEqual(selectedMessages.map(({ text: message }) => message.slice(0, 1)), ["2", "3", "4", "5"]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.omission)), {
    omittedMessages: 2,
    omittedChars: 100004,
    reason: "capture-limit",
  });
  assert.ok(result.content.length <= 250000);
});

test("provider driver rejects a SPA route change before the next mutating or response step", async () => {
  const location = { hostname: "x.com", pathname: "/i/grok" };
  const context = await loadProviderPageTestContext({
    aiDebateProviderAdapters: globalThis.aiDebateProviderAdapters,
    aiDebateAutomationCore: { ...globalThis.aiDebateAutomationCore, matchesProviderLocation },
    location,
    document: { querySelectorAll: () => [] },
  });

  assert.doesNotThrow(() => context.aiDebateProviderPageTest.assertProviderLocation(
    "grok", globalThis.aiDebateProviderAdapters.grok,
  ));
  location.pathname = "/home";
  assert.throws(
    () => context.aiDebateProviderPageTest.assertProviderLocation(
      "grok", globalThis.aiDebateProviderAdapters.grok,
    ),
    (error) => error.code === "PROVIDER_WRONG_PAGE",
  );
});

test("Grok response selectors require an assistant role and expose user roles separately", () => {
  const grok = globalThis.aiDebateProviderAdapters.grok;
  assert.ok(grok.userMessageSelectors.length > 0);
  assert.ok(grok.responseSelectors.every((selector) => /assistant/i.test(selector)));
  assert.ok(grok.responseSelectors.every((selector) => !/article|markdown/.test(selector)));
});

test("Grok snapshot keeps nested user content out of the assistant response", async () => {
  const userBubble = {
    innerText: "使用者問題",
    textContent: "使用者問題",
    contains: (element) => element === userBubble,
    getAttribute: (name) => name === "data-message-id" ? "user-1" : null,
    getBoundingClientRect: () => ({ width: 400, height: 40 }),
  };
  const assistantBubble = {
    innerText: "助理回答",
    textContent: "助理回答",
    contains: (element) => element === assistantBubble,
    getAttribute: (name) => name === "data-message-id" ? "assistant-1" : null,
    getBoundingClientRect: () => ({ width: 400, height: 40 }),
  };
  const context = await loadProviderPageTestContext({
    aiDebateProviderAdapters: globalThis.aiDebateProviderAdapters,
    aiDebateAutomationCore: { ...globalThis.aiDebateAutomationCore },
    location: { hostname: "grok.com", pathname: "/" },
    document: {
      querySelectorAll: (selector) => selector.includes("assistant") ? [assistantBubble]
        : selector.includes("user") ? [userBubble]
          : [],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  const snapshot = context.aiDebateProviderPageTest.readAssistantSnapshot(
    globalThis.aiDebateProviderAdapters.grok,
    "grok",
  );
  assert.deepEqual(snapshot, {
    count: 1,
    lastText: "助理回答",
    lastFingerprint: "助理回答",
    lastIdentity: "assistant-1",
  });
});

test("ChatGPT search-unit markup reads only the assistant body and preserves message identity", async () => {
  const makeNode = (text, identity) => ({
    innerText: text,
    textContent: text,
    contains(other) { return other === this; },
    getAttribute: (name) => name === "data-chatgpt-selection-message-id" ? identity : null,
    getBoundingClientRect: () => ({ width: 400, height: 50 }),
  });
  const user = makeNode("TEST~", "user-1");
  const reply = makeNode("收到測試訊號～", "reply-1");
  const config = globalThis.aiDebateProviderAdapters.chatgpt;
  const context = await loadProviderPageTestContext({
    aiDebateAutomationCore: { ...globalThis.aiDebateAutomationCore },
    document: { querySelectorAll: (selector) =>
      selector === "[data-chatgpt-search-unit-key$=':assistant'] [data-chatgpt-selection-message-id]" ? [reply]
        : selector === "[data-chatgpt-search-unit-key$=':user']" ? [user] : [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  assert.deepEqual(context.aiDebateProviderPageTest.readAssistantSnapshot(config, "chatgpt"), {
    count: 1, lastText: "收到測試訊號～", lastFingerprint: "收到測試訊號～", lastIdentity: "reply-1",
  });
});

test("ChatGPT confirms a new search-unit user message even when the old composer stays mounted", async () => {
  const prompt = "TEST~";
  const message = {
    innerText: prompt, contains() { return false; },
    getBoundingClientRect: () => ({ width: 400, height: 50 }),
  };
  const context = await loadProviderPageTestContext({
    document: { querySelectorAll: (selector) => selector === "[data-chatgpt-search-unit-key$=':user']" ? [message] : [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  const result = await context.aiDebateProviderPageTest.observeProviderSubmission(
    globalThis.aiDebateProviderAdapters.chatgpt,
    { innerText: prompt }, prompt, 0, true, () => {}, 100, false,
  );
  assert.equal(result, "user-message-added");
});

test("response snapshot recovers from retired selectors only with explicit assistant identity", async () => {
  const makeMessage = (text, attributes = {}, tagName = "ARTICLE") => ({
    tagName,
    innerText: text,
    textContent: text,
    parentElement: null,
    contains(other) { return other === this; },
    getAttribute: (name) => attributes[name] || null,
    getBoundingClientRect: () => ({ width: 400, height: 50 }),
  });
  const user = makeMessage("使用者的問題", { "data-message-author": "user" });
  const assistant = makeMessage("模型的回答", { "aria-label": "Assistant response", "data-message-id": "reply-1" });
  const unmarked = makeMessage("身份不明的文章");
  const modelPicker = makeMessage("Gemini 3.8", { "data-role": "model" }, "DIV");
  const messages = [user, assistant, unmarked, modelPicker];
  const context = await loadProviderPageTestContext({
    aiDebateAutomationCore: { ...globalThis.aiDebateAutomationCore },
    document: {
      querySelectorAll: (selector) => selector === "[data-message-author='user']" ||
        selector === ".retired-response-class" ? [user]
        : ["article[aria-label]", "[data-message-author]", "[data-role]"].includes(selector) ? messages
          : [],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  const snapshot = context.aiDebateProviderPageTest.readAssistantSnapshot({
    responseSelectors: [".retired-response-class"],
    userMessageSelectors: ["[data-message-author='user']"],
  }, "chatgpt");
  assert.deepEqual(snapshot, {
    count: 1,
    lastText: "模型的回答",
    lastFingerprint: "模型的回答",
    lastIdentity: "reply-1",
  });
});

test("provider readiness returns a read-only ready snapshot", async () => {
  let clickCount = 0;
  const input = {
    tagName: "TEXTAREA",
    disabled: false,
    readOnly: false,
    parentElement: null,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 320, height: 40 }),
  };
  const sendButton = {
    disabled: false,
    parentElement: null,
    click: () => { clickCount += 1; },
    getAttribute: (name) => name === "role" ? "button" : null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }),
  };
  const context = await loadProviderPageTestContext({
    aiDebateProviderAdapters: globalThis.aiDebateProviderAdapters,
    aiDebateAutomationCore: { ...globalThis.aiDebateAutomationCore, matchesProviderLocation },
    location: { hostname: "chatgpt.com", pathname: "/" },
    document: {
      querySelectorAll: (selector) => {
        if (selector.includes("textarea")) return [input];
        if (selector.includes("send-button") || selector.includes("type='submit'") || selector.includes("Send") || selector.includes("送出")) return [sendButton];
        return [];
      },
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  const composer = { querySelectorAll: () => [sendButton] };
  input.parentElement = composer;
  sendButton.parentElement = composer;
  const result = await context.aiDebateProviderPageReadiness({ provider: "chatgpt" });

  assert.equal(result.ok, true);
  assert.equal(result.ready, true);
  assert.equal(result.status, "ready");
  assert.equal(result.checks.url.ok, true);
  assert.equal(result.checks.input.editable, true);
  assert.equal(result.checks.send.enabled, true);
  assert.equal(result.checks.generating.active, false);
  assert.equal(result.checks.driver.contractVersion, 1);
  assert.equal(result.checks.driver.model.policy, "site-default");
  assert.equal(result.checks.driver.model.required, false);
  assert.equal(result.checks.driver.surfaces.input.confidence, "high");
  assert.ok(result.checks.driver.surfaces.input.evidence);
  assert.equal(clickCount, 0);
});

test("readiness rechecks the route after an SPA navigates during polling", async () => {
  const pageLocation = { hostname: "chatgpt.com", pathname: "/" };
  const input = {
    tagName: "TEXTAREA", disabled: false, readOnly: false, parentElement: null,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 320, height: 40 }),
  };
  const sendButton = {
    disabled: false, parentElement: null,
    getAttribute: (name) => name === "role" ? "button" : null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }),
  };
  let controlsVisible = false;
  const context = await loadProviderPageTestContext({
    aiDebateProviderAdapters: globalThis.aiDebateProviderAdapters,
    aiDebateAutomationCore: { ...globalThis.aiDebateAutomationCore, matchesProviderLocation },
    location: pageLocation,
    document: { querySelectorAll(selector) {
      if (!controlsVisible) return [];
      if (selector.includes("textarea")) return [input];
      if (selector.includes("send-button") || selector.includes("type='submit'") || selector.includes("Send") || selector.includes("送出")) return [sendButton];
      return [];
    } },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  setTimeout(() => {
    pageLocation.hostname = "example.com";
    pageLocation.pathname = "/auth/login";
    controlsVisible = true;
  }, 20);
  const result = await context.aiDebateProviderPageReadiness({ provider: "chatgpt" });
  assert.equal(result.ready, false);
  assert.equal(result.status, "wrong-page");
  assert.equal(result.checks.url.pathname, "/auth/login");
});

test("provider readiness accepts an empty composer with a disabled send control", async () => {
  const input = {
    tagName: "TEXTAREA",
    disabled: false,
    readOnly: false,
    parentElement: null,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 320, height: 40 }),
  };
  const disabledSendButton = {
    disabled: true,
    parentElement: null,
    getAttribute: (name) => name === "role" ? "button" : null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }),
  };
  const context = await loadProviderPageTestContext({
    aiDebateProviderAdapters: globalThis.aiDebateProviderAdapters,
    aiDebateAutomationCore: { ...globalThis.aiDebateAutomationCore, matchesProviderLocation },
    location: { hostname: "chatgpt.com", pathname: "/" },
    document: {
      querySelectorAll: (selector) => {
        if (selector.includes("textarea")) return [input];
        if (selector.includes("send-button") || selector.includes("type='submit'") || selector.includes("Send") || selector.includes("送出")) return [disabledSendButton];
        return [];
      },
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  const composer = { querySelectorAll: () => [disabledSendButton] };
  input.parentElement = composer;
  disabledSendButton.parentElement = composer;
  const result = await context.aiDebateProviderPageReadiness({ provider: "chatgpt" });

  assert.equal(result.ready, true);
  assert.equal(result.status, "ready");
  assert.equal(result.checks.send.found, true);
  assert.equal(result.checks.send.enabled, false);
});

test("provider readiness accepts providers that defer the send control until text exists", async () => {
  const input = {
    tagName: "DIV",
    disabled: false,
    readOnly: false,
    parentElement: null,
    isContentEditable: true,
    getAttribute: (name) => name === "contenteditable" ? "true" : name === "role" ? "textbox" : null,
    getBoundingClientRect: () => ({ width: 320, height: 40 }),
  };
  const context = await loadProviderPageTestContext({
    aiDebateProviderAdapters: globalThis.aiDebateProviderAdapters,
    aiDebateAutomationCore: { ...globalThis.aiDebateAutomationCore, matchesProviderLocation },
    location: { hostname: "chatgpt.com", pathname: "/" },
    document: {
      querySelectorAll: (selector) => selector.includes("contenteditable") || selector.includes("role='textbox'") ? [input] : [],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  const result = await context.aiDebateProviderPageReadiness({ provider: "chatgpt" });

  assert.equal(result.ready, true);
  assert.equal(result.status, "ready");
  assert.equal(result.checks.send.found, false);
  assert.equal(result.checks.send.deferred, true);
});

test("Claude readiness accepts its disabled empty composer send control", async () => {
  const input = {
    tagName: "DIV",
    disabled: false,
    readOnly: false,
    parentElement: null,
    isContentEditable: true,
    getAttribute: (name) => name === "aria-label" ? "Write your prompt to Claude"
      : name === "contenteditable" ? "true"
        : name === "role" ? "textbox" : null,
    getBoundingClientRect: () => ({ width: 320, height: 40 }),
  };
  const disabledSendButton = {
    disabled: true,
    parentElement: null,
    getAttribute: (name) => name === "data-testid" ? "chat-input-send" : name === "role" ? "button" : null,
    getBoundingClientRect: () => ({ width: 32, height: 32 }),
  };
  const context = await loadProviderPageTestContext({
    aiDebateProviderAdapters: globalThis.aiDebateProviderAdapters,
    aiDebateAutomationCore: { ...globalThis.aiDebateAutomationCore, matchesProviderLocation },
    location: { hostname: "claude.ai", pathname: "/new" },
    document: {
      querySelectorAll: (selector) => selector.includes("Write your prompt") || selector.includes("contenteditable")
        || selector.includes("role='textbox'") ? [input]
        : selector.includes("chat-input-send") ? [disabledSendButton] : [],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  const composer = { querySelectorAll: () => [disabledSendButton] };
  input.parentElement = composer;
  disabledSendButton.parentElement = composer;
  const result = await context.aiDebateProviderPageReadiness({ provider: "claude" });

  assert.equal(result.ready, true);
  assert.equal(result.status, "ready");
  assert.equal(result.checks.send.found, true);
  assert.equal(result.checks.send.enabled, false);
});

test("provider adapters keep live Grok and Claude accessibility contracts first", () => {
  const chatgpt = globalThis.aiDebateProviderAdapters.chatgpt;
  const grok = globalThis.aiDebateProviderAdapters.grok;
  const claude = globalThis.aiDebateProviderAdapters.claude;

  assert.ok(chatgpt.stopSelectors.some((selector) => selector.includes("[data-chatgpt-composer]")
    && selector.includes("[data-composer-body]")
    && selector.includes("[data-type='unified-composer']")
    && selector.includes("[data-composer-surface='true']")));
  assert.ok(chatgpt.stopSelectors.every((selector) => /^:is\(.+\) button\[/.test(selector)));
  assert.ok(chatgpt.stopSelectors.every((selector) => !/^button\[/.test(selector)));

  assert.equal(grok.preferredInputSelector, "[data-testid='chat-input'] div[contenteditable='true'][role='textbox']");
  assert.equal(grok.inputSelectors[0], "[data-testid='chat-input'] div[contenteditable='true']");
  assert.equal(grok.sendSelectors[0], "button[data-testid='chat-submit']");
  assert.equal(claude.preferredInputSelector, "[data-testid='chat-input'][contenteditable='true'][role='textbox']");
  assert.equal(claude.sendSelectors[0], "button[data-testid='chat-input-send']");
  assert.equal(claude.sendControlDeferredWhenEmpty, true);
  assert.equal(claude.stopSelectors.includes("button[aria-label*='停止']"), false);
  assert.ok(claude.stopSelectors.some((selector) => selector.includes("停止生成")));
});

test("Grok readiness recognizes the localized live composer structure", async () => {
  const input = {
    tagName: "DIV",
    disabled: false,
    readOnly: false,
    parentElement: null,
    isContentEditable: true,
    getAttribute: (name) => name === "contenteditable" ? "true" : name === "role" ? "textbox" : null,
    getBoundingClientRect: () => ({ width: 538, height: 44 }),
  };
  const preferredSelector = globalThis.aiDebateProviderAdapters.grok.preferredInputSelector;
  const context = await loadProviderPageTestContext({
    aiDebateProviderAdapters: globalThis.aiDebateProviderAdapters,
    aiDebateAutomationCore: { ...globalThis.aiDebateAutomationCore, matchesProviderLocation },
    location: { hostname: "grok.com", pathname: "/" },
    document: {
      querySelectorAll: (selector) => selector.includes(preferredSelector) || selector.includes("data-testid='chat-input'")
        ? [input]
        : [],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  const result = await context.aiDebateProviderPageReadiness({ provider: "grok" });

  assert.equal(result.ready, true);
  assert.equal(result.status, "ready");
  assert.equal(result.checks.input.editable, true);
  assert.equal(result.checks.send.deferred, true);
});

test("provider content script uses a replaceable versioned listener after extension reload", async () => {
  const script = await readFile("src/content/provider-page.js", "utf8");

  assert.match(script, /CONTENT_SCRIPT_VERSION = "0\.5\.3-driver\.19"/);
  assert.match(script, /"aiDebate:getCapabilities": getCapabilities/);
  assert.match(script, /__aiDebateContentVersion/);
  assert.match(script, /onMessage\.removeListener\(globalThis\.__aiDebateContentMessageListener\)/);
  assert.match(script, /globalThis\.__aiDebateContentMessageListener = contentMessageListener/);
});

test("same-version content reinjection replaces the listener without duplicating it", async () => {
  const listeners = new Set();
  const context = await loadProviderPageTestContext({
    chrome: { runtime: { onMessage: {
      addListener(listener) { listeners.add(listener); },
      removeListener(listener) { listeners.delete(listener); },
    } } },
  });
  const previous = context.__aiDebateContentMessageListener;
  const script = await readFile("src/content/provider-page.js", "utf8");
  vm.runInNewContext(script, context);
  assert.equal(listeners.size, 1);
  assert.notEqual(context.__aiDebateContentMessageListener, previous);
  const response = await new Promise(resolve => context.__aiDebateContentMessageListener({ type: "aiDebate:getCapabilities" }, {}, resolve));
  assert.equal(response.contentScriptVersion, "0.5.3-driver.19");
});

test("failed content initialization cannot poison the next injection", async () => {
  const script = await readFile("src/content/provider-page.js", "utf8");
  const context = { globalThis: null, chrome: { runtime: { onMessage: { addListener() {} } } } };
  context.globalThis = context;
  assert.throws(() => vm.runInNewContext(script, context));
  assert.equal(context.__aiDebateContentVersion, undefined);
});

test("scored input fallback prefers a composer and rejects a search box", async () => {
  const composer = {
    tagName: "DIV",
    className: "future-editor",
    id: "",
    disabled: false,
    readOnly: false,
    isContentEditable: true,
    type: "",
    getAttribute: (name) => ({
      role: "textbox",
      contenteditable: "true",
      "data-testid": "composer-v2",
      "aria-label": "",
    })[name] || null,
    getBoundingClientRect: () => ({ width: 520, height: 44, top: 600 }),
    closest: (selector) => selector === ".future-composer" || selector === "main, form" ? {} : null,
  };
  const search = {
    ...composer,
    getAttribute: (name) => ({ role: "textbox", contenteditable: "true", "aria-label": "搜尋" })[name] || null,
    getBoundingClientRect: () => ({ width: 280, height: 32, top: 80 }),
    closest: (selector) => selector === "nav, aside, header" ? {} : null,
  };
  const context = await loadProviderPageTestContext({
    innerHeight: 800,
    document: {
      documentElement: { clientHeight: 800 },
      querySelectorAll: (selector) => selector.includes("textarea") ? [search, composer] : [],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  const result = context.aiDebateProviderPageTest.resolveInput({
    preferredInputSelector: ".retired-selector",
    inputSelectors: [],
    composerRootSelectors: [".future-composer"],
  });

  assert.equal(result.element, composer);
  assert.equal(result.strategy, "scored-fallback");
  assert.equal(result.ambiguous, false);
});

test("a stale configured search field cannot prevent a valid semantic composer fallback", async () => {
  const field = (label, id, top) => ({
    tagName: "DIV",
    id,
    className: "",
    disabled: false,
    readOnly: false,
    isContentEditable: true,
    type: "",
    getAttribute: (name) => ({ role: "textbox", contenteditable: "true", "aria-label": label })[name] || null,
    getBoundingClientRect: () => ({ width: 400, height: 40, top }),
    closest: (selector) => selector === "main, form" && id === "composer" ? {} : null,
  });
  const search = field("搜尋", "search", 50);
  const composer = field("輸入訊息", "composer", 600);
  const context = await loadProviderPageTestContext({
    innerHeight: 800,
    document: {
      documentElement: { clientHeight: 800 },
      querySelectorAll: (selector) => selector === ".old-composer" ? [search]
        : selector.includes("textarea") ? [search, composer] : [],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  const result = context.aiDebateProviderPageTest.resolveInput({
    preferredInputSelector: ".old-composer",
    inputSelectors: [],
  });
  assert.equal(result.element, composer);
  assert.equal(result.strategy, "scored-fallback");
});

test("scored input fallback fails closed when two candidates are equally plausible", async () => {
  const candidate = (id) => ({
    tagName: "DIV",
    className: "future-editor",
    id,
    disabled: false,
    readOnly: false,
    isContentEditable: true,
    type: "",
    getAttribute: (name) => ({ role: "textbox", contenteditable: "true", "data-testid": "composer" })[name] || null,
    getBoundingClientRect: () => ({ width: 500, height: 40, top: 600 }),
    closest: (selector) => selector === "main, form" ? {} : null,
  });
  const candidates = [candidate("one"), candidate("two")];
  const context = await loadProviderPageTestContext({
    innerHeight: 800,
    document: {
      documentElement: { clientHeight: 800 },
      querySelectorAll: (selector) => selector.includes("textarea") ? candidates : [],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  const result = context.aiDebateProviderPageTest.resolveInput({ inputSelectors: [] });

  assert.equal(result.element, null);
  assert.equal(result.candidate, candidates[0]);
  assert.equal(result.ambiguous, true);
});

test("configured input selectors also fail closed when a redesign exposes two equally plausible composers", async () => {
  const candidate = (id) => ({
    tagName: "DIV",
    className: "future-editor",
    id,
    disabled: false,
    readOnly: false,
    isContentEditable: true,
    type: "",
    getAttribute: (name) => ({ role: "textbox", contenteditable: "true" })[name] || null,
    getBoundingClientRect: () => ({ width: 500, height: 40, top: 600 }),
    closest: (selector) => selector === "main, form" ? {} : null,
  });
  const candidates = [candidate("old-shell"), candidate("new-shell")];
  const context = await loadProviderPageTestContext({
    innerHeight: 800,
    document: {
      documentElement: { clientHeight: 800 },
      querySelectorAll: (selector) => selector === ".configured-editor" ? candidates : [],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  const result = context.aiDebateProviderPageTest.resolveInput({
    inputSelectors: [".configured-editor"],
  });

  assert.equal(result.element, null);
  assert.equal(result.ambiguous, true);
  assert.equal(result.candidateCount, 2);
  assert.equal(result.evidence.strategy, "configured");
});

test("semantic send fallback accepts an icon-only submit button inside the composer", async () => {
  const button = {
    tagName: "BUTTON",
    type: "submit",
    disabled: false,
    title: "",
    textContent: "",
    getAttribute: (name) => ({ type: "submit", "data-icon": "arrow-up" })[name] || null,
    getBoundingClientRect: () => ({ width: 36, height: 36 }),
  };
  const context = await loadProviderPageTestContext({
    document: { querySelectorAll: () => [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  const root = { querySelectorAll: () => [button] };

  const result = context.aiDebateProviderPageTest.resolveLikelySendButton(root);

  assert.equal(result.element, button);
  assert.equal(result.strategy, "semantic-send-fallback");
  assert.ok(result.score >= 70);
});

test("semantic send fallback rejects ambiguous controls and unsafe voice actions", async () => {
  const button = (label) => ({
    tagName: "BUTTON",
    type: "button",
    disabled: false,
    title: "",
    textContent: "",
    getAttribute: (name) => name === "aria-label" ? label : name === "type" ? "button" : null,
    getBoundingClientRect: () => ({ width: 36, height: 36 }),
  });
  const first = button("Send message");
  const second = button("Submit prompt");
  const microphone = button("Voice microphone record");
  const context = await loadProviderPageTestContext({
    document: { querySelectorAll: () => [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  const ambiguous = context.aiDebateProviderPageTest.resolveLikelySendButton({
    querySelectorAll: () => [first, second, microphone],
  });

  assert.equal(ambiguous.element, null);
  assert.equal(ambiguous.ambiguous, true);
  assert.ok(context.aiDebateProviderPageTest.scoreSendCandidate(microphone) < 0);
});

test("configured send selectors fail closed instead of clicking the first matching button", async () => {
  const button = (id) => ({
    id,
    tagName: "BUTTON",
    type: "button",
    disabled: false,
    title: "",
    textContent: "",
    getAttribute: (name) => name === "role" ? "button" : name === "aria-label" ? "Send" : null,
    getBoundingClientRect: () => ({ width: 36, height: 36 }),
  });
  const first = button("desktop-send");
  const second = button("mobile-send");
  const context = await loadProviderPageTestContext({
    document: { querySelectorAll: () => [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  const root = { querySelectorAll: () => [first, second] };

  const result = context.aiDebateProviderPageTest.resolveConfiguredSendButton(root, {
    sendSelectors: ["button[data-testid='send']"],
  });

  assert.equal(result.element, null);
  assert.equal(result.ambiguous, true);
  assert.equal(result.candidateCount, 2);
});

test("one stale selector does not disable the remaining provider contract", async () => {
  const input = {
    tagName: "DIV",
    disabled: false,
    readOnly: false,
    getAttribute: (name) => name === "contenteditable" ? "true" : null,
    getBoundingClientRect: () => ({ width: 400, height: 40 }),
  };
  const context = await loadProviderPageTestContext({
    document: {
      querySelectorAll: (selector) => {
        if (selector === "[broken") throw new Error("invalid selector");
        return selector === ".live-editor" ? [input] : [];
      },
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  assert.equal(context.aiDebateProviderPageTest.findInput({
    preferredInputSelector: "[broken",
    inputSelectors: [".live-editor"],
  }), input);
});

test("input discovery can recover an editor inside an open shadow root", async () => {
  const input = {
    tagName: "DIV",
    disabled: false,
    readOnly: false,
    getAttribute: (name) => name === "contenteditable" ? "true" : null,
    getBoundingClientRect: () => ({ width: 400, height: 40 }),
  };
  const shadowRoot = {
    querySelectorAll: (selector) => selector === ".shadow-editor" ? [input] : [],
  };
  const host = { shadowRoot };
  const context = await loadProviderPageTestContext({
    document: {
      querySelectorAll: (selector) => selector === "*" ? [host] : [],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  assert.equal(context.aiDebateProviderPageTest.findInput({
    preferredInputSelector: ".shadow-editor",
    inputSelectors: [],
  }), input);
});

test("element discovery merges direct and open shadow DOM matches", async () => {
  const direct = { id: "direct" };
  const shadow = { id: "shadow" };
  const shadowRoot = { querySelectorAll: () => [shadow] };
  const host = { shadowRoot };
  const context = await loadProviderPageTestContext({
    document: {
      querySelectorAll: (selector) => selector === "*" ? [host] : [direct],
    },
  });
  assert.equal(
    context.aiDebateProviderPageTest.collectElements([".target"]).map((element) => element.id).join(","),
    "direct,shadow",
  );
});

test("provider readiness ignores a transient busy shell", async () => {
  const input = {
    tagName: "DIV",
    disabled: false,
    readOnly: false,
    parentElement: null,
    isContentEditable: true,
    getAttribute: (name) => name === "data-testid" ? "chat-input" : name === "contenteditable" ? "true" : name === "role" ? "textbox" : null,
    getBoundingClientRect: () => ({ width: 320, height: 40 }),
  };
  let busy = true;
  const disabledSendButton = {
    disabled: true,
    getAttribute: (name) => name === "role" ? "button" : null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }),
  };
  const context = await loadProviderPageTestContext({
    aiDebateProviderAdapters: globalThis.aiDebateProviderAdapters,
    aiDebateAutomationCore: { ...globalThis.aiDebateAutomationCore, matchesProviderLocation },
    location: { hostname: "claude.ai", pathname: "/new" },
    document: {
      querySelectorAll: (selector) => {
        if (selector.includes("chat-input")) return [input];
        if (selector.includes("aria-busy")) return busy ? [{ getBoundingClientRect: () => ({ width: 320, height: 40 }) }] : [];
        if (selector.includes("chat-input-send") || selector.includes("type='submit'")) return [disabledSendButton];
        return [];
      },
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  setTimeout(() => { busy = false; }, 50);

  const result = await context.aiDebateProviderPageReadiness({ provider: "claude" });

  assert.equal(result.ready, true);
  assert.equal(result.checks.generating.active, false);
});

test("provider readiness identifies a login wall before reporting input readiness", async () => {
  const loginPanel = {
    innerText: "Log in to continue",
    textContent: "Log in to continue",
    getBoundingClientRect: () => ({ width: 300, height: 200 }),
  };
  const context = await loadProviderPageTestContext({
    aiDebateProviderAdapters: globalThis.aiDebateProviderAdapters,
    aiDebateAutomationCore: { ...globalThis.aiDebateAutomationCore, matchesProviderLocation },
    location: { hostname: "chatgpt.com", pathname: "/" },
    document: {
      querySelectorAll: (selector) => selector.includes("login") ? [loginPanel] : [],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  const result = await context.aiDebateProviderPageReadiness({ provider: "chatgpt" });

  assert.equal(result.ready, false);
  assert.equal(result.status, "login-required");
  assert.equal(result.code, "PROVIDER_LOGIN_REQUIRED");
  assert.equal(result.checks.login.detected, true);
});

test("provider readiness reports generation without interacting with the page", async () => {
  const input = {
    tagName: "TEXTAREA",
    disabled: false,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 320, height: 40 }),
  };
  const stopButton = {
    disabled: false,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }),
  };
  const context = await loadProviderPageTestContext({
    aiDebateProviderAdapters: globalThis.aiDebateProviderAdapters,
    aiDebateAutomationCore: { ...globalThis.aiDebateAutomationCore, matchesProviderLocation },
    location: { hostname: "chatgpt.com", pathname: "/" },
    document: {
      querySelectorAll: (selector) => selector.includes("textarea") ? [input]
        : selector.includes("stop-button") ? [stopButton]
          : [],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  const result = await context.aiDebateProviderPageReadiness({ provider: "chatgpt" });

  assert.equal(result.ready, false);
  assert.equal(result.status, "generating");
  assert.equal(result.checks.generating.active, true);
});

test("provider readiness reports explicit provider errors without treating them as ready", async () => {
  const errorBanner = {
    innerText: "Something went wrong. Please try again later.",
    textContent: "Something went wrong. Please try again later.",
    getBoundingClientRect: () => ({ width: 300, height: 40 }),
  };
  const context = await loadProviderPageTestContext({
    aiDebateProviderAdapters: globalThis.aiDebateProviderAdapters,
    aiDebateAutomationCore: {
      ...globalThis.aiDebateAutomationCore,
      matchesProviderLocation,
      classifyProviderResponseError: () => ({ code: "PROVIDER_PAGE_ERROR", message: "服務錯誤" }),
    },
    location: { hostname: "chatgpt.com", pathname: "/" },
    document: {
      querySelectorAll: (selector) => selector.includes("role='alert'") ? [errorBanner] : [],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  const result = await context.aiDebateProviderPageReadiness({ provider: "chatgpt" });

  assert.equal(result.ready, false);
  assert.equal(result.status, "error");
  assert.equal(result.code, "PROVIDER_PAGE_ERROR");
  assert.equal(result.checks.error.detected, true);
});

test("ChatGPT plain Chinese stop control blocks readiness only inside its composer", async () => {
  const stopButton = { disabled: false, getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }) };
  let insideComposer = true;
  const composerStopSelector = globalThis.aiDebateProviderAdapters.chatgpt.stopSelectors[0];
  const context = await loadProviderPageTestContext({
    aiDebateProviderAdapters: globalThis.aiDebateProviderAdapters,
    aiDebateAutomationCore: { ...globalThis.aiDebateAutomationCore, matchesProviderLocation },
    location: { hostname: "chatgpt.com", pathname: "/" },
    document: { querySelectorAll: (selector) =>
      selector === composerStopSelector && insideComposer
        ? [stopButton] : [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  const generating = await context.aiDebateProviderPageReadiness({ provider: "chatgpt" });
  assert.equal(generating.status, "generating");
  assert.equal(generating.checks.generating.active, true);
  insideComposer = false;
  const idle = await context.aiDebateProviderPageReadiness({ provider: "chatgpt" });
  assert.equal(idle.checks.generating.active, false);
});

test("provider readiness does not let a historical global error block a usable composer", async () => {
  const input = {
    tagName: "TEXTAREA",
    disabled: false,
    readOnly: false,
    parentElement: null,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 320, height: 40 }),
  };
  const historicalError = {
    innerText: "Something went wrong",
    textContent: "Something went wrong",
    getBoundingClientRect: () => ({ width: 300, height: 40 }),
  };
  const context = await loadProviderPageTestContext({
    aiDebateProviderAdapters: globalThis.aiDebateProviderAdapters,
    aiDebateAutomationCore: {
      ...globalThis.aiDebateAutomationCore,
      matchesProviderLocation,
      classifyProviderResponseError: () => ({ code: "PROVIDER_PAGE_ERROR", message: "服務錯誤" }),
    },
    location: { hostname: "chatgpt.com", pathname: "/" },
    document: {
      querySelectorAll: (selector) => selector.includes("textarea") ? [input]
        : selector.includes("role='alert'") ? [historicalError]
          : [],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  const result = await context.aiDebateProviderPageReadiness({ provider: "chatgpt" });

  assert.equal(result.ready, true);
  assert.equal(result.status, "ready");
  assert.equal(result.checks.error.detected, false);
});

test("Meta AI adapter only matches the packaged meta.ai hosts", () => {
  const meta = globalThis.aiDebateProviderAdapters.meta;

  assert.equal(matchesProviderLocation({ hostname: "meta.ai", pathname: "/" }, meta), true);
  assert.equal(matchesProviderLocation({ hostname: "www.meta.ai", pathname: "/chat" }, meta), true);
  assert.equal(matchesProviderLocation({ hostname: "facebook.com", pathname: "/metaai" }, meta), false);
  assert.ok(meta.inputSelectors.length >= 2);
  assert.ok(meta.responseSelectors.length >= 3);
  assert.equal(meta.inputWriteStrategy, "single-editor-replace");
  assert.equal(meta.inputSelectors[0], "[data-testid='composer-input'][data-lexical-editor='true']");
  assert.equal(meta.preferredInputSelector, "[data-testid='composer-input'][data-lexical-editor='true'][contenteditable='true'][role='textbox']");
  assert.ok(meta.inputSelectors.includes("div[data-lexical-editor='true'][contenteditable='true'][role='textbox']"));
  assert.equal(meta.sendSelectors[0], "button[data-testid='composer-send-button']");
});

test("Gemini send selectors match the current composer without generic submit buttons", () => {
  const gemini = globalThis.aiDebateProviderAdapters.gemini;

  assert.ok(gemini.sendSelectors.includes("button[aria-label*='傳送']"));
  assert.equal(gemini.sendSelectors.includes("button[type='submit']"), false);
});

test("Grok and Gemini capture body selectors stay separate from Round 0 response selectors", () => {
  const { grok, gemini } = globalThis.aiDebateProviderAdapters;

  assert.match(grok.captureResponseSelector, /\[data-testid='assistant-message'\]/);
  assert.equal(grok.preferredResponseSelector, undefined);
  assert.equal(gemini.captureResponseSelector, "[id^='model-response-message-content']");
  assert.equal(gemini.preferredResponseSelector, undefined);
});

test("Claude prefers the markdown response body over repeated message chrome", () => {
  const claude = globalThis.aiDebateProviderAdapters.claude;

  assert.equal(claude.preferredResponseSelector, ".font-claude-response .standard-markdown");
  assert.equal(claude.responseSelectors[0], claude.preferredResponseSelector);
});

test("Meta AI prefers the verified Lexical editor over a later generic DOM candidate", async () => {
  const lexicalEditor = {
    disabled: false,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 100, height: 40 }),
  };
  const genericEditor = {
    disabled: false,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 100, height: 40 }),
  };
  const preferredSelector = globalThis.aiDebateProviderAdapters.meta.preferredInputSelector;
  const context = await loadProviderPageTestContext({
    document: {
      querySelectorAll: (selector) => selector === preferredSelector
        ? [lexicalEditor]
        : [lexicalEditor, genericEditor],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  assert.equal(context.aiDebateProviderPageTest.findInput(globalThis.aiDebateProviderAdapters.meta), lexicalEditor);
});

test("Meta AI contenteditable writing uses one serialized execCommand without events or fallback", async () => {
  const script = await readFile("src/content/provider-page.js", "utf8");
  const metaWrite = script.match(/if \(writeStrategy === "single-editor-replace"\) \{[\s\S]*?\n    \}/)?.[0];

  assert.ok(metaWrite);
  assert.equal((metaWrite.match(/document\.execCommand\("insertText"/g) || []).length, 1);
  assert.equal((metaWrite.match(/dispatchEvent/g) || []).length, 0);
  assert.match(metaWrite, /const selection = document\.getSelection\(\)/);
  assert.match(metaWrite, /!selection \|\| typeof document\.execCommand !== "function"/);
  assert.match(metaWrite, /selection\.selectAllChildren\(element\)/);
  assert.match(metaWrite, /const serializedText = String\(text \|\| ""\)[\s\S]*?replace\(\/\\r\\n\?\/g, "\\n"\)[\s\S]*?replace\(\/\\n\/g, "\\u2028"\)/);
  assert.match(metaWrite, /document\.execCommand\("insertText", false, serializedText\) === false/);
  assert.match(metaWrite, /await waitForInputWritten\(element, serializedText, INPUT_WRITE_TIMEOUT_MS, abortCheck\)/);
  assert.doesNotMatch(metaWrite, /textContent\s*=/);
  assert.match(script, /writeInput\(input, message\.prompt, config\.inputWriteStrategy, assertSourceConversation\)/);
  assert.match(script, /PROVIDER_INPUT_WRITE_FAILED/);
});

test("submission observes the replacement composer rather than a populated detached editor", async () => {
  const context = await loadProviderPageTestContext();
  const result = await context.aiDebateProviderPageTest.observeProviderSubmission(
    {}, { innerText: "prompt", isConnected: false }, "prompt", 0, true, () => {}, 20, false,
    { resolveInput: () => ({ innerText: "", isConnected: true }) },
  );
  assert.equal(result, "input-cleared");
});

test("missing or detached empty composer is not proof of submission", async () => {
  const context = await loadProviderPageTestContext({ document: { querySelectorAll: () => [] } });
  for (const resolveInput of [() => null, () => ({ innerText: "", isConnected: false })]) {
    assert.equal(await context.aiDebateProviderPageTest.observeProviderSubmission(
      {}, { innerText: "" }, "prompt", 0, true, () => {}, 10, false, { resolveInput },
    ), null);
  }
});

test("submission rechecks evidence when a background timer wakes after the deadline", async () => {
  let reads = 0;
  const context = await loadProviderPageTestContext({ document: { querySelectorAll: () => [] },
    setTimeout: (fn) => setTimeout(fn, 30) });
  const result = await context.aiDebateProviderPageTest.observeProviderSubmission(
    {}, {}, "prompt", 0, true, () => {}, 10, false,
    { resolveInput: () => ({ innerText: ++reads === 1 ? "prompt" : "", isConnected: true }) },
  );
  assert.equal(result, "input-cleared");
});

test("Meta AI write serializes line breaks, selects all, emits no events, and waits for delayed Lexical sync", async () => {
  const calls = [];
  let selectedElement = null;
  const context = await loadProviderPageTestContext({
    document: {
      getSelection: () => ({
        selectAllChildren: (element) => { selectedElement = element; },
      }),
      execCommand: (...args) => {
        calls.push(args);
        setTimeout(() => {
          editor.innerText = args[2];
        }, 20);
        return true;
      },
    },
  });
  let focusCount = 0;
  let eventCount = 0;
  const editor = {
    innerText: "舊內容",
    textContent: "舊內容",
    focus: () => { focusCount += 1; },
    dispatchEvent: () => { eventCount += 1; },
  };
  const prompt = "第一行\r\n\r\n第三行";

  await context.aiDebateProviderPageTest.writeInput(editor, prompt, "single-editor-replace");

  assert.equal(focusCount, 1);
  assert.equal(selectedElement, editor);
  assert.deepEqual(calls, [["insertText", false, "第一行\u2028\u2028第三行"]]);
  assert.equal(eventCount, 0);
  assert.equal(editor.innerText, "第一行\u2028\u2028第三行");
  // The send guard uses the original prompt, rather than execCommand's payload.
  await context.aiDebateProviderPageTest.waitForInputWritten(editor, prompt, 0);
  await assert.rejects(
    context.aiDebateProviderPageTest.waitForInputWritten(editor, "第一行\n第三行", 0),
    (error) => error.code === "PROVIDER_INPUT_WRITE_FAILED",
  );
});

test("Meta AI write reports PROVIDER_INPUT_WRITE_FAILED when execCommand returns false", async () => {
  const context = await loadProviderPageTestContext({
    document: {
      getSelection: () => ({ selectAllChildren: () => {} }),
      execCommand: () => false,
    },
  });

  await assert.rejects(
    context.aiDebateProviderPageTest.writeInput({ focus: () => {} }, "測試", "single-editor-replace"),
    (error) => error.code === "PROVIDER_INPUT_WRITE_FAILED",
  );
});

test("Meta replacement waits for Lexical selectionchange before editing the cached document", async () => {
  const editor = { innerText: "原草稿", textContent: "原草稿", focus() {} };
  let selected = false;
  let writes = 0;
  const context = await loadProviderPageTestContext({ document: {
    getSelection: () => ({ selectAllChildren() { setTimeout(() => { selected = true; }, 10); } }),
    execCommand(_command, _ui, value) {
      writes += 1;
      // Live Lexical silently restores the cached document if its selection
      // has not caught up yet, despite execCommand returning true.
      if (selected) editor.innerText = value;
      return true;
    },
  } });
  await context.aiDebateProviderPageTest.writeInput(editor, "第一行\n\n完整尾端", "single-editor-replace");
  assert.equal(writes, 1);
  await context.aiDebateProviderPageTest.waitForInputWritten(editor, "第一行\n\n完整尾端", 0);
});

test("Meta selection synchronization rechecks cancellation before changing the editor", async () => {
  let writes = 0;
  let checks = 0;
  const context = await loadProviderPageTestContext({ document: {
    getSelection: () => ({ selectAllChildren() {} }),
    execCommand() { writes += 1; return true; },
  } });
  const abortCheck = () => { if (++checks === 3) throw new Error("已停止"); };
  await assert.rejects(context.aiDebateProviderPageTest.writeInput({ focus() {} }, "新提示", "single-editor-replace", abortCheck),
    /已停止/);
  assert.equal(writes, 0);
});

async function sourceSubmissionFixture({ navigateBeforeWrite, navigateAfterWrite, navigateAfterClick, userTurnsBefore = [], userTurnsAfter = [] } = {}) {
  const config = globalThis.aiDebateProviderAdapters.meta;
  const sourceUrl = "https://www.meta.ai/prompt/test";
  const location = { hostname: "www.meta.ai", pathname: "/prompt/test", href: sourceUrl };
  const navigate = () => Object.assign(location, { pathname: "/prompt/other", href: "https://www.meta.ai/prompt/other" });
  if (navigateBeforeWrite) navigate();
  let value = "";
  let clicks = 0;
  let writes = 0;
  const prompt = "原問題\n\n互評引用\n完整尾端";
  const userTurns = (ids) => ids.map((id, index) => ({
    innerText: id.startsWith("different") ? "後來的另一題" : prompt, order: index,
    getAttribute: (name) => name === "data-message-id" ? id : null,
    getBoundingClientRect: () => ({ width: 320, height: 80 }),
    contains(other) { return other === this; },
    compareDocumentPosition(other) { return this.order < other.order ? 4 : 2; },
  }));
  const form = { querySelectorAll: (selector) => config.sendSelectors.includes(selector) ? [button] : [],
    parentElement: null };
  const editor = {
    tagName: "DIV", className: "", isConnected: true, parentElement: form,
    get innerText() { return value; }, get textContent() { return value; },
    getAttribute: (name) => ({ contenteditable: "true", role: "textbox", "data-testid": "composer-input" })[name] || null,
    getBoundingClientRect: () => ({ width: 320, height: 80 }),
    closest: () => form, focus() {},
  };
  const button = {
    disabled: false, isConnected: true, textContent: "傳送", className: "",
    getAttribute: (name) => ({ role: "button", "aria-label": "傳送" })[name] || null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }),
    click() { clicks += 1; value = ""; if (navigateAfterClick) navigate(); },
  };
  const context = await loadProviderPageTestContext({
    aiDebateProviderAdapters: globalThis.aiDebateProviderAdapters,
    aiDebateAutomationCore: globalThis.aiDebateAutomationCore,
    location,
    document: {
      querySelectorAll: (selector) => selector === config.preferredInputSelector || config.inputSelectors.includes(selector)
        ? [editor] : config.sendSelectors.includes(selector) ? [button]
          : selector === config.userMessageSelectors[0] ? userTurns(clicks ? userTurnsAfter : userTurnsBefore) : [],
      getSelection: () => ({ selectAllChildren() {} }),
      execCommand: (_command, _ui, text) => {
        writes += 1;
        value = text;
        if (navigateAfterWrite) navigate();
        return true;
      },
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  const submit = (options) => context.aiDebateProviderPageTest.submitPrompt({
    provider: "meta", prompt, phase: "critique-1", runId: "meta-regression", ...options,
  });
  return { submit, sourceUrl, counts: () => ({ clicks, writes }),
    submittedRun: () => context.aiDebateProviderPageTest.submittedRuns.get("meta-regression") };
}

test("Meta multi-line submission validates the original prompt and clicks exactly once", async () => {
  const fixture = await sourceSubmissionFixture();
  const result = await fixture.submit();
  assert.equal(result.ok, true);
  assert.equal(result.submission.method, "button");
  assert.equal(result.submission.evidence, "input-cleared");
  assert.equal(result.submission.retried, false);
  assert.deepEqual(fixture.counts(), { clicks: 1, writes: 1 });
});

test("source-summary rejects a changed conversation before editing or dispatching", async () => {
  const beforeWrite = await sourceSubmissionFixture({ navigateBeforeWrite: true });
  await assert.rejects(beforeWrite.submit({ expectedSourceUrl: beforeWrite.sourceUrl }), { code: "PROVIDER_CONVERSATION_CHANGED" });
  assert.deepEqual(beforeWrite.counts(), { clicks: 0, writes: 0 });

  const beforeDispatch = await sourceSubmissionFixture({ navigateAfterWrite: true });
  await assert.rejects(beforeDispatch.submit({ expectedSourceUrl: beforeDispatch.sourceUrl }), { code: "PROVIDER_CONVERSATION_CHANGED" });
  assert.deepEqual(beforeDispatch.counts(), { clicks: 0, writes: 1 });
});

test("source-summary confirms a single send when the provider navigates after dispatch", async () => {
  const fixture = await sourceSubmissionFixture({ navigateAfterClick: true });
  const result = await fixture.submit({ expectedSourceUrl: fixture.sourceUrl });
  assert.equal(result.submission.evidence, "input-cleared");
  assert.deepEqual(fixture.counts(), { clicks: 1, writes: 1 });
});

test("submit pins a replacement prompt turn when the visible matching count is unchanged", async () => {
  const fixture = await sourceSubmissionFixture({ userTurnsBefore: ["old-p", "different-q"], userTurnsAfter: ["new-p"] });
  await fixture.submit();
  assert.equal(fixture.submittedRun().baselinePromptCount, 1);
  assert.equal(fixture.submittedRun().submittedPromptIdentity, "new-p");

  const remount = await sourceSubmissionFixture({ userTurnsBefore: ["old-p", "different-q"], userTurnsAfter: ["old-p"] });
  await remount.submit();
  assert.equal(remount.submittedRun().submittedPromptIdentity, "");
});

test("controlled textarea writing waits for framework sync and rejects a reverted value", async () => {
  class ControlledTextarea {
    constructor() { this.current = ""; }
    get value() { return this.current; }
    set value(value) { this.current = value; }
    focus() {}
    dispatchEvent(event) {
      if (event.type === "input") {
        this.current = "舊內容";
        if (!this.revert) setTimeout(() => { this.current = event.data; }, 20);
      }
    }
  }
  const context = await loadProviderPageTestContext({
    HTMLTextAreaElement: ControlledTextarea,
    InputEvent: class { constructor(type, properties) { this.type = type; Object.assign(this, properties); } },
    Event: class { constructor(type) { this.type = type; } },
  });
  const editor = new ControlledTextarea();
  const prompt = "第一行\n\n完整尾端";
  await context.aiDebateProviderPageTest.writeInput(editor, prompt);
  assert.equal(editor.value, prompt);
  editor.revert = true;
  await assert.rejects(context.aiDebateProviderPageTest.writeInput(editor, prompt),
    (error) => error.code === "PROVIDER_INPUT_WRITE_FAILED");
});

test("Meta AI write reports PROVIDER_INPUT_WRITE_FAILED when selection is unavailable", async () => {
  const context = await loadProviderPageTestContext({
    document: {
      getSelection: () => null,
      execCommand: () => true,
    },
  });

  await assert.rejects(
    context.aiDebateProviderPageTest.writeInput({ focus: () => {} }, "測試", "single-editor-replace"),
    (error) => error.code === "PROVIDER_INPUT_WRITE_FAILED",
  );
});

test("stale input operation is cancelled after content reinjection", async () => {
  let releaseDelay;
  let delayStarted;
  const started = new Promise(resolve => { delayStarted = resolve; });
  let nativeWrites = 0;
  const context = await loadProviderPageTestContext({
    setTimeout(callback, ms) {
      if (ms === 150 && !releaseDelay) {
        releaseDelay = callback;
        delayStarted();
      } else {
        queueMicrotask(callback);
      }
      return 1;
    },
    document: { getSelection: () => ({ selectAllChildren() {} }), execCommand: () => { nativeWrites += 1; return true; } },
  });
  const api = context.aiDebateProviderPageTest;
  const initialExecution = context.__aiDebateAutomationExecutionId;
  const write = api.writeInput({ focus() {}, innerText: "" }, "這次提示", "single-editor-replace",
    () => api.assertAutomationEpoch(0));
  await started;

  // Same shared marker advanced by the provider-page bootstrap during reinjection.
  context.__aiDebateAutomationExecutionId = initialExecution + 1;
  releaseDelay();
  await assert.rejects(write, error => error.code === "PROVIDER_AUTOMATION_ABORTED");
  assert.equal(nativeWrites, 0);
});

test("Meta AI input verification polls until normalized Lexical text matches", async () => {
  const context = await loadProviderPageTestContext();
  const element = { innerText: "" };
  setTimeout(() => {
    element.innerText = "  第一行\r\n第二行  ";
  }, 20);

  await context.aiDebateProviderPageTest.waitForInputWritten(element, "第一行\n第二行", 200);
  await assert.rejects(
    context.aiDebateProviderPageTest.waitForInputWritten({ innerText: "錯誤內容" }, "預期內容", 20),
    (error) => error.code === "PROVIDER_INPUT_WRITE_FAILED",
  );
});

test("Gemini does not use Enter fallback when the prompt is no longer present", async () => {
  let enterCount = 0;
  let confirmationCount = 0;

  await assert.rejects(
    ensurePromptSubmitted({
      clickButton: () => true,
      pressEnter: () => { enterCount += 1; },
      promptStillPresent: async () => false,
      confirmSubmission: async () => {
        confirmationCount += 1;
        return null;
      },
    }),
    /Gemini 未確認送出/,
  );

  assert.equal(enterCount, 0);
  assert.equal(confirmationCount, 1);
});

test("Gemini readiness rejects visible text while the send button is disabled", async () => {
  const disabledButton = {
    disabled: true,
    getAttribute: (name) => name === "role" ? "button" : null,
    getBoundingClientRect: () => ({ width: 100, height: 40 }),
  };
  const context = await loadProviderPageTestContext({
    document: {
      querySelectorAll: () => [disabledButton],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });

  await assert.rejects(
    context.aiDebateProviderPageTest.waitForGeminiSubmissionReady(
      { sendSelectors: ["button.send-button"] },
      { innerText: "要送出的提示" },
      "要送出的提示",
      40,
    ),
    (error) => error.code === "PROVIDER_SUBMISSION_NOT_READY",
  );
});

test("Meta submission failure names the correct provider", async () => {
  await assert.rejects(
    ensurePromptSubmitted({
      clickButton: () => true,
      pressEnter: () => {},
      promptStillPresent: () => false,
      confirmSubmission: () => null,
      providerName: "Meta AI",
    }),
    /Meta AI 未確認送出/,
  );
});

function paragraphEditorFixture(lines) {
  return {
    innerText: lines.map((line) => line || "\n").join("\n\n"),
    matches: (selector) => selector === ".ProseMirror[contenteditable='true']",
    childNodes: lines.map((line) => ({
      tagName: "P",
      childNodes: line
        ? [{ nodeType: 3, textContent: line }]
        : [{ tagName: "BR", classList: { contains: (name) => name === "ProseMirror-trailingBreak" } }],
    })),
  };
}

test("multiline native editing preserves paragraphs when textContent has no line boundaries", async () => {
  const prompt = "第 5 輪對話。\n延續上一輪討論。\n\n**引用** 與完整尾端";
  const input = paragraphEditorFixture(["舊草稿"]);
  input.focus = () => {};
  // A direct DOM replacement is exactly the live failure: the framework
  // subsequently parses those raw newlines as spaces instead of paragraphs.
  Object.defineProperty(input, "textContent", {
    get: () => input.childNodes.map((p) => p.childNodes.map((n) => n.textContent || "").join("")).join(""),
    set(value) {
      Object.assign(input, paragraphEditorFixture([value.replace(/\n/g, " ")]));
    },
  });
  input.dispatchEvent = () => {};
  let selected;
  let writes = 0;
  const context = await loadProviderPageTestContext({
    InputEvent: class {},
    document: {
      getSelection: () => ({ selectAllChildren: (element) => { selected = element; } }),
      execCommand: (_command, _ui, value) => {
        writes += 1;
        Object.assign(input, paragraphEditorFixture(value.split("\n")));
        return true;
      },
    },
  });
  await context.aiDebateProviderPageTest.writeInput(input, prompt);
  assert.equal(selected, input);
  assert.equal(writes, 1);
  await context.aiDebateProviderPageTest.waitForInputWritten(input, prompt, 0);
  await assert.rejects(context.aiDebateProviderPageTest.waitForInputWritten(input, prompt.replace(/\n/g, " "), 0),
    (error) => error.code === "PROVIDER_INPUT_WRITE_FAILED");
});

test("generic native editing fails closed when selection or insertion is unavailable", async () => {
  for (const document of [
    { getSelection: () => null, execCommand: () => true },
    { getSelection: () => ({ selectAllChildren() {} }), execCommand: () => false },
  ]) {
    const context = await loadProviderPageTestContext({ document });
    await assert.rejects(context.aiDebateProviderPageTest.writeInput({ focus() {}, innerText: "測試" }, "測試"),
      (error) => error.code === "PROVIDER_INPUT_WRITE_FAILED");
  }
});

test("ChatGPT paragraph editor verifies exact source despite rendered paragraph spacing", async () => {
  const context = await loadProviderPageTestContext();
  const input = paragraphEditorFixture(["第一段", "", "第二段", "第三段"]);
  assert.notEqual(input.innerText, "第一段\n\n第二段\n第三段");
  await context.aiDebateProviderPageTest.waitForInputWritten(input, "第一段\n\n第二段\n第三段", 0);
});

test("ChatGPT verifies literal-paste line breaks and generated links without losing prompt text", async () => {
  const api = (await loadProviderPageTestContext()).aiDebateProviderPageTest;
  const href = "https://example.com/test?q=123&b=5";
  const prompt = `第一段\n\n參考 ${href}\n  **第二段**\n完整尾端`;
  const text = (textContent) => ({ nodeType: 3, textContent });
  const br = { tagName: "BR" };
  const literal = (...childNodes) => ({ tagName: "SPAN", childNodes,
    hasAttribute: (name) => name === "data-prompt-literal-paste" });
  const link = { tagName: "SPAN", textContent: href,
    getAttribute: (name) => ({ "data-rich-text-generated-autolink": "", "text-link-href": href })[name] ?? null,
    querySelectorAll: () => [{ tagName: "SPAN" }, { tagName: "svg" }, { tagName: "path" }] };
  const input = paragraphEditorFixture(["未套用"]);
  input.innerText = prompt.replaceAll("\n", "\n\n");
  input.childNodes[0].childNodes = [literal(text("第一段"), br, br, text("參考 ")), link,
    literal(br, text("  **第二段**"), br, text("完整尾端"))];
  await api.waitForInputWritten(input, prompt, 0);

  for (const mismatch of [prompt.replace("\n\n", "\n"), prompt.replace("完整尾端", "完整"), prompt.replace("b=5", "b=8")]) {
    await assert.rejects(api.waitForInputWritten(input, mismatch, 0), { code: "PROVIDER_INPUT_WRITE_FAILED" });
  }
  link.textContent = "https://example.com/different";
  await assert.rejects(api.waitForInputWritten(input, prompt, 0), { code: "PROVIDER_INPUT_WRITE_FAILED" });
  link.textContent = href;
  input.childNodes[0].childNodes[2].childNodes.push({ tagName: "IMG" });
  await assert.rejects(api.waitForInputWritten(input, prompt, 0), { code: "PROVIDER_INPUT_WRITE_FAILED" });
});

test("ChatGPT verifies literal color-code spans and empty matching swatches without losing source", async () => {
  const context = await loadProviderPageTestContext();
  const input = paragraphEditorFixture(["第 1 輪對話。", "", "底色 #0e3a4a", "尾端"]);
  const text = value => ({nodeType: 3, textContent: value});
  const span = {tagName: "SPAN", childNodes: [text("#0e3a4a")],
    classList: {contains: name => name === "inline-markdown"}};
  const attrs = {"aria-hidden": "true", "contenteditable": "false", "data-hex-color-swatch": "#0e3a4a"};
  const swatch = {tagName: "SPAN", textContent: "", childNodes: [],
    getAttribute: name => attrs[name] ?? null,
    classList: {contains: name => name === "ProseMirror-widget"}};
  const separatorAttrs = {alt: "", src: null};
  const separator = {tagName: "IMG", childNodes: [],
    classList: {contains: name => name === "ProseMirror-separator"},
    getAttribute: name => separatorAttrs[name] ?? null};
  const trailingBreak = {tagName: "BR", classList: {contains: name => name === "ProseMirror-trailingBreak"}};
  input.childNodes[2].childNodes = [text("底色 "), span, swatch, separator, trailingBreak];
  const prompt = "第 1 輪對話。\n\n底色 #0e3a4a\n尾端";
  await context.aiDebateProviderPageTest.waitForInputWritten(input, prompt, 0);
  for (const corrupted of [prompt.replace("#0e3a4a", "#0e3a4b"), prompt.replace("\n\n", "\n"), prompt + "遺漏"]) {
    await assert.rejects(context.aiDebateProviderPageTest.waitForInputWritten(input, corrupted, 0), e => e.code === "PROVIDER_INPUT_WRITE_FAILED");
  }
  for (const mutation of [
    () => { swatch.textContent = "額外文字"; },
    () => { swatch.textContent = ""; attrs["data-hex-color-swatch"] = "#abcdef"; },
    () => { attrs["data-hex-color-swatch"] = "#0e3a4a"; swatch.childNodes = [{tagName: "IMG"}]; },
    () => { swatch.childNodes = []; attrs["aria-hidden"] = "false"; },
  ]) {
    mutation();
    await assert.rejects(context.aiDebateProviderPageTest.waitForInputWritten(input, prompt, 0), e => e.code === "PROVIDER_INPUT_WRITE_FAILED");
  }
  attrs["aria-hidden"] = "true";
  separatorAttrs.src = "https://example.invalid/attachment.png";
  await assert.rejects(context.aiDebateProviderPageTest.waitForInputWritten(input, prompt, 0), e => e.code === "PROVIDER_INPUT_WRITE_FAILED");
  separatorAttrs.src = null;
  separatorAttrs.alt = "附件";
  await assert.rejects(context.aiDebateProviderPageTest.waitForInputWritten(input, prompt, 0), e => e.code === "PROVIDER_INPUT_WRITE_FAILED");
});

test("ChatGPT paragraph verification rejects missing text, extra blank lines and partial writes", async () => {
  const context = await loadProviderPageTestContext();
  const input = paragraphEditorFixture(["第一段", "", "第二段"]);
  for (const prompt of ["第一段\n第二段", "第一段\n\n\n第二段", "第一段\n\n第二段遺漏的尾巴"]) {
    await assert.rejects(context.aiDebateProviderPageTest.waitForInputWritten(input, prompt, 0),
      (error) => error.code === "PROVIDER_INPUT_WRITE_FAILED");
  }
});

test("failed input verification reports lengths and mismatch location without source text", async () => {
  const context = await loadProviderPageTestContext();
  const input = { innerText: "私密內容", tagName: "DIV", isConnected: false, matches: () => false };
  await assert.rejects(context.aiDebateProviderPageTest.waitForInputWritten(input, "私密內容\n遺漏", 0), (error) => {
    assert.equal(error.debugDetails.reason, "verification-timeout");
    assert.equal(error.debugDetails.expectedLength, 7);
    assert.equal(error.debugDetails.actualLength, 4);
    assert.equal(error.debugDetails.firstMismatch, 4);
    assert.equal(error.debugDetails.expectedLines, 2);
    assert.equal(error.debugDetails.connected, false);
    assert.doesNotMatch(JSON.stringify(error.debugDetails), /私密|遺漏/);
    return true;
  });
});

test("Meta Lexical accepts only the observed lightning emoji presentation conversion", async () => {
  const context = await loadProviderPageTestContext();
  const input = { innerText: "第一行\u2028⚡\uFE0F Grok", matches: s => s === "[data-lexical-editor='true']" };
  await context.aiDebateProviderPageTest.waitForInputWritten(input, "第一行\n⚡ Grok", 0);
  for (const actual of ["第一行\n⚡️ Gro", "第一行\n⚡️  Grok", "第一行\n⚡\u200b Grok", "第一行\n⚡ Grok\n新增"]) {
    input.innerText = actual;
    await assert.rejects(context.aiDebateProviderPageTest.waitForInputWritten(input, "第一行\n⚡ Grok", 0), e => e.code === "PROVIDER_INPUT_WRITE_FAILED");
  }
  input.innerText = "第一行\n⚡️ Grok";
  input.matches = () => false;
  await assert.rejects(context.aiDebateProviderPageTest.waitForInputWritten(input, "第一行\n⚡ Grok", 0), e => e.code === "PROVIDER_INPUT_WRITE_FAILED");
});

test("active service banners block submission confirmation and ignore quoted or editor text", async () => {
  const banner = { innerText: "Your free messages return at 4:30 AM.", closest: () => null,
    getBoundingClientRect: () => ({width: 300, height: 30}) };
  const context = await loadProviderPageTestContext({
    aiDebateAutomationCore: globalThis.aiDebateAutomationCore,
    document: { querySelectorAll: s => s === ".service" ? [banner] : [] },
    getComputedStyle: () => ({display: "block", visibility: "visible", opacity: "1"}),
  });
  const config = {serviceStatusSelectors: [".service"]};
  assert.equal(context.aiDebateProviderPageTest.readBlockingServiceStatus(config, "claude").classification.code, "PROVIDER_QUOTA_EXCEEDED");
  await assert.rejects(context.aiDebateProviderPageTest.observeProviderSubmission(config, {innerText: ""}, "prompt", 0, true,
    () => {}, 0, false, {providerId: "claude"}), e=>e.code === "PROVIDER_QUOTA_EXCEEDED");
  banner.closest = () => ({});
  assert.equal(context.aiDebateProviderPageTest.readBlockingServiceStatus(config, "claude"), null);
  banner.closest = () => null;
  banner.innerText = "We discussed: Your free messages return at 4:30 AM. This was a quote.";
  assert.equal(context.aiDebateProviderPageTest.readBlockingServiceStatus(config, "claude"), null);
});

test("ChatGPT paragraph reader preserves literal Markdown and inline breaks without ignoring unknown nodes", async () => {
  const context = await loadProviderPageTestContext();
  const input = paragraphEditorFixture(["**引用**", "尾端"]);
  input.childNodes[0].childNodes.push({ tagName: "BR" }, { nodeType: 3, textContent: "換行" });
  await context.aiDebateProviderPageTest.waitForInputWritten(input, "**引用**\n換行\n尾端", 0);
  input.childNodes[0].childNodes.push({ tagName: "IMG", textContent: "" });
  await assert.rejects(context.aiDebateProviderPageTest.waitForInputWritten(input, "**引用**\n換行\n尾端", 0),
    (error) => error.code === "PROVIDER_INPUT_WRITE_FAILED");
  input.childNodes[0].childNodes.pop();
  input.matches = () => false;
  await assert.rejects(context.aiDebateProviderPageTest.waitForInputWritten(input, "**引用**\n換行\n尾端", 0),
    (error) => error.code === "PROVIDER_INPUT_WRITE_FAILED");
});

test("Gemini accepts exact Markdown reconstructed from asynchronously formatted Quill text", async () => {
  const textNode = (text) => ({ nodeType: 3, textContent: text });
  const input = {
    innerText: "題目：重要內容",
    matches: (selector) => selector === ".ql-editor.rich-query-formatting-enabled",
    childNodes: [textNode("題目："), { tagName: "STRONG", childNodes: [textNode("重要內容")] }],
    getBoundingClientRect: () => ({ width: 320, height: 40 }),
  };
  const button = {
    disabled: false,
    getAttribute: (name) => name === "role" ? "button" : null,
    getBoundingClientRect: () => ({ width: 100, height: 40 }),
  };
  const composer = { querySelectorAll: () => [button] };
  input.parentElement = composer;
  input.closest = (selector) => selector === ".composer" ? composer : null;
  const context = await loadProviderPageTestContext({
    document: { querySelectorAll: (selector) => selector === ".editor" ? [input] : [button] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  const api = context.aiDebateProviderPageTest;
  const config = { preferredInputSelector: ".editor", sendSelectors: ["button.send-button"], composerRootSelectors: [".composer"] };
  assert.equal(await api.waitForGeminiSubmissionReady(config, input, "題目：**重要內容**", 40), button);
  await api.waitForInputWritten(input, "題目：**重要內容**", 40);
  await assert.rejects(api.waitForGeminiSubmissionReady(config, input, "題目：**別的內容**", 40),
    (error) => error.code === "PROVIDER_SUBMISSION_NOT_READY");
  input.matches = () => false;
  await assert.rejects(api.waitForGeminiSubmissionReady(config, input, "題目：**重要內容**", 40),
    (error) => error.code === "PROVIDER_SUBMISSION_NOT_READY");
});

test("Gemini readiness returns the send button only after it becomes enabled", async () => {
  let enabled = false;
  const button = {
    get disabled() {
      return !enabled;
    },
    getAttribute: (name) => name === "role" ? "button" : null,
    getBoundingClientRect: () => ({ width: 100, height: 40 }),
  };
  const input = { tagName: "TEXTAREA", value: "要送出的提示", innerText: "要送出的提示",
    getAttribute: () => null, getBoundingClientRect: () => ({ width: 320, height: 40 }) };
  const composer = { querySelectorAll: () => [button] };
  input.parentElement = composer;
  input.closest = (selector) => selector === ".composer" ? composer : null;
  const context = await loadProviderPageTestContext({
    document: { querySelectorAll: (selector) => selector === ".editor" ? [input] : [button] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  setTimeout(() => { enabled = true; }, 20);

  assert.equal(
    await context.aiDebateProviderPageTest.waitForGeminiSubmissionReady(
      { preferredInputSelector: ".editor", sendSelectors: ["button.send-button"], composerRootSelectors: [".composer"] },
      input,
      "要送出的提示",
      200,
    ),
    button,
  );
});

test("Gemini Quill paragraph placeholders preserve exact blank lines rather than double-counting BR", async () => {
  const text = (value) => ({ nodeType: 3, textContent: value });
  const paragraphs = [
    { tagName: "P", childNodes: [text("第一段")] },
    { tagName: "P", childNodes: [{ tagName: "BR" }] },
    { tagName: "P", childNodes: [text("第二段")] },
  ];
  paragraphs.forEach((p, index) => { p.nextSibling = paragraphs[index + 1] || null; });
  const input = { innerText: "第一段\n\n\n\n\n第二段",
    matches: (selector) => selector === ".ql-editor.rich-query-formatting-enabled", childNodes: paragraphs };
  const context = await loadProviderPageTestContext();
  await context.aiDebateProviderPageTest.waitForInputWritten(input, "第一段\n\n第二段", 40);
  await assert.rejects(context.aiDebateProviderPageTest.waitForInputWritten(input, "第一段\n第二段", 40),
    (error) => error.code === "PROVIDER_INPUT_WRITE_FAILED");
});

test("response collection rejects a later manual user turn instead of attributing its answer", async () => {
  const makeNode = (text) => ({ innerText: text, contains(other) { return other === this; },
    getBoundingClientRect: () => ({ width: 400, height: 50 }) });
  const users = [makeNode("original"), makeNode("manual follow-up")];
  const context = await loadProviderPageTestContext({
    document: { querySelectorAll: (selector) => selector === ".user" ? users : [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  await assert.rejects(context.aiDebateProviderPageTest.waitForCompletion(
    { userMessageSelectors: [".user"] }, "chatgpt", 100, {}, "original", [], () => {}, 0,
  ), (error) => {
    assert.equal(error.code, "PROVIDER_CONVERSATION_CHANGED");
    assert.equal(error.debugDetails.expectedUserTurns, 1);
    assert.equal(error.debugDetails.actualUserTurns, 2);
    return true;
  });
});

test("anchored answer with identical text but a new message identity is accepted", async () => {
  const f = conversationFixture([
    { role: "User", text: "這次提示", attributes: { "data-message-id": "user-1" } },
    { role: "AI", text: "相同答案", attributes: { "data-message-id": "assistant-1" } },
    { role: "User", text: "這次提示", attributes: { "data-message-id": "user-2" } },
    { role: "AI", text: "相同答案", attributes: { "data-message-id": "assistant-2" } },
  ]);
  f.context.location = { hostname: "grok.com", pathname: "/chat/test-thread", search: "", hash: "" };
  f.context.aiDebateAutomationCore = { ...globalThis.aiDebateAutomationCore, matchesProviderLocation };
  assert.equal(matchesProviderLocation(f.context.location, globalThis.aiDebateProviderAdapters.grok), true);
  const context = await loadProviderPageTestContext(f.context);
  const config = { locations: globalThis.aiDebateProviderAdapters.grok.locations,
    responseSelectors: ["assistant"], userMessageSelectors: ["user"], stopSelectors: [], errorSelectors: [] };
  const result = await context.aiDebateProviderPageTest.waitForCompletion(
    config, "grok", 10000, assistantSnapshot([{ text: "相同答案", identity: "assistant-1" }]),
    "這次提示", [], () => {}, 1, { baselinePromptCount: 1 },
  );

  assert.equal(result, "相同答案");
});

test("anchored answer accepts the submitted turn even when virtualization keeps the prompt count unchanged", async () => {
  const f = conversationFixture([
    { role: "User", text: "這次提示", attributes: { "data-message-id": "user-new" } },
    { role: "AI", text: "相同答案", attributes: { "data-message-id": "assistant-new" } },
  ]);
  f.context.location = { hostname: "grok.com", pathname: "/chat/test-thread", search: "", hash: "" };
  f.context.aiDebateAutomationCore = { ...globalThis.aiDebateAutomationCore, matchesProviderLocation };
  const context = await loadProviderPageTestContext(f.context);
  const config = { ...globalThis.aiDebateProviderAdapters.grok,
    stopSelectors: [], errorSelectors: [] };
  const result = await context.aiDebateProviderPageTest.waitForCompletion(
    config, "grok", 10000, assistantSnapshot([{ text: "相同答案", identity: "assistant-old" }]),
    "這次提示", [], () => {}, 1,
    { baselinePromptCount: 1, conversationIdentity: "test-thread", submittedPromptIdentity: "user-new" },
  );

  assert.equal(result, "相同答案");
});

test("virtualized P/A then Q/B then P never reuses answer A when only the old P is visible", async () => {
  const f = conversationFixture([
    { role: "User", text: "這次提示", attributes: { "data-message-id": "user-old" } },
    { role: "AI", text: "舊答案", attributes: { "data-message-id": "assistant-old" } },
  ]);
  f.context.location = { hostname: "grok.com", pathname: "/chat/test-thread", search: "", hash: "" };
  f.context.aiDebateAutomationCore = { ...globalThis.aiDebateAutomationCore, matchesProviderLocation };
  const context = await loadProviderPageTestContext(f.context);
  const config = { ...globalThis.aiDebateProviderAdapters.grok,
    stopSelectors: [], errorSelectors: [] };
  for (const submittedPromptIdentity of ["user-new", ""]) {
    const result = await context.aiDebateProviderPageTest.waitForCompletion(
      config, "grok", 10000, assistantSnapshot([{ text: "另一題的答案 B", identity: "assistant-q" }]),
      "這次提示", [], () => {}, 2,
      { baselinePromptCount: 1, conversationIdentity: "test-thread", submittedPromptIdentity, pollBudgetMs: 3500 },
    );
    assert.equal(result, null);
  }
});

async function chatGptCritiqueFixture() {
  const config = globalThis.aiDebateProviderAdapters.chatgpt;
  const head = "Round two critique. Read the following quoted participants before replying.";
  const tail = "Now propose a concrete next step and mention any disagreement that remains.";
  const prompt = `${head}\nParticipant One: an inline URL https://example.com/reply?q=1\n${tail}`;
  const displayed = prompt.replace("https://example.com/reply?q=1", "example.com/reply?q=1");
  const key = "data-chatgpt-search-unit-key";
  const entry = [
    { role: "User", text: "原本的問題", attributes: { [key]: "first:user" } },
    { role: "AI", text: "第一輪舊回答", attributes: { "data-chatgpt-selection-message-id": "first-reply" } },
    { role: "User", text: displayed, attributes: { [key]: "critique:user" } },
    { role: "AI", text: "第二輪完整回覆\n保留結尾", attributes: { "data-chatgpt-selection-message-id": "critique-reply" } },
  ];
  const fixture = conversationFixture(entry);
  const [oldUser, oldReply, newUser, newReply] = fixture.nodes;
  let value = "";
  let sends = 0;
  let mountNewTurn = false;
  const editor = {
    tagName: "DIV", isConnected: true, focus() {},
    get innerText() { return value; },
    getAttribute: (name) => ({ contenteditable: "true", role: "textbox" })[name] ?? null,
    getBoundingClientRect: () => ({ width: 320, height: 80 }),
    closest: () => composer,
  };
  const send = {
    getAttribute: (name) => ({ role: "button", "data-testid": "send-button" })[name] ?? null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }),
    click() { sends++; value = ""; },
  };
  const composer = { querySelectorAll: (selector) => selector === config.sendSelectors[0] ? [send] : [] };
  const context = await loadProviderPageTestContext({ ...fixture.context,
    location: { hostname: "chatgpt.com", pathname: "/c/critique-thread" },
    document: {
      querySelectorAll(selector) {
        if (selector === config.preferredInputSelector) return [editor];
        if (selector === config.userMessageSelectors[0]) return mountNewTurn ? [oldUser, newUser] : [oldUser];
        if (selector === config.responseSelectors[0]) return mountNewTurn ? [oldReply, newReply] : [oldReply];
        return [];
      },
      getSelection: () => ({ selectAllChildren() {} }),
      execCommand: (_command, _ui, text) => { value = text; return true; },
    },
  });
  const api = context.aiDebateProviderPageTest;
  const request = { provider: "chatgpt", phase: "critique-1", runId: "critique" };
  await api.submitPrompt({ ...request, prompt });
  mountNewTurn = true;
  return { api, entry, request, head, newUser, sends: () => sends };
}

test("ChatGPT collects the new critique after the editor clears and its prompt renders differently", async () => {
  const { api, request, sends, newUser } = await chatGptCritiqueFixture();
  const run = api.submittedRuns.get(request.runId);
  assert.equal(run.submittedPromptIdentity, "");

  const pending = await api.readSubmittedResponse({ ...request, pollBudgetMs: 750 });
  assert.equal(pending.pending, true);
  newUser.innerText = newUser.innerText.replace("an inline URL ", " 網址 \n");
  newUser.textContent = newUser.innerText;

  const result = await api.readSubmittedResponse({ ...request, pollBudgetMs: 5000 });
  assert.equal(result.content, "第二輪完整回覆\n保留結尾");
  assert.equal(run.submittedPromptIdentity, "critique:user");
  assert.deepEqual(Array.from(run.previousUserTurnIdentities), ["first:user"]);
  assert.equal(sends(), 1);
});

test("ChatGPT rebinds an optimistic critique ID after the same submitted prompt renders", async () => {
  const { api, request, sends } = await chatGptCritiqueFixture();
  const run = api.submittedRuns.get(request.runId);
  run.submittedPromptIdentity = "temporary-critique:user";
  const pending = await api.readSubmittedResponse({ ...request, pollBudgetMs: 750 });
  assert.equal(pending.pending, true);
  assert.equal(run.submittedPromptIdentity, "critique:user");

  const result = await api.readSubmittedResponse({ ...request, pollBudgetMs: 5000 });
  assert.equal(result.content, "第二輪完整回覆\n保留結尾");
  assert.equal(sends(), 1);
});

test("ChatGPT collects a committed critique after earlier user turns are virtualized", async () => {
  const { api, request, newUser, sends } = await chatGptCritiqueFixture();
  const run = api.submittedRuns.get(request.runId);
  run.submittedPromptIdentity = "temporary-critique:user";
  run.previousUserTurnIdentities = ["virtualized-away:user", "first:user"];
  run.userTurnCount = 2;
  newUser.innerText = run.prompt;
  newUser.textContent = run.prompt;

  const result = await api.readSubmittedResponse({ ...request, pollBudgetMs: 5000 });
  assert.equal(result.content, "第二輪完整回覆\n保留結尾");
  assert.equal(run.submittedPromptIdentity, "critique:user");
  assert.equal(sends(), 1);
});

test("ChatGPT rejects ambiguous critique turns despite a complete assistant message", async () => {
  const key = "data-chatgpt-search-unit-key";
  for (const mode of ["reused-id", "replaced-history", "unrelated-prompt"]) {
    const { api, entry, request, head, newUser } = await chatGptCritiqueFixture();
    api.submittedRuns.get(request.runId).submittedPromptIdentity = "temporary-critique:user";
    if (mode === "reused-id") entry[2].attributes[key] = "first:user";
    if (mode === "replaced-history") entry[0].attributes[key] = "different:user";
    if (mode === "unrelated-prompt") {
      newUser.innerText = `${head} 問了另一件事。`;
      newUser.textContent = newUser.innerText;
    }
    await assert.rejects(api.readSubmittedResponse({ ...request, timeoutMs: 4000, pollBudgetMs: 6500 }),
      (error) => error.code === "PROVIDER_RESPONSE_TIMEOUT" && error.debugDetails?.reason === "submitted-user-turn-not-found", mode);
  }
});

test("submitted run is bound to the confirmed conversation route", async () => {
  const context = await loadProviderPageTestContext({
    aiDebateAutomationCore: { ...globalThis.aiDebateAutomationCore, matchesProviderLocation },
    location: { hostname: "chatgpt.com", pathname: "/c/other-thread", search: "", hash: "" },
    aiDebateProviderAdapters: globalThis.aiDebateProviderAdapters,
  });
  context.aiDebateProviderPageTest.submittedRuns.set("route-bound", {
    providerId: "chatgpt", epoch: 0, phase: "first-round", prompt: "這次提示",
    baseline: assistantSnapshot([]), errorBaseline: [], submittedAt: Date.now(),
    conversationIdentity: "expected-thread", baselinePromptCount: 0,
  });

  await assert.rejects(context.aiDebateProviderPageTest.readSubmittedResponse({
    provider: "chatgpt", runId: "route-bound", epoch: 0,
  }), error => error.code === "PROVIDER_CONVERSATION_CHANGED");
});

test("new conversation route is bound when its ID arrives after submission confirmation", async () => {
  const user = { innerText: "這次提示", textContent: "這次提示", contains: other => other === user,
    getAttribute: name => name === "data-message-author-role" ? "user" : null,
    getBoundingClientRect: () => ({ width: 400, height: 40 }) };
  const context = await loadProviderPageTestContext({
    aiDebateAutomationCore: { ...globalThis.aiDebateAutomationCore, matchesProviderLocation },
    aiDebateProviderAdapters: globalThis.aiDebateProviderAdapters,
    location: { hostname: "chatgpt.com", pathname: "/c/new-thread", search: "", hash: "" },
    document: { querySelectorAll: selector => selector.includes("data-message-author-role='user'") ? [user] : [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  const run = { providerId: "chatgpt", epoch: 0, phase: "first-round", prompt: "這次提示",
    baseline: assistantSnapshot([]), errorBaseline: [], submittedAt: Date.now(), userTurnCount: 0,
    baselinePromptCount: 0, conversationIdentity: null };
  context.aiDebateProviderPageTest.submittedRuns.set("late-route", run);

  const result = await context.aiDebateProviderPageTest.readSubmittedResponse({
    provider: "chatgpt", runId: "late-route", epoch: 0, pollBudgetMs: 1,
  });
  assert.equal(result.pending, true);
  assert.equal(run.conversationIdentity, "new-thread");
});

test("response candidate buffer keeps a Meta answer across virtualized DOM gaps", async () => {
  const candidate = {
    innerText: "Meta 第一次回答",
    contains: () => false,
    getBoundingClientRect: () => ({ width: 100, height: 40 }),
  };
  let visible = true;
  const context = await loadProviderPageTestContext({
    aiDebateAutomationCore: globalThis.aiDebateAutomationCore,
    document: {
      querySelectorAll: (selector) => selector === ".assistant"
        ? (visible ? [candidate] : [])
        : [],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  const config = {
    responseSelectors: [".assistant"],
    userMessageSelectors: [],
    stopSelectors: [],
    errorSelectors: [],
  };
  setTimeout(() => { visible = false; }, 600);

  const result = await context.aiDebateProviderPageTest.waitForCompletion(
    config,
    "meta",
    4000,
    assistantSnapshot([]),
    "這次提示",
    [],
  );

  assert.equal(result, "Meta 第一次回答");
});

test("response candidate buffer updates to a growing answer", async () => {
  const context = await loadProviderPageTestContext({
    aiDebateAutomationCore: globalThis.aiDebateAutomationCore,
  });
  const baseline = assistantSnapshot([]);
  let buffer = context.aiDebateProviderPageTest.createResponseCandidateBuffer();

  buffer = context.aiDebateProviderPageTest.updateResponseCandidateBuffer(
    buffer,
    baseline,
    assistantSnapshot(["回答起點"]),
    "這次提示",
    100,
  );
  buffer = context.aiDebateProviderPageTest.updateResponseCandidateBuffer(
    buffer,
    baseline,
    assistantSnapshot(["回答起點，這是持續生成的完整內容"]),
    "這次提示",
    200,
  );

  assert.equal(buffer.text, "回答起點，這是持續生成的完整內容");
  assert.equal(buffer.stableSince, 200);
});

test("response candidate buffer ignores an unchanged baseline answer", async () => {
  const context = await loadProviderPageTestContext({
    aiDebateAutomationCore: globalThis.aiDebateAutomationCore,
  });
  const baseline = assistantSnapshot(["舊回答"]);
  const buffer = context.aiDebateProviderPageTest.updateResponseCandidateBuffer(
    context.aiDebateProviderPageTest.createResponseCandidateBuffer(),
    baseline,
    assistantSnapshot(["舊回答"]),
    "這次提示",
    100,
  );

  assert.equal(buffer.text, "");
});

test("submission correlation accepts UI text around the submitted prompt", async () => {
  const context = await loadProviderPageTestContext();

  assert.equal(
    context.aiDebateProviderPageTest.userMessageContainsPrompt("你問：\n這次提示\n複製回覆", "這次提示"),
    true,
  );
  assert.equal(
    context.aiDebateProviderPageTest.userMessageContainsPrompt("另一個無關訊息", "這次提示"),
    false,
  );
});

test("submission generation evidence requires a false-to-true transition", async () => {
  let generating = true;
  // 使用可控時鐘，避免機器忙碌時跨過期限；不放寬生成訊號的判定。
  let now = 0;
  let startOnNextTick = false;
  const stopButton = {
    disabled: false,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }),
  };
  const context = await loadProviderPageTestContext({
    aiDebateAutomationCore: globalThis.aiDebateAutomationCore,
    Date: class extends Date { static now() { return now; } },
    setTimeout: (callback, milliseconds) => {
      now += milliseconds;
      if (startOnNextTick) generating = true;
      callback();
      return 0;
    },
    document: {
      querySelectorAll: (selector) => selector === ".stop" && generating ? [stopButton] : [],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  const config = { stopSelectors: [".stop"], userMessageSelectors: [] };

  assert.equal(
    await context.aiDebateProviderPageTest.observeProviderSubmission(
      config,
      {},
      "這次提示",
      0,
      false,
      () => {},
      25,
      true,
    ),
    null,
  );

  generating = false;
  startOnNextTick = true;
  assert.equal(
    await context.aiDebateProviderPageTest.observeProviderSubmission(
      config,
      {},
      "這次提示",
      0,
      false,
      () => {},
      250,
      false,
    ),
    "generation-started",
  );
});

test("completion timing extends inactivity but never passes the hard cap", async () => {
  const context = await loadProviderPageTestContext();

  const timing = context.aiDebateProviderPageTiming;
  const initial = timing.createCompletionWindow(240000, 1000);
  assert.equal(initial.inactivityDeadline, 241000);
  assert.equal(initial.hardDeadline, 721000);

  const extended = timing.extendCompletionWindow(initial, 200000);
  assert.equal(extended.inactivityDeadline, 440000);
  assert.equal(timing.extendCompletionWindow(extended, 700000).inactivityDeadline, 721000);
});

test("assistantSnapshot records assistant message count and latest text", () => {
  assert.deepEqual(
    assistantSnapshot(["舊回答", "新回答"]),
    { count: 2, lastText: "新回答", lastFingerprint: "新回答", lastIdentity: "" },
  );
});

test("assistant snapshots retain response fingerprints and explicit turn identity", () => {
  const baseline = assistantSnapshot([{ text: "舊回答", identity: "turn-1" }]);
  const current = assistantSnapshot([{ text: "新回答", identity: "turn-2" }]);
  assert.equal(current.lastIdentity, "turn-2");
  assert.equal(current.lastFingerprint, "新回答");
  assert.equal(hasFreshAssistantResponse(baseline, current), true);
});

test("assistant identity change alone is not fresh response evidence", () => {
  const baseline = assistantSnapshot([{ text: "相同回答", identity: "turn-1" }]);
  const current = assistantSnapshot([{ text: "相同回答", identity: "turn-2" }]);

  assert.equal(hasFreshAssistantResponse(baseline, current), false);
});

test("hasFreshAssistantResponse rejects unchanged prior conversation content", () => {
  const baseline = assistantSnapshot(["舊回答"]);

  assert.equal(hasFreshAssistantResponse(baseline, assistantSnapshot(["舊回答"])), false);
});

test("hasFreshAssistantResponse accepts an appended assistant reply", () => {
  const baseline = assistantSnapshot(["舊回答"]);

  assert.equal(hasFreshAssistantResponse(baseline, assistantSnapshot(["舊回答", "這次的新回答"])), true);
});

test("hasFreshAssistantResponse accepts changed text while a streaming message grows", () => {
  const baseline = assistantSnapshot([]);

  assert.equal(hasFreshAssistantResponse(baseline, assistantSnapshot(["串流中的文字"])), true);
});

test("provider error fingerprints ignore formatting but detect new or changed content", () => {
  const baseline = [providerErrorFingerprint("Old alert: try again later")];

  assert.equal(hasFreshProviderError(baseline, " old  alert:  try again later "), false);
  assert.equal(hasFreshProviderError(baseline, "Old alert: try again now"), true);
  assert.equal(hasFreshProviderError(baseline, "New server capacity reached"), true);
});

test("formatStageError preserves the failing automation stage", () => {
  assert.equal(
    formatStageError("尋找輸入框", new Error("找不到 Gemini 輸入框")),
    "[尋找輸入框] 找不到 Gemini 輸入框",
  );
});

test("isPromptEcho detects the user's submitted prompt despite whitespace differences", () => {
  assert.equal(isPromptEcho("請分析：\nPony V6", "  請分析： Pony V6  "), true);
  assert.equal(isPromptEcho("請分析 Pony V6", "我的結論：Pony V6 仍然很強"), false);
});

test("Gemini response removes only a final standalone image artifact", () => {
  assert.equal(normalizeProviderResponse("gemini", "分析完成\nimage"), "分析完成");
  assert.equal(normalizeProviderResponse("gemini", "This is an image"), "This is an image");
});

test("provider response normalization removes only known standalone UI noise", () => {
  assert.equal(
    normalizeProviderResponse("chatgpt", "真正回答\n到目前為止，這段對話有幫助嗎？\n你是否喜歡這種個性？"),
    "真正回答",
  );
  assert.equal(
    normalizeProviderResponse("gemini", "Gemini 說了\nTest successful."),
    "Test successful.",
  );
  assert.equal(
    normalizeProviderResponse("meta", "顯示思考過程\nSystem check looks good."),
    "System check looks good.",
  );
  assert.equal(
    normalizeProviderResponse("chatgpt", "真正回答\n\n資料來源"),
    "真正回答",
  );
  assert.equal(
    normalizeProviderResponse("chatgpt", "資料來源\n這是正文，不是尾端按鈕"),
    "資料來源\n這是正文，不是尾端按鈕",
  );
});

test("Claude response removes status rows and duplicated wrapper text", () => {
  assert.equal(
    normalizeProviderResponse(
      "claude",
      "Claude responded: 哈，這是什麼，AI 界的點名時間嗎？\n識別並拒絕了偽裝成思考的操縱企圖。\n\uE027\n識別並拒絕了偽裝成思考的操縱企圖。\n哈，這是什麼，AI 界的點名時間嗎？",
    ),
    "哈，這是什麼，AI 界的點名時間嗎？",
  );
  assert.equal(
    normalizeProviderResponse("claude", "Claude responded: Hey!\nThought for 2s\n\uE027\nThought for 2s\nHey! I'm here."),
    "Hey! I'm here.",
  );
});

test("Claude keeps a response when only the accessibility label is available", () => {
  assert.equal(
    normalizeProviderResponse("claude", "Claude responded: 真正回答"),
    "真正回答",
  );
});

test("Claude preserves intentional repeated answer lines", () => {
  assert.equal(
    normalizeProviderResponse("claude", "這句是刻意重複\n這句是刻意重複"),
    "這句是刻意重複\n這句是刻意重複",
  );
});

test("other providers preserve a final image line", () => {
  assert.equal(normalizeProviderResponse("chatgpt", "分析完成\nimage"), "分析完成\nimage");
});

test("provider service errors are classified instead of treated as debate answers", () => {
  assert.deepEqual(
    classifyProviderResponseError("grok", "The servers are overloaded. Please try again later."),
    { code: "PROVIDER_OVERLOADED", message: "grok 服務目前超載" },
  );
  assert.deepEqual(
    classifyProviderResponseError("claude", "You have reached your usage limit."),
    { code: "PROVIDER_QUOTA_EXCEEDED", message: "claude 額度或使用上限已達" },
  );
  assert.deepEqual(
    classifyProviderResponseError("grok", "Something went wrong. Please try again later."),
    { code: "PROVIDER_OVERLOADED", message: "grok 服務目前超載" },
  );
  assert.equal(
    classifyProviderResponseError("chatgpt", "我認為伺服器超載是這次事故的主因。"),
    null,
  );
});

test("capacity and temporary demand errors remain retryable overloads", () => {
  for (const text of [
    "The server has reached capacity.",
    "Server capacity exceeded.",
    "Due to temporary high demand, please try again later.",
  ]) {
    assert.equal(classifyProviderResponseError("chatgpt", text)?.code, "PROVIDER_OVERLOADED");
  }

  assert.notEqual(
    classifyProviderResponseError("chatgpt", "The server has reached capacity.")?.code,
    "PROVIDER_QUOTA_EXCEEDED",
  );
});

test("common usage and message quota variants remain non-retryable quota errors", () => {
  for (const text of [
    "You've hit your limit for now.",
    "You have hit your usage limit for now.",
    "You have reached your message quota.",
    "You've reached the maximum number of messages for now.",
    "You have exceeded your daily usage limit.",
    "Your free messages return at 4:30 AM.",
    "今日使用量已達上限，請稍後再試。",
    "你已達到訊息上限。",
  ]) {
    assert.equal(classifyProviderResponseError("claude", text)?.code, "PROVIDER_QUOTA_EXCEEDED");
  }

  for (const text of [
    "I think you've reached your usage limit because the plan is shared.",
    "The page says Your free messages return at 4:30 AM. and that may explain the pause.",
    "The error means 'You have reached your usage limit.' This long explanation continues with context and advice.",
    `The assistant explained: “You have reached your usage limit.” ${"Additional quoted context. ".repeat(12)}`,
    "我們討論的是今日使用量已達上限這種提示，不代表目前服務額度用完。",
  ]) {
    assert.equal(classifyProviderResponseError("claude", text), null);
  }
});

test("generic provider failures are classified and cannot become answers", () => {
  assert.deepEqual(classifyProviderResponseError("grok", "Something went wrong"), {
    code: "PROVIDER_PAGE_ERROR",
    message: "grok 回覆失敗",
  });
  assert.deepEqual(classifyProviderResponseError("claude", "Error generating response"), {
    code: "PROVIDER_PAGE_ERROR",
    message: "claude 回覆失敗",
  });
});

test("completed answer that discusses too many requests is not classified as overload", () => {
  assert.equal(classifyProviderResponseError("grok",
    "The phrase too many requests describes a rate limit; here is how to handle it."), null);
  assert.equal(classifyProviderResponseError("grok", "Too many requests. Please try again later.")?.code,
    "PROVIDER_OVERLOADED");
});

test("ChatGPT standalone reply-load messages are classified without matching quoted reports", () => {
  for (const text of ["無法載入這則回覆", "無法載入此則回覆。", "無法載入回覆"]) {
    assert.equal(classifyProviderResponseError("chatgpt", text)?.code, "PROVIDER_PAGE_ERROR");
  }

  for (const text of [
    "ChatGPT 顯示「無法載入這則回覆」，但我已經重新整理並取得完整答案。",
    "錯誤訊息『無法載入此則回覆』是畫面上的文字；實際回答是 42。",
    "我認為無法載入這則回覆是暫時的 UI 問題。",
  ]) {
    assert.equal(classifyProviderResponseError("chatgpt", text), null);
  }
});

test("confirmed Gemini button submission does not press Enter", async () => {
  let enterCount = 0;
  const result = await ensurePromptSubmitted({
    clickButton: () => true,
    pressEnter: () => { enterCount += 1; },
    promptStillPresent: () => true,
    confirmSubmission: async () => "input-cleared",
  });

  assert.deepEqual(result, { method: "button", evidence: "input-cleared", retried: false });
  assert.equal(enterCount, 0);
});

test("unconfirmed Gemini click fails closed without an Enter resend", async () => {
  let enterCount = 0;
  await assert.rejects(
    ensurePromptSubmitted({
      clickButton: () => true,
      pressEnter: () => { enterCount += 1; },
      promptStillPresent: () => true,
      confirmSubmission: async () => null,
    }),
    (error) => error.code === "PROVIDER_SUBMISSION_UNCONFIRMED",
  );
  assert.equal(enterCount, 0);
});

test("unconfirmed Gemini click exposes the stable submission error code", async () => {
  await assert.rejects(
    ensurePromptSubmitted({
      clickButton: () => true,
      pressEnter: () => {},
      promptStillPresent: () => true,
      confirmSubmission: async () => null,
    }),
    (error) => error.code === "PROVIDER_SUBMISSION_UNCONFIRMED" && /Gemini 未確認送出/.test(error.message),
  );
});

test("missing send button keeps the single Enter fallback", async () => {
  let enterCount = 0;
  const result = await ensurePromptSubmitted({
    clickButton: () => false,
    pressEnter: () => { enterCount += 1; },
    promptStillPresent: () => true,
    confirmSubmission: async () => "input-cleared",
  });

  assert.deepEqual(result, { method: "enter", evidence: "input-cleared", retried: false });
  assert.equal(enterCount, 1);
});

test("provider page automation can submit first and read the reply later", async () => {
  const script = await readFile("src/content/provider-page.js", "utf8");

  assert.match(script, /aiDebate:submitPrompt/);
  assert.match(script, /aiDebate:readSubmittedResponse/);
  assert.match(script, /aiDebate:clearSubmittedRuns/);
  assert.match(script, /globalThis\.aiDebateProviderAdapters/);
  assert.match(script, /submittedRuns/);
  assert.match(script, /sessionStorage/);
  assert.match(script, /PROVIDER_RESPONSE_TIMEOUT/);
  assert.match(script, /sendAndRead\(message\)/);
  assert.match(script, /readAssistantSnapshot\(config, providerId\)/);
  assert.match(script, /readKnownProviderPageError/);
  assert.match(script, /readProviderErrorFingerprintBaseline/);
  assert.match(script, /errorBaseline/);
  assert.match(script, /hasFreshProviderError\(errorBaseline, candidate\.content\)/);
  assert.match(script, /config\.errorSelectors/);
});

test("completion poll deadline returns pending and carries a growing candidate across polls", async () => {
  let now = 0;
  let generating = true;
  const assistant = { innerText: "回答起點", contains: () => false,
    getBoundingClientRect: () => ({ width: 400, height: 50 }) };
  const stop = { disabled: false, getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }) };
  const context = await loadProviderPageTestContext({
    aiDebateAutomationCore: globalThis.aiDebateAutomationCore,
    Date: class extends Date { static now() { return now; } },
    setTimeout: (callback, milliseconds) => { now += milliseconds; callback(); return 0; },
    document: { querySelectorAll: (selector) => selector === ".assistant" ? [assistant]
      : selector === ".stop" && generating ? [stop] : [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  const api = context.aiDebateProviderPageTest;
  const config = { responseSelectors: [".assistant"], userMessageSelectors: [],
    stopSelectors: [".stop"], errorSelectors: [] };
  const state = {};

  assert.equal(await api.waitForCompletion(config, "chatgpt", 120000, assistantSnapshot([]),
    "這次提示", [], () => {}, undefined, { pollBudgetMs: 600, state }), null);
  assert.equal(state.candidateBuffer.text, "回答起點");

  assistant.innerText = "回答起點，持續生成中的完整段落";
  const changedAt = now;
  assert.equal(await api.waitForCompletion(config, "chatgpt", 120000, assistantSnapshot([]),
    "這次提示", [], () => {}, undefined, { pollBudgetMs: 600, state }), null);
  assert.equal(state.candidateBuffer.text, "回答起點，持續生成中的完整段落");
  assert.equal(state.candidateBuffer.stableSince, changedAt);

  generating = false;
  assert.equal(await api.waitForCompletion(config, "chatgpt", 120000, assistantSnapshot([]),
    "這次提示", [], () => {}, undefined, { pollBudgetMs: 3000, state }),
  "回答起點，持續生成中的完整段落");
});

test("completion polls preserve the original hard deadline despite continued text changes", async () => {
  let now = 0;
  let generating = true;
  const assistant = { innerText: "回答起點", contains: () => false,
    getBoundingClientRect: () => ({ width: 400, height: 50 }) };
  const stop = { disabled: false, getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }) };
  const context = await loadProviderPageTestContext({
    aiDebateAutomationCore: globalThis.aiDebateAutomationCore,
    Date: class extends Date { static now() { return now; } },
    setTimeout: (callback, milliseconds) => { now += milliseconds; callback(); return 0; },
    document: { querySelectorAll: (selector) => selector === ".assistant" ? [assistant]
      : selector === ".stop" && generating ? [stop] : [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  const api = context.aiDebateProviderPageTest;
  const config = { responseSelectors: [".assistant"], userMessageSelectors: [],
    stopSelectors: [".stop"], errorSelectors: [] };
  const state = {};
  await api.waitForCompletion(config, "chatgpt", 900000, assistantSnapshot([]),
    "這次提示", [], () => {}, undefined, { pollBudgetMs: 600, state });
  const originalHardDeadline = state.completionWindow.hardDeadline;

  now = originalHardDeadline - 600;
  assistant.innerText = "回答起點，接近總期限仍持續生成";
  await assert.rejects(api.waitForCompletion(config, "chatgpt", 900000, assistantSnapshot([]),
    "這次提示", [], () => {}, undefined, { pollBudgetMs: 1000, state }),
  (error) => error.code === "PROVIDER_RESPONSE_TIMEOUT");
  assert.equal(state.completionWindow.hardDeadline, originalHardDeadline);
  assert.equal(state.candidateBuffer.text, "回答起點，接近總期限仍持續生成");
  generating = false;
});

test("Meta response polls join in flight and replay a completed reply after a lost receipt", async () => {
  let now = 0;
  let generating = true;
  let stored = "[]";
  let renderedReply = "完整答案\n含完整結尾";
  const prompt = "這次提示\n附上完整原文";
  const user = { innerText: prompt.replace("\n", "\u2028"),
    getAttribute: (name) => name === "data-message-id" ? "meta-user-1" : null,
    compareDocumentPosition: () => 4, getBoundingClientRect: () => ({ width: 400, height: 50 }) };
  const assistant = { get innerText() { return renderedReply; }, contains: () => false,
    getBoundingClientRect: () => ({ width: 400, height: 50 }) };
  const stop = { disabled: false, getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }) };
  const config = globalThis.aiDebateProviderAdapters.meta;
  const sessionStorage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  const hooks = {
    aiDebateAutomationCore: globalThis.aiDebateAutomationCore,
    aiDebateProviderAdapters: { meta: config },
    location: { hostname: "www.meta.ai", pathname: "/prompt/meta-chat" },
    sessionStorage,
    Date: class extends Date { static now() { return now; } },
    setTimeout: (callback, milliseconds) => { now += milliseconds; queueMicrotask(callback); return 0; },
    document: { querySelectorAll: (selector) => selector === config.captureResponseSelector ? [assistant]
      : selector === config.stopSelectors[0] && generating ? [stop]
      : selector === "[role='article'][aria-label='你的訊息']" ? [user] : [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  };
  const api = (await loadProviderPageTestContext(hooks)).aiDebateProviderPageTest;
  api.submittedRuns.set("run-poll", { providerId: "meta", epoch: 0, conversationIdentity: "meta-chat",
    baseline: assistantSnapshot([]), errorBaseline: [], prompt, submittedAt: 0,
    baselinePromptCount: 0, userTurnCount: 0, submittedPromptIdentity: "meta-user-1" });
  const read = { provider: "meta", runId: "run-poll", epoch: 0, timeoutMs: 120000 };

  const pending = await api.readSubmittedResponse({ ...read, pollBudgetMs: 600 });
  assert.equal(pending.ok, true);
  assert.equal(pending.pending, true);
  assert.equal(api.submittedRuns.get("run-poll").responseState.candidateBuffer.text, renderedReply);

  generating = false;
  const [completed, overlapping] = await Promise.all([
    api.readSubmittedResponse({ ...read, pollBudgetMs: 5000 }),
    api.readSubmittedResponse({ ...read, pollBudgetMs: 5000 }),
  ]);
  assert.equal(completed.content, renderedReply);
  assert.equal(completed, overlapping);
  assert.equal(api.submittedRuns.get("run-poll").prompt, undefined);

  renderedReply = "換成別的畫面，仍只能回傳這次已擷取的答案";
  const restored = (await loadProviderPageTestContext(hooks)).aiDebateProviderPageTest;
  assert.equal((await restored.readSubmittedResponse(read)).content, completed.content);
  hooks.location.pathname = "/prompt/another-chat";
  await assert.rejects(restored.readSubmittedResponse(read), { code: "PROVIDER_CONVERSATION_CHANGED" });
  hooks.location.pathname = "/prompt/meta-chat";
  restored.abortAutomation();
  await assert.rejects(restored.readSubmittedResponse({ ...read, epoch: 1 }), { code: "PROVIDER_RESPONSE_MISMATCH" });
});


test("existing conversation routes include current Grok, Meta and Gemini account paths", async () => {
  for (const [provider, pathname, expected] of [
    ["grok", "/c/b92f907b-35be-4d05-ae1e-e54e051e3a75", true],
    ["grok", "/chat/old", true], ["grok", "/", false],
    ["meta", "/prompt/080ab377-0f58-4067-b89b-1d825a797b07", true],
    ["meta", "/", false], ["gemini", "/app/old", true],
    ["gemini", "/u/2/app/old", true], ["gemini", "/app", false],
    ["chatgpt", "/c/old", true],
  ]) {
    const context = await loadProviderPageTestContext({ location: { pathname, search: "" } });
    assert.equal(context.aiDebateProviderPageTest.isExistingConversationRoute(provider), expected, `${provider}:${pathname}`);
  }
});


test("generic assistant candidates inside a known user turn do not erase the user record", async () => {
  const markdown = { innerText: "使用者提問", textContent: "使用者提問", contains: () => false,
    getBoundingClientRect: () => ({ width: 400, height: 40 }) };
  const user = { innerText: "使用者提問", textContent: "使用者提問", contains: (element) => element === markdown || element === user,
    getBoundingClientRect: () => ({ width: 500, height: 60 }) };
  const context = await loadProviderPageTestContext({
    aiDebateAutomationCore: { ...globalThis.aiDebateAutomationCore },
    document: { querySelectorAll: (selector) => selector === ".markdown" ? [markdown]
      : selector === ".user-turn" || selector.includes("user") ? [user] : [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  assert.deepEqual(JSON.parse(JSON.stringify(context.aiDebateProviderPageTest.readCurrentConversationMessages({
    responseSelectors: [".markdown"], userMessageSelectors: [".user-turn"],
  }, "chatgpt"))), [{ role: "User", text: "使用者提問" }]);
});

test("Send lookup stays inside the verified composer when a page-level feedback button is enabled", async () => {
  const disabledSend = { disabled: true, getAttribute: (name) => name === "aria-label" ? "Send" : null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }) };
  const feedback = { disabled: false, getAttribute: (name) => name === "aria-label" ? "Send feedback" : null,
    getBoundingClientRect: () => ({ width: 100, height: 40 }) };
  const composer = { querySelectorAll: (selector) => selector === ".send" ? [disabledSend]
    : selector === "button, [role='button']" ? [disabledSend] : [] };
  const input = { parentElement: composer, closest: (selector) => selector === ".composer" ? composer : null };
  const context = await loadProviderPageTestContext({
    document: { querySelectorAll: (selector) => selector === ".send" ? [feedback] : [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  assert.equal(context.aiDebateProviderPageTest.findSendButton({
    sendSelectors: [".send"], composerRootSelectors: [".composer"],
  }, input), null);
});

test("a provider selector matching the editor itself does not hide Send in its containing form", async () => {
  const send = { disabled: false, getAttribute: (name) => name === "aria-label" ? "Send" : null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }) };
  const form = { querySelectorAll: (selector) => selector === ".send" || selector === "button, [role='button']" ? [send] : [] };
  const input = { querySelectorAll: () => [], closest(selector) {
    return selector === ".editor" ? this : selector === "form" ? form : null;
  } };
  const context = await loadProviderPageTestContext({
    document: { querySelectorAll: () => [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  assert.equal(context.aiDebateProviderPageTest.findSendButton({
    sendSelectors: [".send"], composerRootSelectors: [".editor", "form"],
  }, input), send);
});

test("Gemini readiness follows a replacement editor and validates its live prompt", async () => {
  const composer = { querySelectorAll: (selector) => selector === ".send" ? [button]
    : selector === "button, [role='button']" ? [button] : [] };
  const button = { disabled: false, getAttribute: (name) => name === "aria-label" ? "Send" : null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }) };
  const makeInput = (text) => ({ tagName: "TEXTAREA", value: text, innerText: text,
    parentElement: composer, closest: (selector) => selector === ".composer" ? composer : null,
    getAttribute: () => null, getBoundingClientRect: () => ({ width: 400, height: 40 }) });
  const oldInput = makeInput("原本編輯器");
  const liveInput = makeInput("要送出的提示");
  const context = await loadProviderPageTestContext({
    document: { querySelectorAll: (selector) => selector === ".editor" ? [liveInput] : [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  assert.equal(await context.aiDebateProviderPageTest.waitForGeminiSubmissionReady({
    preferredInputSelector: ".editor", sendSelectors: [".send"], composerRootSelectors: [".composer"],
  }, oldInput, "要送出的提示", 40), button);
  liveInput.value = "被替換成其他內容";
  liveInput.innerText = liveInput.value;
  await assert.rejects(context.aiDebateProviderPageTest.waitForGeminiSubmissionReady({
    preferredInputSelector: ".editor", sendSelectors: [".send"], composerRootSelectors: [".composer"],
  }, oldInput, "要送出的提示", 40), (error) => error.code === "PROVIDER_SUBMISSION_NOT_READY");
});

test("response snapshots choose the newest assistant element in document order across selectors", async () => {
  const makeReply = (text, order) => ({ innerText: text, textContent: text,
    contains(other) { return other === this; },
    compareDocumentPosition(other) { return order < other.order ? 4 : 2; },
    order, getBoundingClientRect: () => ({ width: 400, height: 40 }) });
  const older = makeReply("較舊回答", 1);
  const newer = makeReply("最新回答", 2);
  const context = await loadProviderPageTestContext({
    aiDebateAutomationCore: { ...globalThis.aiDebateAutomationCore },
    document: { querySelectorAll: (selector) => selector === ".markdown" ? [older]
      : selector === "[data-role='assistant']" ? [newer] : [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  const snapshot = context.aiDebateProviderPageTest.readAssistantSnapshot({
    responseSelectors: [".markdown", "[data-role='assistant']"], userMessageSelectors: [],
  }, "chatgpt");
  assert.equal(snapshot.lastText, "最新回答");
});

test("an absent submitted reply clears its buffered partial response", async () => {
  let now = 0;
  let visible = true;
  const answer = { innerText: "部分回答", textContent: "部分回答", contains: () => false,
    getBoundingClientRect: () => ({ width: 400, height: 40 }) };
  const user = { innerText: "本次提示", textContent: "本次提示", contains: () => false,
    compareDocumentPosition: (element) => element === answer ? 4 : 0,
    getAttribute: (name) => name === "data-message-id" ? "user-anchor" : null,
    getBoundingClientRect: () => ({ width: 400, height: 40 }) };
  const context = await loadProviderPageTestContext({
    aiDebateAutomationCore: globalThis.aiDebateAutomationCore,
    Date: class extends Date { static now() { return now; } },
    setTimeout: (callback, milliseconds) => { now += milliseconds; callback(); return 0; },
    document: { querySelectorAll: (selector) => selector === ".assistant" && visible ? [answer]
      : selector === ".user" ? [user] : [] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  const state = {};
  const config = { responseSelectors: [".assistant"], userMessageSelectors: [".user"], stopSelectors: [], errorSelectors: [] };
  const options = { baselinePromptCount: 0, submittedPromptIdentity: "user-anchor", pollBudgetMs: 600, state };
  await context.aiDebateProviderPageTest.waitForCompletion(config, "chatgpt", 120000, assistantSnapshot([]),
    "本次提示", [], () => {}, undefined, options);
  assert.equal(state.candidateBuffer.text, "部分回答");
  visible = false;
  user.innerText = "使用者已修改題目";
  user.textContent = user.innerText;
  assert.equal(await context.aiDebateProviderPageTest.waitForCompletion(config, "chatgpt", 120000, assistantSnapshot([]),
    "本次提示", [], () => {}, undefined, { ...options, pollBudgetMs: 3000 }), null);
  assert.equal(state.candidateBuffer.text, "");
});

test("only standalone retry notices are classified as a provider outage", () => {
  assert.equal(classifyProviderResponseError("grok", "If the upload fails, please try again later."), null);
  assert.equal(classifyProviderResponseError("grok", "If the upload fails, please try again in a few minutes."), null);
  assert.equal(classifyProviderResponseError("grok", "Please try again in a few minutes. The upload may take time."), null);
  assert.equal(classifyProviderResponseError("grok", "Please try again later.")?.code, "PROVIDER_OVERLOADED");
  assert.equal(classifyProviderResponseError("grok", "Please try again in a few minutes.")?.code, "PROVIDER_OVERLOADED");
  assert.equal(classifyProviderResponseError("grok", "Please retry again in 30 seconds.")?.code, "PROVIDER_OVERLOADED");
});
