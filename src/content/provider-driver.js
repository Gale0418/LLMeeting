(() => {
  const DRIVER_CONTRACT_VERSION = 1;
  const DRIVER_VERSION = "0.5.0-driver.1";

  function selectCandidate(candidates = [], options = {}) {
    const threshold = Number(options.threshold ?? 0);
    const ambiguityMargin = Math.max(0, Number(options.ambiguityMargin ?? 0));
    const deduped = [];
    const byElement = new Map();

    for (const candidate of candidates) {
      if (!candidate?.element || !Number.isFinite(candidate.score)) continue;
      const existing = byElement.get(candidate.element);
      if (!existing) {
        const normalized = { ...candidate };
        byElement.set(candidate.element, normalized);
        deduped.push(normalized);
      } else if (candidate.score > existing.score) {
        Object.assign(existing, candidate);
      } else if (candidate.strategy && !existing.strategies?.includes(candidate.strategy)) {
        existing.strategies = [...(existing.strategies || [existing.strategy].filter(Boolean)), candidate.strategy];
      }
    }

    deduped.sort((left, right) => right.score - left.score);
    const best = deduped[0] || null;
    const runnerUp = deduped[1] || null;
    const ambiguous = Boolean(
      best && runnerUp && best.score - runnerUp.score < ambiguityMargin,
    );
    const accepted = Boolean(best && best.score >= threshold && !ambiguous);

    return {
      element: accepted ? best.element : null,
      candidate: best?.element || null,
      strategy: best?.strategy || "none",
      score: best?.score || 0,
      candidateCount: deduped.length,
      ambiguous,
      accepted,
      evidence: createResolutionEvidence(best, runnerUp, deduped.length, ambiguous, threshold),
    };
  }

  function createResolutionEvidence(best, runnerUp, candidateCount, ambiguous, threshold) {
    return {
      strategy: best?.strategy || "none",
      score: best?.score || 0,
      runnerUpScore: runnerUp?.score || 0,
      candidateCount,
      ambiguous,
      threshold,
      signals: [...new Set(best?.signals || [])].slice(0, 12),
      fingerprint: best?.fingerprint || null,
    };
  }

  function elementFingerprint(element) {
    if (!element) return null;
    const attributes = [
      ["role", element.getAttribute?.("role")],
      ["testid", element.getAttribute?.("data-testid")],
      ["contenteditable", element.getAttribute?.("contenteditable")],
      ["type", element.getAttribute?.("type") || element.type],
    ].filter(([, value]) => value).map(([key, value]) => `${key}:${String(value).slice(0, 80)}`);
    return {
      tag: String(element.tagName || "").toLowerCase(),
      attributes,
    };
  }

  function confidenceForResolution(resolution) {
    if (!resolution?.element || resolution.ambiguous) return "none";
    if (/^(preferred|configured)/.test(resolution.strategy || "")) return "high";
    return resolution.score >= 100 ? "high" : resolution.score >= 75 ? "medium" : "low";
  }

  function createCapabilityContract(provider, details = {}) {
    return {
      contractVersion: DRIVER_CONTRACT_VERSION,
      driverVersion: DRIVER_VERSION,
      provider: String(provider || ""),
      model: {
        policy: "site-default",
        required: false,
        selectedLabel: details.selectedModelLabel || null,
      },
      surfaces: details.surfaces || {},
    };
  }

  globalThis.aiDebateProviderDriver = Object.freeze({
    DRIVER_CONTRACT_VERSION,
    DRIVER_VERSION,
    confidenceForResolution,
    createCapabilityContract,
    elementFingerprint,
    selectCandidate,
  });
})();
