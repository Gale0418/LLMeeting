(() => {
  if (globalThis.__aiDebateContentLoaded) {
    return;
  }
  globalThis.__aiDebateContentLoaded = true;
  const {
    assistantSnapshot,
    formatStageError,
    hasFreshAssistantResponse,
    isPromptEcho,
  } = globalThis.aiDebateAutomationCore;
  const submittedRuns = new Map();

  const PROVIDERS = {
    chatgpt: {
      hosts: ["chatgpt.com", "chat.openai.com"],
      inputSelectors: [
        "#prompt-textarea",
        "textarea",
        "div[contenteditable='true']",
        "[role='textbox']",
      ],
      sendSelectors: [
        "button[data-testid='send-button']",
        "button[type='submit']",
        "button[aria-label*='Send']",
        "button[aria-label*='送出']",
        "button[aria-label*='Submit']",
      ],
      stopSelectors: [
        "button[data-testid='stop-button']",
        "button[aria-label*='Stop']",
        "button[aria-label*='停止']",
      ],
      responseSelectors: [
        "[data-message-author-role='assistant']",
        "article .markdown",
        "main .markdown",
      ],
    },
    gemini: {
      hosts: ["gemini.google.com"],
      inputSelectors: [
        "rich-textarea div[contenteditable='true']",
        "div[contenteditable='true']",
        "textarea",
        "[role='textbox']",
      ],
      sendSelectors: [
        "button[type='submit']",
        "button[aria-label*='Send']",
        "button[aria-label*='送出']",
        "button.send-button",
      ],
      stopSelectors: [
        "button[aria-label*='Stop']",
        "button[aria-label*='停止']",
      ],
      responseSelectors: [
        "message-content",
        "[id^='model-response-message-content']",
        ".model-response-text",
        "[data-response-index]",
      ],
    },
    grok: {
      hosts: ["grok.com", "x.com"],
      inputSelectors: [
        "textarea",
        "div[contenteditable='true']",
        "[role='textbox']",
      ],
      sendSelectors: [
        "button[data-testid='send-button']",
        "button[type='submit']",
        "button[aria-label*='Send']",
        "button[aria-label*='送出']",
      ],
      stopSelectors: [
        "button[aria-label*='Stop']",
        "button[aria-label*='停止']",
      ],
      responseSelectors: [
        "[data-testid='message-bubble']",
        ".markdown",
        "article",
        "main [role='article']",
      ],
    },
    claude: {
      hosts: ["claude.ai"],
      inputSelectors: [
        "div[contenteditable='true']",
        "div.ProseMirror",
        "textarea",
        "[role='textbox']",
      ],
      sendSelectors: [
        "button[type='submit']",
        "button[aria-label*='Send']",
        "button[aria-label*='送出']",
        "button[aria-label*='傳送']",
        "button[aria-label*='Send Message']",
      ],
      stopSelectors: [
        "button[aria-label*='Stop']",
        "button[aria-label*='停止']",
      ],
      responseSelectors: [
        ".font-claude-message",
        "[data-message-author='assistant']",
        "[data-is-streaming]",
        "[data-testid='message-bubble']",
        ".prose",
        "article",
      ],
    },
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const handlers = {
      "aiDebate:sendAndRead": sendAndRead,
      "aiDebate:submitPrompt": submitPrompt,
      "aiDebate:readSubmittedResponse": readSubmittedResponse,
    };
    const handler = handlers[message?.type];
    if (!handler) {
      return false;
    }

    handler(message)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

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

      const baseline = readAssistantSnapshot(config);
      stage = "尋找輸入框";
      const input = await waitFor(() => findInput(config), 30000, `找不到 ${message.provider} 的輸入框，請確認已登入並開啟聊天頁面。`);
      stage = "填入提示";
      await writeInput(input, message.prompt);

      stage = "送出提示";
      const sendButton = await waitForOptional(() => findSendButton(config), 3000);
      if (sendButton) {
        sendButton.click();
      } else {
        dispatchEnter(input);
      }

      const runId = message.runId || createRunId(providerId, message.phase);
      submittedRuns.set(runId, {
        providerId,
        phase: message.phase,
        baseline,
        prompt: message.prompt,
        submittedAt: Date.now(),
      });

      return { ok: true, provider: providerId, runId };
    } catch (error) {
      throw new Error(formatStageError(stage, error));
    }
  }

  async function readSubmittedResponse(message) {
    let stage = "辨識頁面";
    try {
      const { providerId, config } = requireProviderPage(message.provider);
      const run = submittedRuns.get(message.runId);
      if (!run || run.providerId !== providerId) {
        throw new Error(`找不到 ${message.provider} 這次送出的等待紀錄。`);
      }

      stage = "等待新回覆";
      await waitForCompletion(config, message.timeoutMs || 120000, run.baseline, run.prompt);
      stage = "讀取新回覆";
      const content = readLastAssistantMessage(config);
      if (!content) {
        throw new Error(`無法讀取 ${message.provider} 的 AI 回覆。`);
      }

      submittedRuns.delete(message.runId);
      return { ok: true, provider: providerId, content };
    } catch (error) {
      throw new Error(formatStageError(stage, error));
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
    const host = location.hostname;
    return Object.entries(PROVIDERS).find(([, config]) =>
      config.hosts.some((item) => host === item || host.endsWith(`.${item}`)),
    )?.[0];
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

  function findSendButton(config) {
    const candidates = collectElements(config.sendSelectors)
      .filter((element) => element instanceof HTMLButtonElement || element.getAttribute("role") === "button")
      .filter(isVisible)
      .filter((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true");

    return candidates[0] || findLikelySendButton();
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

  async function waitForCompletion(config, timeoutMs, baseline, prompt) {
    const deadline = Date.now() + timeoutMs;
    let lastText = "";
    let stableSince = Date.now();

    while (Date.now() < deadline) {
      const current = readAssistantSnapshot(config);
      const currentText = current.lastText;
      if (currentText !== lastText) {
        lastText = currentText;
        stableSince = Date.now();
      }

      if (
        currentText &&
        hasFreshAssistantResponse(baseline, current) &&
        !isPromptEcho(prompt, currentText) &&
        !isGenerating(config) &&
        Date.now() - stableSince > 2000
      ) {
        return;
      }

      await delay(500);
    }

    throw new Error("等待 AI 回覆逾時");
  }

  function isGenerating(config) {
    return collectElements(config.stopSelectors).some(isVisible) ||
      Array.from(document.querySelectorAll("[aria-busy='true']")).some(isVisible);
  }

  function readLastAssistantMessage(config) {
    return readAssistantSnapshot(config).lastText;
  }

  function readAssistantSnapshot(config) {
    const elements = [...new Set(collectElements(config.responseSelectors))];
    const texts = elements
      .filter(isVisible)
      .map((element) => element.innerText || element.textContent || "")
      .map((text) => text.trim())
      .filter((text) => text.length > 0);

    return assistantSnapshot(texts);
  }

  function collectElements(selectors) {
    return selectors.flatMap((selector) => {
      try {
        return Array.from(document.querySelectorAll(selector));
      } catch (_error) {
        return [];
      }
    });
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
