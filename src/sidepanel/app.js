import {
  canUseFeature,
  entitlementsForPlan,
  featureLabel,
  proRequiredMessage,
} from "../shared/entitlements.js";
import { PROVIDERS } from "../shared/providers.js";

const form = document.querySelector("#debateForm");
const questionInput = document.querySelector("#questionInput");
const basicDebateButton = document.querySelector("#basicDebateButton");
const resetButton = document.querySelector("#resetButton");
const statusText = document.querySelector("#statusText");
const planBadge = document.querySelector("#planBadge");
const transcriptOutput = document.querySelector("#transcriptOutput");
const diagnosticsOutput = document.querySelector("#diagnosticsOutput");
const chatTranscript = document.querySelector("#chatTranscript");
const progressBar = document.querySelector("#progressBar");

const summaryProviderSelect = document.querySelector("#summaryProviderSelect");
const debateRoundsInput = document.querySelector("#debateRoundsInput");
const interactionStyleSelect = document.querySelector("#interactionStyleSelect");
const providerSelectEls = Array.from(document.querySelectorAll(".provider-select"));
const debateModeEls = Array.from(document.querySelectorAll(".debate-mode-select"));
const debateModeOptionEls = Array.from(document.querySelectorAll(".mode-option[data-pro-feature]"));
const skipSummaryCheckbox = document.querySelector("#skipSummaryCheckbox");

const chatControls = document.querySelector("#chatControls");
const chatInput = document.querySelector("#chatInput");
const chatSendBtn = document.querySelector("#chatSendBtn");
const chatCritiqueBtn = document.querySelector("#chatCritiqueBtn");
const chatSummarizeBtn = document.querySelector("#chatSummarizeBtn");
const theaterSettings = document.querySelector("#theaterSettings");
const refreshHooksBtn = document.querySelector("#refreshHooksBtn");

const hookSelects = {
  chatgpt: document.querySelector("#hookChatgpt"),
  claude: document.querySelector("#hookClaude"),
  grok: document.querySelector("#hookGrok"),
  gemini: document.querySelector("#hookGemini"),
};

const providerStateEls = {
  chatgpt: document.querySelector("#chatgptState"),
  gemini: document.querySelector("#geminiState"),
  grok: document.querySelector("#grokState"),
  claude: document.querySelector("#claudeState"),
};

let latestState = null;
let currentEntitlements = entitlementsForPlan();
const fallbackProviderIds = ["chatgpt", "gemini", "grok", "claude"];

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await startSelectedDebate();
});

providerSelectEls.forEach((el) => {
  el.addEventListener("change", renderProviderSelectionPreview);
});

debateModeEls.forEach((el) => {
  el.addEventListener("change", renderDebateModeState);
});

debateRoundsInput?.addEventListener("change", normalizeDebateRoundsInput);
debateRoundsInput?.addEventListener("blur", normalizeDebateRoundsInput);

refreshHooksBtn?.addEventListener("click", scanAndPopulateHookTabs);

loadDevUnlock();
renderDebateModeState();
scanAndPopulateHookTabs();

