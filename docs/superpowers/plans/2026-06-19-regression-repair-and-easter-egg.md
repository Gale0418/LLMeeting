# LLMeeting Regression Repair And Easter Egg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修復 0.4.0 RC 後的狀態、取消、授權、動態回合與 Gemini 送出回歸，並完成 Free badge 1、3、5 點擊彩蛋。

**Architecture:** 讓 `DebateEngine` snapshot 成為可恢復的會議真實來源，以小型 `RunController` 隔離舊新異步任務，並將 Gemini 送出確認抽成 DOM 無關的可測流程。UI 與 background 共用同一 entitlement feature ID；互動插話以所屬回合的 `USER` 欄位為單一來源。

**Tech Stack:** Chrome Extension Manifest V3、JavaScript ES modules/IIFE content scripts、Node.js `node:test`、`chrome.storage.local`、`chrome.runtime`/`chrome.tabs` messaging。

---

## File Map

- Create `src/background/runController.js`: 產生及使舊 run token 失效。
- Create `src/background/sessionRecovery.js`: 以純函式決定 stored runtime state 如何恢復。
- Create `tests/runController.test.mjs`: run token 取消與隔離測試。
- Create `tests/sessionRecovery.test.mjs`: waiting/running/corrupt snapshot 恢復測試。
- Modify `src/background/debateEngine.js`: snapshot 設定、restore、動態輪號、`USER` 單一來源。
- Modify `src/background/service-worker.js`: entitlement gate、session recovery、run token 檢查與送出診斷。
- Modify `src/content/automation-core.js`: provider artifact 清理與可測送出確認流程。
- Modify `src/content/provider-page.js`: Gemini composer 優先 selector、送出後確認及一次性 Enter 補送。
- Modify `src/shared/entitlements.js`: `chatMode` Free/Pro 能力。
- Modify `src/shared/prompts.js`: 維持核准 interaction prompt API 與插話總結。
- Modify `src/sidepanel/app.js`: chat/theater gate 與從回合 `USER` 渲染插話。
- Modify `src/sidepanel/dev-unlock.js`: 1、3、5 次彩蛋及可注入對話、亂數、開連結 API。
- Modify tests under `tests/`: 更新過期斷言，增加每個修復的回歸測試。

## Official References

- Chrome extension worker 會被終止，全域變數會遺失：<https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle>
- One-time messaging 傳遞 JSON-serializable 訊息，非同步 `sendResponse` 必須保持 channel：<https://developer.chrome.com/docs/extensions/develop/concepts/messaging>
- MV3 worker 應在處理事件前從 `chrome.storage` 非同步載入狀態：<https://developer.chrome.com/docs/extensions/reference/api/storage>

### Task 1: Restore A Green Baseline Contract

**Files:**
- Modify: `tests/prompts.test.mjs`
- Modify: `tests/debateEngine.test.mjs`
- Modify: `tests/serviceWorkerSafety.test.mjs`

- [ ] **Step 1: Update stale prompt imports and assertions**

Replace `buildCritiquePrompt` with the production API and assert the approved wording:

```js
import {
  buildConversationSummaryPrompt,
  buildFinalSummaryPrompt,
  buildInteractionPrompt,
} from "../src/shared/prompts.js";

const prompt = buildInteractionPrompt({
  recipient: "chatgpt",
  roundNumber: 2,
  previousCritiques: {
    chatgpt: "我認為散射是核心。",
    gemini: "GPT 需要更白話。",
    grok: "大家都漏了波長。",
  },
  activeProviders: ["chatgpt", "gemini", "grok"],
});

assert.match(prompt, /第 2 輪對話/);
assert.match(prompt, /上一輪對話/);
```

- [ ] **Step 2: Update the multi-round engine wording assertion**

```js
assert.match(
  secondCritiqueJobs.find((item) => item.provider === "chatgpt").prompt,
  /上一輪對話/,
);
```

- [ ] **Step 3: Accept constructor options in the service-worker safety test**

```js
assert.match(
  script,
  /new DebateEngine\(activeProviders, summaryProvider, debateRounds, \{/,
);
```

- [ ] **Step 4: Run the baseline suite**

Run: `npm test`

Expected: 57 tests pass, 0 fail, exit code 0. The previous 54 count included one file-load failure instead of the four prompt tests.

