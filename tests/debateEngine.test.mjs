import test from "node:test";
import assert from "node:assert/strict";

import { DebateEngine, normalizeDebateRounds } from "../src/background/debateEngine.js";

function withMockedRandom(valueOrValues, callback) {
  const originalRandom = Math.random;
  const values = Array.isArray(valueOrValues) ? [...valueOrValues] : [valueOrValues];
  const fallback = values.at(-1) ?? 0;
  Math.random = () => values.length ? values.shift() : fallback;
  try {
    return callback();
  } finally {
    Math.random = originalRandom;
  }
}

test("engine starts a fixed first-round debate for all providers", () => {
  const engine = new DebateEngine();
  const jobs = engine.start("天為什麼是藍的？");

  assert.equal(engine.snapshot().phase, "first-round");
  assert.deepEqual(
    jobs.map((job) => [job.provider, job.phase, job.prompt]),
    [
      ["chatgpt", "first-round", "天為什麼是藍的？"],
      ["gemini", "first-round", "天為什麼是藍的？"],
      ["grok", "first-round", "天為什麼是藍的？"],
      ["claude", "first-round", "天為什麼是藍的？"],
    ],
  );
});

test("engine builds critique jobs after all first answers are recorded", () => {
  const engine = new DebateEngine();
  engine.start("天為什麼是藍的？");
  engine.recordAnswer("chatgpt", "是散射。");
  engine.recordAnswer("gemini", "就是藍的呀~");
  engine.recordAnswer("grok", "我不知道。");
  engine.recordAnswer("claude", "需要看光的波長。");

  const jobs = engine.buildCritiqueJobs();

  assert.equal(engine.snapshot().phase, "critique");
  assert.equal(jobs.length, 4);
  assert.match(jobs.find((job) => job.provider === "chatgpt").prompt, /Gemini:\n就是藍的呀~/);
  assert.match(jobs.find((job) => job.provider === "chatgpt").prompt, /Claude:\n需要看光的波長。/);
  assert.doesNotMatch(jobs.find((job) => job.provider === "chatgpt").prompt, /ChatGPT:\n是散射。/);
});

test("engine builds final ChatGPT summary job after all critiques are recorded", () => {
  const engine = new DebateEngine();
  engine.start("天為什麼是藍的？");
  engine.recordAnswer("chatgpt", "是散射。");
  engine.recordAnswer("gemini", "就是藍的呀~");
  engine.recordAnswer("grok", "我不知道。");
  engine.recordAnswer("claude", "需要看光的波長。");
  engine.buildCritiqueJobs();
  engine.recordCritique("chatgpt", "Gemini 太草率。");
  engine.recordCritique("gemini", "GPT 比較完整。");
  engine.recordCritique("grok", "我同意散射。");
  engine.recordCritique("claude", "需要補充大氣散射。");

  const job = engine.buildFinalJob();

  assert.equal(engine.snapshot().phase, "summary");
  assert.equal(job.provider, "chatgpt");
  assert.equal(job.phase, "summary");
  assert.match(job.prompt, /第一輪回答:/);
  assert.match(job.prompt, /第二輪互評:/);
  assert.match(job.prompt, /Gemini 太草率。/);
});

test("engine can run multiple critique rounds before the final summary", () => {
  const engine = new DebateEngine(["chatgpt", "gemini", "grok"], "chatgpt", 2);
  engine.start("天為什麼是藍的？");
  engine.recordAnswer("chatgpt", "是散射。");
  engine.recordAnswer("gemini", "大氣讓它看起來藍。");
  engine.recordAnswer("grok", "短波長散射比較強。");

  const firstCritiqueJobs = engine.buildCritiqueJobs(1);
  engine.recordCritique("chatgpt", "Gemini 少了瑞利散射。", 1);
  engine.recordCritique("gemini", "GPT 說法正確但可以更白話。", 1);
  engine.recordCritique("grok", "兩者都該提到短波長。", 1);

  const secondCritiqueJobs = engine.buildCritiqueJobs(2);
  engine.recordCritique("chatgpt", "我接受 Gemini 的白話補充。", 2);
  engine.recordCritique("gemini", "我補上瑞利散射。", 2);
  engine.recordCritique("grok", "共識是短波長散射。", 2);

  const job = engine.buildFinalJob();
  const snapshot = engine.snapshot();

  assert.equal(snapshot.debateRounds, 2);
  assert.equal(snapshot.critiqueRounds.length, 2);
  assert.equal(firstCritiqueJobs[0].round, 1);
  assert.equal(secondCritiqueJobs[0].phase, "critique-2");
  assert.match(secondCritiqueJobs.find((item) => item.provider === "chatgpt").prompt, /上一輪對話/);
  assert.match(job.prompt, /第二輪互評:/);
  assert.match(job.prompt, /第三輪互評:/);
  assert.match(job.prompt, /我補上瑞利散射。/);
});

