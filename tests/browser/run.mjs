import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { meeting, rawReply, fault, originalPrompt } from './fixtures.mjs';
import { uiText } from '../../src/shared/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { values } = parseArgs({ options: {
  'playwright-module': { type: 'string' }, 'browser-cache': { type: 'string' },
  'skip-native': { type: 'boolean', default: false },
} });
// Must be set before importing/starting Playwright. This is experimental.
process.env.PW_CHROMIUM_ATTACH_TO_OTHER = '1';
if (values['browser-cache']) process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(values['browser-cache']);
const playwright = await import(values['playwright-module']
  ? pathToFileURL(path.resolve(values['playwright-module'])).href : 'playwright');
const { chromium } = playwright;
const out = path.join(root, 'output', 'browser-acceptance', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(out, { recursive: true });
const extension = path.join(out, 'extension');
await fs.mkdir(extension);
for (const name of ['src', 'assets', '_locales']) await fs.cp(path.join(root, name), path.join(extension, name), { recursive: true });
const harness = path.join(extension, 'test-harness');
await fs.mkdir(harness);
for (const name of ['fixtures.mjs', 'fixture-worker.mjs', 'opener.html', 'opener.mjs']) {
  await fs.copyFile(new URL(name, import.meta.url), path.join(harness, name));
}
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
manifest.name = 'LLMeeting — isolated UI acceptance';
manifest.background = { service_worker: 'test-harness/fixture-worker.mjs', type: 'module' };
await fs.writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest, null, 2));
const report = {
  startedAt: new Date().toISOString(), isolation: { profile: path.join(out, 'profile'),
    copiedFrom: ['manifest.json', 'src', 'assets', '_locales'], personalChromeAttached: false,
    backend: 'test-only MV3 service-worker fixture; production renderer and Chrome storage/events',
    realProvidersContacted: false },
  executable: chromium.executablePath(), standalone: { status: 'not-run' }, native: { status: 'not-run' },
  pageErrors: [], blockedNetwork: [],
};
let context;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check, label, timeout = 8000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { await check(); return; } catch (error) { last = error; }
    await sleep(80);
  }
  throw new Error(`${label}: ${last?.message || 'timed out'}`);
}
const lang = { en: 'en', ja: 'ja', zh_TW: 'zh-Hant-TW' };
async function switchLocale(settings, panel, locale) {
  await settings.selectOption('#languageSelect', locale);
  await panel.waitForFunction(expected => document.documentElement.lang === expected, lang[locale]);
}
async function inspectUi(panel, locale, scenario) {
  assert.equal(await panel.locator('.topbar').evaluate(el => el.classList.contains('is-fault-paused')), scenario === 'fault');
  const health = await panel.locator('#sessionHealth').innerText();
  assert.ok(health.includes(uiText('本場健康摘要', locale)));
  assert.ok(health.includes(uiText('已離席', locale)), 'departed provider remains visible');
  assert.ok(health.includes(uiText(scenario === 'fault' ? '已暫停，請先處理故障' : '討論進行中', locale)));
  const history = panel.locator('.health-history');
  if (!(await history.evaluate(el => el.open))) {
    await history.locator('summary').focus();
    await history.locator('summary').press('Enter');
  }
  assert.ok((await history.innerText()).includes(uiText('已手動補入', locale)));
  assert.ok((await history.innerText()).includes(uiText('已記錄故障', locale)));
  assert.ok((await history.innerText()).includes(uiText('已離席', locale)));
  if (locale === 'en') assert.doesNotMatch(await panel.locator('#sessionHealth').innerText(), /\p{Script=Han}/u);
  assert.equal(await panel.locator('.health-technical').getAttribute('open'), null);
  assert.ok(!(await history.innerText()).includes('Synthetic private raw fault'));
  assert.ok((await panel.locator('#diagnosticsOutput').textContent()).includes('Synthetic private raw fault'));
  assert.equal(await panel.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'page overflow');
  const result = await panel.evaluate(() => ({
    status: document.querySelector('#statusText').textContent,
    progress: document.querySelector('#progressContainer').getAttribute('aria-valuetext'),
    meta: [...document.querySelectorAll('.bubble-meta')].map(el => el.textContent),
    loading: [...document.querySelectorAll('.loading-dots')].map(el => el.textContent),
    notice: document.querySelector('#replyRecoveryNotice').textContent,
    transcript: document.querySelector('#chatTranscript').textContent,
  }));
  if (locale === 'en') {
    assert.doesNotMatch([result.status, result.progress, result.notice, ...result.meta, ...result.loading].join('\n'), /\p{Script=Han}/u);
    if (scenario === 'critique') {
      assert.ok(result.meta.some(text => text === 'ChatGPT is reviewing'));
      assert.ok(result.loading.some(text => text.startsWith('Writing peer reviews')));
    }
    if (scenario === 'fault') {
      const promptField = panel.locator('.original-prompt');
      assert.equal(await promptField.inputValue(), originalPrompt, 'raw original prompt changed with locale');
      const copyButton = panel.locator('[data-copy-prompt-provider="chatgpt"]');
      assert.equal(await copyButton.innerText(), uiText('複製原提示', locale));
      assert.ok(result.transcript.includes('Collecting AI Responses: provider readiness timeout'));
      assert.doesNotMatch(result.transcript, /這位裁判未能完成總結|收集 AI 回覆/);
    }
  } else if (locale === 'ja') {
    assert.doesNotMatch([...result.meta, ...result.loading, result.notice].join('\n'), /評析中|撰寫互評中|彙整精華中|總結未完成|流程已暫停/);
  }
  if (scenario !== 'first-round') assert.ok(result.transcript.includes(rawReply.split('\n')[0]), 'AI fixture text changed');
  return result;
}
async function exercise(panel, settings, control, label) {
  const checks = [];
  for (const scenario of ['first-round', 'critique', 'summary', 'fault']) {
    await control({ type: 'test:scenario', scenario });
    await panel.getByText(`[fixture:${scenario}] Public synthetic question`, { exact: true }).waitFor();
    for (const locale of ['zh_TW', 'en', 'ja', 'zh_TW', 'ja', 'en']) {
      await switchLocale(settings, panel, locale);
      await eventually(() => inspectUi(panel, locale, scenario), `${label}/${scenario}/${locale}`);
      checks.push({ scenario, locale, status: 'pass' });
      if (locale === 'en' && ['critique', 'fault'].includes(scenario)) {
        const focus = panel.locator(scenario === 'critique' ? '.bubble-group.assistant.loading' : '.bubble-group.summary').last();
        await focus.scrollIntoViewIfNeeded();
        await panel.screenshot({ path: path.join(out, `${label}-${scenario}-en.png`) });
      }
    }
  }
  const repair = panel.locator('[data-repair-provider="chatgpt"][data-repair-phase="summary"]');
  await panel.reload();
  await panel.getByText('[fixture:fault] Public synthetic question', {exact:true}).waitFor();
  await panel.locator('[data-copy-prompt-provider="chatgpt"]').click();
  await eventually(async () => {
    const text = await panel.locator('[data-copy-prompt-status]').innerText();
    assert.equal(text, uiText('原提示已複製','en'));
  }, 'copy original success');
  // Windows clipboard exposes CRLF; verify text without treating OS newline conversion as data loss.
  assert.equal((await panel.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g,'\n'), originalPrompt);
  await panel.evaluate(() => {
    window.savedClipboardWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = async () => { throw new Error('Synthetic clipboard denial'); };
  });
  await panel.locator('[data-copy-prompt-provider="chatgpt"]').click();
  await eventually(async () => assert.equal(await panel.locator('[data-copy-prompt-status]').innerText(), uiText('無法自動複製，請在下方選取原提示後手動複製。','en')), 'manual copy fallback');
  const promptText = panel.locator('.original-prompt');
  assert.equal(await promptText.inputValue(), originalPrompt);
  assert.deepEqual(await promptText.evaluate(el => [el.selectionStart, el.selectionEnd]), [0, originalPrompt.length]);
  for (const locale of ['ja','zh_TW','en']) {
    await switchLocale(settings,panel,locale);
    assert.equal(await promptText.inputValue(), originalPrompt);
    assert.equal(await panel.locator('.recovery-prompt details').evaluate(el => el.open), true);
  }
  await panel.evaluate(() => { navigator.clipboard.writeText = window.savedClipboardWrite; delete window.savedClipboardWrite; });
  checks.push({scenario:'original-prompt-copy-reload-fallback-locales',status:'pass'});
  await repair.click();
  const editor = panel.locator('#manualReplyEditor');
  const input = panel.locator('#manualReplyInput');
  await editor.waitFor({ state: 'visible' });
  await panel.locator('#saveManualReplyBtn').click();
  await eventually(async () => assert.match(await panel.locator('#manualReplyStatus').innerText(), /1.*12,000/), 'empty repair validation');
  const draft = 'Synthetic manual reply 保留草稿 <script>literal</script>';
  await input.fill(draft);
  for (const locale of ['ja', 'zh_TW', 'en']) {
    await switchLocale(settings, panel, locale);
    assert.equal(await input.inputValue(), draft);
    assert.equal(await editor.isVisible(), true);
    const title = await panel.locator('#manualReplyTarget').innerText();
    if (locale === 'en') assert.doesNotMatch(title, /總結|補回覆/);
    checks.push({ scenario: 'repair-draft-preservation', locale, status: 'pass' });
  }
  // Failure acknowledgement is synthetic. It must retain the user's draft.
  await control({ type: 'test:scenario', scenario: 'fault', rejectRepair: true });
  await panel.locator('#saveManualReplyBtn').click();
  await eventually(async () => assert.match(await panel.locator('#manualReplyStatus').innerText(), /kept|preserved|saved/i), 'repair failure acknowledgement');
  assert.equal(await input.inputValue(), draft);
  assert.equal(await editor.isVisible(), true);
  for (const locale of ['ja', 'zh_TW', 'en']) {
    await switchLocale(settings, panel, locale);
    const message = await panel.locator('#manualReplyStatus').innerText();
    assert.equal(message, `${uiText('補入失敗，貼上的內容已保留。', locale)} ${uiText('貼上的內容已保留。', locale)}`);
    if (locale === 'en') assert.doesNotMatch(message, /\p{Script=Han}/u);
    if (locale === 'ja') assert.doesNotMatch(message, /補入失敗|貼上的內容已保留/);
    assert.equal(await input.inputValue(), draft);
    checks.push({ scenario: 'repair-error-language-switch', locale, status: 'pass' });
  }
  await panel.locator('#cancelManualReplyBtn').click();
  await control({ type: 'test:scenario', scenario: 'fault' });
  await repair.click();
  await input.fill(draft);
  await panel.locator('#saveManualReplyBtn').click();
  await editor.waitFor({ state: 'hidden' });
  assert.equal(await panel.locator('.topbar').evaluate(el => el.classList.contains('is-fault-paused')), false);
  const disclosure = panel.locator('details.reply-recovery').filter({ hasText: fault });
  await disclosure.locator('summary').click();
  assert.ok((await disclosure.innerText()).includes(fault), 'original fault was translated/changed');
  assert.ok((await panel.locator('#chatTranscript').innerText()).includes(draft));
  const saved = await control({ type: 'test:inspect' });
  assert.equal(saved.state.summary, draft);
  checks.push({ scenario: 'repair-failure-success-and-original-disclosure', status: 'pass' });
  await disclosure.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: path.join(out, `${label}-repair-en.png`), fullPage: false });
  await panel.locator('#sessionHealth').scrollIntoViewIfNeeded();
  await panel.evaluate(() => window.scrollBy(0, -document.querySelector('header').getBoundingClientRect().height - 12));
  await panel.screenshot({ path: path.join(out, `${label}-health-en.png`) });
  return checks;
}
try {
  context = await chromium.launchPersistentContext(report.isolation.profile, {
    channel: 'chromium', headless: false, viewport: null,
    args: ['--window-size=1280,1000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  report.browserVersion = context.browser()?.version();
  await context.route(/^https?:\/\//, route => {
    report.blockedNetwork.push(new URL(route.request().url()).origin);
    return route.abort('blockedbyclient');
  });
  context.on('page', page => page.on('pageerror', error => report.pageErrors.push(error.message)));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  report.extensionId = id;
  const base = `chrome-extension://${id}`;
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const opener = await context.newPage();
  await opener.goto(`${base}/test-harness/opener.html`);
  const control = message => opener.evaluate(payload => chrome.runtime.sendMessage(payload), message);
  await control({ type: 'aiDebate:getState' });
  const settings = await context.newPage();
  await settings.goto(`${base}/src/options/index.html`);
  const page = await context.newPage();
  await page.goto(`${base}/src/sidepanel/index.html`);
  try {
    report.standalone = { status: 'running', kind: 'ordinary extension tab, not docked side panel', checks: [] };
    for (const width of [320, 480]) {
      await page.setViewportSize({ width, height: 900 });
      report.standalone.checks.push(...await exercise(page, settings, control, `standalone-${width}`));
    }
    report.standalone.status = 'pass';
  } catch (error) {
    report.standalone.status = 'fail'; report.standalone.error = error.stack;
    await page.screenshot({ path: path.join(out, 'standalone-failure.png') }).catch(() => {});
  }
  await page.close();
  if (!values['skip-native']) {
    report.native = { status: 'running', method: 'PW_CHROMIUM_ATTACH_TO_OTHER=1 + test-only user-gesture opener' };
    try {
      const windowSession = await context.newCDPSession(opener);
      const { windowId } = await windowSession.send('Browser.getWindowForTarget');
      await windowSession.send('Browser.setWindowBounds', { windowId, bounds: { width: 1280, height: 1000 } });
      await windowSession.detach();
      const attached = context.waitForEvent('page', { predicate: p => p.url().startsWith(`${base}/src/sidepanel/`), timeout: 12000 });
      // Mark rejection handled even if opening fails before the page appears.
      attached.catch(() => {});
      await opener.bringToFront();
      await opener.locator('#openPanel').click();
      await opener.locator('#result').filter({ hasText: 'ok' }).waitFor();
      const opened = JSON.parse(await opener.locator('#result').innerText());
      assert.equal(opened.ok, true, opened.error);
      const native = await attached;
      const nativeSession = await context.newCDPSession(native);
      await nativeSession.send('Emulation.clearDeviceMetricsOverride');
      const { targetInfo } = await nativeSession.send('Target.getTargetInfo');
      report.native.targetType = targetInfo.type;
      await nativeSession.detach();
      await native.waitForFunction(() => innerWidth >= 200 && innerHeight > 0, null, { timeout: 12000 });
      const tabs = await opener.evaluate(() => chrome.tabs.query({}));
      assert.equal(tabs.some(tab => tab.url === native.url()), false, 'side-panel URL appeared as an ordinary tab');
      report.native.ordinaryTab = false;
      report.native.viewport = await native.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      assert.ok(report.native.viewport.width >= 200 && report.native.viewport.width <= 600,
        'native viewport is not a realistic docked-panel width');
      report.native.checks = await exercise(native, settings, control, 'native');
      report.native.status = 'pass';
    } catch (error) { report.native.status = 'fail'; report.native.error = error.stack; }
  } else report.native = { status: 'skipped' };
} catch (error) {
  report.setupError = error.stack;
} finally {
  try { await context?.close(); }
  catch (error) { report.cleanupError = error.stack || String(error); }
  report.finishedAt = new Date().toISOString();
  report.status = !report.setupError && !report.cleanupError && report.standalone.status === 'pass'
    && ['pass', 'skipped'].includes(report.native.status) && report.pageErrors.length === 0 ? 'pass' : 'fail';
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output: out, standalone: report.standalone.status, native: report.native.status,
    setupError: report.setupError, cleanupError: report.cleanupError,
    standaloneError: report.standalone.error, nativeError: report.native.error }, null, 2));
}
if (report.status !== 'pass') process.exitCode = 1;
