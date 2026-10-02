import {
  canUseFeature,
  entitlementsForPlan,
  featureLabel,
  proRequiredMessage,
} from "../shared/entitlements.js";
import { DEFAULT_ACTIVE_PROVIDER_IDS, PROVIDERS } from "../shared/providers.js";
import { isCritiquePhase, shouldShowChatControls } from "./modeRules.js";
import { hasMeetingContent, launchGuide, readinessRecovery } from "./experienceRules.js";
import { appendPlayIdea, canUsePlayIdeas, playIdeas } from "./playIdeas.js";
import { normalizeRoundNumber } from "../shared/text.js";

const PROVIDER_SELECTION_STORAGE_KEY = "aiDebate.providerSelection.v1";

const form = document.querySelector("#debateForm");
const questionInput = document.querySelector("#questionInput");
const basicDebateButton = document.querySelector("#basicDebateButton");
const resetButton = document.querySelector("#resetButton");
const clearLocalDataButton = document.querySelector("#clearLocalDataButton");
const statusText = document.querySelector("#statusText");
const planBadge = document.querySelector("#planBadge");
const transcriptOutput = document.querySelector("#transcriptOutput");
const diagnosticsOutput = document.querySelector("#diagnosticsOutput");
const chatTranscript = document.querySelector("#chatTranscript");
const progressBar = document.querySelector("#progressBar");
const progressContainer = document.querySelector("#progressContainer");
const progressNodes = Array.from(document.querySelectorAll("#progressContainer .route-node"));
const providerSummaryText = document.querySelector("#providerSummaryText");
const readinessHint = document.querySelector("#readinessHint");
const checkReadinessButton = document.querySelector("#checkReadinessButton");
const providerRecovery = document.querySelector("#providerRecovery");
const launchGuideEl = document.querySelector("#launchGuide");

const summaryProviderSelect = document.querySelector("#summaryProviderSelect");
const debateRoundsInput = document.querySelector("#debateRoundsInput");
const debateRoundsSetting = document.querySelector("#debateRoundsSetting");
const interactionStyleSelect = document.querySelector("#interactionStyleSelect");
const providerToggleEls = Array.from(document.querySelectorAll("[data-provider-toggle]"));
const debateModeEls = Array.from(document.querySelectorAll(".debate-mode-select"));
const debateModeOptionEls = Array.from(document.querySelectorAll(".mode-option[data-pro-feature]"));
const summaryStrategyEls = Array.from(document.querySelectorAll(".summary-strategy-select"));
const summaryStrategyOptionEls = Array.from(document.querySelectorAll(".summary-strategy-option[data-pro-feature]"));
const skipSummaryCheckbox = document.querySelector("#skipSummaryCheckbox");

const chatControls = document.querySelector("#chatControls");
const chatInput = document.querySelector("#chatInput");
const chatSendBtn = document.querySelector("#chatSendBtn");
const chatCritiqueBtn = document.querySelector("#chatCritiqueBtn");
const chatSummarizeBtn = document.querySelector("#chatSummarizeBtn");
const playIdeaButtons = document.querySelector("#playIdeaButtons");
const playCue = document.querySelector("#playCue");
const chatRoundBadge = document.querySelector("#chatRoundBadge");
const theaterSettings = document.querySelector("#theaterSettings");
const refreshHooksBtn = document.querySelector("#refreshHooksBtn");

const hookSelects = {
  chatgpt: document.querySelector("#hookChatgpt"),
  claude: document.querySelector("#hookClaude"),
  grok: document.querySelector("#hookGrok"),
  gemini: document.querySelector("#hookGemini"),
  meta: document.querySelector("#hookMeta"),
};

const providerStateEls = {
  chatgpt: document.querySelector("#chatgptState"),
  gemini: document.querySelector("#geminiState"),
  grok: document.querySelector("#grokState"),
  claude: document.querySelector("#claudeState"),
  meta: document.querySelector("#metaState"),
};

let latestState = null;
let currentEntitlements = entitlementsForPlan();
const fallbackProviderIds = PROVIDERS.map((provider) => provider.id);
let selectedProviderSet = new Set(DEFAULT_ACTIVE_PROVIDER_IDS);
let latestReadiness = {};
let providerSelectionWrite = Promise.resolve();
let lastRenderedChatHtml = null;

const advancedControlEls = Array.from(document.querySelectorAll(
  ".settings-content input, .settings-content select, .settings-content textarea, #refreshHooksBtn",
));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (basicDebateButton.disabled || latestState?.busy) return;
  await startSelectedDebate();
});

providerToggleEls.forEach((el) => el.addEventListener("click", () => toggleProvider(el)));

debateModeEls.forEach((el) => {
  el.addEventListener("change", renderDebateModeState);
});

summaryStrategyEls.forEach((el) => {
  el.addEventListener("change", renderSummaryStrategyState);
});

debateRoundsInput?.addEventListener("change", normalizeDebateRoundsInput);
debateRoundsInput?.addEventListener("blur", normalizeDebateRoundsInput);

refreshHooksBtn?.addEventListener("click", scanAndPopulateHookTabs);
checkReadinessButton?.addEventListener("click", checkSelectedProviders);

bootstrap();

async function bootstrap() {
  await loadProviderSelection();
  renderProviderControls();
  loadDevUnlock();
  renderDebateModeState();
  renderSummaryStrategyState();
  await Promise.all([scanAndPopulateHookTabs(), loadState()]);
}

async function loadProviderSelection() {
  try {
    const stored = await chrome.storage.local.get(PROVIDER_SELECTION_STORAGE_KEY);
    const raw = stored?.[PROVIDER_SELECTION_STORAGE_KEY];
    if (Array.isArray(raw)) {
      const validIds = raw.filter((id, index) => fallbackProviderIds.includes(id) && raw.indexOf(id) === index);
      selectedProviderSet = new Set(raw.length > 0 && validIds.length === 0 ? DEFAULT_ACTIVE_PROVIDER_IDS : validIds);
    }
  } catch (_error) {
    selectedProviderSet = new Set(DEFAULT_ACTIVE_PROVIDER_IDS);
  }
}

