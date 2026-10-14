import { DebateEngine, normalizeDebateRounds } from "./debateEngine.js";
import { isProviderTabReady, setSidePanelOpenOnActionClick } from "./chromeCompat.js";
import { createProviderDiagnostics, updateProviderDiagnostic } from "./diagnostics.js";
import { RunController, isRunCancelledError } from "./runController.js";
import { createStateStorageQueue, safePersistState } from "./statePersistence.js";
import { isSessionExpired, recoverSession } from "./sessionRecovery.js";
import {
  canUseFeature,
  ENTITLEMENT_STORAGE_KEY,
  SHEEP_MODE_STORAGE_KEY,
  entitlementsForPlan,
  featureLabel,
  proRequiredMessage,
} from "../shared/entitlements.js";
import { buildConversationSummaryPrompt } from "../shared/prompts.js";
import { normalizeRoundNumber } from "../shared/text.js";
import { isRecoverableReply, MAX_MANUAL_REPLY_CHARS, pendingReplyRepairs } from "../shared/meetingRecovery.js";
import { buildRoundZero, linkedContextProviders } from "../shared/roundZero.js";
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
// A provider fault now waits for a manual reply; never refresh and resend it.
const OVERLOAD_REFRESH_RETRIES = 0;
const META_INPUT_REFRESH_RETRIES = 0;
const READINESS_TIMEOUT_MS = 15000;
const PROVIDER_CONTROL_TIMEOUT_MS = 3000;
const RESPONSE_POLL_BUDGET_MS = 12000;
const MAX_PERSISTED_TRANSCRIPT_CHARS = 120000;
const MAX_PERSISTED_TEXT_CHARS = 12000;
const MAX_DEBUG_EVENTS = 100;
const SAFE_DEBUG_DETAIL_KEYS = new Set([
  "reason", "editorTag", "expectedLength", "actualLength", "expectedLines",
  "actualLines", "firstMismatch", "connected", "focused", "selectionInside",
  "expectedUserTurns", "actualUserTurns",
]);

let engine = new DebateEngine();
let cachedEntitlements = entitlementsForPlan();
let runtimeState = createIdleState();
const runController = new RunController();
let initializationPromise;
let lifecycleRevision = 0;
let controlOperation = null;
const enqueueStateStorage = createStateStorageQueue();

function beginControlOperation(kind) {
  if (controlOperation) {
    return null;
  }
  runController.cancel();
  controlOperation = { kind, revision: ++lifecycleRevision };
  return controlOperation;
}

function isCurrentControlOperation(operation) {
  return Boolean(operation && controlOperation === operation && operation.revision === lifecycleRevision);
}

function assertCurrentControlOperation(operation) {
  if (isCurrentControlOperation(operation)) return;
  const error = new Error("本次會議已停止");
  error.code = "RUN_CANCELLED";
  throw error;
}

