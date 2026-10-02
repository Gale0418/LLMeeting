(() => {
  const CONTENT_SCRIPT_VERSION = "0.5.0-driver.5";
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
    createAutomationAbortError,
  } = globalThis.aiDebateAutomationCore;
  const {
    DRIVER_CONTRACT_VERSION,
    DRIVER_VERSION,
    confidenceForResolution,
    createCapabilityContract,
    elementFingerprint,
    selectCandidate,
  } = globalThis.aiDebateProviderDriver;
  const makeAutomationAbortError = createAutomationAbortError || (() => {
    const error = new Error("Provider automation aborted");
    error.code = "PROVIDER_AUTOMATION_ABORTED";
    return error;
  });
  const SUBMITTED_RUNS_KEY = "aiDebate.submittedRuns.v1";
  const RESPONSE_HARD_CAP_MS = 12 * 60 * 1000;
  const INPUT_WRITE_TIMEOUT_MS = 2000;
  const SUBMISSION_READY_TIMEOUT_MS = 3000;
  const READINESS_DOM_TIMEOUT_MS = 3500;
  const READINESS_POLL_MS = 100;
  const READINESS_GENERATING_SETTLE_MS = 200;
  const INPUT_CANDIDATE_SELECTOR = "textarea, input:not([type]), input[type='text'], div[contenteditable='true'], [role='textbox']";
  const INPUT_SCORE_THRESHOLD = 75;
  const INPUT_AMBIGUITY_MARGIN = 12;
  const SEND_SCORE_THRESHOLD = 70;
  const SEND_AMBIGUITY_MARGIN = 12;
  const SHADOW_ROOT_CACHE_MS = 2000;
  let automationEpoch = 0;
  const submittedRuns = loadSubmittedRuns();
  const PROVIDERS = globalThis.aiDebateProviderAdapters || {};
  let shadowRootCache = { expiresAt: 0, roots: [] };

  function createCompletionWindow(timeoutMs, startedAt = Date.now()) {
    const inactivityMs = Math.max(0, Number(timeoutMs) || 120000);
    const hardDeadline = startedAt + RESPONSE_HARD_CAP_MS;
    return {
      inactivityMs,
      inactivityDeadline: Math.min(hardDeadline, startedAt + inactivityMs),
      hardDeadline,
    };
  }

  function extendCompletionWindow(window, now = Date.now()) {
    return {
      ...window,
      inactivityDeadline: Math.min(window.hardDeadline, now + window.inactivityMs),
    };
  }

  globalThis.aiDebateProviderPageTiming = Object.freeze({
    RESPONSE_HARD_CAP_MS,
    createCompletionWindow,
    extendCompletionWindow,
  });

  const contentMessageListener = (message, _sender, sendResponse) => {
    const handlers = {
      "aiDebate:getCapabilities": getCapabilities,
      "aiDebate:sendAndRead": sendAndRead,
      "aiDebate:submitPrompt": submitPrompt,
      "aiDebate:readSubmittedResponse": readSubmittedResponse,
      "aiDebate:clearSubmittedRuns": clearSubmittedRuns,
      "aiDebate:abort": abortAutomation,
      "aiDebate:abortAutomation": abortAutomation,
      "aiDebate:checkReadiness": checkReadiness,
    };
    const handler = handlers[message?.type];
    if (!handler) {
      return false;
    }

    Promise.resolve()
      .then(() => handler(message))
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({
        ok: false,
        code: error.code || "PROVIDER_AUTOMATION_FAILED",
        error: error.message,
        providerContent: error.providerContent || "",
      }));

    return true;
  };
  // Injection is a repair operation, even when the build version is unchanged.
  // Do not leave a success marker behind if dependency initialization failed.
  if (globalThis.__aiDebateContentMessageListener) {
    try {
      chrome.runtime.onMessage.removeListener(globalThis.__aiDebateContentMessageListener);
    } catch (_error) {
      // The previous extension context may already be invalidated.
    }
  }
  chrome.runtime.onMessage.addListener(contentMessageListener);
  globalThis.__aiDebateContentMessageListener = contentMessageListener;
  globalThis.__aiDebateContentVersion = CONTENT_SCRIPT_VERSION;

  async function sendAndRead(message) {
    const submitted = await submitPrompt(message);
    return readSubmittedResponse({ ...message, runId: submitted.runId, epoch: submitted.epoch });
  }

  async function getCapabilities() {
    return {
      ok: true,
      contentScriptVersion: CONTENT_SCRIPT_VERSION,
      driverContractVersion: DRIVER_CONTRACT_VERSION,
      driverVersion: DRIVER_VERSION,
      modelPolicy: "site-default",
      readiness: true,
      scoredInputFallback: true,
      openShadowDom: true,
      automationEpoch,
    };
  }

  function abortAutomation() {
    automationEpoch += 1;
    submittedRuns.clear();
    persistSubmittedRuns();
    return { ok: true, automationEpoch };
  }

  function assertAutomationEpoch(expectedEpoch) {
    if (expectedEpoch !== automationEpoch) {
      throw makeAutomationAbortError();
    }
  }

  // Readiness is deliberately a snapshot. It must never focus, type, click,
  // reload, or otherwise change provider page state.
  async function checkReadiness(message = {}) {
    const expectedProvider = String(message.provider || "");
    const config = PROVIDERS[expectedProvider];
    const urlMatches = Boolean(config && matchesProviderLocation(location, config));
    let url = {
      ok: urlMatches,
      hostname: String(location?.hostname || ""),
      pathname: String(location?.pathname || "/"),
    };

    if (!config || !urlMatches) {
      return createReadinessResult(expectedProvider, false, "wrong-page", {
        url,
        input: emptyReadinessCheck(),
        send: emptyReadinessCheck(),
        generating: { active: false },
        error: { detected: false, code: null, message: "" },
        login: { detected: false },
      }, "PROVIDER_WRONG_PAGE");
    }

    let login = readLoginWall(config);
    const providerErrorBaseline = readProviderErrorFingerprintBaseline(config, expectedProvider);
    const controls = await waitForReadinessControls(
      config,
      () => login.detected,
    );
    const input = controls.input;
    const inputCandidate = controls.inputCandidate;
    const inputCheck = {
      ok: Boolean(input),
      found: Boolean(inputCandidate),
      visible: Boolean(inputCandidate && isVisible(inputCandidate)),
      editable: Boolean(inputCandidate && isEditableInput(inputCandidate)),
      strategy: controls.inputResolution?.strategy || "none",
      score: controls.inputResolution?.score || 0,
      ambiguous: Boolean(controls.inputResolution?.ambiguous),
      candidateCount: controls.inputResolution?.candidateCount || 0,
    };
    const sendButton = controls.sendButton;
    const sendCandidate = controls.sendCandidate;
    const sendCheck = {
      // Readiness is intentionally read-only and does not populate the
      // composer. Providers commonly hide or defer their send control while
      // the composer is empty, so an editable composer is enough to continue
      // the preflight. Actual submission still uses findSendButton(), which
      // waits for an enabled control after the prompt has been written (or
      // falls back to Enter where that provider supports it).
      ok: Boolean(sendButton || sendCandidate || (input && config.sendControlDeferredWhenEmpty)),
      found: Boolean(sendCandidate),
      visible: Boolean(sendCandidate && isVisible(sendCandidate)),
      enabled: Boolean(sendCandidate && isSendButtonEnabled(sendCandidate)),
      deferred: Boolean(input && config.sendControlDeferredWhenEmpty && !sendButton && !sendCandidate),
    };
    const generating = { active: await isGeneratingStable(config) };
    const providerError = readCurrentProviderError(config, expectedProvider, input, providerErrorBaseline);
    const error = providerError
      ? { detected: true, code: providerError.code, message: providerError.message }
      : { detected: false, code: null, message: "" };

    // A provider can change its SPA route or show a login wall while the
    // read-only control wait is pending. The result must describe this page
    // snapshot, not the route that happened to be open when polling began.
    url = {
      ok: matchesProviderLocation(location, config),
      hostname: String(location?.hostname || ""),
      pathname: String(location?.pathname || "/"),
    };
    login = readLoginWall(config);

    let status = "ready";
    let code = null;
    if (!url.ok) {
      status = "wrong-page";
      code = "PROVIDER_WRONG_PAGE";
    } else if (login.detected) {
      status = "login-required";
      code = "PROVIDER_LOGIN_REQUIRED";
    } else if (error.detected) {
      status = "error";
      code = error.code;
    } else if (generating.active) {
      status = "generating";
      code = "PROVIDER_GENERATING";
    } else if (!inputCheck.ok) {
      status = "input-not-ready";
      code = "PROVIDER_INPUT_NOT_READY";
    } else if (!sendCheck.ok) {
      status = "send-not-ready";
      code = "PROVIDER_SEND_NOT_READY";
    }

    const driver = createCapabilityContract(expectedProvider, {
      surfaces: {
        input: {
          available: Boolean(input),
          confidence: confidenceForResolution(controls.inputResolution),
          evidence: controls.inputResolution?.evidence || null,
        },
        send: {
          available: Boolean(sendButton || sendCandidate || sendCheck.deferred),
          confidence: sendButton || sendCandidate ? "high" : sendCheck.deferred ? "medium" : "none",
          deferred: sendCheck.deferred,
        },
      },
    });

    return createReadinessResult(expectedProvider, status === "ready", status, {
      url,
      input: inputCheck,
      send: sendCheck,
      generating,
      error,
      login,
      driver,
    }, code);
  }

  function createReadinessResult(provider, ready, status, checks, code = null) {
    return {
      ok: true,
      provider,
      ready,
      status,
      reason: status,
      code,
      checks,
    };
  }

  function emptyReadinessCheck() {
    return { ok: false, found: false, visible: false, editable: false };
  }

  async function waitForReadinessControls(config, shouldStop = () => false) {
    const deadline = Date.now() + READINESS_DOM_TIMEOUT_MS;
    let input = null;
    let inputCandidate = null;
    let sendButton = null;
    let sendCandidate = null;
    let inputSeenAt = 0;

    while (true) {
      const inputResolution = resolveInput(config);
      input = inputResolution.element;
      inputCandidate = inputResolution.candidate || findLastVisibleInput(config);
      sendButton = findSendButton(config, input);
      sendCandidate = sendButton || findVisibleSendButton(config, input);
      if (input && !inputSeenAt) inputSeenAt = Date.now();

      // Provider pages are SPAs: a complete document can still be hydrating
      // its composer. Polling is read-only and gives the page a short window
      // to expose its stable accessible controls.
      const sendSettled = Boolean(sendCandidate || (
        input && config.sendControlDeferredWhenEmpty && inputSeenAt && Date.now() - inputSeenAt >= 250
      ));
      if (shouldStop() || (input && sendSettled) || (!input && sendCandidate) || Date.now() >= deadline) {
        return { input, inputCandidate, inputResolution, sendButton, sendCandidate };
      }
      if (inputCandidate && !isEditableInput(inputCandidate)) {
        break;
      }
      await delay(READINESS_POLL_MS);
    }

    return { input, inputCandidate, inputResolution: resolveInput(config), sendButton, sendCandidate };
  }

  async function isGeneratingStable(config) {
    if (!isGenerating(config)) return false;
    await delay(READINESS_GENERATING_SETTLE_MS);
    return isGenerating(config);
  }

  function readLoginWall(config) {
    const path = String(location?.pathname || "").toLowerCase();
    const authPath = /(?:^|\/)(?:login|signin|sign-in|auth)(?:\/|$)/.test(path);
    const selectors = config.loginSelectors || [];
    const visibleAuthElement = collectElements(selectors)
      .filter(isVisible)
      .some((element) => isLoginWallText(readElementText(element)));
    return { detected: authPath || visibleAuthElement };
  }

  function readElementText(element) {
    return String(element?.innerText || element?.textContent || "");
  }

  function isLoginWallText(text) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (!normalized || normalized.length > 300) return false;
    return /(?:log\s*in|login|sign\s*in|登入|登錄)/i.test(normalized);
  }

  function readCurrentProviderError(config, providerId, input = null, baseline = []) {
    const candidates = readProviderErrorCandidates(config, providerId);
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index];
      if (input && !isErrorRelevantToComposer(candidate.element, input, config) &&
          !hasFreshProviderError(baseline, candidate.content)) {
        continue;
      }
      const classification = classifyProviderResponseError(providerId, candidate.content);
      if (classification) {
        return { code: classification.code, message: classification.message };
      }
      if (/(?:\berror\b|failed|failure|try again|錯誤|失敗|重試|無法)/i.test(candidate.content)) {
        return { code: "PROVIDER_PAGE_ERROR", message: candidate.content };
      }
    }
    return null;
  }

  function isErrorRelevantToComposer(element, input, config) {
    const composer = findComposerScope(input, config);
    if (!composer || !element) return false;
    return composer === element || composer.contains?.(element) || element.contains?.(composer);
  }

  async function submitPrompt(message) {
    let stage = "辨識頁面";
    const epoch = automationEpoch;
    try {
      assertAutomationEpoch(epoch);
      const { providerId, config } = requireProviderPage(message.provider);
      const assertCurrentPage = () => {
        assertAutomationEpoch(epoch);
        assertProviderLocation(providerId, config);
      };

      const baseline = readAssistantSnapshot(config, providerId);
      stage = "尋找輸入框";
      const input = await waitFor(() => findInput(config), 30000, `找不到 ${message.provider} 的輸入框，請確認已登入並開啟聊天頁面。`, assertCurrentPage);
      stage = "填入提示";
      await writeInput(input, message.prompt, config.inputWriteStrategy, assertCurrentPage);

      stage = "送出提示";
      const sendButton = providerId === "gemini"
        ? await waitForGeminiSubmissionReady(config, input, message.prompt, SUBMISSION_READY_TIMEOUT_MS, assertCurrentPage)
        : await waitForOptional(() => findSendButton(config, input), 3000, assertCurrentPage);
      assertCurrentPage();
      const errorBaseline = readProviderErrorFingerprintBaseline(config, providerId);
      const userMessageCount = countUserMessages(config, message.prompt);
      const userTurnCount = countUserMessages(config);
      const promptWasPresent = isPromptStillPresent(input, message.prompt);
      const initiallyGenerating = isGenerating(config);
      const submission = await ensurePromptSubmitted({
        clickButton: () => {
          assertCurrentPage();
          if (!sendButton) return false;
          sendButton.click();
          return true;
        },
        pressEnter: () => {
          assertCurrentPage();
          dispatchEnter(input);
        },
        promptStillPresent: () => isPromptStillPresent(input, message.prompt),
        confirmSubmission: () => observeProviderSubmission(
          config,
          input,
          message.prompt,
          userMessageCount,
          promptWasPresent,
          assertCurrentPage,
          4000,
          initiallyGenerating,
        ),
        providerName: providerId === "meta" ? "Meta AI" : providerId[0].toUpperCase() + providerId.slice(1),
      });

      const runId = message.runId || createRunId(providerId, message.phase);
      assertAutomationEpoch(epoch);
      submittedRuns.set(runId, {
        providerId,
        epoch,
        phase: message.phase,
        baseline,
        errorBaseline,
        prompt: message.prompt,
        submittedAt: Date.now(),
        userTurnCount,
      });
      persistSubmittedRuns();

      return { ok: true, provider: providerId, runId, epoch, submission };
    } catch (error) {
      throw createStageError(stage, error);
    }
  }

  async function readSubmittedResponse(message) {
    let stage = "辨識頁面";
    try {
      if (Number.isInteger(message.epoch)) assertAutomationEpoch(message.epoch);
      const { providerId, config } = requireProviderPage(message.provider);
      const run = submittedRuns.get(message.runId);
      if (!run || run.providerId !== providerId) {
        const error = new Error(`找不到 ${message.provider} 這次送出的等待紀錄。`);
        error.code = "PROVIDER_RESPONSE_MISMATCH";
        throw error;
      }
      assertAutomationEpoch(Number.isInteger(run.epoch) ? run.epoch : automationEpoch);

      stage = "等待新回覆";
      const runEpoch = Number.isInteger(run.epoch) ? run.epoch : automationEpoch;
      const responseCandidate = await waitForCompletion(config, providerId, message.timeoutMs || 120000, run.baseline, run.prompt, run.errorBaseline, () => assertAutomationEpoch(runEpoch), run.userTurnCount);
      assertAutomationEpoch(runEpoch);
      stage = "讀取新回覆";
      const content = responseCandidate || readLastAssistantMessage(config, providerId);
      if (!content) {
        throw new Error(`無法讀取 ${message.provider} 的 AI 回覆。`);
      }
      const providerError = classifyProviderResponseError(providerId, content);
      if (providerError) {
        throw createProviderResponseError(providerError, content);
      }

      assertAutomationEpoch(runEpoch);
      submittedRuns.delete(message.runId);
      assertAutomationEpoch(runEpoch);
      persistSubmittedRuns();
      assertAutomationEpoch(runEpoch);
      return { ok: true, provider: providerId, content };
    } catch (error) {
      throw createStageError(stage, error);
    }
  }

  function requireProviderPage(expectedProvider) {
    const providerId = detectProviderId();
    const config = PROVIDERS[providerId];
    if (!config || providerId !== expectedProvider) {
      const error = new Error(`目前頁面不是 ${expectedProvider}`);
      error.code = "PROVIDER_WRONG_PAGE";
      throw error;
    }

    return { providerId, config };
  }

  function assertProviderLocation(providerId, config) {
    // Unit-level helpers may exercise the completion loop with an isolated
    // synthetic config. Runtime calls always use a registered provider.
    if (!PROVIDERS[providerId]) return;
    if (config && matchesProviderLocation(location, config) && detectProviderId() === providerId) return;
    const error = new Error(`Provider 分頁已離開 ${providerId} 的聊天路徑`);
    error.code = "PROVIDER_WRONG_PAGE";
    throw error;
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
    automationEpoch += 1;
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
      const entries = Array.isArray(parsed) ? parsed.filter((entry) =>
        Array.isArray(entry) && typeof entry[0] === "string" && entry[1]?.providerId && (now - entry[1].submittedAt <= TTL)
      ) : [];
      for (const [, run] of entries) {
        if (Number.isInteger(run.epoch)) automationEpoch = Math.max(automationEpoch, run.epoch);
      }
      return new Map(entries);
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
    return resolveInput(config).element;
  }

  function resolveInput(config = {}) {
    const configuredCandidates = [];
    if (config.preferredInputSelector) {
      configuredCandidates.push(...collectInputCandidates(
        [config.preferredInputSelector], config, "preferred", 200,
      ));
    }
    configuredCandidates.push(...collectInputCandidates(
      config.inputSelectors || [], config, "configured", 160,
    ));
    if (configuredCandidates.length > 0) {
      const configured = selectCandidate(configuredCandidates, {
        threshold: 150,
        ambiguityMargin: INPUT_AMBIGUITY_MARGIN,
      });
      if (configured.accepted || configured.ambiguous) return configured;
    }

    return findLikelyInput(config);
  }

  function collectInputCandidates(selectors, config, strategy, baseScore) {
    const candidates = [];
    for (const selector of selectors || []) {
      const matches = collectElements([selector])
        .filter(isVisible)
        .filter(isEditableInput);
      for (const element of matches) {
        candidates.push({
          element,
          strategy,
          score: baseScore + Math.max(-100, scoreInputCandidate(element, config)),
          signals: [`selector:${strategy}`, `selector:${selector.slice(0, 120)}`],
          fingerprint: elementFingerprint(element),
        });
      }
    }
    return candidates;
  }

  function findLastVisibleInput(config) {
    const selectors = [
      ...(config.preferredInputSelector ? [config.preferredInputSelector] : []),
      ...(config.inputSelectors || []),
    ];
    for (const selector of selectors) {
      const candidates = collectElements([selector]).filter(isVisible);
      if (candidates.length > 0) return candidates[candidates.length - 1];
    }
    return null;
  }

  function isEditableInput(element) {
    if (!element || element.disabled || element.getAttribute?.("aria-disabled") === "true") {
      return false;
    }
    if (element.readOnly || element.getAttribute?.("aria-readonly") === "true") {
      return false;
    }
    const tagName = String(element.tagName || "").toLowerCase();
    if (tagName === "input" && String(element.type || "").toLowerCase() === "hidden") {
      return false;
    }
    if (!tagName) return true;
    return tagName === "textarea" || tagName === "input" ||
      element.getAttribute?.("contenteditable") === "true" ||
      element.getAttribute?.("role") === "textbox" || element.isContentEditable === true;
  }

  function findLikelyInput(config = {}) {
    const candidates = collectElements([INPUT_CANDIDATE_SELECTOR])
      .filter(isVisible)
      .filter(isEditableInput)
      .map((element) => ({
        element,
        strategy: "scored-fallback",
        score: scoreInputCandidate(element, config),
        signals: inputCandidateSignals(element, config),
        fingerprint: elementFingerprint(element),
      }));
    return selectCandidate(candidates, {
      threshold: INPUT_SCORE_THRESHOLD,
      ambiguityMargin: INPUT_AMBIGUITY_MARGIN,
    });
  }

  function inputCandidateSignals(element, config = {}) {
    const signals = [];
    const role = String(element.getAttribute?.("role") || "").toLowerCase();
    const identity = [
      element.id,
      element.getAttribute?.("data-testid"),
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("placeholder"),
      element.className,
    ].map((value) => String(value || "").toLowerCase()).join(" ");
    if (role === "textbox") signals.push("role:textbox");
    if (element.getAttribute?.("contenteditable") === "true" || element.isContentEditable === true) {
      signals.push("editable:true");
    }
    if (/(?:prompt|composer|chat.?input|message|editor|prosemirror|ql-editor|lexical|query-bar)/.test(identity)) {
      signals.push("identity:composer");
    }
    if (matchesClosestSelector(element, config.composerRootSelectors || [])) signals.push("scope:composer");
    if (element.closest?.("nav, aside, header")) signals.push("negative:navigation");
    return signals;
  }

  function scoreInputCandidate(element, config = {}) {
    if (!isEditableInput(element) || !isVisible(element)) return -Infinity;
    const tagName = String(element.tagName || "").toLowerCase();
    const role = String(element.getAttribute?.("role") || "").toLowerCase();
    const type = String(element.type || element.getAttribute?.("type") || "").toLowerCase();
    const identity = [
      element.id,
      element.getAttribute?.("data-testid"),
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("placeholder"),
      element.className,
    ].map((value) => String(value || "").toLowerCase()).join(" ");
    if (type === "hidden" || type === "file" || role === "searchbox" ||
        /(?:^|[\s_-])(search|搜尋|検索|buscar|suchen|chercher|cerca|поиск|بحث|검색)(?:$|[\s_-])/.test(identity)) {
      return -100;
    }

    const rect = element.getBoundingClientRect();
    const viewportHeight = Number(globalThis.innerHeight || document.documentElement?.clientHeight || 0);
    let score = 0;
    if (tagName === "textarea") score += 35;
    if (element.getAttribute?.("contenteditable") === "true" || element.isContentEditable === true) score += 35;
    if (role === "textbox") score += 25;
    if (element.getAttribute?.("aria-multiline") === "true") score += 5;
    if (/(?:prompt|composer|chat.?input|message|editor|prosemirror|ql-editor|lexical|query-bar)/.test(identity)) score += 25;
    if (matchesClosestSelector(element, config.composerRootSelectors || [])) score += 35;
    if (element.closest?.("main, form")) score += 5;
    if (element.closest?.("nav, aside, header")) score -= 45;
    if (rect.width >= 160) score += 10;
    if (rect.height >= 20) score += 5;
    if (viewportHeight > 0 && Number(rect.top || 0) >= viewportHeight * 0.35) score += 10;
    if (rect.width <= 2 || rect.height <= 2) score -= 100;
    return score;
  }

  function matchesClosestSelector(element, selectors) {
    for (const selector of selectors || []) {
      try {
        if (element.closest?.(selector)) return true;
      } catch (_error) {
        // Ignore one stale adapter selector and keep evaluating other signals.
      }
    }
    return false;
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

    const shadowButton = getOpenShadowRoots()
      .map((root) => findConfiguredSendButton(root, config))
      .find(Boolean);
    return findConfiguredSendButton(document, config) || shadowButton || findLikelySendButton(findComposerScope(input, config));
  }

  function findVisibleSendButton(config, input) {
    if (input) {
      let ancestor = input.parentElement;
      while (ancestor && ancestor !== document.documentElement) {
        const nearbyButton = findVisibleConfiguredSendButtons(ancestor, config)[0];
        if (nearbyButton) return nearbyButton;
        ancestor = ancestor.parentElement;
      }
    }
    const shadowButtons = getOpenShadowRoots()
      .flatMap((root) => findVisibleConfiguredSendButtons(root, config));
    const shadowButton = shadowButtons[0];
    return findVisibleConfiguredSendButtons(document, config)[0] || shadowButton ||
      findLikelySendButton(findComposerScope(input, config));
  }

  function findConfiguredSendButton(root, config) {
    return resolveConfiguredSendButton(root, config, true).element;
  }

  function resolveConfiguredSendButton(root, config, enabledOnly = true) {
    const candidates = [];
    for (const [index, selector] of (config.sendSelectors || []).entries()) {
      let matches = [];
      try {
        matches = Array.from(root.querySelectorAll(selector));
      } catch (_error) {
        continue;
      }
      for (const element of matches) {
        const isButton = element instanceof HTMLButtonElement || element.getAttribute("role") === "button";
        if (!isButton || !isVisible(element) || (enabledOnly && !isSendButtonEnabled(element))) continue;
        candidates.push({
          element,
          strategy: "configured-send",
          score: 220 - Math.min(index * 4, 40) + Math.max(-100, scoreSendCandidate(element)),
          signals: [`selector:configured-send`, `selector:${selector.slice(0, 120)}`, ...sendCandidateSignals(element)],
          fingerprint: elementFingerprint(element),
        });
      }
    }
    return selectCandidate(candidates, {
      threshold: 150,
      ambiguityMargin: SEND_AMBIGUITY_MARGIN,
    });
  }

  function isSendButtonEnabled(element) {
    return Boolean(element && !element.disabled && element.getAttribute("aria-disabled") !== "true");
  }

  function findVisibleConfiguredSendButtons(root, config) {
    const candidates = [];
    for (const selector of config.sendSelectors) {
      candidates.push(...Array.from(root.querySelectorAll(selector))
        .filter((element) => element instanceof HTMLButtonElement || element.getAttribute("role") === "button")
        .filter(isVisible));
    }
    return [...new Set(candidates)];
  }

  async function waitForGeminiSubmissionReady(config, input, prompt, timeoutMs = SUBMISSION_READY_TIMEOUT_MS, abortCheck = () => {}) {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      abortCheck();
      if (!isPromptStillPresent(input, prompt)) {
        throw createSubmissionReadinessError();
      }

      const button = findSendButton(config, input);
      if (button) {
        return button;
      }

      if (Date.now() >= deadline) {
        throw createSubmissionReadinessError();
      }
      await delay(Math.min(50, deadline - Date.now()));
    }
  }

  function findComposerScope(input, config) {
    if (!input) return null;
    for (const selector of config.composerRootSelectors || []) {
      try {
        const root = input.closest?.(selector);
        if (root) return root;
      } catch (_error) {
        // Keep the fallback bounded even when one provider selector drifts.
      }
    }
    return input.closest?.("form") || input.parentElement || null;
  }

  function findLikelySendButton(root) {
    return resolveLikelySendButton(root).element;
  }

  function resolveLikelySendButton(root) {
    if (!root) {
      return selectCandidate([], {
        threshold: SEND_SCORE_THRESHOLD,
        ambiguityMargin: SEND_AMBIGUITY_MARGIN,
      });
    }
    const candidates = Array.from(root.querySelectorAll("button, [role='button']"))
      .filter(isVisible)
      .filter((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true")
      .map((element) => ({
        element,
        strategy: "semantic-send-fallback",
        score: scoreSendCandidate(element),
        signals: sendCandidateSignals(element),
        fingerprint: elementFingerprint(element),
      }));
    return selectCandidate(candidates, {
      threshold: SEND_SCORE_THRESHOLD,
      ambiguityMargin: SEND_AMBIGUITY_MARGIN,
    });
  }

  function scoreSendCandidate(element) {
    const label = sendCandidateIdentity(element);
    let score = 0;
    if (/(?:send|submit|傳送|送出|發送)/i.test(label)) score += 90;
    if (/(?:chat.?submit|send.?button|composer.?send)/i.test(label)) score += 45;
    if (String(element.type || element.getAttribute?.("type") || "").toLowerCase() === "submit") score += 75;
    if (/(?:arrow.?up|up.?arrow|paper.?plane)/i.test(label)) score += 35;
    if (/(?:stop|cancel|upload|attach|microphone|voice|record|停止|取消|上傳|附件|語音|錄音)/i.test(label)) score -= 140;
    return score;
  }

  function sendCandidateSignals(element) {
    const signals = [];
    const label = sendCandidateIdentity(element);
    if (/(?:send|submit|傳送|送出|發送)/i.test(label)) signals.push("name:send");
    if (String(element.type || element.getAttribute?.("type") || "").toLowerCase() === "submit") {
      signals.push("type:submit");
    }
    if (/(?:arrow.?up|up.?arrow|paper.?plane)/i.test(label)) signals.push("icon:send-like");
    if (/(?:stop|cancel|upload|attach|microphone|voice|record|停止|取消|上傳|附件|語音|錄音)/i.test(label)) {
      signals.push("negative:unsafe-action");
    }
    return signals;
  }

  function sendCandidateIdentity(element) {
    return [
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("data-testid"),
      element.getAttribute?.("data-icon"),
      element.getAttribute?.("name"),
      element.title,
      element.textContent,
    ].map((value) => String(value || "")).join(" ").toLowerCase();
  }

  async function writeInput(element, text, writeStrategy, abortCheck = () => {}) {
    abortCheck();
    element.focus();
    await delay(150);
    abortCheck();

    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      setNativeValue(element, text);
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    if (writeStrategy === "single-editor-replace") {
      const serializedText = String(text || "")
        .replace(/\r\n?/g, "\n")
        .replace(/\n/g, "\u2028");
      const selection = document.getSelection();
      if (!selection || typeof document.execCommand !== "function") {
        throw createInputWriteError();
      }
      selection.selectAllChildren(element);
      if (document.execCommand("insertText", false, serializedText) === false) {
        throw createInputWriteError();
      }
      await waitForInputWritten(element, serializedText, INPUT_WRITE_TIMEOUT_MS, abortCheck);
      return;
    }

    document.getSelection()?.selectAllChildren(element);
    document.execCommand("insertText", false, text);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));

    if (!element.textContent?.includes(text.slice(0, 20))) {
      element.textContent = text;
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    }
    await waitForInputWritten(element, text, INPUT_WRITE_TIMEOUT_MS, abortCheck);
  }

  async function waitForInputWritten(element, expectedText, timeoutMs = INPUT_WRITE_TIMEOUT_MS, abortCheck = () => {}) {
    const expected = normalizeInputText(expectedText);
    const deadline = Date.now() + timeoutMs;
    while (true) {
      abortCheck();
      if (isPromptStillPresent(element, expected)) {
        return;
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        throw createInputWriteError();
      }
      await delay(Math.min(50, remainingMs));
    }
  }

  function normalizeInputText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .trim();
  }

  function createInputWriteError() {
    const error = new Error("AI 輸入框寫入驗證失敗");
    error.code = "PROVIDER_INPUT_WRITE_FAILED";
    return error;
  }

  function createSubmissionReadinessError() {
    const error = new Error("Gemini 輸入框尚未達到可送出狀態");
    error.code = "PROVIDER_SUBMISSION_NOT_READY";
    return error;
  }

  function isPromptStillPresent(input, prompt) {
    const expected = normalizeInputText(prompt);
    if (normalizeInputText(readInputText(input)) === expected) return true;
    // Gemini asynchronously converts Markdown into Quill formatting after input.
    // Reconstruct only known formatting, without dropping arbitrary source characters.
    if (!input.matches?.(".ql-editor.rich-query-formatting-enabled")) return false;
    return normalizeInputText(readFormattedEditorSource(input)) === expected;
  }

  function readFormattedEditorSource(element) {
    const serialize = (node) => {
      if (node.nodeType === 3) return node.textContent || "";
      const tag = String(node.tagName || "").toLowerCase();
      if (tag === "br") return "\n";
      // Quill represents one empty paragraph with a placeholder BR. Counting
      // both that BR and the paragraph boundary inserts an extra source newline.
      if (tag === "p" && node.childNodes?.length === 1 &&
          String(node.childNodes[0].tagName || "").toLowerCase() === "br") {
        return node.nextSibling ? "\n" : "";
      }
      const content = Array.from(node.childNodes || []).map(serialize).join("");
      if (tag === "strong" || tag === "b") return `**${content}**`;
      if (tag === "em" || tag === "i") return `*${content}*`;
      if (tag === "p" && node.nextSibling) return `${content}\n`;
      return content;
    };
    return serialize(element);
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

  async function waitForCompletion(config, providerId, timeoutMs, baseline, prompt, errorBaseline = [], abortCheck = () => {}, userTurnCount) {
    const startedAt = Date.now();
    let completionWindow = createCompletionWindow(timeoutMs, startedAt);
    let lastVisibleText = readAssistantSnapshot(config, providerId).lastText;
    let candidateBuffer = createResponseCandidateBuffer();

    while (true) {
      abortCheck();
      if (Number.isInteger(userTurnCount) && countUserMessages(config) > userTurnCount + 1) {
        const error = new Error("此分頁出現另一則使用者訊息，已停止擷取以免混入其他回答。");
        error.code = "PROVIDER_CONVERSATION_CHANGED";
        throw error;
      }
      assertProviderLocation(providerId, config);
      const now = Date.now();
      if (now >= Math.min(completionWindow.inactivityDeadline, completionWindow.hardDeadline)) {
        break;
      }

      const pageError = readKnownProviderPageError(config, providerId, errorBaseline);
      if (pageError) {
        throw createProviderResponseError(pageError.classification, pageError.content);
      }

      const current = readAssistantSnapshot(config, providerId);
      const currentText = current.lastText;
      const hasFreshCandidate = Boolean(currentText) &&
        hasFreshAssistantResponse(baseline, current) &&
        !isPromptEcho(prompt, currentText);
      if (hasFreshCandidate) {
        candidateBuffer = updateResponseCandidateBuffer(candidateBuffer, baseline, current, prompt, Date.now());
      }
      if (currentText && currentText !== lastVisibleText) {
        lastVisibleText = currentText;
        completionWindow = extendCompletionWindow(completionWindow);
      }

      const timeStable = Date.now() - (candidateBuffer.stableSince || startedAt);
      const generating = isGenerating(config);
      const stableFallbackMs = config.generatingStableFallbackMs || 30000;
      if (
        candidateBuffer.text &&
        (
          !generating ||
          (!config.requireGenerationEnd && timeStable > stableFallbackMs)
        ) &&
        timeStable > 2000
      ) {
        return candidateBuffer.text;
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
    const busyVisible = Array.from(document.querySelectorAll(
      "[data-is-streaming='true'], [data-testid*='response'][aria-busy='true'], [data-testid*='message'][aria-busy='true'], .font-claude-response[aria-busy='true'], .prose [aria-busy='true']",
    ))
      .some((el) => isVisible(el));

    return stopVisible || busyVisible;
  }

  function readLastAssistantMessage(config, providerId) {
    return readAssistantSnapshot(config, providerId).lastText;
  }

  function createResponseCandidateBuffer() {
    return { text: "", stableSince: 0, identity: "" };
  }

  function updateResponseCandidateBuffer(buffer, baseline, current, prompt, now = Date.now()) {
    const candidate = String(current?.lastText || "").trim();
    if (
      !candidate ||
      isPromptEcho(prompt, candidate) ||
      !hasFreshAssistantResponse(baseline, current) ||
      (buffer.text && candidate.length < buffer.text.length)
    ) {
      return buffer;
    }
    if (candidate === buffer.text && current.lastIdentity === buffer.identity) {
      return buffer;
    }
    return { text: candidate, stableSince: now, identity: current.lastIdentity || "" };
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
      .map((element) => ({
        element,
        content: normalizeProviderResponse(providerId, element.innerText || element.textContent || "").trim(),
      }))
      .filter((candidate) => candidate.content)
      .map((candidate) => ({
        ...candidate,
        fingerprint: providerErrorFingerprint(candidate.content),
      }));
  }

  function createProviderResponseError(classification, content) {
    const error = new Error(classification.message);
    error.code = classification.code;
    error.providerContent = content;
    return error;
  }

  async function observeProviderSubmission(config, input, prompt, initialUserMessageCount, promptWasPresent, abortCheck = () => {}, timeoutMs = 4000, initiallyGenerating = false) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      abortCheck();
      if (promptWasPresent && !readInputText(input)) {
        return "input-cleared";
      }
      if (!initiallyGenerating && isGenerating(config)) {
        return "generation-started";
      }
      if (countUserMessages(config, prompt) > initialUserMessageCount) {
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

  function countUserMessages(config, prompt) {
    return readUserMessageTexts(config).filter((text) => !prompt || userMessageContainsPrompt(text, prompt)).length;
  }

  function userMessageContainsPrompt(messageText, prompt) {
    const normalizedMessage = normalizeInputText(messageText).replace(/\s+/g, " ");
    const normalizedPrompt = normalizeInputText(prompt).replace(/\s+/g, " ");
    return Boolean(normalizedPrompt) && normalizedMessage.includes(normalizedPrompt);
  }

  function readUserMessageTexts(config) {
    const elements = collectElements(config.userMessageSelectors).filter(isVisible);
    return elements
      .filter((element) => !elements.some((other) => other !== element && other.contains?.(element)))
      .map((element) => element.innerText || element.textContent || "")
      .map((text) => String(text).trim())
      .filter(Boolean);
  }

  function readAssistantSnapshot(config, providerId) {
    const preferredElements = config.preferredResponseSelector
      ? collectElements([config.preferredResponseSelector]).filter(isVisible)
      : [];
    let elements = preferredElements.length > 0
      ? preferredElements
      : collectElements(config.responseSelectors);

    const userElements = collectElements(config.userMessageSelectors).filter(isVisible);
    elements = elements.filter((element) => !userElements.some((userElement) =>
      userElement === element ||
      userElement.contains?.(element) ||
      element.contains?.(userElement),
    ));
    if (!elements.some((element) => isVisible(element) &&
      String(element.innerText || element.textContent || "").trim())) {
      elements = findSemanticAssistantResponses().filter((element) =>
        !userElements.some((userElement) =>
          userElement === element ||
          userElement.contains?.(element) ||
          element.contains?.(userElement),
        ),
      );
    }

    // Filter out elements that are descendants of any other element in the list
    // This ensures we capture the outermost message container and don't overwrite
    // it with an inner text block (which would miss sibling artifacts/cards).
    elements = elements.filter((el) => {
      return !elements.some((other) => other !== el && other.contains(el));
    });

    const messages = [...new Set(elements)]
      .filter(isVisible)
      .map((element) => ({
        element,
        text: normalizeProviderResponse(providerId, element.innerText || element.textContent || "").trim(),
        identity: readElementIdentity(element),
      }))
      .filter((message) => message.text.length > 0)
      .map(({ text, identity }) => ({ text, identity }));

    return assistantSnapshot(messages);
  }

  function findSemanticAssistantResponses() {
    const candidates = collectElements([
      "article[aria-label]",
      "[role='article'][aria-label]",
      "[data-message-author]",
      "[data-author]",
      "[data-role]",
      "[data-testid*='message']",
    ]);
    return candidates.filter((element) => {
      const author = ["data-message-author", "data-author", "data-role"]
        .map((name) => String(element.getAttribute?.(name) || "").toLowerCase());
      const label = String(element.getAttribute?.("aria-label") || "").toLowerCase();
      const testId = String(element.getAttribute?.("data-testid") || "").toLowerCase();
      const article = String(element.tagName || "").toLowerCase() === "article" ||
        element.getAttribute?.("role") === "article";
      const messageShape = article || /(?:message|response|turn)/.test(testId);
      const explicitlyUser = author.some((value) => /^(user|human)$/.test(value));
      const explicitlyAssistant = !explicitlyUser && (
        ["data-message-author", "data-author"].some((name) =>
          /^(assistant|model|ai)$/.test(String(element.getAttribute?.(name) || "").toLowerCase()),
        ) ||
        (messageShape && /^(assistant|model|ai)$/.test(author[2])) ||
        /(?:^|[-_])assistant(?:[-_]|$)/.test(testId) ||
        (article && /\b(assistant|model|ai)\b/.test(label))
      );
      if (!explicitlyAssistant) return false;

      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const parentAuthor = ["data-message-author", "data-author", "data-role"]
          .map((name) => String(parent.getAttribute?.(name) || "").toLowerCase());
        if (parentAuthor.some((value) => /^(user|human)$/.test(value))) return false;
      }
      return true;
    });
  }

  function readElementIdentity(element) {
    const explicitIdentity = [
      "data-chatgpt-selection-message-id",
      "data-message-id",
      "data-conversation-message-id",
      "data-turn-id",
      "data-response-index",
      "data-index",
      "id",
    ].map((name) => element.getAttribute?.(name)).find(Boolean);
    return explicitIdentity ? String(explicitIdentity) : "";
  }

  function collectElements(selectors) {
    if (!selectors || selectors.length === 0) return [];
    const direct = querySelectorList(document, selectors);
    const shadowMatches = getOpenShadowRoots()
      .flatMap((root) => querySelectorList(root, selectors));
    return [...new Set([...direct, ...shadowMatches])];
  }

  function querySelectorList(root, selectors) {
    const matches = [];
    for (const selector of selectors) {
      try {
        matches.push(...Array.from(root.querySelectorAll(selector)));
      } catch (_error) {
        // A single invalid or retired selector must not disable the contract.
      }
    }
    return [...new Set(matches)];
  }

  function getOpenShadowRoots(now = Date.now()) {
    if (shadowRootCache.expiresAt > now) return shadowRootCache.roots;
    const roots = [];
    const pending = [document];
    while (pending.length > 0 && roots.length < 64) {
      const root = pending.shift();
      let elements = [];
      try {
        elements = Array.from(root.querySelectorAll("*"));
      } catch (_error) {
        continue;
      }
      for (const element of elements) {
        if (element.shadowRoot && !roots.includes(element.shadowRoot)) {
          roots.push(element.shadowRoot);
          pending.push(element.shadowRoot);
        }
      }
    }
    shadowRootCache = { expiresAt: now + SHADOW_ROOT_CACHE_MS, roots };
    return roots;
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
  }

  async function waitFor(getValue, timeoutMs, errorMessage, abortCheck = () => {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      abortCheck();
      const value = getValue();
      if (value) {
        return value;
      }
      await delay(250);
    }
    throw new Error(errorMessage);
  }

  async function waitForOptional(getValue, timeoutMs, abortCheck = () => {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      abortCheck();
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

  // Kept as a pure function export for the service layer and deterministic tests.
  globalThis.aiDebateProviderPageReadiness = checkReadiness;
})();