async function persistProviderSelection() {
  const selection = selectedProviderIds();
  providerSelectionWrite = providerSelectionWrite
    .catch(() => {})
    .then(() => chrome.storage.local.set({ [PROVIDER_SELECTION_STORAGE_KEY]: selection }))
    .catch(() => {
      renderMessage("模型選擇未能保存；目前選擇仍可使用，重新開啟後可能恢復舊設定。");
    });
  await providerSelectionWrite;
}

async function toggleProvider(button) {
  if (latestState?.busy || button.disabled) return;
  const providerId = button.dataset.providerToggle;
  const row = button.closest(".provider-row");
  if (selectedProviderSet.has(providerId)) {
    selectedProviderSet.delete(providerId);
  } else {
    selectedProviderSet.add(providerId);
    row?.classList.remove("just-activated");
    requestAnimationFrame(() => row?.classList.add("just-activated"));
    globalThis.setTimeout(() => row?.classList.remove("just-activated"), 760);
  }
  latestReadiness = {};
  renderProviderControls();
  renderProviderSelectionPreview();
  await persistProviderSelection();
}

function renderProviderControls() {
  for (const button of providerToggleEls) {
    const providerId = button.dataset.providerToggle;
    const enabled = selectedProviderSet.has(providerId);
    button.setAttribute("aria-pressed", String(enabled));
    const statusEl = providerStateEls[providerId];
    if (statusEl?.id) button.setAttribute("aria-describedby", statusEl.id);
    button.setAttribute("aria-label", `${PROVIDERS.find((item) => item.id === providerId)?.label || providerId}：${enabled ? "已啟用" : "未啟用"}`);
    button.disabled = Boolean(latestState?.busy);
    button.closest(".provider-row")?.classList.toggle("is-off", !enabled);
  }
  renderProviderSummary();
}

async function checkSelectedProviders() {
  if (latestState?.busy) return;
  const activeProviders = selectedProviderIds();
  if (!activeProviders.length) {
    renderMessage("請先啟用至少一家 AI 再檢查連線");
    return;
  }
  checkReadinessButton.disabled = true;
  readinessHint.textContent = "正在逐一檢查 Provider 連線…";
  const response = await chrome.runtime.sendMessage({
    type: "aiDebate:checkReadiness",
    mode: selectedDebateMode(),
    activeProviders,
    summaryProvider: summaryProviderSelect?.value,
    summaryStrategy: selectedSummaryStrategy(),
    hookedTabs: selectedHookedTabs(),
  }).catch((error) => ({ ok: false, error: error.message }));
  latestReadiness = indexReadinessResults(response?.results || response?.state?.preflightResults || []);
  if (response?.state) latestState = response.state;
  renderProviderStatuses(latestState || { activeProviders });
  readinessHint.textContent = response?.ok
    ? "診斷完成；正式會議仍會建立全新對話"
    : Object.values(latestReadiness).some((result) => result.ready === false)
      ? "檢查未完成，請依下方指引處理；技術細節可在診斷資訊查看。"
      : "未取得檢查結果，請重新檢查；若仍失敗，確認擴充套件已載入。";
  checkReadinessButton.disabled = false;
}

function indexReadinessResults(results) {
  return Object.fromEntries((Array.isArray(results) ? results : []).filter((item) => item?.provider).map((item) => [item.provider, item]));
}

async function scanAndPopulateHookTabs() {
  for (const provider of PROVIDERS) {
    const selectEl = hookSelects[provider.id];
    if (!selectEl) continue;

    // 保留第一個選項
    selectEl.innerHTML = '<option value="">[預設] 開新分頁</option>';

    try {
      // 既有分頁只列在指定連線選單；未指定時 background 一律開新分頁。
      const tabs = [];
      for (const pattern of provider.matchPatterns) {
        const queryTabs = await chrome.tabs.query({ url: pattern });
        tabs.push(...queryTabs);
      }

      // 去重
      const uniqueTabs = Array.from(new Map(tabs.map((t) => [t.id, t])).values());
      uniqueTabs.sort((a, b) => b.windowId - a.windowId);

      for (const tab of uniqueTabs) {
        const option = document.createElement("option");
        option.value = tab.id.toString();
        const title = tab.title ? (tab.title.length > 30 ? tab.title.substring(0, 30) + "..." : tab.title) : "未命名分頁";
        option.textContent = `[分頁] ${title}`;
        selectEl.appendChild(option);
      }
    } catch (error) {
      console.error("Failed to query tabs for", provider.id, error);
    }
  }
}

async function startSelectedDebate() {
  const mode = selectedDebateMode();
  const featureId = featureForMode(mode);
  if (featureId && !canUseFeature(currentEntitlements, featureId)) {
    renderLockedFeatureMessage(featureId);
    renderDebateModeState();
    return;
  }

  const summaryFeatureId = featureForSummaryStrategy(selectedSummaryStrategy());
  if (summaryFeatureId && !canUseFeature(currentEntitlements, summaryFeatureId)) {
    renderLockedFeatureMessage(summaryFeatureId);
    renderSummaryStrategyState();
    return;
  }

  await startDebate(mode);
}

