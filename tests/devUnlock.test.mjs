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

function readStoredZipEntry(zipBuffer, archiveName) {
  let offset = 0;
  while (offset + 30 <= zipBuffer.length && zipBuffer.readUInt32LE(offset) === 0x04034b50) {
    const compression = zipBuffer.readUInt16LE(offset + 8);
    const compressedSize = zipBuffer.readUInt32LE(offset + 18);
    const nameLength = zipBuffer.readUInt16LE(offset + 26);
    const extraLength = zipBuffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = zipBuffer.subarray(nameStart, nameStart + nameLength).toString("utf8");

    if (name === archiveName) {
      assert.equal(compression, 0, "test helper expects the package's stored ZIP entries");
      return zipBuffer.subarray(dataStart, dataStart + compressedSize).toString("utf8");
    }

    offset = dataStart + compressedSize;
  }
  return null;
}

function createHarness({ plan = "free", random = () => 0, confirmResult = false } = {}) {
  let storedPlan = plan;
  const alerts = [];
  const confirms = [];
  const opened = [];
  const messages = [];
  const handlers = {};
  const timerCallbacks = new Map();
  const createdTimerIds = [];
  let nextTimerId = 0;
  const planBadge = {
    textContent: plan === "pro" ? "🐑" : "Free",
    className: "plan-badge is-free",
    addEventListener(type, handler) {
      handlers[type] = handler;
    },
    setAttribute() {},
    getAttribute() { return null; },
    hasAttribute() { return false; },
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
    timers: {
      setTimeout: (callback) => {
        const id = ++nextTimerId;
        timerCallbacks.set(id, callback);
        createdTimerIds.push(id);
        return id;
      },
      clearTimeout: (id) => {
        timerCallbacks.delete(id);
      },
    },
    getDisplayedPlan: () => planBadge.textContent,
  });

  return {
    alerts,
    confirms,
    opened,
    messages,
    planBadge,
    click: () => handlers.click(),
    key: (key) => handlers.keydown({ key, preventDefault() {} }),
    runTimer: (id) => {
      const timerId = id ?? [...timerCallbacks.keys()].at(-1);
      timerCallbacks.get(timerId)?.();
    },
    timerIds: () => [...createdTimerIds],
    getPlan: () => storedPlan,
  };
}

test("side panel loads the five-click sheep easter egg", async () => {
  const app = await readFile(path.join(rootDir, "src", "sidepanel", "app.js"), "utf8");
  const unlocker = await readFile(path.join(rootDir, "src", "sidepanel", "dev-unlock.js"), "utf8");

  assert.ok(app.includes("./dev-unlock.js"));
  assert.match(unlocker, /ENTITLEMENT_STORAGE_KEY/);
  assert.match(unlocker, /UNLOCK_STEPS/);
  assert.match(unlocker, /unlockClicks >= 5/);
  assert.match(unlocker, /isTogglingPlan/);
  assert.doesNotMatch(unlocker, /nextPlan/);
});

test("Free badge shows the exact sheep sequence and existing taunts", async () => {
  const harness = createHarness({ random: () => 0.25 });
  const labels = [];

  assert.equal(THIRD_CLICK_TAUNTS.length, 10);
  for (let click = 0; click < 4; click += 1) {
    await harness.click();
    labels.push(harness.planBadge.textContent);
  }

  assert.deepEqual(labels, ["free🐑", "fre🐑", "fr🐑", "f🐑"]);
  assert.deepEqual(harness.alerts, [
    "想做什麼呢！按再多次都沒用的唷",
    THIRD_CLICK_TAUNTS[2],
  ]);
});

test("fifth Free click unlocks sheep mode and offers the author YouTube link", async () => {
  const harness = createHarness({ confirmResult: true });

  for (let click = 0; click < 5; click += 1) await harness.click();

  assert.equal(harness.getPlan(), "pro");
  assert.equal(harness.planBadge.textContent, "🐑");
  assert.match(harness.messages.at(-1), /🐑已啟用/);
  assert.match(harness.confirms[0], /恭喜解鎖🐑模式~/);
  assert.ok(harness.confirms[0].includes(AUTHOR_YOUTUBE_URL));
  assert.deepEqual(harness.opened, [[AUTHOR_YOUTUBE_URL, "_blank"]]);
});

test("rapid repeated click bursts unlock only once", async () => {
  const harness = createHarness({ confirmResult: true });

  await Promise.all(Array.from({ length: 10 }, () => harness.click()));

  assert.equal(harness.getPlan(), "pro");
  assert.equal(harness.planBadge.textContent, "🐑");
  assert.equal(harness.confirms.length, 1);
});

test("clicking sheep mode again does not toggle it back", async () => {
  const harness = createHarness({ confirmResult: false });

  for (let click = 0; click < 5; click += 1) await harness.click();
  await harness.click();

  assert.equal(harness.getPlan(), "pro");
  assert.equal(harness.planBadge.textContent, "🐑");
  assert.equal(harness.confirms.length, 1);
});

test("an incomplete sequence times out back to Free", async () => {
  const harness = createHarness();

  await harness.click();
  await harness.click();
  assert.equal(harness.planBadge.textContent, "fre🐑");

  const [staleTimerId, activeTimerId] = harness.timerIds();
  harness.runTimer(staleTimerId);
  assert.equal(harness.planBadge.textContent, "fre🐑");

  harness.runTimer(activeTimerId);
  assert.equal(harness.planBadge.textContent, "Free");

  await harness.click();
  assert.equal(harness.planBadge.textContent, "free🐑");
});

test("keyboard Enter and Space activate the same unlock sequence", async () => {
  const harness = createHarness({ confirmResult: false });

  for (const key of ["Enter", " ", "Enter", " ", "Enter"]) {
    await harness.key(key);
  }

  assert.equal(harness.planBadge.textContent, "🐑");
  assert.equal(harness.getPlan(), "pro");
});

test("attaching twice still registers only one badge handler", async () => {
  let storedPlan = "free";
  const handlers = { click: [], keydown: [] };
  const attrs = new Map();
  const planBadge = {
    textContent: "Free",
    addEventListener(type, handler) {
      handlers[type].push(handler);
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
    getDisplayedPlan: () => planBadge.textContent,
  };

  assert.equal(attachDevUnlock(options), true);
  assert.equal(attachDevUnlock(options), true);
  assert.equal(handlers.click.length, 1);
  assert.equal(handlers.keydown.length, 1);
});

test("Chrome Web Store package keeps the sheep easter egg and author link", async () => {
  execSync("node scripts/package-extension.mjs", { cwd: rootDir, stdio: "ignore" });

  const manifest = JSON.parse(await readFile(path.join(rootDir, "manifest.json"), "utf8"));
  const zipPath = path.join(rootDir, "dist", "llmeeting-" + manifest.version + ".zip");
  const zipBuffer = await readFile(zipPath);

  const packagedUnlocker = readStoredZipEntry(zipBuffer, "src/sidepanel/dev-unlock.js");

  assert.ok(packagedUnlocker);
  assert.match(packagedUnlocker, /AUTHOR_YOUTUBE_URL/);
  assert.ok(packagedUnlocker.includes(AUTHOR_YOUTUBE_URL));
});
