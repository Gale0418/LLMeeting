import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { THIRD_CLICK_TAUNTS, attachDevUnlock } from "../src/sidepanel/dev-unlock.js";
import { ENTITLEMENT_STORAGE_KEY } from "../src/shared/entitlements.js";

function createHarness({ plan = "free", random = () => 0, confirmResult = false } = {}) {
  let storedPlan = plan;
  const alerts = [];
  const confirms = [];
  const opened = [];
  const messages = [];
  let clickHandler;
  const planBadge = {
    addEventListener(type, handler) {
      if (type === "click") clickHandler = handler;
    },
  };
  const storage = {
    async get() { return { [ENTITLEMENT_STORAGE_KEY]: storedPlan }; },
    async set(value) { storedPlan = value[ENTITLEMENT_STORAGE_KEY]; },
  };

  attachDevUnlock({
    planBadge,
    renderMessage: (message) => messages.push(message),
    loadState: async () => {},
    storage,
    dialogs: {
      alert: (message) => alerts.push(message),
      confirm: (message) => { confirms.push(message); return confirmResult; },
    },
    openPage: (...args) => opened.push(args),
    random,
    timers: { setTimeout: () => 1, clearTimeout: () => {} },
    getDisplayedPlan: () => storedPlan,
  });

  return {
    alerts,
    confirms,
    opened,
    messages,
    click: () => clickHandler(),
    getPlan: () => storedPlan,
  };
}

test("side panel loads a five-click Pro unlocker easter egg", async () => {
  const app = await readFile("src/sidepanel/app.js", "utf8");
  const unlocker = await readFile("src/sidepanel/dev-unlock.js", "utf8");

  assert.match(app, /import\("\.\/dev-unlock\.js"\)/);
  assert.match(unlocker, /ENTITLEMENT_STORAGE_KEY/);
  assert.match(unlocker, /unlockClicks >= 5/);
  assert.match(unlocker, /storage\.set/);
  assert.match(unlocker, /loadState/);
});

test("Free badge shows the first message and one deterministic third-click taunt", async () => {
  const harness = createHarness({ random: () => 0.25 });

  assert.equal(THIRD_CLICK_TAUNTS.length, 10);

  await harness.click();
  await harness.click();
  await harness.click();
  await harness.click();

  assert.deepEqual(harness.alerts, [
    "想做什麼呢！按再多次都沒用的唷",
    THIRD_CLICK_TAUNTS[2],
  ]);
});

test("fifth Free click unlocks Pro and visibly offers the author YouTube URL", async () => {
  const harness = createHarness({ confirmResult: true });

  for (let click = 0; click < 5; click += 1) await harness.click();

  assert.equal(harness.getPlan(), "pro");
  assert.match(harness.confirms[0], /https:\/\/www\.youtube\.com\/@gale0418/);
  assert.deepEqual(harness.opened, [["https://www.youtube.com/@gale0418", "_blank"]]);
});

test("Pro badge stays quiet on clicks one and three, then returns to Free on five", async () => {
  const harness = createHarness({ plan: "pro" });

  for (let click = 0; click < 5; click += 1) await harness.click();

  assert.deepEqual(harness.alerts, []);
  assert.deepEqual(harness.confirms, []);
  assert.equal(harness.getPlan(), "free");
});

test("Chrome Web Store package keeps the five-click Pro unlocker easter egg", async () => {
  const packager = await readFile("scripts/package-extension.mjs", "utf8");
  const unlocker = await readFile("src/sidepanel/dev-unlock.js", "utf8");

  assert.match(packager, /INCLUDED_PATHS/);
  assert.doesNotMatch(packager, /EXCLUDED_ARCHIVE_NAMES/);
  assert.match(unlocker, /unlockClicks >= 5/);
});
