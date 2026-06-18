import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("content script does not treat every svg button as send", async () => {
  const script = await readFile("src/content/provider-page.js", "utf8");

  assert.doesNotMatch(script, /\|\|\s*button\.querySelector\("svg"\)/);
});

test("content script does not use Claude rounded button class as a send selector", async () => {
  const script = await readFile("src/content/provider-page.js", "utf8");

  assert.doesNotMatch(script, /button\.rounded-lg/);
});

test("manifest loads automation core before the provider content script", async () => {
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));

  assert.deepEqual(
    manifest.content_scripts[0].js,
    ["src/content/automation-core.js", "src/content/provider-page.js"],
  );
});

test("content script falls back to Enter submit after writing the prompt", async () => {
  const script = await readFile("src/content/provider-page.js", "utf8");

  assert.match(script, /dispatchEnter\(input\)/);
  assert.match(script, /button\[type='submit'\]/);
});

test("content script does not accept the submitted prompt bubble as an AI response", async () => {
  const script = await readFile("src/content/provider-page.js", "utf8");

  assert.match(script, /!isPromptEcho\(prompt, currentText\)/);
  assert.match(script, /baseline,\s+prompt: message\.prompt/);
  assert.match(script, /waitForCompletion\(config, providerId, message\.timeoutMs \|\| 120000, run\.baseline, run\.prompt\)/);
});

test("Gemini confirms submission before registering the run", async () => {
  const script = await readFile("src/content/provider-page.js", "utf8");

  assert.match(script, /ensurePromptSubmitted/);
  assert.match(script, /observeGeminiSubmission/);
  assert.match(script, /findSendButton\(config, input\)/);
  assert.ok(script.indexOf("ensurePromptSubmitted({") < script.indexOf("submittedRuns.set(runId"));
  assert.match(script, /gemini:[\s\S]*?sendSelectors:\s*\[\s*"button\.send-button"[\s\S]*?"button\[type='submit'\]"/);
});