function finishControlOperation(operation) {
  if (isCurrentControlOperation(operation)) {
    controlOperation = null;
  }
}

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

  if (message.type === "aiDebate:departProvider") {
    ensureRuntimeInitialized()
      .then(async () => {
        await ensureRuntimeStateRetention();
        if (runtimeState.busy || controlOperation || runController.isReserved()) {
          throw new Error("目前流程執行中，暫時不能讓 AI 離席。");
        }
        const transcript = runtimeState.transcript;
        if (!transcript || message.sessionId !== transcript.sessionId || !isProviderId(message.provider) ||
            !(runtimeState.activeProviders?.includes(message.provider) || runtimeState.summaryProvider === message.provider ||
              runtimeState.sourceProvider === message.provider) ||
            (runtimeState.departedProviders || []).includes(message.provider)) {
          throw new Error("會議或參與者已變更，請重新整理故障格後再試。");
        }
        const fault = pendingReplyRepairs(runtimeState).find((repair) =>
          repair.provider === message.provider && repair.phase === message.phase && repair.content === message.expectedContent,
        );
        if (!fault || typeof message.expectedContent !== "string") {
          throw new Error("找不到對應的故障回覆，請重新整理故障格後再試。");
        }

        if (engine.activeProviders.includes(message.provider)) {
          engine.departProvider(message.provider);
        } else {
          // Summary mode's source provider is outside the debate roster but can
          // still have a recoverable source-summary failure in this session.
          runtimeState.departures = [...(runtimeState.departures || []), { provider: message.provider, departedAt: Date.now() }];
        }
        const departedProviders = [...new Set([...(runtimeState.departedProviders || []), message.provider])];
        const nextSummaryProvider = engine.participatingProviders.find((provider) => provider === engine.summaryProvider)
          || engine.participatingProviders[0];
        if (nextSummaryProvider) {
          engine.summaryProvider = nextSummaryProvider;
          engine.resolvedSummaryProvider = nextSummaryProvider;
          engine.state.summaryProvider = nextSummaryProvider;
          engine.state.resolvedSummaryProvider = nextSummaryProvider;
        }

        const pause = runtimeState.repairPause;
        let repairPause = pause ? {
          ...pause,
          remainingJobs: (pause.remainingJobs || []).filter((job) => job.provider !== message.provider),
        } : null;
        if (repairPause?.target === "summary" && message.provider === transcript.resolvedSummaryProvider &&
            runtimeState.summaryStrategy !== "allAnonymous" && nextSummaryProvider) {
          repairPause = { ...repairPause, remainingJobs: [engine.buildFinalJob()] };
        }
        const nextTranscript = engine.snapshot();
        runtimeState = {
          ...runtimeState,
          departedProviders,
          summaryProvider: nextSummaryProvider || runtimeState.summaryProvider,
          transcript: nextTranscript,
          repairPause,
          providerDiagnostics: updateProviderDiagnostic(runtimeState.providerDiagnostics, message.provider, {
            stage: "departed", error: "", phase: fault.phase,
          }),
        };
        if (engine.participatingProviders.length === 0) {
          runtimeState = {
            ...runtimeState, busy: false, status: "done", phase: "done", repairPause: null,
            message: "所有 AI 均已離席；本場已安全結束，歷史紀錄仍保留。",
          };
          await publishState();
          sendResponse({ ok: true, state: runtimeState });
          return;
        }
        if (engine.participatingProviders.length === 1 && pendingReplyRepairs(runtimeState).length === 0) {
          runtimeState = {
            ...runtimeState, busy: false, status: "done", phase: "done", repairPause: null, summary: "",
            message: "本場僅剩一位 AI 在席，已保留現有紀錄並安全結束。",
          };
          await publishState();
          sendResponse({ ok: true, state: runtimeState });
          return;
        }
        if (repairPause && pendingReplyRepairs(runtimeState).length === 0) {
          if (repairPause.target === "source-summary" ||
              (repairPause.resumePlan?.type === "source-summary" && departedProviders.includes(runtimeState.sourceProvider))) {
            runtimeState = {
              ...runtimeState, repairPause: null, busy: false, status: "done", phase: "done",
              message: "來源摘要提供者已離席，已安全結束本場並保留歷史紀錄。",
            };
            await publishState();
            sendResponse({ ok: true, state: runtimeState });
            return;
          }
          const token = runController.reserve();
          if (token) {
            await publishState();
            sendResponse({ ok: true, state: runtimeState, autoResuming: true });
            resumeRepairedMeeting(token)
              .catch(async (error) => {
                if (isRunCancelledError(error) || !runController.isCurrent(token)) return;
                runtimeState = { ...runtimeState, busy: false, status: "error", phase: "done", message: `離席後接續流程失敗：${error.message}` };
                await publishState(token);
              })
              .finally(() => runController.release(token));
            return;
          }
        }
        await publishState();
        sendResponse({ ok: true, state: runtimeState });
      })
      .catch((error) => sendResponse({ ok: false, code: error.code || "DEPART_REJECTED", error: error.message, state: runtimeState }));
    return true;
  }

  if (["aiDebate:captureLinkedReplies", "aiDebate:repairReply"].includes(message.type)) {
    if (message.type === "aiDebate:captureLinkedReplies" && (runtimeState.repairPause || pendingReplyRepairs(runtimeState).length)) {
      sendResponse({ ok: false, error: "請先補齊故障回覆並繼續原流程，或重置目前會議。", state: runtimeState });
      return true;
    }
    if (runtimeState.busy || controlOperation || runController.isReserved()) {
      sendResponse({ ok: false, code: "BUSY", error: "請等目前流程結束後再操作。", state: runtimeState });
      return true;
    }
    const token = runController.reserve();
    const revision = lifecycleRevision;
    let repairResponseSent = false;
    ensureRuntimeInitialized()
      .then(async () => {
        await ensureRuntimeStateRetention();
        runController.assertCurrent(token);
        if (controlOperation || lifecycleRevision !== revision) throw createRunCancelledError();
        if (message.type === "aiDebate:captureLinkedReplies") {
          return { ok: true, replies: await captureLinkedReplies(message, token) };
        }
        const result = await repairMeetingReply(message, token);
        if (runtimeState.repairPause && pendingReplyRepairs(runtimeState).length === 0) {
          validateNextRound("resume");
          // Acknowledge the saved paste promptly while this worker keeps ownership
          // of the resumed run, even if the sidepanel is closed.
          const continuation = resumeRepairedMeeting(token);
          repairResponseSent = true;
          sendResponse({ ...result, autoResuming: true, state: runtimeState });
          await continuation;
          return null;
        }
        return result;
      })
      .then((result) => { if (!repairResponseSent) sendResponse(result); })
      .catch(async (error) => {
        if (!repairResponseSent) {
          sendResponse({ ok: false, code: error.code || "RECOVERY_FAILED", error: error.message, state: runtimeState });
          return;
        }
        if (isRunCancelledError(error) || !runController.isCurrent(token) || lifecycleRevision !== revision) return;
        runtimeState = { ...runtimeState, busy: false, status: "error", phase: "done",
          message: `回覆已保存，但接續流程失敗：${error.message}` };
        await publishState(token);
      })
      .finally(() => runController.release(token));
    return true;
  }

  if (message.type === "aiDebate:reset") {
    const operation = beginControlOperation("reset");
    if (!operation) {
      sendResponse({ ok: false, code: "BUSY", error: "目前已有控制操作正在進行", state: runtimeState });
      return true;
    }
    ensureRuntimeInitialized()
      .then(async () => {
        await ensureRuntimeStateRetention();
        assertCurrentControlOperation(operation);
        await notifyProviderAbortOperations({ tabIds: Object.values(runtimeState.providerTabs || {}) });
        assertCurrentControlOperation(operation);
        await chrome.storage.local.remove(ENTITLEMENT_STORAGE_KEY);
        await chrome.storage.local.remove(SHEEP_MODE_STORAGE_KEY);
        cachedEntitlements = entitlementsForPlan();
        engine = new DebateEngine();
        runtimeState = createIdleState(undefined, cachedEntitlements);
        await publishState(undefined, operation);
        finishControlOperation(operation);
        sendResponse({ ok: true, state: runtimeState });
      })
      .catch((error) => {
        const cancelled = !isCurrentControlOperation(operation) || isRunCancelledError(error);
        finishControlOperation(operation);
        sendResponse({ ok: false, code: cancelled ? "RUN_CANCELLED" : error.code, error: cancelled ? "本次會議已停止" : error.message, state: runtimeState });
      });
    return true;
  }

  if (message.type === "aiDebate:clearLocalData") {
    const operation = beginControlOperation("clear");
    if (!operation) {
      sendResponse({ ok: false, code: "BUSY", error: "目前已有控制操作正在進行", state: runtimeState });
      return true;
    }
    ensureRuntimeInitialized()
      .then(async () => {
        await ensureRuntimeStateRetention();
        assertCurrentControlOperation(operation);
        await notifyProviderAbortOperations({ clearSubmittedRuns: true });
        assertCurrentControlOperation(operation);
        engine = new DebateEngine();
        runtimeState = createIdleState(undefined, runtimeState.entitlements);
        await enqueueStateStorage(() => chrome.storage.local.remove(STORAGE_KEY));
        assertCurrentControlOperation(operation);
        chrome.runtime.sendMessage({
          type: "aiDebate:stateChanged",
          state: runtimeState,
        }).catch(() => {});
        finishControlOperation(operation);
        sendResponse({ ok: true, state: runtimeState });
      })
      .catch((error) => {
        const cancelled = !isCurrentControlOperation(operation) || isRunCancelledError(error);
        finishControlOperation(operation);
        sendResponse({ ok: false, code: cancelled ? "RUN_CANCELLED" : error.code, error: cancelled ? "本次會議已停止" : error.message, state: runtimeState });
      });
    return true;
  }

  if (message.type === "aiDebate:start") {
    let responseSent = false;
    const replyStart = (response) => {
      if (responseSent) return;
      responseSent = true;
      sendResponse(response);
    };
    const { question, mode = "fast", activeProviders, summaryProvider, summaryStrategy, debateRounds, skipSummary, customPersonas, hookedTabs, interactionStyle, interactiveMode } = message;
    const startAction = {
      basic: startFastDebate, // Compatibility for older panels; new runs use Fast.
      fast: startFastDebate,
      summary: startSummaryDebate,
      chat: startChatDebate,
      theater: startTheaterDebate,
    }[mode];

    if (!startAction) {
      replyStart({ ok: false, error: `Unknown debate mode: ${mode}`, state: runtimeState });
      return false;
    }

    let reservationToken;
    let runToken;
    let preflight;
    if (runtimeState.busy || runController.isReserved() || controlOperation) {
      replyStart({ ok: false, code: "BUSY", error: "目前已有辯論正在進行", state: runtimeState });
      return true;
    }
    reservationToken = runController.reserve();
    const startRevision = lifecycleRevision;
    ensureRuntimeInitialized()
      .then(async () => {
        await ensureRuntimeStateRetention();
        runController.assertCurrent(reservationToken);
        if (controlOperation || lifecycleRevision !== startRevision) {
          throw createRunCancelledError();
        }
        if (runtimeState.busy || (runController.isReserved() && !runController.isCurrent(reservationToken))) {
          throw new Error("目前已有辯論正在進行");
        }
        await validateStartRequestBeforePreflight(message);
        runController.assertCurrent(reservationToken);
        if (controlOperation || lifecycleRevision !== startRevision) {
          throw createRunCancelledError();
        }
        const initialContext = await collectLinkedRoundZero(message, reservationToken);
        runController.assertCurrent(reservationToken);
        if (controlOperation || lifecycleRevision !== startRevision) throw createRunCancelledError();
        preflight = await preflightStartRequest(message, reservationToken);
        runController.assertCurrent(reservationToken);
        if (controlOperation || lifecycleRevision !== startRevision) {
          throw createRunCancelledError();
        }
        runtimeState = {
          ...runtimeState,
          busy: true,
          status: "running",
          phase: "preflight-complete",
          message: initialContext?.roundZero ? "第 0 輪對話已收集，準備分享給參與 AI。" : "模型已就緒，準備啟航",
          providerTabs: { ...runtimeState.providerTabs, ...preflight.providerTabs },
          preflightResults: preflight.results,
        };
        await publishState(reservationToken);
        runToken = runController.claim(reservationToken);
        const execution = startAction(initialContext?.question ?? question, { activeProviders, summaryProvider, summaryStrategy, debateRounds, skipSummary, customPersonas, hookedTabs, interactionStyle, interactiveMode, preflight, runToken, roundZero: initialContext?.roundZero });
        replyStart({ ok: true, accepted: true, state: runtimeState });
        return execution;
      })
      .then((state) => replyStart({ ok: true, state }))
      .catch(async (error) => {
        if (reservationToken && !runToken && (!runController.isCurrent(reservationToken) || lifecycleRevision !== startRevision)) {
          replyStart({ ok: false, code: "RUN_CANCELLED", error: "本次會議已停止", state: runtimeState });
          return;
        }
        if (!runToken) {
          if (!reservationToken || !runController.isCurrent(reservationToken) || lifecycleRevision !== startRevision) {
            replyStart({ ok: false, code: "RUN_CANCELLED", error: "本次會議已停止", state: runtimeState });
            return;
          }
          if (runtimeState.repairPause || pendingReplyRepairs(runtimeState).length) {
            runController.release(reservationToken);
            replyStart({ ok: false, code: "REPAIR_REQUIRED", error: error.message, state: runtimeState });
            return;
          }
          runtimeState = {
            ...runtimeState,
            busy: false,
            status: "idle",
            phase: "idle",
            message: error.message,
            preflightResults: error.results || preflight?.results || runtimeState.preflightResults || [],
          };
          try {
            await publishState(reservationToken);
          } catch (publishError) {
            replyStart({ ok: false, code: "RUN_CANCELLED", error: publishError.message, state: runtimeState });
            return;
          }
          runController.release(reservationToken);
          replyStart({ ok: false, code: error.code || "ERROR", error: error.message, results: runtimeState.preflightResults, state: runtimeState });
          return;
        }
        if (isRunCancelledError(error) || (runToken && !runController.isCurrent(runToken))) {
          replyStart({ ok: false, code: "RUN_CANCELLED", error: "本次會議已停止", state: runtimeState });
          return;
        }

        const isProRequired = error.code === "PRO_REQUIRED";
        const entitlements = await getEntitlements();
        if (runToken && (!runController.isCurrent(runToken) || lifecycleRevision !== startRevision || controlOperation)) {
          replyStart({ ok: false, code: "RUN_CANCELLED", error: "本次會議已停止", state: runtimeState });
          return;
        }
        runtimeState = {
          ...runtimeState,
          busy: false,
          status: isProRequired ? "idle" : "error",
          phase: isProRequired ? runtimeState.phase : "done",
          message: error.message,
          errors: isProRequired ? runtimeState.errors : [...runtimeState.errors, { message: error.message }],
          entitlements,
        };
        try {
          await publishState(runToken);
        } catch (publishError) {
          replyStart({ ok: false, code: "RUN_CANCELLED", error: publishError.message, state: runtimeState });
          return;
        }
        runController.cancel();
        replyStart({
          ok: false,
          code: error.code || "ERROR",
          feature: error.feature || "",
          error: error.message,
          state: runtimeState,
        });
      });
    return true;
  }

  if (message.type === "aiDebate:checkReadiness") {
    if (runtimeState.busy || controlOperation || runController.isReserved()) {
      sendResponse({ ok: false, code: "BUSY", error: "目前已有辯論正在進行", state: runtimeState });
      return true;
    }
    const readinessToken = runController.reserve();
    if (readinessToken === null) {
      sendResponse({ ok: false, code: "BUSY", error: "目前已有辯論正在進行", state: runtimeState });
      return true;
    }
    const readinessRevision = lifecycleRevision;
    ensureRuntimeInitialized()
      .then(() => {
        runController.assertCurrent(readinessToken);
        if (controlOperation || lifecycleRevision !== readinessRevision) throw createRunCancelledError();
        return checkReadinessRequest(message, readinessToken);
      })
      .then((result) => {
        runController.assertCurrent(readinessToken);
        if (controlOperation || lifecycleRevision !== readinessRevision) throw createRunCancelledError();
        sendResponse(result);
      })
      .catch((error) => sendResponse({
        ok: false,
        code: isRunCancelledError(error) ? "RUN_CANCELLED" : (error.code || "PROVIDER_ERROR"),
        error: error.message,
        state: runtimeState,
      }))
      .finally(() => runController.release(readinessToken));
    return true;
  }

  if (message.type === "aiDebate:nextRound") {
    let responseSent = false;
    const replyNextRound = (response) => {
      if (responseSent) return;
      responseSent = true;
      sendResponse(response);
    };
    let runToken;
    let runRevision;
    ensureRuntimeInitialized()
      .then(async () => {
        await ensureRuntimeStateRetention();
        validateNextRound(message.action);
        if (runtimeState.busy || controlOperation || runController.isReserved()) {
          throw new Error("目前忙碌中");
        }
        runToken = runController.start();
        runRevision = lifecycleRevision;
        const execution = handleNextRound(message.action, message.text, runToken);
        replyNextRound({ ok: true, accepted: true, state: runtimeState });
        return execution;
      })
      .then((state) => replyNextRound({ ok: state.status !== "error", state }))
      .catch(async (error) => {
        if (!runToken) {
          replyNextRound({ ok: false, code: error.code || "ERROR", error: error.message, state: runtimeState });
          return;
        }
        if (
          isRunCancelledError(error) ||
          !runController.isCurrent(runToken) ||
          controlOperation ||
          lifecycleRevision !== runRevision
        ) {
          replyNextRound({ ok: false, code: "RUN_CANCELLED", error: "本次會議已停止", state: runtimeState });
          return;
        }
        runtimeState = {
          ...runtimeState,
          busy: false,
          status: "waiting_for_user",
          phase: "waiting_for_user",
          message: `發送失敗：${error.message}`,
        };
        try {
          await publishState(runToken);
        } catch (publishError) {
          replyNextRound({ ok: false, code: "RUN_CANCELLED", error: publishError.message, state: runtimeState });
          return;
        }
        runController.cancel();
        replyNextRound({ ok: false, error: error.message, state: runtimeState });
      });
    return true;
  }

  if (message.type === "aiDebate:stop") {
    const hadActiveOperation = runtimeState.busy || runController.isReserved();
    const operation = beginControlOperation("stop");
    if (!operation) {
      sendResponse({ ok: false, code: "BUSY", error: "目前已有控制操作正在進行", state: runtimeState });
      return true;
    }
    ensureRuntimeInitialized()
      .then(async () => {
        await ensureRuntimeStateRetention();
        assertCurrentControlOperation(operation);
        const ownedTabIds = Object.values(runtimeState.providerTabs || {});
        await notifyProviderAbortOperations({ tabIds: ownedTabIds });
        assertCurrentControlOperation(operation);
        if (runtimeState.busy || hadActiveOperation || runtimeState.repairPause) {
          runtimeState = {
            ...runtimeState,
            busy: false,
            status: "idle",
            phase: "idle",
            repairPause: null,
            repairDiscarded: true,
            message: "本次會議已停止，紀錄仍保留；可重新開始。",
            errors: [...runtimeState.errors, { message: "使用者手動取消操作" }],
          };
          await publishState(undefined, operation);
        }
        finishControlOperation(operation);
        sendResponse({ ok: true, state: runtimeState });
      })
      .catch((error) => {
        const cancelled = !isCurrentControlOperation(operation) || isRunCancelledError(error);
        finishControlOperation(operation);
        sendResponse({ ok: false, code: cancelled ? "RUN_CANCELLED" : error.code, error: cancelled ? "本次會議已停止" : error.message, state: runtimeState });
      });
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
    debugEvents: [],
    transcript: null,
    summary: "",
    reveal: null,
    sourceProvider: "",
    sourceSummary: "",
    errors: [],
    activeProviders,
    departedProviders: [],
    summaryProvider: "chatgpt",
    summaryStrategy: "standard",
    summaries: {},
    debateRounds: 1,
    currentCritiqueRound: 0,
    entitlements,
    skipSummary: false,
    workflowCheckpoint: null,
    repairPause: null,
    repairDiscarded: false,
    preflightResults: [],
    savedAt: Date.now(),
  };
}

