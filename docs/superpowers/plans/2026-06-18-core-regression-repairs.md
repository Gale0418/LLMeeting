# Core Regression Repairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修復 LLMeeting 大改後的測試、狀態恢復、取消競態、Pro 邊界、動態回合、插話對齊與 provider 資料清理回歸。

**Architecture:** `DebateEngine` snapshot 成為可恢復的會議真實狀態；小型 `RunController` 提供單調 token，阻止舊異步任務改寫新狀態。初始 1至5 輪與互動動態輪數分開驗證，前後端共用 `chatMode` entitlement。

**Tech Stack:** Chrome Extension Manifest V3、JavaScript ES modules、Node.js `node:test`、`chrome.storage.local`

---

## File Map

- Create: `src/background/runController.js` - 管理執行 token 與 stale-run 錯誤。
- Create: `tests/runController.test.mjs` - 驗證 stop/reset/new-run 失效舊 token。
- Modify: `src/background/debateEngine.js` - 可恢復 snapshot 與動態輪號驗證。
- Modify: `src/background/service-worker.js` - 恢復 engine、整合 run token、補 background Pro gate。
- Modify: `src/shared/entitlements.js` - 新增 `chatMode`。
- Modify: `src/shared/prompts.js` - 保持 `buildInteractionPrompt` 公開 API 與現行文案。
- Modify: `src/content/automation-core.js` - provider-specific 回覆 artifact 清理。
- Modify: `src/content/provider-page.js` - 傳入 provider ID 進行 artifact 清理。
- Modify: `src/sidepanel/app.js` - `chatMode` gate、實際回合取值、`USER` 插話顯示。
- Modify: `tests/debateEngine.test.mjs` - restore、第 6 輪、非法跳輪。
- Modify: `tests/entitlements.test.mjs` - `chatMode` Free/Pro 邊界。
- Modify: `tests/prompts.test.mjs` - 對齊 `buildInteractionPrompt`。
- Modify: `tests/pageAutomation.test.mjs` - provider artifact 清理。
- Modify: `tests/serviceWorkerSafety.test.mjs` - restore、run token、background gate 靜態安全檢查。
- Modify: `tests/diagnostics.test.mjs` - `chat`/`theater` UI gate 與 `USER` 來源。

### Task 1: Restore the Current Test Baseline

**Files:**
- Modify: `tests/prompts.test.mjs`
- Modify: `tests/debateEngine.test.mjs`
- Modify: `tests/serviceWorkerSafety.test.mjs`

- [ ] **Step 1: Update stale prompt imports and expectations**

Replace `buildCritiquePrompt` with `buildInteractionPrompt` in `tests/prompts.test.mjs`, and change the second-round wording assertions in both prompt and engine tests:

```js
import {
  buildConversationSummaryPrompt,
  buildFinalSummaryPrompt,
  buildInteractionPrompt,
} from "../src/shared/prompts.js";

assert.match(prompt, /上一輪對話/);
```

- [ ] **Step 2: Update the constructor safety assertion**

```js
assert.match(
  script,
  /new DebateEngine\(activeProviders, summaryProvider, debateRounds, \{/,
);
```

- [ ] **Step 3: Run the repaired baseline tests**

Run:

```powershell
node --test tests/prompts.test.mjs tests/debateEngine.test.mjs tests/serviceWorkerSafety.test.mjs
```

Expected: all selected tests pass; this step only aligns tests with the already-approved interaction API.

- [ ] **Step 4: Commit baseline test maintenance**

```powershell
git add tests/prompts.test.mjs tests/debateEngine.test.mjs tests/serviceWorkerSafety.test.mjs
git commit -m "test: align regression suite with interaction prompts"
```

### Task 2: Restore DebateEngine and Support Dynamic Rounds

**Files:**
- Modify: `tests/debateEngine.test.mjs`
- Modify: `src/background/debateEngine.js`

- [ ] **Step 1: Write failing restore and sixth-round tests**

