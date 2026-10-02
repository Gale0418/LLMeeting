export function createStateStorageQueue() {
  let tail = Promise.resolve();
  return (operation) => {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  };
}

export function degradeStateForStorage(state) {
  if (!state || typeof state !== "object") {
    return state;
  }

  const copy = { ...state };

  if (copy.transcript && typeof copy.transcript === "object") {
    const transcript = { ...copy.transcript };
    const rounds = Array.isArray(transcript.rounds) ? transcript.rounds : [];
    const slicedRounds = rounds.slice(-3).map((round) => {
      if (!round || typeof round !== "object") return round;
      const responses = round.responses && typeof round.responses === "object"
        ? Object.fromEntries(
            Object.entries(round.responses).map(([providerId, resp]) => {
              if (resp && typeof resp === "object") {
                return [
                  providerId,
                  {
                    ...resp,
                    text: typeof resp.text === "string" ? resp.text.slice(0, 1000) : resp.text,
                  },
                ];
              }
              return [providerId, resp];
            })
          )
        : round.responses;

      return {
        ...round,
        responses,
      };
    });

    if (Array.isArray(transcript.rounds)) transcript.rounds = slicedRounds;

    // Current DebateEngine snapshots use critiqueRounds rather than rounds.
    // Keep every round slot so recovery preserves round numbers, while shrinking
    // older text more aggressively than the latest discussion.
    if (Array.isArray(transcript.critiqueRounds)) {
      const latestIndex = transcript.critiqueRounds.length - 1;
      const latestCompleteIndex = transcript.critiqueRounds.findLastIndex((round) =>
        Array.isArray(transcript.activeProviders) &&
        transcript.activeProviders.length > 0 &&
        transcript.activeProviders.every((provider) => String(round?.[provider] || "").trim()),
      );
      transcript.critiqueRounds = transcript.critiqueRounds.map((round, index) =>
        Object.fromEntries(Object.entries(round || {}).map(([speaker, value]) => [
          speaker,
          clipStoredText(value, index === latestIndex || index === latestCompleteIndex ? 1000 : 200),
        ])),
      );
      transcript.critiques = transcript.critiqueRounds[0] || {};
    }
    if (transcript.answers && typeof transcript.answers === "object") {
      transcript.answers = Object.fromEntries(Object.entries(transcript.answers).map(([speaker, value]) => [
        speaker,
        clipStoredText(value, 1000),
      ]));
    }
    if (Array.isArray(transcript.errors)) {
      transcript.errors = transcript.errors.map((error) => ({
        ...error,
        message: clipStoredText(error?.message, 500),
      }));
    }
    copy.transcript = transcript;
  }

  if (typeof copy.summary === "string" && copy.summary.length > 3000) {
    copy.summary = copy.summary.slice(0, 3000) + "... (已截斷)";
  }
  if (copy.summaries && typeof copy.summaries === "object") {
    copy.summaries = Object.fromEntries(Object.entries(copy.summaries).map(([provider, text]) => [
      provider, clipStoredText(text, 1000),
    ]));
  }

  if (typeof copy.sourceSummary === "string" && copy.sourceSummary.length > 3000) {
    copy.sourceSummary = copy.sourceSummary.slice(0, 3000) + "... (已截斷)";
  }

  return copy;
}

function clipStoredText(value, limit) {
  const text = String(value || "");
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export async function safePersistState(chromeStorage, state, storageKey, { isCurrent = () => true } = {}) {
  if (!chromeStorage?.local?.set) {
    return false;
  }

  const payload = typeof storageKey === "string" ? { [storageKey]: state } : { state };

  try {
    if (!isCurrent()) return false;
    await chromeStorage.local.set(payload);
    return true;
  } catch (_firstError) {
    // Attempt degraded persistence for long chats / quota exceeded
    try {
      if (!isCurrent()) return false;
      const degradedState = degradeStateForStorage(state);
      const degradedPayload = typeof storageKey === "string" ? { [storageKey]: degradedState } : { state: degradedState };
      await chromeStorage.local.set(degradedPayload);
      return true;
    } catch (_degradedError) {
      // Do not replace a recoverable earlier checkpoint with transcript-free
      // metadata merely because this larger checkpoint exceeded the quota.
      try {
        if (!isCurrent()) return false;
        if (typeof chromeStorage.local.get !== "function") return false;
        const key = typeof storageKey === "string" ? storageKey : "state";
        const previous = await chromeStorage.local.get(key);
        if (previous?.[key]?.transcript) return false;
      } catch (_readError) {
        // Unknown is not empty: do not risk erasing an earlier checkpoint.
        return false;
      }
      // First save, or no recoverable prior state: retain minimal status.
      try {
        if (!isCurrent()) return false;
        const minimalState = {
          status: state?.status || "idle",
          busy: false,
          phase: state?.phase || "idle",
          activeProviders: Array.isArray(state?.activeProviders) ? state.activeProviders : [],
          message: state?.message || "Storage error",
          savedAt: Date.now(),
        };
        const minimalPayload = typeof storageKey === "string" ? { [storageKey]: minimalState } : { state: minimalState };
        await chromeStorage.local.set(minimalPayload);
        return true;
      } catch (_minimalError) {
        // Safe non-recursive catch: return false cleanly
        return false;
      }
    }
  }
}
