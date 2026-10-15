import {
  canUseFeature,
  entitlementsForPlan,
  featureLabel,
} from "../shared/entitlements.js";
import { DEFAULT_ACTIVE_PROVIDER_IDS, PROVIDERS } from "../shared/providers.js";
import { isCritiquePhase, shouldShowChatControls } from "./modeRules.js";
import { hasMeetingContent, launchGuide, readinessRecovery } from "./experienceRules.js";
import { appendPlayIdea, canUsePlayIdeas, playIdeas } from "./playIdeas.js";
import { normalizeRoundNumber } from "../shared/text.js";
import { buildDebugReport } from "../shared/debugReport.js";
import { isRecoverableReply, pendingReplyRepairs, MAX_MANUAL_REPLY_CHARS } from "../shared/meetingRecovery.js";
import { uiText, translateUiMarkup } from "../shared/i18n.js";
import { initializeLocale } from "./localeControls.js";
import { createTranscriptReader } from "./transcriptReader.js";
import { attachStarterQuestions, attachRecommendation } from "./recommendation.js";
import { attachPlayScenes } from "./playScenes.js";
import { extraChallenges } from "./playChallenges.js";
import { createChallengeDeck } from "./challengeDeck.js";
import { createUiDialogs } from "./uiDialogs.js";
import { currentLocale, t } from "../shared/i18n.js";
import { localizedFeatureLabel } from "../shared/i18n-catalog.js";

const uiDialogs = createUiDialogs();

