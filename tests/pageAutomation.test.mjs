import test from "node:test";
import assert from "node:assert/strict";

await import("../src/content/automation-core.js");

const {
  assistantSnapshot,
  hasFreshAssistantResponse,
} = globalThis.aiDebateAutomationCore;

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
