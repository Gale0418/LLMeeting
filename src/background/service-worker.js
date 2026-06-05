import { DebateEngine } from "./debateEngine.js";
import { isProviderTabReady, setSidePanelOpenOnActionClick } from "./chromeCompat.js";
import { createProviderDiagnostics, updateProviderDiagnostic } from "./diagnostics.js";
import { buildConversationSummaryPrompt } from "../shared/prompts.js";
import {
  DEFAULT_ACTIVE_PROVIDER_IDS,
  PROVIDERS,
  normalizeProviderIds,
  providerLabel,
} from "../shared/providers.js";

const STORAGE_KEY = "aiDebate.currentState";
const PROVIDER_TIMEOUT_MS = 120000;

let engine = new DebateEngine();
let runtimeState = createIdleState();

chrome.runtime.onInstalled.addListener(() => {
  setSidePanelOpenOnActionClick(chrome);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === "aiDebate:getState") {
    getRuntimeState()
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: error.message, state: runtimeState }));
    return true;
  }

  if (message.type === "aiDebate:reset") {
    engine = new DebateEngine();
    runtimeState = createIdleState();
    publishState();
    sendResponse({ ok: true, state: runtimeState });
    return false;
  }

  if (message.type === "aiDebate:start") {
    const { question, mode = "fast", activeProviders, summaryProvider } = message;
    const startAction = mode === "summary" ? startSummaryDebate : startDebate;
    startAction(question, { activeProviders, summaryProvider })
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => {
        runtimeState = {
          ...runtimeState,
          busy: false,
          status: "error",
          phase: "done",
          message: error.message,
          errors: [...runtimeState.errors, { message: error.message }],
        };
        publishState();
        sendResponse({ ok: false, error: error.message, state: runtimeState });
      });
    return true;
  }

  return false;
});

function createIdleState(providerIds = DEFAULT_ACTIVE_PROVIDER_IDS) {
  const activeProviders = normalizeProviderIds(providerIds);
  return {
    busy: false,
    status: "idle",
    phase: "idle",
    mode: "idle",
    message: "等待開始",
    question: "",
    providerTabs: {},
    providerDiagnostics: createProviderDiagnostics(activeProviders),
    transcript: null,
    summary: "",
    sourceProvider: "",
    sourceSummary: "",
    errors: [],
    activeProviders,
    summaryProvider: "chatgpt",
  };
}

async function startDebate(question, options = {}) {
  const trimmedQuestion = String(question || "").trim();
  if (!trimmedQuestion) {
    throw new Error("請先輸入問題");
  }

  if (runtimeState.busy) {
    throw new Error("目前已有辯論正在進行");
  }

  const activeProviders = normalizeProviderIds(options.activeProviders);
  const summaryProvider = options.summaryProvider || "chatgpt";

  engine = new DebateEngine(activeProviders, summaryProvider);
  runtimeState = {
    ...createIdleState(activeProviders),
    busy: true,
    status: "running",
    mode: "fast",
    phase: "first-round",
    message: "快速辯論：準備送出原始問題",
    question: trimmedQuestion,
    activeProviders,
    summaryProvider,
  };
  await publishState();

  return runDebateRounds(trimmedQuestion);
}