- [ ] **Step 5: Commit the baseline contract**

```powershell
git add tests/prompts.test.mjs tests/debateEngine.test.mjs tests/serviceWorkerSafety.test.mjs
git commit -m "test: align interaction prompt contracts"
```

### Task 2: Make DebateEngine Dynamic And Restorable

**Files:**
- Modify: `tests/debateEngine.test.mjs`
- Modify: `src/background/debateEngine.js`

- [ ] **Step 1: Write failing restore and sixth-round tests**

Append tests that use real engine state:

```js
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
  const round = restored.addChatRound("使用者補充");
  const jobs = restored.buildUserMessageJobs("使用者補充", round);

  assert.equal(restored.summaryProvider, "gemini");
  assert.equal(jobs[0].round, 2);
  assert.match(jobs[0].prompt, /使用者補充/);
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
  assert.throws(() => engine.recordCritique("chatgpt", "bad", 2), /Unknown critique round: 2/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/debateEngine.test.mjs`

Expected: FAIL because `DebateEngine.restore` does not exist and round 6 is clamped to 5.

- [ ] **Step 3: Store session configuration in every snapshot**

Add one state factory and use it from the constructor and `start()`:

```js
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
```

The constructor assigns `this.state = createEngineState(this)`. `start()` assigns a new state with `phase`, `originalQuestion`, `status`, and a new optional `imposterProvider`; do not re-add `userMessages`.

- [ ] **Step 4: Add strict dynamic round parsing and restore**

```js
function parseExistingRound(value, roundCount) {
  const round = Number.parseInt(value, 10);
  if (!Number.isInteger(round) || round < 1 || round > roundCount) {
    throw new Error(`Unknown critique round: ${value}`);
  }
  return round;
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
    },
  );
  engine.debateRounds = state.critiqueRounds.length;
  engine.state = {
    ...state,
    debateRounds: engine.debateRounds,
    critiques: state.critiqueRounds[0] || emptyProviderMap(engine.activeProviders),
  };
  return engine;
}
```

Use `parseExistingRound()` in `recordCritique()`, `buildCritiqueJobs()`, and `buildUserMessageJobs()`. Change `critiqueRoundFromPhase()` to parse the positive integer without calling `normalizeDebateRounds()`.

- [ ] **Step 5: Make `USER` the only new insertion source**

```js
addChatRound(userText = null) {
  const newCritiqueRound = emptyProviderMap(this.activeProviders);
  if (normalizeText(userText)) {
    newCritiqueRound.USER = normalizeText(userText);
  }
  this.state.critiqueRounds.push(newCritiqueRound);
  this.debateRounds = this.state.critiqueRounds.length;
  this.state.debateRounds = this.debateRounds;
  return this.debateRounds;
}
```

- [ ] **Step 6: Run GREEN**

Run: `node --test tests/debateEngine.test.mjs`

Expected: all engine tests pass.

- [ ] **Step 7: Commit engine state repair**

```powershell
git add src/background/debateEngine.js tests/debateEngine.test.mjs
git commit -m "fix: restore interactive debate sessions"
```

### Task 3: Enforce Chat Mode Entitlements At Both Boundaries

**Files:**
- Modify: `tests/entitlements.test.mjs`
- Modify: `tests/diagnostics.test.mjs`
- Modify: `tests/serviceWorkerSafety.test.mjs`
- Modify: `src/shared/entitlements.js`
- Modify: `src/sidepanel/app.js`
- Modify: `src/background/service-worker.js`

- [ ] **Step 1: Write failing entitlement and wiring assertions**

```js
assert.equal(canUseFeature(free, "chatMode"), false);
assert.equal(canUseFeature(pro, "chatMode"), true);
assert.equal(featureLabel("chatMode"), "自由群聊與劇場模式");
```

Add source safety assertions:

```js
assert.match(app, /chat: "chatMode"/);
assert.match(app, /theater: "chatMode"/);
assert.match(script, /async function startChatDebate\([^)]*\) \{\s+await requireProFeature\("chatMode"\)/);
assert.match(script, /async function startTheaterDebate\([^)]*\) \{\s+await requireProFeature\("chatMode"\)/);
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/entitlements.test.mjs tests/diagnostics.test.mjs tests/serviceWorkerSafety.test.mjs`

Expected: FAIL because `chatMode` is absent and chat/theater are not gated.