async function startDebate(mode) {
  const question = questionInput.value.trim();
  if (mode !== "summary" && !question) {
    renderMessage("請先輸入問題");
    questionInput.focus();
    return;
  }

  const activeProviders = selectedProviderIds();

  if (activeProviders.length < 2) {
    renderMessage("❌ 至少需要選擇 2 家 AI 才能進行辯論喔！");
    return;
  }

  const summaryStrategy = selectedSummaryStrategy();
  if (summaryStrategy === "observerChair" && activeProviders.length < 3) {
    renderMessage("❌ 圍觀主席制至少需勾選 3 家 AI，扣掉主席後才有 2 家能辯論。");
    return;
  }

  const summaryProvider = document.querySelector("#summaryProviderSelect").value;
  const skipSummary = document.querySelector("#skipSummaryCheckbox").checked;
  if (mode !== "summary" && summaryStrategy !== "allAnonymous" && !skipSummary && summaryProvider !== "random" && !activeProviders.includes(summaryProvider)) {
    renderMessage(`❌ 請先啟用要擔任總結的 ${providerLabel(summaryProvider)}。`);
    return;
  }
  const debateRounds = mode === "chat" ? undefined : selectedDebateRounds();
  const interactionStyle = interactionStyleSelect?.value || "critique";

  const customPersonas = {};
  if (mode === "theater") {
    customPersonas.chatgpt = document.querySelector("#personaChatgpt")?.value || "";
    customPersonas.claude = document.querySelector("#personaClaude")?.value || "";
    customPersonas.grok = document.querySelector("#personaGrok")?.value || "";
    customPersonas.gemini = document.querySelector("#personaGemini")?.value || "";
    customPersonas.meta = document.querySelector("#personaMeta")?.value || "";
  }

  const hookedTabs = selectedHookedTabs();

  const chatControls = document.getElementById("chatControls");
  const interactiveMode = mode === "chat" || Boolean(chatControls && chatControls.style.display !== "none" && chatControls.open);

  setActionButtonsDisabled(true);
  renderMessage(startingMessage(mode));

  const response = await chrome.runtime.sendMessage({
    type: "aiDebate:start",
    question,
    mode,
    activeProviders,
    summaryProvider,
    summaryStrategy: selectedSummaryStrategy(),
    skipSummary,
    ...(debateRounds === undefined ? {} : { debateRounds }),
    customPersonas,
    hookedTabs,
    interactionStyle,
    interactiveMode,
  }).catch((err) => ({ ok: false, error: "啟動失敗: " + err.message }));

  if (!response?.ok) {
    if (response?.code === "PRO_REQUIRED") {
      renderLockedFeatureMessage(response?.feature);
    } else {
      renderMessage(response?.error || "啟動失敗");
    }
    setActionButtonsDisabled(false);
  }
  latestReadiness = indexReadinessResults(response?.results || response?.state?.preflightResults || []);
  renderState(response?.state);
}

function selectedHookedTabs() {
  const tabHookingSettings = document.getElementById("tabHookingSettings");
  const hookedTabs = {};
  if (!tabHookingSettings?.open) return hookedTabs;
  for (const providerId of Object.keys(hookSelects)) {
    const tabId = Number.parseInt(hookSelects[providerId]?.value || "", 10);
    if (Number.isInteger(tabId)) hookedTabs[providerId] = tabId;
  }
  return hookedTabs;
}

resetButton.addEventListener("click", resetCurrentMeeting);
let resetActionPending = false;

async function resetCurrentMeeting() {
  if (resetActionPending || resetButton.disabled) return;
  if (hasMeetingContent(latestState) && !globalThis.confirm("重置會結束目前會議並清除這場紀錄，無法復原。模型選擇會保留。確定重置？")) return;
  resetActionPending = true;
  resetButton.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "aiDebate:reset" });
    if (response?.ok) renderState(response.state);
    else renderMessage(response?.error || "重置未完成，請稍後再試。");
  } catch (_error) {
    renderMessage("無法連線到擴充套件；重置結果尚未確認，請先確認目前會議狀態。");
  } finally {
    resetActionPending = false;
    resetButton.disabled = false;
  }
}

clearLocalDataButton?.addEventListener("click", async () => {
  const confirmed = globalThis.confirm("確定要清除本機保存的辯論內容與等待紀錄嗎？");
  if (!confirmed) {
    return;
  }
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:clearLocalData" }).catch(() => null);
  renderState(response?.state);
  renderMessage(response?.ok ? "本機辯論紀錄已清除" : (response?.error || "清除失敗"));
});

let chatActionPending = false;

async function sendChatAction(action, text = "") {
  if (chatActionPending || latestState?.busy) return;
  if (action === "user_message" && !text.trim()) return;
  chatActionPending = true;
  chatControls.style.display = "none";
  try {
    const response = await chrome.runtime.sendMessage({
      type: "aiDebate:nextRound", action, ...(action === "user_message" ? { text } : {}),
    });
    if (response?.ok && action === "user_message" && chatInput.value.trim() === text) {
      chatInput.value = "";
    }
    if (response?.state) renderState(response.state);
    if (!response?.ok) renderMessage(response?.error || "請求失敗，內容已保留");
  } catch (error) {
    renderMessage(error.message || "請求失敗，內容已保留");
  } finally {
    chatActionPending = false;
    renderDebateModeState();
  }
}

chatSendBtn?.addEventListener("click", () => sendChatAction("user_message", chatInput.value.trim()));
chatCritiqueBtn?.addEventListener("click", () => sendChatAction("critique"));
chatSummarizeBtn?.addEventListener("click", () => sendChatAction("summarize"));

function renderPlayIdeas() {
  if (!playIdeaButtons) return;
  const available = canUsePlayIdeas(latestState, chatActionPending);
  const liveMeeting = latestState?.busy || latestState?.phase === "waiting_for_user";
  const mode = liveMeeting ? latestState.mode : selectedDebateMode();
  const style = liveMeeting ? latestState.interactionStyle : interactionStyleSelect?.value;
  playIdeaButtons.replaceChildren();
  for (const idea of playIdeas(mode, style)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-action play-idea";
    button.textContent = idea.label;
    button.disabled = !available;
    button.addEventListener("click", () => {
      if (!canUsePlayIdeas(latestState, chatActionPending)) return;
      chatInput.value = appendPlayIdea(chatInput.value, idea.text);
      chatInput.focus();
      chatInput.dispatchEvent(new Event("input", { bubbles: true }));
      if (playCue) playCue.textContent = "轉折已加入草稿；修改好，再按送出補充。";
    });
    playIdeaButtons.append(button);
  }
  if (chatRoundBadge) chatRoundBadge.textContent = available ? "輪到你" : latestState?.busy ? "AI 回應中" : "等開場";
  if (playCue) playCue.textContent = available
    ? "輪到你改變局勢。加個轉折、再互評，或結案收下這場討論。"
    : latestState?.busy ? "AI 正在回應，轉折靈感稍後可用。"
      : "先開始互動會議；等 AI 回答後，就輪到你加入討論。";
}

