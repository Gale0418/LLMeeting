import { buildInteractionPrompt, buildFinalSummaryPrompt, buildFirstRoundPrompt, getPersonaPrompt } from "../shared/prompts.js";
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
  if (!match) {
    return 0;
  }
  const round = Number.parseInt(match[1] || 1, 10);
  return Number.isInteger(round) && round > 0 ? round : 0;
}

export function normalizeDebateRounds(value = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.min(5, Math.max(1, parsed));
}

function parseExistingRound(value, roundCount) {
  const round = Number.parseInt(value, 10);
  if (!Number.isInteger(round) || round < 1 || round > roundCount) {
    throw new Error(`Unknown critique round: ${value}`);
  }
  return round;
}

function createEngineState(engine, overrides = {}) {
  const critiqueRounds = emptyCritiqueRounds(engine.activeProviders, engine.debateRounds);
  return {
    phase: "idle",
    originalQuestion: "",
    activeProviders: [...engine.activeProviders],
    summaryProvider: engine.summaryProvider,
    interactionStyle: engine.interactionStyle,
    isTheaterMode: engine.isTheaterMode,
    customPersonas: { ...engine.customPersonas },
    debateRounds: engine.debateRounds,
    currentCritiqueRound: 0,
    answers: emptyProviderMap(engine.activeProviders),
    critiques: critiqueRounds[0],
    critiqueRounds,
    errors: [],
    ...overrides,
  };
}

