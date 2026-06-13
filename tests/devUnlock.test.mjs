import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("side panel loads a five-click Pro unlocker easter egg", async () => {
  const app = await readFile("src/sidepanel/app.js", "utf8");
  const unlocker = await readFile("src/sidepanel/dev-unlock.js", "utf8");

  assert.match(app, /import\("\.\/dev-unlock\.js"\)/);
  assert.match(unlocker, /ENTITLEMENT_STORAGE_KEY/);
  assert.match(unlocker, /unlockClicks >= 5/);
  assert.match(unlocker, /chrome\.storage\.local\.set/);
  assert.match(unlocker, /loadState/);
});

test("Chrome Web Store package keeps the five-click Pro unlocker easter egg", async () => {
  const packager = await readFile("scripts/package-extension.mjs", "utf8");
  const unlocker = await readFile("src/sidepanel/dev-unlock.js", "utf8");

  assert.match(packager, /INCLUDED_PATHS/);
  assert.doesNotMatch(packager, /EXCLUDED_ARCHIVE_NAMES/);
  assert.match(unlocker, /unlockClicks >= 5/);
});
