import { DebateEngine, normalizeDebateRounds } from "./debateEngine.js";
import { isProviderTabReady, setSidePanelOpenOnActionClick } from "./chromeCompat.js";
import { createProviderDiagnostics, updateProviderDiagnostic } from "./diagnostics.js";
import { RunController, isRunCancelledError } from "./runController.js";
import { recoverSession } from "./sessionRecovery.js";
import {
  canUseFeature,
  ENTITLEMENT_STORAGE_KEY,
  entitlementsForPlan,
  featureLabel,
  proRequiredMessage,
} from "../shared/entitlements.js";
import { buildConversationSummaryPrompt } from "../shared/prompts.js";
import {
  DEFAULT_ACTIVE_PROVIDER_IDS,
  PROVIDERS,
  normalizeProviderIds,
  providerLabel,
} from "../shared/providers.js";

const STORAGE_KEY = "aiDebate.currentState";
const PROVIDER_TIMEOUT_MS = 240000; // 4分鐘，防話癆

let engine = new DebateEngine();
let runtimeState = createIdleState();
const runController = new RunController();
let initializationPromise;

chrome.runtime.onInstalled.addListener(() => {
  setSidePanelOpenOnActionClick(chrome);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === "aiDebate:getState") {
    ensureRuntimeInitialized()
      .then(() => getRuntimeState())
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: error.message, state: runtimeState }));
    return true;
  }

  if (message.type === "aiDebate:reset") {
    ensureRuntimeInitialized()
      .then(async () => {
        runController.cancel();
        engine = new DebateEngine();
        runtimeState = createIdleState();
        await publishState();
        sendResponse({ ok: true, state: runtimeState });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message, state: runtimeState }));
    return true;
  }

  if (message.type === "aiDebate:start") {
    const { question, mode = "basic", activeProviders, summaryProvider, debateRounds, skipSummary, customPersonas, hookedTabs, interactionStyle, interactiveMode } = message;
    const startAction = {
      basic: startBasicDebate,
      fast: startFastDebate,
      summary: startSummaryDebate,
      chat: startChatDebate,
      theater: startTheaterDebate,
    }[mode];

    if (!startAction) {
      sendResponse({ ok: false, error: `Unknown debate mode: ${mode}`, state: runtimeState });
      return false;
    }

    let runToken;
    ensureRuntimeInitialized()
      .then(() => {
        if (runtimeState.busy) {
          throw new Error("目前已有辯論正在進行");
        }
        runToken = runController.start();
        return startAction(question, { activeProviders, summaryProvider, debateRounds, skipSummary, customPersonas, hookedTabs, interactionStyle, interactiveMode, runToken });
      })
      .then((state) => sendResponse({ ok: true, state }))
      .catch(async (error) => {
        if (!runToken) {
          sendResponse({ ok: false, code: error.code || "ERROR", error: error.message, state: runtimeState });
          return;
        }
        if (isRunCancelledError(error) || (runToken && !runController.isCurrent(runToken))) {
          sendResponse({ ok: false, code: "RUN_CANCELLED", error: "已緊急暫停", state: runtimeState });
          return;
        }

        const isProRequired = error.code === "PRO_REQUIRED";
        const entitlements = await getEntitlements();
        if (runToken && !runController.isCurrent(runToken)) {
          sendResponse({ ok: false, code: "RUN_CANCELLED", error: "已緊急暫停", state: runtimeState });
          return;
        }
        runController.cancel();
        runtimeState = {
          ...runtimeState,
          busy: false,
          status: isProRequired ? "idle" : "error",
          phase: isProRequired ? runtimeState.phase : "done",
          message: error.message,
          errors: isProRequired ? runtimeState.errors : [...runtimeState.errors, { message: error.message }],
          entitlements,
        };
        await publishState();
        sendResponse({
          ok: false,
          code: error.code || "ERROR",
          feature: error.feature || "",
          error: error.message,
          state: runtimeState,
        });
      });
    return true;
  }

  if (message.type === "aiDebate:nextRound") {
    let runToken;
    ensureRuntimeInitialized()
      .then(() => {
        if (runtimeState.busy) {
          throw new Error("目前忙碌中");
        }
        runToken = runController.start();
        return handleNextRound(message.action, message.text, runToken);
      })
      .then((state) => sendResponse({ ok: true, state }))
      .catch(async (error) => {
        if (!runToken) {
          sendResponse({ ok: false, code: error.code || "ERROR", error: error.message, state: runtimeState });
          return;
        }
        if (isRunCancelledError(error) || (runToken && !runController.isCurrent(runToken))) {
          sendResponse({ ok: false, code: "RUN_CANCELLED", error: "已緊急暫停", state: runtimeState });
          return;
        }
        runController.cancel();
        runtimeState = {
          ...runtimeState,
          busy: false,
          status: "waiting_for_user",
          phase: "waiting_for_user",
          message: `發送失敗：${error.message}`,
        };
        await publishState();
        sendResponse({ ok: false, error: error.message, state: runtimeState });
      });
    return true;
  }

  if (message.type === "aiDebate:stop") {
    ensureRuntimeInitialized()
      .then(async () => {
        runController.cancel();
        if (runtimeState.busy) {
          runtimeState = {
            ...runtimeState,
            busy: false,
            status: "idle",
            phase: "idle",
            message: "已緊急暫停",
            errors: [...runtimeState.errors, { message: "使用者手動取消操作" }],
          };
          await publishState();
        }
        sendResponse({ ok: true, state: runtimeState });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message, state: runtimeState }));
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
    debateRounds: 1,
    currentCritiqueRound: 0,
    entitlements: entitlementsForPlan(),
    skipSummary: false,
  };
}

