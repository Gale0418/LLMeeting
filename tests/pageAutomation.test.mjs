import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

await import("../src/content/automation-core.js");
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
    "globalThis.aiDebateProviderPageTest = { findInput, waitForInputWritten, writeInput };\n})();",
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
    aiDebateProviderAdapters: {},
    chrome: { runtime: { onMessage: { addListener: () => {} } } },
    location: {},
    sessionStorage: { getItem: () => "[]", setItem: () => {}, removeItem: () => {} },
    HTMLInputElement: class {},
    HTMLTextAreaElement: class {},
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

test("Meta AI adapter only matches the packaged meta.ai hosts", () => {
  const meta = globalThis.aiDebateProviderAdapters.meta;

  assert.equal(matchesProviderLocation({ hostname: "meta.ai", pathname: "/" }, meta), true);
  assert.equal(matchesProviderLocation({ hostname: "www.meta.ai", pathname: "/chat" }, meta), true);
  assert.equal(matchesProviderLocation({ hostname: "facebook.com", pathname: "/metaai" }, meta), false);
  assert.ok(meta.inputSelectors.length >= 3);
  assert.ok(meta.responseSelectors.length >= 3);
  assert.equal(meta.inputWriteStrategy, "single-editor-replace");
  assert.equal(meta.inputSelectors[0], "div[data-lexical-editor='true'][contenteditable='true'][role='textbox']");
  assert.equal(meta.preferredInputSelector, meta.inputSelectors[0]);
  assert.ok(meta.inputSelectors.includes("div[contenteditable='true'][role='textbox']"));
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
  assert.match(metaWrite, /await waitForInputWritten\(element, serializedText\)/);
  assert.doesNotMatch(metaWrite, /textContent\s*=/);
  assert.match(script, /writeInput\(input, message\.prompt, config\.inputWriteStrategy\)/);
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
    { count: 2, lastText: "新回答" },
  );
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

test("confirmed Gemini button submission does not press Enter", async () => {
  let enterCount = 0;
  const result = await ensurePromptSubmitted({
    clickButton: () => true,
    pressEnter: () => { enterCount += 1; },
    confirmSubmission: async () => "input-cleared",
  });

  assert.deepEqual(result, { method: "button", evidence: "input-cleared", retried: false });
  assert.equal(enterCount, 0);
});

test("unconfirmed Gemini click retries once with Enter", async () => {
  let enterCount = 0;
  const evidence = [null, "generation-started"];
  const result = await ensurePromptSubmitted({
    clickButton: () => true,
    pressEnter: () => { enterCount += 1; },
    confirmSubmission: async () => evidence.shift(),
  });

  assert.deepEqual(result, { method: "enter", evidence: "generation-started", retried: true });
  assert.equal(enterCount, 1);
});

test("unconfirmed Gemini submission fails after one fallback", async () => {
  await assert.rejects(
    ensurePromptSubmitted({
      clickButton: () => true,
      pressEnter: () => {},
      confirmSubmission: async () => null,
    }),
    /Gemini 未確認送出/,
  );
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