const stopDebateBtn = document.getElementById("stopDebateBtn");

stopDebateBtn?.addEventListener("click", async () => {
  stopDebateBtn.disabled = true;
  stopDebateBtn.textContent = "停止中...";
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:stop" }).catch(() => null);
  if (response?.state) {
    renderState(response.state);
  } else {
    stopDebateBtn.disabled = false;
    stopDebateBtn.textContent = "停止本次會議 🛑";
    renderMessage("停止失敗，請重試");
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "aiDebate:stateChanged") {
    renderState(message.state);
  }
});

async function loadState() {
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:getState" });
  renderState(response?.state);
}

async function loadDevUnlock() {
  try {
    const { attachDevUnlock } = await import("./dev-unlock.js");
    attachDevUnlock({ planBadge, renderMessage, loadState });
  } catch (error) {
    renderMessage("作者模式載入失敗: " + error.message);
  }
}

function renderState(state) {
  if (!state) {
    return;
  }

  const wasWaiting = latestState?.phase === "waiting_for_user";
  latestState = state;
  currentEntitlements = entitlementsForPlan(state.entitlements?.plan, state.entitlements?.sheepMode ?? state.entitlements?.isPro);

  if (stopDebateBtn) {
    stopDebateBtn.hidden = !state.busy;
    if (state.busy) {
      stopDebateBtn.disabled = false;
      stopDebateBtn.textContent = "停止本次會議 🛑";
    }
  }

  if (!state.busy) {
    if (state.summaryProvider && Array.from(summaryProviderSelect?.options || []).some((option) => option.value === state.summaryProvider)) {
      summaryProviderSelect.value = state.summaryProvider;
    }
    if (state.summaryStrategy) {
      const summaryStrategyInput = summaryStrategyEls.find((input) => input.value === state.summaryStrategy);
      if (summaryStrategyInput) {
        summaryStrategyInput.checked = true;
      }
    }
    if (debateRoundsInput) {
      debateRoundsInput.value = normalizeDebateRounds(state.debateRounds || state.transcript?.debateRounds || 1);
    }
    if (skipSummaryCheckbox && state.skipSummary !== undefined) {
      skipSummaryCheckbox.checked = state.skipSummary;
    }
    if (state.mode) {
      const modeInput = debateModeEls.find((input) => input.value === state.mode);
      if (modeInput) modeInput.checked = true;
    }
  }

  setActionButtonsDisabled(Boolean(state.busy));
  renderEntitlementState();
  statusText.textContent = state.message || state.status || "等待開始";

  renderProviderStatuses(state);

  // 更新進度條
  updateProgressBar(state);

  // 渲染氣泡式對話框
  renderChatBubbles(state);

  // 控制 Chat 介面
  if (chatControls) {
    const isWaiting = state.phase === "waiting_for_user";
    chatInput.disabled = !isWaiting;

    const chatButtons = document.querySelectorAll(".chat-buttons button");
    chatButtons.forEach(btn => btn.disabled = !isWaiting);

    if (isWaiting) {
      chatControls.open = true;
      if (!wasWaiting) chatInput.focus();
    }
  }

  // 傳統文字 Transcript（備用與除錯）
  transcriptOutput.textContent = buildTranscriptText(state);
  renderDiagnostics(state);
}

function renderProviderSelectionPreview() {
  if (!latestState || latestState.busy) {
    return;
  }

  const previewState = {
    ...latestState,
    activeProviders: selectedProviderIds(),
    sourceProvider: "",
  };
  renderProviderStatuses(previewState);
  renderDiagnostics(previewState);
}

function selectedProviderIds() {
  return PROVIDERS
    .map((provider) => provider.id)
    .filter((providerId) => selectedProviderSet.has(providerId));
}

function selectedDebateMode() {
  return debateModeEls.find((el) => el.checked)?.value || "fast";
}

function selectedSummaryStrategy() {
  return summaryStrategyEls.find((el) => el.checked)?.value || "standard";
}

function selectedDebateRounds() {
  return normalizeDebateRounds(debateRoundsInput?.value || 1);
}

function normalizeDebateRoundsInput() {
  if (debateRoundsInput) {
    debateRoundsInput.value = selectedDebateRounds();
  }
}

