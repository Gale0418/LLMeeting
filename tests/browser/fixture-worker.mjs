// Only installed into an isolated test copy. Never loaded by manifest.json.
import { meeting, providers } from './fixtures.mjs';
import { buildArchiveFixture } from './archive-fixture.mjs';
import { buildMeetingExport, createMeetingArchive } from '../src/background/meetingArchive.js';
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
    if (message.type === 'test:archiveRegression') {
      const fixture = buildArchiveFixture();
      const archive = createMeetingArchive();
      await archive.clear();
      await archive.save(fixture.state, fixture.events);
      const reopened = createMeetingArchive();
      const loaded = await reopened.load();
      const readEvents = await reopened.readEvents(fixture.state.transcript.sessionId);
      const persistedBytes = new TextEncoder().encode(JSON.stringify({ state: loaded, events: readEvents })).byteLength;
      if (!loaded || loaded.transcript.sessionId !== fixture.state.transcript.sessionId
          || JSON.stringify(loaded) !== JSON.stringify(fixture.state)
          || JSON.stringify(readEvents) !== JSON.stringify(fixture.events)) {
        throw new Error('A fresh archive instance did not read back the full meeting and ordered events');
      }
      const nextState = { ...meeting('critique'), transcript: { ...meeting('critique').transcript,
        sessionId: 'isolated-archive-next-meeting' } };
      const nextEvents = [{ sequence: 1, provider: 'meta', phase: 'first-round', stage: 'received', response: 'next only' }];
      await reopened.save(nextState, nextEvents);
      const switched = createMeetingArchive();
      const oldEventsAfterSwitch = await switched.readEvents(fixture.state.transcript.sessionId);
      const newEvents = await switched.readEvents(nextState.transcript.sessionId);
      await switched.clear();
      const cleared = createMeetingArchive();
      const clearRemovedStateAndEvents = (await cleared.load()) === undefined
        && (await cleared.readEvents(nextState.transcript.sessionId)).length === 0;
      if (oldEventsAfterSwitch.length || JSON.stringify(newEvents) !== JSON.stringify(nextEvents) || !clearRemovedStateAndEvents) {
        throw new Error('Switching or clearing a meeting left stale IndexedDB state/events');
      }
      await cleared.save(fixture.state, fixture.events);
      state = fixture.state;
      await saveAndBroadcast();
      return { ok: true, details: { rounds: fixture.state.transcript.critiqueRounds.length,
        persistedBytes, reopened: true, switchClearedOldEvents: true, clearRemovedStateAndEvents: true } };
    }
    if (message.type === 'aiDebate:exportMeeting') {
      const archive = createMeetingArchive();
      const archived = await archive.load();
      if (!archived?.transcript) return { ok: false, error: 'Fixture archive is empty' };
      const providerEvents = await archive.readEvents(archived.transcript.sessionId);
      return { ok: true, export: buildMeetingExport(archived, providerEvents, 'saved',
        chrome.runtime.getManifest().version, 1792080005000) };
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
