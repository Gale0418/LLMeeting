import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("side panel loads a dev-only five-click Pro unlocker", async () => {
  const app = await readFile("src/sidepanel/app.js", "utf8");
  const unlocker = await readFile("src/sidepanel/dev-unlock.js", "utf8");

  assert.match(app, /import\("\.\/dev-unlock\.js"\)/);
  assert.match(unlocker, /ENTITLEMENT_STORAGE_KEY/);
  assert.match(unlocker, /unlockClicks >= 5/);
  assert.match(unlocker, /chrome\.storage\.local\.set/);
  assert.match(unlocker, /loadState/);
});

test("Chrome Web Store package excludes the dev unlocker", async () => {
  const packager = await readFile("scripts/package-extension.mjs", "utf8");

  assert.match(packager, /EXCLUDED_ARCHIVE_NAMES/);
  assert.match(packager, /src\/sidepanel\/dev-unlock\.js/);
});
