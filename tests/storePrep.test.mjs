import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("package script builds a Chrome Web Store zip from extension files only", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const packager = await readFile("scripts/package-extension.mjs", "utf8");

  assert.equal(packageJson.scripts.package, "node scripts/package-extension.mjs");
  assert.match(packager, /INCLUDED_PATHS/);
  assert.match(packager, /manifest\.json/);
  assert.match(packager, /assets/);
  assert.match(packager, /src/);
  assert.doesNotMatch(packager, /EXCLUDED_ARCHIVE_NAMES/);
  assert.doesNotMatch(packager, /MissionCenter/);
  assert.doesNotMatch(packager, /tests/);
});

test("store listing prep documents privacy, permissions, and screenshots", async () => {
  const listing = await readFile("store/listing.md", "utf8");
  const privacy = await readFile("store/privacy-policy.md", "utf8");
  const screenshots = await readFile("store/screenshot-checklist.md", "utf8");

  assert.match(listing, /LLMeeting/);
  assert.match(listing, /Test instructions/);
  assert.match(privacy, /不會將資料送到 LLMeeting 開發者伺服器/);
  assert.match(privacy, /ChatGPT/);
  assert.match(privacy, /Gemini/);
  assert.match(privacy, /Grok/);
  assert.match(privacy, /Claude/);
  assert.match(screenshots, /Chrome Web Store/);
});
