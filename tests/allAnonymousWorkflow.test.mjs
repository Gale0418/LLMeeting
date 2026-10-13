import test from "node:test";
import assert from "node:assert/strict";
import { DebateEngine } from "../src/background/debateEngine.js";

const PROVIDER_CONTENT_VERSION = "0.5.1-driver.11";

function createChromeMock({ failSummaryProvider, failSubmit = [], failRead = [], serverOverload = [], pendingReads = [], pauseFirstRead, initialUrl = "chrome://newtab/", initialCurrentState } = {}) {
  const tabs = new Map();
  const submitted = new Map();
  const readAttempts = new Map();
  const sent = [];
  const dispatches = [];
  let nextTabId = 1;
  let onMessage;
  let resolvePausedRead;
  let signalFirstReadStarted;
  const matchesFailure = (configured, job) => {
    const failures = Array.isArray(configured) ? configured : [configured];
    return failures.some((failure) => failure && failure.provider === job.provider && failure.phase === job.phase);
  };
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
        async get(key) { return { [key]: key === "aiDebate.currentState" ? initialCurrentState : undefined }; },
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
          if (matchesFailure(failSubmit, message)) {
            return { ok: false, error: "mock submit failure", code: "MOCK_SUBMIT_FAILURE" };
          }
          submitted.set(message.runId, { ...message });
          return { ok: true, runId: message.runId };
        }
        if (message.type === "aiDebate:sendAndRead") {
          if (matchesFailure(serverOverload, message)) {
            return { ok: false, error: "The servers are overloaded. Please try again later.", code: "PROVIDER_OVERLOADED" };
          }
          if (matchesFailure(failRead, message)) {
            return { ok: false, error: "mock read failure", code: "MOCK_READ_FAILURE" };
          }
          return { ok: true, content: `${message.provider}:${message.phase}:${message.prompt}` };
        }
        if (message.type === "aiDebate:readSubmittedResponse") {
          const job = submitted.get(message.runId);
          if (!job) return { ok: false, error: "Missing submitted prompt" };
          const attempt = (readAttempts.get(message.runId) || 0) + 1;
          readAttempts.set(message.runId, attempt);
          if (pauseFirstRead && job.phase === "first-round") {
            signalFirstReadStarted?.();
            await pausedRead;
          }
          if (matchesFailure(serverOverload, job)) {
            return { ok: false, error: "The servers are overloaded. Please try again later.", code: "PROVIDER_OVERLOADED" };
          }
          if (matchesFailure(failRead, job) || (job.phase === "summary" && (job.provider === failSummaryProvider || failSummaryProvider === "all"))) {
            return { ok: false, error: "mock summary failure", code: "MOCK_SUMMARY_FAILURE" };
          }
          const pending = pendingReads.find((item) => item.provider === job.provider && item.phase === job.phase);
          if (pending && attempt <= pending.count) return { ok: true, pending: true, runId: message.runId };
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
    dispatches,
    async dispatch(message) {
      return new Promise((resolve) => {
        const record = { message, responses: [] };
        dispatches.push(record);
        assert.equal(onMessage(message, {}, (response) => {
          record.responses.push(response);
          if (record.responses.length === 1) resolve(response);
        }), true);
      });
    },
    dispatchWithoutWaiting(message) {
      const record = { message, responses: [] };
      dispatches.push(record);
      assert.equal(onMessage(message, {}, (response) => { record.responses.push(response); }), true);
      return record;
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

async function waitForState(mock, predicate, label) {
  let latestState;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await mock.dispatch({ type: "aiDebate:getState" });
    assert.equal(response.ok, true, response.error);
    latestState = response.state;
    if (predicate(latestState)) return latestState;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail(`等待${label}逾時；最後狀態：${latestState?.status}/${latestState?.phase}`);
}

async function dispatchAndWait(mock, message, label) {
  const response = await mock.dispatch(message);
  assert.equal(response.ok, true, response.error);
  assert.equal(response.accepted, true);
  const state = await waitForState(mock, (candidate) =>
    !candidate.busy && ["done", "waiting_for_user", "error", "idle"].includes(candidate.status), label);
  return { ...response, state };
}

test("chat accepts the preflight handoff and waits after answers without running critiques", async () => {
  await quickly(async () => {
    const mock = createChromeMock();
    await loadWorker(mock, "chat-handoff");
    const response = await dispatchAndWait(mock, {
      type: "aiDebate:start", mode: "chat", question: "聊天啟動測試",
      activeProviders: ["chatgpt", "gemini"], debateRounds: 5,
    }, "聊天首輪完成");
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
      const start = await dispatchAndWait(mock, { type: "aiDebate:start", mode: "chat",
        question: "群聊揭曉", activeProviders: ["chatgpt", "gemini"], interactionStyle: "imposter" }, "內鬼群聊首輪完成");
      assert.equal(start.ok, true, start.error);
      const result = await dispatchAndWait(mock, { type: "aiDebate:nextRound", action: "summarize" }, "內鬼揭曉完成");
      assert.equal(result.ok, true, result.error);
      assert.equal(result.accepted, true);
      assert.equal(result.state.status, "done");
      const nextRoundCall = mock.dispatches.find((call) => call.message.type === "aiDebate:nextRound");
      assert.equal(nextRoundCall.responses.length, 1, "nextRound must acknowledge once, then publish completion as state");
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
    const response = await dispatchAndWait(mock, {
      type: "aiDebate:start", mode: "theater", question: "劇場啟動測試",
      activeProviders: ["chatgpt", "gemini"], debateRounds: 1, interactionStyle: "imposter",
    }, "劇場互評完成");
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

    const response = await dispatchAndWait(mock, {
      type: "aiDebate:start",
      mode: "fast",
      question: "該如何降低城市熱島效應？",
      activeProviders: ["chatgpt", "gemini"],
      summaryStrategy: "allAnonymous",
    }, "匿名流程總結完成");

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

test("allAnonymous automatically resumes after the final manual repair without resending", async () => {
  await quickly(async () => {
    const mock = createChromeMock({ failSummaryProvider: "gemini" });
    await loadWorker(mock, "partial");

    const response = await dispatchAndWait(mock, {
      type: "aiDebate:start",
      mode: "fast",
      question: "如何改善公共運輸？",
      activeProviders: ["chatgpt", "gemini"],
      summaryStrategy: "allAnonymous",
    }, "單一裁判故障暫停");

    assert.equal(response.ok, true);
    assert.equal(response.state.status, "waiting_for_user");
    assert.equal(response.state.phase, "waiting_for_user");
    assert.equal(response.state.busy, false);
    assert.equal(response.state.repairPause.target, "summary");
    assert.equal(response.state.repairPause.remainingJobs.length, 0);
    assert.match(response.state.summaries.chatgpt, /chatgpt:summary:/);
    assert.match(response.state.summaries.gemini, /這位裁判未能完成總結/);
    assert.equal(response.state.errors.some((error) => error.provider === "gemini" && error.phase === "summary"), true);

    const summarySubmissions = () => mock.sent.filter((message) => message.type === "aiDebate:submitPrompt" && message.phase === "summary");
    const sentBeforeRepair = summarySubmissions().map(({ provider }) => provider);
    const repair = await mock.dispatch({
      type: "aiDebate:repairReply", provider: "gemini", phase: "summary",
      content: "Gemini 人工補上的總結", expectedContent: response.state.summaries.gemini,
      sessionId: response.state.transcript.sessionId,
      originalQuestion: response.state.transcript.originalQuestion,
    });
    assert.equal(repair.ok, true, repair.error);
    assert.equal(repair.state.busy, true);
    assert.equal(repair.state.summaries.gemini, "Gemini 人工補上的總結");
    assert.deepEqual(summarySubmissions().map(({ provider }) => provider), sentBeforeRepair);

    const finished = await waitForState(mock, (state) => state.status === "done", "匿名總結自動完成");
    assert.match(finished.summary, /chatgpt:summary:/);
    assert.match(finished.summary, /Gemini 人工補上的總結/);
    assert.deepEqual(summarySubmissions().map(({ provider }) => provider), sentBeforeRepair);
  });
});

test("departing the only failed anonymous judge safely closes without repairing or resending", async () => {
  await quickly(async () => {
    const mock = createChromeMock({ failSummaryProvider: "gemini" });
    await loadWorker(mock, "depart-failed-anonymous-judge");
    const start = await dispatchAndWait(mock, {
      type: "aiDebate:start", mode: "fast", question: "離席後保留既有總結",
      activeProviders: ["chatgpt", "gemini"], summaryStrategy: "allAnonymous",
    }, "匿名總結故障暫停");
    const fault = start.state.summaries.gemini;
    const summarySubmissions = () => mock.sent.filter((message) => message.type === "aiDebate:submitPrompt" && message.phase === "summary");
    const before = summarySubmissions().map(({ provider }) => provider);
    const departure = {
      type: "aiDebate:departProvider", provider: "gemini", phase: "summary",
      expectedContent: fault, sessionId: start.state.transcript.sessionId,
    };
    for (const stale of [
      { ...departure, sessionId: "different-session" },
      { ...departure, phase: "first-round" },
      { ...departure, expectedContent: "stale fault text" },
    ]) {
      const rejected = await mock.dispatch(stale);
      assert.equal(rejected.ok, false);
      assert.equal(rejected.state.departedProviders.includes("gemini"), false);
    }
    const response = await mock.dispatch(departure);
    assert.equal(response.ok, true, response.error);
    assert.deepEqual(response.state.departedProviders, ["gemini"]);
    assert.equal(response.state.activeProviders.includes("gemini"), true);
    const finished = await waitForState(mock, (state) => state.status === "done", "離席後完成匿名總結");
    assert.equal(finished.repairPause, null);
    assert.equal(finished.summary, "");
    assert.match(finished.message, /僅剩一位 AI/);
    assert.deepEqual(summarySubmissions().map(({ provider }) => provider), before);
    const stale = await mock.dispatch(departure);
    assert.equal(stale.ok, false, "同一張故障格不能重複讓 AI 離席");
  });
});

test("departing during critique safely closes when one participant remains", async () => {
  await quickly(async () => {
    const mock = createChromeMock({ failRead: [{ provider: "gemini", phase: "critique" }] });
    await loadWorker(mock, "depart-single-remaining-critique");
    const start = await dispatchAndWait(mock, {
      type: "aiDebate:start", mode: "fast", question: "單一在席者不做互評",
      activeProviders: ["chatgpt", "gemini"], debateRounds: 2, skipSummary: true,
    }, "互評故障暫停");
    assert.equal(start.state.repairPause.target, "critique");
    const response = await mock.dispatch({
      type: "aiDebate:departProvider", provider: "gemini", phase: "critique",
      expectedContent: start.state.transcript.critiqueRounds[0].gemini,
      sessionId: start.state.transcript.sessionId,
    });
    assert.equal(response.ok, true, response.error);
    assert.equal(response.state.status, "done");
    assert.equal(response.state.repairPause, null);
    const critiqueRounds = mock.sent.filter((message) => message.type === "aiDebate:submitPrompt" && message.phase.startsWith("critique"));
    assert.deepEqual(critiqueRounds.map(({ provider, phase }) => [provider, phase]), [
      ["chatgpt", "critique"], ["gemini", "critique"],
    ], "already-submitted round stays in history, but no later critique is sent");
  });
});

test("allAnonymous stays paused until every failed judge is manually repaired", async () => {
  await quickly(async () => {
    const mock = createChromeMock({ failSummaryProvider: "all" });
    await loadWorker(mock, "all-failed-manual-repair");
    const start = await dispatchAndWait(mock, {
      type: "aiDebate:start", mode: "fast", question: "補齊所有匿名裁判",
      activeProviders: ["chatgpt", "gemini"], summaryStrategy: "allAnonymous",
    }, "雙裁判故障暫停");
    assert.equal(start.state.status, "waiting_for_user");

    const summarySubmissions = () => mock.sent.filter((message) =>
      message.type === "aiDebate:submitPrompt" && message.phase === "summary");
    const submitCount = summarySubmissions().length;
    const repairFirst = await mock.dispatch({
      type: "aiDebate:repairReply", provider: "chatgpt", phase: "summary",
      content: "ChatGPT 人工補上的匿名總結", expectedContent: start.state.summaries.chatgpt,
      sessionId: start.state.transcript.sessionId,
      originalQuestion: start.state.transcript.originalQuestion,
    });
    assert.equal(repairFirst.ok, true, repairFirst.error);
    assert.equal(repairFirst.state.status, "waiting_for_user");
    assert.equal(repairFirst.state.busy, false);
    assert.ok(repairFirst.state.repairPause);
    assert.equal(repairFirst.state.summaries.chatgpt, "ChatGPT 人工補上的匿名總結");
    assert.equal(summarySubmissions().length, submitCount);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const repairLast = await mock.dispatch({
      type: "aiDebate:repairReply", provider: "gemini", phase: "summary",
      content: "Gemini 人工補上的匿名總結", expectedContent: repairFirst.state.summaries.gemini,
      sessionId: start.state.transcript.sessionId,
      originalQuestion: start.state.transcript.originalQuestion,
    });
    assert.equal(repairLast.ok, true, repairLast.error);
    assert.equal(repairLast.state.busy, true);
    assert.equal(summarySubmissions().length, submitCount);

    const finished = await waitForState(mock, (state) => state.status === "done", "全部裁判補齊後自動完成");
    assert.match(finished.summary, /ChatGPT 人工補上的匿名總結/);
    assert.match(finished.summary, /Gemini 人工補上的匿名總結/);
    assert.equal(summarySubmissions().length, submitCount);
  });
});

test("all-anonymous reports all judges failing without duplicate errors or a false success state", async () => {
  await quickly(async () => {
    const mock = createChromeMock({ failSummaryProvider: "all" });
    await loadWorker(mock, "all-failed");
    const response = await dispatchAndWait(mock, {
      type: "aiDebate:start", mode: "fast", question: "所有裁判失敗",
      activeProviders: ["chatgpt", "gemini"], summaryStrategy: "allAnonymous",
    }, "所有裁判故障暫停");
    assert.equal(response.state.status, "waiting_for_user");
    assert.equal(response.state.phase, "waiting_for_user");
    assert.equal(response.state.busy, false);
    assert.equal(response.state.repairPause.target, "summary");
    assert.equal(response.state.summary, "");
    assert.equal(response.state.errors.filter((error) => error.phase === "summary").length, 2);
    assert.deepEqual(Object.keys(response.state.summaries).sort(), ["chatgpt", "gemini"]);
  });
});

test("fast submit failure automatically continues queued providers after repair", async () => {
  await quickly(async () => {
    const mock = createChromeMock({ failSubmit: [{ provider: "gemini", phase: "first-round" }] });
    await loadWorker(mock, "pause-first-round-submit");
    const start = await dispatchAndWait(mock, {
      type: "aiDebate:start", mode: "fast", question: "首輪送出失敗後續跑",
      activeProviders: ["chatgpt", "gemini", "grok"], debateRounds: 1, skipSummary: true,
    }, "首輪送出失敗暫停");
    assert.equal(start.ok, true, start.error);
    assert.equal(start.state.status, "waiting_for_user");
    assert.equal(start.state.repairPause.target, "answer");
    assert.equal(start.state.transcript.answers.chatgpt.startsWith("chatgpt:first-round:"), true);
    assert.match(start.state.transcript.answers.gemini, /^\[錯誤：/);
    assert.deepEqual(start.state.repairPause.remainingJobs.map(({ provider, phase }) => [provider, phase]), [["grok", "first-round"]]);

    const submissions = (provider, phase) => mock.sent.filter((message) =>
      message.type === "aiDebate:submitPrompt" && message.provider === provider && message.phase === phase);
    assert.equal(submissions("chatgpt", "first-round").length, 1);
    assert.equal(submissions("gemini", "first-round").length, 1);
    assert.equal(submissions("grok", "first-round").length, 0);
    assert.equal(mock.sent.filter((message) => message.type === "aiDebate:readSubmittedResponse" && message.phase === "first-round").length, 1);

    const repair = await mock.dispatch({
      type: "aiDebate:repairReply", provider: "gemini", phase: "first-round",
      content: "Gemini 人工補回的答案", expectedContent: start.state.transcript.answers.gemini,
      sessionId: start.state.transcript.sessionId,
      originalQuestion: start.state.transcript.originalQuestion,
    });
    assert.equal(repair.ok, true, repair.error);
    assert.equal(repair.state.busy, true);

    const finished = await waitForState(mock, (state) => state.status === "done", "首輪佇列自動續跑");
    assert.equal(finished.transcript.answers.grok.startsWith("grok:first-round:"), true);
    assert.equal(submissions("chatgpt", "first-round").length, 1);
    assert.equal(submissions("gemini", "first-round").length, 1, "automatic continuation must not resend the repaired provider");
    assert.equal(submissions("grok", "first-round").length, 1);
  });
});

test("critique read failure automatically resumes the original plan after repair", async () => {
  await quickly(async () => {
    const mock = createChromeMock({ serverOverload: [{ provider: "gemini", phase: "critique" }] });
    await loadWorker(mock, "pause-critique-read");
    const start = await dispatchAndWait(mock, {
      type: "aiDebate:start", mode: "fast", question: "互評讀取失敗後續跑",
      activeProviders: ["chatgpt", "gemini", "grok"], debateRounds: 2, skipSummary: true,
    }, "互評讀取失敗暫停");
    assert.equal(start.ok, true, start.error);
    assert.equal(start.state.phase, "waiting_for_user");
    assert.equal(start.state.repairPause.target, "critique");
    assert.match(start.state.transcript.critiqueRounds[0].gemini, /The servers are overloaded/);
    assert.equal(start.state.errors.some((error) => error.code === "PROVIDER_OVERLOADED"), true);
    const submissions = () => mock.sent.filter((message) => message.type === "aiDebate:submitPrompt");
    const beforeRejectedActions = submissions().length;
    assert.deepEqual(submissions().filter((message) => message.phase === "critique-2"), []);
    assert.deepEqual(submissions().filter((message) => message.phase === "summary"), []);

    for (const action of ["resume", "critique", "user_message", "summarize"]) {
      const response = await mock.dispatch({ type: "aiDebate:nextRound", action, text: "不應送出的插話" });
      assert.equal(response.ok, false, `${action} should be blocked while repairs are pending`);
      assert.equal(response.state.status, "waiting_for_user");
      assert.ok(response.state.repairPause);
    }
    const rejectedStart = await mock.dispatch({
      type: "aiDebate:start", mode: "fast", question: "不應覆蓋暫停會議",
      activeProviders: ["chatgpt", "gemini"],
    });
    assert.equal(rejectedStart.ok, false);
    assert.equal(rejectedStart.state.status, "waiting_for_user");
    assert.ok(rejectedStart.state.repairPause);
    assert.equal(submissions().length, beforeRejectedActions);

    const failedReply = start.state.transcript.critiqueRounds[0].gemini;
    const repair = await mock.dispatch({
      type: "aiDebate:repairReply", provider: "gemini", phase: "critique",
      content: "Gemini 人工補回互評", expectedContent: failedReply,
      sessionId: start.state.transcript.sessionId,
      originalQuestion: start.state.transcript.originalQuestion,
    });
    assert.equal(repair.ok, true, repair.error);
    assert.equal(repair.state.busy, true);

    const finished = await waitForState(mock, (state) => state.status === "done", "互評後續回合自動完成");
    assert.equal(finished.status, "done");
    assert.equal(submissions().filter((message) => message.phase === "critique-2").length, 3);
    assert.equal(submissions().filter((message) => message.phase === "summary").length, 0);
    assert.equal(submissions().filter((message) => message.provider === "gemini" && message.phase === "critique").length, 1);
  });
});

test("reset clears a paused workflow and stop can cancel it", async () => {
  await quickly(async () => {
    const resetMock = createChromeMock({ failSubmit: [{ provider: "gemini", phase: "first-round" }] });
    await loadWorker(resetMock, "reset-paused-workflow");
    const paused = await dispatchAndWait(resetMock, {
      type: "aiDebate:start", mode: "fast", question: "重置暫停流程",
      activeProviders: ["chatgpt", "gemini"], skipSummary: true,
    }, "重置測試首輪暫停");
    assert.ok(paused.state.repairPause);
    const reset = await resetMock.dispatch({ type: "aiDebate:reset" });
    assert.equal(reset.ok, true, reset.error);
    assert.equal(reset.state.repairPause, null);
    assert.equal(reset.state.phase, "idle");

    const stopMock = createChromeMock({ failSubmit: [{ provider: "gemini", phase: "first-round" }] });
    await loadWorker(stopMock, "stop-paused-workflow");
    const stopPaused = await dispatchAndWait(stopMock, {
      type: "aiDebate:start", mode: "fast", question: "停止暫停流程",
      activeProviders: ["chatgpt", "gemini"], skipSummary: true,
    }, "停止測試首輪暫停");
    assert.ok(stopPaused.state.repairPause);
    const stopped = await stopMock.dispatch({ type: "aiDebate:stop" });
    assert.equal(stopped.ok, true, stopped.error);
    assert.equal(stopped.state.repairPause, null);
    assert.equal(stopped.state.phase, "idle");
  });
});

test("getState automatically resumes a repaired pause restored from storage", async () => {
  await quickly(async () => {
    const engine = new DebateEngine(["chatgpt", "gemini"], "chatgpt", 1);
    engine.start("恢復舊版已補齊會議");
    engine.recordAnswer("chatgpt", "ChatGPT 有效答案");
    engine.recordAnswer("gemini", "Gemini 有效答案");
    const transcript = engine.snapshot();
    const mock = createChromeMock({
      initialCurrentState: {
        busy: false,
        status: "waiting_for_user",
        phase: "waiting_for_user",
        mode: "fast",
        message: "舊版已補齊但尚未接續",
        activeProviders: ["chatgpt", "gemini"],
        transcript,
        question: transcript.originalQuestion,
        summary: "",
        summaries: {},
        sourceProvider: "",
        sourceSummary: "",
        summaryProvider: "chatgpt",
        summaryStrategy: "standard",
        debateRounds: 1,
        currentCritiqueRound: 0,
        skipSummary: true,
        errors: [],
        savedAt: Date.now(),
        repairPause: {
          target: "answer",
          remainingJobs: [],
          resumePlan: { type: "planned", nextRound: 2, scheduler: "fast", interactiveMode: false },
          pausedPhase: "first-round",
        },
      },
    });
    await loadWorker(mock, "restore-completed-pause");

    const initial = await mock.dispatch({ type: "aiDebate:getState" });
    assert.equal(initial.ok, true, initial.error);
    const finished = await waitForState(mock, (state) => state.status === "done", "復原已補齊會議");
    assert.equal(finished.phase, "done");
    assert.equal(finished.transcript.answers.chatgpt, "ChatGPT 有效答案");
    assert.equal(finished.transcript.answers.gemini, "Gemini 有效答案");
    assert.deepEqual(mock.sent.filter((message) => message.type === "aiDebate:submitPrompt"), []);
  });
});

test("summary mode also sends an anonymous final prompt to its separate source provider", async () => {
  await quickly(async () => {
    const mock = createChromeMock({ initialUrl: "https://chatgpt.com/" });
    await loadWorker(mock, "source-provider");

    const response = await dispatchAndWait(mock, {
      type: "aiDebate:start",
      mode: "summary",
      question: "請整理目前對話",
      activeProviders: ["gemini", "grok"],
      summaryStrategy: "allAnonymous",
    }, "來源摘要流程完成");

    assert.equal(response.ok, true);
    assert.equal(response.state.status, "done");
    assert.equal(response.state.summaryProvider, "chatgpt");
    assert.deepEqual(response.state.activeProviders, ["gemini", "grok"]);
    const summaryJobs = mock.sent.filter((message) => message.type === "aiDebate:submitPrompt" && message.phase === "summary");
    assert.deepEqual(summaryJobs.map(({ provider }) => provider), ["gemini", "grok", "chatgpt"]);
    assert.equal(new Set(summaryJobs.map(({ tabId }) => tabId)).size, 3);
    assert.ok(summaryJobs.every(({ prompt }) => /舞會暱稱規則/.test(prompt)));
    assert.ok(summaryJobs.every(({ prompt }) => !/ChatGPT|Gemini|Grok/.test(prompt)));
    const sourceSummary = mock.sent.find((message) => message.type === "aiDebate:submitPrompt" && message.phase === "source-summary");
    assert.ok(sourceSummary);
    assert.ok(summaryJobs.every(({ tabId }) => tabId !== sourceSummary.tabId));
  });
});

test("pending source-summary reads poll one submitted run until completion", async () => {
  await quickly(async () => {
    const mock = createChromeMock({
      initialUrl: "https://chatgpt.com/",
      pendingReads: [{ provider: "chatgpt", phase: "source-summary", count: 3 }],
    });
    await loadWorker(mock, "source-summary-pending-polls");

    const response = await dispatchAndWait(mock, {
      type: "aiDebate:start", mode: "summary", question: "來源摘要延遲完成",
      activeProviders: ["chatgpt", "gemini", "grok"], debateRounds: 1, skipSummary: true,
    }, "來源摘要等待後完成");
    assert.equal(response.state.status, "done");

    const submits = mock.sent.filter((message) =>
      message.type === "aiDebate:submitPrompt" && message.phase === "source-summary");
    const reads = mock.sent.filter((message) =>
      message.type === "aiDebate:readSubmittedResponse" && message.phase === "source-summary");
    assert.equal(submits.length, 1, "pending polls must not submit the source-summary prompt again");
    assert.equal(reads.length, 4, "the same submitted run should be polled until the fourth read completes");
    assert.ok(reads.every((message) => message.runId === submits[0].runId));
    assert.equal(response.state.sourceSummary.startsWith("chatgpt:source-summary:"), true);
  });
});

test("source summary failure automatically continues without resending source context", async () => {
  await quickly(async () => {
    const mock = createChromeMock({
      initialUrl: "https://chatgpt.com/",
      failRead: [{ provider: "chatgpt", phase: "source-summary" }],
    });
    await loadWorker(mock, "source-summary-repair");

    const start = await dispatchAndWait(mock, {
      type: "aiDebate:start", mode: "summary", question: "請整理目前對話",
      activeProviders: ["chatgpt", "gemini", "grok"], debateRounds: 1,
      skipSummary: true,
    }, "來源摘要故障暫停");
    assert.equal(start.ok, true, start.error);
    assert.equal(start.state.status, "waiting_for_user");
    assert.equal(start.state.repairPause.target, "source-summary");
    assert.equal(start.state.repairPause.resumePlan.type, "source-summary");
    assert.match(start.state.sourceSummary, /^\[服務狀態：/);

    const sourceRequests = () => mock.sent.filter((message) =>
      message.type === "aiDebate:submitPrompt" && message.phase === "source-summary");
    const submissions = (phase) => mock.sent.filter((message) =>
      message.type === "aiDebate:submitPrompt" && message.phase === phase);
    assert.equal(sourceRequests().length, 1);
    assert.equal(submissions("first-round").length, 0, "no debate prompt should run before source repair");

    const repair = await mock.dispatch({
      type: "aiDebate:repairReply", provider: "chatgpt", phase: "source-summary",
      content: "ChatGPT 人工補回的來源摘要", expectedContent: start.state.sourceSummary,
      sessionId: start.state.transcript.sessionId,
      originalQuestion: start.state.transcript.originalQuestion,
    });
    assert.equal(repair.ok, true, repair.error);
    assert.equal(repair.state.busy, true);
    assert.equal(repair.state.sourceSummary, "ChatGPT 人工補回的來源摘要");
    assert.equal(sourceRequests().length, 1);

    const finished = await waitForState(mock, (state) => state.status === "done", "來源摘要修補後辯論完成");
    assert.equal(finished.sourceSummary, "ChatGPT 人工補回的來源摘要");
    assert.equal(sourceRequests().length, 1, "resume must not resend the successful or repaired source-summary job");
    assert.deepEqual(submissions("first-round").map(({ provider }) => provider), ["gemini", "grok"]);
    assert.deepEqual(submissions("summary"), []);
  });
});

test("departing a failed summary source safely closes without starting debate jobs", async () => {
  await quickly(async () => {
    const mock = createChromeMock({
      initialUrl: "https://chatgpt.com/",
      failRead: [{ provider: "chatgpt", phase: "source-summary" }],
    });
    await loadWorker(mock, "depart-source-summary");
    const start = await dispatchAndWait(mock, {
      type: "aiDebate:start", mode: "summary", question: "來源離席收尾",
      activeProviders: ["chatgpt", "gemini", "grok"], debateRounds: 1, skipSummary: true,
    }, "來源摘要故障暫停");
    const response = await mock.dispatch({
      type: "aiDebate:departProvider", provider: "chatgpt", phase: "source-summary",
      expectedContent: start.state.sourceSummary, sessionId: start.state.transcript.sessionId,
    });
    assert.equal(response.ok, true, response.error);
    assert.equal(response.state.status, "done");
    assert.deepEqual(response.state.departedProviders, ["chatgpt"]);
    assert.equal(response.state.repairPause, null);
    assert.equal(mock.sent.filter((message) => message.type === "aiDebate:submitPrompt" && message.phase === "first-round").length, 0);
  });
});

test("departing a failed observer-chair summary provider is allowed outside the debate roster", async () => {
  await quickly(async () => {
    const mock = createChromeMock({ failSummaryProvider: "chatgpt" });
    await loadWorker(mock, "depart-observer-chair-summary-provider");
    const start = await dispatchAndWait(mock, {
      type: "aiDebate:start", mode: "fast", question: "主席總結故障後離席",
      activeProviders: ["chatgpt", "gemini", "grok"], summaryProvider: "chatgpt",
      summaryStrategy: "observerChair",
    }, "圍觀主席總結故障暫停");
    assert.equal(start.state.status, "waiting_for_user");
    assert.equal(start.state.summaryProvider, "chatgpt");
    assert.equal(start.state.activeProviders.includes("chatgpt"), false);
    const response = await mock.dispatch({
      type: "aiDebate:departProvider", provider: "chatgpt", phase: "summary",
      expectedContent: start.state.summaries.chatgpt,
      sessionId: start.state.transcript.sessionId,
    });
    assert.equal(response.ok, true, response.error);
    assert.deepEqual(response.state.departedProviders, ["chatgpt"]);
  });
});

test("imposter reveal failure automatically continues remaining reveal jobs", async () => {
  await quickly(async () => {
    const mock = createChromeMock({ failSubmit: [{ provider: "gemini", phase: "reveal" }] });
    await loadWorker(mock, "reveal-repair");

    const start = await dispatchAndWait(mock, {
      type: "aiDebate:start", mode: "chat", question: "揭曉回合補修測試",
      activeProviders: ["chatgpt", "gemini", "grok"], interactionStyle: "imposter",
    }, "內鬼對話等待下一步");
    assert.equal(start.ok, true, start.error);
    assert.equal(start.state.phase, "waiting_for_user");

    const revealed = await dispatchAndWait(mock, { type: "aiDebate:nextRound", action: "summarize" }, "揭曉送出故障暫停");
    assert.equal(revealed.ok, true, revealed.error);
    assert.equal(revealed.state.status, "waiting_for_user");
    assert.equal(revealed.state.repairPause.target, "reveal");
    assert.ok(revealed.state.transcript.reveal.reactions.chatgpt);
    assert.match(revealed.state.transcript.reveal.reactions.gemini, /^\[服務狀態：/);
    assert.deepEqual(revealed.state.repairPause.remainingJobs.map(({ provider, phase }) => [provider, phase]), [["grok", "reveal"]]);

    const revealSubmissions = (provider) => mock.sent.filter((message) =>
      message.type === "aiDebate:submitPrompt" && message.provider === provider && message.phase === "reveal");
    assert.equal(revealSubmissions("chatgpt").length, 1);
    assert.equal(revealSubmissions("gemini").length, 1);
    assert.equal(revealSubmissions("grok").length, 0);

    const repair = await mock.dispatch({
      type: "aiDebate:repairReply", provider: "gemini", phase: "reveal",
      content: "Gemini 人工補回揭曉反應", expectedContent: revealed.state.transcript.reveal.reactions.gemini,
      sessionId: revealed.state.transcript.sessionId,
      originalQuestion: revealed.state.transcript.originalQuestion,
    });
    assert.equal(repair.ok, true, repair.error);
    assert.equal(repair.state.busy, true);

    const finished = await waitForState(mock, (state) => state.status === "done", "揭曉修補後自動完成");
    assert.equal(finished.transcript.reveal.reactions.gemini, "Gemini 人工補回揭曉反應");
    assert.equal(revealSubmissions("chatgpt").length, 1, "automatic continuation must not resend a completed reveal response");
    assert.equal(revealSubmissions("gemini").length, 1, "automatic continuation must not resend the manually repaired response");
    assert.equal(revealSubmissions("grok").length, 1);
  });
});

test("start acknowledges once before provider reads finish", async () => {
  await quickly(async () => {
    const mock = createChromeMock({ pauseFirstRead: true });
    await loadWorker(mock, "early-start-ack");
    const startPromise = mock.dispatch({
      type: "aiDebate:start",
      mode: "fast",
      question: "先確認啟動再等待讀取",
      activeProviders: ["chatgpt", "gemini"],
      summaryStrategy: "allAnonymous", skipSummary: true,
    });

    const ack = await startPromise;
    assert.equal(ack.ok, true, ack.error);
    assert.equal(ack.accepted, true);
    assert.equal(ack.state.busy, true);
    await mock.firstReadStarted;
    const startCall = mock.dispatches.find((call) => call.message.type === "aiDebate:start");
    assert.equal(startCall.responses.length, 1);

    mock.releaseRead();
    const finished = await waitForState(mock, (state) => state.status === "done", "首輪背景流程完成");
    assert.equal(finished.transcript.answers.chatgpt.startsWith("chatgpt:first-round:"), true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(startCall.responses.length, 1, "start must not answer again when background work finishes");
  });
});

test("losing the start caller does not interrupt accepted background work", async () => {
  await quickly(async () => {
    const mock = createChromeMock();
    await loadWorker(mock, "lost-start-caller");
    const startCall = mock.dispatchWithoutWaiting({
      type: "aiDebate:start", mode: "fast", question: "呼叫端中斷後仍完成",
      activeProviders: ["chatgpt", "gemini"], skipSummary: true,
    });

    const finished = await waitForState(mock, (state) => state.status === "done", "呼叫端離開後流程完成");
    assert.equal(finished.transcript.answers.chatgpt.startsWith("chatgpt:first-round:"), true);
    assert.equal(finished.transcript.answers.gemini.startsWith("gemini:first-round:"), true);
    assert.equal(startCall.responses.length, 1, "background completion must not send a second response");
    assert.equal(startCall.responses[0].accepted, true);
  });
});

test("stop cancels an acknowledged start without reviving its busy state", async () => {
  await quickly(async () => {
    const mock = createChromeMock({ pauseFirstRead: true });
    await loadWorker(mock, "stop-after-start-ack");
    const ack = await mock.dispatch({
      type: "aiDebate:start", mode: "fast", question: "啟動後停止流程",
      activeProviders: ["chatgpt", "gemini"], skipSummary: true,
    });
    assert.equal(ack.ok, true, ack.error);
    assert.equal(ack.accepted, true);
    await mock.firstReadStarted;

    const stopped = await mock.dispatch({ type: "aiDebate:stop" });
    assert.equal(stopped.ok, true, stopped.error);
    assert.equal(stopped.state.busy, false);
    mock.releaseRead();
    const finalState = await waitForState(mock, (state) => state.status === "idle", "停止後保持待命");
    assert.equal(finalState.busy, false);
    assert.equal(finalState.phase, "idle");
    const startCall = mock.dispatches.find((call) => call.message.type === "aiDebate:start");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(startCall.responses.length, 1, "stop must not trigger a late second start response");
  });
});
