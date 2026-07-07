import {
  buildAnonymousFirstRoundPrompt,
  buildInteractionPrompt,
  buildFinalSummaryPrompt,
  buildFirstRoundPrompt,
  getPersonaPrompt,
  parseAnonymousName,
} from "../shared/prompts.js";
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

function normalizeSummaryStrategy(value = "standard") {
  return ["standard", "observerChair", "anonymousReview"].includes(value) ? value : "standard";
}

const IMPOSTER_SECRET_PROMPT = [
  "【遊戲內鬼任務】你正在玩 LLMeeting 的抓內鬼模式。",
  "你必須在回答中偷偷埋入一個低風險、可被其他 AI 抓出的錯誤邏輯或推理破綻。",
  "不要編造真實新聞、來源、醫療、法律、金融、安全、人物事件或不可驗證數據。",
  "可用的破綻類型：偷換前提、範圍外推、輕微算術或分類錯、把例外當通則、故意漏掉一個限制。",
  "不要拒絕任務、不要自爆你是內鬼、不要說你不能當內鬼。",
  "如果下一輪被質疑，先狡辯、轉移焦點，或把破綻包裝成觀點差異；目標是逃離追殺。",
].join("\n");

function addImposterSecretPrompt(prompt, { keepPromptFirst = false } = {}) {
  return keepPromptFirst
    ? `${prompt}\n\n${IMPOSTER_SECRET_PROMPT}`
    : `${IMPOSTER_SECRET_PROMPT}\n\n${prompt}`;
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
    summaryStrategy: engine.summaryStrategy,
    resolvedSummaryProvider: engine.resolvedSummaryProvider,
    anonymousNames: { ...engine.anonymousNames },
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

export class DebateEngine {
  constructor(activeProviders = DEFAULT_ACTIVE_PROVIDER_IDS, summaryProvider = "chatgpt", debateRounds = 1, options = {}) {
    this.validateRequestedProviders(activeProviders);
    if (!isProviderId(summaryProvider)) {
      throw new Error(`Unknown provider: ${summaryProvider}`);
    }
    const resolvedSummaryProvider = options.resolvedSummaryProvider || summaryProvider;
    if (!isProviderId(resolvedSummaryProvider)) {
      throw new Error(`Unknown provider: ${resolvedSummaryProvider}`);
    }

    this.activeProviders = normalizeProviderIds(activeProviders);
    if (this.activeProviders.length < 2) {
      throw new Error("至少需要 2 家 AI 才能進行辯論");
    }

    this.summaryProvider = resolvedSummaryProvider;
    this.summaryStrategy = normalizeSummaryStrategy(options.summaryStrategy);
    this.resolvedSummaryProvider = resolvedSummaryProvider;
    this.anonymousNames = { ...(options.anonymousNames || {}) };
    this.debateRounds = normalizeDebateRounds(debateRounds);
    this.isTheaterMode = options.isTheaterMode || false;
    this.customPersonas = options.customPersonas || {};
    this.interactionStyle = options.interactionStyle || "critique";
    this.state = createEngineState(this);
  }

  static restore(snapshot) {
    const state = JSON.parse(JSON.stringify(snapshot || {}));
    if (!Array.isArray(state.activeProviders) || !Array.isArray(state.critiqueRounds)) {
      throw new Error("Invalid debate snapshot");
    }

    const engine = new DebateEngine(
      state.activeProviders,
      state.summaryProvider,
      normalizeDebateRounds(state.debateRounds),
      {
        interactionStyle: state.interactionStyle,
        isTheaterMode: state.isTheaterMode,
        customPersonas: state.customPersonas,
        summaryStrategy: state.summaryStrategy,
        resolvedSummaryProvider: state.resolvedSummaryProvider || state.summaryProvider,
        anonymousNames: state.anonymousNames,
      },
    );
    engine.debateRounds = state.critiqueRounds.length;
    engine.state = {
      ...state,
      activeProviders: [...engine.activeProviders],
      summaryProvider: engine.summaryProvider,
      summaryStrategy: engine.summaryStrategy,
      resolvedSummaryProvider: engine.resolvedSummaryProvider,
      anonymousNames: { ...engine.anonymousNames },
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
    });

    // Imposter logic
    if (this.interactionStyle === "imposter") {
      const candidates = this.activeProviders;
      this.state.imposterProvider = candidates[Math.floor(Math.random() * candidates.length)];
    }

    return PROVIDERS.filter((p) => this.activeProviders.includes(p.id)).map((provider) => {
      let prompt = this.summaryStrategy === "anonymousReview"
        ? buildAnonymousFirstRoundPrompt(question)
        : buildFirstRoundPrompt(question);

      if (this.interactionStyle === "imposter" && provider.id === this.state.imposterProvider) {
        prompt = addImposterSecretPrompt(prompt, {
          keepPromptFirst: this.summaryStrategy === "anonymousReview",
        });
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
    const text = normalizeText(content);
    this.state.answers[providerId] = text;
    if (this.summaryStrategy === "anonymousReview") {
      this.anonymousNames = {
        ...this.anonymousNames,
        [providerId]: parseAnonymousName(text, providerId),
      };
      this.state.anonymousNames = { ...this.anonymousNames };
    }
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
      if (this.summaryStrategy === "anonymousReview") {
        this.anonymousNames = {
          ...this.anonymousNames,
          [providerId]: parseAnonymousName(content, providerId),
        };
        this.state.anonymousNames = { ...this.anonymousNames };
      }
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

    const speakerLabels = this.summaryStrategy === "anonymousReview"
      ? Object.fromEntries(this.activeProviders.map((providerId) => [
        providerId,
        this.state.anonymousNames?.[providerId] || parseAnonymousName(this.state.answers[providerId], providerId),
      ]))
      : {};

    return PROVIDERS.filter((p) => this.activeProviders.includes(p.id)).map((provider) => {
      let prompt = buildInteractionPrompt({
        recipient: provider.id,
        originalQuestion: this.state.originalQuestion,
        answers: this.state.answers,
        previousCritiques: lastCompleted.data,
        roundNumber: round,
        activeProviders: this.activeProviders,
        interactionStyle: this.interactionStyle,
        speakerLabels,
        anonymizeSpeakers: this.summaryStrategy === "anonymousReview",
      });
      if (this.interactionStyle === "imposter" && provider.id === this.state.imposterProvider) {
        prompt = addImposterSecretPrompt(prompt);
      }
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

    const speakerLabels = this.summaryStrategy === "anonymousReview"
      ? Object.fromEntries(this.activeProviders.map((providerId) => [
        providerId,
        this.state.anonymousNames?.[providerId] || parseAnonymousName(this.state.answers[providerId], providerId),
      ]))
      : {};

    return PROVIDERS.filter((p) => this.activeProviders.includes(p.id)).map((provider) => {
      let prompt = buildInteractionPrompt({
        recipient: provider.id,
        originalQuestion: this.state.originalQuestion,
        answers: this.state.answers,
        previousCritiques: lastCompleted.data,
        roundNumber: round,
        activeProviders: this.activeProviders,
        interactionStyle: this.interactionStyle,
        speakerLabels,
        anonymizeSpeakers: this.summaryStrategy === "anonymousReview",
      });

      prompt += `\n\n【來自主人的插話 / 補充】\n${normalizeText(text)}\n\n請綜合上述其他 AI 的發言與主人的補充進行回應。`;

      if (this.interactionStyle === "imposter" && provider.id === this.state.imposterProvider) {
        prompt = addImposterSecretPrompt(prompt);
      }

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
    const speakerLabels = this.summaryStrategy === "anonymousReview"
      ? Object.fromEntries(this.activeProviders.map((providerId) => [
        providerId,
        this.state.anonymousNames?.[providerId] || parseAnonymousName(this.state.answers[providerId], providerId),
      ]))
      : {};

    return providerJob(
      this.resolvedSummaryProvider,
      "summary",
      buildFinalSummaryPrompt({
        originalQuestion: this.state.originalQuestion,
        answers: this.state.answers,
        critiques: this.state.critiques,
        critiqueRounds: this.state.critiqueRounds,
        activeProviders: this.activeProviders,
        speakerLabels,
        anonymizeSpeakers: this.summaryStrategy === "anonymousReview",
      }),
      { forceNewTab: this.summaryStrategy === "anonymousReview" },
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
