import { DebateEngine } from "./debateEngine.js";
import { PROVIDERS, providerLabel } from "../shared/providers.js";

const STORAGE_KEY = "aiDebate.currentState";
const PROVIDER_TIMEOUT_MS = 120000;

let engine = new DebateEngine();
let runtimeState = createIdleState();

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === "aiDebate:getState") {
    sendResponse({ ok: true, state: runtimeState });
    return false;
  }

  if (message.type === "aiDebate:reset") {
    engine = new DebateEngine();
    runtimeState = createIdleState();
    publishState();
    sendResponse({ ok: true, state: runtimeState });
    return false;
  }

  if (message.type === "aiDebate:start") {
    startDebate(message.question)
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => {
        runtimeState = {
          ...runtimeState,
          busy: false,
          status: "error",
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

function createIdleState() {
  return {
    busy: false,
    status: "idle",
    phase: "idle",
    message: "等待開始",
    question: "",
    providerTabs: {},
    transcript: null,
    summary: "",
    errors: [],
  };
}

async function startDebate(question) {
  const trimmedQuestion = String(question || "").trim();
  if (!trimmedQuestion) {
    throw new Error("請先輸入問題");
  }

  if (runtimeState.busy) {
    throw new Error("目前已有辯論正在進行");
  }

  engine = new DebateEngine();
  runtimeState = {
    ...createIdleState(),
    busy: true,
    status: "running",
    phase: "first-round",
    message: "第一輪：送出原始問題",
    question: trimmedQuestion,
  };
  await publishState();

  const firstRoundJobs = engine.start(trimmedQuestion);
  await runProviderJobs(firstRoundJobs, "answer");

  runtimeState = {
    ...runtimeState,
    phase: "critique",
    message: "第二輪：送出交叉互評",
    transcript: engine.snapshot(),
  };
  await publishState();

  const critiqueJobs = engine.buildCritiqueJobs();
  await runProviderJobs(critiqueJobs, "critique");

  runtimeState = {
    ...runtimeState,
    phase: "summary",
    message: "最終回合：請 ChatGPT 總結",
    transcript: engine.snapshot(),
  };
  await publishState();

  const finalResult = await sendJob(engine.buildFinalJob());
  runtimeState = {
    ...runtimeState,
    busy: false,
    status: finalResult.ok ? "done" : "error",
    phase: "done",
    message: finalResult.ok ? "辯論完成" : finalResult.error,
    transcript: engine.snapshot(),
    summary: finalResult.ok ? finalResult.content : "",
    errors: finalResult.ok ? runtimeState.errors : [...runtimeState.errors, finalResult],
  };
  await publishState();

  return runtimeState;
}

async function runProviderJobs(jobs, target) {
  const results = await Promise.all(jobs.map((job) => sendJob(job)));

  for (const result of results) {
    if (result.ok && target === "answer") {
      engine.recordAnswer(result.provider, result.content);
    } else if (result.ok && target === "critique") {
      engine.recordCritique(result.provider, result.content);
    } else {
      engine.markProviderError(result.provider, result.phase, result.error || "unknown error");
      runtimeState.errors = [...runtimeState.errors, result];
    }
  }

  runtimeState = {
    ...runtimeState,
    transcript: engine.snapshot(),
  };
  await publishState();
}

async function sendJob(job) {
  try {
    const tab = await getOrCreateProviderTab(job.provider);
    runtimeState = {
      ...runtimeState,
      message: `${providerLabel(job.provider)}：${phaseLabel(job.phase)}`,
      providerTabs: { ...runtimeState.providerTabs, [job.provider]: tab.id },
    };
    await publishState();

    const response = await sendProviderMessage(tab.id, job);
    if (!response?.ok) {
      throw new Error(response?.error || "provider returned empty response");
    }

    return {
      ok: true,
      provider: job.provider,
      phase: job.phase,
      content: response.content,
    };
  } catch (error) {
    return {
      ok: false,
      provider: job.provider,
      phase: job.phase,
      error: error.message,
    };
  }
}

async function getOrCreateProviderTab(providerId) {
  const provider = PROVIDERS.find((item) => item.id === providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  const existingTabs = await chrome.tabs.query({ url: provider.matchPatterns });
  const usableTab = existingTabs.find((tab) => typeof tab.id === "number");
  if (usableTab) {
    return usableTab;
  }

  const createdTab = await chrome.tabs.create({ url: provider.startUrl, active: false });
  await waitForTabComplete(createdTab.id);
  return createdTab;
}

async function waitForTabComplete(tabId) {
  if (typeof tabId !== "number") {
    return;
  }

  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") {
      return;
    }
    await delay(500);
  }
}

async function sendProviderMessage(tabId, job) {
  const payload = {
    type: "aiDebate:sendAndRead",
    provider: job.provider,
    phase: job.phase,
    prompt: job.prompt,
    timeoutMs: PROVIDER_TIMEOUT_MS,
  };

  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (_error) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content/provider-page.js"],
    });
    return chrome.tabs.sendMessage(tabId, payload);
  }
}

async function publishState() {
  await chrome.storage.local.set({ [STORAGE_KEY]: runtimeState });
  chrome.runtime.sendMessage({ type: "aiDebate:stateChanged", state: runtimeState }).catch(() => {});
}

function phaseLabel(phase) {
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
