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

  function formatStageError(stage, error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    return `[${stage}] ${message}`;
  }

  globalThis.aiDebateAutomationCore = {
    assistantSnapshot,
    formatStageError,
    hasFreshAssistantResponse,
  };
})();
