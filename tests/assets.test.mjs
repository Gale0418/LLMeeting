import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

test("side panel CSS does not depend on remote assets", async () => {
  const css = await readFile("src/sidepanel/styles.css", "utf8");

  assert.doesNotMatch(css, /@import\s+url\(/);
  assert.doesNotMatch(css, /https?:\/\//);
});

test("manifest references generated LLMeeting icon files for extension and toolbar", async () => {
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
  const expected = {
    "16": "assets/icons/icon-16.png",
    "32": "assets/icons/icon-32.png",
    "48": "assets/icons/icon-48.png",
    "128": "assets/icons/icon-128.png",
  };

  assert.deepEqual(manifest.icons, expected);
  assert.deepEqual(manifest.action.default_icon, {
    "16": expected["16"],
    "32": expected["32"],
  });

  await Promise.all(Object.values(expected).map((path) => access(path)));
});