async function startSummaryDebate(userNote, options = {}) {
  if (runtimeState.busy) {
    throw new Error("目前已有辯論正在進行");
  }

  const { tab: sourceTab, provider: sourceProviderInfo } = await getActiveProviderTab();
  const sourceProvider = sourceProviderInfo.id;
  const requestedProviders = normalizeProviderIds(options.activeProviders);
  const debateProviders = requestedProviders.filter((providerId) => providerId !== sourceProvider);
  if (debateProviders.length < 2) {
    throw new Error(`總結辯論至少需要目前頁面以外的 2 家 AI。現在目前頁面是 ${providerLabel(sourceProvider)}，請再勾選兩家其他 AI。`);
  }

  engine = new DebateEngine(debateProviders, sourceProvider);
  runtimeState = {
    ...createIdleState(debateProviders),
    busy: true,
    status: "running",
    mode: "summary",
    phase: "source-summary",
    message: `請 ${providerLabel(sourceProvider)} 總結目前對話`,
    question: String(userNote || "").trim(),
    providerTabs: { [sourceProvider]: sourceTab.id },
    activeProviders: debateProviders,
    sourceProvider,
    summaryProvider: sourceProvider,
  };
  await publishState();

  const sourceResult = await sendJob({
    provider: sourceProvider,
    phase: "source-summary",
    prompt: buildConversationSummaryPrompt(userNote),
  });
  if (!sourceResult.ok) {
    return finishWithError(sourceResult);
  }

  runtimeState = {
    ...runtimeState,
    sourceSummary: sourceResult.content,
    phase: "first-round",
    message: "快速辯論：將目前對話總結送給其他 AI",
  };
  await publishState();

  return runDebateRounds(sourceResult.content);
}

async function runDebateRounds(originalQuestion) {
  const firstRoundJobs = engine.start(originalQuestion);
  runtimeState = {
    ...runtimeState,
    phase: "first-round",
    message: "第一輪：快速送出原始問題",
    transcript: engine.snapshot(),
  };
  await publishState();
  await runFastProviderJobs(firstRoundJobs, "answer");

  runtimeState = {
    ...runtimeState,
    phase: "critique",
    message: "第二輪：快速送出交叉互評",
    transcript: engine.snapshot(),
  };
  await publishState();

  const critiqueJobs = engine.buildCritiqueJobs();
  await runFastProviderJobs(critiqueJobs, "critique");

  runtimeState = {
    ...runtimeState,
    phase: "summary",
    message: `最終回合：請 ${providerLabel(runtimeState.summaryProvider)} 總結`,
    transcript: engine.snapshot(),
  };
  await publishState();

  const finalResult = await sendJob(engine.buildFinalJob());
  if (!finalResult.ok) {
    return finishWithError(finalResult);
  }

  runtimeState = {
    ...runtimeState,
    busy: false,
    status: "done",
    phase: "done",
    message: "辯論完成",
    transcript: engine.snapshot(),
    summary: finalResult.content,
  };
  await publishState();

  return runtimeState;
}

async function runFastProviderJobs(jobs, target) {
  const submittedJobs = [];
  for (const job of jobs) {
    const submitted = await submitProviderJob(job);
    if (submitted.ok) {
      submittedJobs.push(submitted);
    } else {
      recordProviderResult(submitted, target);
    }
    runtimeState = {
      ...runtimeState,
      transcript: engine.snapshot(),
    };
    await publishState();
  }

  for (const submitted of submittedJobs) {
    const result = await collectProviderJob(submitted);
    recordProviderResult(result, target);
    runtimeState = {
      ...runtimeState,
      transcript: engine.snapshot(),
    };
    await publishState();
  }
}

function recordProviderResult(result, target) {
  if (result.ok && target === "answer") {
    engine.recordAnswer(result.provider, result.content);
  } else if (result.ok && target === "critique") {
    engine.recordCritique(result.provider, result.content);
  } else {
    engine.markProviderError(result.provider, result.phase, result.error || "unknown error");
    runtimeState.errors = [...runtimeState.errors, result];
  }
}