test("debate round count is clamped to the supported one through five range", () => {
  assert.equal(normalizeDebateRounds(-1), 1);
  assert.equal(normalizeDebateRounds(0), 1);
  assert.equal(normalizeDebateRounds(3), 3);
  assert.equal(normalizeDebateRounds(99), 5);
});

test("engine restores an interactive session and builds the next round", () => {
  const original = new DebateEngine(
    ["chatgpt", "gemini"],
    "gemini",
    1,
    { interactionStyle: "casual" },
  );
  original.start("恢復測試");
  original.recordAnswer("chatgpt", "GPT 答案");
  original.recordAnswer("gemini", "Gemini 答案");
  original.buildCritiqueJobs(1);
  original.recordCritique("chatgpt", "GPT 互動", 1);
  original.recordCritique("gemini", "Gemini 互動", 1);

  const restored = DebateEngine.restore(original.snapshot());
  const round = restored.addChatRound("主人補充");
  const jobs = restored.buildUserMessageJobs("主人補充", round);

  assert.equal(restored.summaryProvider, "gemini");
  assert.equal(jobs[0].round, 2);
  assert.match(jobs[0].prompt, /主人補充/);
  assert.equal(restored.snapshot().critiqueRounds[1].USER, "主人補充");
});

test("interactive rounds can continue beyond the configured five-round limit", () => {
  const providers = ["chatgpt", "gemini"];
  const engine = new DebateEngine(providers, "chatgpt", 5);
  engine.start("第六輪測試");
  providers.forEach((id) => engine.recordAnswer(id, `${id} answer`));
  for (let round = 1; round <= 5; round += 1) {
    engine.buildCritiqueJobs(round);
    providers.forEach((id) => engine.recordCritique(id, `${id} round ${round}`, round));
  }

  const sixthRound = engine.addChatRound("第六輪插話");
  const jobs = engine.buildUserMessageJobs("第六輪插話", sixthRound);
  jobs.forEach((job) => engine.recordCritique(job.provider, "sixth", job.round));

  assert.equal(sixthRound, 6);
  assert.deepEqual([...new Set(jobs.map((job) => job.round))], [6]);
  assert.doesNotThrow(() => engine.buildFinalJob());
});

test("engine rejects a critique write outside the existing round range", () => {
  const engine = new DebateEngine(["chatgpt", "gemini"]);
  engine.start("跳輪測試");

  assert.throws(
    () => engine.recordCritique("chatgpt", "bad", 2),
    /Unknown critique round: 2/,
  );
});

test("engine records provider errors without blocking the next phase", () => {
  const engine = new DebateEngine();
  engine.start("天為什麼是藍的？");
  engine.recordAnswer("chatgpt", "是散射。");
  engine.markProviderError("gemini", "first-round", "timeout");
  engine.recordAnswer("grok", "我不知道。");
  engine.recordAnswer("claude", "需要看光的波長。");

  const jobs = engine.buildCritiqueJobs();

  assert.equal(jobs.length, 4);
  assert.match(jobs.find((job) => job.provider === "chatgpt").prompt, /Gemini:\n\[錯誤：timeout\]/);
});

test("engine supports optional Claude as a participant", () => {
  const engine = new DebateEngine(["chatgpt", "gemini", "grok", "claude"]);
  const jobs = engine.start("比較四個 AI 的觀點");

  assert.deepEqual(jobs.map((job) => job.provider), ["chatgpt", "gemini", "grok", "claude"]);

  engine.recordAnswer("chatgpt", "GPT 回答");
  engine.recordAnswer("gemini", "Gemini 回答");
  engine.recordAnswer("grok", "Grok 回答");
  engine.recordAnswer("claude", "Claude 回答");

  const critiqueJobs = engine.buildCritiqueJobs();
  const chatgptPrompt = critiqueJobs.find((job) => job.provider === "chatgpt").prompt;

  assert.match(chatgptPrompt, /Claude:\nClaude 回答/);
});