async function scanAndPopulateHookTabs() {
  for (const provider of PROVIDERS) {
    const selectEl = hookSelects[provider.id];
    if (!selectEl) continue;

    // 保留第一個選項
    selectEl.innerHTML = '<option value="">[自動] 尋找或開新分頁</option>';

    try {
      // 在 background 腳本中我們是用 tabs.query { url: provider.urlPattern } 或 matchPatterns
      // 這裡簡單把 matchPatterns 轉成查詢條件
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

  await startDebate(mode);
}

async function startDebate(mode) {
  const question = questionInput.value.trim();
  if ((mode === "basic" || mode === "fast") && !question) {
    renderMessage("請先輸入問題");
    return;
  }

  const activeProviders = selectedProviderIds();

  if (activeProviders.length < 2) {
    renderMessage("❌ 至少需要選擇 2 家 AI 才能進行辯論喔！");
    return;
  }

  const summaryProvider = document.querySelector("#summaryProviderSelect").value;
  const skipSummary = document.querySelector("#skipSummaryCheckbox").checked;
  const debateRounds = parseInt(debateRoundsInput?.value, 10) || 1;
  const interactionStyle = interactionStyleSelect?.value || "critique";

  const customPersonas = {};
  if (mode === "theater") {
    customPersonas.chatgpt = document.querySelector("#personaChatgpt")?.value || "";
    customPersonas.claude = document.querySelector("#personaClaude")?.value || "";
    customPersonas.grok = document.querySelector("#personaGrok")?.value || "";
    customPersonas.gemini = document.querySelector("#personaGemini")?.value || "";
  }

  const tabHookingSettings = document.getElementById("tabHookingSettings");
  const hookedTabs = {};
  if (tabHookingSettings && tabHookingSettings.open) {
    for (const providerId of Object.keys(hookSelects)) {
      const selectEl = hookSelects[providerId];
      if (selectEl && selectEl.value) {
        hookedTabs[providerId] = parseInt(selectEl.value, 10);
      }
    }
  }

  const chatControls = document.getElementById("chatControls");
  const interactiveMode = chatControls && chatControls.style.display !== "none" ? chatControls.open : false;

  setActionButtonsDisabled(true);
  renderMessage(startingMessage(mode));
  
  const response = await chrome.runtime.sendMessage({
    type: "aiDebate:start",
    question,
    mode,
    activeProviders,
    summaryProvider,
    skipSummary,
    debateRounds,
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
  }
  renderState(response?.state);
}

resetButton.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:reset" });
  renderState(response?.state);
});

chatSendBtn?.addEventListener("click", async () => {
  const text = chatInput.value.trim();
  if (!text) return;
  chatControls.style.display = "none";
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:nextRound", action: "user_message", text });
  if (response?.state) {
    chatInput.value = "";
    renderState(response.state);
  } else {
    chatControls.style.display = "block";
  }
});

chatCritiqueBtn?.addEventListener("click", async () => {
  chatControls.style.display = "none";
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:nextRound", action: "critique" });
  if (response?.state) renderState(response.state);
});

chatSummarizeBtn?.addEventListener("click", async () => {
  chatControls.style.display = "none";
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:nextRound", action: "summarize" });
  if (response?.state) renderState(response.state);
});

const stopDebateBtn = document.getElementById("stopDebateBtn");

stopDebateBtn?.addEventListener("click", async () => {
  stopDebateBtn.disabled = true;
  stopDebateBtn.textContent = "暫停中...";
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:stop" });
  if (response?.state) renderState(response.state);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "aiDebate:stateChanged") {
    renderState(message.state);
  }
});

loadState();

async function loadState() {
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:getState" });
  renderState(response?.state);
}

async function loadDevUnlock() {
  try {
    const { attachDevUnlock } = await import("./dev-unlock.js");
    attachDevUnlock({ planBadge, renderMessage, loadState });
  } catch (_error) {
    // Custom builds may omit this author convenience helper.
    renderMessage("作者模式載入失敗: " + _error.message);
  }
}

function renderState(state) {
  if (!state) {
    return;
  }

  latestState = state;
  currentEntitlements = state.entitlements || entitlementsForPlan();

  if (stopDebateBtn) {
    if (state.busy) {
      stopDebateBtn.style.display = "block";
      stopDebateBtn.disabled = false;
      stopDebateBtn.textContent = "緊急暫停 🛑";
    } else {
      stopDebateBtn.style.display = "none";
    }
  }

  setActionButtonsDisabled(Boolean(state.busy));
  renderEntitlementState();
  statusText.textContent = state.message || state.status || "等待開始";

  if (!state.busy) {
    if (state.activeProviders) {
      providerSelectEls.forEach((el) => {
        el.checked = state.activeProviders.includes(el.value) || state.sourceProvider === el.value;
      });
    }
    if (state.summaryProvider && summaryProviderSelect.querySelector(`option[value="${state.summaryProvider}"]`)) {
      summaryProviderSelect.value = state.summaryProvider;
    }
    if (debateRoundsInput) {
      debateRoundsInput.value = normalizeDebateRounds(state.debateRounds || state.transcript?.debateRounds || 1);
    }
    if (skipSummaryCheckbox && state.skipSummary !== undefined) {
      skipSummaryCheckbox.checked = state.skipSummary;
    }
  }

  const transcript = state.transcript;
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
      chatInput.focus();
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
  return providerSelectEls
    .filter((el) => el.checked)
    .map((el) => el.value);
}

