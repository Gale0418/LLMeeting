import { buildCritiquePrompt, buildFinalSummaryPrompt, buildFirstRoundPrompt } from "../shared/prompts.js";
import {
  DEFAULT_ACTIVE_PROVIDER_IDS,
  PROVIDERS,
  PROVIDER_IDS,
  isProviderId,
  normalizeProviderIds,
} from "../shared/providers.js";
import { normalizeText } from "../shared/text.js";

function emptyProviderMap(providerIds = PROVIDER_IDS) {
  return Object.fromEntries(providerIds.map((providerId) => [providerId, ""]));
}

function providerJob(providerId, phase, prompt, extra = {}) {
  return { provider: providerId, phase, prompt, ...extra };
}

function emptyCritiqueRounds(providerIds, debateRounds) {
  return Array.from({ length: debateRounds }, () => emptyProviderMap(providerIds));
}

function critiquePhase(roundNumber) {
  return roundNumber <= 1 ? "critique" : `critique-${roundNumber}`;
}

function critiqueRoundFromPhase(phase) {
  const match = String(phase || "").match(/^critique(?:-(\d+))?$/);
  return match ? normalizeDebateRounds(match[1] || 1) : 0;
}

export function normalizeDebateRounds(value = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.min(5, Math.max(1, parsed));
}

export class DebateEngine {
  constructor(activeProviders = DEFAULT_ACTIVE_PROVIDER_IDS, summaryProvider = "chatgpt", debateRounds = 1) {
    this.validateRequestedProviders(activeProviders);
    if (!isProviderId(summaryProvider)) {
      throw new Error(`Unknown provider: ${summaryProvider}`);
    }

    this.activeProviders = normalizeProviderIds(activeProviders);
    if (this.activeProviders.length < 2) {
      throw new Error("至少需要 2 家 AI 才能進行辯論");
    }

    this.summaryProvider = summaryProvider;
    this.debateRounds = normalizeDebateRounds(debateRounds);
    const critiqueRounds = emptyCritiqueRounds(this.activeProviders, this.debateRounds);
    this.state = {
      phase: "idle",
      originalQuestion: "",
      debateRounds: this.debateRounds,
      currentCritiqueRound: 0,
      answers: emptyProviderMap(this.activeProviders),
      critiques: critiqueRounds[0],
      critiqueRounds,
      errors: [],
    };
  }

  start(originalQuestion) {
    const question = normalizeText(originalQuestion);
    const critiqueRounds = emptyCritiqueRounds(this.activeProviders, this.debateRounds);
    this.state = {
      phase: "first-round",
      originalQuestion: question,
      debateRounds: this.debateRounds,
      currentCritiqueRound: 0,
      answers: emptyProviderMap(this.activeProviders),
      critiques: critiqueRounds[0],
      critiqueRounds,
      errors: [],
    };

    return PROVIDERS.filter((p) => this.activeProviders.includes(p.id)).map((provider) =>
      providerJob(provider.id, "first-round", buildFirstRoundPrompt(question)),
    );
  }

  recordAnswer(providerId, content) {
    this.assertKnownProvider(providerId);
    this.state.answers[providerId] = normalizeText(content);
  }

  recordCritique(providerId, content, roundNumber = this.state.currentCritiqueRound || 1) {
    this.assertKnownProvider(providerId);
    const round = Math.min(this.debateRounds, Math.max(1, normalizeDebateRounds(roundNumber)));
    this.state.critiqueRounds[round - 1][providerId] = normalizeText(content);
    this.state.critiques = this.state.critiqueRounds[0];
  }

  markProviderError(providerId, phase, message) {
    this.assertKnownProvider(providerId);
    const content = `[錯誤：${normalizeText(message) || "unknown"}]`;
    this.state.errors.push({ provider: providerId, phase, message: content });

    if (phase === "first-round") {
      this.state.answers[providerId] = content;
    }

    const critiqueRound = critiqueRoundFromPhase(phase);
    if (critiqueRound) {
      this.recordCritique(providerId, content, critiqueRound);
    }
  }

  buildCritiqueJobs(roundNumber = 1) {
    const round = Math.min(this.debateRounds, Math.max(1, normalizeDebateRounds(roundNumber)));
    if (round === 1) {
      this.requireComplete(this.state.answers, "first-round");
    } else {
      this.requireComplete(this.state.critiqueRounds[round - 2], critiquePhase(round - 1));
    }
    const phase = critiquePhase(round);
    this.state.phase = phase;
    this.state.currentCritiqueRound = round;

    return PROVIDERS.filter((p) => this.activeProviders.includes(p.id)).map((provider) =>
      providerJob(
        provider.id,
        phase,
        buildCritiquePrompt({
          recipient: provider.id,
          originalQuestion: this.state.originalQuestion,
          answers: this.state.answers,
          previousCritiques: round > 1 ? this.state.critiqueRounds[round - 2] : undefined,
          roundNumber: round,
          activeProviders: this.activeProviders,
        }),
        { round },
      ),
    );
  }

  buildFinalJob() {
    for (let round = 1; round <= this.debateRounds; round += 1) {
      this.requireComplete(this.state.critiqueRounds[round - 1], critiquePhase(round));
    }
    this.state.phase = "summary";

    return providerJob(
      this.summaryProvider,
      "summary",
      buildFinalSummaryPrompt({
        originalQuestion: this.state.originalQuestion,
        answers: this.state.answers,
        critiques: this.state.critiques,
        critiqueRounds: this.state.critiqueRounds,
        activeProviders: this.activeProviders,
      }),
    );
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  assertKnownProvider(providerId) {
    if (!PROVIDER_IDS.includes(providerId)) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
  }

  validateRequestedProviders(providerIds) {
    if (!Array.isArray(providerIds)) {
      return;
    }

    for (const providerId of providerIds) {
      if (!isProviderId(providerId)) {
        throw new Error(`Unknown provider: ${providerId}`);
      }
    }
  }

  requireComplete(values, phase) {
    const missingProvider = this.activeProviders.find((providerId) => !values[providerId]);
    if (missingProvider) {
      throw new Error(`Cannot leave ${phase}; missing ${missingProvider}`);
    }
  }
}
