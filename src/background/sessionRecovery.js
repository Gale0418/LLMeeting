import { DebateEngine } from "./debateEngine.js";
import { normalizeProviderIds } from "../shared/providers.js";

const INTERRUPTED_MESSAGE = "Chrome 背景程序在執行期間中斷，請重新開始這次操作。";
const INVALID_SESSION_MESSAGE = "無法恢復先前對話，已回到待命狀態。";
const EXPIRED_SESSION_MESSAGE = "先前的本機辯論紀錄已超過 24 小時，已自動清除。";
export const SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;

export function isSessionExpired(storedState, now = Date.now()) {
  return Boolean(
    storedState &&
    typeof storedState === "object" &&
    Number.isFinite(storedState.savedAt) &&
    now - storedState.savedAt > SESSION_RETENTION_MS
  );
}

export function normalizeSnapshot(storedState, createIdleState) {
  if (!storedState || typeof storedState !== "object" || Array.isArray(storedState)) {
    return null;
  }

  const activeProviders = Array.isArray(storedState.activeProviders)
    ? storedState.activeProviders
    : undefined;

  const idle = typeof createIdleState === "function" ? createIdleState(activeProviders) : {};

  return {
    ...idle,
    ...storedState,
    activeProviders: normalizeProviderIds(activeProviders, idle.activeProviders || undefined),
    busy: Boolean(storedState.busy),
    status: typeof storedState.status === "string" ? storedState.status : (idle.status || "idle"),
    phase: typeof storedState.phase === "string" ? storedState.phase : (idle.phase || "done"),
    message: typeof storedState.message === "string" ? storedState.message : (idle.message || ""),
    errors: Array.isArray(storedState.errors) ? storedState.errors : [],
    savedAt: Number.isFinite(storedState.savedAt) ? storedState.savedAt : Date.now(),
  };
}

export function recoverSession(storedState, createIdleState, now = Date.now()) {
  if (!storedState || typeof storedState !== "object" || Array.isArray(storedState)) {
    return { state: createIdleState(), engine: null, shouldPersist: false };
  }

  const normalized = normalizeSnapshot(storedState, createIdleState);
  if (!normalized) {
    return { state: createIdleState(), engine: null, shouldPersist: false };
  }

  if (isSessionExpired(normalized, now)) {
    return {
      state: {
        ...createIdleState(normalized.activeProviders),
        transcript: null,
        summary: "",
        sourceSummary: "",
        workflowCheckpoint: null,
        message: EXPIRED_SESSION_MESSAGE,
      },
      engine: null,
      shouldPersist: true,
    };
  }

  if (normalized.busy || normalized.status === "running") {
    const checkpoint = normalized.workflowCheckpoint;
    const checkpointNote = checkpoint?.provider
      ? ` 最後進度：${checkpoint.provider}／${checkpoint.phase || checkpoint.stage || "unknown"}。`
      : "";
    const interruptedMessage = `${INTERRUPTED_MESSAGE}${checkpointNote}`;
    return {
      state: {
        ...normalized,
        busy: false,
        status: "error",
        phase: "done",
        message: interruptedMessage,
        errors: [
          ...normalized.errors,
          { message: interruptedMessage },
        ],
      },
      engine: null,
      shouldPersist: true,
    };
  }

  if (normalized.status === "waiting_for_user") {
    try {
      if (!normalized.transcript) {
        throw new Error("Missing transcript");
      }
      const engine = DebateEngine.restore(normalized.transcript);
      return {
        state: { ...normalized, busy: false },
        engine,
        shouldPersist: false,
      };
    } catch (_error) {
      return {
        state: {
          ...createIdleState(normalized.activeProviders),
          message: INVALID_SESSION_MESSAGE,
        },
        engine: null,
        shouldPersist: true,
      };
    }
  }

  return { state: { ...normalized, busy: false }, engine: null, shouldPersist: false };
}
