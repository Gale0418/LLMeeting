import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const serviceWorkerPath = new URL("../src/background/service-worker.js", import.meta.url);
const serviceWorkerSource = await readFile(serviceWorkerPath, "utf8");
const sectionStart = serviceWorkerSource.indexOf("const PROVIDER_CONTENT_SCRIPT_VERSION");
const sectionEnd = serviceWorkerSource.indexOf("function getProviderTimeoutMs", sectionStart);
assert.notEqual(sectionStart, -1, "provider messaging section exists");
assert.notEqual(sectionEnd, -1, "provider timeout helper follows messaging section");
const providerMessagingSource = serviceWorkerSource.slice(sectionStart, sectionEnd);
const providerContentScriptVersion = serviceWorkerSource.match(/const PROVIDER_CONTENT_SCRIPT_VERSION = "([^"]+)";/)?.[1];

function createProviderMessagingHarness({ sendMessage, getTab, executeScript, timeoutScale = 1 } = {}) {
  const calls = { messages: [], injections: [], delays: [], readinessTimeouts: [] };
  const context = {
    PROVIDER_CONTROL_TIMEOUT_MS: 3000,
    READINESS_TIMEOUT_MS: 15000,
    PROVIDERS: [{ id: "chatgpt", matchPatterns: ["https://chatgpt.com/*"] }],
    URL,
    chrome: {
      tabs: {
        get: async (tabId) => getTab ? getTab(tabId) : ({ id: tabId, status: "complete", url: "https://chatgpt.com/" }),
        sendMessage: async (tabId, payload) => {
          calls.messages.push({ tabId, payload });
          if (sendMessage) return sendMessage(tabId, payload, calls);
          return { contentScriptVersion: providerContentScriptVersion, driverContractVersion: 1 };
        },
      },
      scripting: {
        executeScript: async (details) => {
          calls.injections.push(details);
          return executeScript ? executeScript(details, calls) : [];
        },
      },
    },
    delay: async (ms) => { calls.delays.push(ms); },
    urlMatchesPatternForReadiness: (url, pattern) => {
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      return new RegExp(`^${escaped}$`).test(url);
    },
    isProviderTabReady: (tab, provider) => Boolean(provider) && provider.matchPatterns.some((pattern) =>
      context.urlMatchesPatternForReadiness(tab.url || tab.pendingUrl || "", pattern),
    ),
    getProviderTimeoutMs: (phase) => phase === "summary" ? 9000 : 5000,
    withReadinessTimeout: async (promise, timeoutMs) => {
      calls.readinessTimeouts.push(timeoutMs);
      let timer;
      try {
        return await Promise.race([
          promise,
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              const error = new Error(`timed out after ${timeoutMs}ms`);
              error.code = "READINESS_TIMEOUT";
              reject(error);
            }, Math.max(1, timeoutMs * timeoutScale));
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
  vm.createContext(context);
  vm.runInContext(`${providerMessagingSource}\nglobalThis.api = { providerRpc, isTransientProviderChannelError, isProviderLoginTab, sendProviderReadinessMessage, ensureProviderContentScript, sendProviderMessage };`, context);
  return { api: context.api, calls };
}

const job = { provider: "chatgpt", phase: "round", round: 1, prompt: "hello" };

test("sendProviderMessage succeeds when the current content script is ready", async () => {
  const { api, calls } = createProviderMessagingHarness({
    sendMessage: async (_tabId, payload) => payload.type === "aiDebate:getCapabilities"
      ? { contentScriptVersion: providerContentScriptVersion, driverContractVersion: 1 }
      : { ok: true },
  });

  assert.deepEqual(await api.sendProviderMessage(7, job), { ok: true });
  assert.equal(calls.injections.length, 0);
  assert.deepEqual(calls.messages.map(({ payload }) => payload.type), ["aiDebate:getCapabilities", "aiDebate:sendAndRead"]);
});

test("capabilities with no receiver trigger exactly one content script injection", async () => {
  let attempts = 0;
  const { api, calls } = createProviderMessagingHarness({
    sendMessage: async (_tabId, payload) => {
      if (payload.type !== "aiDebate:getCapabilities") return { ok: true };
      attempts += 1;
      if (attempts === 1) throw new Error("Could not establish connection. Receiving end does not exist.");
      return { contentScriptVersion: providerContentScriptVersion, driverContractVersion: 1 };
    },
  });

  assert.deepEqual(await api.sendProviderMessage(8, job), { ok: true });
  assert.equal(calls.injections.length, 1);
  assert.equal(attempts, 2);
});

test("read-only readiness retries one transient channel interruption", async () => {
  let attempts = 0;
  const { api, calls } = createProviderMessagingHarness({
    sendMessage: async (_tabId, payload) => {
      if (payload.type === "aiDebate:getCapabilities") {
        return { contentScriptVersion: providerContentScriptVersion, driverContractVersion: 1 };
      }
      attempts += 1;
      if (attempts === 1) throw new Error("The message port closed before a response was received.");
      return { ready: true };
    },
  });

  assert.deepEqual(await api.sendProviderReadinessMessage(9, job), { ready: true });
  assert.equal(attempts, 2);
  assert.deepEqual(calls.delays, [200]);
});

test("mutating provider send is not retried after a channel interruption", async () => {
  let submitted = 0;
  const { api, calls } = createProviderMessagingHarness({
    sendMessage: async (_tabId, payload) => {
      if (payload.type === "aiDebate:getCapabilities") {
        return { contentScriptVersion: providerContentScriptVersion, driverContractVersion: 1 };
      }
      submitted += 1;
      throw new Error("The message channel closed before a response was received.");
    },
  });

  await assert.rejects(api.sendProviderMessage(10, job), /channel closed/i);
  assert.equal(submitted, 1);
  assert.equal(calls.messages.filter(({ payload }) => payload.type === "aiDebate:sendAndRead").length, 1);
});

test("wrong provider URL prevents readiness messaging", async () => {
  const { api, calls } = createProviderMessagingHarness({
    getTab: async (tabId) => ({ id: tabId, status: "complete", url: "https://example.com/" }),
  });

  await assert.rejects(api.sendProviderReadinessMessage(11, job), (error) => error.code === "WRONG_URL");
  assert.equal(calls.messages.length, 0);
});

test("provider login pages are detected and never receive readiness messages", async () => {
  const loginTab = { id: 14, status: "complete", url: "https://chatgpt.com/auth/login?next=%2F" };
  const { api, calls } = createProviderMessagingHarness({ getTab: async () => loginTab });

  for (const path of ["/login", "/signin", "/sign-in", "/auth/login", "/u/0/signin"]) {
    assert.equal(api.isProviderLoginTab({ url: `https://chatgpt.com${path}` }, { matchPatterns: ["https://chatgpt.com/*"] }), true);
  }
  assert.equal(api.isProviderLoginTab({ url: "https://example.com/login" }, { matchPatterns: ["https://chatgpt.com/*"] }), false);
  await assert.rejects(api.sendProviderReadinessMessage(14, job), (error) => error.code === "LOGIN_REQUIRED");
  assert.equal(calls.messages.length, 0);
});

test("readiness recovery rejects a submitPrompt type before sending any message", async () => {
  const { api, calls } = createProviderMessagingHarness();

  await assert.rejects(api.sendProviderReadinessMessage(15, job, "aiDebate:submitPrompt"), /read-only checks/);
  assert.equal(calls.messages.length, 0);
  assert.equal(calls.injections.length, 0);
});

test("read-only retry repairs a hanging capabilities listener by reinjecting", async () => {
  let capabilityCalls = 0;
  const { api, calls } = createProviderMessagingHarness({
    timeoutScale: 0.001,
    sendMessage: async (_tabId, payload) => {
      if (payload.type === "aiDebate:getCapabilities") {
        capabilityCalls += 1;
        if (capabilityCalls === 1) return new Promise(() => {});
        return { contentScriptVersion: providerContentScriptVersion, driverContractVersion: 1 };
      }
      return { ready: true };
    },
  });

  assert.deepEqual(await api.sendProviderReadinessMessage(16, job), { ready: true });
  assert.equal(capabilityCalls, 2);
  assert.equal(calls.injections.length, 1);
  assert.deepEqual(calls.messages.map(({ payload }) => payload.type), [
    "aiDebate:getCapabilities",
    "aiDebate:getCapabilities",
    "aiDebate:checkReadiness",
  ]);
});

test("timed out executeScript that completes late is not retried and sends no readiness message", async () => {
  let injectionCompletedLate = false;
  const { api, calls } = createProviderMessagingHarness({
    timeoutScale: 0.001,
    sendMessage: async (_tabId, payload) => {
      if (payload.type === "aiDebate:getCapabilities") {
        throw new Error("Could not establish connection: receiving end does not exist");
      }
      return { ready: true };
    },
    executeScript: async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      injectionCompletedLate = true;
      return [];
    },
  });

  await assert.rejects(
    api.sendProviderReadinessMessage(18, job),
    (error) => error.rpcStage === "content injection" && /timed out/.test(error.message),
  );
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(injectionCompletedLate, true);
  assert.equal(calls.injections.length, 1);
  assert.equal(calls.messages.filter(({ payload }) => payload.type === "aiDebate:checkReadiness").length, 0);
});

test("readiness DOM timeout retries without reinjecting a healthy listener", async () => {
  let capabilitiesCalls = 0;
  let readinessCalls = 0;
  const { api, calls } = createProviderMessagingHarness({
    timeoutScale: 0.001,
    sendMessage: async (_tabId, payload) => {
      if (payload.type === "aiDebate:getCapabilities") {
        capabilitiesCalls += 1;
        return { contentScriptVersion: providerContentScriptVersion, driverContractVersion: 1 };
      }
      if (payload.type === "aiDebate:checkReadiness") {
        readinessCalls += 1;
        if (readinessCalls === 1) return new Promise(() => {});
        return { ready: true };
      }
      return { ok: true };
    },
  });

  assert.deepEqual(await api.sendProviderReadinessMessage(19, job), { ready: true });
  assert.equal(capabilitiesCalls, 2);
  assert.equal(readinessCalls, 2);
  assert.equal(calls.injections.length, 0);
});

test("expired provider deadline prevents content injection", async () => {
  const { api, calls } = createProviderMessagingHarness();

  await assert.rejects(
    api.ensureProviderContentScript(17, { deadline: Date.now() - 1, repair: true }),
    (error) => error.code === "PROVIDER_RPC_TIMEOUT",
  );
  assert.equal(calls.injections.length, 0);
  assert.equal(calls.messages.length, 0);
});

test("permanent readiness errors are not retried", async () => {
  let attempts = 0;
  const { api, calls } = createProviderMessagingHarness({
    sendMessage: async () => {
      attempts += 1;
      throw new Error("Provider rejected the command");
    },
  });

  await assert.rejects(api.sendProviderReadinessMessage(12, job), /Provider rejected/);
  assert.equal(attempts, 1);
  assert.deepEqual(calls.delays, []);
});

test("capabilities RPC is bounded by the 1500ms handshake timeout", async () => {
  const { api, calls } = createProviderMessagingHarness({
    sendMessage: async () => new Promise(() => {}),
    timeoutScale: 0.001,
  });

  await assert.rejects(api.ensureProviderContentScript(13), /capabilities: timed out/);
  assert.equal(calls.readinessTimeouts[0], 1500);
  assert.equal(calls.injections.length, 0);
});