function localizedUnavailableMessage(featureId) {
  return t(currentLocale, "feature.proRequired", {feature: localizedFeatureLabel(featureId, currentLocale)});
}

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
const transcriptReader = createTranscriptReader({
  element: chatTranscript,
  latestButton: document.querySelector("#latestTranscriptButton"),
  announcement: document.querySelector("#transcriptAnnouncement"),
  documentObject: document,
  translate: uiText,
});
let localeRenderPending = false;
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
let hookScanPending = false;
document.querySelector("#downloadDebugButton")?.addEventListener("click", async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "aiDebate:getState" });
    if (!response?.ok) throw new Error(response?.error || "無法取得目前會議狀態");
    const state = response?.state || latestState || {};
    const report = buildDebugReport(state, chrome.runtime.getManifest().version);
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `llmeeting-debug-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    renderMessage(`偵錯紀錄下載失敗：${error.message}`);
  }
});
let currentEntitlements = entitlementsForPlan();
const fallbackProviderIds = PROVIDERS.map((provider) => provider.id);
let selectedProviderSet = new Set(DEFAULT_ACTIVE_PROVIDER_IDS);
let latestReadiness = {};
let providerSelectionWrite = Promise.resolve();
let lastRenderedChatHtml = null;
let challengeScope = null;
const challengeDecks = new Map();
let lastRenderedIdeaKey = null;
const shuffleChallengesButton = document.querySelector("#shuffleChallengesButton");
shuffleChallengesButton?.addEventListener("click", shufflePlayChallenges);
const challengeBatchLabel = document.querySelector("#challengeBatchLabel");
let recoveryActionPending = false;
let manualReplyTarget = null;
const manualReplyEditor = document.querySelector("#manualReplyEditor");
const manualReplyInput = document.querySelector("#manualReplyInput");
const saveManualReplyBtn = document.querySelector("#saveManualReplyBtn");
const manualReplyStatus = document.querySelector("#manualReplyStatus");
const starterQuestions = attachStarterQuestions({
  container: document.querySelector("#starterQuestions"), input: questionInput, translate: uiText,
  isBlocked: () => Boolean(latestState?.busy || latestState?.repairPause || recoveryActionPending),
});
const recommendation = attachRecommendation({
  button: document.querySelector("#copyRecommendationButton"),
  field: document.querySelector("#recommendationText"),
  status: document.querySelector("#recommendationStatus"),
  translate: uiText, clipboard: navigator.clipboard,
});
const playScenes = attachPlayScenes({
  container: document.querySelector("#playScenePanel"), input: questionInput, translate: uiText,
  isBlocked: () => Boolean(hasMeetingContent(latestState) || recoveryActionPending),
  onApply: () => {
    debateModeEls.forEach(input => { input.checked = input.value === "theater"; });
    interactionStyleSelect.value = "yesand";
    if (chatControls) chatControls.open = true;
    renderDebateModeState();
    starterQuestions.render();
    renderMessage("劇場開場已填入，模式切為劇場與共識接龍；可先改設定再啟動。");
  },
});

chatTranscript?.addEventListener("click", async (event) => {
  const button = event.target.closest?.("[data-depart-provider]");
  if (!button || button.disabled || latestState?.busy || recoveryActionPending) return;
  if (manualReplyTarget && !manualReplyEditor.hidden && manualReplyInput.value.trim()) {
    manualReplyStatus.textContent = uiText("請先完成或取消目前的補回覆，再讓 AI 離席；草稿仍保留。");
    return;
  }
  const provider = button.dataset.departProvider;
  const phase = button.dataset.departPhase;
  const expectedContent = manualReplyContent(latestState, provider, phase);
  if (!isRecoverableReply(expectedContent)) return;
  recoveryActionPending = true;
  button.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "aiDebate:departProvider", provider, phase, expectedContent,
      sessionId: latestState.transcript?.sessionId, originalQuestion: latestState.transcript?.originalQuestion });
    if (!response?.ok) throw new Error(response?.error || "無法讓 AI 離席");
    if (manualReplyTarget?.provider === provider) {
      manualReplyEditor.hidden = true;
      manualReplyTarget = null;
    }
    const current = response.autoResuming
      ? await chrome.runtime.sendMessage({type: "aiDebate:getState"}).catch(() => null) : null;
    renderState(current?.ok ? current.state : response.state);
  } catch (error) {
    renderMessage(error.message);
  } finally {
    recoveryActionPending = false;
    if (latestState) renderState(latestState);
  }
});

chatTranscript?.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-repair-provider]");
  if (!button || button.disabled || latestState?.busy || recoveryActionPending) return;
  const provider = button.dataset.repairProvider;
  const phase = button.dataset.repairPhase;
  const content = manualReplyContent(latestState, provider, phase);
  if (!isRecoverableReply(content)) return;
  // Keep an unfinished paste when choosing another message; never erase it silently.
  if (manualReplyTarget && !manualReplyEditor.hidden &&
      (manualReplyTarget.provider !== provider || manualReplyTarget.phase !== phase) && manualReplyInput.value.trim()) {
    manualReplyStatus.textContent = uiText("請先完成或取消目前這段補回覆，再選擇另一格。");
    return;
  }
  manualReplyTarget = { provider, phase, expectedContent: content,
    sessionId: latestState.transcript.sessionId, originalQuestion: latestState.transcript.originalQuestion };
  document.querySelector("#manualReplyTarget").textContent = uiText(`${meetingSpeakerLabel(latestState, provider)} · ${manualReplyPhaseLabel(phase)} · 手動補回覆`);
  manualReplyStatus.textContent = "";
  manualReplyEditor.hidden = false;
  saveManualReplyBtn.disabled = false;
  manualReplyInput.focus();
});

document.querySelector("#cancelManualReplyBtn")?.addEventListener("click", () => {
  if (recoveryActionPending) return;
  manualReplyEditor.hidden = true;
  manualReplyTarget = null;
  manualReplyInput.value = "";
});

saveManualReplyBtn?.addEventListener("click", async () => {
  if (!manualReplyTarget || latestState?.busy || recoveryActionPending) return;
  const content = manualReplyInput.value;
  if (!content.trim() || content.length > MAX_MANUAL_REPLY_CHARS) {
    manualReplyStatus.textContent = uiText("請貼上 1–12,000 字元的 AI 回覆；過長的內容請先精簡，內容不會自動截斷。");
    return;
  }
  recoveryActionPending = true;
  setActionButtonsDisabled(true);
  saveManualReplyBtn.disabled = true;
  manualReplyInput.disabled = true;
  manualReplyStatus.textContent = uiText("正在補入回覆…");
  try {
    const response = await chrome.runtime.sendMessage({ type: "aiDebate:repairReply", ...manualReplyTarget, content });
    if (!response?.ok) throw new Error(response?.error || "補入失敗，貼上的內容已保留。");
    manualReplyEditor.hidden = true;
    manualReplyTarget = null;
    manualReplyInput.value = "";
    if (response.autoResuming) {
      // The resumed run may already have published a newer state than this ack.
      const current = await chrome.runtime.sendMessage({ type: "aiDebate:getState" });
      renderState(current?.state || response.state);
    } else {
      renderState(response.state);
    }
  } catch (error) {
    manualReplyStatus.textContent = `${uiText(error.message)} ${uiText("貼上的內容已保留。")}`;
  } finally {
    recoveryActionPending = false;
    manualReplyInput.disabled = false;
    saveManualReplyBtn.disabled = Boolean(latestState?.busy);
    setActionButtonsDisabled(Boolean(latestState?.busy));
    if (latestState) renderChatBubbles(latestState);
  }
});

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
  await initializeLocale();
  playScenes.render();
  starterQuestions.render();
  recommendation.render();
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
  button.setAttribute("aria-label", uiText(`${PROVIDERS.find((item) => item.id === providerId)?.label || providerId}：${enabled ? "已啟用" : "未啟用"}`));
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
  readinessHint.textContent = uiText("正在逐一檢查 Provider 連線…");
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
  readinessHint.textContent = uiText(response?.ok
    ? "診斷完成；正式會議仍會建立全新對話"
    : Object.values(latestReadiness).some((result) => result.ready === false)
      ? "檢查未完成，請依下方指引處理；技術細節可在診斷資訊查看。"
      : "未取得檢查結果，請重新檢查；若仍失敗，確認擴充套件已載入。");
  checkReadinessButton.disabled = false;
}

function indexReadinessResults(results) {
  return Object.fromEntries((Array.isArray(results) ? results : []).filter((item) => item?.provider).map((item) => [item.provider, item]));
}

async function scanAndPopulateHookTabs() {
  if (hookScanPending || latestState?.busy || recoveryActionPending || basicDebateButton?.disabled) return;
  hookScanPending = true;
  setHookControlsDisabled(true);
  try {
    for (const provider of PROVIDERS) {
      const selectEl = hookSelects[provider.id];
      if (!selectEl) continue;
      const selectedValue = selectEl.value;
      const previousSelectedOption = Array.from(selectEl.options || []).find((option) => option.value === selectedValue);
      selectEl.innerHTML = translateUiMarkup('<option value="">[預設] 開新分頁</option>');

      try {
        const tabs = [];
        for (const pattern of provider.matchPatterns) {
          const queryTabs = await chrome.tabs.query({ url: pattern });
          tabs.push(...queryTabs);
        }

        const uniqueTabs = Array.from(new Map(tabs.map((tab) => [tab.id, tab])).values());
        uniqueTabs.sort((a, b) => b.windowId - a.windowId);
        for (const tab of uniqueTabs) {
          const option = document.createElement("option");
          option.value = tab.id.toString();
          const title = tab.title ? (tab.title.length > 30 ? tab.title.substring(0, 30) + "..." : tab.title) : "未命名分頁";
          option.textContent = uiText(`[分頁] ${title}`);
          selectEl.appendChild(option);
        }

        if (selectedValue && !uniqueTabs.some((tab) => tab.id.toString() === selectedValue)) {
          const staleOption = previousSelectedOption || document.createElement("option");
          staleOption.value = selectedValue;
          if (!staleOption.textContent) staleOption.textContent = selectedValue;
          staleOption.dataset.stale = "true";
          selectEl.appendChild(staleOption);
        }
        selectEl.value = selectedValue;
      } catch (error) {
        console.error("Failed to query tabs for", provider.id, error);
        if (selectedValue) {
          const staleOption = previousSelectedOption || document.createElement("option");
          staleOption.value = selectedValue;
          if (!staleOption.textContent) staleOption.textContent = selectedValue;
          staleOption.dataset.stale = "true";
          selectEl.appendChild(staleOption);
          selectEl.value = selectedValue;
        }
      }
    }
  } finally {
    hookScanPending = false;
    setHookControlsDisabled(Boolean(latestState?.busy || recoveryActionPending || basicDebateButton?.disabled));
  }
}

async function startSelectedDebate() {
  if (hookScanPending) return;
  if (latestState?.repairPause || hasPendingReplyRepairs(latestState)) {
    renderMessage("目前會議有待補回覆內容；請先補齊並繼續原流程，或重置會議後再開始新會議。");
    return;
  }
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
  if (hookScanPending) return;
  if (latestState?.repairPause || hasPendingReplyRepairs(latestState)) {
    renderMessage("目前會議有待補回覆內容；請先補齊並繼續原流程，或重置會議後再開始新會議。");
    return;
  }
  const question = questionInput.value;
  const activeProviders = selectedProviderIds();
  const hookedTabs = selectedHookedTabs();
  const hasSelectedActiveTab = activeProviders.some((providerId) => Number.isInteger(hookedTabs[providerId]));
  if (mode !== "summary" && !question.trim() && !hasSelectedActiveTab) {
    renderMessage("請先輸入問題");
    questionInput.focus();
    return;
  }

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

  const chatControls = document.getElementById("chatControls");
  const interactiveMode = mode === "chat" || Boolean(chatControls && chatControls.style.display !== "none" && chatControls.open);

  setActionButtonsDisabled(true);
  renderMessage(startingMessage(mode));

  const response = await sendControlRequest({
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
  });

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
  const hookedTabs = {};
  for (const providerId of Object.keys(hookSelects)) {
    const tabId = Number.parseInt(hookSelects[providerId]?.value || "", 10);
    if (Number.isInteger(tabId)) hookedTabs[providerId] = tabId;
  }
  return hookedTabs;
}

resetButton.addEventListener("click", resetCurrentMeeting);
let resetActionPending = false;
let clearActionPending = false;

async function resetCurrentMeeting() {
  if (resetActionPending || clearActionPending || resetButton.disabled) return;
  resetActionPending = true;
  try {
    const sessionId = latestState?.transcript?.sessionId;
    if (hasMeetingContent(latestState) && !await uiDialogs.confirm(uiText("重置會結束目前會議並清除這場紀錄，無法復原。模型選擇會保留。確定重置？"))) return;
    if (latestState?.transcript?.sessionId !== sessionId) return;
    resetButton.disabled = true;
    const response = await chrome.runtime.sendMessage({ type: "aiDebate:reset" });
    if (response?.ok) {
      clearRecoveryDrafts();
      renderState(response.state);
    }
    else renderMessage(response?.error || "重置未完成，請稍後再試。");
  } catch (_error) {
    renderMessage("無法連線到擴充套件；重置結果尚未確認，請先確認目前會議狀態。");
  } finally {
    resetActionPending = false;
    resetButton.disabled = false;
  }
}

clearLocalDataButton?.addEventListener("click", async () => {
  if (resetActionPending || clearActionPending || clearLocalDataButton.disabled) return;
  clearActionPending = true;
  try {
    const sessionId = latestState?.transcript?.sessionId;
    const confirmed = await uiDialogs.confirm(uiText("確定要清除本機保存的辯論內容與等待紀錄嗎？"));
    if (!confirmed || latestState?.transcript?.sessionId !== sessionId) return;
    clearLocalDataButton.disabled = true;
    const response = await chrome.runtime.sendMessage({ type: "aiDebate:clearLocalData" }).catch(() => null);
    if (response?.ok) clearRecoveryDrafts();
    renderState(response?.state);
    renderMessage(response?.ok ? "本機辯論紀錄已清除" : (response?.error || "清除失敗"));
  } finally {
    clearActionPending = false;
    clearLocalDataButton.disabled = false;
  }
});

function clearRecoveryDrafts() {
  manualReplyEditor.hidden = true;
  manualReplyInput.value = "";
  manualReplyTarget = null;
}

let chatActionPending = false;

async function sendControlRequest(message) {
  try {
    const response = await chrome.runtime.sendMessage(message);
    if (response?.accepted) {
      const current = await chrome.runtime.sendMessage({ type: "aiDebate:getState" }).catch(() => null);
      return { ...response, state: current?.state || response.state };
    }
    return response;
  } catch (error) {
    // A closed receipt channel is ambiguous. Reconcile state, never repeat the action.
    const current = await chrome.runtime.sendMessage({ type: "aiDebate:getState" }).catch(() => null);
    const state = current?.state;
    const sameMeeting = message.type === "aiDebate:nextRound" ||
      (state?.mode === message.mode && state?.question === String(message.question || "").trim());
    if (sameMeeting && (state?.busy || state?.repairPause)) {
      return { ok: true, accepted: true, transportRecovered: true, state };
    }
    return { ok: false, error: state?.message || error.message || "無法取得操作結果", ...(state ? { state } : {}) };
  }
}

async function sendChatAction(action, text = "") {
  if (chatActionPending || latestState?.busy || recoveryActionPending) return;
  if (latestState?.repairPause) {
    if (action !== "resume") return;
    if (hasPendingReplyRepairs(latestState)) {
      renderMessage("請先補齊所有故障回覆，再繼續原流程。");
      return;
    }
  }
  if (action === "user_message" && !text.trim()) return;
  chatActionPending = true;
  chatControls.style.display = "none";
  try {
    const response = await sendControlRequest({
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
chatCritiqueBtn?.addEventListener("click", () => sendChatAction(latestState?.repairPause ? "resume" : "critique"));
chatSummarizeBtn?.addEventListener("click", () => sendChatAction("summarize"));

function challengeSessionScope() {
  return latestState?.transcript?.sessionId || latestState?.sessionId || "preview";
}

function currentChallengeDeck(mode, style) {
  const base = playIdeas(mode, style);
  if (!base.length) return null;
  const scope = challengeSessionScope();
  if (scope !== challengeScope) {
    challengeScope = scope;
    challengeDecks.clear();
  }
  const key = `${mode}:${style || "critique"}`;
  let deck = challengeDecks.get(key);
  if (!deck) {
    const category = style === "imposter" ? "imposter" : mode === "theater" ? "theater" : "discussion";
    deck = createChallengeDeck([...base, ...extraChallenges(category)]);
    deck.draw();
    challengeDecks.set(key, deck);
  }
  return deck;
}

function shufflePlayChallenges() {
  if (recoveryActionPending || !canUsePlayIdeas(latestState, chatActionPending)) return;
  const deck = currentChallengeDeck(latestState.mode, latestState.interactionStyle);
  if (!deck) return;
  deck.draw();
  lastRenderedIdeaKey = null;
  renderPlayIdeas();
  // A short, user-triggered stagger; reading and reduced-motion users stay still.
  if (!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    Array.from(playIdeaButtons.children).forEach((button, index) => button.animate?.(
      [{transform: "translateY(5px)", opacity: .75}, {transform: "translateY(0)", opacity: 1}],
      {duration: 220, delay: index * 28, easing: "cubic-bezier(.16,1,.3,1)"},
    ));
  }
}

function renderPlayIdeas() {
  if (!playIdeaButtons) return;
  const available = !recoveryActionPending && canUsePlayIdeas(latestState, chatActionPending);
  const liveMeeting = latestState?.busy || latestState?.phase === "waiting_for_user";
  const mode = liveMeeting ? latestState.mode : selectedDebateMode();
  const style = liveMeeting ? latestState.interactionStyle : interactionStyleSelect?.value;
  const deck = currentChallengeDeck(mode, style);
  const ideas = deck?.current() || [];
  const renderedScope = challengeSessionScope();
  const key = JSON.stringify([renderedScope, mode, style, available, ideas.map(idea => [idea.id, uiText(idea.label)])]);
  if (key !== lastRenderedIdeaKey) {
    playIdeaButtons.replaceChildren();
    for (const idea of ideas) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-action play-idea";
      button.textContent = uiText(idea.label);
      button.disabled = !available;
      button.addEventListener("click", () => {
        if (recoveryActionPending || !canUsePlayIdeas(latestState, chatActionPending)
          || challengeSessionScope() !== renderedScope) return;
        chatInput.value = appendPlayIdea(chatInput.value, uiText(idea.text));
        button.classList?.add("is-selected");
        chatInput.focus();
        chatInput.dispatchEvent(new Event("input", { bubbles: true }));
        if (playCue) playCue.textContent = uiText("挑戰已加入草稿，可以修改再送出！");
      });
      playIdeaButtons.append(button);
    }
    lastRenderedIdeaKey = key;
  }
  if (shuffleChallengesButton) shuffleChallengesButton.disabled = !available;
  if (challengeBatchLabel) challengeBatchLabel.textContent = deck
    ? uiText(`第 ${deck.batchNumber()} 組・每組 3 個轉折`) : "";
  if (chatRoundBadge) chatRoundBadge.textContent = uiText(latestState?.repairPause ? "待補回" : available ? "輪到你" : latestState?.busy ? "AI 回應中" : "等開場");
  if (playCue) playCue.textContent = uiText(available
    ? "輪到你改變局勢。加個轉折、再互評，或結案收下這場討論。"
    : latestState?.repairPause ? "流程已暫停；補入回覆或讓故障 AI 離席後，會自動接續原流程。"
    : latestState?.busy ? "AI 正在回應，轉折靈感稍後可用。"
      : "先開始互動會議；等 AI 回答後，就輪到你加入討論。");
}

const stopDebateBtn = document.getElementById("stopDebateBtn");

stopDebateBtn?.addEventListener("click", async () => {
  stopDebateBtn.disabled = true;
  stopDebateBtn.textContent = uiText("停止中...");
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:stop" }).catch(() => null);
  if (response?.state) {
    renderState(response.state);
  } else {
    stopDebateBtn.disabled = false;
    stopDebateBtn.textContent = uiText("停止本次會議 🛑");
    renderMessage("停止失敗，請重試");
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "aiDebate:stateChanged") {
    renderState(message.state);
  }
});

document.addEventListener("llmeeting:locale-changed", () => {
  if (latestState) {
    localeRenderPending = true;
    const previousScroll = chatTranscript?.scrollTop;
    lastRenderedChatHtml = null;
    renderChatBubbles(latestState);
    if (chatTranscript && Number.isFinite(previousScroll)) chatTranscript.scrollTop = previousScroll;
    renderReplyRecoveryNotice(latestState);
    renderDiagnostics(latestState);
    localeRenderPending = false;
  }
  renderPlayIdeas();
  starterQuestions.render();
  recommendation.render();
  playScenes.render();
});

async function loadState() {
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:getState" });
  renderState(response?.state);
}

async function loadDevUnlock() {
  try {
    const { attachDevUnlock } = await import("./dev-unlock.js");
    attachDevUnlock({ planBadge, renderMessage, loadState, dialogs: uiDialogs });
  } catch (error) {
    renderMessage(uiText("作者模式載入失敗: ") + error.message);
  }
}

function renderState(state) {
  if (!state) {
    return;
  }

  const wasWaiting = latestState?.phase === "waiting_for_user";
  latestState = state;
  playScenes.render();
  starterQuestions.render();
  currentEntitlements = entitlementsForPlan(state.entitlements?.plan, state.entitlements?.sheepMode ?? state.entitlements?.isPro);

  if (stopDebateBtn) {
    stopDebateBtn.hidden = !state.busy;
    if (state.busy) {
      stopDebateBtn.disabled = false;
      stopDebateBtn.textContent = uiText("停止本次會議 🛑");
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
  statusText.textContent = uiText(state.message || state.status || "等待開始");

  renderProviderStatuses(state);

  // 更新進度條
  updateProgressBar(state);

  // 渲染氣泡式對話框
  renderChatBubbles(state);
  renderReplyRecoveryNotice(state);

  // 控制 Chat 介面
  if (chatControls) {
    const isWaiting = state.phase === "waiting_for_user";
    const isRepairPaused = Boolean(state.repairPause);
    const repairsPending = hasPendingReplyRepairs(state);
    chatInput.disabled = !isWaiting || isRepairPaused;
    if (chatCritiqueBtn) {
      chatCritiqueBtn.textContent = uiText(isRepairPaused ? "繼續原流程" : "再互評");
      chatCritiqueBtn.disabled = !isWaiting || (isRepairPaused && repairsPending) || recoveryActionPending;
    }
    if (chatSendBtn) chatSendBtn.disabled = !isWaiting || isRepairPaused || recoveryActionPending;
    if (chatSummarizeBtn) chatSummarizeBtn.disabled = !isWaiting || isRepairPaused || recoveryActionPending;

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

    if ([...(state.departedProviders || []), ...(state.transcript?.departedProviders || [])].includes(provider)) {
      providerStateEls[provider].textContent = uiText("本場已離席");
      providerStateEls[provider].className = "provider-state state-inactive";
      row?.classList.remove("has-error");
      continue;
    }

    if (!activeSet.has(provider)) {
      providerStateEls[provider].textContent = uiText("未啟用");
      providerStateEls[provider].className = "provider-state state-inactive";
      continue;
    }

    const label = providerLabelForPhase(provider, state, answers, critiques);
    const idleLabel = !state.busy && readiness
      ? readiness.ready ? "可送出" : readinessFailureLabel(readiness)
      : !state.busy ? "待檢查" : label;
    providerStateEls[provider].textContent = uiText(idleLabel);

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
    heading.textContent = uiText(`${provider.label}：${readinessFailureLabel(latestReadiness[provider.id])}`);
    const guidance = document.createElement("p");
    guidance.textContent = uiText(readinessRecovery(latestReadiness[provider.id].code));
    const link = document.createElement("a");
    link.href = provider.startUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = uiText(`開啟 ${provider.label}`);
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
    providerSummaryText.textContent = uiText("尚未啟用模型");
    return;
  }
  const checked = selected.map((id) => latestReadiness[id]).filter(Boolean);
  const readyCount = checked.filter((result) => result.ready).length;
  const failureCount = checked.filter((result) => !result.ready).length;
  providerSummaryText.textContent = uiText(checked.length === 0
    ? `${selected.length} 家已啟用・等待檢查`
    : `${selected.length} 家已啟用・${readyCount} 家就緒${failureCount ? `・${failureCount} 家需要處理` : ""}`);
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
      details.phase ? uiText(`回合: ${details.phase}`) : "",
      Number.isInteger(details.tabId) ? uiText(`分頁: ${details.tabId}`) : "",
      details.url ? uiText(`網址: ${details.url}`) : "",
      details.error ? uiText(`錯誤: ${details.error}`) : "",
    ].filter(Boolean).join("\n");
  });

  diagnosticsOutput.textContent = blocks.join("\n\n") || uiText("尚未開始");
}

function updateProgressBar(state) {
  if (!progressBar) return;
  let percent = 0;
  if (state.phase === "waiting_for_user") {
    const pausedPhase = state.repairPause?.pausedPhase || state.phase;
    percent = pausedPhase === "summary" || pausedPhase === "reveal" ? 85
      : pausedPhase === "source-summary" ? 15
      : isCritiquePhase(pausedPhase) || Number(state.currentCritiqueRound || state.transcript?.currentCritiqueRound || 0) > 0 ? 75 : 30;
  } else if (state.status === "running") {
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
    percent = [0, 30, 75, 85][progressStageForState(state)];
  }
  
  progressBar.style.transform = `scaleX(${percent / 100})`;
  const currentStage = progressStageForState(state);
  progressNodes.forEach((node, index) => {
    node.classList.toggle("is-complete", index < currentStage);
    node.classList.toggle("is-current", index === currentStage);
  });
  progressContainer?.setAttribute("aria-valuenow", String(percent));
  progressContainer?.setAttribute("aria-valuetext", `${uiText(progressStageLabel(currentStage))}：${uiText(state.message || state.status || "等待開始")}`);
  
  if (state.status === "error") {
    progressBar.classList.add("error");
  } else {
    progressBar.classList.remove("error");
  }
}

function progressStageForState(state) {
  const phase = state.repairPause?.pausedPhase || state.phase;
  if (state.status === "done" || phase === "summary" || phase === "reveal") {
    return 3;
  }
  if (phase === "waiting_for_user") {
    return Number(state.currentCritiqueRound || state.transcript?.currentCritiqueRound || 0) > 0 ? 2 : 1;
  }
  if (isCritiquePhase(phase)) {
    return 2;
  }
  if (phase === "first-round") {
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
  if (!transcript || (!transcript.originalQuestion && !transcript.roundZero)) {
    if (state.phase === "source-summary") {
      const sourceProvider = state.sourceProvider || state.summaryProvider || "chatgpt";
      replaceChatTranscriptHTML(`
        <div class="round-divider">整理目前對話</div>
          <div class="bubble-group summary ${safeProviderClass(sourceProvider)} loading">
          <div class="bubble-meta">${escapeHTML(uiText(`${providerLabel(sourceProvider)} 正在總結`))}</div>
          <div class="bubble-content"><span class="loading-dots">${uiText("整理上下文中")}<span>.</span><span>.</span><span>.</span></span></div>
         </div>
      `);
      return;
    }

    replaceChatTranscriptHTML(`<div class="empty-state">會議開始後，各家回覆會出現在這裡。比較觀點，也記得查證重要事實。</div>`);
    return;
  }

  let html = "";

  if (transcript.roundZero) {
    html += renderRoundZeroBubbles(transcript.roundZero);
  } else {
    html += `
      <div class="bubble-group user">
        <div class="bubble-meta">${escapeHTML(uiText(state.mode === "summary" ? "目前對話總結" : "使用者提問 🙋"))}</div>
        <div class="bubble-content">${escapeHTML(transcript.originalQuestion)}</div>
      </div>
    `;
  }

  // 2. 第一輪回答
  if (state.sourceProvider && isRecoverableReply(state.sourceSummary)) {
    html += `<div class="bubble-group assistant ${safeProviderClass(state.sourceProvider)}">
      <div class="bubble-meta">${escapeHTML(uiText(`${meetingSpeakerLabel(state, state.sourceProvider)} · 來源總結`))}</div>
      <div class="bubble-content">${formatReplyContent(state.sourceSummary)}</div>
      ${replyRecoveryControls(state, state.sourceProvider, "source-summary", state.sourceSummary)}
    </div>`;
  }
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
            <div class="bubble-content"><span class="loading-dots">${uiText("思考生成中")}<span>.</span><span>.</span><span>.</span></span></div>
          </div>
        `;
      } else if (content) {
        html += `
          <div class="bubble-group assistant ${safeProviderClass(providerId)}">
            <div class="bubble-meta">${escapeHTML(meetingSpeakerLabel(state, providerId))}</div>
            <div class="bubble-content">${formatReplyContent(content)}</div>
            ${replyRecoveryControls(state, providerId, "first-round", content)}
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
          <div class="bubble-meta">${escapeHTML(uiText("使用者插話 🙋"))}</div>
          <div class="bubble-content">${formatContent(userMessage)}</div>
        </div>
      `;
    }

    html += `<div class="round-divider">${uiText(`${zhRoundLabel(roundNumber + 1)}：交叉評析 ${critiqueRounds.length > 1 ? `${roundNumber}/${critiqueRounds.length}` : ""} ⚡`)}</div>`;
    for (const providerId of activeSet) {
      const content = critiques[providerId];
      if (!content && isActiveRound) {
        if (answers[providerId] && !answers[providerId].startsWith("[錯誤：")) {
          html += `
            <div class="bubble-group assistant ${safeProviderClass(providerId)} loading">
              <div class="bubble-meta">${escapeHTML(uiText(`${meetingSpeakerLabel(state, providerId)} ${userMessage ? "回應中" : "評析中"}`))}</div>
              <div class="bubble-content"><span class="loading-dots">${uiText(userMessage ? "思考生成中" : "撰寫互評中")}<span>.</span><span>.</span><span>.</span></span></div>
            </div>
          `;
        }
      } else if (content) {
        html += `
            <div class="bubble-group assistant ${safeProviderClass(providerId)} critique">
            <div class="bubble-meta">${escapeHTML(uiText(`${meetingSpeakerLabel(state, providerId)} ${userMessage ? "回應" : "評析"}`))}</div>
            <div class="bubble-content">${formatReplyContent(content)}</div>
            ${replyRecoveryControls(state, providerId, roundNumber === 1 ? "critique" : `critique-${roundNumber}`, content)}
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
        <div class="bubble-meta">${escapeHTML(uiText("遊戲揭曉"))}</div>
        <div class="bubble-content">${formatReplyContent(state.reveal.content || state.summary)}</div>
      </div>
    `;
    const revealReactions = state.reveal.reactions || {};
    const revealProviders = state.activeProviders || Object.keys(revealReactions);
    revealProviders.forEach((providerId) => {
      const reaction = revealReactions[providerId];
      if (!reaction) return;
      const anonymousLabel = state.transcript?.anonymousNames?.[providerId];
      const label = state.reveal.anonymous
        ? anonymousLabel || "匿名參與者（暱稱未取得）"
        : providerLabel(providerId);
      html += `
        <div class="bubble-group assistant ${safeProviderClass(providerId)} reveal-reaction">
          <div class="bubble-meta">${escapeHTML(uiText(`${label} 的揭曉反應`))}</div>
           <div class="bubble-content">${formatReplyContent(reaction)}</div>
          ${replyRecoveryControls(state, providerId, "reveal", reaction)}
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
          <div class="bubble-meta">${escapeHTML(uiText(`${meetingSpeakerLabel(state, judge)} 的總結`))}</div>
          <div class="bubble-content">${content ? formatReplyContent(content) : uiText(state.busy ? "彙整精華中…" : "總結未完成")}</div>
          ${replyRecoveryControls(state, judge, "summary", content)}
        </div>`;
    }
  } else if (state.phase === "summary" && !state.summary && !state.summaries?.[state.summaryProvider]) {
    const sumProvider = state.summaryProvider || "chatgpt";
    html += `
      <div class="round-divider">最終總結 👑</div>
        <div class="bubble-group summary ${safeProviderClass(sumProvider)} loading">
        <div class="bubble-meta">${escapeHTML(uiText(`${meetingSpeakerLabel(state, sumProvider)} 總結裁決中`))}</div>
        <div class="bubble-content"><span class="loading-dots">${uiText("彙整精華中")}<span>.</span><span>.</span><span>.</span></span></div>
      </div>
    `;
  } else if (!state.reveal && (state.summary || state.summaries?.[state.summaryProvider])) {
    const sumProvider = state.summaryProvider || "chatgpt";
    html += `
      <div class="round-divider">最終裁決 👑</div>
      <div class="bubble-group summary ${safeProviderClass(sumProvider)}">
        <div class="bubble-meta">${escapeHTML(uiText(`${meetingSpeakerLabel(state, sumProvider)} 總結裁決`))}</div>
        <div class="bubble-content">${formatReplyContent(state.summary || state.summaries?.[sumProvider] || "")}</div>
        ${replyRecoveryControls(state, sumProvider, "summary", state.summary || state.summaries?.[sumProvider])}
      </div>
    `;
  }

  replaceChatTranscriptHTML(html);
}

function renderRoundZeroBubbles(roundZero) {
  let html = `<div class="round-divider">${escapeHTML(uiText("第 0 輪：分頁對話與你的補充"))}</div>`;
  for (const source of Array.isArray(roundZero?.sources) ? roundZero.sources : []) {
    if (typeof source?.content !== "string") continue;
    const provider = source.provider || "unknown";
    html += `<div class="bubble-group assistant ${safeProviderClass(provider)}">
      <div class="bubble-meta">${escapeHTML(providerLabel(provider))}</div>
      <div class="bubble-content">${formatContent(source.content)}</div>
    </div>`;
  }
  if (typeof roundZero?.userText === "string" && roundZero.userText) {
    html += `<div class="bubble-group user">
      <div class="bubble-meta">${escapeHTML(uiText("使用者提問 🙋"))}</div>
      <div class="bubble-content">${escapeHTML(roundZero.userText)}</div>
    </div>`;
  }
  return html;
}

function replaceChatTranscriptHTML(html) {
  if (!chatTranscript || html === lastRenderedChatHtml) {
    return;
  }
  transcriptReader.render(translateUiMarkup(html), {announce: !localeRenderPending});
  lastRenderedChatHtml = html;
}

function replyRecoveryControls(state, provider, phase, content) {
  if (isRecoverableReply(content) && [...(state.departedProviders || []), ...(state.transcript?.departedProviders || [])].includes(provider)) {
    return '<p class="reply-recovery-note">已離席；本場不再參與後續討論，先前發言仍保留。</p>';
  }
  const repaired = state.transcript?.manualRepairs?.findLast((entry) => entry.provider === provider && entry.phase === phase);
  if (repaired) return `<p class="reply-recovery-note">已手動補入 AI 回覆</p>${repaired.originalError
    ? `<details class="reply-recovery"><summary>查看原故障</summary><p>${escapeHTML(repaired.originalError)}</p></details>` : ""}`;
  if (!isRecoverableReply(content)) return "";
  const hint = /未確認送出/.test(content)
    ? "送出尚未確認；AI 可能已回答，請先查看 AI 分頁，避免重複送出。"
    : (phase === "summary" ? "這位裁判的總結未取得；若 AI 分頁已完成，可手動補入。"
      : phase === "reveal" ? "這位 AI 的揭曉反應未取得；若 AI 分頁已回答，可手動補入。"
        : "未取得這段 AI 回覆；若 AI 分頁已回答，可手動補入。");
  return `<div class="reply-recovery"><p>${hint}</p><button type="button" class="secondary-action" data-repair-provider="${escapeHTML(provider)}" data-repair-phase="${escapeHTML(phase)}" ${state.busy || recoveryActionPending ? "disabled" : ""}>貼上 AI 回覆</button><button type="button" class="secondary-action" data-depart-provider="${escapeHTML(provider)}" data-depart-phase="${escapeHTML(phase)}" ${state.busy || recoveryActionPending ? "disabled" : ""}>讓 AI 離席</button><p>離席後，本場不再請它發言；先前內容保留。</p>${state.busy ? "<p>目前流程結束後即可處理。</p>" : ""}</div>`;
}

function renderReplyRecoveryNotice(state) {
  const notice = document.querySelector("#replyRecoveryNotice");
  if (!notice) return;
  const failed = pendingReplyRepairs(state);
  const pauseMessage = state.repairPause
    ? (failed.length ? `流程已暫停，尚有 ${failed.length} 段回覆待處理。補入回覆或讓故障 AI 離席後，會自動接續。` : "故障已處理，正在自動接續原流程…")
    : failed.length
      ? `有 ${failed.length} 段 AI 回覆未取得。先確認原分頁，再用「貼上 AI 回覆」補入，或讓無法繼續的 AI 離席。`
      : "";
  const text = uiText(pauseMessage);
  notice.hidden = !text;
  if (notice.textContent !== text) notice.textContent = text;
  if (manualReplyTarget && !manualReplyEditor.hidden && manualReplyTarget.sessionId !== state.transcript?.sessionId) {
    saveManualReplyBtn.disabled = true;
    manualReplyStatus.textContent = uiText("會議已變更；貼上的內容仍保留，請取消後重新選擇故障訊息。");
  }
}

function hasPendingReplyRepairs(state) {
  return pendingReplyRepairs(state).length > 0;
}

function manualReplyContent(state, provider, phase) {
  if (phase === "source-summary") return provider === state?.sourceProvider ? state?.sourceSummary || "" : "";
  if (phase === "first-round") return state?.transcript?.answers?.[provider] || "";
  if (isCritiquePhase(phase)) {
    return state?.transcript?.critiqueRounds?.[Number(phase.split("-")[1] || 1) - 1]?.[provider] || "";
  }
  if (phase === "summary") {
    return state?.summaries?.[provider] || (provider === state?.summaryProvider ? state?.summary : "") || "";
  }
  if (phase === "reveal") {
    return state?.transcript?.reveal?.reactions?.[provider] || state?.reveal?.reactions?.[provider] || "";
  }
  return "";
}

function manualReplyPhaseLabel(phase) {
  if (phase === "source-summary") return "來源總結";
  if (phase === "first-round") return "第一輪回答";
  if (phase === "summary") return "總結";
  if (phase === "reveal") return "揭曉反應";
  return `第 ${phase.split("-")[1] || 1} 輪互評`;
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
  return uiText(["零", "第一輪", "第二輪", "第三輪", "第四輪", "第五輪", "第六輪"][roundNumber] || `第 ${roundNumber} 輪`);
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
  disabled = disabled || recoveryActionPending;
  const repairBlocked = Boolean(latestState?.repairPause) || hasPendingReplyRepairs(latestState);
  basicDebateButton.disabled = disabled || repairBlocked;
  for (const button of [chatSendBtn, chatCritiqueBtn, chatSummarizeBtn]) {
    const canResume = button === chatCritiqueBtn && latestState?.repairPause && !hasPendingReplyRepairs(latestState);
    if (button) button.disabled = disabled || latestState?.phase !== "waiting_for_user" || (repairBlocked && !canResume);
  }
  checkReadinessButton.disabled = disabled;
  providerToggleEls.forEach((button) => {
    button.disabled = disabled;
  });
  advancedControlEls.forEach((control) => {
    control.disabled = disabled;
  });
}

function setHookControlsDisabled(disabled) {
  for (const select of Object.values(hookSelects)) {
    if (select) select.disabled = disabled;
  }
  if (refreshHooksBtn) refreshHooksBtn.disabled = disabled;
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
    planBadge.textContent = currentEntitlements.sheepMode ? "🐑" : uiText("Free");
    planBadge.className = `plan-badge ${currentEntitlements.sheepMode ? "is-pro" : "is-free"}`;
    planBadge.setAttribute("aria-label", uiText(currentEntitlements.sheepMode ? "🐑彩蛋，已啟用" : "Free，所有功能已開放"));
  }

  renderDebateModeState();
  renderSummaryStrategyState();
}

