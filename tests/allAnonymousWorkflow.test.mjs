import test from "node:test";
import assert from "node:assert/strict";

const PROVIDER_CONTENT_VERSION = "0.5.0-driver.6";

function createChromeMock({ failSummaryProvider, pauseFirstRead, initialUrl = "chrome://newtab/" } = {}) {
  const tabs = new Map();
  const submitted = new Map();
  const sent = [];
  let nextTabId = 1;
  let onMessage;
  let resolvePausedRead;
  let signalFirstReadStarted;
  const pausedRead = pauseFirstRead
    ? new Promise((resolve) => { resolvePausedRead = resolve; })
    : null;
  const firstReadStarted = pauseFirstRead
    ? new Promise((resolve) => { signalFirstReadStarted = resolve; })
    : null;

  function addTab(url, active = false) {
    const tab = { id: nextTabId++, url, pendingUrl: url, active, status: "complete" };
    tabs.set(tab.id, tab);
    return { ...tab };
  }

  addTab(initialUrl, true);
  const chrome = {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener(listener) { onMessage = listener; } },
      sendMessage() { return Promise.resolve(); },
    },
    storage: {
      local: {
        async get(key) { return { [key]: undefined }; },
        async set() {},
        async remove() {},
      },
    },
    tabs: {
      async query(query = {}) {
        let result = [...tabs.values()];
        if (query.active) result = result.filter((tab) => tab.active);
        if (query.url) {
          const patterns = Array.isArray(query.url) ? query.url : [query.url];
          result = result.filter((tab) => patterns.some((pattern) => {
            const prefix = pattern.split("*")[0];
            return tab.url.startsWith(prefix);
          }));
        }
        return result.map((tab) => ({ ...tab }));
      },
      async get(tabId) {
        const tab = tabs.get(tabId);
        if (!tab) throw new Error(`Unknown tab ${tabId}`);
        return { ...tab };
      },
      async create({ url, active = false }) {
        if (active) for (const tab of tabs.values()) tab.active = false;
        return addTab(url, active);
      },
      async update(tabId, patch) {
        const tab = tabs.get(tabId);
        if (!tab) throw new Error(`Unknown tab ${tabId}`);
        if (patch.active) {
          for (const other of tabs.values()) other.active = false;
        }
        Object.assign(tab, patch);
        return { ...tab };
      },
      async sendMessage(tabId, message) {
        sent.push({ tabId, ...message });
        if (message.type === "aiDebate:getCapabilities") {
          return { contentScriptVersion: PROVIDER_CONTENT_VERSION, driverContractVersion: 1 };
        }
        if (message.type === "aiDebate:checkReadiness") {
          return { ready: true, status: "ready" };
        }
        if (message.type === "aiDebate:submitPrompt") {
          submitted.set(message.runId, { ...message });
          return { ok: true, runId: message.runId };
        }
        if (message.type === "aiDebate:sendAndRead") {
          return { ok: true, content: `${message.provider}:${message.phase}:${message.prompt}` };
        }
        if (message.type === "aiDebate:readSubmittedResponse") {
          const job = submitted.get(message.runId);
          if (!job) return { ok: false, error: "Missing submitted prompt" };
          if (pauseFirstRead && job.phase === "first-round") {
            signalFirstReadStarted?.();
            await pausedRead;
          }
          if (job.phase === "summary" && (job.provider === failSummaryProvider || failSummaryProvider === "all")) {
            return { ok: false, error: "mock summary failure", code: "MOCK_SUMMARY_FAILURE" };
          }
          return { ok: true, content: `${job.provider}:${job.phase}:${job.prompt}` };
        }
        return { ok: true };
      },
    },
    scripting: { async executeScript() {} },
  };

  return {
    chrome,
    sent,
    async dispatch(message) {
      return new Promise((resolve) => {
        assert.equal(onMessage(message, {}, resolve), true);
      });
    },
    releaseRead() { resolvePausedRead?.(); },
    firstReadStarted,
    getTabs() { return [...tabs.values()].map((tab) => ({ ...tab })); },
  };
}

async function loadWorker(mock, query) {
  globalThis.chrome = mock.chrome;
  await import(`../src/background/service-worker.js?all-anonymous-${query}`);
}

async function quickly(action) {
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, _delay, ...args) => originalSetTimeout(callback, 0, ...args);
  try {
    return await action();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
}

