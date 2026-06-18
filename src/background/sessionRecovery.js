import { DebateEngine } from "./debateEngine.js";

const INTERRUPTED_MESSAGE = "Chrome 背景程序在執行期間中斷，請重新開始這次操作。";
const INVALID_SESSION_MESSAGE = "無法恢復先前對話，已回到待命狀態。";

export function recoverSession(storedState, createIdleState) {
  if (!storedState) {
    return { state: createIdleState(), engine: null, shouldPersist: false };
  }

  if (storedState.busy || storedState.status === "running") {
    return {
      state: {
        ...storedState,
        busy: false,
        status: "error",
        phase: "done",
        message: INTERRUPTED_MESSAGE,
        errors: [
          ...(Array.isArray(storedState.errors) ? storedState.errors : []),
          { message: INTERRUPTED_MESSAGE },
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
