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
  assert.match(html, /id="basicModeOption"/);
  assert.match(html, /name="debateMode"[^>]+value="fast"/);
  assert.match(html, /name="debateMode"[^>]+value="summary"/);
  assert.match(html, /id="debateRoundsInput"/);
  assert.match(html, /min="1"/);
  assert.match(html, /max="5"/);
  assert.match(html, /data-pro-feature="fastDebate"/);
  assert.match(html, /data-pro-feature="summaryDebate"/);
  assert.match(html, /value="claude" checked> Claude/);
  assert.match(html, /value="meta"> Meta AI/);
  assert.doesNotMatch(html, /value="meta" checked/);
  assert.match(html, /未指定時，每次會議都會開啟新分頁/);
  assert.equal(html.match(/\[預設\] 開新分頁/g)?.length, 5);
  assert.doesNotMatch(html, /尋找或開新分頁/);
  assert.match(app, /\[預設\] 開新分頁/);
  assert.match(app, /startSelectedDebate/);
  assert.match(app, /selectedDebateMode/);
  assert.match(app, /selectedDebateRounds/);
  assert.match(app, /debateRounds/);
  assert.match(app, /featureForMode/);
  assert.match(app, /chat: "chatMode"/);
  assert.match(app, /theater: "chatMode"/);
  assert.match(app, /renderDebateModeState/);
  assert.match(app, /renderEntitlementState/);
  assert.match(app, /const debateRounds = selectedDebateRounds\(\);/);
  assert.match(app, /mode === "chat"[\s\S]*?啟動自由群聊中/);
  assert.match(app, /mode === "theater"[\s\S]*?啟動劇場大亂鬥中/);
  assert.match(app, /basicDebateModeOption\.style\.display/);
  assert.match(app, /proPillEls\.forEach/);
  assert.match(app, /pill\.textContent = currentEntitlements\.isPro \? "🐑" : "PRO"/);
});

test("debate mode entitlement keeps Pro on Fast and Free on Basic", async () => {
  const app = await readFile("src/sidepanel/app.js", "utf8");

  // Product semantics: Pro does not expose ordinary Basic; Basic is the Free fallback.
  assert.match(app, /currentEntitlements\.isPro && !featureId/);
  assert.match(app, /input\.debate-mode-select\[value="fast"\]/);
  assert.match(app, /!currentEntitlements\.isPro && featureId/);
  assert.match(app, /input\.debate-mode-select\[value="basic"\]/);
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
  assert.match(html, /class="version-badge">v0\.4\.7<\/span>/);
  assert.match(app, /const summaryStrategyEls = Array\.from\(document\.querySelectorAll\("\.summary-strategy-select"\)\)/);
  assert.match(app, /selectedSummaryStrategy/);
  assert.match(app, /featureForSummaryStrategy/);
  assert.match(app, /summaryStrategy: selectedSummaryStrategy\(\)/);
});

test("side panel exposes local retention notice and clear-data control", async () => {
  const html = await readFile("src/sidepanel/index.html", "utf8");
  const app = await readFile("src/sidepanel/app.js", "utf8");

  assert.match(html, /id="clearLocalDataButton"/);
  assert.match(html, /最長 24 小時/);
  assert.match(html, /不會傳給 LLMeeting 開發者伺服器/);
  assert.match(app, /aiDebate:clearLocalData/);
});

test("side panel previews checked providers while idle", async () => {
  const app = await readFile("src/sidepanel/app.js", "utf8");

  assert.match(app, /const providerSelectEls = Array\.from\(document\.querySelectorAll\("\.provider-select"\)\)/);
  assert.match(app, /providerSelectEls\.forEach\(\(el\) => \{\s+el\.addEventListener\("change", renderProviderSelectionPreview\);/);
  assert.match(app, /function renderProviderSelectionPreview\(\)/);
  assert.match(app, /activeProviders: selectedProviderIds\(\)/);
});

test("theater mode exposes and submits a default persona for every provider", async () => {
  const html = await readFile("src/sidepanel/index.html", "utf8");
  const app = await readFile("src/sidepanel/app.js", "utf8");

  for (const [providerId, elementSuffix] of [
    ["chatgpt", "Chatgpt"],
    ["gemini", "Gemini"],
    ["grok", "Grok"],
    ["claude", "Claude"],
    ["meta", "Meta"],
  ]) {
    assert.match(html, new RegExp(`id="persona${elementSuffix}"`));
    assert.match(app, new RegExp(`customPersonas\\.${providerId} = document\\.querySelector\\("#persona${elementSuffix}"\\)`));
  }
  assert.match(html, /Meta AI Beta \(預設: 社群視角\)/);
  assert.match(html, /區分流行意見與可靠事實/);
});

test("side panel renders user interjections from their critique round", async () => {
  const app = await readFile("src/sidepanel/app.js", "utf8");

  assert.match(app, /const userMessage = critiques\.USER/);
  assert.doesNotMatch(app, /transcript\.userMessages/);
});