- [ ] **Step 3: Add the shared feature**

```js
const FEATURE_LABELS = {
  basicDebate: "基礎辯論",
  fastDebate: "快速鬥技場",
  summaryDebate: "總結辯論",
  chatMode: "自由群聊與劇場模式",
  history: "歷史紀錄",
  export: "匯出",
};
```

Set `chatMode: false` in `PLAN_FEATURES.free` and `chatMode: true` in `PLAN_FEATURES.pro`.

- [ ] **Step 4: Wire UI and background gates**

```js
function featureForMode(mode) {
  return {
    fast: "fastDebate",
    summary: "summaryDebate",
    chat: "chatMode",
    theater: "chatMode",
  }[mode] || "";
}
```

At the first line of both background start functions:

```js
await requireProFeature("chatMode");
```

- [ ] **Step 5: Run GREEN**

Run: `node --test tests/entitlements.test.mjs tests/diagnostics.test.mjs tests/serviceWorkerSafety.test.mjs`

Expected: all selected tests pass.

- [ ] **Step 6: Commit the entitlement repair**

```powershell
git add src/shared/entitlements.js src/sidepanel/app.js src/background/service-worker.js tests/entitlements.test.mjs tests/diagnostics.test.mjs tests/serviceWorkerSafety.test.mjs
git commit -m "fix: enforce chat mode entitlements"
```

### Task 4: Recover Stored Sessions And Reject Stale Runs

**Files:**
- Create: `src/background/runController.js`
- Create: `src/background/sessionRecovery.js`
- Create: `tests/runController.test.mjs`
- Create: `tests/sessionRecovery.test.mjs`
- Modify: `tests/serviceWorkerSafety.test.mjs`
- Modify: `src/background/service-worker.js`

- [ ] **Step 1: Write failing run-controller tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { RunController } from "../src/background/runController.js";

test("starting a new run invalidates the prior token", () => {
  const controller = new RunController();
  const first = controller.start();
  const second = controller.start();
  assert.equal(controller.isCurrent(first), false);
  assert.equal(controller.isCurrent(second), true);
});

test("cancel invalidates the active token", () => {
  const controller = new RunController();
  const token = controller.start();
  controller.cancel();
  assert.throws(() => controller.assertCurrent(token), /Run is no longer active/);
});
```

- [ ] **Step 2: Write failing session-recovery tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { recoverRuntimeSession } from "../src/background/sessionRecovery.js";

const idle = () => ({ busy: false, status: "idle", phase: "idle", errors: [] });

test("waiting sessions restore their engine", () => {
  const stored = { busy: false, status: "waiting_for_user", phase: "waiting_for_user", transcript: { id: 1 } };
  const restoredEngine = { restored: true };
  const result = recoverRuntimeSession(stored, {
    createIdleState: idle,
    restoreEngine: () => restoredEngine,
  });
  assert.equal(result.engine, restoredEngine);
  assert.equal(result.state.status, "waiting_for_user");
});

test("interrupted running sessions become readable errors", () => {
  const stored = { busy: true, status: "running", phase: "critique", errors: [] };
  const result = recoverRuntimeSession(stored, { createIdleState: idle, restoreEngine: () => null });
  assert.equal(result.engine, null);
  assert.equal(result.state.busy, false);
  assert.equal(result.state.status, "error");
  assert.match(result.state.message, /service worker/);
});

test("corrupt waiting snapshots return to idle with diagnostics", () => {
  const stored = { busy: false, status: "waiting_for_user", phase: "waiting_for_user", errors: [] };
  const result = recoverRuntimeSession(stored, {
    createIdleState: idle,
    restoreEngine: () => { throw new Error("bad snapshot"); },
  });
  assert.equal(result.state.status, "idle");
  assert.match(result.state.message, /無法恢復/);
});
```

- [ ] **Step 3: Run RED**

Run: `node --test tests/runController.test.mjs tests/sessionRecovery.test.mjs`

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement `RunController`**

```js
export class RunController {
  #generation = 0;

  start() {
    this.#generation += 1;
    return this.#generation;
  }

  cancel() {
    this.#generation += 1;
  }

  isCurrent(token) {
    return token === this.#generation;
  }

  assertCurrent(token) {
    if (!this.isCurrent(token)) {
      const error = new Error("Run is no longer active");
      error.code = "RUN_CANCELLED";
      throw error;
    }
  }
}
```