async function submitProviderJob(job) {
  try {
    await setProviderDiagnostic(job.provider, {
      stage: "opening-tab",
      phase: job.phase,
      error: "",
    });
    const tab = await getOrCreateProviderTab(job.provider);
    await setProviderDiagnostic(job.provider, {
      stage: "activating-tab",
      phase: job.phase,
      tabId: tab.id,
      url: tab.url || tab.pendingUrl || "",
    });
    await activateProviderTab(tab);

    const runId = createRunId(job);
    runtimeState = {
      ...runtimeState,
      message: `${providerLabel(job.provider)}：${phaseLabel(job.phase)}送出中`,
      providerTabs: { ...runtimeState.providerTabs, [job.provider]: tab.id },
    };
    runtimeState.providerDiagnostics = updateProviderDiagnostic(runtimeState.providerDiagnostics, job.provider, {
      stage: "submitting-prompt",
      phase: job.phase,
      tabId: tab.id,
      url: tab.url || tab.pendingUrl || "",
    });
    await publishState();

    const response = await sendProviderMessage(tab.id, job, "aiDebate:submitPrompt", { runId });
    if (!response?.ok) {
      throw new Error(response?.error || "provider submit failed");
    }

    await setProviderDiagnostic(job.provider, {
      stage: "submitted",
      phase: job.phase,
      tabId: tab.id,
      url: tab.url || tab.pendingUrl || "",
    });
    return {
      ok: true,
      provider: job.provider,
      phase: job.phase,
      prompt: job.prompt,
      tabId: tab.id,
      runId: response.runId || runId,
    };
  } catch (error) {
    await setProviderDiagnostic(job.provider, {
      stage: "error",
      phase: job.phase,
      error: error.message,
    });
    return {
      ok: false,
      provider: job.provider,
      phase: job.phase,
      error: error.message,
    };
  }
}

async function collectProviderJob(submitted) {
  try {
    const tab = await chrome.tabs.get(submitted.tabId);
    await setProviderDiagnostic(submitted.provider, {
      stage: "activating-tab",
      phase: submitted.phase,
      tabId: submitted.tabId,
      url: tab.url || tab.pendingUrl || "",
      error: "",
    });
    await activateProviderTab(tab);

    runtimeState = {
      ...runtimeState,
      message: `${providerLabel(submitted.provider)}：等待${phaseLabel(submitted.phase)}`,
    };
    runtimeState.providerDiagnostics = updateProviderDiagnostic(runtimeState.providerDiagnostics, submitted.provider, {
      stage: "waiting-response",
      phase: submitted.phase,
      tabId: submitted.tabId,
      url: tab.url || tab.pendingUrl || "",
      error: "",
    });
    await publishState();

    const response = await sendProviderMessage(tab.id, submitted, "aiDebate:readSubmittedResponse", {
      runId: submitted.runId,
    });
    if (!response?.ok) {
      throw new Error(response?.error || "provider returned empty response");
    }

    await setProviderDiagnostic(submitted.provider, {
      stage: "received",
      phase: submitted.phase,
      tabId: submitted.tabId,
      url: tab.url || tab.pendingUrl || "",
    });
    return {
      ok: true,
      provider: submitted.provider,
      phase: submitted.phase,
      content: response.content,
    };
  } catch (error) {
    await setProviderDiagnostic(submitted.provider, {
      stage: "error",
      phase: submitted.phase,
      tabId: submitted.tabId,
      error: error.message,
    });
    return {
      ok: false,
      provider: submitted.provider,
      phase: submitted.phase,
      error: error.message,
    };
  }
}

async function sendJob(job) {
  try {
    await setProviderDiagnostic(job.provider, {
      stage: "opening-tab",
      phase: job.phase,
      error: "",
    });
    const tab = await getOrCreateProviderTab(job.provider);
    await setProviderDiagnostic(job.provider, {
      stage: "activating-tab",
      phase: job.phase,
      tabId: tab.id,
      url: tab.url || tab.pendingUrl || "",
    });
    await activateProviderTab(tab);
    runtimeState = {
      ...runtimeState,
      message: `${providerLabel(job.provider)}：${phaseLabel(job.phase)}`,
      providerTabs: { ...runtimeState.providerTabs, [job.provider]: tab.id },
    };
    runtimeState.providerDiagnostics = updateProviderDiagnostic(runtimeState.providerDiagnostics, job.provider, {
      stage: "waiting-response",
      phase: job.phase,
      tabId: tab.id,
      url: tab.url || tab.pendingUrl || "",
    });
    await publishState();

    const response = await sendProviderMessage(tab.id, job);
    if (!response?.ok) {
      throw new Error(response?.error || "provider returned empty response");
    }

    await setProviderDiagnostic(job.provider, {
      stage: "received",
      phase: job.phase,
    });
    return {
      ok: true,
      provider: job.provider,
      phase: job.phase,
      content: response.content,
    };
  } catch (error) {
    await setProviderDiagnostic(job.provider, {
      stage: "error",
      phase: job.phase,
      error: error.message,
    });
    return {
      ok: false,
      provider: job.provider,
      phase: job.phase,
      error: error.message,
    };
  }
}

