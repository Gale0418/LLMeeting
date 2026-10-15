export const providers = ['chatgpt', 'gemini', 'grok', 'claude', 'meta'];
export const rawReply = 'Synthetic AI reply — 原文保持不變 OWO\nNo real provider was contacted.';
export const fault = '[服務狀態：收集 AI 回覆: provider readiness timeout] 這位裁判未能完成總結。';

export function meeting(scenario = 'critique') {
  const state = {
    busy: true, status: 'running', phase: scenario, mode: 'debate',
    activeProviders: providers, summaryProvider: 'chatgpt', summaryStrategy: 'observerChair',
    currentCritiqueRound: 1, debateRounds: 3,
    message: 'Gemini：等待第 1/3 輪互評：評析其他 AI',
    transcript: { sessionId: 'isolated-browser-fixture', originalQuestion: `[fixture:${scenario}] Public synthetic question`,
      answers: Object.fromEntries(providers.map(id => [id, rawReply])), critiqueRounds: [{}], manualRepairs: [] },
  };
  if (scenario === 'first-round') {
    state.transcript.answers = {};
    state.message = 'ChatGPT：等待回答原始問題';
  } else if (scenario === 'summary') {
    state.summaryStrategy = 'allAnonymous';
    state.message = '彙整總結';
    state.summaries = {};
  } else if (scenario === 'fault') {
    state.busy = false;
    state.status = state.phase = 'waiting_for_user';
    state.message = '等待使用者發言或選擇下一步...';
    state.summary = fault;
    state.summaries = { chatgpt: fault };
    state.repairPause = { pausedPhase: 'summary', remainingJobs: [] };
    state.providerDiagnostics = { chatgpt: { stage: 'error', phase: 'summary', error: 'provider readiness timeout' } };
  }
  return state;
}