async function checkReadinessRequest(message = {}, readinessToken) {
  if (runtimeState.busy || controlOperation ||
    (runController.isReserved() && !runController.isCurrent(readinessToken))) {
    return {
      ok: false,
      code: "BUSY",
      error: "目前已有辯論正在進行",
      results: runtimeState.preflightResults || [],
      state: runtimeState,
    };
  }

  if (Array.isArray(message.activeProviders)) {
    const providerIds = requiredProviderIdsForMessage(message, message.mode === "summary");
    const requestedTabs = { ...(message.hookedTabs || {}) };
    if (message.mode === "summary") {
      const { tab: sourceTab, provider } = await getActiveProviderTab();
      if (providerIds.filter((providerId) => providerId !== provider.id).length < 2) {
        const error = new Error("總結辯論至少需要目前頁面以外的 2 家 AI。");
        error.code = "NOT_ENOUGH_PROVIDERS";
        throw error;
      }
      providerIds.unshift(provider.id);
      requestedTabs[provider.id] = sourceTab.id;
    }
    const results = await checkProviderTabsSequentially([...new Set(providerIds)], requestedTabs, readinessToken);
    if (readinessToken) runController.assertCurrent(readinessToken);
    if (controlOperation) throw createRunCancelledError();
    const providerTabs = Object.fromEntries(results
      .filter((result) => Number.isInteger(result.tabId))
      .map((result) => [result.provider, result.tabId]));
    runtimeState = {
      ...runtimeState,
      busy: false,
      message: results.every((result) => result.ready) ? "所有模型皆可送出" : "部分模型尚未就緒",
      providerTabs: { ...runtimeState.providerTabs, ...providerTabs },
      preflightResults: results,
    };
    await publishState(readinessToken);
    return {
      ok: results.every((result) => result.ready),
      error: results.every((result) => result.ready) ? "" : "部分模型尚未就緒",
      results,
      state: runtimeState,
    };
  }

  const providerId = String(message.provider || "");
  const provider = PROVIDERS.find((item) => item.id === providerId);
  if (!provider) {
    return readinessResult(providerId, null, "WRONG_URL", "未知的 provider");
  }

  return checkReadinessForProvider(providerId, message.tabId);
}

async function checkReadinessForProvider(providerId, requestedTabId) {
  let tab;
  const normalizedTabId = Number(requestedTabId);
  if (Number.isInteger(normalizedTabId)) {
    tab = await getTabForReadiness(normalizedTabId);
  } else {
    const boundTabId = runtimeState.providerTabs?.[providerId];
    try {
      tab = Number.isInteger(boundTabId)
        ? await getTabForReadiness(boundTabId)
        : await getOrCreateProviderTab(providerId);
    } catch (error) {
      return readinessResult(providerId, null, readinessCodeForTabError(error), error.message);
    }
  }
  if (!tab) {
    try {
      tab = await getOrCreateProviderTab(providerId, { forceNewTab: true });
    } catch (error) {
      return readinessResult(providerId, null, readinessCodeForTabError(error), error.message);
    }
  }
  return checkProviderTabReadiness(tab.id, providerId);
}

async function preflightStartRequest(message = {}, runToken) {
  const providerIds = requiredProviderIdsForMessage(message, true);
  const hookedTabs = { ...(message.hookedTabs || {}) };

  if (message.mode === "summary") {
    const { tab: sourceTab, provider } = await getActiveProviderTab();
    const sourceProvider = provider.id;
    if (providerIds.filter((providerId) => providerId !== sourceProvider).length < 2) {
      const error = new Error(`總結辯論至少需要目前頁面以外的 2 家 AI。現在目前頁面是 ${providerLabel(sourceProvider)}，請再啟用兩家其他 AI。`);
      error.code = "NOT_ENOUGH_PROVIDERS";
      throw error;
    }
    providerIds.unshift(sourceProvider);
    hookedTabs[sourceProvider] = sourceTab.id;
  }

  return preflightProviderTabs(
    [...new Set(providerIds)],
    hookedTabs,
    runToken,
    { forceNewTabs: true },
  );
}

async function validateStartRequestBeforePreflight(message = {}) {
  if (runtimeState.repairPause || pendingReplyRepairs(runtimeState).length) {
    throw new Error("請先補齊故障回覆並繼續原流程，或重置目前會議。");
  }
  if (message.mode !== "summary" && !String(message.question || "").trim()
      && !linkedContextProviders(message.activeProviders, message.hookedTabs).length) {
    throw new Error("請先輸入問題");
  }
  const modeFeature = {
    fast: "fastDebate",
    summary: "summaryDebate",
    chat: "chatMode",
    theater: "chatMode",
  }[message.mode];
  if (modeFeature) await requireProFeature(modeFeature);
  if (!message.skipSummary) {
    await requireSummaryStrategyFeature(normalizeSummaryStrategy(message.summaryStrategy));
  }
  if (
    message.mode !== "summary" &&
    message.summaryStrategy !== "allAnonymous" &&
    !message.skipSummary &&
    isProviderId(message.summaryProvider) &&
    Array.isArray(message.activeProviders) &&
    !message.activeProviders.includes(message.summaryProvider)
  ) {
    const error = new Error(`請先啟用要擔任總結的 ${providerLabel(message.summaryProvider)}`);
    error.code = "SUMMARY_PROVIDER_DISABLED";
    throw error;
  }
}

function requiredProviderIdsForMessage(message = {}, requireTwo = false) {
  const requestedProviders = Array.isArray(message.activeProviders)
    ? message.activeProviders
    : DEFAULT_ACTIVE_PROVIDER_IDS;
  const selected = [...new Set(requestedProviders
    .filter((providerId) => isProviderId(providerId)))];
  const minimum = requireTwo ? 2 : 1;
  if (selected.length < minimum) {
    const error = new Error(requireTwo ? "至少需要啟用 2 家 AI" : "請先啟用至少一家 AI");
    error.code = "NOT_ENOUGH_PROVIDERS";
    throw error;
  }
  return [...new Set(selected)];
}

async function preflightProviderTabs(providerIds, hookedTabs = {}, runToken, options = {}) {
  const uniqueProviderIds = [...new Set(providerIds.filter((providerId) => isProviderId(providerId)))];
  const results = await checkProviderTabsSequentially(uniqueProviderIds, hookedTabs, runToken, options);

  if (runToken) runController.assertCurrent(runToken);
  const failed = results.find((result) => !result.ready);
  if (failed) {
    const error = new Error(`${providerLabel(failed.provider)} 尚未就緒：${failed.error || failed.code}`);
    error.code = failed.code;
    error.readiness = failed;
    error.results = results;
    throw error;
  }

  return {
    providerTabs: Object.fromEntries(results.map((result) => [result.provider, result.tabId])),
    results,
  };
}

async function checkProviderTabsSequentially(providerIds, seededTabs = {}, runToken, options = {}) {
  const originalTab = await getCurrentActiveTab();
  const results = [];
  try {
    for (const providerId of providerIds) {
      if (runToken) runController.assertCurrent(runToken);
      let tab;
      try {
        const seededTabId = Number(seededTabs?.[providerId]);
        tab = await getOrCreateProviderTab(providerId, {
          preferredTabId: Number.isInteger(seededTabId) ? seededTabId : undefined,
          forceNewTab: options.forceNewTabs === true && !Number.isInteger(seededTabId),
        });
        await activateProviderTabForReadiness(tab);
        results.push(await checkProviderTabReadiness(tab.id, providerId));
      } catch (error) {
        results.push(readinessResult(
          providerId,
          Number.isInteger(tab?.id) ? tab.id : null,
          readinessCodeForTabError(error),
          error.message,
        ));
      }
    }
  } finally {
    await restoreActiveTab(originalTab);
  }
  return results;
}

async function getCurrentActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  } catch (_error) {
    return null;
  }
}

async function activateProviderTabForReadiness(tab) {
  if (!Number.isInteger(tab?.id)) {
    const error = new Error("Provider 分頁不存在");
    error.code = "TAB_NOT_FOUND";
    throw error;
  }
  await chrome.tabs.update(tab.id, { active: true });
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const activeTab = await chrome.tabs.get(tab.id);
    if (activeTab.active && activeTab.status === "complete") break;
    await delay(50);
  }
  // Give lazy-rendered composers one short paint window after foregrounding.
  await delay(200);
}

async function restoreActiveTab(tab) {
  if (!Number.isInteger(tab?.id)) return;
  try {
    await chrome.tabs.update(tab.id, { active: true });
  } catch (_error) {
    // The original tab may have been closed during readiness checks.
  }
}