function parseAnonymousName(text, index) {
  const fallbacks = ["星砂麻糬", "雲朵布丁", "彩虹奶凍", "泡泡歐蕾"];
  const defaultName = `${fallbacks[index % fallbacks.length]} ${index + 1}`;
  if (!text) return defaultName;

  const match = text.match(/^匿名名[：:]\s*(.+)$/m);
  if (match && match[1]) {
    const cleaned = match[1].trim().replace(/[#*`_~]/g, "");
    if (cleaned && cleaned.length <= 20) {
      return cleaned;
    }
  }
  return defaultName;
}

export class DebateEngine {
  constructor(activeProviders = DEFAULT_ACTIVE_PROVIDER_IDS, summaryProvider = "chatgpt", debateRounds = 1, options = {}) {
    this.validateRequestedProviders(activeProviders);

    let resolvedSummaryProvider = summaryProvider;
    const requestedSummaryProvider = summaryProvider;
    const requestedActiveProviders = normalizeProviderIds(activeProviders);

    if (summaryProvider === "random") {
      const pool = requestedActiveProviders.length > 0 ? requestedActiveProviders : DEFAULT_ACTIVE_PROVIDER_IDS;
      resolvedSummaryProvider = pool[Math.floor(Math.random() * pool.length)];
    }

    if (!isProviderId(resolvedSummaryProvider)) {
      throw new Error(`Unknown provider: ${resolvedSummaryProvider}`);
    }

    this.summaryStrategy = options.summaryStrategy || "general";
    let activeList = [...requestedActiveProviders];

    if (this.summaryStrategy === "observer") {
      activeList = activeList.filter((p) => p !== resolvedSummaryProvider);
      if (activeList.length < 2) {
        throw new Error("圍觀主席制在排除主席後，至少需要 2 家 AI 才能進行辯論");
      }
    } else if (activeList.length < 2) {
      throw new Error("至少需要 2 家 AI 才能進行辯論");
    }

    this.activeProviders = normalizeProviderIds(activeList);
    this.summaryProvider = resolvedSummaryProvider;
    this.requestedSummaryProvider = requestedSummaryProvider;
    this.debateRounds = normalizeDebateRounds(debateRounds);
    this.isTheaterMode = options.isTheaterMode || false;
    this.customPersonas = options.customPersonas || {};
    this.interactionStyle = options.interactionStyle || "critique";
    this.state = createEngineState(this, {
      summaryStrategy: this.summaryStrategy,
      requestedSummaryProvider: this.requestedSummaryProvider,
      resolvedSummaryProvider: this.summaryProvider,
    });
  }

  static restore(snapshot) {
    const state = JSON.parse(JSON.stringify(snapshot || {}));
    if (!Array.isArray(state.activeProviders) || !Array.isArray(state.critiqueRounds)) {
      throw new Error("Invalid debate snapshot");
    }

    const engine = new DebateEngine(
      state.activeProviders,
      state.resolvedSummaryProvider || state.summaryProvider,
      normalizeDebateRounds(state.debateRounds),
      {
        summaryStrategy: state.summaryStrategy || "general",
        interactionStyle: state.interactionStyle,
        isTheaterMode: state.isTheaterMode,
        customPersonas: state.customPersonas,
      },
    );
    engine.debateRounds = state.critiqueRounds.length;
    engine.state = {
      ...state,
      activeProviders: [...engine.activeProviders],
      summaryProvider: engine.summaryProvider,
      interactionStyle: engine.interactionStyle,
      isTheaterMode: engine.isTheaterMode,
      customPersonas: { ...engine.customPersonas },
      debateRounds: engine.debateRounds,
      critiques: state.critiqueRounds[0] || emptyProviderMap(engine.activeProviders),
    };
    return engine;
  }

  start(originalQuestion) {
    const question = normalizeText(originalQuestion);
    this.state = createEngineState(this, {
      phase: "first-round",
      originalQuestion: question,
      status: "running",
      summaryStrategy: this.summaryStrategy,
      requestedSummaryProvider: this.requestedSummaryProvider,
      resolvedSummaryProvider: this.summaryProvider,
    });

    // Imposter logic
    if (this.interactionStyle === "imposter") {
      const candidates = this.activeProviders;
      this.state.imposterProvider = candidates[Math.floor(Math.random() * candidates.length)];
    }

    return PROVIDERS.filter((p) => this.activeProviders.includes(p.id)).map((provider) => {
      let prompt = buildFirstRoundPrompt(question);

      if (this.summaryStrategy === "anonymous") {
        prompt = "請先為本場討論取一個可愛匿名名，第一行必須使用：\n匿名名：<你的匿名名>\n\n第二行之後再回答問題。\n\n" + prompt;
      }

      if (this.interactionStyle === "imposter" && provider.id === this.state.imposterProvider) {
        prompt = "【🤫 秘密任務】你是這次討論的內鬼。請在你的回答中，故意混入一個看似合理但實際上是捏造的假資訊或錯誤邏輯。絕對不要暴露你的身分！\n\n" + prompt;
      }

      if (this.isTheaterMode) {
        const persona = this.customPersonas[provider.id] || getPersonaPrompt(provider.id);
        prompt = persona + "\n\n" + prompt;
      }
      return providerJob(provider.id, "first-round", prompt);
    });
  }

  recordAnswer(providerId, content) {
    this.assertKnownProvider(providerId);
    this.state.answers[providerId] = normalizeText(content);
  }

  recordCritique(providerId, content, roundNumber = this.state.currentCritiqueRound || 1) {
    this.assertKnownProvider(providerId);
    const round = parseExistingRound(roundNumber, this.state.critiqueRounds.length);
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

  getLastCompletedRoundData() {
    for (let i = this.debateRounds - 1; i >= 0; i--) {
      if (this.activeProviders.every(p => this.state.critiqueRounds[i] && this.state.critiqueRounds[i][p])) {
        return { data: this.state.critiqueRounds[i], phase: critiquePhase(i + 1), isCritique: true };
      }
    }
    return { data: this.state.answers, phase: "first-round", isCritique: false };
  }

  buildCritiqueJobs(roundNumber = 1) {
    const round = parseExistingRound(roundNumber, this.state.critiqueRounds.length);
    const lastCompleted = this.getLastCompletedRoundData();
    this.requireComplete(lastCompleted.data, lastCompleted.phase);
    const phase = critiquePhase(round);
    this.state.phase = phase;
    this.state.currentCritiqueRound = round;

    return PROVIDERS.filter((p) => this.activeProviders.includes(p.id)).map((provider) => {
      let prompt = buildInteractionPrompt({
        recipient: provider.id,
        originalQuestion: this.state.originalQuestion,
        answers: this.state.answers,
        previousCritiques: lastCompleted.data,
        roundNumber: round,
        activeProviders: this.activeProviders,
        interactionStyle: this.interactionStyle,
      });
      if (this.isTheaterMode) {
        const persona = this.customPersonas[provider.id] || getPersonaPrompt(provider.id);
        prompt = persona + "\n\n" + prompt;
      }
      return providerJob(provider.id, phase, prompt, { round });
    });
  }

  addChatRound(userText = null) {
    const newCritiqueRound = emptyProviderMap(this.activeProviders);
    const normalizedUserText = normalizeText(userText);
    if (normalizedUserText) {
      newCritiqueRound.USER = normalizedUserText;
    }
    this.state.critiqueRounds.push(newCritiqueRound);
    this.debateRounds = this.state.critiqueRounds.length;
    this.state.debateRounds = this.debateRounds;
    return this.debateRounds;
  }

  buildUserMessageJobs(text, roundNumber) {
    const round = parseExistingRound(roundNumber, this.state.critiqueRounds.length);
    const lastCompleted = this.getLastCompletedRoundData();
    const phase = critiquePhase(round);
    this.state.phase = phase;
    this.state.currentCritiqueRound = round;

    return PROVIDERS.filter((p) => this.activeProviders.includes(p.id)).map((provider) => {
      let prompt = buildInteractionPrompt({
        recipient: provider.id,
        originalQuestion: this.state.originalQuestion,
        answers: this.state.answers,
        previousCritiques: lastCompleted.data,
        roundNumber: round,
        activeProviders: this.activeProviders,
        interactionStyle: this.interactionStyle,
      });

      prompt += `\n\n【來自主人的插話 / 補充】\n${normalizeText(text)}\n\n請綜合上述其他 AI 的發言與主人的補充進行回應。`;

      if (this.isTheaterMode) {
        const persona = this.customPersonas[provider.id] || getPersonaPrompt(provider.id);
        prompt = persona + "\n\n" + prompt;
      }
      return providerJob(provider.id, phase, prompt, { round });
    });
  }

  buildFinalJob() {
    for (let round = 1; round <= this.debateRounds; round += 1) {
      this.requireComplete(this.state.critiqueRounds[round - 1], critiquePhase(round));
    }
    this.state.phase = "summary";

    let speakerLabels = {};
    if (this.summaryStrategy === "anonymous") {
      this.activeProviders.forEach((pId, idx) => {
        const answerText = this.state.answers[pId] || "";
        speakerLabels[pId] = parseAnonymousName(answerText, idx);
      });
    }

    const job = providerJob(
      this.summaryProvider,
      "summary",
      buildFinalSummaryPrompt({
        originalQuestion: this.state.originalQuestion,
        answers: this.state.answers,
        critiques: this.state.critiques,
        critiqueRounds: this.state.critiqueRounds,
        activeProviders: this.activeProviders,
        speakerLabels,
      }),
    );

    if (this.summaryStrategy === "anonymous") {
      job.forceNewTab = true;
    }

    return job;
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