test("chat accepts the preflight handoff and waits after answers without running critiques", async () => {
  await quickly(async () => {
    const mock = createChromeMock();
    await loadWorker(mock, "chat-handoff");
    const response = await mock.dispatch({
      type: "aiDebate:start", mode: "chat", question: "聊天啟動測試",
      activeProviders: ["chatgpt", "gemini"], debateRounds: 5,
    });
    assert.equal(response.ok, true, response.error);
    assert.equal(response.state.phase, "waiting_for_user");
    assert.equal(response.state.transcript.openEnded, true);
    assert.equal(mock.sent.filter((m) => m.type === "aiDebate:submitPrompt" && m.phase === "first-round").length, 2);
    assert.equal(mock.sent.filter((m) => m.type === "aiDebate:submitPrompt" && m.phase === "critique").length, 0);
  });
});

test("chat imposter can conclude immediately after first answers", async () => {
  const previousChrome = globalThis.chrome;
  try {
    await quickly(async () => {
      const mock = createChromeMock();
      await loadWorker(mock, "chat-imposter-direct-reveal");
      const start = await mock.dispatch({ type: "aiDebate:start", mode: "chat",
        question: "群聊揭曉", activeProviders: ["chatgpt", "gemini"], interactionStyle: "imposter" });
      assert.equal(start.ok, true, start.error);
      const result = await mock.dispatch({ type: "aiDebate:nextRound", action: "summarize" });
      assert.equal(result.ok, true, result.error);
      assert.equal(result.state.status, "done");
      assert.ok(result.state.transcript.reveal.reactions.chatgpt);
      assert.ok(result.state.transcript.reveal.reactions.gemini);
    });
  } finally {
    globalThis.chrome = previousChrome;
  }
});

test("theater honors Engine imposter minimum rounds before waiting for user input", async () => {
  await quickly(async () => {
    const mock = createChromeMock();
    await loadWorker(mock, "theater-imposter-rounds");
    const response = await mock.dispatch({
      type: "aiDebate:start", mode: "theater", question: "劇場啟動測試",
      activeProviders: ["chatgpt", "gemini"], debateRounds: 1, interactionStyle: "imposter",
    });
    assert.equal(response.ok, true, response.error);
    assert.equal(response.state.phase, "waiting_for_user");
    assert.equal(response.state.debateRounds, 2);
    assert.equal(response.state.transcript.debateRounds, 2);
    assert.equal(response.state.currentCritiqueRound, 2);
    assert.ok(response.state.transcript.critiqueRounds.every((round) => round.chatgpt && round.gemini));
    assert.equal(mock.sent.filter((m) => m.type === "aiDebate:submitPrompt" && /^critique(?:-\d+)?$/.test(m.phase)).length, 4);
  });
});

test("fast allAnonymous starts, answers, critiques, and summarizes independently in fresh tabs", async () => {
  await quickly(async () => {
    const mock = createChromeMock();
    await loadWorker(mock, "success");

    const response = await mock.dispatch({
      type: "aiDebate:start",
      mode: "fast",
      question: "該如何降低城市熱島效應？",
      activeProviders: ["chatgpt", "gemini"],
      summaryStrategy: "allAnonymous",
    });

    assert.equal(response.ok, true);
    assert.equal(response.state.status, "done");
    assert.equal(response.state.summaryStrategy, "allAnonymous");
    assert.equal(response.state.transcript.answers.chatgpt.startsWith("chatgpt:first-round:"), true);
    assert.equal(response.state.transcript.answers.gemini.startsWith("gemini:first-round:"), true);
    assert.equal(response.state.transcript.critiqueRounds[0].chatgpt.startsWith("chatgpt:critique:"), true);
    assert.equal(response.state.transcript.critiqueRounds[0].gemini.startsWith("gemini:critique:"), true);

    const summaries = mock.sent.filter((message) => message.type === "aiDebate:submitPrompt" && message.phase === "summary");
    assert.deepEqual(summaries.map(({ provider }) => provider), ["chatgpt", "gemini"]);
    const otherJobs = mock.sent.filter((message) =>
      message.type === "aiDebate:submitPrompt" && ["first-round", "critique"].includes(message.phase),
    );
    assert.equal(new Set(summaries.map(({ tabId }) => tabId)).size, 2);
    assert.ok(summaries.every(({ tabId }) => otherJobs.every((job) => job.tabId !== tabId)));
    assert.ok(summaries.every(({ prompt }) => /匿名|裁判|暱稱/.test(prompt)));
    assert.ok(summaries.every(({ prompt }) => !/ChatGPT|Gemini/.test(prompt)));
    assert.match(response.state.summary, /焦糖雲朵|星星果凍/);
  });
});

