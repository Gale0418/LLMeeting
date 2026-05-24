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

function providerJob(providerId, phase, prompt) {
  return { provider: providerId, phase, prompt };
}

export class DebateEngine {
  constructor(activeProviders = DEFAULT_ACTIVE_PROVIDER_IDS, summaryProvider = "chatgpt") {
    this.validateRequestedProviders(activeProviders);
    if (!isProviderId(summaryProvider)) {
      throw new Error(`Unknown provider: ${summaryProvider}`);
    }

    this.activeProviders = normalizeProviderIds(activeProviders);
    if (this.activeProviders.length < 2) {
      throw new Error("至少需要 2 家 AI 才能進行辯論");
    }

    this.summaryProvider = summaryProvider;
    this.state = {
      phase: "idle",
      originalQuestion: "",
      answers: emptyProviderMap(activeProviders),
      critiques: emptyProviderMap(activeProviders),
      errors: [],
    };
  }

  start(originalQuestion) {
    const question = normalizeText(originalQuestion);
    this.state = {
      phase: "first-round",
      originalQuestion: question,
      answers: emptyProviderMap(this.activeProviders),
      critiques: emptyProviderMap(this.activeProviders),
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

  recordCritique(providerId, content) {
    this.assertKnownProvider(providerId);
    this.state.critiques[providerId] = normalizeText(content);
  }

  markProviderError(providerId, phase, message) {
    this.assertKnownProvider(providerId);
    const content = `[錯誤：${normalizeText(message) || "unknown"}]`;
    this.state.errors.push({ provider: providerId, phase, message: content });

    if (phase === "first-round") {
      this.state.answers[providerId] = content;
    }

    if (phase === "critique") {
      this.state.critiques[providerId] = content;
    }
  }

  buildCritiqueJobs() {
    this.requireComplete(this.state.answers, "first-round");
    this.state.phase = "critique";

    return PROVIDERS.filter((p) => this.activeProviders.includes(p.id)).map((provider) =>
      providerJob(
        provider.id,
        "critique",
        buildCritiquePrompt({
          recipient: provider.id,
          originalQuestion: this.state.originalQuestion,
          answers: this.state.answers,
          activeProviders: this.activeProviders,
        }),
      ),
    );
  }

  buildFinalJob() {
    this.requireComplete(this.state.critiques, "critique");
    this.state.phase = "summary";

    return providerJob(
      this.summaryProvider,
      "summary",
      buildFinalSummaryPrompt({
        originalQuestion: this.state.originalQuestion,
        answers: this.state.answers,
        critiques: this.state.critiques,
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
