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
    "globalThis.aiDebateProviderPageTest = {\n      assertProviderLocation,\n      collectElements,\n      createResponseCandidateBuffer,\n      findInput,\n      readAssistantSnapshot,\n      resolveConfiguredSendButton,\n      resolveInput,\n      resolveLikelySendButton,\n      scoreInputCandidate,\n      scoreSendCandidate,\n      updateResponseCandidateBuffer,\n      userMessageContainsPrompt,\n      observeProviderSubmission,\n      waitForCompletion,\n      waitForGeminiSubmissionReady,\n      waitForInputWritten,\n      writeInput,\n    };\n})();",
  );
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

  const result = await context.aiDebateProviderPageReadiness({ provider: "claude" });

  assert.equal(result.ready, true);
  assert.equal(result.status, "ready");
  assert.equal(result.checks.send.found, true);
  assert.equal(result.checks.send.enabled, false);
});

test("provider adapters keep live Grok and Claude accessibility contracts first", () => {
  const grok = globalThis.aiDebateProviderAdapters.grok;
  const claude = globalThis.aiDebateProviderAdapters.claude;

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

  assert.match(script, /CONTENT_SCRIPT_VERSION = "0\.5\.0-driver\.5"/);
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
  assert.equal(response.contentScriptVersion, "0.5.0-driver.5");
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
  assert.match(script, /writeInput\(input, message\.prompt, config\.inputWriteStrategy, assertCurrentPage\)/);
  assert.match(script, /PROVIDER_INPUT_WRITE_FAILED/);
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

test("Gemini accepts exact Markdown reconstructed from asynchronously formatted Quill text", async () => {
  const textNode = (text) => ({ nodeType: 3, textContent: text });
  const input = {
    innerText: "題目：重要內容",
    matches: (selector) => selector === ".ql-editor.rich-query-formatting-enabled",
    childNodes: [textNode("題目："), { tagName: "STRONG", childNodes: [textNode("重要內容")] }],
  };
  const button = {
    disabled: false,
    getAttribute: (name) => name === "role" ? "button" : null,
    getBoundingClientRect: () => ({ width: 100, height: 40 }),
  };
  const context = await loadProviderPageTestContext({
    document: { querySelectorAll: () => [button] },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  const api = context.aiDebateProviderPageTest;
  assert.equal(await api.waitForGeminiSubmissionReady({ sendSelectors: ["button.send-button"] }, input, "題目：**重要內容**", 40), button);
  await api.waitForInputWritten(input, "題目：**重要內容**", 40);
  await assert.rejects(api.waitForGeminiSubmissionReady({ sendSelectors: ["button.send-button"] }, input, "題目：**別的內容**", 40),
    (error) => error.code === "PROVIDER_SUBMISSION_NOT_READY");
  input.matches = () => false;
  await assert.rejects(api.waitForGeminiSubmissionReady({ sendSelectors: ["button.send-button"] }, input, "題目：**重要內容**", 40),
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
  const context = await loadProviderPageTestContext({
    document: {
      querySelectorAll: () => [button],
    },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  setTimeout(() => { enabled = true; }, 20);

  assert.equal(
    await context.aiDebateProviderPageTest.waitForGeminiSubmissionReady(
      { sendSelectors: ["button.send-button"] },
      { innerText: "要送出的提示" },
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
  const input = { innerText: "第一段\n\n\n\n\n第二段", matches: () => true, childNodes: paragraphs };
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
  ), (error) => error.code === "PROVIDER_CONVERSATION_CHANGED");
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
  const stopButton = {
    disabled: false,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 40, height: 40 }),
  };
  const context = await loadProviderPageTestContext({
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
  setTimeout(() => { generating = true; }, 15);
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
  ]) {
    assert.equal(classifyProviderResponseError("claude", text)?.code, "PROVIDER_QUOTA_EXCEEDED");
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
