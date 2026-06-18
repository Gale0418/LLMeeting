# LLMeeting Regression Repair and Easter Egg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修復 0.4.0 RC 後的狀態、取消、授權、回合與 Gemini 送出回歸，並完成 Free badge 1、3、5 次點擊彩蛋。

**Architecture:** 保留現有 side panel / service worker / content script 邊界，只抽出兩個小型可測單元：`RunController` 管理異步任務代理，`automation-core.js` 管理 provider 文字清理與送出確認判斷。`DebateEngine` snapshot 擴充為可驗證、可恢復的 JSON 狀態，service worker 只在 `waiting_for_user` 恢復會議。

**Tech Stack:** Chrome Extension Manifest V3、JavaScript ES modules / classic content scripts、Node.js `node:test`、PowerShell 7.4。

**Design:** `docs/superpowers/specs/2026-06-18-regression-repair-and-easter-egg-design.md`

**Primary references:** [Chrome extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)、[Chrome message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)、[MDN execCommand](https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand)。

---

## File Map

- Create `src/background/runController.js`: 產生、使失效並驗證 run token。
- Create `tests/runController.test.mjs`: run token 生命週期回歸測試。
- Modify `src/background/debateEngine.js`: 動態回合、snapshot 設定與 restore API。
- Modify `src/background/service-worker.js`: engine 恢復、run token 整合、Pro background gate。
- Modify `src/shared/entitlements.js`: `chatMode` feature。
- Modify `src/shared/prompts.js`: 保持 `buildInteractionPrompt` API 並與測試文字同步。
- Modify `src/content/automation-core.js`: provider artifact 清理、輸入比對與送出確認判斷。
- Modify `src/content/provider-page.js`: Gemini composer-scoped 按鈕、送出後驗證與單次 Enter 補送。
- Modify `src/sidepanel/app.js`: `chat` / `theater` Pro gate，以當輪 `USER` 顯示插話。
- Modify `src/sidepanel/dev-unlock.js`: 1、3、5 點擊彩蛋與可測依賴注入。
- Modify `tests/debateEngine.test.mjs`: 動態回合與 restore 測試。
- Modify `tests/prompts.test.mjs`: 更新為 `buildInteractionPrompt`。
- Modify `tests/serviceWorkerSafety.test.mjs`: lifecycle、token 與 background gate 安全斷言。
- Modify `tests/entitlements.test.mjs`: `chatMode` Free/Pro 邊界。
- Modify `tests/pageAutomation.test.mjs`: artifact 與送出確認單元測試。
- Modify `tests/contentSafety.test.mjs`: Gemini 送出流程結構檢查。
- Modify `tests/devUnlock.test.mjs`: 真實點擊狀態機測試。
- Modify `.coderabbit.yaml`: 轉為 UTF-8。
- Modify `MissionCenter/*.md`: 只在最後同步任務、smoke test 與結果。

### Task 1: Restore a trustworthy test baseline

**Files:**
- Modify: `tests/prompts.test.mjs`
- Modify: `tests/debateEngine.test.mjs`
- Modify: `tests/serviceWorkerSafety.test.mjs`

- [ ] **Step 1: Update the prompt test import and approved wording**

```js
import {
  buildConversationSummaryPrompt,
  buildFinalSummaryPrompt,
  buildInteractionPrompt,
} from "../src/shared/prompts.js";

const prompt = buildInteractionPrompt({
  recipient: "chatgpt",
  answers,
  previousCritiques,
  roundNumber: 2,
  activeProviders: ["chatgpt", "gemini", "grok"],
});

assert.match(prompt, /上一輪對話/);
```

- [ ] **Step 2: Update the engine wording assertion without weakening behavior checks**

```js
assert.match(
  secondCritiqueJobs.find((item) => item.provider === "chatgpt").prompt,
  /上一輪對話/,
);
```

- [ ] **Step 3: Update the service-worker constructor assertion for options**

```js
assert.match(script, /new DebateEngine\(activeProviders, summaryProvider, debateRounds, \{/);
```

- [ ] **Step 4: Run the complete baseline suite**

Run: `npm test`

Expected: `54` tests pass, `0` fail. If a failure remains, stop and correct only the stale assertion before continuing.

- [ ] **Step 5: Commit the test baseline**

```powershell
git add tests/prompts.test.mjs tests/debateEngine.test.mjs tests/serviceWorkerSafety.test.mjs
git commit -m "test: align regression suite with interaction prompts"
```

