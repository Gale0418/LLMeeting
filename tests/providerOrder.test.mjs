import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { PROVIDER_IDS, DEFAULT_ACTIVE_PROVIDER_IDS, providersInOrder } from "../src/shared/providers.js";
import { DebateEngine } from "../src/background/debateEngine.js";
import { hookTabTitle } from "../src/sidepanel/tabTitles.js";

const source = await readFile("src/sidepanel/app.js", "utf8");
test("default is alphabetical while selected IDs keep activation order and re-enable appends", () => {
  assert.deepEqual(PROVIDER_IDS, ["chatgpt", "claude", "gemini", "grok", "meta"]);
  const selectedProviderSet = new Set(["meta", "claude", "grok"]);
  const context = vm.createContext({ selectedProviderSet, fallbackProviderIds: PROVIDER_IDS });
  vm.runInContext(source.match(/function selectedProviderIds\(\)[^]*?\n\}/)[0], context);
  selectedProviderSet.delete("claude"); selectedProviderSet.add("claude");
  assert.deepEqual(Array.from(context.selectedProviderIds()), ["meta", "grok", "claude"]);
  assert.deepEqual(providersInOrder(["meta", "bad", "grok", "meta"]).map(p => p.id), ["meta", "grok"]);
});

test("legacy selection migrates alphabetically, v2 saved custom order and empty selection survive reload", async () => {
  const load = source.slice(source.indexOf("async function loadProviderSelection()"), source.indexOf("async function persistProviderSelection()"));
  for (const [saved, expected] of [
    [{ "aiDebate.providerSelection.v1": ["meta", "grok", "chatgpt"] }, ["chatgpt", "grok", "meta"]],
    [{ prefs: ["meta", "chatgpt", "claude"] }, ["meta", "chatgpt", "claude"]],
    [{ prefs: [] }, []],
    [{ prefs: ["bogus"] }, DEFAULT_ACTIVE_PROVIDER_IDS],
  ]) {
    const context = vm.createContext({ selectedProviderSet: new Set(DEFAULT_ACTIVE_PROVIDER_IDS), fallbackProviderIds: PROVIDER_IDS,
      DEFAULT_ACTIVE_PROVIDER_IDS, PROVIDER_SELECTION_STORAGE_KEY: "prefs", chrome: { storage: { local: { get: async () => saved } } } });
    vm.runInContext(load + source.match(/function selectedProviderIds\(\)[^]*?\n\}/)[0], context);
    await context.loadProviderSelection();
    assert.deepEqual(Array.from(context.selectedProviderIds()), expected);
  }
});

test("custom order reaches first round, masked peer prompts, restored rounds, final jobs and departure", () => {
  const order = ["meta", "grok", "chatgpt", "claude", "gemini"];
  const names = { meta: "棉花兔", grok: "星光貓", chatgpt: "珍奶龍", claude: "布丁羊", gemini: "薄荷熊" };
  const engine = new DebateEngine(order, "meta", 1, { summaryStrategy: "allAnonymous", openEnded: true });
  assert.deepEqual(engine.start("Synthetic question").map(j => j.provider), order);
  for (const id of order) engine.recordAnswer(id, `我的暱稱是：${names[id]}\nSynthetic answer`);
  const jobs = engine.buildCritiqueJobs(1);
  assert.deepEqual(jobs.map(j => j.provider), order);
  const prompt = jobs.find(j => j.provider === "gemini").prompt;
  assert.ok(prompt.indexOf(names.meta) >= 0);
  assert.ok(prompt.indexOf(names.meta) < prompt.indexOf(names.grok));
  assert.ok(prompt.indexOf(names.grok) < prompt.indexOf(names.chatgpt));
  for (const id of order) engine.recordCritique(id, `Review ${id}`, 1);
  const restored = DebateEngine.restore(engine.snapshot());
  const round = restored.addChatRound();
  assert.deepEqual(restored.buildUserMessageJobs("Continue", round).map(j => j.provider), order);
  assert.deepEqual(restored.buildFinalJobs().map(j => j.provider), order);
  restored.departProvider("grok");
  assert.deepEqual(restored.buildCritiqueJobs(round).map(j => j.provider), order.filter(id => id !== "grok"));
});