function normalizeDebateRounds(value) {
  if (typeof value === "string" && !/^\s*\d+\s*$/.test(value)) {
    return 1;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(5, Math.max(1, parsed));
}

function featureForMode(mode) {
  return {
    fast: "fastDebate",
    summary: "summaryDebate",
    chat: "chatMode",
    theater: "chatMode",
  }[mode] || "";
}

function featureForSummaryStrategy(summaryStrategy) {
  return {
    observerChair: "observerChair",
    anonymousReview: "anonymousReview",
    allAnonymous: "allAnonymous",
  }[summaryStrategy] || "";
}

function renderProviderStatuses(state) {
  const transcript = state.transcript;
  const answers = transcript?.answers || {};
  const critiques = currentCritiqueMap(state);
  if (Array.isArray(state.preflightResults)) {
    latestReadiness = indexReadinessResults(state.preflightResults);
  }
  const readinessProviders = Object.keys(latestReadiness).filter((providerId) =>
    selectedProviderSet.has(providerId) || providerId === state.sourceProvider || providerId === state.summaryProvider,
  );
  const activeSet = new Set([
    ...(state.busy ? (state.activeProviders || selectedProviderIds()) : selectedProviderIds()),
    state.sourceProvider,
    ...readinessProviders,
  ].filter(Boolean));

  for (const provider of Object.keys(providerStateEls)) {
    const row = providerStateEls[provider].closest(".provider-row");
    const readiness = latestReadiness[provider];
    row?.classList.toggle("is-off", !activeSet.has(provider));
    row?.classList.toggle("has-error", Boolean(activeSet.has(provider) && readiness && !readiness.ready));

    if (!activeSet.has(provider)) {
      providerStateEls[provider].textContent = "未啟用";
      providerStateEls[provider].className = "provider-state state-inactive";
      continue;
    }

    const label = providerLabelForPhase(provider, state, answers, critiques);
    const idleLabel = !state.busy && readiness
      ? readiness.ready ? "可送出" : readinessFailureLabel(readiness)
      : !state.busy ? "待檢查" : label;
    providerStateEls[provider].textContent = idleLabel;

    if (!state.busy && readiness?.ready) {
      providerStateEls[provider].className = "provider-state state-done";
    } else if (!state.busy && readiness && !readiness.ready) {
      providerStateEls[provider].className = "provider-state state-error";
    } else if (label === "總結失敗") {
      providerStateEls[provider].className = "provider-state state-error";
    } else if (label === "回答中" || label === "互評中" || label === "總結中") {
      providerStateEls[provider].className = "provider-state state-active pulsing";
    } else if (label === "已回答" || label === "已互評" || label === "已總結") {
      providerStateEls[provider].className = "provider-state state-done";
    } else {
      providerStateEls[provider].className = "provider-state state-waiting";
    }
  }

  renderProviderSummary();
  renderProviderRecovery(state);
}

function renderProviderRecovery(state) {
  if (!providerRecovery) return;
  providerRecovery.replaceChildren();
  const needed = new Set([...selectedProviderIds(), state.sourceProvider,
    ...(state.skipSummary || state.summaryStrategy === "allAnonymous" ? [] : [state.summaryProvider])]);
  const failures = PROVIDERS.filter((provider) => needed.has(provider.id) && latestReadiness[provider.id]?.ready === false);
  providerRecovery.hidden = state.busy || failures.length === 0;
  if (providerRecovery.hidden) return;
  for (const provider of failures) {
    const item = document.createElement("div");
    item.className = "recovery-item";
    const heading = document.createElement("strong");
    heading.textContent = `${provider.label}：${readinessFailureLabel(latestReadiness[provider.id])}`;
    const guidance = document.createElement("p");
    guidance.textContent = readinessRecovery(latestReadiness[provider.id].code);
    const link = document.createElement("a");
    link.href = provider.startUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `開啟 ${provider.label}`;
    item.append(heading, guidance, link);
    providerRecovery.append(item);
  }
}

function readinessFailureLabel(result) {
  return {
    LOGIN_REQUIRED: "需要登入",
    GENERATING: "仍在回答",
    INPUT_NOT_FOUND: "找不到輸入區",
    SEND_UNAVAILABLE: "無法送出",
    WRONG_URL: "網址不符",
    TAB_NOT_FOUND: "找不到分頁",
    CONTENT_SCRIPT_UNAVAILABLE: "無法連線",
    TIMEOUT: "檢查逾時",
    PROVIDER_ERROR: "服務異常",
  }[result?.code] || result?.message || result?.status || "需要處理";
}

function renderProviderSummary() {
  if (!providerSummaryText) return;
  const selected = selectedProviderIds();
  if (selected.length === 0) {
    providerSummaryText.textContent = "尚未啟用模型";
    return;
  }
  const checked = selected.map((id) => latestReadiness[id]).filter(Boolean);
  const readyCount = checked.filter((result) => result.ready).length;
  const failureCount = checked.filter((result) => !result.ready).length;
  providerSummaryText.textContent = checked.length === 0
    ? `${selected.length} 家已啟用・等待檢查`
    : `${selected.length} 家已啟用・${readyCount} 家就緒${failureCount ? `・${failureCount} 家需要處理` : ""}`;
}

function renderDiagnostics(state) {
  if (!diagnosticsOutput) {
    return;
  }

  const diagnostics = state.providerDiagnostics || {};
  const activeProviders = [
    ...(state.activeProviders || selectedProviderIds()),
    state.sourceProvider,
    state.summaryProvider,
  ].filter((providerId, index, list) => providerId && list.indexOf(providerId) === index);
  const blocks = activeProviders.map((providerId) => {
    const details = diagnostics[providerId] || {};
    return [
      `${providerLabel(providerId)}: ${details.stage || "idle"}`,
      details.phase ? `回合: ${details.phase}` : "",
      Number.isInteger(details.tabId) ? `分頁: ${details.tabId}` : "",
      details.url ? `網址: ${details.url}` : "",
      details.error ? `錯誤: ${details.error}` : "",
    ].filter(Boolean).join("\n");
  });

  diagnosticsOutput.textContent = blocks.join("\n\n") || "尚未開始";
}

function updateProgressBar(state) {
  if (!progressBar) return;
  let percent = 0;
  if (state.status === "running") {
    if (state.phase === "source-summary") percent = 15;
    else if (state.phase === "first-round") percent = state.skipSummary ? 50 : 30;
    else if (isCritiquePhase(state.phase)) {
      const totalRounds = normalizeRoundNumber(state.debateRounds || state.transcript?.debateRounds || 1);
      const currentRound = normalizeRoundNumber(state.currentCritiqueRound || state.transcript?.currentCritiqueRound || 1);
      const base = state.skipSummary ? 50 : 30;
      const roundAlloc = state.skipSummary ? 50 : 45;
      percent = base + Math.round((Math.min(currentRound, totalRounds) / totalRounds) * roundAlloc);
    }
    else if (state.phase === "summary") percent = 85;
  } else if (state.status === "done") {
    percent = 100;
  } else if (state.status === "error") {
    percent = 100;
  }
  
  progressBar.style.transform = `scaleX(${percent / 100})`;
  const currentStage = progressStageForState(state);
  progressNodes.forEach((node, index) => {
    node.classList.toggle("is-complete", index < currentStage);
    node.classList.toggle("is-current", index === currentStage);
  });
  progressContainer?.setAttribute("aria-valuenow", String(percent));
  progressContainer?.setAttribute("aria-valuetext", `${progressStageLabel(currentStage)}：${state.message || state.status || "等待開始"}`);
  
  if (state.status === "error") {
    progressBar.classList.add("error");
  } else {
    progressBar.classList.remove("error");
  }
}

function progressStageForState(state) {
  if (state.status === "done" || state.status === "error" || state.phase === "summary" || state.phase === "reveal") {
    return 3;
  }
  if (isCritiquePhase(state.phase)) {
    return 2;
  }
  if (state.phase === "first-round") {
    return 1;
  }
  return 0;
}

function progressStageLabel(stage) {
  return ["連線", "整合", "協調", "完成"][stage] || "連線";
}

function renderChatBubbles(state) {
  if (!chatTranscript) return;
  
  const transcript = state.transcript;
  if (!transcript || !transcript.originalQuestion) {
    if (state.phase === "source-summary") {
      const sourceProvider = state.sourceProvider || state.summaryProvider || "chatgpt";
      replaceChatTranscriptHTML(`
        <div class="round-divider">整理目前對話</div>
          <div class="bubble-group summary ${safeProviderClass(sourceProvider)} loading">
          <div class="bubble-meta">${escapeHTML(providerLabel(sourceProvider))} 正在總結</div>
          <div class="bubble-content"><span class="loading-dots">整理上下文中<span>.</span><span>.</span><span>.</span></span></div>
         </div>
      `);
      return;
    }

    replaceChatTranscriptHTML(`<div class="empty-state">會議開始後，各家回覆會出現在這裡。比較觀點，也記得查證重要事實。</div>`);
    return;
  }

  let html = "";

  // 1. 使用者提問
  html += `
    <div class="bubble-group user">
      <div class="bubble-meta">${state.mode === "summary" ? "目前對話總結" : "使用者提問 🙋"}</div>
      <div class="bubble-content">${escapeHTML(transcript.originalQuestion)}</div>
    </div>
  `;

  // 2. 第一輪回答
  const answers = transcript.answers || {};
  const activeSet = new Set(state.activeProviders || fallbackProviderIds);
  
  // 檢查是否有任何啟用的 provider 開始有回答或在回答中
  const hasFirstRound = Array.from(activeSet).some(p => answers[p] || state.phase === "first-round");
  if (hasFirstRound) {
    html += `<div class="round-divider">第一輪：各抒己見 📢</div>`;
    for (const providerId of activeSet) {
      const content = answers[providerId];
      if (!content && state.phase === "first-round") {
        html += `
            <div class="bubble-group assistant ${safeProviderClass(providerId)} loading">
            <div class="bubble-meta">${escapeHTML(meetingSpeakerLabel(state, providerId))}</div>
            <div class="bubble-content"><span class="loading-dots">思考生成中<span>.</span><span>.</span><span>.</span></span></div>
          </div>
        `;
      } else if (content) {
        html += `
          <div class="bubble-group assistant ${safeProviderClass(providerId)}">
            <div class="bubble-meta">${escapeHTML(meetingSpeakerLabel(state, providerId))}</div>
            <div class="bubble-content">${formatContent(content)}</div>
          </div>
        `;
      }
    }
  }

  // 3. 多輪互評與使用者發言
  const critiqueRounds = critiqueRoundMaps(transcript);
  const activeCritiqueRound = isCritiquePhase(state.phase)
    ? normalizeRoundNumber(state.currentCritiqueRound || transcript.currentCritiqueRound || 1)
    : 0;
  critiqueRounds.forEach((critiques, index) => {
    const roundNumber = index + 1;
    const hasRoundContent = Array.from(activeSet).some((providerId) => critiques[providerId]);
    const isActiveRound = activeCritiqueRound === roundNumber;
    if (!hasRoundContent && !isActiveRound) {
      return;
    }

    const userMessage = critiques.USER;
    if (userMessage) {
      html += `
        <div class="bubble-group user">
          <div class="bubble-meta">使用者插話 🙋</div>
          <div class="bubble-content">${formatContent(userMessage)}</div>
        </div>
      `;
    }

    html += `<div class="round-divider">${zhRoundLabel(roundNumber + 1)}：交叉評析 ${critiqueRounds.length > 1 ? `${roundNumber}/${critiqueRounds.length}` : ""} ⚡</div>`;
    for (const providerId of activeSet) {
      const content = critiques[providerId];
      if (!content && isActiveRound) {
        if (answers[providerId] && !answers[providerId].startsWith("[錯誤：")) {
          html += `
            <div class="bubble-group assistant ${safeProviderClass(providerId)} loading">
              <div class="bubble-meta">${escapeHTML(meetingSpeakerLabel(state, providerId))} ${userMessage ? '回應中' : '評析中'}</div>
              <div class="bubble-content"><span class="loading-dots">${userMessage ? '思考生成中' : '撰寫互評中'}<span>.</span><span>.</span><span>.</span></span></div>
            </div>
          `;
        }
      } else if (content) {
        html += `
            <div class="bubble-group assistant ${safeProviderClass(providerId)} critique">
            <div class="bubble-meta">${escapeHTML(meetingSpeakerLabel(state, providerId))} ${userMessage ? '回應' : '評析'}</div>
            <div class="bubble-content">${formatContent(content)}</div>
          </div>
        `;
      }
    }
  });

  // 4. 揭曉或總結
  if (state.reveal) {
    html += `
      <div class="round-divider">揭曉輪 🕵️</div>
      <div class="bubble-group summary reveal">
        <div class="bubble-meta">遊戲揭曉</div>
        <div class="bubble-content">${formatContent(state.reveal.content || state.summary)}</div>
      </div>
    `;
    const revealReactions = state.reveal.reactions || {};
    const revealProviders = state.activeProviders || Object.keys(revealReactions);
    revealProviders.forEach((providerId, index) => {
      const reaction = revealReactions[providerId];
      if (!reaction) return;
      const anonymousLabel = state.transcript?.anonymousNames?.[providerId];
      const label = state.reveal.anonymous
        ? escapeHTML(anonymousLabel || "匿名參與者（暱稱未取得）")
        : escapeHTML(providerLabel(providerId));
      html += `
        <div class="bubble-group assistant ${safeProviderClass(providerId)} reveal-reaction">
          <div class="bubble-meta">${label} 的揭曉反應</div>
           <div class="bubble-content">${formatContent(reaction)}</div>
        </div>
      `;
    });
  } else if (!state.reveal && state.summaryStrategy === "allAnonymous" && (state.phase === "summary" || state.summary || Object.keys(state.summaries || {}).length)) {
    html += '<div class="round-divider">全員匿名裁決 👑</div>';
    const judges = [...new Set([...(state.activeProviders || []), state.summaryProvider])].filter(Boolean);
    for (const judge of judges) {
      const content = state.summaries?.[judge];
      html += `
        <div class="bubble-group summary${!content && state.busy ? " loading" : ""}">
          <div class="bubble-meta">${escapeHTML(meetingSpeakerLabel(state, judge))} 的總結</div>
          <div class="bubble-content">${content ? formatContent(content) : state.busy ? "彙整精華中…" : "總結未完成"}</div>
        </div>`;
    }
  } else if (state.phase === "summary" && !state.summary) {
    const sumProvider = state.summaryProvider || "chatgpt";
    html += `
      <div class="round-divider">最終總結 👑</div>
        <div class="bubble-group summary ${safeProviderClass(sumProvider)} loading">
        <div class="bubble-meta">${escapeHTML(meetingSpeakerLabel(state, sumProvider))} 總結裁決中</div>
        <div class="bubble-content"><span class="loading-dots">彙整精華中<span>.</span><span>.</span><span>.</span></span></div>
      </div>
    `;
  } else if (!state.reveal && state.summary) {
    const sumProvider = state.summaryProvider || "chatgpt";
    html += `
      <div class="round-divider">最終裁決 👑</div>
      <div class="bubble-group summary ${safeProviderClass(sumProvider)}">
        <div class="bubble-meta">${escapeHTML(meetingSpeakerLabel(state, sumProvider))} 總結裁決</div>
        <div class="bubble-content">${formatContent(state.summary)}</div>
      </div>
    `;
  }

  replaceChatTranscriptHTML(html);
}

function replaceChatTranscriptHTML(html) {
  if (!chatTranscript || html === lastRenderedChatHtml) {
    return;
  }
  chatTranscript.innerHTML = html;
  lastRenderedChatHtml = html;
  // 自動滑動到最新消息
  chatTranscript.scrollTop = chatTranscript.scrollHeight;
}

function providerLabel(id) {
  return PROVIDERS.find((provider) => provider.id === id)?.label
    || (id === "random" ? "隨機主席" : id);
}

function critiqueRoundMaps(transcript) {
  if (Array.isArray(transcript?.critiqueRounds) && transcript.critiqueRounds.length) {
    return transcript.critiqueRounds;
  }
  if (transcript?.critiques) {
    return [transcript.critiques];
  }
  return [];
}

function currentCritiqueMap(state) {
  const rounds = critiqueRoundMaps(state.transcript);
  if (!rounds.length) {
    return {};
  }

  const fallbackRound = state.phase === "done" || state.phase === "summary"
    ? rounds.length
    : 1;
  const roundNumber = normalizeRoundNumber(state.currentCritiqueRound || state.transcript?.currentCritiqueRound || fallbackRound);
  return rounds[Math.min(rounds.length, roundNumber) - 1] || {};
}

function zhRoundLabel(roundNumber) {
  return ["零", "第一輪", "第二輪", "第三輪", "第四輪", "第五輪", "第六輪"][roundNumber] || `第 ${roundNumber} 輪`;
}

function providerLabelForPhase(provider, state, answers, critiques) {
  if (state.summaryStrategy === "allAnonymous" && state.phase === "summary") {
    if (state.providerDiagnostics?.[provider]?.stage === "error") return "總結失敗";
    return state.summaries?.[provider] ? "已總結" : "總結中";
  }
  if (state.phase === "source-summary" && provider === state.sourceProvider) {
    return state.sourceSummary ? "已總結" : "總結中";
  }
  if (state.sourceSummary && provider === state.sourceProvider && !state.summary) {
    return "已總結";
  }
  if (state.phase === "summary" && provider === state.summaryProvider) {
    return "總結中";
  }
  if (state.summary && provider === state.summaryProvider) {
    return "已總結";
  }
  if (state.providerTabs?.[provider] && state.phase === "first-round" && !answers[provider]) {
    return "回答中";
  }
  if (answers[provider] && isCritiquePhase(state.phase) && !critiques[provider]) {
    return "互評中";
  }
  if (critiques[provider]) {
    return "已互評";
  }
  if (answers[provider]) {
    return "已回答";
  }
  return state.busy ? "等待中" : "待命";
}

function setActionButtonsDisabled(disabled) {
  basicDebateButton.disabled = disabled;
  checkReadinessButton.disabled = disabled;
  providerToggleEls.forEach((button) => {
    button.disabled = disabled;
  });
  advancedControlEls.forEach((control) => {
    control.disabled = disabled;
  });
}

function meetingSpeakerLabel(state, providerId) {
  if (["anonymousReview", "allAnonymous"].includes(state.summaryStrategy)) {
    return state.transcript?.anonymousNames?.[providerId] || "匿名參與者（暱稱未取得）";
  }
  return providerLabel(providerId);
}

function safeProviderClass(id) {
  return PROVIDERS.some((provider) => provider.id === id) ? id : "unknown-provider";
}

function renderEntitlementState() {
  if (planBadge) {
    planBadge.textContent = currentEntitlements.sheepMode ? "🐑" : "Free";
    planBadge.className = `plan-badge ${currentEntitlements.sheepMode ? "is-pro" : "is-free"}`;
    planBadge.setAttribute("aria-label", currentEntitlements.sheepMode ? "🐑彩蛋，已啟用" : "Free，所有功能已開放");
  }

  renderDebateModeState();
  renderSummaryStrategyState();
}

function renderDebateModeState() {
  if (!basicDebateButton) {
    return;
  }

  const mode = selectedDebateMode();
  if (launchGuideEl) launchGuideEl.textContent = launchGuide(mode);
  const featureId = featureForMode(mode);
  const locked = Boolean(featureId && !canUseFeature(currentEntitlements, featureId));
  basicDebateButton.textContent = debateModeButtonLabel(mode);
  basicDebateButton.classList.toggle("is-locked", locked);
  basicDebateButton.title = locked ? proRequiredMessage(featureId) : debateModeButtonTitle(mode);
  renderDebateModeOptionStates();

  if (theaterSettings) {
    theaterSettings.style.display = mode === "theater" ? "block" : "none";
  }

  if (debateRoundsSetting) {
    debateRoundsSetting.hidden = mode === "chat";
  }

  if (chatControls) {
    chatControls.style.display = shouldShowChatControls(mode, latestState) ? "block" : "none";
  }
  renderPlayIdeas();
}

function renderDebateModeOptionStates() {
  for (const optionEl of debateModeOptionEls) {
    const featureId = optionEl.dataset.proFeature;
    const locked = !canUseFeature(currentEntitlements, featureId);
    optionEl.classList.toggle("is-locked", locked);
    optionEl.title = locked ? proRequiredMessage(featureId) : featureLabel(featureId);
    
    optionEl.style.display = "";
  }
}

function renderSummaryStrategyState() {
  const currentStrategy = selectedSummaryStrategy();
  if (summaryProviderSelect) {
    summaryProviderSelect.closest(".setting-item").hidden = currentStrategy === "allAnonymous";
  }
  const featureId = featureForSummaryStrategy(currentStrategy);
  if (!latestState?.busy && featureId && !canUseFeature(currentEntitlements, featureId)) {
    const standardInput = document.querySelector('input.summary-strategy-select[value="standard"]');
    if (standardInput) standardInput.checked = true;
  }

  renderSummaryStrategyOptionStates();
}

function renderSummaryStrategyOptionStates() {
  for (const optionEl of summaryStrategyOptionEls) {
    const featureId = optionEl.dataset.proFeature;
    const locked = !canUseFeature(currentEntitlements, featureId);
    optionEl.classList.toggle("is-locked", locked);
    optionEl.title = locked ? proRequiredMessage(featureId) : featureLabel(featureId);

    optionEl.style.display = "";
  }
}

function debateModeButtonLabel(mode) {
  if (mode === "fast") {
    return "開始快速鬥技場 ⚡";
  }
  if (mode === "summary") {
    return "開始總結辯論 ✦";
  }
  if (mode === "chat") {
    return "開啟群聊 💬";
  }
  if (mode === "theater") {
    return "開始劇場大亂鬥 🎭";
  }
  return "開始快速鬥技場 ⚡";
}

function debateModeButtonTitle(mode) {
  const featureId = featureForMode(mode);
  if (featureId) {
    return featureLabel(featureId);
  }
  return "開始快速鬥技場";
}

function renderLockedFeatureMessage(featureId) {
  renderMessage(proRequiredMessage(featureId));
}

function startingMessage(mode) {
  if (mode === "summary") {
    return "啟動總結辯論中...";
  }
  if (mode === "fast") {
    return "啟動快速鬥技場中...";
  }
  if (mode === "chat") {
    return "啟動自由群聊中...";
  }
  if (mode === "theater") {
    return "啟動劇場大亂鬥中...";
  }
  return "啟動快速鬥技場中...";
}

function buildTranscriptText(state) {
  const transcript = state.transcript;
  if (!transcript) {
    return "尚未開始";
  }

  const lines = [
    `狀態: ${state.message || state.status}`,
    "",
    state.mode === "summary" ? "目前對話總結:" : "原問題:",
    transcript.originalQuestion || state.question || "",
    "",
    "第一輪回答:",
    ...PROVIDERS.map((provider) => speakerBlock(meetingSpeakerLabel(state, provider.id), transcript.answers?.[provider.id])),
  ];

  critiqueRoundMaps(transcript).forEach((critiques, index) => {
    lines.push(
      "",
      `${zhRoundLabel(index + 2)}互評:`,
      ...PROVIDERS.map((provider) => speakerBlock(meetingSpeakerLabel(state, provider.id), critiques?.[provider.id])),
    );
  });

  if (state.summary || state.reveal) {
    const heading = state.summaryStrategy === "allAnonymous" ? "全員匿名總結:" : `${meetingSpeakerLabel(state, state.summaryProvider)} 最終總結:`;
    lines.push("", state.reveal ? "遊戲揭曉:" : heading, state.reveal?.content || state.summary || "");
  }

  if (state.reveal?.reactions) {
    const revealProviders = state.activeProviders || Object.keys(state.reveal.reactions);
    revealProviders.forEach((providerId, index) => {
      const reaction = state.reveal.reactions[providerId];
      if (!reaction) return;
      const anonymousLabel = state.transcript?.anonymousNames?.[providerId];
      const label = state.reveal.anonymous ? (anonymousLabel || "匿名參與者（暱稱未取得）") : providerLabel(providerId);
      lines.push(`${label} 揭曉反應:`, reaction);
    });
  }
  if (state.errors?.length) {
    lines.push("", "錯誤:", ...state.errors.map((error) => `- ${error.provider || "system"} ${error.phase || ""}: ${error.error || error.message}`));
  }

  return lines.join("\n");
}

function speakerBlock(label, content) {
  return `${label}:\n${content || "[尚未取得]"}`;
}

function renderMessage(message) {
  statusText.textContent = message;
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatContent(str) {
  if (!str) return "";
  // 把換行換成 <br>
  return escapeHTML(str).replace(/\n/g, "<br>");
}