### Task 2: Support dynamic rounds and round-aligned user messages

**Files:**
- Modify: `tests/debateEngine.test.mjs`
- Modify: `src/background/debateEngine.js`
- Modify: `src/sidepanel/app.js`

- [ ] **Step 1: Add a failing sixth-round engine test**

```js
test("interactive rounds continue beyond the configured five-round limit", () => {
  const engine = completedEngine({ debateRounds: 5 });
  const round = engine.addChatRound("主人補充");
  const jobs = engine.buildUserMessageJobs("主人補充", round);

  assert.equal(round, 6);
  assert.deepEqual([...new Set(jobs.map((job) => job.round))], [6]);
  for (const job of jobs) engine.recordCritique(job.provider, `reply-${job.provider}`, job.round);
  assert.doesNotThrow(() => engine.buildFinalJob());
});
```

`completedEngine()` 在測試檔內依序寫入所有初始回答與 5 輪互評，不使用 mock。

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-name-pattern="interactive rounds continue" tests/debateEngine.test.mjs`

Expected: FAIL because jobs still report round `5` or final summary reports missing `critique-6`.

- [ ] **Step 3: Add strict dynamic-round normalization**

```js
function existingRoundNumber(value, roundCount) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > roundCount) {
    throw new Error(`Unknown critique round: ${value}`);
  }
  return parsed;
}
```

Use `existingRoundNumber()` in `recordCritique()`, `buildCritiqueJobs()`, `buildUserMessageJobs()` and `critiqueRoundFromPhase()`. Keep `normalizeDebateRounds()` only in the constructor for the initial 1至5 setting.

- [ ] **Step 4: Make `USER` the display source**

In `src/sidepanel/app.js`, replace the array lookup with:

```js
const userMessage = critiques.USER || "";
```

Keep `addChatRound()` writing `newCritiqueRound.USER = normalizeText(userText)` and stop pushing new entries into `state.userMessages`.

- [ ] **Step 5: Run focused and complete tests**

Run: `node --test tests/debateEngine.test.mjs tests/prompts.test.mjs`

Expected: all focused tests pass.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit dynamic rounds**

```powershell
git add src/background/debateEngine.js src/sidepanel/app.js tests/debateEngine.test.mjs
git commit -m "fix: preserve interactive rounds beyond initial limit"
```

### Task 3: Rehydrate waiting sessions safely

**Files:**
- Modify: `tests/debateEngine.test.mjs`
- Modify: `tests/serviceWorkerSafety.test.mjs`
- Modify: `src/background/debateEngine.js`
- Modify: `src/background/service-worker.js`

- [ ] **Step 1: Add failing snapshot restore tests**

```js
test("engine restores a waiting interactive session from its snapshot", () => {
  const original = completedEngine({ debateRounds: 1, interactionStyle: "casual" });
  const snapshot = original.snapshot();
  const restored = DebateEngine.restore(snapshot);
  const round = restored.addChatRound("繼續說");
  const jobs = restored.buildUserMessageJobs("繼續說", round);

  assert.equal(restored.interactionStyle, "casual");
  assert.equal(jobs[0].round, 2);
  assert.match(jobs[0].prompt, /繼續說/);
});

