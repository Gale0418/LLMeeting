import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ACTIVE_PROVIDER_IDS,
  PROVIDER_IDS,
  normalizeProviderIds,
  providerLabel,
} from "../src/shared/providers.js";

test("default active providers keep Claude optional", () => {
  assert.deepEqual(DEFAULT_ACTIVE_PROVIDER_IDS, ["chatgpt", "gemini", "grok"]);
  assert.ok(PROVIDER_IDS.includes("claude"));
});

test("normalizeProviderIds dedupes valid providers and falls back to defaults", () => {
  assert.deepEqual(normalizeProviderIds(["chatgpt", "claude", "chatgpt", "bogus"]), ["chatgpt", "claude"]);
  assert.deepEqual(normalizeProviderIds([]), DEFAULT_ACTIVE_PROVIDER_IDS);
  assert.deepEqual(normalizeProviderIds(null), DEFAULT_ACTIVE_PROVIDER_IDS);
});

test("providerLabel returns a stable label for optional Claude", () => {
  assert.equal(providerLabel("claude"), "Claude");
});
