import { buildCritiquePrompt, buildFinalSummaryPrompt, buildFirstRoundPrompt } from "../shared/prompts.js";
import { PROVIDERS, PROVIDER_IDS } from "../shared/providers.js";
import { normalizeText } from "../shared/text.js";

function emptyProviderMap() {
  return Object.fromEntries(PROVIDER_IDS.map((providerId) => [providerId, ""]));
}

function providerJob(providerId, phase, prompt) {
  return { provider: providerId, phase, prompt };
}

export class DebateEngine {
  constructor() {
    this.state = {
      phase: "idle",
      originalQuestion: "",
      answers: emptyProviderMap(),
      critiques: emptyProviderMap(),
      errors: [],
    };
  }

  start(originalQuestion) {
    const question = normalizeText(originalQuestion);
    this.state = {
      phase: "first-round",
      originalQuestion: question,
      answers: emptyProviderMap(),
      critiques: emptyProviderMap(),
      errors: [],
    };

    return PROVIDERS.map((provider) =>
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

    return PROVIDERS.map((provider) =>
      providerJob(
        provider.id,
        "critique",
        buildCritiquePrompt({
          recipient: provider.id,
          originalQuestion: this.state.originalQuestion,
          answers: this.state.answers,
        }),
      ),
    );
  }

  buildFinalJob() {
    this.requireComplete(this.state.critiques, "critique");
    this.state.phase = "summary";

    return providerJob(
      "chatgpt",
      "summary",
      buildFinalSummaryPrompt({
        originalQuestion: this.state.originalQuestion,
        answers: this.state.answers,
        critiques: this.state.critiques,
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

  requireComplete(values, phase) {
    const missingProvider = PROVIDER_IDS.find((providerId) => !values[providerId]);
    if (missingProvider) {
      throw new Error(`Cannot leave ${phase}; missing ${missingProvider}`);
    }
  }
}
