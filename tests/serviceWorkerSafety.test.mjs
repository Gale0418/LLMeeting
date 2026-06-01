import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("provider jobs run sequentially so each chat page can be activated reliably", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.doesNotMatch(script, /Promise\.all\(jobs\.map\(\(job\) => sendJob\(job, mockMode\)\)\)/);
  assert.match(script, /await activateProviderTab\(tab\)/);
});

test("new provider tabs open as active pages instead of dormant background tabs", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.match(script, /chrome\.tabs\.create\(\{ url: provider\.startUrl, active: true \}\)/);
});

test("each provider result is published as soon as its sequential job finishes", async () => {
  const script = await readFile("src/background/service-worker.js", "utf8");

  assert.match(
    script,
    /for \(const job of jobs\) \{\s+const result = await sendJob\(job, mockMode\);\s+recordProviderResult\(result, target\);[\s\S]*?await publishState\(\);\s+\}/,
  );
});