- [ ] **Step 5: Implement session recovery**

```js
export function recoverRuntimeSession(storedState, { createIdleState, restoreEngine }) {
  if (!storedState) return { state: createIdleState(), engine: null };
  if (storedState.busy || storedState.status === "running") {
    return {
      engine: null,
      state: {
        ...storedState,
        busy: false,
        status: "error",
        phase: "done",
        message: "service worker 曾在作業中重啟，請重新開始辯論",
        errors: [...(storedState.errors || []), { message: "service worker interrupted active run" }],
      },
    };
  }
  if (storedState.status !== "waiting_for_user") {
    return { state: storedState, engine: null };
  }
  try {
    return { state: storedState, engine: restoreEngine(storedState.transcript) };
  } catch (error) {
    return {
      engine: null,
      state: {
        ...createIdleState(storedState.activeProviders),
        message: `無法恢復上次辯論：${error.message}`,
        errors: [{ message: error.message }],
      },
    };
  }
}
```

- [ ] **Step 6: Run module tests GREEN**

Run: `node --test tests/runController.test.mjs tests/sessionRecovery.test.mjs`

Expected: all selected tests pass.

- [ ] **Step 7: Add failing service-worker wiring assertions**

```js
assert.match(script, /new RunController\(\)/);
assert.match(script, /runController\.cancel\(\)/);
assert.match(script, /runController\.assertCurrent\(runToken\)/);
assert.match(script, /recoverRuntimeSession/);
assert.doesNotMatch(script, /let isAborted = false/);
```

Run: `node --test tests/serviceWorkerSafety.test.mjs`

Expected: FAIL because service-worker wiring is absent.

- [ ] **Step 8: Integrate recovery before event work**

At module scope:

```js
const runController = new RunController();
let engine = new DebateEngine();
let runtimeState = createIdleState();
let runtimeInitialized = false;

async function ensureRuntimeInitialized() {
  if (runtimeInitialized) return;
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const recovered = recoverRuntimeSession(stored?.[STORAGE_KEY], {
    createIdleState,
    restoreEngine: (snapshot) => DebateEngine.restore(snapshot),
  });
  runtimeState = recovered.state;
  if (recovered.engine) engine = recovered.engine;
  runtimeInitialized = true;
}
```

Every async start/get-state/next-round handler calls `await ensureRuntimeInitialized()` before reading globals. Reset sets `runtimeInitialized = true` after replacing state and engine.

- [ ] **Step 9: Thread run tokens through every mutating async path**

Use this guard around state writes after awaits:

```js
function requireCurrentRun(runToken) {
  runController.assertCurrent(runToken);
}

async function publishRunState(runToken) {
  requireCurrentRun(runToken);
  await publishState();
  requireCurrentRun(runToken);
}
```

On start and next-round, create `const runToken = runController.start()` and pass it through start functions, `runDebateRounds`, provider job runners, `submitProviderJob`, `collectProviderJob`, `sendJob`, and diagnostic updates. Check immediately before and after every awaited provider call and before `recordProviderResult()`.

On stop/reset call `runController.cancel()`. When a caught error has `code === "RUN_CANCELLED"`, respond with the current state without publishing an error state. Remove `isAborted` and its checks.

- [ ] **Step 10: Run service-worker and full tests GREEN**

Run: `node --test tests/serviceWorkerSafety.test.mjs tests/runController.test.mjs tests/sessionRecovery.test.mjs`

Expected: all selected tests pass.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 11: Commit worker lifecycle repair**

```powershell
git add src/background/runController.js src/background/sessionRecovery.js src/background/service-worker.js tests/runController.test.mjs tests/sessionRecovery.test.mjs tests/serviceWorkerSafety.test.mjs
git commit -m "fix: isolate and restore debate runs"
```

### Task 5: Align User Messages And Provider Artifacts

**Files:**
- Modify: `tests/pageAutomation.test.mjs`
- Modify: `tests/diagnostics.test.mjs`
- Modify: `src/content/automation-core.js`
- Modify: `src/content/provider-page.js`
- Modify: `src/sidepanel/app.js`

- [ ] **Step 1: Write failing provider-normalization tests**

Import `normalizeProviderResponse` from the global automation core and add:

