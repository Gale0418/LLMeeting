import test from "node:test";
import assert from "node:assert/strict";

import {
  canUseFeature,
  entitlementsForPlan,
  featureLabel,
} from "../src/shared/entitlements.js";
import { PROVIDER_IDS } from "../src/shared/providers.js";

test("every feature is available without a Pro plan or sheep easter egg", () => {
  const free = entitlementsForPlan("free");

  assert.equal(free.plan, "free");
  assert.equal(free.isPro, false);
  assert.deepEqual(free.includedProviders, PROVIDER_IDS);
  assert.ok(free.includedProviders.includes("meta"));
  assert.equal(canUseFeature(free, "basicDebate"), true);
  assert.equal(free.sheepMode, false);
  for (const feature of Object.keys(free.features)) assert.equal(canUseFeature(free, feature), true);
  assert.equal(canUseFeature(free, "unknownFeature"), false);
});

test("pro entitlement unlocks every advanced debate mode without changing provider access", () => {
  const pro = entitlementsForPlan("pro");

  assert.equal(pro.plan, "pro");
  assert.equal(pro.isPro, true);
  assert.equal(pro.sheepMode, true);
  assert.deepEqual(pro.includedProviders, PROVIDER_IDS);
  assert.equal(canUseFeature(pro, "basicDebate"), true);
  assert.equal(canUseFeature(pro, "fastDebate"), true);
  assert.equal(canUseFeature(pro, "summaryDebate"), true);
  assert.equal(canUseFeature(pro, "observerChair"), true);
  assert.equal(canUseFeature(pro, "anonymousReview"), true);
  assert.equal(canUseFeature(pro, "chatMode"), true);
  assert.equal(canUseFeature(pro, "history"), true);
  assert.equal(canUseFeature(pro, "export"), true);
});

test("sheep mode is cosmetic and does not change available features", () => {
  const normal = entitlementsForPlan();
  const sheep = entitlementsForPlan("free", true);
  assert.equal(sheep.isPro, false);
  assert.equal(sheep.sheepMode, true);
  assert.deepEqual(sheep.features, normal.features);
});

test("feature labels stay user-facing for locked action messages", () => {
  assert.equal(featureLabel("fastDebate"), "快速鬥技場");
  assert.equal(featureLabel("summaryDebate"), "總結辯論");
  assert.equal(featureLabel("observerChair"), "圍觀主席制");
  assert.equal(featureLabel("anonymousReview"), "匿名評論制");
  assert.equal(featureLabel("chatMode"), "自由群聊與劇場模式");
  assert.equal(featureLabel(), "這項功能");
});