test("engine rejects debates with fewer than two active providers", () => {
  assert.throws(
    () => new DebateEngine(["chatgpt"]),
    /至少需要 2 家 AI/,
  );
});

test("engine rejects unknown active or summary providers", () => {
  assert.throws(
    () => new DebateEngine(["chatgpt", "unknown"]),
    /Unknown provider: unknown/,
  );

  assert.throws(
    () => new DebateEngine(["chatgpt", "gemini"], "unknown"),
    /Unknown provider: unknown/,
  );
});

test("imposter mode may assign one provider a subtle drift mission", () => {
  withMockedRandom([0.25, 0], () => {
    const engine = new DebateEngine(["chatgpt", "gemini"], "chatgpt", 1, {
      interactionStyle: "imposter",
    });

    const jobs = engine.start("比較 merge sort 與 quick sort");
    const chatgptPrompt = jobs.find((job) => job.provider === "chatgpt").prompt;
    const geminiPrompt = jobs.find((job) => job.provider === "gemini").prompt;

    assert.equal(engine.snapshot().imposterProvider, "chatgpt");
    assert.equal(engine.snapshot().debateRounds, 2);
    assert.match(chatgptPrompt, /遊戲內鬼任務/);
    assert.match(chatgptPrompt, /偏航|帶偏/);
    assert.match(chatgptPrompt, /半真半假|定義偷換|重點排序/);
    assert.match(chatgptPrompt, /不要直接說出錯誤答案/);
    assert.match(chatgptPrompt, /可揭曉/);
    assert.match(chatgptPrompt, /維持懸念/);
    assert.doesNotMatch(chatgptPrompt, /錯誤邏輯/);
    assert.doesNotMatch(chatgptPrompt, /推理破綻/);
    assert.doesNotMatch(chatgptPrompt, /不要拒絕任務/);
    assert.doesNotMatch(chatgptPrompt, /不要自爆/);
    assert.doesNotMatch(chatgptPrompt, /狡辯|轉移焦點|逃離追殺/);
    assert.doesNotMatch(chatgptPrompt, /捏造的假資訊/);
    assert.doesNotMatch(chatgptPrompt, /捏造數據/);
    assert.doesNotMatch(chatgptPrompt, /不存在的事件/);
    assert.doesNotMatch(geminiPrompt, /遊戲內鬼任務/);
  });
});

test("imposter mode can run with no imposter assigned", () => {
  withMockedRandom(0.75, () => {
    const engine = new DebateEngine(["chatgpt", "gemini"], "chatgpt", 1, {
      interactionStyle: "imposter",
    });

    const jobs = engine.start("空城計測試");

    assert.equal(engine.snapshot().imposterProvider, null);
    assert.equal(engine.snapshot().debateRounds, 2);
    assert.ok(jobs.every((job) => !/遊戲內鬼任務/.test(job.prompt)));
  });
});

test("imposter mode delays accusations until the final critique round", () => {
  withMockedRandom([0.25, 0], () => {
    const engine = new DebateEngine(["chatgpt", "gemini"], "chatgpt", 1, {
      interactionStyle: "imposter",
    });
    engine.start("延後指認測試");
    engine.recordAnswer("chatgpt", "回答 A");
    engine.recordAnswer("gemini", "回答 B");

    const firstCritiqueJobs = engine.buildCritiqueJobs(1);
    const firstPrompt = firstCritiqueJobs.find((job) => job.provider === "chatgpt").prompt;
    assert.match(firstPrompt, /第一輪先不要指認/);
    assert.match(firstPrompt, /釐清前提|追問/);
    assert.doesNotMatch(firstPrompt, /誰最像內鬼/);
    assert.doesNotMatch(firstPrompt, /沒有內鬼/);

    firstCritiqueJobs.forEach((job) => engine.recordCritique(job.provider, `${job.provider} critique 1`, 1));
    const finalCritiqueJobs = engine.buildCritiqueJobs(2);
    const finalPrompt = finalCritiqueJobs.find((job) => job.provider === "chatgpt").prompt;
    assert.match(finalPrompt, /最後判斷/);
    assert.match(finalPrompt, /沒有內鬼/);
    assert.match(finalPrompt, /誰最像內鬼/);
  });
});

