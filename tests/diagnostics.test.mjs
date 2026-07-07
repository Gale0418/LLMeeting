import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createProviderDiagnostics,
  updateProviderDiagnostic,
} from "../src/background/diagnostics.js";

test("provider diagnostics starts idle and can record tab details without mutating prior state", () => {
  const original = createProviderDiagnostics(["chatgpt"]);
  const updated = updateProviderDiagnostic(original, "chatgpt", {
    stage: "waiting-response",
    tabId: 42,
    url: "https://chatgpt.com/",
  });

  assert.deepEqual(original.chatgpt, {
    stage: "idle",
    phase: "",
    tabId: null,
    url: "",
    error: "",
  });
  assert.deepEqual(updated.chatgpt, {
    stage: "waiting-response",
    phase: "",
    tabId: 42,
    url: "https://chatgpt.com/",
    error: "",
  });
});

test("side panel exposes a visible provider diagnostics output", async () => {
  const html = await readFile("src/sidepanel/index.html", "utf8");
  const app = await readFile("src/sidepanel/app.js", "utf8");

  assert.match(html, /id="diagnosticsOutput"/);
  assert.match(app, /renderDiagnostics\(state\)/);
});

test("side panel html has a single document shell and app module", async () => {
  const html = await readFile("src/sidepanel/index.html", "utf8");

  assert.equal(html.match(/<!doctype html>/gi)?.length, 1);
  assert.equal(html.match(/<html\b/gi)?.length, 1);
  assert.equal(html.match(/<body\b/gi)?.length, 1);
  assert.equal(html.match(/<script type="module" src="app\.js"><\/script>/g)?.length, 1);
});

test("side panel exposes one main debate button and advanced mutually exclusive debate modes", async () => {
  const html = await readFile("src/sidepanel/index.html", "utf8");
  const app = await readFile("src/sidepanel/app.js", "utf8");

  assert.doesNotMatch(html, /mockModeCheckbox/);
  assert.doesNotMatch(app, /mockModeCheckbox/);
  assert.match(html, /id="basicDebateButton"/);
  assert.doesNotMatch(html, /id="quickDebateButton"/);
  assert.doesNotMatch(html, /id="summaryDebateButton"/);
  assert.match(html, /name="debateMode"[^>]+value="basic"[^>]+checked/);
  assert.match(html, /name="debateMode"[^>]+value="fast"/);
  assert.match(html, /name="debateMode"[^>]+value="summary"/);
  assert.match(html, /id="debateRoundsInput"/);
  assert.match(html, /min="1"/);
  assert.match(html, /max="5"/);
  assert.match(html, /data-pro-feature="fastDebate"/);
  assert.match(html, /data-pro-feature="summaryDebate"/);
  assert.match(html, /value="claude" checked> Claude/);
  assert.match(app, /startSelectedDebate/);
  assert.match(app, /selectedDebateMode/);
  assert.match(app, /selectedDebateRounds/);
  assert.match(app, /debateRounds/);
  assert.match(app, /featureForMode/);
  assert.match(app, /chat: "chatMode"/);
  assert.match(app, /theater: "chatMode"/);
  assert.match(app, /renderDebateModeState/);
  assert.match(app, /renderEntitlementState/);
});

test("side panel exposes Pro summary strategy modes and random chair choice", async () => {
  const html = await readFile("src/sidepanel/index.html", "utf8");
  const app = await readFile("src/sidepanel/app.js", "utf8");

  assert.match(html, /name="summaryStrategy"[^>]+value="standard"[^>]+checked/);
  assert.match(html, /name="summaryStrategy"[^>]+value="observerChair"/);
  assert.match(html, /name="summaryStrategy"[^>]+value="anonymousReview"/);
  assert.match(html, /data-pro-feature="observerChair"/);
  assert.match(html, /data-pro-feature="anonymousReview"/);
  assert.match(html, /<option value="random">隨機主席<\/option>/);
  assert.match(html, /class="version-badge">v0\.4\.6<\/span>/);
  assert.match(app, /const summaryStrategyEls = Array\.from\(document\.querySelectorAll\("\.summary-strategy-select"\)\)/);
  assert.match(app, /selectedSummaryStrategy/);
  assert.match(app, /featureForSummaryStrategy/);
  assert.match(app, /summaryStrategy: selectedSummaryStrategy\(\)/);
});

test("side panel previews checked providers while idle", async () => {
  const app = await readFile("src/sidepanel/app.js", "utf8");

  assert.match(app, /const providerSelectEls = Array\.from\(document\.querySelectorAll\("\.provider-select"\)\)/);
  assert.match(app, /providerSelectEls\.forEach\(\(el\) => \{\s+el\.addEventListener\("change", renderProviderSelectionPreview\);/);
  assert.match(app, /function renderProviderSelectionPreview\(\)/);
  assert.match(app, /activeProviders: selectedProviderIds\(\)/);
});

test("side panel renders user interjections from their critique round", async () => {
  const app = await readFile("src/sidepanel/app.js", "utf8");

  assert.match(app, /const userMessage = critiques\.USER/);
  assert.doesNotMatch(app, /transcript\.userMessages/);
});
