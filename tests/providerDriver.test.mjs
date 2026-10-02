import test from "node:test";
import assert from "node:assert/strict";

await import("../src/content/provider-driver.js");

const {
  DRIVER_CONTRACT_VERSION,
  DRIVER_VERSION,
  confidenceForResolution,
  createCapabilityContract,
  elementFingerprint,
  selectCandidate,
} = globalThis.aiDebateProviderDriver;

test("provider driver exposes a versioned capability contract with a non-blocking site default model policy", () => {
  const contract = createCapabilityContract("gemini", {
    surfaces: { input: { available: true, confidence: "high" } },
  });

  assert.equal(contract.contractVersion, DRIVER_CONTRACT_VERSION);
  assert.equal(contract.driverVersion, DRIVER_VERSION);
  assert.equal(contract.provider, "gemini");
  assert.deepEqual(contract.model, {
    policy: "site-default",
    required: false,
    selectedLabel: null,
  });
  assert.equal(contract.surfaces.input.available, true);
});

test("candidate selection deduplicates one DOM element reached by multiple strategies", () => {
  const element = {};
  const resolution = selectCandidate([
    { element, strategy: "configured", score: 160, signals: ["selector:configured"] },
    { element, strategy: "preferred", score: 220, signals: ["selector:preferred"] },
  ], { threshold: 150, ambiguityMargin: 12 });

  assert.equal(resolution.element, element);
  assert.equal(resolution.strategy, "preferred");
  assert.equal(resolution.candidateCount, 1);
  assert.equal(confidenceForResolution(resolution), "high");
});

test("candidate selection fails closed when two controls have indistinguishable evidence", () => {
  const first = {};
  const second = {};
  const resolution = selectCandidate([
    { element: first, strategy: "scored-fallback", score: 100 },
    { element: second, strategy: "scored-fallback", score: 94 },
  ], { threshold: 75, ambiguityMargin: 12 });

  assert.equal(resolution.element, null);
  assert.equal(resolution.candidate, first);
  assert.equal(resolution.ambiguous, true);
  assert.equal(resolution.evidence.runnerUpScore, 94);
  assert.equal(confidenceForResolution(resolution), "none");
});

test("driver fingerprints retain structural attributes without copying page text", () => {
  const element = {
    tagName: "DIV",
    type: "",
    textContent: "private prompt text",
    getAttribute: (name) => ({
      role: "textbox",
      "data-testid": "composer-v9",
      contenteditable: "true",
    })[name] || null,
  };

  const fingerprint = elementFingerprint(element);
  assert.equal(fingerprint.tag, "div");
  assert.ok(fingerprint.attributes.includes("role:textbox"));
  assert.ok(fingerprint.attributes.includes("testid:composer-v9"));
  assert.doesNotMatch(JSON.stringify(fingerprint), /private prompt text/);
});
