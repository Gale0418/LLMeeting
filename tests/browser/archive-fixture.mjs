import { providers } from './fixtures.mjs';

const repeat = (label, length) => `${label} ${'x'.repeat(length)}`;

export function buildArchiveFixture() {
  const sessionId = 'isolated-archive-18-rounds';
  const rounds = Array.from({ length: 18 }, (_, index) => {
    const round = index + 1;
    return {
      round,
      responses: Object.fromEntries(providers.map(provider => [provider, {
        prompt: `Round ${round} prompt for ${provider}: ${repeat('合成提示', 650)}`,
        reply: `Round ${round} reply for ${provider}: ${repeat('合成回覆', 1400)}`,
      }])),
    };
  });
  const state = {
    busy: false,
    status: 'done',
    phase: 'done',
    mode: 'chat',
    activeProviders: providers,
    summaryProvider: 'chatgpt',
    transcript: {
      sessionId,
      originalQuestion: `18-round synthetic archive fixture ${repeat('原始問題', 900)}`,
      answers: Object.fromEntries(providers.map(provider => [provider,
        `Final response for ${provider}: ${repeat('最終回覆', 700)}`])),
      critiqueRounds: rounds.map(({ responses }) =>
        Object.fromEntries(providers.map(provider => [provider, responses[provider].reply]))),
    },
    summaries: Object.fromEntries(providers.map(provider => [provider,
      `Summary from ${provider}: ${repeat('摘要', 500)}`])),
    summary: `Synthetic chair summary: ${repeat('總結', 700)}`,
  };
  const events = rounds.flatMap(({ round, responses }) => providers.flatMap(provider => [
    { sequence: (round - 1) * providers.length * 2 + providers.indexOf(provider) * 2 + 1,
      provider, phase: round === 1 ? 'critique' : `critique-${round}`, round,
      attemptId: `${round}-${provider}`, stage: 'prepared', prompt: responses[provider].prompt },
    { sequence: (round - 1) * providers.length * 2 + providers.indexOf(provider) * 2 + 2,
      provider, phase: round === 1 ? 'critique' : `critique-${round}`, round,
      attemptId: `${round}-${provider}`, stage: 'received', response: responses[provider].reply },
  ]));
  return { state, events };
}
