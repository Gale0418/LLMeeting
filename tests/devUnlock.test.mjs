import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { THIRD_CLICK_TAUNTS, attachDevUnlock } from "../src/sidepanel/dev-unlock.js";
import { ENTITLEMENT_STORAGE_KEY } from "../src/shared/entitlements.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUTHOR_YOUTUBE_URL = "https://www.youtube.com/@gale0418";

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
      confirm: (message) => {
        confirms.push(message);
        return confirmResult;
      },
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

test("side panel loads the five-click Pro easter egg", async () => {
  const app = await readFile(path.join(rootDir, "src", "sidepanel", "app.js"), "utf8");
  const unlocker = await readFile(path.join(rootDir, "src", "sidepanel", "dev-unlock.js"), "utf8");

  assert.match(app, /import\("\.\/dev-unlock\.js"\)/);
  assert.match(unlocker, /ENTITLEMENT_STORAGE_KEY/);
  assert.match(unlocker, /unlockClicks >= 5/);
  assert.match(unlocker, /isTogglingPlan/);
  assert.match(unlocker, /storage\.set/);
});

test("Free badge shows the first message and one deterministic third-click taunt", async () => {
  const harness = createHarness({ random: () => 0.25 });

  assert.equal(THIRD_CLICK_TAUNTS.length, 10);
  for (let click = 0; click < 4; click += 1) await harness.click();

  assert.deepEqual(harness.alerts, [
    "想做什麼呢！按再多次都沒用的唷",
    THIRD_CLICK_TAUNTS[2],
  ]);
});

test("fifth Free click unlocks Pro and offers the author YouTube link", async () => {
  const harness = createHarness({ confirmResult: true });

  for (let click = 0; click < 5; click += 1) await harness.click();

  assert.equal(harness.getPlan(), "pro");
  assert.match(harness.messages.at(-1), /Pro 已啟用/);
  assert.match(harness.confirms[0], /https:\/\/www\.youtube\.com\/@gale0418/);
  assert.deepEqual(harness.opened, [[AUTHOR_YOUTUBE_URL, "_blank"]]);
});

test("rapid repeated click bursts toggle the plan only once", async () => {
  const harness = createHarness({ confirmResult: true });

  await Promise.all(Array.from({ length: 10 }, () => harness.click()));

  assert.equal(harness.getPlan(), "pro");
  assert.equal(harness.confirms.length, 1);
});

test("attaching twice still registers only one badge handler", async () => {
  let storedPlan = "free";
  const handlers = [];
  const attrs = new Map();
  const planBadge = {
    addEventListener(type, handler) {
      if (type === "click") handlers.push(handler);
    },
    getAttribute: (name) => attrs.get(name) || null,
    setAttribute: (name, value) => attrs.set(name, String(value)),
    hasAttribute: (name) => attrs.has(name),
  };
  const options = {
    planBadge,
    renderMessage: () => {},
    loadState: async () => {},
    storage: {
      async get() { return { [ENTITLEMENT_STORAGE_KEY]: storedPlan }; },
      async set(value) { storedPlan = value[ENTITLEMENT_STORAGE_KEY]; },
    },
    dialogs: { alert: () => {}, confirm: () => false },
    timers: { setTimeout: () => 1, clearTimeout: () => {} },
    getDisplayedPlan: () => storedPlan,
  };

  assert.equal(attachDevUnlock(options), true);
  assert.equal(attachDevUnlock(options), true);
  assert.equal(handlers.length, 1);
});

test("five clicks on Pro return the local author mode to Free", async () => {
  const harness = createHarness({ plan: "pro" });

  for (let click = 0; click < 5; click += 1) await harness.click();

  assert.equal(harness.getPlan(), "free");
  assert.deepEqual(harness.alerts, []);
  assert.deepEqual(harness.confirms, []);
});

test("Chrome Web Store package keeps the easter egg and author link", async () => {
  execSync("node scripts/package-extension.mjs", { cwd: rootDir, stdio: "ignore" });

  const manifest = JSON.parse(await readFile(path.join(rootDir, "manifest.json"), "utf8"));
  const zipPath = path.join(rootDir, "dist", `llmeeting-${manifest.version}.zip`);
  const zipBuffer = await readFile(zipPath);

  assert.ok(zipBuffer.includes(Buffer.from("src/sidepanel/dev-unlock.js")));
  assert.ok(zipBuffer.includes(Buffer.from(AUTHOR_YOUTUBE_URL)));
});
