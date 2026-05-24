import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("side panel CSS does not depend on remote assets", async () => {
  const css = await readFile("src/sidepanel/styles.css", "utf8");

  assert.doesNotMatch(css, /@import\s+url\(/);
  assert.doesNotMatch(css, /https?:\/\//);
});