async function getActiveProviderTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const provider = PROVIDERS.find((item) => isProviderTabReady(tab, item));
  if (!provider) {
    throw new Error("請先切到要當作來源的 ChatGPT、Gemini、Grok 或 Claude 對話分頁，再按總結辯論。");
  }

  return { tab, provider };
}

async function getOrCreateProviderTab(providerId) {
  const provider = PROVIDERS.find((item) => item.id === providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  const boundTabId = runtimeState.providerTabs?.[providerId];
  if (typeof boundTabId === "number") {
    try {
      const boundTab = await chrome.tabs.get(boundTabId);
      if (isProviderTabReady(boundTab, provider)) {
        return boundTab;
      }
    } catch (_error) {
      // The user closed the debate tab. Open a fresh conversation below.
    }
  }

  const createdTab = await chrome.tabs.create({ url: provider.startUrl, active: true });
  return waitForProviderTab(createdTab.id, provider);
}

async function activateProviderTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  await delay(750);
}

async function waitForProviderTab(tabId, provider) {
  if (typeof tabId !== "number") {
    throw new Error(`${provider.label} 新對話分頁建立失敗`);
  }

  const deadline = Date.now() + 45000;
  let lastUrl = "";
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId);
    lastUrl = tab.url || tab.pendingUrl || lastUrl;
    if (isProviderTabReady(tab, provider)) {
      return tab;
    }
    await delay(500);
  }

  throw new Error(`${provider.label} 新對話頁面尚未就緒，目前網址：${lastUrl || "unknown"}。請確認已登入。`);
}

async function sendProviderMessage(tabId, job, type = "aiDebate:sendAndRead", extra = {}) {
  const payload = {
    type,
    provider: job.provider,
    phase: job.phase,
    prompt: job.prompt,
    timeoutMs: PROVIDER_TIMEOUT_MS,
    ...extra,
  };

  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (_error) {
    const tab = await chrome.tabs.get(tabId);
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["src/content/automation-core.js", "src/content/provider-page.js"],
      });
      return await chrome.tabs.sendMessage(tabId, payload);
    } catch (error) {
      throw new Error(`${error.message}（目前網址：${tab.url || tab.pendingUrl || "unknown"}）`);
    }
  }
}

async function finishWithError(result) {
  runtimeState = {
    ...runtimeState,
    busy: false,
    status: "error",
    phase: "done",
    message: result.error || result.message || "辯論失敗",
    transcript: engine.snapshot(),
    errors: [...runtimeState.errors, result],
  };
  await publishState();
  return runtimeState;
}

async function publishState() {
  await chrome.storage.local.set({ [STORAGE_KEY]: runtimeState });
  chrome.runtime.sendMessage({ type: "aiDebate:stateChanged", state: runtimeState }).catch(() => {});
}

async function setProviderDiagnostic(providerId, patch) {
  runtimeState = {
    ...runtimeState,
    providerDiagnostics: updateProviderDiagnostic(runtimeState.providerDiagnostics, providerId, patch),
  };
  await publishState();
}

async function getRuntimeState() {
  if (runtimeState.status !== "idle" || runtimeState.busy) {
    return runtimeState;
  }

  const stored = await chrome.storage.local.get(STORAGE_KEY);
  if (stored?.[STORAGE_KEY]) {
    runtimeState = stored[STORAGE_KEY];
  }

  return runtimeState;
}

function phaseLabel(phase) {
  if (phase === "source-summary") {
    return "總結目前對話";
  }
  if (phase === "first-round") {
    return "回答原始問題";
  }
  if (phase === "critique") {
    return "評析其他 AI";
  }
  if (phase === "summary") {
    return "彙整總結";
  }
  return phase;
}

function createRunId(job) {
  return `${job.provider}:${job.phase}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