```js
test("only removes Gemini standalone image artifact", () => {
  assert.equal(normalizeProviderResponse("gemini", "回答內容\nimage"), "回答內容");
  assert.equal(normalizeProviderResponse("gemini", "This is an image"), "This is an image");
  assert.equal(normalizeProviderResponse("chatgpt", "回答內容\nimage"), "回答內容\nimage");
});
```

Add UI source assertions:

```js
assert.match(app, /const userMessage = critiques\.USER/);
assert.doesNotMatch(app, /transcript\.userMessages\?\./);
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/pageAutomation.test.mjs tests/diagnostics.test.mjs`

Expected: FAIL because the normalizer and `USER` rendering are absent.

- [ ] **Step 3: Implement provider-specific normalization**

```js
function normalizeProviderResponse(providerId, text) {
  const normalized = String(text || "").trim();
  if (providerId !== "gemini") return normalized;
  return normalized.replace(/(?:\r?\n)image\s*$/i, "").trim();
}
```

Expose it on `globalThis.aiDebateAutomationCore`. Change `readAssistantSnapshot(config)` to `readAssistantSnapshot(providerId, config)` and apply `normalizeProviderResponse(providerId, text)`. Thread `providerId` through `submitPrompt()`, `readSubmittedResponse()`, `readLastAssistantMessage()`, and `waitForCompletion()` so every snapshot call receives the provider explicitly.

- [ ] **Step 4: Render insertion from its round**

```js
const userMessage = critiques.USER;
```

Remove the indexed `transcript.userMessages?.[roundNumber - 1]` read. Keep provider iteration unchanged so the `USER` property is not rendered as an AI provider.

- [ ] **Step 5: Run GREEN**

Run: `node --test tests/pageAutomation.test.mjs tests/diagnostics.test.mjs`

Expected: all selected tests pass.

- [ ] **Step 6: Commit alignment fixes**

```powershell
git add src/content/automation-core.js src/content/provider-page.js src/sidepanel/app.js tests/pageAutomation.test.mjs tests/diagnostics.test.mjs
git commit -m "fix: align interaction messages and artifacts"
```

### Task 6: Confirm Gemini Submission Without Duplicate Prompts

**Files:**
- Modify: `tests/pageAutomation.test.mjs`
- Modify: `tests/contentSafety.test.mjs`
- Modify: `src/content/automation-core.js`
- Modify: `src/content/provider-page.js`
- Modify: `src/background/service-worker.js`

- [ ] **Step 1: Write failing pure submission-flow tests**

Expose and test an async `ensurePromptSubmitted` helper:

```js
test("confirmed button submission does not press Enter", async () => {
  let enterCount = 0;
  const result = await ensurePromptSubmitted({
    clickSend: async () => {},
    pressEnter: async () => { enterCount += 1; },
    observeSubmission: async () => ({ confirmed: true, evidence: "input-cleared", promptPresent: false }),
  });
  assert.deepEqual(result, { method: "button", evidence: "input-cleared", retried: false });
  assert.equal(enterCount, 0);
});

test("unconfirmed Gemini click falls back to Enter exactly once while prompt remains", async () => {
  let observations = 0;
  let enterCount = 0;
  const result = await ensurePromptSubmitted({
    clickSend: async () => {},
    pressEnter: async () => { enterCount += 1; },
    observeSubmission: async () => {
      observations += 1;
      return observations === 1
        ? { confirmed: false, evidence: "", promptPresent: true }
        : { confirmed: true, evidence: "generation-started", promptPresent: false };
    },
  });
  assert.deepEqual(result, { method: "enter", evidence: "generation-started", retried: true });
  assert.equal(enterCount, 1);
});

test("unconfirmed submission fails instead of registering a run", async () => {
  await assert.rejects(
    ensurePromptSubmitted({
      clickSend: async () => {},
      pressEnter: async () => {},
      observeSubmission: async () => ({ confirmed: false, evidence: "", promptPresent: true }),
    }),
    /Gemini 未確認送出/,
  );
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/pageAutomation.test.mjs`

Expected: FAIL because `ensurePromptSubmitted` is missing.

- [ ] **Step 3: Implement the DOM-independent confirmation flow**

