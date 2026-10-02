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
const READINESS_TIMEOUT_MS = 15000;
const PROVIDER_CONTROL_TIMEOUT_MS = 3000;
const MAX_PERSISTED_TRANSCRIPT_CHARS = 120000;
const MAX_PERSISTED_TEXT_CHARS = 12000;

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
    const { question, mode = "fast", activeProviders, summaryProvider, summaryStrategy, debateRounds, skipSummary, customPersonas, hookedTabs, interactionStyle, interactiveMode } = message;
    const startAction = {
      basic: startFastDebate, // Compatibility for older panels; new runs use Fast.
      fast: startFastDebate,
      summary: startSummaryDebate,
      chat: startChatDebate,
      theater: startTheaterDebate,
    }[mode];

    if (!startAction) {
      sendResponse({ ok: false, error: `Unknown debate mode: ${mode}`, state: runtimeState });
      return false;
    }

    let reservationToken;
    let runToken;
    let preflight;
    if (runtimeState.busy || runController.isReserved() || controlOperation) {
      sendResponse({ ok: false, code: "BUSY", error: "目前已有辯論正在進行", state: runtimeState });
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
          message: "模型已就緒，準備啟航",
          providerTabs: { ...runtimeState.providerTabs, ...preflight.providerTabs },
          preflightResults: preflight.results,
        };
        await publishState(reservationToken);
        runToken = runController.claim(reservationToken);
        return startAction(question, { activeProviders, summaryProvider, summaryStrategy, debateRounds, skipSummary, customPersonas, hookedTabs, interactionStyle, interactiveMode, preflight, runToken });
      })
      .then((state) => sendResponse({ ok: true, state }))
      .catch(async (error) => {
        if (reservationToken && !runToken && (!runController.isCurrent(reservationToken) || lifecycleRevision !== startRevision)) {
          sendResponse({ ok: false, code: "RUN_CANCELLED", error: "本次會議已停止", state: runtimeState });
          return;
        }
        if (!runToken) {
          if (!reservationToken || !runController.isCurrent(reservationToken) || lifecycleRevision !== startRevision) {
            sendResponse({ ok: false, code: "RUN_CANCELLED", error: "本次會議已停止", state: runtimeState });
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
            sendResponse({ ok: false, code: "RUN_CANCELLED", error: publishError.message, state: runtimeState });
            return;
          }
          runController.release(reservationToken);
          sendResponse({ ok: false, code: error.code || "ERROR", error: error.message, results: runtimeState.preflightResults, state: runtimeState });
          return;
        }
        if (isRunCancelledError(error) || (runToken && !runController.isCurrent(runToken))) {
          sendResponse({ ok: false, code: "RUN_CANCELLED", error: "本次會議已停止", state: runtimeState });
          return;
        }

        const isProRequired = error.code === "PRO_REQUIRED";
        const entitlements = await getEntitlements();
        if (runToken && (!runController.isCurrent(runToken) || lifecycleRevision !== startRevision || controlOperation)) {
          sendResponse({ ok: false, code: "RUN_CANCELLED", error: "本次會議已停止", state: runtimeState });
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
          sendResponse({ ok: false, code: "RUN_CANCELLED", error: publishError.message, state: runtimeState });
          return;
        }
        runController.cancel();
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
        return handleNextRound(message.action, message.text, runToken);
      })
      .then((state) => sendResponse({ ok: state.status !== "error", state }))
      .catch(async (error) => {
        if (!runToken) {
          sendResponse({ ok: false, code: error.code || "ERROR", error: error.message, state: runtimeState });
          return;
        }
        if (
          isRunCancelledError(error) ||
          !runController.isCurrent(runToken) ||
          controlOperation ||
          lifecycleRevision !== runRevision
        ) {
          sendResponse({ ok: false, code: "RUN_CANCELLED", error: "本次會議已停止", state: runtimeState });
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
          sendResponse({ ok: false, code: "RUN_CANCELLED", error: publishError.message, state: runtimeState });
          return;
        }
        runController.cancel();
        sendResponse({ ok: false, error: error.message, state: runtimeState });
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
        if (runtimeState.busy || hadActiveOperation) {
          runtimeState = {
            ...runtimeState,
            busy: false,
            status: "idle",
            phase: "idle",
      message: "本次會議已停止",
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
    transcript: null,
    summary: "",
    reveal: null,
    sourceProvider: "",
    sourceSummary: "",
    errors: [],
    activeProviders,
    summaryProvider: "chatgpt",
    summaryStrategy: "standard",
    summaries: {},
    debateRounds: 1,
    currentCritiqueRound: 0,
    entitlements,
    skipSummary: false,
    workflowCheckpoint: null,
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
  if (message.mode !== "summary" && !String(message.question || "").trim()) {
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
    question: trimmedQuestion,
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

  for (let round = 1; round <= engine.debateRounds; round += 1) {
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
    message: runtimeState.summaryStrategy === "allAnonymous" ? "最終回合：全員匿名裁判各自總結" : `最終回合：請 ${providerLabel(runtimeState.summaryProvider)} 總結`,
    transcript: engine.snapshot(),
  };
  await publishState(runToken);

  const finalResult = await runFinalSummary(runToken);
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
    return sendJob(buildRuntimeFinalJob(), runToken);
  }
  runtimeState = { ...runtimeState, summaries: {} };
  const jobs = engine.buildFinalJobs();
  const results = await runFastProviderJobs(jobs, "summary", runToken);
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
    question: trimmedQuestion,
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

  return runDebateRounds(trimmedQuestion, { scheduler, runToken, interactiveMode: options.interactiveMode });
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
    question: String(userNote || "").trim(),
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
    message: runtimeState.summaryStrategy === "allAnonymous" ? "最終回合：全員匿名裁判各自總結" : `最終回合：請 ${providerLabel(runtimeState.summaryProvider)} 總結`,
    transcript: engine.snapshot(),
  };
  await publishState(runToken);

  const finalResult = await runFinalSummary(runToken);
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
      message: runtimeState.summaryStrategy === "allAnonymous" ? "全員匿名裁判各自總結" : `請 ${providerLabel(runtimeState.summaryProvider)} 總結`,
      transcript: engine.snapshot(),
    };
    await publishState(runToken);
    const finalResult = await runFinalSummary(runToken);
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
  const results = [];
  for (const job of jobs) {
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
  return results;
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

const PROVIDER_CONTENT_SCRIPT_VERSION = "0.5.0-driver.5";
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
    error.rpcStage = stage;
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

  const tab = await chrome.tabs.get(tabId);
  try {
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
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (error) {
    const wrapped = new Error(`${error.message}（目前網址：${tab.url || tab.pendingUrl || "unknown"}）`);
    wrapped.code = error.code || "CONTENT_SCRIPT_UNAVAILABLE";
    wrapped.rpcStage = error.rpcStage;
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
    phase: transcript.phase || "idle",
    originalQuestion: boundText(transcript.originalQuestion, 2000),
    activeProviders: providerIds,
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
  };
  return bounded;
}

function boundTranscript(transcript, textLimit) {
  const bounded = JSON.parse(JSON.stringify(transcript));
  bounded.originalQuestion = boundText(bounded.originalQuestion, textLimit);
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
  return bounded;
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
