import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

function extractFunction(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `找不到 ${name}`);
  const closeParameters = source.indexOf(')', start);
  const open = source.indexOf('{', closeParameters);
  let depth = 0;
  let quote = '';
  let lineComment = false;
  let blockComment = false;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; i += 1; } continue; }
    if (quote) {
      if (char === '\\') { i += 1; continue; }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; i += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`無法解析 ${name} 的函式結尾`);
}

export async function prepareProviderProbe(root, harness) {
  const source = await fs.readFile(path.join(root, 'src/background/service-worker.js'), 'utf8');
  const getOrCreate = extractFunction(source, 'getOrCreateProviderTab');
  const waitForTab = extractFunction(source, 'waitForProviderTab');
  const generated = `// Generated for the isolated browser acceptance harness; never part of the extension manifest.
import { PROVIDERS as productionProviders } from '../src/shared/providers.js';
import { isProviderTabReady } from '../src/background/chromeCompat.js';
import { hookTabTitle } from '../src/sidepanel/tabTitles.js';

const runtimeState = { providerTabs: {} };
// Initial extension-created navigation can precede Playwright interception.
// Keep creation entirely local; only an attached Playwright page navigates to
// the intercepted synthetic Meta document below.
const PROVIDERS = productionProviders.map(provider => ({ ...provider,
  startUrl: chrome.runtime.getURL('test-harness/provider-' + provider.id + '.html'),
  matchPatterns: [chrome.runtime.getURL('test-harness/provider-' + provider.id + '.html')],
}));
const created = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
${waitForTab}
${getOrCreate}

export async function runProviderTabsProbe() {
  const order = ['meta', 'grok', 'chatgpt', 'claude', 'gemini'];
  try {
    const opened = [];
    for (const providerId of order) {
      const tab = await getOrCreateProviderTab(providerId, { forceNewTab: true });
      created.push(tab.id);
      opened.push({ provider: providerId, id: tab.id });
    }
    // Exercise the production query-based reuse branch against the created Meta tab.
    const meta = opened[0];
    const reused = await getOrCreateProviderTab('meta');
    if (reused.id !== meta.id) throw new Error('Meta provider query did not reuse its existing tab');

    const allTabs = await chrome.tabs.query({});
    const createdOrder = allTabs.filter(tab => created.includes(tab.id)).sort((a, b) => a.index - b.index).map(tab => tab.id);
    if (JSON.stringify(createdOrder) !== JSON.stringify(opened.map(tab => tab.id))) {
      throw new Error('Chrome tab order differs from the requested provider order');
    }
    return { order: opened.map(tab => tab.provider), chromeTabOrder: createdOrder, reusedExisting: true,
      createdTabIds: [...created], metaTabId: meta.id };
  } catch (error) {
    await closeProviderTabsProbe();
    throw error;
  }
}
export async function readProviderMetaProbe(tabId) {
  if (!created.includes(tabId)) throw new Error('Not a probe-owned tab');
  return hookTabTitle(await chrome.tabs.get(tabId), 'meta', chrome.scripting);
}
export async function closeProviderTabsProbe() {
  if (created.length) await chrome.tabs.remove(created.splice(0)).catch(() => {});
}
`;
  await fs.writeFile(path.join(harness, 'provider-probe.mjs'), generated, 'utf8');
  for (const id of ['meta','grok','chatgpt','claude','gemini']) {
    await fs.writeFile(path.join(harness, `provider-${id}.html`), '<!doctype html><html><head><title>Local provider fixture</title></head><body>Isolated local test fixture</body></html>', 'utf8');
  }
}

export async function verifyProviderTabs({ context, opener, base }) {
  assert.ok(opener.url().startsWith(base), 'provider probe opener is outside the isolated extension');
  const metaUrl = 'https://www.meta.ai/prompt/isolated-current';
  const routePattern = metaUrl;
  const fulfillSynthetic = async route => {
    const url = new URL(route.request().url());
    const meta = url.hostname === 'www.meta.ai' || url.hostname === 'meta.ai';
    const html = meta
      ? '<!doctype html><html><head><title>Meta AI - Your AI Assistant</title></head><body><nav><a data-sidebar="menu-button" data-active="true" href="/prompt/isolated-current">Synthetic current conversation</a><a data-sidebar="menu-button" data-active="true" href="/prompt/another-chat">Synthetic other conversation</a><a data-sidebar="menu-button" data-active="false" href="/prompt/isolated-current">Inactive duplicate</a></nav></body></html>'
      : '<!doctype html><html><head><title>Isolated synthetic provider</title></head><body>Local acceptance fixture</body></html>';
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  };
  await context.route(routePattern, fulfillSynthetic);
  try {
    const result = await opener.evaluate(async () => chrome.runtime.sendMessage({ type: 'test:providerTabs' }));
    assert.equal(result?.ok, true, result?.error || 'fixture provider probe failed');
    assert.deepEqual(result.evidence.order, ['meta', 'grok', 'chatgpt', 'claude', 'gemini']);
    assert.equal(result.evidence.chromeTabOrder.length, result.evidence.order.length);
    assert.equal(result.evidence.reusedExisting, true);
    let metaPage;
    const deadline = Date.now() + 8000;
    while (!metaPage && Date.now() < deadline) {
      metaPage = context.pages().find(page => page.url() === `${base}/test-harness/provider-meta.html`);
      if (!metaPage) await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(metaPage, 'local Meta fixture was not attached');
    await metaPage.goto(metaUrl);
    // The probe reads innerText. Make this isolated fixture visibly laid out
    // before measuring the normal bounded metadata lookup on cold Chromium.
    await metaPage.bringToFront();
    await metaPage.locator('a[data-sidebar="menu-button"][data-active="true"][href="/prompt/isolated-current"]').waitFor({state:'visible'});
    const metadata = await opener.evaluate(tabId => chrome.runtime.sendMessage({type:'test:providerMetaTitle',tabId}), result.evidence.metaTabId);
    assert.equal(metadata?.ok, true, metadata?.error);
    assert.equal(metadata.title, 'Synthetic current conversation');
    return { order: result.evidence.order, chromeTabOrder: result.evidence.chromeTabOrder,
      reusedExisting: result.evidence.reusedExisting, metaTitle: metadata.title,
      excludedOtherTitle: 'Synthetic other conversation', initialNavigation:'local extension fixtures', metaNavigation:'attached Playwright page with route.fulfill' };
  } finally {
    await opener.evaluate(() => chrome.runtime.sendMessage({type:'test:closeProviderTabs'})).catch(() => {});
    await context.unroute(routePattern, fulfillSynthetic);
  }
}
