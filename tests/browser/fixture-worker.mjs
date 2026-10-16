// Only installed into an isolated test copy. Never loaded by manifest.json.
import { meeting, providers } from './fixtures.mjs';
import { runProviderTabsProbe, readProviderMetaProbe, closeProviderTabsProbe } from './provider-probe.mjs';
let state = meeting();
let rejectRepair = false;
const rejectedRequests = [];
const ready = chrome.storage.session.get(['fixtureState', 'rejectRepair']).then(async saved => {
  state = saved.fixtureState || state;
  rejectRepair = saved.rejectRepair || false;
  await chrome.storage.local.set({ 'aiDebate.providerSelection.v1': providers });
});
async function saveAndBroadcast() {
  await chrome.storage.session.set({ fixtureState: state, rejectRepair });
  await chrome.runtime.sendMessage({ type: 'aiDebate:stateChanged', state }).catch(() => {});
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === 'test:openPanel') {
    chrome.sidePanel.open({ windowId: sender.tab.windowId })
      .then(() => respond({ ok: true }), error => respond({ ok: false, error: error.message }));
    return true;
  }
  (async () => {
    await ready;
    if (message.type === 'aiDebate:getState') return { ok: true, state };
    if (message.type === 'test:providerTabs') {
      return { ok: true, evidence: await runProviderTabsProbe() };
    }
    if (message.type === 'test:providerMetaTitle') return {ok:true,title:await readProviderMetaProbe(message.tabId)};
    if (message.type === 'test:closeProviderTabs') { await closeProviderTabsProbe(); return {ok:true}; }
    if (message.type === 'test:scenario') {
      state = meeting(message.scenario);
      if (message.activeProviders) state.activeProviders = message.activeProviders;
      rejectRepair = Boolean(message.rejectRepair);
      await saveAndBroadcast();
      return { ok: true, state };
    }
    if (message.type === 'test:inspect') return { ok: true, state, rejectedRequests };
    if (message.type === 'test:compactQuestion') {
      state.transcript.originalQuestion = '[fixture] Compacted question…';
      await saveAndBroadcast();
      return { ok: true, state };
    }
    if (message.type === 'aiDebate:repairReply') {
      if (rejectRepair) return { ok: false, error: '補入失敗，貼上的內容已保留。' };
      if (typeof message.sessionId !== 'string' || !message.sessionId.trim()
          || message.sessionId !== state.transcript.sessionId || message.expectedContent !== state.summary) {
        return { ok: false, error: 'Fixture repair target mismatch' };
      }
      state.transcript.manualRepairs.push({ provider: message.provider, phase: message.phase,
        originalError: state.summary, source: 'manual', repairedAt: Date.now() });
      state.providerDiagnostics[message.provider] = { stage: 'manual-recovered', phase: message.phase };
      state.summary = message.content;
      state.summaries[message.provider] = message.content;
      state.repairPause = null;
      state.busy = false;
      state.phase = 'waiting_for_user';
      state.message = '本輪已補齊，等待你的下一步。';
      await saveAndBroadcast();
      return { ok: true, state };
    }
    if (message.type === 'aiDebate:stop') {
      state.busy = false;
      state.phase = 'waiting_for_user';
      await saveAndBroadcast();
      return { ok: true, state };
    }
    // No imports from the production backend and no network/provider calls.
    rejectedRequests.push(message.type);
    return { ok: false, error: `Unsupported fixture request: ${message.type}` };
  })().then(respond, error => respond({ ok: false, error: error.message }));
  return true;
});
