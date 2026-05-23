(() => {
  if (globalThis.__aiDebateContentLoaded) {
    return;
  }
  globalThis.__aiDebateContentLoaded = true;

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
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "aiDebate:sendAndRead") {
      return false;
    }

    sendAndRead(message)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  });

  async function sendAndRead(message) {
    const providerId = detectProviderId();
    const config = PROVIDERS[providerId];
    if (!config || providerId !== message.provider) {
      throw new Error(`目前頁面不是 ${message.provider}`);
    }

    const input = await waitFor(() => findInput(config), 30000, "找不到輸入框，請確認已登入並開啟聊天頁");
    await writeInput(input, message.prompt);

    const sendButton = await waitFor(() => findSendButton(config), 10000, "找不到可用的送出按鈕");
    sendButton.click();

    await waitForCompletion(config, message.timeoutMs || 120000);
    const content = readLastAssistantMessage(config);
    if (!content) {
      throw new Error("無法讀取 AI 回覆");
    }

    return { ok: true, provider: providerId, content };
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
    return candidates[candidates.length - 1] || null;
  }

  function findSendButton(config) {
    const candidates = collectElements(config.sendSelectors)
      .filter((element) => element instanceof HTMLButtonElement)
      .filter(isVisible)
      .filter((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true");

    return candidates[0] || findLikelySendButton();
  }

  function findLikelySendButton() {
    const labels = ["send", "submit", "arrow", "送出", "傳送"];
    return Array.from(document.querySelectorAll("button"))
      .filter(isVisible)
      .filter((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true")
      .find((button) => {
        const label = `${button.getAttribute("aria-label") || ""} ${button.title || ""}`.toLowerCase();
        return labels.some((item) => label.includes(item));
      }) || null;
  }

  async function writeInput(element, text) {
    element.focus();
    await delay(100);

    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      element.value = text;
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    document.getSelection()?.selectAllChildren(element);
    document.execCommand("insertText", false, text);

    if (!element.textContent?.includes(text.slice(0, 20))) {
      element.textContent = text;
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    }
  }

  async function waitForCompletion(config, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let lastText = "";
    let stableSince = Date.now();

    while (Date.now() < deadline) {
      const currentText = readLastAssistantMessage(config);
      if (currentText !== lastText) {
        lastText = currentText;
        stableSince = Date.now();
      }

      if (currentText && !isGenerating(config) && Date.now() - stableSince > 1800) {
        return;
      }

      await delay(500);
    }

    throw new Error("等待回覆逾時");
  }

  function isGenerating(config) {
    return collectElements(config.stopSelectors).some(isVisible) ||
      Array.from(document.querySelectorAll("[aria-busy='true']")).some(isVisible);
  }

  function readLastAssistantMessage(config) {
    const texts = collectElements(config.responseSelectors)
      .filter(isVisible)
      .map((element) => element.innerText || element.textContent || "")
      .map((text) => text.trim())
      .filter((text) => text.length > 0);

    return texts[texts.length - 1] || "";
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
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
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

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
