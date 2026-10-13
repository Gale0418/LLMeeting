import { DebateEngine } from "./debateEngine.js";
import { normalizeProviderIds } from "../shared/providers.js";
import { isRecoverableReply } from "../shared/meetingRecovery.js";

const INTERRUPTED_MESSAGE = "Chrome 背景程序在執行期間中斷，請重新開始這次操作。";
const INVALID_SESSION_MESSAGE = "無法恢復先前對話，已回到待命狀態。";
const EXPIRED_SESSION_MESSAGE = "先前的本機辯論紀錄已超過 24 小時，已自動清除。";
const RECOVERY_REPAIR_MESSAGE = "背景程序中斷，已暫停接續：請確認原 AI 頁面是否已回答，並手動貼回故障項目的回覆；系統不會自動重送可能已送出的提示。";
export const SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;

function interruptedProviderReply(engine, provider, phase) {
  return phase === "first-round"
    ? engine.snapshot().answers?.[provider]
    : engine.snapshot().critiqueRounds?.[critiqueRoundFromPhase(phase) - 1]?.[provider];
}

function critiqueRoundFromPhase(phase) {
  const match = /^critique(?:-(\d+))?$/.exec(phase || "");
  return match ? Number(match[1] || 1) : 0;
}

function recoverInterruptedDebate(normalized, checkpoint) {
  const phase = checkpoint?.phase;
  const round = critiqueRoundFromPhase(phase);
  const firstRound = phase === "first-round";
  const supportedStage = ["submitting", "submitted", "collecting"].includes(checkpoint?.stage);

  if (!supportedStage || (!firstRound && !round) || !normalized.transcript) return null;

  let engine;
  try {
    engine = DebateEngine.restore(normalized.transcript);
  } catch (_error) {
    return null;
  }

  const providers = engine.participatingProviders;
  const originalQuestion = engine.snapshot().originalQuestion;
  if (!providers.includes(checkpoint.provider) || !originalQuestion?.trim()) return null;
  if (firstRound && engine.snapshot().interactionStyle === "imposter") return null;
  if (!firstRound && round > engine.snapshot().critiqueRounds.length) return null;

  const jobsEngine = DebateEngine.restore(normalized.transcript);
  let phaseJobs;
  try {
    phaseJobs = firstRound
      ? jobsEngine.start(originalQuestion)
      : jobsEngine.buildCritiqueJobs(round);
  } catch (_error) {
    return null;
  }

  const diagnostics = normalized.providerDiagnostics || {};
  const checkpointProvider = checkpoint.provider;
  const uncertainStages = new Set(["submitting-prompt", "submitted", "waiting-response", "received", "error"]);
  const notStartedStages = new Set(["idle", "opening-tab", "activating-tab"]);
  const faultProviders = new Set();
  const remainingJobs = [];
  const target = firstRound ? "answer" : "critique";

  for (const provider of providers) {
    const reply = interruptedProviderReply(engine, provider, phase);
    if (typeof reply === "string" && reply.trim()) continue;

    const diagnostic = diagnostics[provider];
    const samePhase = diagnostic?.phase === phase;
    const mayHaveBeenSent = provider === checkpointProvider ||
      (samePhase && uncertainStages.has(diagnostic?.stage));
    if (mayHaveBeenSent) {
      faultProviders.add(provider);
      continue;
    }

    const hasNotStarted = !diagnostic || !samePhase || !diagnostic.stage ||
      notStartedStages.has(diagnostic.stage);
    if (hasNotStarted) {
      const job = phaseJobs.find((candidate) => candidate.provider === provider);
      if (job) remainingJobs.push(job);
    }
  }

  for (const provider of faultProviders) {
    const existing = interruptedProviderReply(engine, provider, phase);
    if (isRecoverableReply(existing)) continue;
    engine.markProviderError(provider, phase,
      "背景程序中斷，可能已送出或已收到回答，請從原 AI 頁面手動貼回；不會自動重送。");
  }

  const mode = normalized.mode;
  const scheduler = mode === "basic" ? "sequential" :
    ["fast", "summary", "chat", "theater"].includes(mode) ? "fast" : null;
  if (!scheduler) return null;
  const interactiveMode = mode === "chat" || mode === "theater"
    ? true
    : typeof normalized.interactiveMode === "boolean" && normalized.interactiveMode;
  const nextRound = firstRound ? 1 : round + 1;
  const resumeType = firstRound && mode === "chat" && interactiveMode ? "interactive" : "planned";
  const transcript = engine.snapshot();
  const errors = [...normalized.errors];
  for (const provider of faultProviders) {
    const existing = interruptedProviderReply(engine, provider, phase);
    if (isRecoverableReply(existing) && normalized.errors.some((error) =>
      error?.provider === provider && error?.phase === phase)) continue;
    errors.push({ provider, phase, message: existing || "背景程序中斷，等待手動貼回 AI 回覆。" });
  }

  return {
    state: {
      ...normalized,
      transcript,
      busy: false,
      status: "waiting_for_user",
      phase: "waiting_for_user",
      workflowCheckpoint: null,
      repairPause: {
        target,
        pausedPhase: phase,
        remainingJobs,
        resumePlan: { type: resumeType, nextRound, scheduler, interactiveMode },
      },
      errors,
      message: RECOVERY_REPAIR_MESSAGE,
    },
    engine,
    shouldPersist: true,
  };
}

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
    const repaired = recoverInterruptedDebate(normalized, checkpoint);
    if (repaired) return repaired;
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
