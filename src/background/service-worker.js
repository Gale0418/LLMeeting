import { DebateEngine, normalizeDebateRounds } from "./debateEngine.js";
import { isProviderTabReady, setSidePanelOpenOnActionClick } from "./chromeCompat.js";
import { createProviderDiagnostics, updateProviderDiagnostic } from "./diagnostics.js";
import { RunController, isRunCancelledError } from "./runController.js";
import { isSessionExpired, recoverSession } from "./sessionRecovery.js";
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
  isProviderId,
  normalizeProviderIds,
  providerLabel,
} from "../shared/providers.js";

const STORAGE_KEY = "aiDebate.currentState";
const PROVIDER_TIMEOUT_MS = 240000; // 4分鐘，防話癆
const SUMMARY_PROVIDER_TIMEOUT_MS = 480000; // 8分鐘，給長篇總結更多時間
const OVERLOAD_REFRESH_RETRIES = 3;
const META_INPUT_REFRESH_RETRIES = 1;

let engine = new DebateEngine();
let cachedEntitlements = entitlementsForPlan();
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
        await ensureRuntimeStateRetention();
        runController.cancel();
        await chrome.storage.local.remove(ENTITLEMENT_STORAGE_KEY);
        cachedEntitlements = entitlementsForPlan();
        engine = new DebateEngine();
        runtimeState = createIdleState(undefined, cachedEntitlements);
        await publishState();
        sendResponse({ ok: true, state: runtimeState });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message, state: runtimeState }));
    return true;
  }

  if (message.type === "aiDebate:clearLocalData") {
    ensureRuntimeInitialized()
      .then(async () => {
        await ensureRuntimeStateRetention();
        runController.cancel();
        await clearProviderSubmittedRuns();
        engine = new DebateEngine();
        runtimeState = createIdleState(undefined, runtimeState.entitlements);
        await chrome.storage.local.remove(STORAGE_KEY);
        chrome.runtime.sendMessage({
          type: "aiDebate:stateChanged",
          state: runtimeState,
        }).catch(() => {});
        sendResponse({ ok: true, state: runtimeState });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message, state: runtimeState }));
    return true;
  }

  if (message.type === "aiDebate:start") {
    const { question, mode = "basic", activeProviders, summaryProvider, summaryStrategy, debateRounds, skipSummary, customPersonas, hookedTabs, interactionStyle, interactiveMode } = message;
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
      .then(async () => {
        await ensureRuntimeStateRetention();
        if (runtimeState.busy) {
          throw new Error("目前已有辯論正在進行");
        }
        runToken = runController.start();
        return startAction(question, { activeProviders, summaryProvider, summaryStrategy, debateRounds, skipSummary, customPersonas, hookedTabs, interactionStyle, interactiveMode, runToken });
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
      .then(async () => {
        await ensureRuntimeStateRetention();
        validateNextRound(message.action);
        if (runtimeState.busy) {
          throw new Error("目前忙碌中");
        }
        runToken = runController.start();
        return handleNextRound(message.action, message.text, runToken);
      })
      .then((state) => sendResponse({ ok: state.status !== "error", state }))
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
        await ensureRuntimeStateRetention();
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

function createIdleState(providerIds = DEFAULT_ACTIVE_PROVIDER_IDS, entitlements = cachedEntitlements) {
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
    reveal: null,
    sourceProvider: "",
    sourceSummary: "",
    errors: [],
    activeProviders,
    summaryProvider: "chatgpt",
    summaryStrategy: "standard",
    debateRounds: 1,
    currentCritiqueRound: 0,
    entitlements,
    skipSummary: false,
    workflowCheckpoint: null,
    savedAt: Date.now(),
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
  await requireProFeature("chatMode");
  return startInteractiveDebate(question, {
    ...options,
    mode: "chat",
    openingMessage: "自由群聊開始：各就各位，準備送出第一句話",
  });
}

async function startTheaterDebate(question, options = {}) {
  await requireProFeature("chatMode");
  return startInteractiveDebate(question, {
    ...options,
    mode: "theater",
    openingMessage: "劇場大亂鬥：各就各位，準備送出第一句話",
    engineOptions: {
      isTheaterMode: true,
      customPersonas: options.customPersonas,
    },
  });
}

async function startInteractiveDebate(question, options = {}) {
  const runToken = options.runToken;
  runController.assertCurrent(runToken);
  const trimmedQuestion = String(question || "").trim();
  if (!trimmedQuestion) throw new Error("請先輸入問題");
  if (runtimeState.busy) throw new Error("目前已有辯論正在進行");

  const requestedProviders = normalizeProviderIds(options.activeProviders);
  const summarySetup = await prepareSummarySetup(requestedProviders, options);
  const activeProviders = summarySetup.debateProviders;
  const summaryProvider = summarySetup.resolvedSummaryProvider;
  const debateRounds = normalizeDebateRounds(options.debateRounds);
  const entitlements = await getEntitlements();
  runController.assertCurrent(runToken);
  engine = new DebateEngine(activeProviders, summaryProvider, debateRounds, {
    ...(options.engineOptions || {}),
    interactionStyle: options.interactionStyle,
    summaryStrategy: summarySetup.summaryStrategy,
    resolvedSummaryProvider: summaryProvider,
  });
  runtimeState = {
    ...createIdleState(activeProviders),
    busy: true,
    status: "running",
    mode: options.mode,
    phase: "first-round",
    message: options.openingMessage,
    question: trimmedQuestion,
    activeProviders,
    summaryProvider,
    summaryStrategy: summarySetup.summaryStrategy,
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

  // Free chat pauses after the initial answers so the user can join round 1.
  // Other interactive modes retain their existing answer -> critique flow.
  if (options.mode === "chat" && options.interactiveMode) {
    runtimeState = {
      ...runtimeState,
      busy: false,
      status: "waiting_for_user",
      phase: "waiting_for_user",
      message: "等待使用者發言或選擇下一步...",
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
    return runtimeState;
  }

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
      message: "等待使用者發言或選擇下一步...",
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
    return runtimeState;
  }

  if (engine.interactionStyle === "imposter") {
    return finishImposterReveal(runToken);
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

  const finalResult = await sendJob(buildRuntimeFinalJob(), runToken);
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

function normalizeSummaryStrategy(value = "standard") {
  return ["standard", "observerChair", "anonymousReview"].includes(value) ? value : "standard";
}

async function requireSummaryStrategyFeature(summaryStrategy) {
  if (summaryStrategy === "observerChair") {
    await requireProFeature("observerChair");
  } else if (summaryStrategy === "anonymousReview") {
    await requireProFeature("anonymousReview");
  }
}

function resolveRandomProvider(candidates) {
  if (!Array.isArray(candidates) || candidates.length < 1) {
    throw new Error("請至少勾選 1 家 AI 才能隨機抽主席。");
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function resolveSummaryProvider(summaryProvider, candidates) {
  const requestedProvider = summaryProvider || "chatgpt";
  if (requestedProvider === "random") {
    return resolveRandomProvider(candidates);
  }
  if (!isProviderId(requestedProvider)) {
    throw new Error(`Unknown provider: ${requestedProvider}`);
  }
  if (!candidates.includes(requestedProvider)) {
    throw new Error(`${providerLabel(requestedProvider)} 未勾選；請勾選後再讓它擔任主席，或改選隨機主席。`);
  }
  return requestedProvider;
}

async function prepareSummarySetup(requestedProviders, options = {}) {
  const summaryStrategy = normalizeSummaryStrategy(options.summaryStrategy);
  await requireSummaryStrategyFeature(summaryStrategy);

  const resolvedSummaryProvider = resolveSummaryProvider(options.summaryProvider, requestedProviders);
  let debateProviders = [...requestedProviders];
  if (summaryStrategy === "observerChair") {
    if (requestedProviders.length < 3) {
      throw new Error("圍觀主席制至少需勾選 3 家 AI，扣掉主席後才有 2 家能辯論。");
    }
    debateProviders = requestedProviders.filter((providerId) => providerId !== resolvedSummaryProvider);
    if (debateProviders.length < 2) {
      throw new Error("圍觀主席制至少需勾選 3 家 AI，且主席必須來自已勾選 AI。");
    }
  }

  return {
    summaryStrategy,
    resolvedSummaryProvider,
    debateProviders,
  };
}

function buildRuntimeFinalJob() {
  return {
    ...engine.buildFinalJob(),
    forceNewTab: runtimeState.summaryStrategy === "anonymousReview",
  };
}

async function finishImposterReveal(runToken) {
  runController.assertCurrent(runToken);
  const reveal = engine.buildReveal();
  runtimeState = {
    ...runtimeState,
    busy: true,
    status: "running",
    phase: "reveal",
    message: "揭曉輪：公開本局真正的內鬼狀態，等待各 AI 回應",
    transcript: engine.snapshot(),
    reveal,
    summary: reveal.content,
  };
  await publishState(runToken);

  // 揭曉真相後，讓每一位 active participant 都收到同一個揭曉輪 prompt。
  // 沿用 fast scheduler 的逐一收回與既有錯誤容錯，單一 AI 失敗不會中斷其餘參與者。
  const revealJobs = engine.buildRevealJobs();
  await runFastProviderJobs(revealJobs, "reveal", runToken);

  runtimeState = {
    ...runtimeState,
    busy: false,
    status: "done",
    phase: "reveal",
    message: "揭曉完成：已收集各 AI 的揭曉反應",
    transcript: engine.snapshot(),
    reveal: engine.snapshot().reveal,
    summary: reveal.content,
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

  const requestedProviders = normalizeProviderIds(options.activeProviders);
  const summarySetup = await prepareSummarySetup(requestedProviders, options);
  const activeProviders = summarySetup.debateProviders;
  const summaryProvider = summarySetup.resolvedSummaryProvider;
  const entitlements = await getEntitlements();
  runController.assertCurrent(runToken);
  const mode = options.mode || "basic";
  const scheduler = options.scheduler || "sequential";
  const debateRounds = normalizeDebateRounds(options.debateRounds);

  engine = new DebateEngine(activeProviders, summaryProvider, debateRounds, {
    interactionStyle: options.interactionStyle,
    summaryStrategy: summarySetup.summaryStrategy,
    resolvedSummaryProvider: summaryProvider,
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
    summaryStrategy: summarySetup.summaryStrategy,
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
  const summaryStrategy = normalizeSummaryStrategy(options.summaryStrategy);
  await requireSummaryStrategyFeature(summaryStrategy);
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
    summaryStrategy,
    resolvedSummaryProvider: sourceProvider,
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
    summaryStrategy,
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
      message: "等待使用者發言或選擇下一步...",
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
    return runtimeState;
  }

  if (engine.interactionStyle === "imposter") {
    return finishImposterReveal(runToken);
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

  const finalResult = await sendJob(buildRuntimeFinalJob(), runToken);
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
  validateNextRound(action);

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
      message: `送出使用者的補充發言`,
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
    if (engine.interactionStyle === "imposter") {
      return finishImposterReveal(runToken);
    }
    runtimeState = {
      ...runtimeState,
      phase: "summary",
      message: `請 ${providerLabel(runtimeState.summaryProvider)} 總結`,
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
    const finalResult = await sendJob(buildRuntimeFinalJob(), runToken);
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
    message: "等待使用者發言或選擇下一步...",
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
  } else if (result.ok && target === "reveal") {
    engine.recordReveal(result.provider, result.content);
  } else {
    engine.markProviderError(
      result.provider,
      result.phase,
      result.error || "unknown error",
      result.errorContent || "",
    );
    if (target === "reveal") {
      engine.recordReveal(
        result.provider,
        `[服務狀態：${result.error || "unknown error"}] 揭曉反應無法取得。`,
      );
    }
    runtimeState.errors = [...runtimeState.errors, result];
  }
}

async function submitProviderJob(job, runToken, metaInputRetryCount = 0) {
  let tab;
  try {
    runController.assertCurrent(runToken);
    await setProviderDiagnostic(job.provider, {
      stage: "opening-tab",
      phase: job.phase,
      error: "",
    }, runToken);
    tab = await getOrCreateProviderTab(job.provider, { forceNewTab: Boolean(job.forceNewTab) });
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
      workflowCheckpoint: createWorkflowCheckpoint("submitting", job, {
        tabId: tab.id,
        runId,
      }),
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
      throw providerResponseError(response, "provider submit failed");
    }

    await delay(500);
    runController.assertCurrent(runToken);

    await setProviderDiagnostic(job.provider, {
      stage: "submitted",
      phase: job.phase,
      tabId: tab.id,
      url: tab.url || tab.pendingUrl || "",
    }, runToken);
    runtimeState = {
      ...runtimeState,
      workflowCheckpoint: createWorkflowCheckpoint("submitted", job, {
        tabId: tab.id,
        runId: response.runId || runId,
      }),
    };
    await publishState(runToken);
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
    if (shouldRefreshMetaInput(error, job, tab, metaInputRetryCount)) {
      try {
        await refreshMetaInputProvider(tab.id, job, runToken);
        return await submitProviderJob(
          { ...job, forceNewTab: false },
          runToken,
          metaInputRetryCount + 1,
        );
      } catch (retryError) {
        if (isRunCancelledError(retryError)) {
          throw retryError;
        }
        error = retryError;
      }
    }
    await setProviderDiagnostic(job.provider, {
      stage: "error",
      phase: job.phase,
      error: error.message,
    }, runToken);
    runtimeState = { ...runtimeState, workflowCheckpoint: null };
    await publishState(runToken);
    return {
      ok: false,
      provider: job.provider,
      phase: job.phase,
      round: job.round,
      code: error.code || "PROVIDER_AUTOMATION_FAILED",
      error: error.message,
      errorContent: error.providerContent || "",
    };
  }
}

async function collectProviderJob(submitted, runToken, overloadRetryCount = 0) {
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
      workflowCheckpoint: createWorkflowCheckpoint("collecting", submitted, {
        tabId: submitted.tabId,
        runId: submitted.runId,
      }),
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
      throw providerResponseError(response, "provider returned empty response");
    }

    await setProviderDiagnostic(submitted.provider, {
      stage: "received",
      phase: submitted.phase,
      tabId: submitted.tabId,
      url: tab.url || tab.pendingUrl || "",
    }, runToken);
    runtimeState = { ...runtimeState, workflowCheckpoint: null };
    await publishState(runToken);
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
    if (error.code === "PROVIDER_OVERLOADED" && overloadRetryCount < OVERLOAD_REFRESH_RETRIES) {
      try {
        await refreshOverloadedProvider(
          submitted.tabId,
          submitted,
          overloadRetryCount + 1,
          runToken,
        );
        return await sendJob(
          { ...submitted, forceNewTab: false },
          runToken,
          overloadRetryCount + 1,
        );
      } catch (retryError) {
        if (isRunCancelledError(retryError)) {
          throw retryError;
        }
        error = retryError;
      }
    }
    await setProviderDiagnostic(submitted.provider, {
      stage: "error",
      phase: submitted.phase,
      tabId: submitted.tabId,
      error: formatProviderFailure(error),
    }, runToken);
    runtimeState = { ...runtimeState, workflowCheckpoint: null };
    await publishState(runToken);
    return {
      ok: false,
      provider: submitted.provider,
      phase: submitted.phase,
      round: submitted.round,
      code: error.code || "PROVIDER_AUTOMATION_FAILED",
      error: error.message,
      errorContent: error.providerContent || "",
    };
  }
}

async function sendJob(job, runToken, overloadRetryCount = 0, metaInputRetryCount = 0) {
  let tab;
  try {
    runController.assertCurrent(runToken);
    await setProviderDiagnostic(job.provider, {
      stage: "opening-tab",
      phase: job.phase,
      error: "",
    }, runToken);
    tab = await getOrCreateProviderTab(job.provider, { forceNewTab: Boolean(job.forceNewTab) });
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
      workflowCheckpoint: createWorkflowCheckpoint("send-and-read", job, {
        tabId: tab.id,
      }),
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
      throw providerResponseError(response, "provider returned empty response");
    }

    await setProviderDiagnostic(job.provider, {
      stage: "received",
      phase: job.phase,
    }, runToken);
    runtimeState = { ...runtimeState, workflowCheckpoint: null };
    await publishState(runToken);
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
    if (
      error.code === "PROVIDER_OVERLOADED" &&
      overloadRetryCount < OVERLOAD_REFRESH_RETRIES &&
      typeof tab?.id === "number"
    ) {
      try {
        await refreshOverloadedProvider(tab.id, job, overloadRetryCount + 1, runToken);
        return await sendJob(
          { ...job, forceNewTab: false },
          runToken,
          overloadRetryCount + 1,
          metaInputRetryCount,
        );
      } catch (retryError) {
        if (isRunCancelledError(retryError)) {
          throw retryError;
        }
        error = retryError;
      }
    }
    if (shouldRefreshMetaInput(error, job, tab, metaInputRetryCount)) {
      try {
        await refreshMetaInputProvider(tab.id, job, runToken);
        return await sendJob(
          { ...job, forceNewTab: false },
          runToken,
          overloadRetryCount,
          metaInputRetryCount + 1,
        );
      } catch (retryError) {
        if (isRunCancelledError(retryError)) {
          throw retryError;
        }
        error = retryError;
      }
    }
    await setProviderDiagnostic(job.provider, {
      stage: "error",
      phase: job.phase,
      error: formatProviderFailure(error),
    }, runToken);
    runtimeState = { ...runtimeState, workflowCheckpoint: null };
    await publishState(runToken);
    return {
      ok: false,
      provider: job.provider,
      phase: job.phase,
      round: job.round,
      code: error.code || "PROVIDER_AUTOMATION_FAILED",
      error: error.message,
      errorContent: error.providerContent || "",
    };
  }
}

async function getActiveProviderTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const provider = PROVIDERS.find((item) => isProviderTabReady(tab, item));
  if (!provider) {
    throw new Error("請先切到要當作來源的 ChatGPT、Gemini、Grok、Claude 或 Meta AI 對話分頁，再按總結辯論。");
  }

  return { tab, provider };
}

async function getOrCreateProviderTab(providerId, options = {}) {
  const provider = PROVIDERS.find((item) => item.id === providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  const boundTabId = runtimeState.providerTabs?.[providerId];
  if (!options.forceNewTab && typeof boundTabId === "number") {
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

async function refreshOverloadedProvider(tabId, job, attempt, runToken) {
  runController.assertCurrent(runToken);
  runtimeState = {
    ...runtimeState,
    message: `${providerLabel(job.provider)} 服務超載，自動重新整理重試 ${attempt}/${OVERLOAD_REFRESH_RETRIES}`,
    workflowCheckpoint: createWorkflowCheckpoint("overload-refresh", job, {
      tabId,
      retryAttempt: attempt,
    }),
  };
  await setProviderDiagnostic(job.provider, {
    stage: "overload-refresh",
    phase: job.phase,
    tabId,
    error: `自動重新整理重試 ${attempt}/${OVERLOAD_REFRESH_RETRIES}`,
  }, runToken);
  await chrome.tabs.reload(tabId);
  const provider = PROVIDERS.find((item) => item.id === job.provider);
  await waitForProviderTab(tabId, provider);
  await delay(1000);
  runController.assertCurrent(runToken);
}

function shouldRefreshMetaInput(error, job, tab, retryCount) {
  return job.provider === "meta" &&
    error.code === "PROVIDER_INPUT_WRITE_FAILED" &&
    retryCount < META_INPUT_REFRESH_RETRIES &&
    typeof tab?.id === "number";
}

async function refreshMetaInputProvider(tabId, job, runToken) {
  runController.assertCurrent(runToken);
  runtimeState = {
    ...runtimeState,
    message: `${providerLabel(job.provider)} 輸入框狀態異常，自動重新整理後重試`,
    workflowCheckpoint: createWorkflowCheckpoint("meta-input-refresh", job, { tabId }),
  };
  await setProviderDiagnostic(job.provider, {
    stage: "meta-input-refresh",
    phase: job.phase,
    tabId,
    error: "輸入框狀態異常，自動重新整理後重試",
  }, runToken);
  await chrome.tabs.reload(tabId);
  const provider = PROVIDERS.find((item) => item.id === job.provider);
  await waitForProviderTab(tabId, provider);
  await delay(1000);
  runController.assertCurrent(runToken);
}

async function sendProviderMessage(tabId, job, type = "aiDebate:sendAndRead", extra = {}) {
  const payload = {
    type,
    provider: job.provider,
    phase: job.phase,
    round: job.round,
    prompt: job.prompt,
    timeoutMs: getProviderTimeoutMs(job.phase),
    ...extra,
  };

  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (_error) {
    const tab = await chrome.tabs.get(tabId);
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [
          "src/content/automation-core.js",
          "src/content/provider-adapters.js",
          "src/content/provider-page.js",
        ],
      });
      return await chrome.tabs.sendMessage(tabId, payload);
    } catch (error) {
      throw new Error(`${error.message}（目前網址：${tab.url || tab.pendingUrl || "unknown"}）`);
    }
  }
}

function getProviderTimeoutMs(phase) {
  return phase === "summary" || phase === "source-summary"
    ? SUMMARY_PROVIDER_TIMEOUT_MS
    : PROVIDER_TIMEOUT_MS;
}

async function clearProviderSubmittedRuns() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(async (tab) => {
    if (typeof tab.id !== "number") {
      return;
    }
    const provider = PROVIDERS.find((item) => isProviderTabReady(tab, item));
    if (!provider) {
      return;
    }
    try {
      await sendProviderMessage(tab.id, {
        provider: provider.id,
        phase: "clear",
        round: 0,
        prompt: "",
      }, "aiDebate:clearSubmittedRuns");
    } catch (_error) {
      // A closed or changing provider tab must not block local data deletion.
    }
  }));
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

  if (!Number.isFinite(runtimeState.savedAt)) {
    runtimeState = {
      ...runtimeState,
      savedAt: Date.now(),
    };
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
  await ensureRuntimeStateRetention();
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
      cachedEntitlements = runtimeState.entitlements || cachedEntitlements;
      engine = recovered.engine || new DebateEngine();
      if (recovered.shouldPersist || !Number.isFinite(runtimeState.savedAt)) {
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
  try {
    const stored = await chrome.storage.local.get(ENTITLEMENT_STORAGE_KEY);
    const entitlements = entitlementsForPlan(stored?.[ENTITLEMENT_STORAGE_KEY]);
    cachedEntitlements = entitlements;
    return entitlements;
  } catch (_error) {
    return runtimeState.entitlements || cachedEntitlements || entitlementsForPlan();
  }
}

async function ensureRuntimeStateRetention() {
  if (!isSessionExpired(runtimeState)) {
    return;
  }

  const recovered = recoverSession(runtimeState, createIdleState);
  runtimeState = recovered.state;
  cachedEntitlements = runtimeState.entitlements || cachedEntitlements;
  engine = new DebateEngine();
  await publishState();
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

function validateNextRound(action) {
  if (runtimeState.phase !== "waiting_for_user") {
    throw new Error("目前沒有等待下一步的互動辯論");
  }
  if (runtimeState.mode !== "chat" && runtimeState.mode !== "theater" && runtimeState.mode !== "summary") {
    throw new Error("只有自由群聊、劇場模式與總結辯論支援此操作");
  }
  if (!["user_message", "critique", "summarize"].includes(action)) {
    throw new Error(`未知的操作: ${action}`);
  }
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
  return total > 1 ? `第 ${normalizedRound}/${total} 輪互評` : "互評";
}

function critiqueRoundFromPhase(phase) {
  const match = String(phase || "").match(/^critique(?:-(\d+))?$/);
  return normalizeDebateRounds(match?.[1] || 1);
}

function createRunId(job) {
  return `${job.provider}:${job.phase}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function providerResponseError(response, fallbackMessage) {
  const error = new Error(response?.error || fallbackMessage);
  error.code = response?.code || "PROVIDER_AUTOMATION_FAILED";
  error.providerContent = response?.providerContent || "";
  return error;
}

function formatProviderFailure(error) {
  return error?.code ? `[${error.code}] ${error.message}` : error.message;
}

function createWorkflowCheckpoint(stage, job, extra = {}) {
  return {
    stage,
    provider: job.provider,
    phase: job.phase,
    round: job.round || null,
    updatedAt: Date.now(),
    ...extra,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
