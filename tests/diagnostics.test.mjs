import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createProviderDiagnostics,
  updateProviderDiagnostic,
} from "../src/background/diagnostics.js";
import { getPersonaPrompt } from "../src/shared/prompts.js";
import { isCritiquePhase, isInteractiveDebateMode, shouldShowChatControls } from "../src/sidepanel/modeRules.js";

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
  assert.doesNotMatch(html, /name="debateMode"[^>]+value="basic"/);
  assert.match(html, /name="debateMode"[^>]+value="fast"[^>]+checked/);
  assert.match(html, /name="debateMode"[^>]+value="fast"/);
  assert.match(html, /name="debateMode"[^>]+value="summary"/);
  assert.match(html, /id="debateRoundsInput"/);
  assert.match(html, /min="1"/);
  assert.match(html, /max="5"/);
  assert.match(html, /data-pro-feature="fastDebate"/);
  assert.match(html, /data-pro-feature="summaryDebate"/);
  assert.match(html, /data-provider-toggle="claude" aria-pressed="true"/);
  assert.match(html, /data-provider-toggle="meta" aria-pressed="false"/);
  assert.equal(html.match(/data-provider-toggle=/g)?.length, 5);
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
  assert.match(app, /const debateRounds = mode === "chat" \? undefined : selectedDebateRounds\(\);/);
  assert.match(app, /mode === "chat"[\s\S]*?啟動自由群聊中/);
  assert.match(app, /mode === "theater"[\s\S]*?啟動劇場大亂鬥中/);
  assert.doesNotMatch(html, /class="pro-pill"/);
  assert.match(app, /planBadge\.textContent = currentEntitlements\.sheepMode \? "🐑" : "Free"/);
});

test("all debate modes remain visible without plan-based automatic switching", async () => {
  const app = await readFile("src/sidepanel/app.js", "utf8");

  assert.doesNotMatch(app, /currentEntitlements\.isPro/);
  assert.doesNotMatch(app, /basicDebateModeOption/);
});