Append tests with this structure:

```js
test("engine restores a waiting conversation from its snapshot", () => {
  const original = new DebateEngine(["chatgpt", "gemini"], "gemini", 1, {
    interactionStyle: "casual",
  });
  original.start("原始問題");
  original.recordAnswer("chatgpt", "GPT 回答");
  original.recordAnswer("gemini", "Gemini 回答");
  original.buildCritiqueJobs(1);
  original.recordCritique("chatgpt", "GPT 互動", 1);
  original.recordCritique("gemini", "Gemini 互動", 1);

  const restored = DebateEngine.restore(original.snapshot());
  const nextRound = restored.addChatRound("使用者插話");
  const jobs = restored.buildUserMessageJobs("使用者插話", nextRound);

  assert.equal(nextRound, 2);
  assert.equal(jobs[0].round, 2);
  assert.match(jobs[0].prompt, /使用者插話/);
  assert.equal(restored.snapshot().interactionStyle, "casual");
});

test("interactive rounds continue beyond the configured five-round limit", () => {
  const providers = ["chatgpt", "gemini"];
  const engine = new DebateEngine(providers, "chatgpt", 5);
  engine.start("原始問題");
  providers.forEach((id) => engine.recordAnswer(id, `${id} answer`));
  for (let round = 1; round <= 5; round += 1) {
    engine.buildCritiqueJobs(round);
    providers.forEach((id) => engine.recordCritique(id, `${id} round ${round}`, round));
  }

  const round = engine.addChatRound("第六輪插話");
  const jobs = engine.buildUserMessageJobs("第六輪插話", round);
  jobs.forEach((job) => engine.recordCritique(job.provider, "round six", job.round));

  assert.equal(round, 6);
  assert.deepEqual([...new Set(jobs.map((job) => job.round))], [6]);
  assert.doesNotThrow(() => engine.buildFinalJob());
});

test("engine rejects a dynamic round that does not exist", () => {
  const engine = new DebateEngine(["chatgpt", "gemini"]);
  engine.start("原始問題");
  assert.throws(() => engine.recordCritique("chatgpt", "bad", 2), /不存在的互動輪次/);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/debateEngine.test.mjs`

Expected: FAIL because `DebateEngine.restore` does not exist, sixth-round jobs report round 5, and invalid round 2 is silently clamped.

- [ ] **Step 3: Persist engine configuration in snapshots**

Add configuration fields to both constructor and `start()` state:

```js
const sessionConfig = {
  activeProviders: [...this.activeProviders],
  summaryProvider: this.summaryProvider,
  interactionStyle: this.interactionStyle,
  isTheaterMode: this.isTheaterMode,
  customPersonas: { ...this.customPersonas },
};

this.state = {
  ...sessionConfig,
  phase: "idle",
  // existing transcript fields
};
```

- [ ] **Step 4: Add strict dynamic-round validation**

```js
function existingRoundNumber(value, roundCount) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > roundCount) {
    throw new Error(`不存在的互動輪次: ${value}`);
  }
  return parsed;
}
```

Use it in `recordCritique()`, `buildCritiqueJobs()` and `buildUserMessageJobs()`. Keep `normalizeDebateRounds()` only in the constructor for the initial setting. Parse `critique-N` phases without applying the five-round clamp.

- [ ] **Step 5: Implement `DebateEngine.restore()`**

```js
static restore(snapshot, fallback = {}) {
  const source = JSON.parse(JSON.stringify(snapshot || {}));
  const activeProviders = source.activeProviders || fallback.activeProviders;
  const summaryProvider = source.summaryProvider || fallback.summaryProvider || "chatgpt";
  const critiqueRounds = Array.isArray(source.critiqueRounds) ? source.critiqueRounds : [];
  const roundCount = critiqueRounds.length;
  if (!Array.isArray(activeProviders) || activeProviders.length < 2 || roundCount < 1) {
    throw new Error("無法恢復辯論狀態");
  }

  const engine = new DebateEngine(activeProviders, summaryProvider, Math.min(roundCount, 5), {
    interactionStyle: source.interactionStyle || fallback.interactionStyle,
    isTheaterMode: source.isTheaterMode ?? fallback.isTheaterMode,
    customPersonas: source.customPersonas || fallback.customPersonas,
  });
  engine.debateRounds = roundCount;
  engine.state = source;
  engine.state.debateRounds = roundCount;
  engine.state.critiques = critiqueRounds[0];
  return engine;
}
```