test("allAnonymous keeps successful summaries when one judge fails", async () => {
  await quickly(async () => {
    const mock = createChromeMock({ failSummaryProvider: "gemini" });
    await loadWorker(mock, "partial");

    const response = await mock.dispatch({
      type: "aiDebate:start",
      mode: "fast",
      question: "如何改善公共運輸？",
      activeProviders: ["chatgpt", "gemini"],
      summaryStrategy: "allAnonymous",
    });

    assert.equal(response.ok, true);
    assert.equal(response.state.status, "done");
    assert.match(response.state.summary, /chatgpt:summary:/);
    assert.match(response.state.summary, /這位裁判未能完成總結/);
    assert.equal(response.state.errors.some((error) => error.provider === "gemini" && error.phase === "summary"), true);
  });
});

test("all-anonymous reports all judges failing without duplicate errors or a false success state", async () => {
  await quickly(async () => {
    const mock = createChromeMock({ failSummaryProvider: "all" });
    await loadWorker(mock, "all-failed");
    const response = await mock.dispatch({
      type: "aiDebate:start", mode: "fast", question: "所有裁判失敗",
      activeProviders: ["chatgpt", "gemini"], summaryStrategy: "allAnonymous",
    });
    assert.equal(response.state.status, "error");
    assert.equal(response.state.busy, false);
    assert.equal(response.state.summary, "");
    assert.equal(response.state.errors.filter((error) => error.phase === "summary").length, 2);
    assert.deepEqual(Object.keys(response.state.summaries).sort(), ["chatgpt", "gemini"]);
  });
});

test("summary mode also sends an anonymous final prompt to its separate source provider", async () => {
  await quickly(async () => {
    const mock = createChromeMock({ initialUrl: "https://chatgpt.com/" });
    await loadWorker(mock, "source-provider");

    const response = await mock.dispatch({
      type: "aiDebate:start",
      mode: "summary",
      question: "請整理目前對話",
      activeProviders: ["gemini", "grok"],
      summaryStrategy: "allAnonymous",
    });

    assert.equal(response.ok, true);
    assert.equal(response.state.status, "done");
    assert.equal(response.state.summaryProvider, "chatgpt");
    assert.deepEqual(response.state.activeProviders, ["gemini", "grok"]);
    const summaryJobs = mock.sent.filter((message) => message.type === "aiDebate:submitPrompt" && message.phase === "summary");
    assert.deepEqual(summaryJobs.map(({ provider }) => provider), ["gemini", "grok", "chatgpt"]);
    assert.equal(new Set(summaryJobs.map(({ tabId }) => tabId)).size, 3);
    assert.ok(summaryJobs.every(({ prompt }) => /舞會暱稱規則/.test(prompt)));
    assert.ok(summaryJobs.every(({ prompt }) => !/ChatGPT|Gemini|Grok/.test(prompt)));
    const sourceSummary = mock.sent.find((message) => message.type === "aiDebate:sendAndRead" && message.phase === "source-summary");
    assert.ok(sourceSummary);
    assert.ok(summaryJobs.every(({ tabId }) => tabId !== sourceSummary.tabId));
  });
});

test("stop during answer collection is returned as cancellation, not a swallowed failure", async () => {
  await quickly(async () => {
    const mock = createChromeMock({ pauseFirstRead: true });
    await loadWorker(mock, "stop");

    let resolveStart;
    const startResult = new Promise((resolve) => { resolveStart = resolve; });
    const startDispatch = mock.dispatch({
      type: "aiDebate:start",
      mode: "fast",
      question: "停止流程測試",
      activeProviders: ["chatgpt", "gemini"],
      summaryStrategy: "allAnonymous",
    }).then(resolveStart);

    await mock.firstReadStarted;
    const stopped = await mock.dispatch({ type: "aiDebate:stop" });
    assert.equal(stopped.ok, true);
    mock.releaseRead();
    const result = await startResult;
    await startDispatch;

    assert.equal(result.ok, false);
    assert.equal(result.code, "RUN_CANCELLED");
  });
});