test("side panel exposes Pro summary strategy modes and random chair choice", async () => {
  const html = await readFile("src/sidepanel/index.html", "utf8");
  const app = await readFile("src/sidepanel/app.js", "utf8");

  assert.match(html, /name="summaryStrategy"[^>]+value="standard"[^>]+checked/);
  assert.match(html, /name="summaryStrategy"[^>]+value="observerChair"/);
  assert.match(html, /name="summaryStrategy"[^>]+value="anonymousReview"/);
  assert.match(html, /name="summaryStrategy"[^>]+value="allAnonymous"/);
  assert.equal(html.match(/name="summaryStrategy"/g)?.length, 4);
  assert.match(html, /data-pro-feature="observerChair"/);
  assert.match(html, /data-pro-feature="anonymousReview"/);
  assert.match(html, /<option value="random">隨機主席<\/option>/);
  assert.match(html, /class="version-badge">v0\.5\.0<\/span>/);
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

test("side panel persists physical provider activation buttons while idle", async () => {
  const app = await readFile("src/sidepanel/app.js", "utf8");
  const html = await readFile("src/sidepanel/index.html", "utf8");

  assert.match(app, /const PROVIDER_SELECTION_STORAGE_KEY = "aiDebate\.providerSelection\.v1"/);
  assert.match(app, /providerToggleEls\.forEach\(\(el\) => el\.addEventListener\("click", \(\) => toggleProvider\(el\)\)\)/);
  assert.match(app, /function renderProviderSelectionPreview\(\)/);
  assert.match(app, /activeProviders: selectedProviderIds\(\)/);
  assert.doesNotMatch(html, /class="provider-select"/);
});

test("side panel keeps the interactive console visible for interactive modes", async () => {
  const app = await readFile("src/sidepanel/app.js", "utf8");

  assert.equal(isInteractiveDebateMode("basic"), false);
  assert.equal(isInteractiveDebateMode("fast"), false);
  assert.equal(isInteractiveDebateMode("chat"), true);
  assert.equal(isInteractiveDebateMode("theater"), true);
  assert.equal(isInteractiveDebateMode("summary"), true);
  assert.equal(shouldShowChatControls("theater", null), true);
  assert.equal(shouldShowChatControls("basic", { mode: "theater", phase: "waiting_for_user" }), true);
  assert.equal(shouldShowChatControls("basic", { mode: "theater", phase: "done" }), false);
  assert.match(app, /chatControls\.style\.display = shouldShowChatControls\(mode, latestState\)/);
  assert.match(app, /chatControls\.open = true/);
});

test("side panel exposes accessible live status and progress semantics", async () => {
  const html = await readFile("src/sidepanel/index.html", "utf8");
  const app = await readFile("src/sidepanel/app.js", "utf8");

  assert.match(html, /id="statusText" role="status" aria-live="polite"/);
  assert.match(html, /id="chatTranscript" class="chat-transcript" role="region" aria-label="即時會議紀錄" aria-live="off"/);
  assert.match(html, /id="progressContainer" class="reactor-route" role="progressbar"/);
  assert.equal(html.match(/aria-describedby="(?:chatgpt|gemini|grok|claude|meta)State"/g)?.length, 5);
  assert.match(html, /id="checkReadinessButton"[^>]+aria-describedby="readinessHint"/);
  assert.match(html, /檢查連線/);
  assert.match(html, /可選診斷；正式會議通常建立新對話，總結辯論則沿用目前來源分頁/);
  assert.match(app, /progressContainer\?\.setAttribute\("aria-valuenow"/);
  assert.match(app, /replaceChatTranscriptHTML\(html\)/);
});

test("critique phase rendering includes numbered critique phases", () => {
  assert.equal(isCritiquePhase("critique"), true);
  assert.equal(isCritiquePhase("critique-2"), true);
  assert.equal(isCritiquePhase("critique-5"), true);
  assert.equal(isCritiquePhase("summary"), false);
});

test("side panel locks advanced controls while a run is busy and sanitizes provider metadata", async () => {
  const app = await readFile("src/sidepanel/app.js", "utf8");

  assert.match(app, /advancedControlEls\.forEach\(\(control\) => \{[\s\S]*control\.disabled = disabled/);
  assert.match(app, /safeProviderClass\(providerId\)/);
  assert.match(app, /function safeProviderClass\(id\)/);
  assert.doesNotMatch(app, /summaryProviderSelect\.querySelector\(`option\[value=\"\$\{state\.summaryProvider\}/);
  assert.doesNotMatch(app, /document\.querySelector\(`input\.summary-strategy-select\[value=\"\$\{state\.summaryStrategy\}/);
});

test("provider controls stay visible in one horizontal row without a disclosure", async () => {
  const html = await readFile("src/sidepanel/index.html", "utf8");
  const css = await readFile("src/sidepanel/styles.css", "utf8");
  const providerDeck = html.slice(
    html.indexOf('<section id="providerDeck"'),
    html.indexOf("<!-- 進階自訂面板 -->"),
  );

  assert.match(html, /<section id="providerDeck" class="provider-deck"/);
  assert.doesNotMatch(html, /<details id="providerDeck"/);
  assert.match(css, /\.provider-console \{[\s\S]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.provider-row \{[\s\S]*aspect-ratio: 1;/);
  assert.match(css, /\.provider-toggle \{[\s\S]*min-height: 100%;/);
  assert.doesNotMatch(providerDeck, /決策架構|靈感整合|壓力測試|風險編輯|社群視角/);
  assert.doesNotMatch(providerDeck, /BETA/);
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

test("side panel renders imposter reveal as a dedicated round without summary provider labels", async () => {
  const app = await readFile("src/sidepanel/app.js", "utf8");

  assert.match(app, /if \(state\.reveal\)/);
  assert.match(app, /揭曉輪/);
  assert.match(app, /遊戲揭曉/);
  assert.match(app, /state\.reveal\.content \|\| state\.summary/);
  assert.match(app, /state\.reveal \? "遊戲揭曉:"/);
  assert.match(app, /state\.reveal\.reactions/);
  assert.match(app, /揭曉反應/);
});

test("side panel persona defaults stay synchronized with shared personas", async () => {
  const html = await readFile("src/sidepanel/index.html", "utf8");
  const ids = ["chatgpt", "claude", "grok", "gemini", "meta"];
  const suffixes = { chatgpt: "Chatgpt", claude: "Claude", grok: "Grok", gemini: "Gemini", meta: "Meta" };
  for (const providerId of ids) {
    const persona = getPersonaPrompt(providerId);
    assert.ok(html.includes(`${persona}</textarea>`), `${providerId} persona is not synchronized`);
  }
});

test("side panel export keeps reveal content when summary is empty", async () => {
  const app = await readFile("src/sidepanel/app.js", "utf8");
  const start = app.indexOf("function buildTranscriptText(state) {");
  const end = app.indexOf("function renderMessage", start);
  assert.ok(start >= 0 && end > start, "buildTranscriptText source is present");

  const createTranscriptBuilder = new Function(
    "PROVIDERS",
    "critiqueRoundMaps",
    "providerLabel",
    "meetingSpeakerLabel",
    `${app.slice(start, end)} return buildTranscriptText;`,
  );
  const buildTranscriptText = createTranscriptBuilder(
    [{ id: "chatgpt", label: "ChatGPT" }],
    () => [],
    (providerId) => providerId,
    (_state, providerId) => providerId,
  );
  const output = buildTranscriptText({
    transcript: { originalQuestion: "測試問題", answers: {} },
    summary: "",
    reveal: { content: "揭曉內容" },
  });

  assert.match(output, /遊戲揭曉:\n揭曉內容/);
});