Validate that `answers` is an object and every critique round is an object before assigning state.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `node --test tests/debateEngine.test.mjs`

Expected: all engine tests pass, including restore, round 6 and invalid-round rejection.

- [ ] **Step 7: Commit engine repair**

```powershell
git add src/background/debateEngine.js tests/debateEngine.test.mjs
git commit -m "fix: restore debate sessions and dynamic rounds"
```

### Task 3: Enforce Pro Boundaries and Correct Round Rendering

**Files:**
- Modify: `tests/entitlements.test.mjs`
- Modify: `tests/diagnostics.test.mjs`
- Modify: `tests/serviceWorkerSafety.test.mjs`
- Modify: `src/shared/entitlements.js`
- Modify: `src/sidepanel/app.js`
- Modify: `src/background/service-worker.js`

- [ ] **Step 1: Write failing entitlement and UI/background tests**

```js
assert.equal(canUseFeature(free, "chatMode"), false);
assert.equal(canUseFeature(pro, "chatMode"), true);
assert.equal(featureLabel("chatMode"), "自由群聊與劇場模式");
```

Add source safety assertions:

```js
assert.match(app, /chat:\s*"chatMode"/);
assert.match(app, /theater:\s*"chatMode"/);
assert.match(worker, /startChatDebate[\s\S]*requireProFeature\("chatMode"\)/);
assert.match(worker, /startTheaterDebate[\s\S]*requireProFeature\("chatMode"\)/);
assert.match(app, /const userMessage = critiques\.USER/);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/entitlements.test.mjs tests/diagnostics.test.mjs tests/serviceWorkerSafety.test.mjs`

Expected: FAIL because `chatMode` is absent, background does not gate chat/theater, and UI reads `transcript.userMessages`.

- [ ] **Step 3: Implement one entitlement key at every boundary**

```js
const FEATURE_LABELS = {
  // existing labels
  chatMode: "自由群聊與劇場模式",
};

// PLAN_FEATURES.free
chatMode: false,

// PLAN_FEATURES.pro
chatMode: true,
```

Map both modes in `featureForMode()` and add `await requireProFeature("chatMode")` as the first statement of both background start functions.

- [ ] **Step 4: Render real dynamic rounds and `USER`**

Keep `normalizeDebateRounds()` for the numeric input. Add a positive state parser:

```js
function runtimeRoundNumber(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
```

Use it in `currentCritiqueMap()` and progress rendering. In `renderChatBubbles()` use:

```js
const userMessage = critiques.USER || "";
```

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node --test tests/entitlements.test.mjs tests/diagnostics.test.mjs tests/serviceWorkerSafety.test.mjs`

Expected: all selected tests pass.

- [ ] **Step 6: Commit entitlement and rendering repairs**

```powershell
git add src/shared/entitlements.js src/sidepanel/app.js src/background/service-worker.js tests/entitlements.test.mjs tests/diagnostics.test.mjs tests/serviceWorkerSafety.test.mjs
git commit -m "fix: enforce chat mode entitlements"
```

### Task 4: Ignore Stale Async Work with Run Tokens

**Files:**
- Create: `src/background/runController.js`
- Create: `tests/runController.test.mjs`
- Modify: `src/background/service-worker.js`
- Modify: `tests/serviceWorkerSafety.test.mjs`

- [ ] **Step 1: Write failing RunController tests**

```js
import { RunController, isStaleRunError } from "../src/background/runController.js";

