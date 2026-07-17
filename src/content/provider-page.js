(() => {
  if (globalThis.__aiDebateContentLoaded) {
    return;
  }
  globalThis.__aiDebateContentLoaded = true;
  const {
    assistantSnapshot,
    classifyProviderResponseError,
    ensurePromptSubmitted,
    formatStageError,
    hasFreshAssistantResponse,
    hasFreshProviderError,
    isPromptEcho,
    matchesProviderLocation,
    normalizeProviderResponse,
    providerErrorFingerprint,
  } = globalThis.aiDebateAutomationCore;
  const SUBMITTED_RUNS_KEY = "aiDebate.submittedRuns.v1";
  const submittedRuns = loadSubmittedRuns();
  const PROVIDERS = globalThis.aiDebateProviderAdapters || {};

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const handlers = {
      "aiDebate:sendAndRead": sendAndRead,
      "aiDebate:submitPrompt": submitPrompt,
      "aiDebate:readSubmittedResponse": readSubmittedResponse,
      "aiDebate:clearSubmittedRuns": clearSubmittedRuns,
    };
    const handler = handlers[message?.type];
    if (!handler) {
      return false;
    }

    handler(message)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({
        ok: false,
        code: error.code || "PROVIDER_AUTOMATION_FAILED",
        error: error.message,
        providerContent: error.providerContent || "",
      }));

    return true;
  });

  async function sendAndRead(message) {
    const submitted = await submitPrompt(message);
    return readSubmittedResponse({ ...message, runId: submitted.runId });
  }

  async function submitPrompt(message) {
    let stage = "辨識頁面";
    try {
      const { providerId, config } = requireProviderPage(message.provider);

      const baseline = readAssistantSnapshot(config, providerId);
      stage = "尋找輸入框";
      const input = await waitFor(() => findInput(config), 30000, `找不到 ${message.provider} 的輸入框，請確認已登入並開啟聊天頁面。`);
      stage = "填入提示";
      await writeInput(input, message.prompt);

      stage = "送出提示";
      const sendButton = await waitForOptional(
        () => providerId === "gemini" ? findSendButton(config, input) : findSendButton(config),
        3000,
      );
      const errorBaseline = readProviderErrorFingerprintBaseline(config, providerId);
      let submission = { method: sendButton ? "button" : "enter", evidence: "not-required", retried: false };
      if (providerId === "gemini") {
        const userMessageCount = countUserMessages(config);
        submission = await ensurePromptSubmitted({
          clickButton: () => {
            if (!sendButton) return false;
            sendButton.click();
            return true;
          },
          pressEnter: () => dispatchEnter(input),
          confirmSubmission: () => observeGeminiSubmission(config, input, userMessageCount),
        });
      } else if (sendButton) {
        sendButton.click();
      } else {
        dispatchEnter(input);
      }

      const runId = message.runId || createRunId(providerId, message.phase);
      submittedRuns.set(runId, {
        providerId,
        phase: message.phase,
        baseline,
        errorBaseline,
        prompt: message.prompt,
        submittedAt: Date.now(),
      });
      persistSubmittedRuns();

      return { ok: true, provider: providerId, runId, submission };
    } catch (error) {
      throw createStageError(stage, error);
    }
  }

  async function readSubmittedResponse(message) {
    let stage = "辨識頁面";
    try {
      const { providerId, config } = requireProviderPage(message.provider);
      const run = submittedRuns.get(message.runId);
      if (!run || run.providerId !== providerId) {
        const error = new Error(`找不到 ${message.provider} 這次送出的等待紀錄。`);
        error.code = "PROVIDER_RESPONSE_MISMATCH";
        throw error;
      }

      stage = "等待新回覆";
      await waitForCompletion(config, providerId, message.timeoutMs || 120000, run.baseline, run.prompt, run.errorBaseline);
      stage = "讀取新回覆";
      const content = readLastAssistantMessage(config, providerId);
      if (!content) {
        throw new Error(`無法讀取 ${message.provider} 的 AI 回覆。`);
      }
      const providerError = classifyProviderResponseError(providerId, content);
      if (providerError) {
        throw createProviderResponseError(providerError, content);
      }

      submittedRuns.delete(message.runId);
      persistSubmittedRuns();
      return { ok: true, provider: providerId, content };
    } catch (error) {
      throw createStageError(stage, error);
    }
  }

  function requireProviderPage(expectedProvider) {
    const providerId = detectProviderId();
    const config = PROVIDERS[providerId];
    if (!config || providerId !== expectedProvider) {
      throw new Error(`目前頁面不是 ${expectedProvider}`);
    }

    return { providerId, config };
  }

  function createRunId(providerId, phase) {
    return `${providerId}:${phase || "message"}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  }

  function detectProviderId() {
    return Object.entries(PROVIDERS).find(([, config]) =>
      matchesProviderLocation(location, config),
    )?.[0];
  }

  async function clearSubmittedRuns() {
    submittedRuns.clear();
    try {
      sessionStorage.removeItem(SUBMITTED_RUNS_KEY);
    } catch {
      // Some provider pages can block sessionStorage.
    }
    return { ok: true };
  }

  function loadSubmittedRuns() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(SUBMITTED_RUNS_KEY) || "[]");
      const now = Date.now();
      const TTL = 30 * 60 * 1000;
      return new Map(Array.isArray(parsed) ? parsed.filter((entry) =>
        Array.isArray(entry) && typeof entry[0] === "string" && entry[1]?.providerId && (now - entry[1].submittedAt <= TTL)
      ) : []);
    } catch {
      return new Map();
    }
  }

  function persistSubmittedRuns() {
    try {
      const now = Date.now();
      const TTL = 30 * 60 * 1000; // 30 minutes
      for (const [runId, run] of submittedRuns.entries()) {
        if (now - run.submittedAt > TTL) {
          submittedRuns.delete(runId);
        }
      }
      sessionStorage.setItem(SUBMITTED_RUNS_KEY, JSON.stringify([...submittedRuns]));
    } catch {
      // Keep the current in-memory run when a provider blocks sessionStorage.
    }
  }

  function createStageError(stage, error) {
    const wrapped = new Error(formatStageError(stage, error));
    const codes = {
      "辨識頁面": "PROVIDER_LOGIN_REQUIRED",
      "尋找輸入框": "PROVIDER_INPUT_NOT_FOUND",
      "等待新回覆": "PROVIDER_RESPONSE_TIMEOUT",
    };
    wrapped.code = error?.code || codes[stage] || "PROVIDER_AUTOMATION_FAILED";
    wrapped.providerContent = error?.providerContent || "";
    return wrapped;
  }

  function findInput(config) {
    const candidates = collectElements(config.inputSelectors)
      .filter(isVisible)
      .filter((element) => !element.disabled && element.getAttribute("aria-disabled") !== "true");
    return candidates[candidates.length - 1] || findLikelyInput();
  }

  function findLikelyInput() {
    const placeholders = ["問", "ask", "message", "write", "chat", "聊", "輸入", "prompt"];
    return Array.from(document.querySelectorAll("textarea, div[contenteditable='true'], [role='textbox']"))
      .filter(isVisible)
      .find((el) => {
        const placeholder = (el.getAttribute("placeholder") || el.getAttribute("aria-label") || el.textContent || "").toLowerCase();
        return placeholders.some((item) => placeholder.includes(item));
      }) || null;
  }

  function findSendButton(config, input) {
    if (input) {
      let ancestor = input.parentElement;
      while (ancestor && ancestor !== document.documentElement) {
        const nearbyButton = findConfiguredSendButton(ancestor, config);
        if (nearbyButton) {
          return nearbyButton;
        }
        ancestor = ancestor.parentElement;
      }
    }

    return findConfiguredSendButton(document, config) || findLikelySendButton();
  }

  function findConfiguredSendButton(root, config) {
    for (const selector of config.sendSelectors) {
      const button = Array.from(root.querySelectorAll(selector))
        .filter((element) => element instanceof HTMLButtonElement || element.getAttribute("role") === "button")
        .filter(isVisible)
        .find((element) => !element.disabled && element.getAttribute("aria-disabled") !== "true");
      if (button) {
        return button;
      }
    }
    return null;
  }

  function findLikelySendButton() {
    const labels = ["send", "submit", "arrow", "送出", "傳送", "傳送訊息", "發送"];
    return Array.from(document.querySelectorAll("button, [role='button']"))
      .filter(isVisible)
      .filter((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true")
      .find((button) => {
        const label = `${button.getAttribute("aria-label") || ""} ${button.title || ""} ${button.textContent || ""}`.toLowerCase();
        return labels.some((item) => label.includes(item));
      }) || null;
  }

  async function writeInput(element, text) {
    element.focus();
    await delay(150);

    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      setNativeValue(element, text);
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    document.getSelection()?.selectAllChildren(element);
    document.execCommand("insertText", false, text);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));

    if (!element.textContent?.includes(text.slice(0, 20))) {
      element.textContent = text;
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    }
  }

  function setNativeValue(element, text) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, text);
  }

  function dispatchEnter(element) {
    for (const type of ["keydown", "keypress", "keyup"]) {
      element.dispatchEvent(new KeyboardEvent(type, {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      }));
    }
  }

  async function waitForCompletion(config, providerId, timeoutMs, baseline, prompt, errorBaseline = []) {
    const deadline = Date.now() + timeoutMs;
    let lastText = "";
    let stableSince = Date.now();

    while (Date.now() < deadline) {
      const pageError = readKnownProviderPageError(config, providerId, errorBaseline);
      if (pageError) {
        throw createProviderResponseError(pageError.classification, pageError.content);
      }

      const current = readAssistantSnapshot(config, providerId);
      const currentText = current.lastText;
      if (currentText !== lastText) {
        lastText = currentText;
        stableSince = Date.now();
      }

      const timeStable = Date.now() - stableSince;
      const generating = isGenerating(config);
      const stableFallbackMs = config.generatingStableFallbackMs || 30000;
      if (
        currentText &&
        hasFreshAssistantResponse(baseline, current) &&
        !isPromptEcho(prompt, currentText) &&
        (
          !generating ||
          (!config.requireGenerationEnd && timeStable > stableFallbackMs)
        ) &&
        timeStable > 2000
      ) {
        return;
      }

      await delay(500);
    }

    const error = new Error("等待 AI 回覆逾時");
    error.code = "PROVIDER_RESPONSE_TIMEOUT";
    throw error;
  }

  function isGenerating(config) {
    const stopVisible = collectElements(config.stopSelectors)
      .some((el) => isVisible(el) && !el.disabled && el.getAttribute("aria-disabled") !== "true");

    // Some sites leave aria-busy="true" on random hidden elements or disabled buttons
    const busyVisible = Array.from(document.querySelectorAll("main [aria-busy='true'], article [aria-busy='true'], .prose [aria-busy='true']"))
      .some((el) => isVisible(el));

    return stopVisible || busyVisible;
  }

  function readLastAssistantMessage(config, providerId) {
    return readAssistantSnapshot(config, providerId).lastText;
  }

  function readProviderErrorFingerprintBaseline(config, providerId) {
    return readProviderErrorCandidates(config, providerId)
      .map((candidate) => candidate.fingerprint);
  }

  function readKnownProviderPageError(config, providerId, errorBaseline = []) {
    const candidates = readProviderErrorCandidates(config, providerId);

    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index];
      const classification = classifyProviderResponseError(providerId, candidate.content);
      if (classification && hasFreshProviderError(errorBaseline, candidate.content)) {
        return { classification, content: candidate.content };
      }
    }
    return null;
  }

  function readProviderErrorCandidates(config, providerId) {
    return collectElements(config.errorSelectors)
      .filter(isVisible)
      .map((element) => normalizeProviderResponse(providerId, element.innerText || element.textContent || "").trim())
      .filter(Boolean)
      .map((content) => ({
        content,
        fingerprint: providerErrorFingerprint(content),
      }));
  }

  function createProviderResponseError(classification, content) {
    const error = new Error(classification.message);
    error.code = classification.code;
    error.providerContent = content;
    return error;
  }

  async function observeGeminiSubmission(config, input, initialUserMessageCount, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!readInputText(input)) {
        return "input-cleared";
      }
      if (isGenerating(config)) {
        return "generation-started";
      }
      if (countUserMessages(config) > initialUserMessageCount) {
        return "user-message-added";
      }
      await delay(100);
    }
    return null;
  }

  function readInputText(input) {
    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      return input.value.trim();
    }
    return String(input.innerText || input.textContent || "").trim();
  }

  function countUserMessages(config) {
    return collectElements(config.userMessageSelectors).filter(isVisible).length;
  }

  function readAssistantSnapshot(config, providerId) {
    let elements = collectElements(config.responseSelectors);

    // Filter out elements that are descendants of any other element in the list
    // This ensures we capture the outermost message container and don't overwrite
    // it with an inner text block (which would miss sibling artifacts/cards).
    elements = elements.filter((el) => {
      return !elements.some((other) => other !== el && other.contains(el));
    });

    const texts = [...new Set(elements)]
      .filter(isVisible)
      .map((element) => element.innerText || element.textContent || "")
      .map((text) => normalizeProviderResponse(providerId, text))
      .map((text) => text.trim())
      .filter((text) => text.length > 0);

    return assistantSnapshot(texts);
  }

  function collectElements(selectors) {
    if (!selectors || selectors.length === 0) return [];
    try {
      return Array.from(document.querySelectorAll(selectors.join(", ")));
    } catch (_error) {
      return [];
    }
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
  }

  async function waitFor(getValue, timeoutMs, errorMessage) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = getValue();
      if (value) {
        return value;
      }
      await delay(250);
    }
    throw new Error(errorMessage);
  }

  async function waitForOptional(getValue, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = getValue();
      if (value) {
        return value;
      }
      await delay(250);
    }
    return null;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