async function checkProviderTabReadiness(tabId, providerId) {
  const provider = PROVIDERS.find((item) => item.id === providerId);
  let effectiveTabId = tabId;
  let tab = await getTabForReadiness(tabId);
  if (!tab && provider) {
    try {
      tab = await getOrCreateProviderTab(providerId, { forceNewTab: true });
      effectiveTabId = tab.id;
    } catch (error) {
      return readinessResult(providerId, null, readinessCodeForTabError(error), error.message);
    }
  }
  if (!tab) {
    return readinessResult(providerId, effectiveTabId, "TAB_NOT_FOUND", "找不到 provider 分頁");
  }
  if (provider && isProviderLoginTab(tab, provider)) {
    return { ...readinessResult(providerId, effectiveTabId, "LOGIN_REQUIRED", "請先在該模型分頁登入，再重新檢查"), url: tab.url || "" };
  }
  if (!provider || !isProviderTabReady(tab, provider)) {
    const url = tab.url || tab.pendingUrl || "";
    const urlMatches = provider?.matchPatterns?.some((pattern) => urlMatchesPatternForReadiness(url, pattern));
    return {
      ...readinessResult(providerId, effectiveTabId, urlMatches ? "TIMEOUT" : "WRONG_URL", `目前網址：${url || "unknown"}`),
      url,
    };
  }

  let response;
  try {
    response = await withReadinessTimeout(
      sendProviderReadinessMessage(effectiveTabId, {
        provider: providerId,
        phase: "readiness",
        round: 0,
        prompt: "",
      }, "aiDebate:checkReadiness"),
      READINESS_TIMEOUT_MS,
    );
  } catch (error) {
    return readinessResult(
      providerId,
      effectiveTabId,
      ["READINESS_TIMEOUT", "PROVIDER_RPC_TIMEOUT"].includes(error.code) ? "TIMEOUT" : ["WRONG_URL", "LOGIN_REQUIRED"].includes(error.code) ? error.code : "CONTENT_SCRIPT_UNAVAILABLE",
      error.message,
    );
  }

  const codeByStatus = {
    ready: "READY",
    "wrong-page": "WRONG_URL",
    "login-required": "LOGIN_REQUIRED",
    "input-not-ready": "INPUT_NOT_FOUND",
    "send-not-ready": "SEND_UNAVAILABLE",
    generating: "GENERATING",
    error: "PROVIDER_ERROR",
  };
  const code = response?.ready === true
    ? "READY"
    : codeByStatus[response?.status] || "PROVIDER_ERROR";
  return {
    ...readinessResult(providerId, effectiveTabId, code, response?.checks?.error?.message || response?.error || ""),
    ready: code === "READY",
    status: response?.status || code,
    url: tab.url || tab.pendingUrl || "",
    checks: response?.checks || null,
  };
}

async function getTabForReadiness(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch (_error) {
    return null;
  }
}

function readinessResult(provider, tabId, code, error = "") {
  return {
    ok: code === "READY",
    ready: code === "READY",
    provider,
    tabId,
    code,
    status: code,
    message: error,
    error,
    url: "",
  };
}

function readinessCodeForTabError(error) {
  if (error?.code && ["TAB_NOT_FOUND", "WRONG_URL", "TIMEOUT"].includes(error.code)) {
    return error.code;
  }
  if (/(?:尚未就緒|timeout|timed out)/i.test(error?.message || "")) {
    return "TIMEOUT";
  }
  return "TAB_NOT_FOUND";
}

function urlMatchesPatternForReadiness(url, pattern) {
  if (!url || !pattern) return false;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(url);
}

async function withReadinessTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error("provider readiness timeout");
      error.code = "READINESS_TIMEOUT";
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
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
    openEnded: true,
    interactiveMode: true,
    debateRounds: 1,
    openingMessage: "自由群聊開始：各就各位，準備送出第一句話",
  });
}

