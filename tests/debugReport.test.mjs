import test from "node:test";
import assert from "node:assert/strict";
import { buildDebugReport } from "../src/shared/debugReport.js";

test("debug export preserves past faults and repairs but excludes conversation and arbitrary details", () => {
  const report = buildDebugReport({
    question: "private question", providerTabs: { meta: "private URL" },
    debugEvents: [{ timestamp: 123, provider: "meta", phase: "summary", code: "PROVIDER_INPUT_WRITE_FAILED",
      message: "寫入失敗", debugDetails: { expectedLength: 100, actualLength: 80, firstMismatch: 70,
        reason: "verification-timeout", prompt: "private prompt", html: "private html" } }],
    transcript: { answers: { meta: "private answer" }, manualRepairs: [{ provider: "meta", phase: "summary",
      repairedAt: 124, originalError: "寫入失敗", content: "private pasted answer" }] },
    providerDiagnostics: { meta: { stage: "received", url: "private URL", error: "" } },
  }, "0.5.1", 0);
  assert.equal(report.faults[0].input.firstMismatch, 70);
  assert.equal(report.manualRepairs[0].originalError, "寫入失敗");
  assert.equal(report.providers[0].stage, "received");
  assert.doesNotMatch(JSON.stringify(report), /private/);
  assert.equal(report.exportedAt, "1970-01-01T00:00:00.000Z");
});

test("older sessions export retained original faults without new debug history", () => {
  const report = buildDebugReport({ transcript: { manualRepairs: [{ provider: "grok", phase: "critique-2", originalError: "需求量高" }] } });
  assert.deepEqual(report.faults, []);
  assert.equal(report.manualRepairs[0].originalError, "需求量高");
  const bounded = buildDebugReport({ debugEvents: Array.from({length: 150}, (_, timestamp) => ({ timestamp, message: "x".repeat(900) })) });
  assert.equal(bounded.faults.length, 100);
  assert.equal(bounded.faults[0].timestamp, 50);
  assert.equal(bounded.faults[0].message.length, 500);
});

test("debug export masks conversation URLs embedded in original errors before truncation", () => {
  const error = "message channel closed（目前網址：https://grok.com/c/private-conversation?rid=private-id）";
  const report = buildDebugReport({
    debugEvents: [{message: error}],
    transcript: {manualRepairs: [{originalError: error}]},
    providerDiagnostics: {grok: {error}},
  });
  assert.doesNotMatch(JSON.stringify(report), /https:|private-conversation|private-id/);
  assert.match(report.manualRepairs[0].originalError, /網址已遮蔽/);
});
