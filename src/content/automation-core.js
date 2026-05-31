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

  globalThis.aiDebateAutomationCore = {
    assistantSnapshot,
    hasFreshAssistantResponse,
  };
})();
