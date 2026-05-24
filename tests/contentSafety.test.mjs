import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("content script does not treat every svg button as send", async () => {
  const script = await readFile("src/content/provider-page.js", "utf8");

  assert.doesNotMatch(script, /\|\|\s*button\.querySelector\("svg"\)/);
});
