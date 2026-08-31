(() => {
  function assistantSnapshot(messages) {
    const normalized = Array.from(messages || [])
      .map((message) => {
        if (message && typeof message === "object") {
          const text = String(message.text || "").trim();
          return {
            text,
            identity: String(message.identity || ""),
          };
        }
        return { text: String(message || "").trim(), identity: "" };
      })
      .filter((message) => message.text);
    const last = normalized[normalized.length - 1] || { text: "", identity: "" };

    return {
      count: normalized.length,
      lastText: last.text,
      lastFingerprint: normalizeWhitespace(last.text).toLowerCase(),
      lastIdentity: last.identity,
    };
  }

  function hasFreshAssistantResponse(baseline, current) {
    return current.count > baseline.count || current.lastFingerprint !== baseline.lastFingerprint;
  }

  function isPromptEcho(prompt, candidate) {
    return normalizeWhitespace(prompt) === normalizeWhitespace(candidate);
  }

  function formatStageError(stage, error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    return `[${stage}] ${message}`;
  }

  function normalizeProviderResponse(providerId, text) {
    const value = String(text || "").replace(/\r\n?/g, "\n");
    const lines = value.split("\n");

    if (providerId === "chatgpt") {
      const withoutSurvey = removeStandaloneUiLines(lines, [
        /^到目前為止，這段對話有幫助嗎？$/,
        /^你是否喜歡這種個性？$/,
        /^So far, has this conversation been helpful\?$/i,
        /^Do you like this personality\?$/i,
      ]);
      return removeTrailingStandaloneUiLines(withoutSurvey, [
        /^資料來源$/,
        /^Sources$/i,
      ]).join("\n").trim();
    }

    if (providerId === "claude") {
      return normalizeClaudeResponse(lines);
    }

    if (providerId === "gemini") {
      return removeStandaloneUiLines(lines, [
        /^Gemini 說了$/,
      ]).join("\n")
        .replace(/(?:^|\n)[ \t]*image[ \t]*$/i, "")
        .trim();
    }

    if (providerId === "meta") {
      return removeStandaloneUiLines(lines, [
        /^顯示思考過程$/,
        /^Show thinking$/i,
      ]).join("\n").trim();
    }

    return value;
  }

  function normalizeClaudeResponse(lines) {
    const noisePatterns = [
      /^Thought for \d+(?:\.\d+)?s$/i,
      /^Thought for \d+(?:\.\d+)? seconds?$/i,
      /^識別並拒絕了偽裝成思考的操縱企圖[。.]?$/,
      /^[\uE000-\uF8FF]+$/,
    ];
    const firstContentIndex = lines.findIndex((line) => line.trim());
    const firstContent = firstContentIndex >= 0 ? lines[firstContentIndex].trim() : "";
    const accessibilityLabel = firstContent.replace(/^Claude responded:\s*/i, "");
    const repeatedAnswerIndex = /^Claude responded:/i.test(firstContent)
      ? lines.findIndex((line, index) => index > firstContentIndex && line.trim() === accessibilityLabel)
      : -1;
    if (repeatedAnswerIndex >= 0) {
      return lines.slice(repeatedAnswerIndex).join("\n").trim();
    }

    let normalizedLines = removeStandaloneUiLines(lines, noisePatterns);

    if (firstContentIndex >= 0 && /^Claude responded:/i.test(lines[firstContentIndex].trim())) {
      const labelText = lines[firstContentIndex].trim().replace(/^Claude responded:\s*/i, "");
      const labelIndex = normalizedLines.findIndex((line) => /^Claude responded:/i.test(line.trim()));
      const withoutLabel = normalizedLines.filter((_line, index) => index !== labelIndex);
      normalizedLines = withoutLabel.some((line) => line.trim()) ? withoutLabel : [labelText];
    }

    return normalizedLines.join("\n").trim();
  }

  function removeStandaloneUiLines(lines, patterns) {
    return lines.filter((line) => !patterns.some((pattern) => pattern.test(line.trim())));
  }

  function removeTrailingStandaloneUiLines(lines, patterns) {
    const result = [...lines];
    while (result.length > 0 && !result[result.length - 1].trim()) {
      result.pop();
    }
    if (result.length > 0 && patterns.some((pattern) => pattern.test(result[result.length - 1].trim()))) {
      result.pop();
    }
    return result;
  }

  function providerErrorFingerprint(text) {
    return normalizeWhitespace(text).toLowerCase();
  }

  function hasFreshProviderError(baseline, text) {
    const fingerprint = providerErrorFingerprint(text);
    return Boolean(fingerprint) && !new Set(baseline || []).has(fingerprint);
  }

  function classifyProviderResponseError(providerId, text) {
    const value = providerErrorFingerprint(text);
    if (!value) {
      return null;
    }

    const patterns = [
      {
        code: "PROVIDER_QUOTA_EXCEEDED",
        message: `${providerId} 額度或使用上限已達`,
        tests: [
          /(?:usage|message|rate)\s+(?:limit|quota)\b(?:\s+has been)?\s+(?:reached|exceeded)/,
          /(?:you|you've|you have)\s+(?:have\s+)?(?:hit|reached)\s+your\s+(?:(?:usage|message)\s+)?(?:limit|quota)(?:\s+for\s+now)?/,
          /(?:out of|no)\s+(?:credits?|messages?)/,
          /(?:quota)\s+(?:reached|exceeded)/,
          /^(?:抱歉[，,\s]*)?額度(?:已)?(?:用完|耗盡|不足|達到上限)/,
          /^(?:抱歉[，,\s]*)?使用(?:量|次數)?(?:已)?達(?:到)?上限/,
        ],
      },
      {
        code: "PROVIDER_OVERLOADED",
        message: `${providerId} 服務目前超載`,
        tests: [
          /server(?:s)? (?:are |is )?(?:overloaded|over capacity|busy)/,
          /\bserver(?:s)?\b.*\b(?:reached|exceeded|at)\b.*\bcapacity\b/,
          /\bserver(?:s)?\b.*\bcapacity\b.*\b(?:reached|exceeded|full)\b/,
          /service (?:is )?(?:overloaded|temporarily unavailable)/,
          /too many requests/,
          /\b(?:temporary|temporarily)\s+high demand\b/,
          /\bhigh demand\b.*(?:try|retry|again|later|unavailable|capacity)/,
          /(?:something went wrong|temporary error).*(?:try|retry|again)/,
          /(?:please )?(?:try|retry) again (?:in a (?:few|moment)|later)/,
          /伺服器(?:目前)?(?:超載|忙碌).*(?:稍後|重試|再試)/,
          /服務(?:目前)?(?:超載|暫時無法使用).*(?:稍後|重試|再試)/,
          /(?:發生錯誤|暫時錯誤).*(?:重試|再試|稍後)/,
        ],
      },
      {
        code: "PROVIDER_PAGE_ERROR",
        message: `${providerId} 回覆失敗`,
        tests: [
          /^(?:error|failed|failure)(?:\s+(?:generating|to generate|loading|processing))?(?:\s+(?:the|a))?\s+(?:response|reply|answer)?[.!]?$/,
          /^(?:error|failed|failure)\s+(?:generating|to generate)\s+(?:response|reply|answer)\b/,
          /^(?:unable|cannot|can't|couldn't)\s+(?:to\s+)?(?:generate|load|process)\s+(?:a\s+)?(?:response|reply|answer)\b/,
          /^something went wrong[.!]?$/,
          /^(?:發生錯誤|回覆失敗|無法(?:產生|生成|載入)回覆)[。.!]?$/,
        ],
      },
    ];

    for (const candidate of patterns) {
      if (candidate.tests.some((pattern) => pattern.test(value))) {
        return { code: candidate.code, message: candidate.message };
      }
    }
    return null;
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

  function createAutomationAbortError() {
    const error = new Error("Provider automation aborted");
    error.code = "PROVIDER_AUTOMATION_ABORTED";
    return error;
  }

  async function ensurePromptSubmitted({
    clickButton,
    pressEnter,
    promptStillPresent = async () => true,
    confirmSubmission,
    providerName = "Gemini",
  }) {
    const clicked = Boolean(await clickButton());
    let method = clicked ? "button" : "enter";
    if (!clicked) {
      if (!await promptStillPresent()) {
        throw createSubmissionUnconfirmedError(providerName);
      }
      await pressEnter();
    }

    let evidence = await confirmSubmission();
    if (evidence) {
      return { method, evidence, retried: false };
    }

    // A successful click is an explicit action.  Keeping the prompt in the
    // composer is not evidence that the click was a no-op, so never submit a
    // second time merely because confirmation is delayed or absent.
    throw createSubmissionUnconfirmedError(providerName);
  }

  function createSubmissionUnconfirmedError(providerName) {
    const error = new Error(`${providerName} 未確認送出`);
    error.code = "PROVIDER_SUBMISSION_UNCONFIRMED";
    return error;
  }

  globalThis.aiDebateAutomationCore = {
    assistantSnapshot,
    ensurePromptSubmitted,
    classifyProviderResponseError,
    formatStageError,
    hasFreshProviderError,
    providerErrorFingerprint,
    hasFreshAssistantResponse,
    isPromptEcho,
    matchesProviderLocation,
    normalizeProviderResponse,
    createAutomationAbortError,
  };

  function normalizeWhitespace(text) {
    return String(text || "").trim().replace(/\s+/g, " ");
  }
})();
