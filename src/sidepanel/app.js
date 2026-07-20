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
const clearLocalDataButton = document.querySelector("#clearLocalDataButton");
const statusText = document.querySelector("#statusText");
const planBadge = document.querySelector("#planBadge");
const proPillEls = Array.from(document.querySelectorAll(".pro-pill"));
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
const basicDebateModeOption = document.querySelector("#basicModeOption");
const summaryStrategyEls = Array.from(document.querySelectorAll(".summary-strategy-select"));
const summaryStrategyOptionEls = Array.from(document.querySelectorAll(".summary-strategy-option[data-pro-feature]"));
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

summaryStrategyEls.forEach((el) => {
  el.addEventListener("change", renderSummaryStrategyState);
});

debateRoundsInput?.addEventListener("change", normalizeDebateRoundsInput);
debateRoundsInput?.addEventListener("blur", normalizeDebateRoundsInput);

refreshHooksBtn?.addEventListener("click", scanAndPopulateHookTabs);

loadDevUnlock();
renderDebateModeState();
renderSummaryStrategyState();
scanAndPopulateHookTabs();

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
  const debateRounds = selectedDebateRounds();
  const interactionStyle = interactionStyleSelect?.value || "critique";

  const customPersonas = {};
  if (mode === "theater") {
    customPersonas.chatgpt = document.querySelector("#personaChatgpt")?.value || "";
    customPersonas.claude = document.querySelector("#personaClaude")?.value || "";
    customPersonas.grok = document.querySelector("#personaGrok")?.value || "";
    customPersonas.gemini = document.querySelector("#personaGemini")?.value || "";
    customPersonas.meta = document.querySelector("#personaMeta")?.value || "";
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
    summaryStrategy: selectedSummaryStrategy(),
    skipSummary,
    debateRounds,
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
  renderState(response?.state);
}

resetButton.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:reset" });
  renderState(response?.state);
});

clearLocalDataButton?.addEventListener("click", async () => {
  const confirmed = globalThis.confirm("確定要清除本機保存的辯論內容與等待紀錄嗎？");
  if (!confirmed) {
    return;
  }
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:clearLocalData" }).catch(() => null);
  renderState(response?.state);
  renderMessage(response?.ok ? "本機辯論紀錄已清除" : (response?.error || "清除失敗"));
});

chatSendBtn?.addEventListener("click", async () => {
  const text = chatInput.value.trim();
  if (!text) return;
  chatControls.style.display = "none";
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:nextRound", action: "user_message", text }).catch(() => null);
  if (response?.state) {
    chatInput.value = "";
    renderState(response.state);
  } else {
    chatControls.style.display = "block";
    renderMessage(response?.error || "傳送失敗，請重試");
  }
});

chatCritiqueBtn?.addEventListener("click", async () => {
  chatControls.style.display = "none";
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:nextRound", action: "critique" }).catch(() => null);
  if (response?.state) {
    renderState(response.state);
  } else {
    chatControls.style.display = "block";
    renderMessage("請求失敗，請重試");
  }
});

chatSummarizeBtn?.addEventListener("click", async () => {
  chatControls.style.display = "none";
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:nextRound", action: "summarize" }).catch(() => null);
  if (response?.state) {
    renderState(response.state);
  } else {
    chatControls.style.display = "block";
    renderMessage("請求失敗，請重試");
  }
});

const stopDebateBtn = document.getElementById("stopDebateBtn");

