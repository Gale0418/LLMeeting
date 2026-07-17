import { DebateEngine } from "./debateEngine.js";

const INTERRUPTED_MESSAGE = "Chrome 背景程序在執行期間中斷，請重新開始這次操作。";
const INVALID_SESSION_MESSAGE = "無法恢復先前對話，已回到待命狀態。";
const EXPIRED_SESSION_MESSAGE = "先前的本機辯論紀錄已超過 24 小時，已自動清除。";
export const SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;

export function isSessionExpired(storedState, now = Date.now()) {
  return Boolean(
    storedState &&
    Number.isFinite(storedState.savedAt) &&
    now - storedState.savedAt > SESSION_RETENTION_MS
  );
}

export function recoverSession(storedState, createIdleState, now = Date.now()) {
  if (!storedState) {
    return { state: createIdleState(), engine: null, shouldPersist: false };
  }

  if (isSessionExpired(storedState, now)) {
    return {
      state: {
        ...createIdleState(storedState.activeProviders),
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

  if (storedState.busy || storedState.status === "running") {
    const checkpoint = storedState.workflowCheckpoint;
    const checkpointNote = checkpoint?.provider
      ? ` 最後進度：${checkpoint.provider}／${checkpoint.phase || checkpoint.stage || "unknown"}。`
      : "";
    const interruptedMessage = `${INTERRUPTED_MESSAGE}${checkpointNote}`;
    return {
      state: {
        ...storedState,
        busy: false,
        status: "error",
        phase: "done",
        message: interruptedMessage,
        errors: [
          ...(Array.isArray(storedState.errors) ? storedState.errors : []),
          { message: interruptedMessage },
        ],
      },
      engine: null,
      shouldPersist: true,
    };
  }

  if (storedState.status === "waiting_for_user") {
    try {
      return {
        state: { ...storedState, busy: false },
        engine: DebateEngine.restore(storedState.transcript),
        shouldPersist: false,
      };
    } catch (_error) {
      return {
        state: {
          ...createIdleState(storedState.activeProviders),
          message: INVALID_SESSION_MESSAGE,
        },
        engine: null,
        shouldPersist: true,
      };
    }
  }

  return { state: { ...storedState, busy: false }, engine: null, shouldPersist: false };
}
