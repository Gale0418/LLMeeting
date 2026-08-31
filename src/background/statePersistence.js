export function degradeStateForStorage(state) {
  if (!state || typeof state !== "object") {
    return state;
  }

  const copy = { ...state };

  if (copy.transcript && typeof copy.transcript === "object") {
    const rounds = Array.isArray(copy.transcript.rounds) ? copy.transcript.rounds : [];
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

    copy.transcript = {
      ...copy.transcript,
      rounds: slicedRounds,
    };
  }

  if (typeof copy.summary === "string" && copy.summary.length > 3000) {
    copy.summary = copy.summary.slice(0, 3000) + "... (已截斷)";
  }

  if (typeof copy.sourceSummary === "string" && copy.sourceSummary.length > 3000) {
    copy.sourceSummary = copy.sourceSummary.slice(0, 3000) + "... (已截斷)";
  }

  return copy;
}

export async function safePersistState(chromeStorage, state, storageKey) {
  if (!chromeStorage?.local?.set) {
    return false;
  }

  const payload = typeof storageKey === "string" ? { [storageKey]: state } : { state };

  try {
    await chromeStorage.local.set(payload);
    return true;
  } catch (_firstError) {
    // Attempt degraded persistence for long chats / quota exceeded
    try {
      const degradedState = degradeStateForStorage(state);
      const degradedPayload = typeof storageKey === "string" ? { [storageKey]: degradedState } : { state: degradedState };
      await chromeStorage.local.set(degradedPayload);
      return true;
    } catch (_degradedError) {
      // Fallback to minimal state without transcript history to prevent recursive failure
      try {
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
