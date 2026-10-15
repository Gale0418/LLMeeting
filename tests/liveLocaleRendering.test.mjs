import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { uiText, setLocale } from '../src/shared/i18n.js';
import { PROVIDERS } from '../src/shared/providers.js';
import { normalizeRoundNumber } from '../src/shared/text.js';
import { isCritiquePhase } from '../src/sidepanel/modeRules.js';
import { isRecoverableReply, pendingReplyRepairs } from '../src/shared/meetingRecovery.js';
const source = await readFile('src/sidepanel/app.js', 'utf8');
const fn = name => {
  const match = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, name);
  return match[0];
};
const ids = PROVIDERS.map(p => p.id);
const answer = '不要翻譯我的回答 <script>raw</script>';
function fixture(state) {
  const notice = { textContent: '', hidden: true };
  const target = { textContent: '' };
  const context = vm.createContext({
    uiText, PROVIDERS, normalizeRoundNumber, isCritiquePhase, isRecoverableReply,
    pendingReplyRepairs, fallbackProviderIds: ids, latestState: state,
    chatTranscript: { scrollTop: 137 }, statusText: { textContent: '' },
    manualReplyTarget: { provider: 'chatgpt', phase: 'first-round', sessionId: 'live' },
    manualReplyEditor: { hidden: false }, manualReplyInput: { value: '我的補回覆草稿' },
    manualReplyStatus: { textContent: '' }, saveManualReplyBtn: {}, recoveryActionPending: false,
    localeRenderPending: false, lastRenderedChatHtml: null,
    document: { querySelector: id => id === '#manualReplyTarget' ? target : id === '#replyRecoveryNotice' ? notice : null,
      addEventListener: (_type, callback) => { context.onLocale = callback; } },
    replaceChatTranscriptHTML(html) { context.html = html; context.chatTranscript.scrollTop = 0; },
    renderProviderStatuses(current) { context.providerStatus = uiText(current.busy ? '互評中' : '本場已離席'); },
    updateProgressBar(current) { context.progressStatus = uiText(current.message); },
    renderDiagnostics() {}, renderPlayIdeas() {}, starterQuestions: {render() {}},
    recommendation: {render() {}}, playScenes: {render() {}}
  });
  vm.runInContext(['renderChatBubbles', 'renderRoundZeroBubbles', 'replyRecoveryControls',
    'renderReplyRecoveryNotice', 'formatReplyContent', 'translateFaultStage', 'formatContent', 'escapeHTML',
    'providerLabel', 'meetingSpeakerLabel', 'safeProviderClass', 'critiqueRoundMaps',
    'manualReplyPhaseLabel', 'zhRoundLabel'].map(fn).join('\n'), context);
  vm.runInContext(source.slice(source.indexOf('document.addEventListener("llmeeting:locale-changed"'),
    source.indexOf('async function loadState()')), context);
  return { context, notice, target };
}
function state(overrides = {}) {
  return { busy: true, phase: 'critique', mode: 'debate', activeProviders: ids,
    summaryProvider: 'chatgpt', currentCritiqueRound: 1,
    message: 'Gemini：等待第 1/3 輪互評：評析其他 AI',
    transcript: { sessionId: 'live', originalQuestion: '我的原題',
      answers: Object.fromEntries(ids.map(id => [id, answer])), critiqueRounds: [{}] }, ...overrides };
}