test("engine rejects malformed snapshots", () => {
  assert.throws(() => DebateEngine.restore({ phase: "waiting_for_user" }), /Invalid debate snapshot/);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test --test-name-pattern="restores|malformed snapshots" tests/debateEngine.test.mjs`

Expected: FAIL because `DebateEngine.restore` does not exist.

- [ ] **Step 3: Serialize session configuration and implement restore**

Add these fields to engine state in both constructor and `start()`:

```js
session: {
  activeProviders: [...this.activeProviders],
  summaryProvider: this.summaryProvider,
  interactionStyle: this.interactionStyle,
  isTheaterMode: this.isTheaterMode,
  customPersonas: { ...this.customPersonas },
}
```

Implement:

```js
static restore(snapshot) {
  const session = snapshot?.session;
  if (!session || !Array.isArray(snapshot.critiqueRounds) || !snapshot.originalQuestion) {
    throw new Error("Invalid debate snapshot");
  }
  const engine = new DebateEngine(
    session.activeProviders,
    session.summaryProvider,
    snapshot.critiqueRounds.length,
    session,
  );
  engine.debateRounds = snapshot.critiqueRounds.length;
  engine.state = JSON.parse(JSON.stringify(snapshot));
  return engine;
}
```

- [ ] **Step 4: Add service-worker lifecycle assertions first**

```js
assert.match(script, /runtimeState\.phase === "waiting_for_user"/);
assert.match(script, /DebateEngine\.restore\(runtimeState\.transcript\)/);
assert.match(script, /runtimeState\.status === "running"/);
assert.match(script, /上次作業因 Chrome 中止/);
```

Run: `node --test tests/serviceWorkerSafety.test.mjs`

Expected: FAIL before service-worker integration.

- [ ] **Step 5: Restore only resumable state**

In `getRuntimeState()`:

```js
if (runtimeState.phase === "waiting_for_user" && runtimeState.transcript) {
  engine = DebateEngine.restore(runtimeState.transcript);
} else if (runtimeState.status === "running") {
  runtimeState = {
    ...runtimeState,
    busy: false,
    status: "error",
    phase: "done",
    message: "上次作業因 Chrome 中止，請重新開始。",
  };
  await publishState();
}
```

Catch restore errors, return idle state, and append `{ message: `無法恢復會議：${error.message}` }` to `errors`.

- [ ] **Step 6: Run full tests and commit**

Run: `npm test`

Expected: all tests pass.

```powershell
git add src/background/debateEngine.js src/background/service-worker.js tests/debateEngine.test.mjs tests/serviceWorkerSafety.test.mjs
git commit -m "fix: restore resumable debate sessions"
```

### Task 4: Replace global abort state with run tokens

**Files:**
- Create: `src/background/runController.js`
- Create: `tests/runController.test.mjs`
- Modify: `src/background/service-worker.js`
- Modify: `tests/serviceWorkerSafety.test.mjs`

- [ ] **Step 1: Write failing token lifecycle tests**

```js
import { RunController } from "../src/background/runController.js";

test("starting a new run invalidates the prior token", () => {
  const controller = new RunController();
  const first = controller.begin();
  const second = controller.begin();
  assert.equal(controller.isCurrent(first), false);
  assert.equal(controller.isCurrent(second), true);
});

test("cancel invalidates the active token", () => {
  const controller = new RunController();
  const token = controller.begin();
  controller.cancel();
  assert.throws(() => controller.assertCurrent(token), /Run is no longer active/);
});
```

- [ ] **Step 2: Run token tests and verify RED**

Run: `node --test tests/runController.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the minimal controller**

```js
export class RunController {
  #generation = 0;

  begin() {
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
    if (!this.isCurrent(token)) throw new Error("Run is no longer active");
  }
}
```

- [ ] **Step 4: Add failing service-worker integration assertions**

```js
assert.match(script, /const runController = new RunController\(\)/);
assert.match(script, /runController\.cancel\(\)/);
assert.match(script, /runController\.assertCurrent\(runToken\)/);
assert.doesNotMatch(script, /let isAborted = false/);
```

Run: `node --test tests/serviceWorkerSafety.test.mjs`

Expected: FAIL while the service worker still uses `isAborted`.

- [ ] **Step 5: Thread tokens through asynchronous jobs**

Import and instantiate the controller. `aiDebate:start` and `aiDebate:nextRound` call `begin()` and pass `runToken` through start functions, `runDebateRounds()`, `handleNextRound()`, provider runners, `sendJob()`, `submitProviderJob()` and `collectProviderJob()`.

After every awaited provider call and immediately before `recordProviderResult()` or publishing final/error state, call:

```js
runController.assertCurrent(runToken);
```

`stop` and `reset` call `runController.cancel()`. In the start/next-round catch handlers, stale-run errors only answer the original message and must not mutate or publish `runtimeState`.

- [ ] **Step 6: Run tests and commit**

Run: `node --test tests/runController.test.mjs tests/serviceWorkerSafety.test.mjs`

Expected: all focused tests pass.

Run: `npm test`

Expected: all tests pass.

```powershell
git add src/background/runController.js src/background/service-worker.js tests/runController.test.mjs tests/serviceWorkerSafety.test.mjs
git commit -m "fix: isolate asynchronous debate runs"
```

### Task 5: Enforce chat-mode entitlements at both boundaries

**Files:**
- Modify: `tests/entitlements.test.mjs`
- Modify: `tests/serviceWorkerSafety.test.mjs`
- Modify: `tests/diagnostics.test.mjs`
- Modify: `src/shared/entitlements.js`
- Modify: `src/background/service-worker.js`
- Modify: `src/sidepanel/app.js`

- [ ] **Step 1: Add failing entitlement tests**

```js
assert.equal(canUseFeature(free, "chatMode"), false);
assert.equal(canUseFeature(pro, "chatMode"), true);
assert.equal(featureLabel("chatMode"), "自由群聊與劇場模式");
```

In safety/diagnostic tests assert both modes map and background functions gate:

```js
assert.match(app, /chat: "chatMode"/);
assert.match(app, /theater: "chatMode"/);
assert.match(worker, /startChatDebate[\s\S]*requireProFeature\("chatMode"\)/);
assert.match(worker, /startTheaterDebate[\s\S]*requireProFeature\("chatMode"\)/);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/entitlements.test.mjs tests/serviceWorkerSafety.test.mjs tests/diagnostics.test.mjs`

Expected: FAIL because `chatMode` is absent.

- [ ] **Step 3: Implement the shared feature boundary**

Add `chatMode` to `FEATURE_LABELS` and both plan maps. Add `await requireProFeature("chatMode")` as the first statement in both background start functions. Extend `featureForMode()`:

```js
return {
  fast: "fastDebate",
  summary: "summaryDebate",
  chat: "chatMode",
  theater: "chatMode",
}[mode] || "";
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test`

Expected: all tests pass.

```powershell
git add src/shared/entitlements.js src/background/service-worker.js src/sidepanel/app.js tests/entitlements.test.mjs tests/serviceWorkerSafety.test.mjs tests/diagnostics.test.mjs
git commit -m "fix: enforce pro access for chat modes"
```

### Task 6: Add testable provider artifact and submission decisions

**Files:**
- Modify: `src/content/automation-core.js`
- Modify: `tests/pageAutomation.test.mjs`

- [ ] **Step 1: Add failing artifact tests**

```js
test("stripProviderArtifact removes only Gemini standalone image suffixes", () => {
  assert.equal(stripProviderArtifact("gemini", "答案\nimage"), "答案");
  assert.equal(stripProviderArtifact("gemini", "This is an image"), "This is an image");
  assert.equal(stripProviderArtifact("chatgpt", "答案\nimage"), "答案\nimage");
});
```

- [ ] **Step 2: Add failing submission-decision tests**

```js
test("submission evidence accepts cleared input or generation", () => {
  assert.equal(submissionEvidence({ prompt: "hello", inputText: "", generating: false, userMessageChanged: false }), "input-cleared");
  assert.equal(submissionEvidence({ prompt: "hello", inputText: "hello", generating: true, userMessageChanged: false }), "generating");
});

test("Enter fallback is allowed only when the prompt still remains", () => {
  assert.equal(shouldFallbackSubmit({ prompt: "hello", inputText: "hello", evidence: "" }), true);
  assert.equal(shouldFallbackSubmit({ prompt: "hello", inputText: "", evidence: "input-cleared" }), false);
});
```

- [ ] **Step 3: Run focused tests and verify RED**

Run: `node --test tests/pageAutomation.test.mjs`

Expected: FAIL because the helpers are undefined.

- [ ] **Step 4: Implement pure helpers**

Expose these functions through `globalThis.aiDebateAutomationCore`:

```js
function stripProviderArtifact(providerId, text) {
  const normalized = String(text || "");
  return providerId === "gemini"
    ? normalized.replace(/(?:\r?\n)\s*image\s*$/i, "").trim()
    : normalized.trim();
}

function submissionEvidence({ inputText, generating, userMessageChanged }) {
  if (!String(inputText || "").trim()) return "input-cleared";
  if (generating) return "generating";
  if (userMessageChanged) return "user-message";
  return "";
}

function shouldFallbackSubmit({ prompt, inputText, evidence }) {
  return !evidence && normalizeWhitespace(prompt) === normalizeWhitespace(inputText);
}
```

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/pageAutomation.test.mjs`

Expected: all tests pass.

```powershell
git add src/content/automation-core.js tests/pageAutomation.test.mjs
git commit -m "test: define provider submission evidence"
```

### Task 7: Confirm Gemini submissions without duplicates

**Files:**
- Modify: `src/content/provider-page.js`
- Modify: `tests/contentSafety.test.mjs`
- Modify: `tests/pageAutomation.test.mjs`

- [ ] **Step 1: Add failing content-flow assertions**

```js
assert.match(script, /findSendButton\(config, input\)/);
assert.match(script, /await confirmSubmission/);
assert.match(script, /shouldFallbackSubmit/);
assert.match(script, /Gemini 未確認送出/);
assert.match(script, /submittedRuns\.set[\s\S]*confirmation/);
```

Run: `node --test tests/contentSafety.test.mjs tests/pageAutomation.test.mjs`

Expected: FAIL because submission confirmation is absent.

- [ ] **Step 2: Scope Gemini send-button selection to its composer**

Move Gemini-specific selectors ahead of broad submit selectors:

```js
sendSelectors: [
  "button.send-button",
  "button[aria-label*='Send']",
  "button[aria-label*='送出']",
  "button[type='submit']",
],
userMessageSelectors: ["user-query", ".user-query-container"],
```

Change `findSendButton(config, input)` to query `input.closest("form, rich-textarea")?.parentElement` first and fall back to the document only if no valid scoped candidate exists.

- [ ] **Step 3: Verify written input before attempting submit**

After `writeInput()`, wait up to 3 seconds until normalized `readInputText(input)` equals the prompt. If `execCommand("insertText")` returns false or the value does not appear, use `textContent = text` and dispatch `beforeinput`, `input` and `change`, then verify again. Do not interpret `execCommand()` returning without an exception as success.

- [ ] **Step 4: Confirm click and allow one guarded fallback**

Implement:

```js
const confirmation = await confirmSubmission({ config, input, prompt, baselineUser });
let finalConfirmation = confirmation;
let submitMethod = "button";

if (shouldFallbackSubmit({ prompt, inputText: readInputText(input), evidence: confirmation.evidence })) {
  dispatchEnter(input);
  submitMethod = "enter-fallback";
  finalConfirmation = await confirmSubmission({ config, input, prompt, baselineUser });
}

if (!finalConfirmation.evidence) {
  throw new Error("Gemini 未確認送出");
}
```

`confirmSubmission()` polls for up to 4 seconds and returns `{ evidence }`. Only after success create the `submittedRuns` entry with `submitMethod` and `confirmation: finalConfirmation.evidence`. Never store full prompt in diagnostics; the existing run record may retain it locally for echo detection.

- [ ] **Step 5: Use provider-specific artifact cleanup**

Change `readAssistantSnapshot(config)` to `readAssistantSnapshot(providerId, config)` and apply `stripProviderArtifact(providerId, text)` to each visible response.

- [ ] **Step 6: Run focused and complete tests**

Run: `node --test tests/pageAutomation.test.mjs tests/contentSafety.test.mjs`

Expected: all focused tests pass.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 7: Commit Gemini reliability**

```powershell
git add src/content/provider-page.js tests/contentSafety.test.mjs tests/pageAutomation.test.mjs
git commit -m "fix: confirm Gemini prompts are submitted"
```

### Task 8: Implement the 1-3-5 Free badge easter egg

**Files:**
- Modify: `src/sidepanel/dev-unlock.js`
- Modify: `tests/devUnlock.test.mjs`

- [ ] **Step 1: Replace source-text assertions with a failing behavior test**

Create a fake badge whose `addEventListener()` stores the click handler, and inject fake storage, `showAlert`, `showConfirm`, `openUrl`, timers and `random`.

```js
test("Free badge shows dialog on clicks one, three, and five", async () => {
  const alerts = [];
  const confirms = [];
  const opened = [];
  const harness = createUnlockHarness({
    plan: "free",
    random: () => 0,
    showAlert: (message) => alerts.push(message),
    showConfirm: (message) => { confirms.push(message); return true; },
    openUrl: (url) => opened.push(url),
  });

  await harness.click(5);

  assert.equal(alerts[0], "想做什麼呢！按再多次都沒用的唷");
  assert.equal(alerts[1], THIRD_CLICK_MESSAGES[0]);
  assert.match(confirms[0], /https:\/\/www\.youtube\.com\/@gale0418/);
  assert.deepEqual(opened, ["https://www.youtube.com/@gale0418"]);
});
```

Add separate tests that clicks 2/4 are silent, random near `1` chooses item 10, and Pro mode suppresses first/third dialogs while five clicks return to Free.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/devUnlock.test.mjs`

Expected: FAIL because dependencies and `THIRD_CLICK_MESSAGES` are not exposed.

- [ ] **Step 3: Implement injectable dependencies and exact messages**

Export `THIRD_CLICK_MESSAGES` and accept optional dependencies:

```js
export function attachDevUnlock({
  planBadge,
  renderMessage,
  loadState,
  storage = globalThis.chrome?.storage?.local,
  showAlert = globalThis.alert?.bind(globalThis),
  showConfirm = globalThis.confirm?.bind(globalThis),
  openUrl = (url) => globalThis.open?.(url, "_blank", "noopener"),
  random = Math.random,
  setTimer = globalThis.setTimeout.bind(globalThis),
  clearTimer = globalThis.clearTimeout.bind(globalThis),
}) { /* existing click state machine */ }
```

Read the current plan on each click. In Free mode: click 1 shows the approved line, click 3 uses `Math.min(9, Math.max(0, Math.floor(random() * 10)))`, click 5 toggles to Pro and confirms with the YouTube URL. In Pro mode only click 5 emits the existing Free-enabled status.

- [ ] **Step 4: Run tests and commit**

Run: `node --test tests/devUnlock.test.mjs`

Expected: all easter-egg tests pass.

Run: `npm test`

Expected: all tests pass.

```powershell
git add src/sidepanel/dev-unlock.js tests/devUnlock.test.mjs
git commit -m "feat: add staged Free badge easter egg"
```

### Task 9: Repository hygiene, packaging, and MissionCenter closeout

**Files:**
- Modify: `.coderabbit.yaml`
- Modify: any touched source file containing trailing whitespace
- Modify: `MissionCenter/project.md`
- Modify: `MissionCenter/progress.md`
- Modify: `MissionCenter/tasks.md`
- Modify: `MissionCenter/notes.md`
- Modify: `MissionCenter/smoke-tests.md`

- [ ] **Step 1: Convert CodeRabbit config to UTF-8 and remove trailing whitespace**

Rewrite `.coderabbit.yaml` as UTF-8 without BOM while preserving:

```yaml
reviews:
  path_filters:
    - '!**/*.svg'
    - '!**/*.png'
```

Remove the ten trailing-whitespace locations previously reported by `git diff --check` without changing surrounding logic.

- [ ] **Step 2: Run the complete automated verification**

Run: `npm test`

Expected: all tests pass, `0` fail.

Run each changed JavaScript file with `node --check`:

```powershell
node --check src/background/debateEngine.js
node --check src/background/runController.js
node --check src/background/service-worker.js
node --check src/content/automation-core.js
node --check src/content/provider-page.js
node --check src/shared/entitlements.js
node --check src/shared/prompts.js
node --check src/sidepanel/app.js
node --check src/sidepanel/dev-unlock.js
```

Expected: every command exits `0` with no output.

Run: `git diff --check d12bca6..HEAD`

Expected: exit `0`, no whitespace errors.

- [ ] **Step 3: Build and inspect the Chrome Web Store package**

Run: `npm run package`

Expected: writes `dist\llmeeting-0.4.0.zip`.

Run: `tar -tf dist\llmeeting-0.4.0.zip`

Expected: archive contains only `manifest.json`, `assets/`, and `src/`; it includes `src/sidepanel/dev-unlock.js` and `src/background/runController.js`.

- [ ] **Step 4: Perform manual Chrome smoke tests**

After reloading the unpacked extension:

1. Free plan rejects Chat and Theater modes.
2. Five initial critique rounds plus one interactive continuation can summarize.
3. Stop a running debate and immediately start another; old replies do not alter the new transcript.
4. Pause at `waiting_for_user`, allow/reload the service worker, then send a user message and summarize.
5. Gemini prompt visibly leaves the input and appears in the conversation exactly once.
6. Free badge clicks 1/3/5 show the approved dialogs; click 5 shows and opens the YouTube URL.

- [ ] **Step 5: Record observed evidence in MissionCenter**

Append automated commands, expected results, observed counts/zip size and pass/fail to `MissionCenter/smoke-tests.md`. Mark LLM-T17/18/19 `Done` only for checks actually observed; if manual Chrome checks are not run, leave the relevant task in `Review` and name the missing check.

- [ ] **Step 6: Commit verified closeout files**

```powershell
git add .coderabbit.yaml src MissionCenter tests
git commit -m "chore: verify regression repairs"
```

Do not stage unrelated files. Before commit, run `git diff --cached --stat` and confirm every staged path belongs to this plan.