test("starting or invalidating a run makes prior tokens stale", () => {
  const runs = new RunController();
  const first = runs.begin();
  const second = runs.begin();
  assert.equal(runs.isCurrent(first), false);
  assert.equal(runs.isCurrent(second), true);
  runs.invalidate();
  assert.equal(runs.isCurrent(second), false);
});

test("assertCurrent marks stale run errors", () => {
  const runs = new RunController();
  const token = runs.begin();
  runs.invalidate();
  assert.throws(
    () => runs.assertCurrent(token),
    (error) => isStaleRunError(error) && error.message === "已緊急暫停",
  );
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/runController.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the minimal controller**

```js
const STALE_RUN_CODE = "STALE_RUN";

export class RunController {
  #generation = 0;

  begin() {
    this.#generation += 1;
    return this.#generation;
  }

  invalidate() {
    this.#generation += 1;
  }

  isCurrent(token) {
    return token === this.#generation;
  }

  assertCurrent(token) {
    if (!this.isCurrent(token)) {
      const error = new Error("已緊急暫停");
      error.code = STALE_RUN_CODE;
      throw error;
    }
  }
}

export function isStaleRunError(error) {
  return error?.code === STALE_RUN_CODE;
}
```

- [ ] **Step 4: Run controller tests and verify GREEN**

Run: `node --test tests/runController.test.mjs`

Expected: 2 tests pass.

- [ ] **Step 5: Integrate tokens through background async boundaries**

Import and initialize:

```js
import { RunController, isStaleRunError } from "./runController.js";

const runs = new RunController();
```

For start and next-round, call `const runToken = runs.begin()` and pass `runToken` through `startAction`, `runDebateRounds`, `handleNextRound`, `runSequentialProviderJobs`, `runFastProviderJobs`, `submitProviderJob`, `collectProviderJob` and `sendJob`.

At each async boundary that precedes state mutation:

```js
await asyncOperation();
runs.assertCurrent(runToken);
// mutate engine/runtimeState only here
```

On stop/reset call `runs.invalidate()`. In message-handler catches, stale errors must not publish error state:

```js
if (isStaleRunError(error)) {
  sendResponse({ ok: false, code: error.code, error: error.message, state: runtimeState });
  return;
}
```

Do not convert stale errors into provider failures inside `sendJob`/submit/collect; rethrow them.

- [ ] **Step 6: Add static integration assertions**

```js
assert.match(script, /runs\.invalidate\(\)/);
assert.match(script, /runs\.assertCurrent\(runToken\)/);
assert.match(script, /isStaleRunError/);
assert.doesNotMatch(script, /let isAborted = false/);
```

- [ ] **Step 7: Run focused and full tests**

Run:

```powershell
node --test tests/runController.test.mjs tests/serviceWorkerSafety.test.mjs
npm test
```

Expected: focused tests pass and the complete suite has zero failures.

- [ ] **Step 8: Commit run cancellation repair**

```powershell
git add src/background/runController.js src/background/service-worker.js tests/runController.test.mjs tests/serviceWorkerSafety.test.mjs
git commit -m "fix: isolate background debate runs"
```

### Task 5: Restore Stored Waiting Sessions Safely

**Files:**
- Modify: `src/background/service-worker.js`
- Modify: `tests/serviceWorkerSafety.test.mjs`

- [ ] **Step 1: Write failing storage recovery assertions**

```js
assert.match(script, /DebateEngine\.restore\(runtimeState\.transcript/);
assert.match(script, /runtimeState\.status === "waiting_for_user"/);
assert.match(script, /runtimeState\.status === "running"[\s\S]*背景服務已中斷/);
```

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/serviceWorkerSafety.test.mjs`

Expected: FAIL because stored runtime state is loaded without restoring engine or handling interrupted running work.

- [ ] **Step 3: Add one-time runtime hydration**

```js
let runtimeHydrated = false;

async function hydrateRuntimeState() {
  if (runtimeHydrated) return runtimeState;
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  runtimeState = stored?.[STORAGE_KEY] || runtimeState;

  if (runtimeState.status === "waiting_for_user" && runtimeState.transcript) {
    engine = DebateEngine.restore(runtimeState.transcript, runtimeState);
  } else if (runtimeState.status === "running") {
    runtimeState = {
      ...runtimeState,
      busy: false,
      status: "error",
      phase: "done",
      message: "背景服務已中斷，請重新開始辯論",
    };
    await publishState();
  }

  runtimeHydrated = true;
  return runtimeState;
}
```

Call it from `getRuntimeState()` and before `handleNextRound()`. Reset it appropriately only when tests or explicit reset replace the entire state; a new start directly creates a new engine and state.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/serviceWorkerSafety.test.mjs tests/debateEngine.test.mjs`

Expected: all selected tests pass.

- [ ] **Step 5: Commit service-worker hydration**

```powershell
git add src/background/service-worker.js tests/serviceWorkerSafety.test.mjs
git commit -m "fix: hydrate waiting debate sessions"
```

### Task 6: Clean Provider Artifacts without Data Loss

**Files:**
- Modify: `tests/pageAutomation.test.mjs`
- Modify: `src/content/automation-core.js`
- Modify: `src/content/provider-page.js`

- [ ] **Step 1: Write failing artifact tests**

```js
const { cleanProviderResponseText } = globalThis.aiDebateAutomationCore;

test("Gemini cleanup removes only a standalone image artifact", () => {
  assert.equal(cleanProviderResponseText("gemini", "回答內容\nimage"), "回答內容");
  assert.equal(cleanProviderResponseText("gemini", "This is an image"), "This is an image");
  assert.equal(cleanProviderResponseText("chatgpt", "回答內容\nimage"), "回答內容\nimage");
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/pageAutomation.test.mjs`

Expected: FAIL because `cleanProviderResponseText` does not exist.

- [ ] **Step 3: Implement provider-specific cleanup**

```js
function cleanProviderResponseText(providerId, text) {
  const value = String(text || "").trim();
  if (providerId !== "gemini") return value;
  const lines = value.split(/\r?\n/);
  if (lines.length > 1 && lines.at(-1).trim().toLowerCase() === "image") {
    lines.pop();
  }
  return lines.join("\n").trim();
}
```

Expose it through `aiDebateAutomationCore`. Pass `providerId` into `readAssistantSnapshot()`, `waitForCompletion()` and `readLastAssistantMessage()` in `provider-page.js`; remove the broad `.replace(...image...)` call.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/pageAutomation.test.mjs tests/contentSafety.test.mjs`

Expected: all selected tests pass.

- [ ] **Step 5: Commit artifact repair**

```powershell
git add src/content/automation-core.js src/content/provider-page.js tests/pageAutomation.test.mjs tests/contentSafety.test.mjs
git commit -m "fix: scope Gemini response cleanup"
```

### Task 7: Final Core Verification

**Files:**
- Modify only if verification exposes a scoped defect.

- [ ] **Step 1: Remove introduced trailing whitespace**

Run: `git diff --check`

Expected: no output and exit 0. Remove only whitespace in files touched by this plan.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test`

Expected: zero failed tests.

- [ ] **Step 3: Run syntax checks**

```powershell
node --check src/background/debateEngine.js
node --check src/background/runController.js
node --check src/background/service-worker.js
node --check src/content/automation-core.js
node --check src/content/provider-page.js
node --check src/shared/entitlements.js
node --check src/shared/prompts.js
node --check src/sidepanel/app.js
```

Expected: every command exits 0 with no output.

- [ ] **Step 4: Commit verification-only cleanup if needed**

```powershell
git add <only-files-changed-by-verification>
git commit -m "chore: clean regression repair output"
```

Skip this commit when verification made no edits.

## References

- Chrome extension service worker lifecycle: `https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle`
- MDN `execCommand()` deprecation and event caveats: `https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand`