test('live cards and faults follow repeated locale switches without editing meeting data or repair drafts', () => {
  const cases = [
    state(),
    state({ transcript: { ...state().transcript, critiqueRounds: [{ USER: '保留使用者插話' }] } }),
    state({ transcript: { ...state().transcript, critiqueRounds: [Object.fromEntries(ids.map(id => [id, answer]))] } }),
    state({ phase: 'first-round', transcript: { ...state().transcript, answers: {} } }),
    state({ phase: 'source-summary', sourceProvider: 'chatgpt', transcript: null }),
    state({ phase: 'summary' }),
    state({ phase: 'summary', summaryStrategy: 'allAnonymous' }),
    state({ phase: 'summary', busy: false, summaryStrategy: 'allAnonymous' }),
    state({ phase: 'summary', summaryStrategy: 'allAnonymous', summaries: { chatgpt: '[服務狀態：ERR] 這位裁判未能完成總結。' }, repairPause: {} }),
    state({ phase: 'waiting_for_user', busy: false, repairPause: {}, transcript: { ...state().transcript,
      critiqueRounds: [{ chatgpt: '[錯誤：原始故障]' }] } }),
  ];
  try {
    for (const current of cases) {
      const original = JSON.stringify(current);
      const { context, notice, target } = fixture(current);
      context.manualReplyTarget.sessionId = current.transcript?.sessionId;
      for (const locale of ['zh_TW', 'en', 'ja', 'zh_TW', 'ja', 'en']) {
        setLocale(locale);
        context.onLocale();
        const meta = [...context.html.matchAll(/class="bubble-meta">([^<]*)</g)].map(m => m[1]);
        const loading = [...context.html.matchAll(/class="loading-dots">([^<]*)</g)].map(m => m[1]);
        if (locale === 'en') {
          assert.doesNotMatch([...meta, ...loading].join('\n'), /\p{Script=Han}/u, current.phase);
          assert.doesNotMatch(target.textContent, /第一輪回答|手動補回覆/);
          assert.doesNotMatch(context.html, /彙整精華中|總結未完成|這位裁判未能完成總結/);
          assert.doesNotMatch(notice.textContent, /流程已暫停|待處理/);
        }
        if (locale === 'ja') assert.doesNotMatch([...meta, ...loading].join('\n'), /撰寫互評中|評析中|回應中|總結未完成/);
        assert.equal(context.statusText.textContent, uiText(current.message));
        assert.equal(context.progressStatus, uiText(current.message));
        assert.equal(context.chatTranscript.scrollTop, 137);
        assert.equal(context.manualReplyInput.value, '我的補回覆草稿');
        assert.equal(context.manualReplyEditor.hidden, false);
        assert.equal(context.localeRenderPending, false);
        assert.equal(JSON.stringify(current), original);
        if (current.phase === 'critique') assert.ok(context.html.includes('不要翻譯我的回答 &lt;script&gt;raw&lt;/script&gt;'));
      }
    }
  } finally { setLocale('en'); }
});

test('provider readiness failures, counts and accessible toggle labels follow every locale', () => {
  const makeElement = tag => ({ tag, textContent: '', children: [], append(...children) { this.children.push(...children); } });
  const attributes = new Map();
  const button = { dataset: { providerToggle: 'chatgpt' }, setAttribute: (key, value) => attributes.set(key, value),
    closest: () => ({ classList: { toggle() {} } }) };
  const recovery = { hidden: false, children: [], replaceChildren() { this.children = []; }, append(item) { this.children.push(item); } };
  const summary = { textContent: '' };
  const context = vm.createContext({ uiText, PROVIDERS, latestState: { busy: false }, latestReadiness: {},
    selectedProviderSet: new Set(['chatgpt']), providerToggleEls: [button], providerStateEls: { chatgpt: { id: 'chatgpt-state' } },
    providerSummaryText: summary, providerRecovery: recovery, selectedProviderIds: () => ['chatgpt'],
    document: { createElement: makeElement }, readinessRecovery: () => '開啟此 AI 網頁並登入，再重新檢查。LLMeeting 不會代你登入。' });
  vm.runInContext(['renderProviderControls', 'renderProviderSummary', 'renderProviderRecovery', 'readinessFailureLabel'].map(fn).join('\n'), context);
  try {
    for (const locale of ['zh_TW', 'en', 'ja', 'en']) {
      setLocale(locale);
      for (const code of ['LOGIN_REQUIRED', 'GENERATING', 'INPUT_NOT_FOUND', 'SEND_UNAVAILABLE', 'WRONG_URL', 'TAB_NOT_FOUND', 'CONTENT_SCRIPT_UNAVAILABLE', 'TIMEOUT', 'PROVIDER_ERROR']) {
        context.latestReadiness.chatgpt = { ready: false, code };
        context.renderProviderControls();
        context.renderProviderRecovery({ busy: false });
        const heading = recovery.children[0].children[0].textContent;
        assert.equal(heading, `ChatGPT: ${uiText(context.readinessFailureLabel({ code }))}`);
        if (locale === 'en') {
          assert.doesNotMatch(heading + summary.textContent + attributes.get('aria-label'), /\p{Script=Han}/u);
        }
      }
      context.selectedProviderSet.clear();
      context.renderProviderControls();
      assert.equal(attributes.get('aria-label'), uiText('ChatGPT：未啟用'));
      context.selectedProviderSet.add('chatgpt');
    }
  } finally { setLocale('en'); }
});

test('localized anonymous fallback never translates a supplied nickname', () => {
  try {
    for (const locale of ['zh_TW', 'en', 'ja']) {
      setLocale(locale);
      const { context } = fixture(state({ summaryStrategy: 'anonymousReview' }));
      assert.equal(context.meetingSpeakerLabel(context.latestState, 'chatgpt'), uiText('匿名參與者（暱稱未取得）'));
      context.latestState.transcript.anonymousNames = { chatgpt: '評析中' };
      assert.equal(context.meetingSpeakerLabel(context.latestState, 'chatgpt'), '評析中');
    }
  } finally { setLocale('en'); }
});
