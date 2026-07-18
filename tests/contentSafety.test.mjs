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
    [
      "src/content/automation-core.js",
      "src/content/provider-adapters.js",
      "src/content/provider-page.js",
    ],
  );
});

test("provider adapters are packaged locally rather than fetched remotely", async () => {
  const adapters = await readFile("src/content/provider-adapters.js", "utf8");

  assert.match(adapters, /meta\.ai/);
  assert.doesNotMatch(adapters, /\bfetch\s*\(/);
  assert.doesNotMatch(adapters, /https:\/\/raw\.githubusercontent\.com/);
});

test("Meta Lexical input writing uses serialized execCommand without events or DOM fallback", async () => {
  const script = await readFile("src/content/provider-page.js", "utf8");
  const metaWrite = script.match(/if \(writeStrategy === "single-editor-replace"\) \{[\s\S]*?\n    \}/)?.[0];
  const inputWait = script.match(/async function waitForInputWritten\([\s\S]*?\n  \}/)?.[0];

  assert.ok(metaWrite);
  assert.ok(inputWait);
  assert.equal((metaWrite.match(/document\.execCommand\("insertText"/g) || []).length, 1);
  assert.equal((metaWrite.match(/dispatchEvent/g) || []).length, 0);
  assert.match(metaWrite, /const selection = document\.getSelection\(\)/);
  assert.match(metaWrite, /!selection \|\| typeof document\.execCommand !== "function"/);
  assert.match(metaWrite, /selection\.selectAllChildren\(element\)/);
  assert.match(metaWrite, /replace\(\/\\r\\n\?\/g, "\\n"\)[\s\S]*?replace\(\/\\n\/g, "\\u2028"\)/);
  assert.match(metaWrite, /document\.execCommand\("insertText", false, serializedText\) === false/);
  assert.doesNotMatch(metaWrite, /textContent\s*=/);
  assert.match(metaWrite, /await waitForInputWritten\(element, serializedText\)/);
  assert.doesNotMatch(inputWait, /dispatchEvent|execCommand|textContent\s*=/);
  assert.match(script, /const INPUT_WRITE_TIMEOUT_MS = 2000/);
  assert.match(inputWait, /while \(true\) \{[\s\S]*?normalizeInputText\(readInputText\(element\)\) === expected[\s\S]*?throw createInputWriteError\(\)/);
});

test("content script falls back to Enter submit after writing the prompt", async () => {
  const script = await readFile("src/content/provider-page.js", "utf8");
  const adapters = await readFile("src/content/provider-adapters.js", "utf8");

  assert.match(script, /dispatchEnter\(input\)/);
  assert.match(adapters, /button\[type='submit'\]/);
});

test("content script does not accept the submitted prompt bubble as an AI response", async () => {
  const script = await readFile("src/content/provider-page.js", "utf8");

  assert.match(script, /!isPromptEcho\(prompt, currentText\)/);
  assert.match(script, /baseline,\s+errorBaseline,\s+prompt: message\.prompt/);
  assert.match(script, /waitForCompletion\(config, providerId, message\.timeoutMs \|\| 120000, run\.baseline, run\.prompt, run\.errorBaseline\)/);
});

test("content script uses inactivity timeout with a bounded completion hard cap", async () => {
  const script = await readFile("src/content/provider-page.js", "utf8");

  assert.match(script, /const RESPONSE_HARD_CAP_MS = 12 \* 60 \* 1000/);
  assert.match(script, /inactivityDeadline: Math\.min\(hardDeadline, startedAt \+ inactivityMs\)/);
  assert.match(script, /inactivityDeadline: Math\.min\(window\.hardDeadline, now \+ window\.inactivityMs\)/);
  assert.match(script, /completionWindow = extendCompletionWindow\(completionWindow\)/);
  assert.match(script, /now >= Math\.min\(completionWindow\.inactivityDeadline, completionWindow\.hardDeadline\)/);
});

test("Gemini confirms submission before registering the run", async () => {
  const script = await readFile("src/content/provider-page.js", "utf8");
  const adapters = await readFile("src/content/provider-adapters.js", "utf8");

  assert.match(script, /ensurePromptSubmitted/);
  assert.match(script, /observeGeminiSubmission/);
  assert.match(script, /findSendButton\(config, input\)/);
  assert.ok(script.indexOf("ensurePromptSubmitted({") < script.indexOf("submittedRuns.set(runId"));
  assert.match(adapters, /gemini:[\s\S]*?sendSelectors:\s*\[\s*"button\.send-button"[\s\S]*?"button\[type='submit'\]"/);
});

test("ChatGPT waits for generation to end and provider errors are rejected", async () => {
  const script = await readFile("src/content/provider-page.js", "utf8");
  const adapters = await readFile("src/content/provider-adapters.js", "utf8");

  assert.match(adapters, /chatgpt:[\s\S]*?requireGenerationEnd:\s*true/);
  assert.doesNotMatch(script, /timeStable > 15000/);
  assert.match(script, /classifyProviderResponseError/);
  assert.match(script, /createProviderResponseError\(providerError, content\)/);
  assert.match(script, /providerContent:\s*error\.providerContent/);
  assert.match(script, /error\.providerContent = content/);
});