async function startBasicDebate(question, options = {}) {
  return startQuestionDebate(question, {
    ...options,
    mode: "basic",
    scheduler: "sequential",
    openingMessage: "基礎辯論：準備逐家送出原始問題",
    hookedTabs: options.hookedTabs,
    interactionStyle: options.interactionStyle,
  });
}

async function startFastDebate(question, options = {}) {
  await requireProFeature("fastDebate");
  runController.assertCurrent(options.runToken);
  return startQuestionDebate(question, {
    ...options,
    mode: "fast",
    scheduler: "fast",
    openingMessage: "快速鬥技場：準備送出原始問題",
    hookedTabs: options.hookedTabs,
    interactionStyle: options.interactionStyle,
  });
}

async function startChatDebate(question, options = {}) {
  const runToken = options.runToken;
  await requireProFeature("chatMode");
  runController.assertCurrent(runToken);
  const trimmedQuestion = String(question || "").trim();
  if (!trimmedQuestion) throw new Error("請先輸入問題");
  if (runtimeState.busy) throw new Error("目前已有辯論正在進行");

  const activeProviders = normalizeProviderIds(options.activeProviders);
  const debateRounds = normalizeDebateRounds(options.debateRounds);
  const entitlements = await getEntitlements();
  runController.assertCurrent(runToken);
  engine = new DebateEngine(activeProviders, options.summaryProvider, debateRounds, {
    interactionStyle: options.interactionStyle,
  });
  runtimeState = {
    ...createIdleState(activeProviders),
    busy: true,
    status: "running",
    mode: "chat",
    phase: "first-round",
    message: "自由群聊開始：各就各位，準備送出第一句話",
    question: trimmedQuestion,
    activeProviders,
    summaryProvider: options.summaryProvider || "chatgpt",
    debateRounds: debateRounds,
    currentCritiqueRound: 0,
    entitlements,
    skipSummary: options.skipSummary || false,
    providerTabs: options.hookedTabs || {},
  };
  await publishState(runToken);

  const firstRoundJobs = engine.start(trimmedQuestion);
  runtimeState = { ...runtimeState, transcript: engine.snapshot() };
  await publishState(runToken);
  await runFastProviderJobs(firstRoundJobs, "answer", runToken);

  for (let round = 1; round <= debateRounds; round += 1) {
    const jobs = engine.buildCritiqueJobs(round);
    runtimeState = {
      ...runtimeState,
      phase: round === 1 ? "critique" : `critique-${round}`,
      currentCritiqueRound: round,
      message: `第 ${round} 輪：等待 AI 交叉互評`,
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
    await runFastProviderJobs(jobs, "critique", runToken);
  }

  if (options.interactiveMode) {
    runtimeState = {
      ...runtimeState,
      busy: false,
      status: "waiting_for_user",
      phase: "waiting_for_user",
      message: "等待主人發言或選擇下一步...",
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
    return runtimeState;
  }

  if (options.skipSummary) {
    runtimeState = {
      ...runtimeState,
      busy: false,
      status: "done",
      phase: "done",
      message: "對話完成 (略過總結)",
      transcript: engine.snapshot(),
      summary: "",
    };
    await publishState(runToken);
    return runtimeState;
  }

  runtimeState = {
    ...runtimeState,
    phase: "summary",
    message: `最終回合：請 ${providerLabel(runtimeState.summaryProvider)} 總結`,
    transcript: engine.snapshot(),
  };
  await publishState(runToken);

  const finalResult = await sendJob(engine.buildFinalJob(), runToken);
  if (!finalResult.ok) {
    return finishWithError(finalResult, runToken);
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
  await publishState(runToken);
  return runtimeState;
}

async function startTheaterDebate(question, options = {}) {
  const runToken = options.runToken;
  await requireProFeature("chatMode");
  runController.assertCurrent(runToken);
  const trimmedQuestion = String(question || "").trim();
  if (!trimmedQuestion) throw new Error("請先輸入問題");
  if (runtimeState.busy) throw new Error("目前已有辯論正在進行");

  const activeProviders = normalizeProviderIds(options.activeProviders);
  const debateRounds = normalizeDebateRounds(options.debateRounds);
  const entitlements = await getEntitlements();
  runController.assertCurrent(runToken);
  engine = new DebateEngine(activeProviders, options.summaryProvider, debateRounds, {
    isTheaterMode: true,
    customPersonas: options.customPersonas,
    interactionStyle: options.interactionStyle,
  });
  runtimeState = {
    ...createIdleState(activeProviders),
    busy: true,
    status: "running",
    mode: "theater",
    phase: "first-round",
    message: "劇場大亂鬥：各就各位，準備送出第一句話",
    question: trimmedQuestion,
    activeProviders,
    summaryProvider: options.summaryProvider || "chatgpt",
    debateRounds: debateRounds,
    currentCritiqueRound: 0,
    entitlements,
    skipSummary: options.skipSummary || false,
    providerTabs: options.hookedTabs || {},
  };
  await publishState(runToken);

  const firstRoundJobs = engine.start(trimmedQuestion);
  runtimeState = { ...runtimeState, transcript: engine.snapshot() };
  await publishState(runToken);
  await runFastProviderJobs(firstRoundJobs, "answer", runToken);

  for (let round = 1; round <= debateRounds; round += 1) {
    const jobs = engine.buildCritiqueJobs(round);
    runtimeState = {
      ...runtimeState,
      phase: round === 1 ? "critique" : `critique-${round}`,
      currentCritiqueRound: round,
      message: `第 ${round} 輪：等待 AI 交叉互評`,
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
    await runFastProviderJobs(jobs, "critique", runToken);
  }

  if (options.interactiveMode) {
    runtimeState = {
      ...runtimeState,
      busy: false,
      status: "waiting_for_user",
      phase: "waiting_for_user",
      message: "等待主人發言或選擇下一步...",
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
    return runtimeState;
  }

  if (options.skipSummary) {
    runtimeState = {
      ...runtimeState,
      busy: false,
      status: "done",
      phase: "done",
      message: "對話完成 (略過總結)",
      transcript: engine.snapshot(),
      summary: "",
    };
    await publishState(runToken);
    return runtimeState;
  }

  runtimeState = {
    ...runtimeState,
    phase: "summary",
    message: `最終回合：請 ${providerLabel(runtimeState.summaryProvider)} 總結`,
    transcript: engine.snapshot(),
  };
  await publishState(runToken);

  const finalResult = await sendJob(engine.buildFinalJob(), runToken);
  if (!finalResult.ok) {
    return finishWithError(finalResult, runToken);
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
  await publishState(runToken);
  return runtimeState;
}

async function startQuestionDebate(question, options = {}) {
  const runToken = options.runToken;
  runController.assertCurrent(runToken);
  const trimmedQuestion = String(question || "").trim();
  if (!trimmedQuestion) {
    throw new Error("請先輸入問題");
  }

  if (runtimeState.busy) {
    throw new Error("目前已有辯論正在進行");
  }

  const activeProviders = normalizeProviderIds(options.activeProviders);
  const summaryProvider = options.summaryProvider || "chatgpt";
  const entitlements = await getEntitlements();
  runController.assertCurrent(runToken);
  const mode = options.mode || "basic";
  const scheduler = options.scheduler || "sequential";
  const debateRounds = normalizeDebateRounds(options.debateRounds);

  engine = new DebateEngine(activeProviders, summaryProvider, debateRounds, {
    interactionStyle: options.interactionStyle,
  });
  runtimeState = {
    ...createIdleState(activeProviders),
    busy: true,
    status: "running",
    mode,
    phase: "first-round",
    message: options.openingMessage || "基礎辯論：準備送出原始問題",
    question: trimmedQuestion,
    activeProviders,
    summaryProvider,
    debateRounds,
    currentCritiqueRound: 0,
    entitlements,
    skipSummary: options.skipSummary || false,
    providerTabs: options.hookedTabs || {},
  };
  await publishState(runToken);

  return runDebateRounds(trimmedQuestion, { scheduler, runToken, interactiveMode: options.interactiveMode });
}

async function startSummaryDebate(userNote, options = {}) {
  const runToken = options.runToken;
  await requireProFeature("summaryDebate");
  runController.assertCurrent(runToken);

  if (runtimeState.busy) {
    throw new Error("目前已有辯論正在進行");
  }

  const { tab: sourceTab, provider: sourceProviderInfo } = await getActiveProviderTab();
  runController.assertCurrent(runToken);
  const sourceProvider = sourceProviderInfo.id;
  const requestedProviders = normalizeProviderIds(options.activeProviders);
  const debateProviders = requestedProviders.filter((providerId) => providerId !== sourceProvider);
  const entitlements = await getEntitlements();
  runController.assertCurrent(runToken);
  const debateRounds = normalizeDebateRounds(options.debateRounds);
  if (debateProviders.length < 2) {
    throw new Error(`總結辯論至少需要目前頁面以外的 2 家 AI。現在目前頁面是 ${providerLabel(sourceProvider)}，請再勾選兩家其他 AI。`);
  }

  engine = new DebateEngine(debateProviders, sourceProvider, debateRounds, {
    interactionStyle: options.interactionStyle,
  });
  runtimeState = {
    ...createIdleState(debateProviders),
    busy: true,
    status: "running",
    mode: "summary",
    phase: "source-summary",
    message: `請 ${providerLabel(sourceProvider)} 總結目前對話`,
    question: String(userNote || "").trim(),
    providerTabs: { ...(options.hookedTabs || {}), [sourceProvider]: sourceTab.id },
    activeProviders: debateProviders,
    sourceProvider,
    summaryProvider: sourceProvider,
    debateRounds,
    currentCritiqueRound: 0,
    entitlements,
    skipSummary: options.skipSummary || false,
  };
  await publishState(runToken);

  const sourceResult = await sendJob({
    provider: sourceProvider,
    phase: "source-summary",
    prompt: buildConversationSummaryPrompt(userNote),
  }, runToken);
  if (!sourceResult.ok) {
    return finishWithError(sourceResult, runToken);
  }

  runtimeState = {
    ...runtimeState,
    sourceSummary: sourceResult.content,
    phase: "first-round",
    message: "快速辯論：將目前對話總結送給其他 AI",
    debateRounds,
  };
  await publishState(runToken);

  return runDebateRounds(sourceResult.content, { scheduler: "fast", interactiveMode: options.interactiveMode, runToken });
}

async function runDebateRounds(originalQuestion, options = {}) {
  const runToken = options.runToken;
  runController.assertCurrent(runToken);
  const scheduler = options.scheduler || "sequential";
  const runProviderJobs = scheduler === "fast" ? runFastProviderJobs : runSequentialProviderJobs;
  const schedulerLabel = scheduler === "fast" ? "快速" : "逐家";

  const firstRoundJobs = engine.start(originalQuestion);
  runtimeState = {
    ...runtimeState,
    phase: "first-round",
    message: `第一輪：${schedulerLabel}送出原始問題`,
    transcript: engine.snapshot(),
  };
  await publishState(runToken);
  await runProviderJobs(firstRoundJobs, "answer", runToken);

  for (let roundNumber = 1; roundNumber <= engine.debateRounds; roundNumber += 1) {
    const critiqueJobs = engine.buildCritiqueJobs(roundNumber);
    runtimeState = {
      ...runtimeState,
      phase: "critique",
      currentCritiqueRound: roundNumber,
      debateRounds: engine.debateRounds,
      message: `${critiqueRoundLabel(roundNumber, engine.debateRounds)}：${schedulerLabel}送出交叉互評`,
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
    await runProviderJobs(critiqueJobs, "critique", runToken);
  }

  if (options.interactiveMode) {
    runtimeState = {
      ...runtimeState,
      busy: false,
      status: "waiting_for_user",
      phase: "waiting_for_user",
      message: "等待主人發言或選擇下一步...",
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
    return runtimeState;
  }

  if (runtimeState.skipSummary) {
    runtimeState = {
      ...runtimeState,
      busy: false,
      status: "done",
      phase: "done",
      message: "對話完成 (略過總結)",
      transcript: engine.snapshot(),
      summary: "",
    };
    await publishState(runToken);
    return runtimeState;
  }

  runtimeState = {
    ...runtimeState,
    phase: "summary",
    message: `最終回合：請 ${providerLabel(runtimeState.summaryProvider)} 總結`,
    transcript: engine.snapshot(),
  };
  await publishState(runToken);

  const finalResult = await sendJob(engine.buildFinalJob(), runToken);
  if (!finalResult.ok) {
    return finishWithError(finalResult, runToken);
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
  await publishState(runToken);

  return runtimeState;
}

async function handleNextRound(action, text, runToken) {
  runController.assertCurrent(runToken);
  if (runtimeState.busy) throw new Error("目前忙碌中");
  if (runtimeState.mode !== "chat" && runtimeState.mode !== "theater" && runtimeState.mode !== "summary") throw new Error("只有自由群聊、劇場模式與總結辯論支援此操作");
  if (!["user_message", "critique", "summarize"].includes(action)) {
    throw new Error(`未知的操作: ${action}`);
  }

  runtimeState = { ...runtimeState, busy: true, status: "running" };
  await publishState(runToken);

  if (action === "user_message") {
    const newRound = engine.addChatRound(text);
    const jobs = engine.buildUserMessageJobs(text, newRound);
    runtimeState = {
      ...runtimeState,
      phase: "critique",
      currentCritiqueRound: newRound,
      debateRounds: newRound,
      message: `送出主人的補充發言`,
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
    await runFastProviderJobs(jobs, "critique", runToken);
  } else if (action === "critique") {
    const newRound = engine.addChatRound();
    const jobs = engine.buildCritiqueJobs(newRound);
    runtimeState = {
      ...runtimeState,
      phase: "critique",
      currentCritiqueRound: newRound,
      debateRounds: newRound,
      message: `第 ${newRound} 輪：送出交叉互評`,
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
    await runFastProviderJobs(jobs, "critique", runToken);
  } else if (action === "summarize") {
    runtimeState = {
      ...runtimeState,
      phase: "summary",
      message: `請 ${providerLabel(runtimeState.summaryProvider)} 總結`,
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
    const finalResult = await sendJob(engine.buildFinalJob(), runToken);
    if (!finalResult.ok) return finishWithError(finalResult, runToken);

    runtimeState = {
      ...runtimeState,
      busy: false,
      status: "done",
      phase: "done",
      message: "對話結束並已總結",
      transcript: engine.snapshot(),
      summary: finalResult.content,
    };
    await publishState(runToken);
    return runtimeState;
  }

  runtimeState = {
    ...runtimeState,
    busy: false,
    status: "waiting_for_user",
    phase: "waiting_for_user",
    message: "等待主人發言或選擇下一步...",
    transcript: engine.snapshot(),
  };
  await publishState(runToken);
  return runtimeState;
}

async function runSequentialProviderJobs(jobs, target, runToken) {
  for (const job of jobs) {
    runController.assertCurrent(runToken);
    const result = await sendJob(job, runToken);
    recordProviderResult(result, target, runToken);
    runtimeState = {
      ...runtimeState,
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
  }
}

async function runFastProviderJobs(jobs, target, runToken) {
  const submittedJobs = [];
  for (const job of jobs) {
    runController.assertCurrent(runToken);
    const submitted = await submitProviderJob(job, runToken);
    if (submitted.ok) {
      submittedJobs.push(submitted);
    } else {
      recordProviderResult(submitted, target, runToken);
    }
    runtimeState = {
      ...runtimeState,
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
  }

  for (const submitted of submittedJobs) {
    runController.assertCurrent(runToken);
    const result = await collectProviderJob(submitted, runToken);
    recordProviderResult(result, target, runToken);
    runtimeState = {
      ...runtimeState,
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
  }
}

function recordProviderResult(result, target, runToken) {
  runController.assertCurrent(runToken);
  if (result.ok && target === "answer") {
    engine.recordAnswer(result.provider, result.content);
  } else if (result.ok && target === "critique") {
    engine.recordCritique(result.provider, result.content, result.round);
  } else {
    engine.markProviderError(result.provider, result.phase, result.error || "unknown error");
    runtimeState.errors = [...runtimeState.errors, result];
  }
}

async function submitProviderJob(job, runToken) {
  try {
    runController.assertCurrent(runToken);
    await setProviderDiagnostic(job.provider, {
      stage: "opening-tab",
      phase: job.phase,
      error: "",
    }, runToken);
    const tab = await getOrCreateProviderTab(job.provider);
    await setProviderDiagnostic(job.provider, {
      stage: "activating-tab",
      phase: job.phase,
      tabId: tab.id,
      url: tab.url || tab.pendingUrl || "",
    }, runToken);
    await activateProviderTab(tab);
    runController.assertCurrent(runToken);

    const runId = createRunId(job);
    runtimeState = {
      ...runtimeState,
      message: `${providerLabel(job.provider)}：${phaseLabel(job.phase, job.round)}送出中`,
      providerTabs: { ...runtimeState.providerTabs, [job.provider]: tab.id },
    };
    runtimeState.providerDiagnostics = updateProviderDiagnostic(runtimeState.providerDiagnostics, job.provider, {
      stage: "submitting-prompt",
      phase: job.phase,
      tabId: tab.id,
      url: tab.url || tab.pendingUrl || "",
    });
    await publishState(runToken);

    const response = await sendProviderMessage(tab.id, job, "aiDebate:submitPrompt", { runId });
    runController.assertCurrent(runToken);
    if (!response?.ok) {
      throw new Error(response?.error || "provider submit failed");
    }

    await delay(500);
    runController.assertCurrent(runToken);

    await setProviderDiagnostic(job.provider, {
      stage: "submitted",
      phase: job.phase,
      tabId: tab.id,
      url: tab.url || tab.pendingUrl || "",
    }, runToken);
    return {
      ok: true,
      provider: job.provider,
      phase: job.phase,
      round: job.round,
      prompt: job.prompt,
      tabId: tab.id,
      runId: response.runId || runId,
    };
  } catch (error) {
    if (isRunCancelledError(error)) {
      throw error;
    }
    await setProviderDiagnostic(job.provider, {
      stage: "error",
      phase: job.phase,
      error: error.message,
    }, runToken);
    return {
      ok: false,
      provider: job.provider,
      phase: job.phase,
      round: job.round,
      error: error.message,
    };
  }
}

async function collectProviderJob(submitted, runToken) {
  try {
    runController.assertCurrent(runToken);
    const tab = await chrome.tabs.get(submitted.tabId);
    await setProviderDiagnostic(submitted.provider, {
      stage: "activating-tab",
      phase: submitted.phase,
      tabId: submitted.tabId,
      url: tab.url || tab.pendingUrl || "",
      error: "",
    }, runToken);
    await activateProviderTab(tab);
    runController.assertCurrent(runToken);

    runtimeState = {
      ...runtimeState,
      message: `${providerLabel(submitted.provider)}：等待${phaseLabel(submitted.phase, submitted.round)}`,
    };
    runtimeState.providerDiagnostics = updateProviderDiagnostic(runtimeState.providerDiagnostics, submitted.provider, {
      stage: "waiting-response",
      phase: submitted.phase,
      tabId: submitted.tabId,
      url: tab.url || tab.pendingUrl || "",
      error: "",
    });
    await publishState(runToken);

    const response = await sendProviderMessage(tab.id, submitted, "aiDebate:readSubmittedResponse", {
      runId: submitted.runId,
    });
    runController.assertCurrent(runToken);
    if (!response?.ok) {
      throw new Error(response?.error || "provider returned empty response");
    }

    await setProviderDiagnostic(submitted.provider, {
      stage: "received",
      phase: submitted.phase,
      tabId: submitted.tabId,
      url: tab.url || tab.pendingUrl || "",
    }, runToken);
    return {
      ok: true,
      provider: submitted.provider,
      phase: submitted.phase,
      round: submitted.round,
      content: response.content,
    };
  } catch (error) {
    if (isRunCancelledError(error)) {
      throw error;
    }
    await setProviderDiagnostic(submitted.provider, {
      stage: "error",
      phase: submitted.phase,
      tabId: submitted.tabId,
      error: error.message,
    }, runToken);
    return {
      ok: false,
      provider: submitted.provider,
      phase: submitted.phase,
      round: submitted.round,
      error: error.message,
    };
  }
}

async function sendJob(job, runToken) {
  try {
    runController.assertCurrent(runToken);
    await setProviderDiagnostic(job.provider, {
      stage: "opening-tab",
      phase: job.phase,
      error: "",
    }, runToken);
    const tab = await getOrCreateProviderTab(job.provider);
    await setProviderDiagnostic(job.provider, {
      stage: "activating-tab",
      phase: job.phase,
      tabId: tab.id,
      url: tab.url || tab.pendingUrl || "",
    }, runToken);
    await activateProviderTab(tab);
    runController.assertCurrent(runToken);
    runtimeState = {
      ...runtimeState,
      message: `${providerLabel(job.provider)}：${phaseLabel(job.phase, job.round)}`,
      providerTabs: { ...runtimeState.providerTabs, [job.provider]: tab.id },
    };
    runtimeState.providerDiagnostics = updateProviderDiagnostic(runtimeState.providerDiagnostics, job.provider, {
      stage: "waiting-response",
      phase: job.phase,
      tabId: tab.id,
      url: tab.url || tab.pendingUrl || "",
    });
    await publishState(runToken);

    const response = await sendProviderMessage(tab.id, job);
    runController.assertCurrent(runToken);
    if (!response?.ok) {
      throw new Error(response?.error || "provider returned empty response");
    }

    await setProviderDiagnostic(job.provider, {
      stage: "received",
      phase: job.phase,
    }, runToken);
    return {
      ok: true,
      provider: job.provider,
      phase: job.phase,
      round: job.round,
      content: response.content,
    };
  } catch (error) {
    if (isRunCancelledError(error)) {
      throw error;
    }
    await setProviderDiagnostic(job.provider, {
      stage: "error",
      phase: job.phase,
      error: error.message,
    }, runToken);
    return {
      ok: false,
      provider: job.provider,
      phase: job.phase,
      round: job.round,
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
    round: job.round,
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

async function finishWithError(result, runToken) {
  runController.assertCurrent(runToken);
  runtimeState = {
    ...runtimeState,
    busy: false,
    status: "error",
    phase: "done",
    message: result.error || result.message || "辯論失敗",
    transcript: engine.snapshot(),
    errors: [...runtimeState.errors, result],
  };
  await publishState(runToken);
  return runtimeState;
}

async function publishState(runToken) {
  if (runToken !== undefined) {
    runController.assertCurrent(runToken);
  }

  let stateToPublish = JSON.parse(JSON.stringify(runtimeState));
  await chrome.storage.local.set({ [STORAGE_KEY]: stateToPublish });

  if (runToken !== undefined && !runController.isCurrent(runToken)) {
    await chrome.storage.local.set({ [STORAGE_KEY]: runtimeState });
    stateToPublish = JSON.parse(JSON.stringify(runtimeState));
    runController.assertCurrent(runToken);
  }

  chrome.runtime.sendMessage({ type: "aiDebate:stateChanged", state: stateToPublish }).catch(() => {});
}

async function setProviderDiagnostic(providerId, patch, runToken) {
  if (runToken !== undefined) {
    runController.assertCurrent(runToken);
  }
  runtimeState = {
    ...runtimeState,
    providerDiagnostics: updateProviderDiagnostic(runtimeState.providerDiagnostics, providerId, patch),
  };
  await publishState(runToken);
}

async function getRuntimeState() {
  runtimeState = {
    ...runtimeState,
    entitlements: await getEntitlements(),
  };

  return runtimeState;
}

async function ensureRuntimeInitialized() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const recovered = recoverSession(stored?.[STORAGE_KEY], createIdleState);
      runtimeState = recovered.state;
      engine = recovered.engine || new DebateEngine();
      if (recovered.shouldPersist) {
        await publishState();
      }
    })().catch((error) => {
      initializationPromise = undefined;
      throw error;
    });
  }

  return initializationPromise;
}

async function getEntitlements() {
  const stored = await chrome.storage.local.get(ENTITLEMENT_STORAGE_KEY);
  return entitlementsForPlan(stored?.[ENTITLEMENT_STORAGE_KEY]);
}

async function requireProFeature(featureId) {
  const entitlements = await getEntitlements();
  if (canUseFeature(entitlements, featureId)) {
    return entitlements;
  }

  const error = new Error(proRequiredMessage(featureId));
  error.code = "PRO_REQUIRED";
  error.feature = featureId;
  error.name = `${featureLabel(featureId)}Locked`;
  throw error;
}

function phaseLabel(phase, round) {
  if (phase === "source-summary") {
    return "總結目前對話";
  }
  if (phase === "first-round") {
    return "回答原始問題";
  }
  if (String(phase).startsWith("critique")) {
    return `${critiqueRoundLabel(round || critiqueRoundFromPhase(phase), runtimeState.debateRounds)}：評析其他 AI`;
  }
  if (phase === "summary") {
    return "彙整總結";
  }
  return phase;
}

function critiqueRoundLabel(round, totalRounds = 1) {
  const normalizedRound = normalizeDebateRounds(round);
  const total = normalizeDebateRounds(totalRounds);
  return total > 1 ? `第 ${normalizedRound}/${total} 輪互評` : "第二輪";
}

function critiqueRoundFromPhase(phase) {
  const match = String(phase || "").match(/^critique(?:-(\d+))?$/);
  return normalizeDebateRounds(match?.[1] || 1);
}

function createRunId(job) {
  return `${job.provider}:${job.phase}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
