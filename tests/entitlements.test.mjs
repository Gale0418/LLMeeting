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
  assert.equal(canUseFeature(free, "observerChair"), false);
  assert.equal(canUseFeature(free, "anonymousReview"), false);
  assert.equal(canUseFeature(free, "chatMode"), false);
  assert.equal(canUseFeature(free, "history"), false);
  assert.equal(canUseFeature(free, "export"), false);
});

test("pro entitlement unlocks every advanced debate mode without changing provider access", () => {
  const pro = entitlementsForPlan("pro");

  assert.equal(pro.plan, "pro");
  assert.equal(pro.isPro, true);
  assert.deepEqual(pro.includedProviders, DEFAULT_ACTIVE_PROVIDER_IDS);
  assert.equal(canUseFeature(pro, "basicDebate"), true);
  assert.equal(canUseFeature(pro, "fastDebate"), true);
  assert.equal(canUseFeature(pro, "summaryDebate"), true);
  assert.equal(canUseFeature(pro, "observerChair"), true);
  assert.equal(canUseFeature(pro, "anonymousReview"), true);
  assert.equal(canUseFeature(pro, "chatMode"), true);
  assert.equal(canUseFeature(pro, "history"), true);
  assert.equal(canUseFeature(pro, "export"), true);
});

test("feature labels stay user-facing for locked action messages", () => {
  assert.equal(featureLabel("fastDebate"), "快速鬥技場");
  assert.equal(featureLabel("summaryDebate"), "總結辯論");
  assert.equal(featureLabel("observerChair"), "圍觀主席制");
  assert.equal(featureLabel("anonymousReview"), "匿名評論制");
  assert.equal(featureLabel("chatMode"), "自由群聊與劇場模式");
  assert.equal(featureLabel(), "這項功能");
});
