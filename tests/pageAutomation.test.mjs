import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
