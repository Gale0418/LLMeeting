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

  globalThis.aiDebateAutomationCore = {
    assistantSnapshot,
    formatStageError,
    hasFreshAssistantResponse,
    isPromptEcho,
    normalizeProviderResponse,
  };

  function normalizeWhitespace(text) {
    return String(text || "").trim().replace(/\s+/g, " ");
  }
})();
