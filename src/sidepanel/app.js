const form = document.querySelector("#debateForm");
const questionInput = document.querySelector("#questionInput");
const startButton = document.querySelector("#startButton");
const resetButton = document.querySelector("#resetButton");
const statusText = document.querySelector("#statusText");
const transcriptOutput = document.querySelector("#transcriptOutput");

const providerStateEls = {
  chatgpt: document.querySelector("#chatgptState"),
  gemini: document.querySelector("#geminiState"),
  grok: document.querySelector("#grokState"),
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question) {
    renderMessage("請先輸入問題");
    return;
  }

  startButton.disabled = true;
  renderMessage("啟動辯論中...");
  const response = await chrome.runtime.sendMessage({ type: "aiDebate:start", question });
  if (!response?.ok) {
    renderMessage(response?.error || "啟動失敗");
  }
  renderState(response?.state);
});

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

  startButton.disabled = Boolean(state.busy);
  statusText.textContent = state.message || state.status || "等待開始";

  const transcript = state.transcript;
  const answers = transcript?.answers || {};
  const critiques = transcript?.critiques || {};

  for (const provider of Object.keys(providerStateEls)) {
    providerStateEls[provider].textContent = providerLabelForPhase(provider, state, answers, critiques);
  }

  transcriptOutput.textContent = buildTranscriptText(state);
}

function providerLabelForPhase(provider, state, answers, critiques) {
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

function buildTranscriptText(state) {
  const transcript = state.transcript;
  if (!transcript) {
    return "尚未開始";
  }

  const lines = [
    `狀態: ${state.message || state.status}`,
    "",
    "原問題:",
    transcript.originalQuestion || state.question || "",
    "",
    "第一輪回答:",
    speakerBlock("ChatGPT", transcript.answers?.chatgpt),
    speakerBlock("Gemini", transcript.answers?.gemini),
    speakerBlock("Grok", transcript.answers?.grok),
    "",
    "第二輪互評:",
    speakerBlock("ChatGPT", transcript.critiques?.chatgpt),
    speakerBlock("Gemini", transcript.critiques?.gemini),
    speakerBlock("Grok", transcript.critiques?.grok),
  ];

  if (state.summary) {
    lines.push("", "GPT 最終總結:", state.summary);
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