async function startTheaterDebate(question, options = {}) {
  await requireProFeature("chatMode");
  return startInteractiveDebate(question, {
    ...options,
    mode: "theater",
    interactiveMode: true,
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
  if (runtimeState.busy && runtimeState.phase !== "preflight-complete") throw new Error("目前已有辯論正在進行");

  const requestedProviders = normalizeProviderIds(options.activeProviders);
  const summarySetup = await prepareSummarySetup(requestedProviders, options);
  const activeProviders = summarySetup.debateProviders;
  const summaryProvider = summarySetup.resolvedSummaryProvider;
  const entitlements = await getEntitlements();
  runController.assertCurrent(runToken);
  const preflight = options.preflight || await preflightProviderTabs(
    [...activeProviders, ...(!options.skipSummary ? [summaryProvider] : [])],
    options.hookedTabs,
    runToken,
  );
  const debateRounds = normalizeDebateRounds(options.debateRounds);
  const providerTabs = { ...(options.hookedTabs || {}), ...preflight.providerTabs };
  engine = new DebateEngine(activeProviders, summaryProvider, debateRounds, {
    ...(options.engineOptions || {}),
    interactionStyle: options.interactionStyle,
    openEnded: options.openEnded === true,
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
    question: options.roundZero?.userText ?? trimmedQuestion,
    activeProviders,
    summaryProvider,
    summaryStrategy: summarySetup.summaryStrategy,
    debateRounds: engine.debateRounds,
    currentCritiqueRound: 0,
    entitlements,
    skipSummary: options.skipSummary || false,
    providerTabs,
    preflightResults: preflight.results,
  };
  await publishState(runToken);

  const firstRoundJobs = engine.start(trimmedQuestion, { roundZero: options.roundZero });
  runtimeState = { ...runtimeState, transcript: engine.snapshot() };
  await publishState(runToken);
  await runFastProviderJobs(firstRoundJobs, "answer", runToken, {
    type: options.mode === "chat" && options.interactiveMode ? "interactive" : "planned",
    nextRound: 1, scheduler: "fast", interactiveMode: Boolean(options.interactiveMode),
  });
  if (runtimeState.repairPause) return runtimeState;

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

  return continuePlannedDebate(1, { scheduler: "fast", interactiveMode: options.interactiveMode, runToken });
}

function normalizeSummaryStrategy(value = "standard") {
  return ["standard", "observerChair", "anonymousReview", "allAnonymous"].includes(value) ? value : "standard";
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
  if (!options.skipSummary) {
    await requireSummaryStrategyFeature(summaryStrategy);
  }

  const resolvedSummaryProvider = options.skipSummary || summaryStrategy === "allAnonymous"
    ? requestedProviders[0]
    : resolveSummaryProvider(options.summaryProvider, requestedProviders);
  let debateProviders = [...requestedProviders];
  if (!options.skipSummary && summaryStrategy === "observerChair") {
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

async function runFinalSummary(runToken) {
  if (runtimeState.summaryStrategy !== "allAnonymous") {
    const result = await sendJob(buildRuntimeFinalJob(), runToken);
    recordProviderResult(result, "summary", runToken);
    if (!result.ok) await pauseForReplyRepair([], "summary", { type: "summary" }, runToken);
    return result;
  }
  runtimeState = { ...runtimeState, summaries: {} };
  const jobs = engine.buildFinalJobs();
  const results = await runFastProviderJobs(jobs, "summary", runToken, { type: "summary" });
  if (runtimeState.repairPause) return { ok: false, paused: true };
  runController.assertCurrent(runToken);
  if (!results.some((result) => result.ok)) {
    return results[0] || { ok: false, error: "全員匿名總結沒有可用的裁判結果" };
  }
  const summaries = runtimeState.summaries;
  const names = engine.snapshot().anonymousNames || {};
  const content = jobs.map(({ provider }) =>
    `${names[provider] || "匿名參與者（暱稱未取得）"}：\n${summaries[provider] || ""}`,
  ).join("\n\n");
  return { ok: true, content };
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
  await runFastProviderJobs(revealJobs, "reveal", runToken, { type: "reveal" });
  if (runtimeState.repairPause) return runtimeState;

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

  if (runtimeState.busy && runtimeState.phase !== "preflight-complete") {
    throw new Error("目前已有辯論正在進行");
  }

  const requestedProviders = normalizeProviderIds(options.activeProviders);
  const summarySetup = await prepareSummarySetup(requestedProviders, options);
  const activeProviders = summarySetup.debateProviders;
  const summaryProvider = summarySetup.resolvedSummaryProvider;
  const entitlements = await getEntitlements();
  runController.assertCurrent(runToken);
  const mode = options.mode || "fast";
  const scheduler = options.scheduler || "fast";
  const preflight = options.preflight || await preflightProviderTabs(
    [...activeProviders, ...(!options.skipSummary ? [summaryProvider] : [])],
    options.hookedTabs,
    runToken,
  );
  const debateRounds = normalizeDebateRounds(options.debateRounds);
  const providerTabs = { ...(options.hookedTabs || {}), ...preflight.providerTabs };

  engine = new DebateEngine(activeProviders, summaryProvider, debateRounds, {
    interactionStyle: options.interactionStyle,
    openEnded: options.openEnded === true,
    summaryStrategy: summarySetup.summaryStrategy,
    resolvedSummaryProvider: summaryProvider,
  });
  runtimeState = {
    ...createIdleState(activeProviders),
    busy: true,
    status: "running",
    mode,
    phase: "first-round",
    message: options.openingMessage || "快速鬥技場：準備送出原始問題",
    question: options.roundZero?.userText ?? trimmedQuestion,
    activeProviders,
    summaryProvider,
    summaryStrategy: summarySetup.summaryStrategy,
    debateRounds,
    currentCritiqueRound: 0,
    entitlements,
    skipSummary: options.skipSummary || false,
    providerTabs,
    preflightResults: preflight.results,
  };
  await publishState(runToken);

  return runDebateRounds(trimmedQuestion, { scheduler, runToken, interactiveMode: options.interactiveMode, roundZero: options.roundZero });
}

async function startSummaryDebate(userNote, options = {}) {
  const runToken = options.runToken;
  await requireProFeature("summaryDebate");
  const summaryStrategy = normalizeSummaryStrategy(options.summaryStrategy);
  await requireSummaryStrategyFeature(summaryStrategy);
  runController.assertCurrent(runToken);

  if (runtimeState.busy && runtimeState.phase !== "preflight-complete") {
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
  const preflight = options.preflight || await preflightProviderTabs(
    [sourceProvider, ...debateProviders],
    { ...(options.hookedTabs || {}), [sourceProvider]: sourceTab.id },
    runToken,
  );
  const providerTabs = { ...(options.hookedTabs || {}), ...preflight.providerTabs };

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
    question: options.roundZero?.userText ?? String(userNote || "").trim(),
    providerTabs,
    activeProviders: debateProviders,
    sourceProvider,
    summaryProvider: sourceProvider,
    summaryStrategy,
    debateRounds,
    currentCritiqueRound: 0,
    entitlements,
    skipSummary: options.skipSummary || false,
    preflightResults: preflight.results,
  };
  await publishState(runToken);

  // Keep a recoverable session even if the source summary fails before answers.
  engine.start(String(userNote || "").trim() || "總結目前對話", { roundZero: options.roundZero });
  runtimeState = { ...runtimeState, transcript: engine.snapshot() };
  const sourceResult = await sendJob({
    provider: sourceProvider,
    phase: "source-summary",
    prompt: buildConversationSummaryPrompt(userNote),
  }, runToken);
  if (!sourceResult.ok) {
    runtimeState = { ...runtimeState, sourceSummary: `[服務狀態：${sourceResult.error || "無法取得來源總結"}]`,
      errors: [...runtimeState.errors, sourceResult] };
    await pauseForReplyRepair([], "source-summary", { type: "source-summary", scheduler: "fast", interactiveMode: Boolean(options.interactiveMode) }, runToken);
    return runtimeState;
  }

  runtimeState = {
    ...runtimeState,
    sourceSummary: sourceResult.content,
    phase: "first-round",
    message: "快速辯論：將目前對話總結送給其他 AI",
    debateRounds,
  };
  await publishState(runToken);

  return runDebateRounds(sourceResult.content, { scheduler: "fast", interactiveMode: options.interactiveMode, runToken, roundZero: options.roundZero });
}

async function runDebateRounds(originalQuestion, options = {}) {
  const runToken = options.runToken;
  runController.assertCurrent(runToken);
  const scheduler = options.scheduler || "sequential";
  const runProviderJobs = scheduler === "fast" ? runFastProviderJobs : runSequentialProviderJobs;
  const schedulerLabel = scheduler === "fast" ? "快速" : "逐家";

  const roundZero = options.roundZero ?? engine.state?.roundZero;
  // Summary mode keeps its source-summary step, but shares the same raw linked
  // context with every peer instead of relying on the source AI to reproduce it.
  const sharedQuestion = runtimeState.mode === "summary" && roundZero
    ? `${buildRoundZero(roundZero.sources.map((source) => ({ ...source, ok: true })), roundZero.userText).question}\n\n【來源對話總結】\n${originalQuestion}`
    : originalQuestion;
  const firstRoundJobs = engine.start(sharedQuestion, { roundZero });
  runtimeState = {
    ...runtimeState,
    phase: "first-round",
    message: `第一輪：${schedulerLabel}送出原始問題`,
    transcript: engine.snapshot(),
  };
  await publishState(runToken);
  await runProviderJobs(firstRoundJobs, "answer", runToken, {
    type: "planned", nextRound: 1, scheduler, interactiveMode: Boolean(options.interactiveMode),
  });
  if (runtimeState.repairPause) return runtimeState;

  return continuePlannedDebate(1, options);
}

async function continuePlannedDebate(startRound, options = {}) {
  const runToken = options.runToken;
  runController.assertCurrent(runToken);
  const scheduler = options.scheduler || "fast";
  const runProviderJobs = scheduler === "fast" ? runFastProviderJobs : runSequentialProviderJobs;
  const schedulerLabel = scheduler === "fast" ? "快速" : "逐家";
  for (let roundNumber = startRound; engine.participatingProviders.length >= 2 && roundNumber <= engine.debateRounds; roundNumber += 1) {
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
    await runProviderJobs(critiqueJobs, "critique", runToken, {
      type: "planned", nextRound: roundNumber + 1, scheduler, interactiveMode: Boolean(options.interactiveMode),
    });
    if (runtimeState.repairPause) return runtimeState;
  }

  if (engine.participatingProviders.length < 2) {
    runtimeState = {
      ...runtimeState, busy: false, status: "done", phase: "done", summary: "",
      transcript: engine.snapshot(),
      message: "本場僅剩一位 AI 在席，已略過互評並安全結束。",
    };
    await publishState(runToken);
    return runtimeState;
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
    message: runtimeState.summaryStrategy === "allAnonymous" ? "最終回合：全員匿名裁判各自總結" : `最終回合：請 ${providerLabel(runtimeState.summaryProvider)} 總結`,
    transcript: engine.snapshot(),
  };
  await publishState(runToken);

  const finalResult = await runFinalSummary(runToken);
  if (runtimeState.repairPause) return runtimeState;
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
  if (action === "resume") return resumeRepairedMeeting(runToken);

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
    if (runtimeState.repairPause) return runtimeState;
  } else if (action === "critique") {
    if (engine.participatingProviders.length < 2) {
      runtimeState = { ...runtimeState, busy: false, status: "done", phase: "done", summary: "",
        transcript: engine.snapshot(), message: "本場僅剩一位 AI 在席，已略過互評並安全結束。" };
      await publishState(runToken);
      return runtimeState;
    }
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
    if (runtimeState.repairPause) return runtimeState;
  } else if (action === "summarize") {
    if (engine.participatingProviders.length < 2 &&
        (!engine.openEnded || engine.interactionStyle === "imposter")) {
      runtimeState = { ...runtimeState, busy: false, status: "done", phase: "done", summary: "",
        transcript: engine.snapshot(), message: "本場僅剩一位 AI 在席，已保留現有紀錄並安全結束。" };
      await publishState(runToken);
      return runtimeState;
    }
    if (engine.interactionStyle === "imposter") {
      return finishImposterReveal(runToken);
    }
    runtimeState = {
      ...runtimeState,
      phase: "summary",
      message: runtimeState.summaryStrategy === "allAnonymous" ? "全員匿名裁判各自總結" : `請 ${providerLabel(runtimeState.summaryProvider)} 總結`,
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
    const finalResult = await runFinalSummary(runToken);
    if (runtimeState.repairPause) return runtimeState;
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

async function runSequentialProviderJobs(jobs, target, runToken, resumePlan = { type: "interactive" }) {
  const results = [];
  const participatingJobs = filterParticipatingJobs(jobs);
  for (const [index, job] of participatingJobs.entries()) {
    runController.assertCurrent(runToken);
    const result = await sendJob(job, runToken);
    results.push(result);
    recordProviderResult(result, target, runToken);
    runtimeState = {
      ...runtimeState,
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
    if (!result.ok) {
      await pauseForReplyRepair(participatingJobs.slice(index + 1), target, { ...resumePlan, scheduler: "sequential" }, runToken);
      break;
    }
  }
  return results;
}

async function runFastProviderJobs(jobs, target, runToken, resumePlan = { type: "interactive" }) {
  jobs = filterParticipatingJobs(jobs);
  const submittedJobs = [];
  const results = [];
  let remainingJobs = [];
  for (const [index, job] of jobs.entries()) {
    runController.assertCurrent(runToken);
    const submitted = await submitProviderJob(job, runToken);
    if (submitted.ok) {
      submittedJobs.push(submitted);
    } else {
      results.push(submitted);
      recordProviderResult(submitted, target, runToken);
    }
    runtimeState = {
      ...runtimeState,
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
    if (!submitted.ok) {
      remainingJobs = jobs.slice(index + 1);
      break;
    }
  }

  for (const submitted of submittedJobs) {
    runController.assertCurrent(runToken);
    const result = await collectProviderJob(submitted, runToken);
    results.push(result);
    recordProviderResult(result, target, runToken);
    runtimeState = {
      ...runtimeState,
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
  }
  if (results.some((result) => !result.ok)) {
    await pauseForReplyRepair(remainingJobs, target, { ...resumePlan, scheduler: "fast" }, runToken);
  }
  return results;
}

function filterParticipatingJobs(jobs) {
  const participating = new Set(engine.participatingProviders);
  if (runtimeState.summaryProvider && !runtimeState.departedProviders?.includes(runtimeState.summaryProvider)) {
    participating.add(runtimeState.summaryProvider);
  }
  if (runtimeState.sourceProvider && !runtimeState.departedProviders?.includes(runtimeState.sourceProvider)) {
    participating.add(runtimeState.sourceProvider);
  }
  return jobs.filter((job) => participating.has(job.provider));
}

async function pauseForReplyRepair(remainingJobs, target, resumePlan, runToken) {
  runController.assertCurrent(runToken);
  runtimeState = {
    ...runtimeState,
    transcript: engine.snapshot(),
    repairPause: { target, remainingJobs, resumePlan, pausedPhase: runtimeState.phase },
    busy: false,
    status: "waiting_for_user",
    phase: "waiting_for_user",
    workflowCheckpoint: null,
    message: "會議已暫停：請在故障訊息下方貼上對應 AI 回覆，全部補齊後會自動繼續原流程。",
  };
  await publishState(runToken);
}

async function resumeRepairedMeeting(runToken) {
  runController.assertCurrent(runToken);
  const pause = runtimeState.repairPause;
  if (!pause) throw createRunCancelledError();
  if (engine.participatingProviders.length < 2) {
    runtimeState = {
      ...runtimeState, repairPause: null, busy: false, status: "done", phase: "done", summary: "",
      transcript: engine.snapshot(), message: "本場僅剩一位 AI 在席，已保留現有紀錄並安全結束。",
    };
    await publishState(runToken);
    return runtimeState;
  }
  const plan = pause.resumePlan;
  runtimeState = { ...runtimeState, repairPause: null, busy: true, status: "running",
    phase: pause.pausedPhase || (pause.target === "answer" ? "first-round" : pause.target), message: "補回覆已完成，接續原流程…" };
  await publishState(runToken);
  if (pause.remainingJobs.length) {
    const runJobs = plan.scheduler === "sequential" ? runSequentialProviderJobs : runFastProviderJobs;
    await runJobs(pause.remainingJobs, pause.target, runToken, plan);
    if (runtimeState.repairPause) return runtimeState;
  }
  if (plan.type === "planned") {
    return continuePlannedDebate(plan.nextRound, { ...plan, runToken });
  }
  if (plan.type === "source-summary") {
    return runDebateRounds(runtimeState.sourceSummary, { ...plan, runToken });
  }
  if (plan.type === "summary") {
    const names = engine.snapshot().anonymousNames || {};
    const summary = runtimeState.summaryStrategy === "allAnonymous"
      ? [...new Set([...engine.participatingProviders, runtimeState.summaryProvider])]
        .filter((provider) => !runtimeState.departedProviders?.includes(provider))
        .map((provider) => `${names[provider] || "匿名參與者（暱稱未取得）"}：\n${runtimeState.summaries[provider] || ""}`).join("\n\n")
      : runtimeState.summaries[runtimeState.summaryProvider];
    runtimeState = { ...runtimeState, busy: false, status: "done", phase: "done", summary,
      transcript: engine.snapshot(), message: "總結已補齊，會議完成" };
  } else if (plan.type === "reveal") {
    const reveal = engine.snapshot().reveal;
    runtimeState = { ...runtimeState, busy: false, status: "done", phase: "reveal", reveal,
      transcript: engine.snapshot(), summary: reveal.content, message: "揭曉反應已補齊，會議完成" };
  } else {
    runtimeState = { ...runtimeState, busy: false, status: "waiting_for_user", phase: "waiting_for_user",
      transcript: engine.snapshot(), manuallyRecovered: true, message: "本輪已補齊，等待你的下一步。" };
  }
  await publishState(runToken);
  return runtimeState;
}

function recordProviderResult(result, target, runToken) {
  runController.assertCurrent(runToken);
  if (result.ok && target === "answer") {
    engine.recordAnswer(result.provider, result.content);
  } else if (result.ok && target === "critique") {
    engine.recordCritique(result.provider, result.content, result.round);
  } else if (result.ok && target === "reveal") {
    engine.recordReveal(result.provider, result.content);
  } else if (result.ok && target === "summary") {
    runtimeState.summaries = { ...runtimeState.summaries, [result.provider]: result.content };
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
    if (target === "summary") {
      runtimeState.summaries = {
        ...runtimeState.summaries,
        [result.provider]: `[服務狀態：${result.error || "unknown error"}] 這位裁判未能完成總結。`,
      };
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
      code: error.code || "PROVIDER_AUTOMATION_FAILED",
      debugStage: error.rpcStage || "submit",
      debugDetails: error.debugDetails,
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
      debugDetails: sanitizeDebugDetails(error.debugDetails),
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

    const deadline = Date.now() + getProviderTimeoutMs(submitted.phase);
    let response;
    do {
      runController.assertCurrent(runToken);
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        const error = new Error("等待 AI 回覆逾時");
        error.code = "PROVIDER_RESPONSE_TIMEOUT";
        throw error;
      }
      response = await readSubmittedResponseWithRetry(submitted, tab.id, deadline, runToken);
      runController.assertCurrent(runToken);
    } while (response?.ok && response.pending);
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
      code: error.code || "PROVIDER_AUTOMATION_FAILED",
      debugStage: error.rpcStage || "collect",
      debugDetails: error.debugDetails,
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
      debugDetails: sanitizeDebugDetails(error.debugDetails),
    };
  }
}

async function readSubmittedResponseWithRetry(submitted, tabId, deadline, runToken) {
  const maxTransientRetries = 3;
  let transientRetries = 0;
  while (true) {
    runController.assertCurrent(runToken);
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      const error = new Error("等待 AI 回覆逾時");
      error.code = "PROVIDER_RESPONSE_TIMEOUT";
      throw error;
    }

    const rpcBudgetMs = Math.min(remainingMs, RESPONSE_POLL_BUDGET_MS + 10000);
    const rpcDeadline = Date.now() + rpcBudgetMs;
    try {
      const response = await providerRpc(sendProviderMessage(tabId, submitted, "aiDebate:readSubmittedResponse", {
        runId: submitted.runId,
        pollBudgetMs: Math.min(RESPONSE_POLL_BUDGET_MS, remainingMs),
      }, { deadline: rpcDeadline }), "收集 AI 回覆", rpcBudgetMs);
      runController.assertCurrent(runToken);
      return response;
    } catch (error) {
      runController.assertCurrent(runToken);
      if (!isSafeUndispatchedReadTransientError(error) || transientRetries >= maxTransientRetries) throw error;
      transientRetries += 1;
      const delayMs = Math.min(200, Math.max(0, deadline - Date.now()));
      if (delayMs <= 0) throw error;
      await delay(delayMs);
    }
  }
}

async function sendJob(job, runToken) {
  const submitted = await submitProviderJob(job, runToken);
  if (!submitted.ok) return submitted;
  return collectProviderJob(submitted, runToken);
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

  const candidateTabIds = [];
  if (!options.forceNewTab && Number.isInteger(options.preferredTabId)) {
    candidateTabIds.push(options.preferredTabId);
  }
  const boundTabId = runtimeState.providerTabs?.[providerId];
  if (!options.forceNewTab && typeof boundTabId === "number" && !candidateTabIds.includes(boundTabId)) {
    candidateTabIds.push(boundTabId);
  }
  for (const candidateTabId of candidateTabIds) {
    try {
      const candidateTab = await chrome.tabs.get(candidateTabId);
      if (isProviderTabReady(candidateTab, provider)) {
        return candidateTab;
      }
    } catch (_error) {
      // The user closed this candidate tab. Open a fresh conversation below.
    }
  }

  // Readiness may have created the tab before the in-memory binding was
  // restored. Reuse any matching open tab before creating another one.
  if (!options.forceNewTab) {
    try {
      const existingTabs = [];
      for (const pattern of provider.matchPatterns) {
        existingTabs.push(...await chrome.tabs.query({ url: pattern }));
      }
      const existingTab = existingTabs.find((tab) => isProviderTabReady(tab, provider));
      if (existingTab) {
        return existingTab;
      }
    } catch (_error) {
      // Tab search is best effort; creation below remains the safe fallback.
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

const PROVIDER_CONTENT_SCRIPT_VERSION = "0.5.1-driver.12";
const PROVIDER_DRIVER_CONTRACT_VERSION = 1;

function isProviderLoginTab(tab, provider) {
  const url = tab?.url || tab?.pendingUrl || "";
  if (!provider.matchPatterns.some((pattern) => urlMatchesPatternForReadiness(url, pattern))) return false;
  try {
    return /\/(?:login|signin|sign-in)(?:\/|$)/i.test(new URL(url).pathname);
  } catch (_error) {
    return false;
  }
}

async function providerRpc(promise, stage, timeoutMs = PROVIDER_CONTROL_TIMEOUT_MS) {
  try {
    return await withReadinessTimeout(promise, timeoutMs);
  } catch (error) {
    if (error.code === "READINESS_TIMEOUT") error.code = "PROVIDER_RPC_TIMEOUT";
    error.rpcStage ||= stage;
    error.message = `${stage}: ${error.message}`;
    throw error;
  }
}

function isTransientProviderChannelError(error) {
  // Chrome cannot cancel an executeScript already accepted by the browser.
  // Never launch a second injection while the first has an unknown outcome.
  if (error?.rpcStage === "content injection") return false;
  return error?.code === "PROVIDER_RPC_TIMEOUT" ||
    /(?:message (?:port|channel) closed|channel closed before|receiving end does not exist|could not establish connection|extension context invalidated|frame was removed)/i.test(error?.message || "");
}

function isSafeUndispatchedReadTransientError(error) {
  if (error?.providerReadDispatched !== false || !isTransientProviderChannelError(error)) return false;
  if (error.code === "PROVIDER_RPC_TIMEOUT") {
    return error.rpcStage === "capabilities";
  }
  return error.rpcStage !== "content injection";
}

// Read-only checks can be retried after a document transition. Never use this
// wrapper for submitPrompt/sendAndRead: a lost reply is not proof of no send.
async function sendProviderReadinessMessage(tabId, job, type = "aiDebate:checkReadiness") {
  if (type !== "aiDebate:checkReadiness") throw new Error("Readiness recovery only accepts read-only checks");
  const deadline = Date.now() + READINESS_TIMEOUT_MS - 100;
  let repair = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const provider = PROVIDERS.find((item) => item.id === job.provider);
      const loadingDeadline = Math.min(deadline, Date.now() + 2000);
      let tab = await chrome.tabs.get(tabId);
      while (tab.status !== "complete" && Date.now() < loadingDeadline) {
        await delay(100);
        tab = await chrome.tabs.get(tabId);
      }
      if (provider && isProviderLoginTab(tab, provider)) {
        const error = new Error("請先在該模型分頁登入，再重新檢查");
        error.code = "LOGIN_REQUIRED";
        throw error;
      }
      if (!provider || !isProviderTabReady(tab, provider)) {
        const error = new Error(`分頁尚未就緒或網址已改變：${tab.url || tab.pendingUrl || "unknown"}`);
        error.code = tab.status === "complete" ? "WRONG_URL" : "PROVIDER_RPC_TIMEOUT";
        throw error;
      }
      return await sendProviderMessage(tabId, job, type, {}, { deadline, repair });
    } catch (error) {
      if (attempt === 1 || Date.now() + 200 >= deadline || !isTransientProviderChannelError(error)) throw error;
      repair = error.code !== "PROVIDER_RPC_TIMEOUT" || /^capabilities/.test(error.rpcStage || "");
      await delay(200);
    }
  }
}

async function ensureProviderContentScript(tabId, { deadline = Infinity, repair = false } = {}) {
  const budget = (limit) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      const error = new Error("Provider 檢查期限已到");
      error.code = "PROVIDER_RPC_TIMEOUT";
      throw error;
    }
    return Math.min(limit, remaining);
  };
  let capabilities = null;
  if (!repair) {
    try {
      const timeoutMs = budget(1500);
      capabilities = await providerRpc(chrome.tabs.sendMessage(tabId, { type: "aiDebate:getCapabilities" }), "capabilities", timeoutMs);
    } catch (error) {
      if (!/(?:receiving end does not exist|could not establish connection|extension context invalidated)/i.test(error.message)) throw error;
      // A missing or invalidated listener is repaired by the local injection below.
    }
  }
  if (
    capabilities?.contentScriptVersion === PROVIDER_CONTENT_SCRIPT_VERSION &&
    capabilities?.driverContractVersion === PROVIDER_DRIVER_CONTRACT_VERSION
  ) return;

  const injectionTimeoutMs = budget(PROVIDER_CONTROL_TIMEOUT_MS);
  await providerRpc(chrome.scripting.executeScript({
    target: { tabId },
    files: [
      "src/content/automation-core.js",
      "src/content/provider-driver.js",
      "src/content/provider-adapters.js",
      "src/content/provider-page.js",
    ],
  }), "content injection", injectionTimeoutMs);
  const handshakeTimeoutMs = budget(1500);
  capabilities = await providerRpc(chrome.tabs.sendMessage(tabId, { type: "aiDebate:getCapabilities" }), "capabilities after injection", handshakeTimeoutMs);
  if (
    capabilities?.contentScriptVersion !== PROVIDER_CONTENT_SCRIPT_VERSION ||
    capabilities?.driverContractVersion !== PROVIDER_DRIVER_CONTRACT_VERSION
  ) {
    const error = new Error("Provider Driver 契約版本不一致，請重新整理該分頁後再試一次");
    error.code = capabilities?.contentScriptVersion !== PROVIDER_CONTENT_SCRIPT_VERSION
      ? "CONTENT_SCRIPT_VERSION_MISMATCH"
      : "CONTENT_SCRIPT_DRIVER_MISMATCH";
    throw error;
  }
}

async function sendProviderMessage(tabId, job, type = "aiDebate:sendAndRead", extra = {}, options = {}) {
  const payload = {
    type,
    provider: job.provider,
    phase: job.phase,
    round: job.round,
    prompt: job.prompt,
    timeoutMs: getProviderTimeoutMs(job.phase),
    ...extra,
  };

  let tab;
  let providerReadDispatched = false;
  try {
    tab = await chrome.tabs.get(tabId);
    await ensureProviderContentScript(tabId, options);
    if (type === "aiDebate:checkReadiness") {
      const remaining = (options.deadline ?? Infinity) - Date.now();
      if (remaining <= 0) {
        const error = new Error("readiness: Provider 檢查期限已到");
        error.code = "PROVIDER_RPC_TIMEOUT";
        throw error;
      }
      return await providerRpc(chrome.tabs.sendMessage(tabId, payload), "readiness DOM", Math.min(5000, remaining));
    }
    if (type === "aiDebate:readSubmittedResponse") providerReadDispatched = true;
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (error) {
    const wrapped = new Error(`${error.message}（目前網址：${tab?.url || tab?.pendingUrl || "unknown"}）`);
    wrapped.code = error.code || "CONTENT_SCRIPT_UNAVAILABLE";
    wrapped.rpcStage = error.rpcStage;
    if (type === "aiDebate:readSubmittedResponse") {
      wrapped.providerReadDispatched = providerReadDispatched;
    }
    throw wrapped;
  }
}

function getProviderTimeoutMs(phase) {
  return phase === "summary" || phase === "source-summary"
    ? SUMMARY_PROVIDER_TIMEOUT_MS
    : PROVIDER_TIMEOUT_MS;
}

async function notifyProviderAbortOperations({ clearSubmittedRuns = false, tabIds = null } = {}) {
  const providerTabs = new Map();
  if (Array.isArray(tabIds)) {
    for (const rawTabId of tabIds) {
      const tabId = Number(rawTabId);
      if (!Number.isInteger(tabId)) continue;
      try {
        const tab = await chrome.tabs.get(tabId);
        const url = tab.url || tab.pendingUrl || "";
        const provider = PROVIDERS.find((item) => item.matchPatterns?.some((pattern) =>
          urlMatchesPatternForReadiness(url, pattern),
        ));
        if (provider) providerTabs.set(tabId, provider);
      } catch (_error) {
        // A closed tab is already stopped; map it to no provider operation.
      }
    }
  } else for (const provider of PROVIDERS) {
    let tabs = [];
    try {
      tabs = await chrome.tabs.query({ url: provider.matchPatterns });
    } catch (_error) {
      continue;
    }
    for (const tab of tabs) {
      if (typeof tab.id !== "number") continue;
      const url = tab.url || tab.pendingUrl || "";
      if (provider.matchPatterns?.some((pattern) => urlMatchesPatternForReadiness(url, pattern))) {
        providerTabs.set(tab.id, provider);
      }
    }
  }

  await Promise.all([...providerTabs.keys()].map(async (tabId) => {
    try {
      await withProviderControlTimeout(
        chrome.tabs.sendMessage(tabId, { type: "aiDebate:abortAutomation" }),
      );
    } catch (_error) {
      // A closed or changing provider tab must not block local data deletion.
    }
    if (clearSubmittedRuns) {
      try {
        await withProviderControlTimeout(
          chrome.tabs.sendMessage(tabId, { type: "aiDebate:clearSubmittedRuns" }),
        );
      } catch (_error) {
        // A closed or changing provider tab must not block local data deletion.
      }
    }
  }));
}

async function withProviderControlTimeout(promise) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("provider control message timeout")), PROVIDER_CONTROL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
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
    errors: runtimeState.errors.includes(result) ? runtimeState.errors : [...runtimeState.errors, result],
  };
  await publishState(runToken);
  return runtimeState;
}

async function publishState(runToken, operation) {
  if (runToken !== undefined) {
    runController.assertCurrent(runToken);
  }
  if (operation) assertCurrentControlOperation(operation);

  if (!Number.isFinite(runtimeState.savedAt)) {
    runtimeState = {
      ...runtimeState,
      savedAt: Date.now(),
    };
  }
  const stateToPublish = JSON.parse(JSON.stringify(runtimeState));
  const persistedState = createBoundedPersistedState(stateToPublish);
  const persistenceRevision = lifecycleRevision;
  try {
    await enqueueStateStorage(() => safePersistState(chrome.storage, persistedState, STORAGE_KEY, {
      isCurrent: () => persistenceRevision === lifecycleRevision
        && (runToken === undefined || runController.isCurrent(runToken))
        && (!operation || isCurrentControlOperation(operation)),
    }));
  } catch (_error) {
    // Quota or storage availability must not make the active in-memory run fail.
  }

  if (persistenceRevision !== lifecycleRevision) return;

  if (runToken !== undefined) {
    runController.assertCurrent(runToken);
  }
  if (operation) assertCurrentControlOperation(operation);
  chrome.runtime.sendMessage({ type: "aiDebate:stateChanged", state: stateToPublish }).catch(() => {});
}

export function createBoundedPersistedState(state) {
  const bounded = JSON.parse(JSON.stringify(state));
  bounded.debugEvents = (Array.isArray(bounded.debugEvents) ? bounded.debugEvents : [])
    .slice(-MAX_DEBUG_EVENTS)
    .map((event) => ({
      timestamp: Number.isFinite(event?.timestamp) ? event.timestamp : 0,
      provider: boundText(event?.provider, 80),
      phase: boundText(event?.phase, 80),
      stage: boundText(event?.stage, 120),
      code: boundText(event?.code, 120),
      message: boundText(event?.message, 500),
      debugDetails: sanitizeDebugDetails(event?.debugDetails),
    }));
  if (!bounded.transcript) {
    return bounded;
  }

  bounded.transcript = boundTranscript(bounded.transcript, MAX_PERSISTED_TEXT_CHARS);
  if (JSON.stringify(bounded.transcript).length <= MAX_PERSISTED_TRANSCRIPT_CHARS) {
    return bounded;
  }

  bounded.transcript = boundTranscript(bounded.transcript, 2000);
  if (JSON.stringify(bounded.transcript).length <= MAX_PERSISTED_TRANSCRIPT_CHARS) {
    return bounded;
  }

  const transcript = bounded.transcript;
  const providerIds = Array.isArray(transcript.activeProviders) ? transcript.activeProviders : [];
  const oldRounds = Array.isArray(transcript.critiqueRounds) ? transcript.critiqueRounds : [];
  const lastRoundIndex = oldRounds.length - 1;
  const lastCompleteIndex = oldRounds.findLastIndex((round) =>
    providerIds.length > 0 && providerIds.every((providerId) => String(round?.[providerId] || "").trim()),
  );
  const recentRounds = oldRounds.map((round, index) => {
    if (index !== lastRoundIndex && index !== lastCompleteIndex) return {};
    return Object.fromEntries(Object.entries(round || {}).map(([speaker, value]) => [
      speaker, boundText(value, 1000),
    ]));
  });
  bounded.transcript = {
    sessionId: transcript.sessionId,
    phase: transcript.phase || "idle",
    originalQuestion: boundText(transcript.originalQuestion, 2000),
    ...(transcript.roundZero ? { roundZero: boundRoundZero(transcript.roundZero, 1000) } : {}),
    activeProviders: providerIds,
    departedProviders: Array.isArray(transcript.departedProviders)
      ? [...new Set(transcript.departedProviders.filter(isProviderId))]
      : [],
    departures: (Array.isArray(transcript.departures) ? transcript.departures : [])
      .slice(-100)
      .filter((departure) => isProviderId(departure?.provider))
      .map((departure) => ({
        provider: departure.provider,
        departedAt: Number.isFinite(departure.departedAt) ? departure.departedAt : 0,
      })),
    summaryProvider: transcript.summaryProvider,
    summaryStrategy: transcript.summaryStrategy,
    resolvedSummaryProvider: transcript.resolvedSummaryProvider,
    interactionStyle: transcript.interactionStyle,
    openEnded: transcript.openEnded === true,
    isTheaterMode: transcript.isTheaterMode === true,
    customPersonas: transcript.customPersonas || {},
    anonymousNames: transcript.anonymousNames || {},
    debateRounds: transcript.debateRounds,
    currentCritiqueRound: transcript.currentCritiqueRound,
    imposterProvider: transcript.imposterProvider || null,
    reveal: null,
    answers: Object.fromEntries(providerIds.map((providerId) => [
      providerId, boundText(transcript.answers?.[providerId], 1000),
    ])),
    critiques: recentRounds[0] || {},
    critiqueRounds: recentRounds.length ? recentRounds : [{}],
    errors: [],
    manualRepairs: (transcript.manualRepairs || []).slice(-100).map((repair) => ({
      ...repair, originalError: boundText(repair.originalError, 500),
    })),
  };
  return bounded;
}

function boundTranscript(transcript, textLimit) {
  const bounded = JSON.parse(JSON.stringify(transcript));
  bounded.originalQuestion = boundText(bounded.originalQuestion, textLimit);
  if (bounded.roundZero) bounded.roundZero = boundRoundZero(bounded.roundZero, textLimit);
  for (const key of ["answers", "critiques"]) {
    if (bounded[key] && typeof bounded[key] === "object") {
      bounded[key] = Object.fromEntries(Object.entries(bounded[key]).map(([providerId, value]) => [
        providerId,
        boundText(value, textLimit),
      ]));
    }
  }
  if (Array.isArray(bounded.critiqueRounds)) {
    bounded.critiqueRounds = bounded.critiqueRounds.map((round) =>
      Object.fromEntries(Object.entries(round || {}).map(([providerId, value]) => [
        providerId,
        boundText(value, textLimit),
      ])),
    );
  }
  if (Array.isArray(bounded.errors)) {
    bounded.errors = bounded.errors.map((error) => ({
      ...error,
      message: boundText(error?.message, textLimit),
      error: boundText(error?.error, textLimit),
    }));
  }
  if (Array.isArray(bounded.manualRepairs)) {
    bounded.manualRepairs = bounded.manualRepairs.slice(-100).map((repair) => ({
      ...repair, originalError: boundText(repair.originalError, textLimit),
    }));
  }
  return bounded;
}

function boundRoundZero(roundZero, textLimit) {
  return {
    userText: boundText(roundZero?.userText, textLimit),
    sources: (Array.isArray(roundZero?.sources) ? roundZero.sources : []).filter((source) => isProviderId(source?.provider))
      .slice(0, PROVIDERS.length).map((source) => ({
        provider: source.provider, content: boundText(source.content, textLimit), messageCount: source.messageCount,
      })),
  };
}

function boundText(value, limit) {
  const text = String(value || "");
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

async function setProviderDiagnostic(providerId, patch, runToken) {
  if (runToken !== undefined) {
    runController.assertCurrent(runToken);
  }
  runtimeState = {
    ...runtimeState,
    providerDiagnostics: updateProviderDiagnostic(runtimeState.providerDiagnostics, providerId, patch),
  };
  if (patch.stage === "error") {
    const previousEvents = Array.isArray(runtimeState.debugEvents) ? runtimeState.debugEvents : [];
    runtimeState = {
      ...runtimeState,
      debugEvents: [...previousEvents, {
        timestamp: Date.now(),
        provider: providerId,
        phase: patch.phase || "",
        stage: patch.debugStage || "error",
        code: patch.code || "PROVIDER_AUTOMATION_FAILED",
        message: boundText(patch.error, 500),
        debugDetails: sanitizeDebugDetails(patch.debugDetails),
      }].slice(-MAX_DEBUG_EVENTS),
    };
  }
  await publishState(runToken);
}

async function getRuntimeState() {
  await ensureRuntimeStateRetention();
  const entitlements = await getEntitlements();
  runtimeState = {
    ...runtimeState,
    entitlements,
  };

  return runtimeState;
}

function resumeCompletedRepairIfReady() {
  if (!runtimeState.repairPause || pendingReplyRepairs(runtimeState).length || runtimeState.busy
      || controlOperation || runController.isReserved()) return;
  // Also finish an already-repaired pause restored from the previous driver.
  try { validateNextRound("resume"); } catch (_error) { return; }
  const token = runController.reserve();
  const revision = lifecycleRevision;
  resumeRepairedMeeting(token)
    .catch(async (error) => {
      if (isRunCancelledError(error) || !runController.isCurrent(token) || lifecycleRevision !== revision) return;
      runtimeState = { ...runtimeState, busy: false, status: "error", phase: "done",
        message: `回覆已保存，但接續流程失敗：${error.message}` };
      await publishState(token);
    })
    .finally(() => runController.release(token));
}

async function ensureRuntimeInitialized() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const recovered = recoverSession(stored?.[STORAGE_KEY], createIdleState);
      runtimeState = recovered.state;
      runtimeState.departedProviders = Array.isArray(runtimeState.departedProviders)
        ? runtimeState.departedProviders
        : (Array.isArray(runtimeState.transcript?.departedProviders) ? runtimeState.transcript.departedProviders : []);
      cachedEntitlements = runtimeState.entitlements || cachedEntitlements;
      engine = recovered.engine || new DebateEngine();
      if (recovered.shouldPersist || !Number.isFinite(runtimeState.savedAt)) {
        await publishState();
      }
      if (recovered.engine) resumeCompletedRepairIfReady();
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
    const sheep = await chrome.storage.local.get(SHEEP_MODE_STORAGE_KEY);
    const entitlements = entitlementsForPlan(
      stored?.[ENTITLEMENT_STORAGE_KEY],
      typeof sheep?.[SHEEP_MODE_STORAGE_KEY] === "boolean"
        ? sheep[SHEEP_MODE_STORAGE_KEY]
        : stored?.[ENTITLEMENT_STORAGE_KEY] === "pro",
    );
    cachedEntitlements = entitlements;
    return entitlements;
  } catch (_error) {
    const previous = runtimeState.entitlements || cachedEntitlements;
    return entitlementsForPlan(previous?.plan, previous?.sheepMode ?? previous?.isPro);
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

async function collectLinkedRoundZero(message, token) {
  const linked = linkedContextProviders(requiredProviderIdsForMessage(message), message.hookedTabs);
  if (!linked.length) return null;
  if (linked.some((provider) => !Number.isInteger(message.hookedTabs[provider]) || message.hookedTabs[provider] <= 0)) {
    throw new Error("指定的對話分頁已失效，請重新選擇。");
  }
  runController.assertCurrent(token);
  runtimeState = { ...runtimeState, busy: true, status: "running", phase: "collecting-context",
    mode: message.mode || "fast", question: String(message.question || "").trim(),
    providerTabs: { ...runtimeState.providerTabs, ...Object.fromEntries(linked.map((provider) => [provider, message.hookedTabs[provider]])) },
    message: "正在收集指定分頁的第 0 輪對話…" };
  await publishState(token);
  const replies = await captureLinkedReplies({ ...message, readConversation: true }, token);
  runController.assertCurrent(token);
  const failed = replies.filter((reply) => !reply.ok);
  if (failed.length) {
    const detail = failed.map(({ provider, error }) => `${providerLabel(provider)}：${error}`).join("；");
    throw new Error(`指定分頁讀取失敗，尚未送出新提示：${detail}`);
  }
  return buildRoundZero(replies, message.question);
}

async function captureLinkedReplies(message, token) {
  if (runtimeState.repairPause || pendingReplyRepairs(runtimeState).length) {
    throw new Error("請先補齊故障回覆並繼續原流程，或重置目前會議。");
  }
  const providerIds = normalizeProviderIds(message.activeProviders);
  const tabs = message.hookedTabs || {};
  const linked = providerIds.filter((provider) => Number.isInteger(tabs[provider]) && tabs[provider] > 0);
  if (!linked.length) throw new Error("請先在「指定連線分頁」選擇要接續的 AI 對話。");
  const originalTab = await getCurrentActiveTab();
  const replies = [];
  try {
    for (const provider of linked) {
      runController.assertCurrent(token);
      try {
        const tab = await chrome.tabs.get(tabs[provider]);
        const config = PROVIDERS.find((item) => item.id === provider);
        if (!isProviderTabReady(tab, config) || isProviderLoginTab(tab, config)) throw new Error("分頁網址已改變、尚未載入或需要登入。");
        await activateProviderTabForReadiness(tab);
        runController.assertCurrent(token);
        await ensureProviderContentScript(tab.id, { deadline: Date.now() + READINESS_TIMEOUT_MS });
        runController.assertCurrent(token);
        const response = await providerRpc(chrome.tabs.sendMessage(tab.id, {
          type: message.readConversation ? "aiDebate:readCurrentConversation" : "aiDebate:readCurrentReply", provider,
        }), "擷取目前發言", READINESS_TIMEOUT_MS);
        runController.assertCurrent(token);
        const emptyConversation = message.readConversation && response?.ok && response.empty === true && response.content === "";
        if (!emptyConversation && (!response?.ok || typeof response.content !== "string" || !response.content.trim())) {
          throw Object.assign(new Error(response?.error || "沒有可擷取的 AI 發言。"), { code: response?.code });
        }
        replies.push({ ok: true, provider, content: response.content,
          ...(message.readConversation ? { empty: emptyConversation, messageCount: response.messageCount } : {}) });
      } catch (error) {
        if (isRunCancelledError(error)) throw error;
        if (message.readConversation) {
          await setProviderDiagnostic(provider, { stage: "error", phase: "round-zero", debugStage: "collect-context",
            code: error.code || "PROVIDER_CONTEXT_READ_FAILED", error: error.message }, token);
        }
        replies.push({ ok: false, provider, error: error.message });
      }
    }
    runController.assertCurrent(token);
    return replies;
  } finally {
    await restoreActiveTab(originalTab);
  }
}

async function repairMeetingReply(message, token) {
  runController.assertCurrent(token);
  const transcript = runtimeState.transcript;
  if (!transcript || message.sessionId !== transcript.sessionId || message.originalQuestion !== transcript.originalQuestion) {
    throw new Error("會議已變更，請重新選擇要補回覆的訊息。");
  }
  const repairedEngine = DebateEngine.restore(transcript);
  let repaired;
  if (message.phase === "summary" || message.phase === "source-summary") {
    const isSourceSummary = message.phase === "source-summary";
    const previous = isSourceSummary && message.provider === runtimeState.sourceProvider
      ? runtimeState.sourceSummary : !isSourceSummary ? runtimeState.summaries?.[message.provider] : null;
    if (!isProviderId(message.provider) || !isRecoverableReply(previous) || previous !== message.expectedContent) {
      throw new Error("這段總結已變更或不是故障回覆，請重新確認。");
    }
    if (typeof message.content !== "string" || !message.content.trim() || message.content.length > MAX_MANUAL_REPLY_CHARS || isRecoverableReply(message.content)) {
      throw new Error("請貼上完整 AI 回覆（1–12,000 字元），不能貼上故障訊息。");
    }
    repairedEngine.state.manualRepairs = [...(repairedEngine.state.manualRepairs || []), {
      provider: message.provider, phase: message.phase, source: "manual", repairedAt: Date.now(), originalError: previous,
    }].slice(-100);
    repairedEngine.state.errors = repairedEngine.state.errors.map((error) => error.provider === message.provider && error.phase === message.phase
      ? { ...error, resolvedManually: true } : error);
    repaired = repairedEngine.snapshot();
  } else {
    repaired = repairedEngine.repairProviderReply({ ...message, sessionId: repairedEngine.state.sessionId });
  }
  runController.assertCurrent(token);
  engine = repairedEngine;
  runtimeState = {
    ...runtimeState,
    transcript: repaired,
    manuallyRecovered: true,
    repairDiscarded: false,
    // A previous summary/reveal used the failed message. Regenerate it explicitly.
    summary: "",
    summaries: message.phase === "summary" ? { ...runtimeState.summaries, [message.provider]: message.content.trim() }
      : runtimeState.repairPause?.target === "summary" ? runtimeState.summaries : {},
    sourceSummary: message.phase === "source-summary" ? message.content.trim() : runtimeState.sourceSummary,
    sourceRepair: message.phase === "source-summary" ? repaired.manualRepairs.at(-1) : runtimeState.sourceRepair,
    reveal: message.phase === "reveal" ? repaired.reveal : null,
    status: "waiting_for_user", phase: "waiting_for_user", busy: false,
    message: `${providerLabel(message.provider)} 的回覆已手動補入；可繼續討論或重新總結。`,
    errors: runtimeState.errors.map((error) => error.provider === message.provider && error.phase === message.phase
      ? { ...error, resolvedManually: true } : error),
  };
  if (runtimeState.repairPause) {
    const pending = pendingReplyRepairs(runtimeState).length;
    runtimeState.message = pending
      ? `回覆已補入，還有 ${pending} 段故障回覆待補齊；會議保持暫停。`
      : "故障回覆已補齊，正在自動接續原流程…";
  }
  if (runtimeState.providerDiagnostics?.[message.provider]?.phase === message.phase) {
    runtimeState.providerDiagnostics = updateProviderDiagnostic(runtimeState.providerDiagnostics, message.provider, {
      stage: "manual-recovered", error: "", phase: message.phase,
    });
  }
  await publishState(token);
  return { ok: true, state: runtimeState };
}

function validateNextRound(action) {
  if (runtimeState.phase !== "waiting_for_user") {
    throw new Error("目前沒有等待下一步的互動辯論");
  }
  if (runtimeState.repairPause) {
    if (action !== "resume") throw new Error("會議已因故障暫停，請先補齊回覆，再按「繼續原流程」。");
    if (pendingReplyRepairs(runtimeState).length) throw new Error("還有故障回覆待補齊，會議繼續保持暫停。");
    const pause = runtimeState.repairPause;
    const plan = pause.resumePlan;
    if (!Array.isArray(pause.remainingJobs) || pause.remainingJobs.length > 5 ||
        !["answer", "critique", "summary", "reveal", "source-summary"].includes(pause.target) ||
        !["interactive", "planned", "summary", "reveal", "source-summary"].includes(plan?.type) ||
        (plan.type === "planned" && (!Number.isInteger(plan.nextRound) || plan.nextRound < 1 || plan.nextRound > engine.debateRounds + 1)) ||
        pause.remainingJobs.some((job) => !isProviderId(job?.provider) || typeof job.prompt !== "string" || !job.prompt.trim())) {
      throw new Error("暫停紀錄不完整，請結束目前會議後重新開始。");
    }
    return;
  }
  if (pendingReplyRepairs(runtimeState).length) throw new Error("請先補齊故障回覆，再繼續討論或總結。");
  if (runtimeState.mode !== "chat" && runtimeState.mode !== "theater" && runtimeState.mode !== "summary" && !runtimeState.manuallyRecovered) {
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
  const normalizedRound = normalizeRoundNumber(round);
  const total = normalizeRoundNumber(totalRounds);
  return total > 1 ? `第 ${normalizedRound}/${total} 輪互評` : "互評";
}

function critiqueRoundFromPhase(phase) {
  const match = String(phase || "").match(/^critique(?:-(\d+))?$/);
  return normalizeRoundNumber(match?.[1] || 1);
}

function createRunId(job) {
  return `${job.provider}:${job.phase}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function providerResponseError(response, fallbackMessage) {
  const error = new Error(response?.error || fallbackMessage);
  error.code = response?.code || "PROVIDER_AUTOMATION_FAILED";
  error.providerContent = response?.providerContent || "";
  error.debugDetails = sanitizeDebugDetails(response?.debugDetails);
  return error;
}

function sanitizeDebugDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  const safe = {};
  for (const key of SAFE_DEBUG_DETAIL_KEYS) {
    const value = details[key];
    if (typeof value === "string") safe[key] = boundText(value, 300);
    else if (typeof value === "number" && Number.isFinite(value)) safe[key] = value;
    else if (typeof value === "boolean") safe[key] = value;
  }
  return Object.keys(safe).length ? safe : undefined;
}

function createRunCancelledError() {
  const error = new Error("本次會議已停止");
  error.code = "RUN_CANCELLED";
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