```js
async function ensurePromptSubmitted({ clickSend, pressEnter, observeSubmission }) {
  await clickSend();
  let observation = await observeSubmission();
  if (observation.confirmed) {
    return { method: "button", evidence: observation.evidence, retried: false };
  }
  if (!observation.promptPresent) {
    throw new Error("Gemini 未確認送出");
  }
  await pressEnter();
  observation = await observeSubmission();
  if (!observation.confirmed) {
    throw new Error("Gemini 未確認送出");
  }
  return { method: "enter", evidence: observation.evidence, retried: true };
}
```

Expose it on `globalThis.aiDebateAutomationCore`.

- [ ] **Step 4: Add failing source safety assertions**

```js
assert.match(script, /ensurePromptSubmitted/);
assert.match(script, /observeSubmission/);
assert.match(script, /submittedRuns\.set[\s\S]*submission/);
assert.match(script, /"button\.send-button"[\s\S]*"button\[type='submit'\]"/);
```

Run: `node --test tests/contentSafety.test.mjs`

Expected: FAIL until provider-page is wired.

- [ ] **Step 5: Prefer Gemini-specific and nearest-composer buttons**

Order Gemini selectors from specific to broad:

```js
sendSelectors: [
  "button.send-button",
  "button[aria-label*='Send message']",
  "button[aria-label*='Send']",
  "button[aria-label*='送出']",
  "button[type='submit']",
],
```

Add `findSendButton(config, input)` that walks from `input.parentElement` toward `document.body`, returning the first enabled visible candidate in the nearest ancestor before falling back to document-wide matching. Apply the new confirmation/retry flow only when `providerId === "gemini"`; preserve the existing single click-or-Enter path for ChatGPT, Grok, and Claude.

- [ ] **Step 6: Add observable submission checks**

Capture a user-message snapshot before writing. After click, poll for up to 4 seconds and return:

```js
{
  confirmed: inputCleared || generating || userMessageChanged,
  evidence: inputCleared
    ? "input-cleared"
    : generating
      ? "generation-started"
      : userMessageChanged
        ? "user-message-added"
        : "",
  promptPresent,
}
```

Only call `submittedRuns.set()` after `ensurePromptSubmitted()` resolves. Return `submission: { method, evidence, retried }` to background. Record these three small fields in provider diagnostics; never store full prompt content in diagnostics.

- [ ] **Step 7: Run GREEN**

Run: `node --test tests/pageAutomation.test.mjs tests/contentSafety.test.mjs`

Expected: all selected tests pass.

- [ ] **Step 8: Commit Gemini reliability repair**

```powershell
git add src/content/automation-core.js src/content/provider-page.js src/background/service-worker.js tests/pageAutomation.test.mjs tests/contentSafety.test.mjs
git commit -m "fix: verify Gemini prompt submission"
```

### Task 7: Implement The 1-3-5 Free Badge Easter Egg

**Files:**
- Modify: `tests/devUnlock.test.mjs`
- Modify: `src/sidepanel/dev-unlock.js`

- [ ] **Step 1: Replace static-only tests with behavioral fakes**

Create a minimal fake badge and injected APIs:

```js
class FakeBadge {
  #listener;
  addEventListener(_type, listener) { this.#listener = listener; }
  async click() { await this.#listener(); }
}

function createHarness({ plan = "free", random = 0 } = {}) {
  const alerts = [];
  const confirms = [];
  const opened = [];
  const badge = new FakeBadge();
  badge.textContent = plan === "pro" ? "Pro" : "Free";
  const storage = {
    async get() { return { "aiDebate.entitlementPlan": plan }; },
    async set(value) { plan = value["aiDebate.entitlementPlan"]; },
  };
  attachDevUnlock({
    planBadge: badge,
    storage,
    showAlert: (message) => alerts.push(message),
    showConfirm: (message) => { confirms.push(message); return true; },
    openUrl: (url) => opened.push(url),
    random: () => random,
    getDisplayedPlan: () => badge.textContent.toLowerCase(),
    setTimer: () => 1,
    clearTimer: () => {},
  });
  return { badge, alerts, confirms, opened, getPlan: () => plan };
}
```

Add tests for click 1 exact text, clicks 2/4 silence, click 3 selecting index 0 and 9, click 5 toggling Pro and showing/opening the YouTube URL, and Pro-to-Free clicks having no Free taunts.

- [ ] **Step 2: Run RED**

Run: `node --test tests/devUnlock.test.mjs`

Expected: FAIL because dependencies and staged dialogs are not implemented.

