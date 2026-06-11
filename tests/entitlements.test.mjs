import test from "node:test";
import assert from "node:assert/strict";

import {
  canUseFeature,
  entitlementsForPlan,
  featureLabel,
} from "../src/shared/entitlements.js";
import { DEFAULT_ACTIVE_PROVIDER_IDS } from "../src/shared/providers.js";

test("free entitlement keeps four-provider basic debate and locks pro workflows", () => {
  const free = entitlementsForPlan("free");

  assert.equal(free.plan, "free");
  assert.equal(free.isPro, false);
  assert.deepEqual(free.includedProviders, DEFAULT_ACTIVE_PROVIDER_IDS);
  assert.equal(canUseFeature(free, "basicDebate"), true);
  assert.equal(canUseFeature(free, "fastDebate"), false);
  assert.equal(canUseFeature(free, "summaryDebate"), false);
  assert.equal(canUseFeature(free, "history"), false);
  assert.equal(canUseFeature(free, "export"), false);
});

test("pro entitlement unlocks fast debate and summary debate without changing provider access", () => {
  const pro = entitlementsForPlan("pro");

  assert.equal(pro.plan, "pro");
  assert.equal(pro.isPro, true);
  assert.deepEqual(pro.includedProviders, DEFAULT_ACTIVE_PROVIDER_IDS);
  assert.equal(canUseFeature(pro, "basicDebate"), true);
  assert.equal(canUseFeature(pro, "fastDebate"), true);
  assert.equal(canUseFeature(pro, "summaryDebate"), true);
});

test("feature labels stay user-facing for locked action messages", () => {
  assert.equal(featureLabel("fastDebate"), "快速鬪技場");
  assert.equal(featureLabel("summaryDebate"), "總結辯論");
});