function selectedDebateMode() {
  return debateModeEls.find((el) => el.checked)?.value || "basic";
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

function renderProviderStatuses(state) {
  const transcript = state.transcript;
  const answers = transcript?.answers || {};
  const critiques = currentCritiqueMap(state);
  const activeSet = new Set([
    ...(state.activeProviders || fallbackProviderIds),
    state.sourceProvider,
  ].filter(Boolean));

  for (const provider of Object.keys(providerStateEls)) {
    if (!activeSet.has(provider)) {
      providerStateEls[provider].textContent = "未啟用";
      providerStateEls[provider].className = "state-inactive";
      continue;
    }

    const label = providerLabelForPhase(provider, state, answers, critiques);
    providerStateEls[provider].textContent = label;

    if (label === "回答中" || label === "互評中" || label === "總結中") {
      providerStateEls[provider].className = "state-active pulsing";
    } else if (label === "已回答" || label === "已互評" || label === "已總結") {
      providerStateEls[provider].className = "state-done";
    } else {
      providerStateEls[provider].className = "state-waiting";
    }
  }
}

function renderDiagnostics(state) {
  if (!diagnosticsOutput) {
    return;
  }

  const diagnostics = state.providerDiagnostics || {};
  const activeProviders = [
    ...(state.activeProviders || fallbackProviderIds),
    state.sourceProvider,
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
    else if (state.phase === "critique") {
      const totalRounds = normalizeDebateRounds(state.debateRounds || state.transcript?.debateRounds || 1);
      const currentRound = normalizeDebateRounds(state.currentCritiqueRound || state.transcript?.currentCritiqueRound || 1);
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
  
  progressBar.style.width = `${percent}%`;
  
  if (state.status === "error") {
    progressBar.classList.add("error");
  } else {
    progressBar.classList.remove("error");
  }
}

function renderChatBubbles(state) {
  if (!chatTranscript) return;
  
  const transcript = state.transcript;
  if (!transcript || !transcript.originalQuestion) {
    if (state.phase === "source-summary") {
      const sourceProvider = state.sourceProvider || state.summaryProvider || "chatgpt";
      chatTranscript.innerHTML = `
        <div class="round-divider">整理目前對話</div>
        <div class="bubble-group summary ${sourceProvider} loading">
          <div class="bubble-meta">${providerLabel(sourceProvider)} 正在總結</div>
          <div class="bubble-content"><span class="loading-dots">整理上下文中<span>.</span><span>.</span><span>.</span></span></div>
        </div>
      `;
      return;
    }

    chatTranscript.innerHTML = `<div class="empty-state">輸入問題跑基礎辯論。</div>`;
    return;
  }

  let html = "";

  // 1. 使用者提問
  html += `
    <div class="bubble-group user">
      <div class="bubble-meta">${state.mode === "summary" ? "目前對話總結" : "主人提問 🙋‍♂️"}</div>
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
          <div class="bubble-group assistant ${providerId} loading">
            <div class="bubble-meta">${providerLabel(providerId)}</div>
            <div class="bubble-content"><span class="loading-dots">思考生成中<span>.</span><span>.</span><span>.</span></span></div>
          </div>
        `;
      } else if (content) {
        html += `
          <div class="bubble-group assistant ${providerId}">
            <div class="bubble-meta">${providerLabel(providerId)}</div>
            <div class="bubble-content">${formatContent(content)}</div>
          </div>
        `;
      }
    }
  }

  // 3. 多輪互評與主人發言
  const critiqueRounds = critiqueRoundMaps(transcript);
  const activeCritiqueRound = state.phase === "critique"
    ? normalizeDebateRounds(state.currentCritiqueRound || transcript.currentCritiqueRound || 1)
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
          <div class="bubble-meta">主人插話 🙋‍♂️</div>
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
            <div class="bubble-group assistant ${providerId} loading">
              <div class="bubble-meta">${providerLabel(providerId)} ${userMessage ? '回應中' : '評析中'}</div>
              <div class="bubble-content"><span class="loading-dots">${userMessage ? '思考生成中' : '撰寫互評中'}<span>.</span><span>.</span><span>.</span></span></div>
            </div>
          `;
        }
      } else if (content) {
        html += `
          <div class="bubble-group assistant ${providerId} critique">
            <div class="bubble-meta">${providerLabel(providerId)} ${userMessage ? '回應' : '評析'}</div>
            <div class="bubble-content">${formatContent(content)}</div>
          </div>
        `;
      }
    }
  });

  // 4. 總結
  if (state.phase === "summary" && !state.summary) {
    const sumProvider = state.summaryProvider || "chatgpt";
    html += `
      <div class="round-divider">最終總結 👑</div>
      <div class="bubble-group summary ${sumProvider} loading">
        <div class="bubble-meta">${providerLabel(sumProvider)} 總結裁決中</div>
        <div class="bubble-content"><span class="loading-dots">彙整精華中<span>.</span><span>.</span><span>.</span></span></div>
      </div>
    `;
  } else if (state.summary) {
    const sumProvider = state.summaryProvider || "chatgpt";
    html += `
      <div class="round-divider">最終裁決 👑</div>
      <div class="bubble-group summary ${sumProvider}">
        <div class="bubble-meta">${providerLabel(sumProvider)} 總結裁決</div>
        <div class="bubble-content">${formatContent(state.summary)}</div>
      </div>
    `;
  }

  chatTranscript.innerHTML = html;
  // 自動滑動到最新消息
  chatTranscript.scrollTop = chatTranscript.scrollHeight;
}

function providerLabel(id) {
  const labels = {
    chatgpt: "ChatGPT",
    gemini: "Gemini",
    grok: "Grok",
    claude: "Claude",
  };
  return labels[id] || id;
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
  const roundNumber = normalizeDebateRounds(state.currentCritiqueRound || state.transcript?.currentCritiqueRound || fallbackRound);
  return rounds[Math.min(rounds.length, roundNumber) - 1] || {};
}

function zhRoundLabel(roundNumber) {
  return ["零", "第一輪", "第二輪", "第三輪", "第四輪", "第五輪", "第六輪"][roundNumber] || `第 ${roundNumber} 輪`;
}

function providerLabelForPhase(provider, state, answers, critiques) {
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
  if (answers[provider] && state.phase === "critique" && !critiques[provider]) {
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
}

function renderEntitlementState() {
  if (planBadge) {
    planBadge.textContent = currentEntitlements.isPro ? "Pro" : "Free";
    planBadge.className = `plan-badge ${currentEntitlements.isPro ? "is-pro" : "is-free"}`;
  }

  renderDebateModeState();
}

function renderDebateModeState() {
  if (!basicDebateButton) {
    return;
  }

  const mode = selectedDebateMode();
  const featureId = featureForMode(mode);
  const locked = Boolean(featureId && !canUseFeature(currentEntitlements, featureId));
  basicDebateButton.textContent = debateModeButtonLabel(mode);
  basicDebateButton.classList.toggle("is-locked", locked);
  basicDebateButton.title = locked ? proRequiredMessage(featureId) : debateModeButtonTitle(mode);
  renderDebateModeOptionStates();

  if (theaterSettings) {
    theaterSettings.style.display = mode === "theater" ? "block" : "none";
  }

  if (chatControls) {
    chatControls.style.display = (mode === "basic" || mode === "fast") ? "none" : "block";
  }
}

function renderDebateModeOptionStates() {
  for (const optionEl of debateModeOptionEls) {
    const featureId = optionEl.dataset.proFeature;
    const locked = !canUseFeature(currentEntitlements, featureId);
    optionEl.classList.toggle("is-locked", locked);
    optionEl.title = locked ? proRequiredMessage(featureId) : featureLabel(featureId);
  }
}

function debateModeButtonLabel(mode) {
  if (mode === "fast") {
    return "快速鬥技場 ⚡";
  }
  if (mode === "summary") {
    return "總結辯論 ✦";
  }
  if (mode === "chat") {
    return "開啟群聊 💬";
  }
  if (mode === "theater") {
    return "劇場大亂鬥 🎭";
  }
  return "基礎辯論";
}

function debateModeButtonTitle(mode) {
  const featureId = featureForMode(mode);
  if (featureId) {
    return featureLabel(featureId);
  }
  return "開始基礎辯論";
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
  return "啟動基礎辯論中...";
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
    speakerBlock("ChatGPT", transcript.answers?.chatgpt),
    speakerBlock("Gemini", transcript.answers?.gemini),
    speakerBlock("Grok", transcript.answers?.grok),
    speakerBlock("Claude", transcript.answers?.claude),
  ];

  critiqueRoundMaps(transcript).forEach((critiques, index) => {
    lines.push(
      "",
      `${zhRoundLabel(index + 2)}互評:`,
      speakerBlock("ChatGPT", critiques?.chatgpt),
      speakerBlock("Gemini", critiques?.gemini),
      speakerBlock("Grok", critiques?.grok),
      speakerBlock("Claude", critiques?.claude),
    );
  });

  if (state.summary) {
    lines.push("", `${providerLabel(state.summaryProvider)} 最終總結:`, state.summary);
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
