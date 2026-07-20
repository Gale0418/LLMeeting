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
  "【遊戲內鬼任務】你正在玩 LLMeeting 的抓內鬼模式，這是一局可揭曉的社交推理遊戲。",
  "你的目標不是直接說錯，而是讓討論在不突兀的情況下偏航，慢慢偏向一個合理但不理想的方向。",
  "可用手法：半真半假、定義偷換、重點排序、範圍外推、把使用者在意的詞換成相近但不同的判準、故意放大次要限制。",
  "不要直接說出錯誤答案，不要編造真實新聞、來源、醫療、法律、金融、安全、人物事件或不可驗證數據。",
  "第一輪請直接回答題目並維持遊戲懸念，不在開頭討論這份規則或自己的特殊任務。",
  "如果下一輪被質疑，可以用一小段角色內辯護維持懸念；若對方明確指出偏航手法，承認這是遊戲線索並說明類型，不要堅持錯誤。",
].join("\n");

function addImposterSecretPrompt(prompt, { keepPromptFirst = false } = {}) {
  return keepPromptFirst
    ? `${prompt}\n\n${IMPOSTER_SECRET_PROMPT}`
    : `${IMPOSTER_SECRET_PROMPT}\n\n${prompt}`;
}

export function normalizeDebateRounds(value = 1) {
  if (typeof value === "string" && !/^\s*\d+\s*$/.test(value)) {
    return 1;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.min(5, Math.max(1, parsed));
}

function normalizeDebateRoundsForInteraction(value, interactionStyle = "critique") {
  const rounds = normalizeDebateRounds(value);
  return interactionStyle === "imposter" ? Math.max(2, rounds) : rounds;
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
    this.interactionStyle = options.interactionStyle || "critique";
    this.debateRounds = normalizeDebateRoundsForInteraction(debateRounds, this.interactionStyle);
    this.isTheaterMode = options.isTheaterMode || false;
    this.customPersonas = options.customPersonas || {};
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
      const hasImposter = Math.random() < 0.5;
      const candidates = this.activeProviders;
      this.state.imposterProvider = hasImposter
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : null;
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

  markProviderError(providerId, phase, message, providerContent = "") {
    this.assertKnownProvider(providerId);
    const normalizedMessage = normalizeText(message) || "unknown";
    const rawProviderContent = normalizeText(providerContent);
    const content = rawProviderContent
      ? `[服務狀態：${normalizedMessage}]
以下是該 AI 網頁顯示的原文，不是這位 AI 對題目的正式回答：
${rawProviderContent}`
      : `[錯誤：${normalizedMessage}]`;
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
        allowImposterAccusation: this.interactionStyle === "imposter" && round > 1 && round >= this.debateRounds,
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
        allowImposterAccusation: this.interactionStyle === "imposter" && round > 1 && round >= this.debateRounds,
      });

      prompt += `\n\n【來自使用者的插話 / 補充】\n${normalizeText(text)}\n\n請綜合上述其他 AI 的發言與使用者的補充進行回應。`;

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