- [ ] **Step 3: Implement injectable dependencies and taunts**

```js
export const THIRD_CLICK_TAUNTS = [
  "你還真的繼續按嗎？",
  "都說沒用了，怎麼就是不信呢？",
  "這不是電梯，多按不會比較快。",
  "你的好奇心正在消耗滑鼠壽命。",
  "第三次了，理智還在線嗎？",
  "我有說沒用，你偏要做壓力測試。",
  "你是在測按鈕，還是在測我的耐心？",
  "這麼執著，該不會真期待彩蛋吧？",
  "好啦，什麼都沒發生，真的喔。",
  "再按下去也不會有驚喜……大概。",
];

const YOUTUBE_URL = "https://www.youtube.com/@gale0418";
```

`attachDevUnlock()` accepts defaults for `storage`, `showAlert`, `showConfirm`, `openUrl`, `random`, `getDisplayedPlan`, `setTimer`, and `clearTimer`. Use synchronous `getDisplayedPlan()` for click 1/3 taunts so rapid click handlers cannot reorder asynchronous storage reads; use storage as the authoritative plan only on click 5. While Free, show the exact first-click text and use:

```js
const index = Math.min(
  THIRD_CLICK_TAUNTS.length - 1,
  Math.max(0, Math.floor(random() * THIRD_CLICK_TAUNTS.length)),
);
```

On fifth-click Pro unlock, include `YOUTUBE_URL` literally in the confirm message and call `openUrl(YOUTUBE_URL)` only when confirmed. Preserve five-click Pro-to-Free toggling without click 1/3 taunts.

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/devUnlock.test.mjs`

Expected: all dev-unlock tests pass.

- [ ] **Step 5: Commit the easter egg**

```powershell
git add src/sidepanel/dev-unlock.js tests/devUnlock.test.mjs
git commit -m "feat: expand Free badge easter egg"
```

### Task 8: Remove Whitespace Debt And Verify The Release Candidate

**Files:**
- Modify only changed source/test files that contain trailing whitespace.
- Modify: `MissionCenter/project.md`
- Modify: `MissionCenter/progress.md`
- Modify: `MissionCenter/tasks.md`
- Modify: `MissionCenter/smoke-tests.md`
- Modify: `MissionCenter/notes.md`

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: exit 0, all tests pass, 0 fail.

- [ ] **Step 2: Run syntax checks on every changed JavaScript file**

Run each command separately:

```powershell
node --check src/background/debateEngine.js
node --check src/background/runController.js
node --check src/background/sessionRecovery.js
node --check src/background/service-worker.js
node --check src/content/automation-core.js
node --check src/content/provider-page.js
node --check src/shared/entitlements.js
node --check src/shared/prompts.js
node --check src/sidepanel/app.js
node --check src/sidepanel/dev-unlock.js
```

Expected: every command exits 0 with no syntax output.

- [ ] **Step 3: Remove all trailing whitespace in the reviewed range**

Run: `git diff --check d12bca6..HEAD`

Expected before cleanup: the previously recorded 10 trailing-whitespace errors.

Remove only reported trailing spaces, then run: `git diff --check d12bca6..HEAD`

Expected after cleanup: exit 0 with no output.

- [ ] **Step 4: Build and inspect the store package**

Run: `npm run package`

Expected: exit 0 and `dist\llmeeting-0.4.0.zip` is written.

Run: `tar -tf dist\llmeeting-0.4.0.zip`

Expected: entries are limited to `manifest.json`, `assets/`, and `src/`; `src/sidepanel/dev-unlock.js` is included.

- [ ] **Step 5: Record smoke-test evidence and task completion**

Update MissionCenter in Traditional Chinese with the exact test count, syntax results, diff-check result, package size/content, and residual manual Chrome checks. Mark LLM-T17 through LLM-T19 `Done` only if their automated smoke tests pass; otherwise leave the failing task `Blocked` with the exact command and failure.

- [ ] **Step 6: Review the final diff**

Run:

```powershell
git status --short
git diff --stat
git diff -- src tests MissionCenter
```

Expected: only planned source, test, and MissionCenter files are changed; no generated zip is tracked.

- [ ] **Step 7: Commit verification and task records**

```powershell
git add src tests MissionCenter
git commit -m "chore: verify 0.4.0 regression repairs"
```