test("anonymous imposter prompt keeps anonymous name instructions first", () => {
  withMockedRandom([0.25, 0], () => {
    const engine = new DebateEngine(["chatgpt", "gemini"], "chatgpt", 1, {
      interactionStyle: "imposter",
      summaryStrategy: "anonymousReview",
    });

    const jobs = engine.start("匿名抓內鬼測試");
    const chatgptPrompt = jobs.find((job) => job.provider === "chatgpt").prompt;

    assert.match(chatgptPrompt, /^現在是化裝舞會/m);
    assert.match(chatgptPrompt, /暱稱：<你的暱稱>/);
    assert.match(chatgptPrompt, /不要求你否認真實身份/);
    assert.match(chatgptPrompt, /遊戲內鬼任務/);
  });
});

test("observer chair strategy stores the resolved chair without adding it to debate jobs", () => {
  const engine = new DebateEngine(["gemini", "grok"], "chatgpt", 1, {
    summaryStrategy: "observerChair",
    resolvedSummaryProvider: "chatgpt",
  });

  const firstRoundJobs = engine.start("主席不要下場");
  firstRoundJobs.forEach((job) => engine.recordAnswer(job.provider, `${job.provider} answer`));
  const critiqueJobs = engine.buildCritiqueJobs(1);
  critiqueJobs.forEach((job) => engine.recordCritique(job.provider, `${job.provider} critique`, job.round));
  const finalJob = engine.buildFinalJob();
  const snapshot = engine.snapshot();
  const restored = DebateEngine.restore(snapshot);

  assert.deepEqual(firstRoundJobs.map((job) => job.provider), ["gemini", "grok"]);
  assert.equal(finalJob.provider, "chatgpt");
  assert.equal(snapshot.summaryStrategy, "observerChair");
  assert.equal(snapshot.resolvedSummaryProvider, "chatgpt");
  assert.equal(restored.snapshot().resolvedSummaryProvider, "chatgpt");
});

test("anonymous review strategy parses names from first answers and hides real labels in final prompt", () => {
  const engine = new DebateEngine(["chatgpt", "gemini"], "chatgpt", 1, {
    summaryStrategy: "anonymousReview",
    resolvedSummaryProvider: "chatgpt",
  });

  const firstRoundJobs = engine.start("匿名測試");
  assert.match(firstRoundJobs[0].prompt, /暱稱：<你的暱稱>/);

  engine.recordAnswer("chatgpt", "暱稱：焦糖雲朵\n我支持 A");
  engine.recordAnswer("gemini", "暱稱：星星果凍\n我支持 B");
  engine.buildCritiqueJobs(1);
  engine.recordCritique("chatgpt", "我不同意對方", 1);
  engine.recordCritique("gemini", "我補充另一點", 1);

  const finalJob = engine.buildFinalJob();
  const snapshot = engine.snapshot();

  assert.deepEqual(snapshot.anonymousNames, {
    chatgpt: "焦糖雲朵",
    gemini: "星星果凍",
  });
  assert.match(finalJob.prompt, /^焦糖雲朵:/m);
  assert.match(finalJob.prompt, /^星星果凍:/m);
  assert.doesNotMatch(finalJob.prompt, /^ChatGPT:/m);
  assert.doesNotMatch(finalJob.prompt, /^Gemini:/m);
  assert.equal(DebateEngine.restore(snapshot).snapshot().anonymousNames.gemini, "星星果凍");
});

test("anonymous review strategy uses fallback labels when a first answer errors", () => {
  const engine = new DebateEngine(["chatgpt", "gemini"], "chatgpt", 1, {
    summaryStrategy: "anonymousReview",
    resolvedSummaryProvider: "chatgpt",
  });

  engine.start("匿名錯誤測試");
  engine.recordAnswer("chatgpt", "暱稱：焦糖雲朵\n我支持 A");
  engine.markProviderError("gemini", "first-round", "timeout");
  engine.buildCritiqueJobs(1);
  engine.recordCritique("chatgpt", "我補充", 1);
  engine.recordCritique("gemini", "錯誤後補評", 1);

  const finalJob = engine.buildFinalJob();

  assert.match(finalJob.prompt, /^焦糖雲朵:/m);
  assert.match(finalJob.prompt, /^星星果凍:/m);
  assert.doesNotMatch(finalJob.prompt, /^ChatGPT:/m);
  assert.doesNotMatch(finalJob.prompt, /^Gemini:/m);
});