stopDebateBtn?.addEventListener("click", async () => {
  stopDebateBtn.disabled = true;
  stopDebateBtn.textContent = "暫停中...";
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:stop" }).catch(() => null);
  if (response?.state) {
    renderState(response.state);
  } else {
    stopDebateBtn.disabled = false;
    stopDebateBtn.textContent = "緊急暫停 🛑";
    renderMessage("停止失敗，請重試");
  }
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
  } catch (error) {
    renderMessage("作者模式載入失敗: " + error.message);
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
    if (state.summaryStrategy) {
      const summaryStrategyInput = document.querySelector(`input.summary-strategy-select[value="${state.summaryStrategy}"]`);
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
      const modeInput = document.querySelector(`input.debate-mode-select[value="${state.mode}"]`);
      if (modeInput) modeInput.checked = true;
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
  }[summaryStrategy] || "";
}

function renderProviderStatuses(state) {
  const transcript = state.transcript;
  const answers = transcript?.answers || {};
  const critiques = currentCritiqueMap(state);
  const activeSet = new Set([
    ...(state.activeProviders || fallbackProviderIds),
    state.sourceProvider,
    state.summaryProvider,
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

  // 3. 多輪互評與使用者發言
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
        ? escapeHTML(anonymousLabel || `參與者 ${index + 1}`)
        : escapeHTML(providerLabel(providerId));
      html += `
        <div class="bubble-group assistant ${providerId} reveal-reaction">
          <div class="bubble-meta">${label} 的揭曉反應</div>
          <div class="bubble-content">${formatContent(reaction)}</div>
        </div>
      `;
    });
  } else if (state.phase === "summary" && !state.summary) {
    const sumProvider = state.summaryProvider || "chatgpt";
    html += `
      <div class="round-divider">最終總結 👑</div>
      <div class="bubble-group summary ${sumProvider} loading">
        <div class="bubble-meta">${providerLabel(sumProvider)} 總結裁決中</div>
        <div class="bubble-content"><span class="loading-dots">彙整精華中<span>.</span><span>.</span><span>.</span></span></div>
      </div>
    `;
  } else if (!state.reveal && state.summary) {
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
    planBadge.textContent = currentEntitlements.isPro ? "🐑" : "Free";
    planBadge.className = `plan-badge ${currentEntitlements.isPro ? "is-pro" : "is-free"}`;
    planBadge.setAttribute("aria-label", currentEntitlements.isPro ? "🐑模式，已解鎖" : "方案徽章：Free");
    proPillEls.forEach((pill) => {
      pill.textContent = currentEntitlements.isPro ? "🐑" : "PRO";
    });
  }

  renderDebateModeState();
  renderSummaryStrategyState();
}

function renderDebateModeState() {
  if (!basicDebateButton) {
    return;
  }

  let currentMode = selectedDebateMode();
  let featureId = featureForMode(currentMode);

  if (!latestState || latestState.phase !== "waiting_for_user") {
    if (currentEntitlements.isPro && !featureId) {
      const fastInput = document.querySelector('input.debate-mode-select[value="fast"]');
      if (fastInput) fastInput.checked = true;
    } else if (!currentEntitlements.isPro && featureId) {
      const basicInput = document.querySelector('input.debate-mode-select[value="basic"]');
      if (basicInput) basicInput.checked = true;
    }
  }

  const mode = selectedDebateMode();
  featureId = featureForMode(mode);
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
  if (basicDebateModeOption) {
    const keepVisibleForWaitingSession =
      currentEntitlements.isPro &&
      latestState?.phase === "waiting_for_user" &&
      selectedDebateMode() === "basic";
    basicDebateModeOption.style.display =
      currentEntitlements.isPro && !keepVisibleForWaitingSession ? "none" : "";
  }
  for (const optionEl of debateModeOptionEls) {
    const featureId = optionEl.dataset.proFeature;
    const locked = !canUseFeature(currentEntitlements, featureId);
    optionEl.classList.toggle("is-locked", locked);
    optionEl.title = locked ? proRequiredMessage(featureId) : featureLabel(featureId);
    
    if (currentEntitlements.isPro) {
      optionEl.style.display = featureId ? "" : "none";
    } else {
      optionEl.style.display = featureId ? "none" : "";
    }
  }
}

function renderSummaryStrategyState() {
  const currentStrategy = selectedSummaryStrategy();
  const featureId = featureForSummaryStrategy(currentStrategy);
  if (featureId && !canUseFeature(currentEntitlements, featureId)) {
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

    if (currentEntitlements.isPro) {
      optionEl.style.display = featureId ? "" : "none";
    } else {
      optionEl.style.display = featureId ? "none" : "";
    }
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
  if (mode === "chat") {
    return "啟動自由群聊中...";
  }
  if (mode === "theater") {
    return "啟動劇場大亂鬥中...";
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
    ...PROVIDERS.map((provider) => speakerBlock(provider.label, transcript.answers?.[provider.id])),
  ];

  critiqueRoundMaps(transcript).forEach((critiques, index) => {
    lines.push(
      "",
      `${zhRoundLabel(index + 2)}互評:`,
      ...PROVIDERS.map((provider) => speakerBlock(provider.label, critiques?.[provider.id])),
    );
  });

  if (state.summary || state.reveal) {
    lines.push("", state.reveal ? "遊戲揭曉:" : `${providerLabel(state.summaryProvider)} 最終總結:`, state.reveal?.content || state.summary || "");
  }

  if (state.reveal?.reactions) {
    const revealProviders = state.activeProviders || Object.keys(state.reveal.reactions);
    revealProviders.forEach((providerId, index) => {
      const reaction = state.reveal.reactions[providerId];
      if (!reaction) return;
      const anonymousLabel = state.transcript?.anonymousNames?.[providerId];
      const label = state.reveal.anonymous ? (anonymousLabel || `參與者 ${index + 1}`) : providerLabel(providerId);
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
