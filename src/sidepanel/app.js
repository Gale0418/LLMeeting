import {
  canUseFeature,
  entitlementsForPlan,
  featureLabel,
  proRequiredMessage,
} from "../shared/entitlements.js";

const form = document.querySelector("#debateForm");
const questionInput = document.querySelector("#questionInput");
const basicDebateButton = document.querySelector("#basicDebateButton");
const quickDebateButton = document.querySelector("#quickDebateButton");
const summaryDebateButton = document.querySelector("#summaryDebateButton");
const resetButton = document.querySelector("#resetButton");
const statusText = document.querySelector("#statusText");
const planBadge = document.querySelector("#planBadge");
const transcriptOutput = document.querySelector("#transcriptOutput");
const diagnosticsOutput = document.querySelector("#diagnosticsOutput");
const chatTranscript = document.querySelector("#chatTranscript");
const progressBar = document.querySelector("#progressBar");

const summaryProviderSelect = document.querySelector("#summaryProviderSelect");
const providerSelectEls = Array.from(document.querySelectorAll(".provider-select"));

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
  await startDebate("basic");
});

quickDebateButton.addEventListener("click", async () => {
  await startProDebate("fast", "fastDebate");
});

summaryDebateButton.addEventListener("click", async () => {
  await startProDebate("summary", "summaryDebate");
});

providerSelectEls.forEach((el) => {
  el.addEventListener("change", renderProviderSelectionPreview);
});

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

  const summaryProvider = summaryProviderSelect.value;

  setActionButtonsDisabled(true);
  renderMessage(startingMessage(mode));
  
  const response = await chrome.runtime.sendMessage({
    type: "aiDebate:start",
    mode,
    question,
    activeProviders,
    summaryProvider,
  });

  if (!response?.ok) {
    if (response?.code === "PRO_REQUIRED") {
      renderLockedFeatureMessage(response.feature);
    } else {
      renderMessage(response?.error || "啟動失敗");
    }
  }
  renderState(response?.state);
}

async function startProDebate(mode, featureId) {
  if (!canUseFeature(currentEntitlements, featureId)) {
    renderLockedFeatureMessage(featureId);
    return;
  }

  await startDebate(mode);
}

resetButton.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:reset" });
  renderState(response?.state);
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

function renderState(state) {
  if (!state) {
    return;
  }

  latestState = state;
  currentEntitlements = state.entitlements || entitlementsForPlan();
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
  }

  const transcript = state.transcript;
  renderProviderStatuses(state);

  // 更新進度條
  updateProgressBar(state);

  // 渲染氣泡式對話框
  renderChatBubbles(state);

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

function renderProviderStatuses(state) {
  const transcript = state.transcript;
  const answers = transcript?.answers || {};
  const critiques = transcript?.critiques || {};
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
    else if (state.phase === "first-round") percent = 30;
    else if (state.phase === "critique") percent = 65;
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

  // 3. 第二輪互評
  const critiques = transcript.critiques || {};
  const hasCritiqueRound = Array.from(activeSet).some(p => critiques[p] || state.phase === "critique");
  if (hasCritiqueRound && state.phase !== "first-round") {
    html += `<div class="round-divider">第二輪：交叉評析 ⚡</div>`;
    for (const providerId of activeSet) {
      const content = critiques[providerId];
      if (!content && state.phase === "critique") {
        // 如果第一輪拿到了答案，才需要顯示第二輪思考中
        if (answers[providerId] && !answers[providerId].startsWith("[錯誤：")) {
          html += `
            <div class="bubble-group assistant ${providerId} loading">
              <div class="bubble-meta">${providerLabel(providerId)} 評析中</div>
              <div class="bubble-content"><span class="loading-dots">撰寫互評中<span>.</span><span>.</span><span>.</span></span></div>
            </div>
          `;
        }
      } else if (content) {
        html += `
          <div class="bubble-group assistant ${providerId} critique">
            <div class="bubble-meta">${providerLabel(providerId)} 評析</div>
            <div class="bubble-content">${formatContent(content)}</div>
          </div>
        `;
      }
    }
  }

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
  quickDebateButton.disabled = disabled;
  summaryDebateButton.disabled = disabled;
}

function renderEntitlementState() {
  if (planBadge) {
    planBadge.textContent = currentEntitlements.isPro ? "Pro" : "Free";
    planBadge.className = `plan-badge ${currentEntitlements.isPro ? "is-pro" : "is-free"}`;
  }

  renderProActionState(quickDebateButton, "fastDebate");
  renderProActionState(summaryDebateButton, "summaryDebate");
}

function renderProActionState(button, featureId) {
  if (!button) {
    return;
  }

  const locked = !canUseFeature(currentEntitlements, featureId);
  button.classList.toggle("is-locked", locked);
  button.title = locked ? proRequiredMessage(featureId) : featureLabel(featureId);
}

function renderLockedFeatureMessage(featureId) {
  renderMessage(proRequiredMessage(featureId));
}

function startingMessage(mode) {
  if (mode === "summary") {
    return "啟動總結辯論中...";
  }
  if (mode === "fast") {
    return "啟動快速鬪技場中...";
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
    "",
    "第二輪互評:",
    speakerBlock("ChatGPT", transcript.critiques?.chatgpt),
    speakerBlock("Gemini", transcript.critiques?.gemini),
    speakerBlock("Grok", transcript.critiques?.grok),
    speakerBlock("Claude", transcript.critiques?.claude),
  ];

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
