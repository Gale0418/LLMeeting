(() => {
  function assistantSnapshot(messages) {
    const normalized = Array.from(messages || [])
      .map((message) => String(message || "").trim())
      .filter(Boolean);

    return {
      count: normalized.length,
      lastText: normalized[normalized.length - 1] || "",
    };
  }

  function hasFreshAssistantResponse(baseline, current) {
    return current.count > baseline.count || current.lastText !== baseline.lastText;
  }

  function isPromptEcho(prompt, candidate) {
    return normalizeWhitespace(prompt) === normalizeWhitespace(candidate);
  }

  function formatStageError(stage, error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    return `[${stage}] ${message}`;
  }

  function normalizeProviderResponse(providerId, text) {
    const value = String(text || "");
    if (providerId !== "gemini") {
      return value;
    }

    return value.replace(/(?:^|\r?\n)[ \t]*image[ \t]*$/i, "").trimEnd();
  }

  function matchesProviderLocation(locationLike, config) {
    const hostname = String(locationLike?.hostname || "").toLowerCase();
    const pathname = String(locationLike?.pathname || "/");
    const hostMatches = (host) => hostname === host || hostname.endsWith(`.${host}`);

    if (Array.isArray(config?.locations)) {
      return config.locations.some(({ host, pathPrefixes }) =>
        hostMatches(host) && (
          !Array.isArray(pathPrefixes) ||
          pathPrefixes.length === 0 ||
          pathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
        ),
      );
    }
    return Array.isArray(config?.hosts) && config.hosts.some(hostMatches);
  }

  async function ensurePromptSubmitted({ clickButton, pressEnter, confirmSubmission }) {
    const clicked = Boolean(await clickButton());
    let method = clicked ? "button" : "enter";
    if (!clicked) {
      await pressEnter();
    }

    let evidence = await confirmSubmission();
    if (evidence) {
      return { method, evidence, retried: false };
    }

    if (clicked) {
      await pressEnter();
      method = "enter";
      evidence = await confirmSubmission();
      if (evidence) {
        return { method, evidence, retried: true };
      }
    }

    throw new Error("Gemini 未確認送出");
  }

  globalThis.aiDebateAutomationCore = {
    assistantSnapshot,
    ensurePromptSubmitted,
    formatStageError,
    hasFreshAssistantResponse,
    isPromptEcho,
    matchesProviderLocation,
    normalizeProviderResponse,
  };

  function normalizeWhitespace(text) {
    return String(text || "").trim().replace(/\s+/g, " ");
  }
})();