function renderDebateModeState() {
  if (!basicDebateButton) {
    return;
  }

  const mode = selectedDebateMode();
  if (launchGuideEl) launchGuideEl.textContent = uiText(launchGuide(mode));
  const featureId = featureForMode(mode);
  const locked = Boolean(featureId && !canUseFeature(currentEntitlements, featureId));
  basicDebateButton.textContent = uiText(debateModeButtonLabel(mode));
  basicDebateButton.classList.toggle("is-locked", locked);
  basicDebateButton.title = locked ? localizedUnavailableMessage(featureId) : uiText(debateModeButtonTitle(mode));
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
    optionEl.title = locked ? localizedUnavailableMessage(featureId) : uiText(featureLabel(featureId));
    
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
    optionEl.title = locked ? localizedUnavailableMessage(featureId) : uiText(featureLabel(featureId));

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
  renderMessage(localizedUnavailableMessage(featureId));
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

  const opening = transcript.roundZero ? [
    uiText("第 0 輪：分頁對話與你的補充"),
    ...transcript.roundZero.sources.map((source) => speakerBlock(providerLabel(source.provider), source.content)),
    uiText("使用者提問 🙋"),
    transcript.roundZero.userText,
  ] : [state.mode === "summary" ? "目前對話總結:" : "原問題:", transcript.originalQuestion || state.question || ""];
  const lines = [
    `狀態: ${state.message || state.status}`,
    "",
    ...opening,
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
  statusText.textContent = uiText(message);
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatReplyContent(str) {
  if (!isRecoverableReply(str)) return formatContent(str);
  // Generated fault cards get localized UI wrappers; raw fault details and
  // normal AI/user text remain untouched in state and recovery disclosures.
  const notice = "以下是該 AI 網頁顯示的原文，不是這位 AI 對題目的正式回答：";
  const separator = `\n${notice}\n`;
  const boundary = str.indexOf(separator);
  if (boundary !== -1) {
    return `${formatReplyContent(str.slice(0, boundary))}<br>${formatContent(uiText(notice))}<br>${formatContent(str.slice(boundary + separator.length))}`;
  }
  const error = /^\[錯誤[：:]([\s\S]*)$/.exec(str);
  return formatContent(error ? `${uiText("[錯誤：")}${error[1]}` : uiText(str));
}

function formatContent(str) {
  if (!str) return "";
  // 把換行換成 <br>
  return escapeHTML(str).replace(/\n/g, "<br>");
}