test("preflight opens or reuses tabs sequentially in the requested activation order", async () => {
  const worker = await readFile("src/background/service-worker.js", "utf8");
  const body = worker.slice(worker.indexOf("async function checkProviderTabsSequentially("), worker.indexOf("async function getCurrentActiveTab("));
  const calls = [];
  const order = ["meta", "claude", "grok", "chatgpt", "gemini"];
  const context = vm.createContext({ getCurrentActiveTab: async () => ({ id: 99 }),
    runController: { assertCurrent() {} },
    getOrCreateProviderTab: async (id, options) => { calls.push(id); return { id: options.preferredTabId || calls.length }; },
    activateProviderTabForReadiness: async () => {}, checkProviderTabReadiness: async (tabId, provider) => ({ provider, tabId, ready: true }),
    restoreActiveTab: async tab => { assert.equal(tab.id, 99); },
  });
  vm.runInContext(body, context);
  const results = await context.checkProviderTabsSequentially(order, { claude: 78 }, 1, { forceNewTabs: true });
  assert.deepEqual(calls, order);
  assert.deepEqual(Array.from(results, row => row.provider), order);
  assert.equal(results[1].tabId, 78);
});

const titleProbe = await readFile("src/content/conversation-title.js", "utf8");
const currentUrl = "https://www.meta.ai/prompt/current";
function probe(links, url = currentUrl) {
  const location = new URL(url);
  return vm.runInNewContext(titleProbe, { URL, location, document: { querySelectorAll: selector => {
    assert.equal(selector, 'a[data-sidebar="menu-button"][data-active="true"][href]');
    return links.map(([href, innerText]) => ({ getAttribute: () => href, innerText }));
  } } });
}
test("Meta title probe accepts only the exact current URL and rejects conflicting titles or foreign pages", () => {
  assert.equal(probe([["/prompt/other", "Other conversation"], ["/prompt/current", "Current title"]]).title, "Current title");
  assert.equal(probe([["https://evil.test/prompt/current", "Bad"]]), null);
  assert.equal(probe([["/prompt/current", "A"], ["/prompt/current", "B"]]), null);
  assert.equal(probe([["/prompt/current", "A\nB"]]), null);
  assert.equal(probe([], "https://www.meta.ai/"), null);
  assert.equal(probe([], "https://example.com/prompt/current"), null);
});

test("tab title enrichment targets only Meta generic titles, and navigation/error/timeout retain fallback", async () => {
  const tab = { id: 7, status: "complete", title: "Meta AI - Your AI Assistant", url: currentUrl };
  const calls = [];
  const scripting = { executeScript: async args => { calls.push(args); return [{ result: { title: "Current title", url: currentUrl } }]; } };
  assert.equal(await hookTabTitle(tab, "meta", scripting), "Current title");
  assert.equal(calls[0].target.tabId, 7);
  assert.deepEqual(calls[0].files, ["src/content/conversation-title.js"]);
  for (const [other, provider] of [[tab, "chatgpt"], [{ ...tab, title: "Custom title" }, "meta"], [{ ...tab, status: "loading" }, "meta"]]) {
    assert.equal(await hookTabTitle(other, provider, scripting), other.title);
  }
  assert.equal(calls.length, 1);
  for (const executeScript of [async () => [{ result: { title: "Wrong page", url: `${currentUrl}-other` } }],
    async () => { throw new Error("closed"); }, () => new Promise(() => {})]) {
    assert.equal(await hookTabTitle(tab, "meta", { executeScript }, 5), tab.title);
  }
});
