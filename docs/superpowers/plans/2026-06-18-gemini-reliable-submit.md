# Gemini Reliable Submit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gemini 只在有可觀察送出證據時回報成功，點擊失效時最多以 Enter 補送一次，且不產生重複訊息。

**Architecture:** 把 DOM-independent 的「輸入是否仍包含 prompt」與「送出證據決策」放進 `automation-core.js` 以真實單元測試。`provider-page.js` 只負責收集 DOM 狀態、使用 composer-scoped Gemini 按鈕、一次有條件補送與記錄不含 prompt 內容的診斷。

**Tech Stack:** Chrome content scripts、JavaScript、Node.js `node:test`、DOM events

---

## File Map

- Modify: `src/content/automation-core.js` - 純函式 `inputContainsPrompt()` 與 `submissionEvidence()`。
- Modify: `src/content/provider-page.js` - Gemini selector 優先順序、composer scope、送出確認與一次補送。
- Modify: `tests/pageAutomation.test.mjs` - 證據決策單元測試。
- Modify: `tests/contentSafety.test.mjs` - 靜態保證不盲目重送。

### Task 1: Specify Submission Evidence

**Files:**
- Modify: `tests/pageAutomation.test.mjs`

- [ ] **Step 1: Add the new core helpers to test imports**

```js
const {
  assistantSnapshot,
  formatStageError,
  hasFreshAssistantResponse,
  inputContainsPrompt,
  isPromptEcho,
  submissionEvidence,
} = globalThis.aiDebateAutomationCore;
```

- [ ] **Step 2: Write failing evidence tests**

```js
test("inputContainsPrompt ignores whitespace differences", () => {
  assert.equal(inputContainsPrompt("請分析： Pony V6", "請分析：\nPony V6"), true);
  assert.equal(inputContainsPrompt("", "請分析 Pony V6"), false);
});

test("submission evidence accepts clear input, generation, or a new matching user message", () => {
  const baseline = assistantSnapshot(["舊問題"]);
  assert.equal(submissionEvidence({ prompt: "new", inputText: "", generating: false, baselineUser: baseline, currentUser: baseline }), "input-cleared");
  assert.equal(submissionEvidence({ prompt: "new", inputText: "new", generating: true, baselineUser: baseline, currentUser: baseline }), "generating");
  assert.equal(submissionEvidence({ prompt: "new", inputText: "new", generating: false, baselineUser: baseline, currentUser: assistantSnapshot(["舊問題", "new"]) }), "user-message");
});

test("submission evidence rejects an unchanged prompt still in the composer", () => {
  const baseline = assistantSnapshot(["舊問題"]);
  assert.equal(submissionEvidence({ prompt: "new", inputText: "new", generating: false, baselineUser: baseline, currentUser: baseline }), "");
});
```

- [ ] **Step 3: Run tests and verify RED**

Run: `node --test tests/pageAutomation.test.mjs`

Expected: FAIL because the two helpers are undefined.

### Task 2: Implement Pure Evidence Helpers

**Files:**
- Modify: `src/content/automation-core.js`
- Modify: `tests/pageAutomation.test.mjs`

- [ ] **Step 1: Implement `inputContainsPrompt()`**

```js
function inputContainsPrompt(inputText, prompt) {
  const input = normalizeWhitespace(inputText);
  const expected = normalizeWhitespace(prompt);
  return Boolean(input && expected && input === expected);
}
```

- [ ] **Step 2: Implement `submissionEvidence()`**

```js
function submissionEvidence({ prompt, inputText, generating, baselineUser, currentUser }) {
  if (!normalizeWhitespace(inputText)) return "input-cleared";
  if (generating) return "generating";
  if (
    hasFreshAssistantResponse(baselineUser, currentUser) &&
    isPromptEcho(prompt, currentUser.lastText)
  ) {
    return "user-message";
  }
  return "";
}
```

Expose both functions through `globalThis.aiDebateAutomationCore`.

- [ ] **Step 3: Run tests and verify GREEN**

Run: `node --test tests/pageAutomation.test.mjs`

Expected: all page automation tests pass.

- [ ] **Step 4: Commit evidence helpers**

```powershell
git add src/content/automation-core.js tests/pageAutomation.test.mjs
git commit -m "test: define provider submission evidence"
```

### Task 3: Confirm Gemini Submit before Registering a Run

**Files:**
- Modify: `tests/contentSafety.test.mjs`
- Modify: `src/content/provider-page.js`

- [ ] **Step 1: Write failing source safety assertions**

```js
test("Gemini submit is confirmed before a submitted run is registered", async () => {
  const script = await readFile("src/content/provider-page.js", "utf8");
  assert.match(script, /await confirmPromptSubmission\(/);
  assert.match(script, /if \(!evidence && inputContainsPrompt\(readInputText\(input\), message\.prompt\)\)/);
  assert.match(script, /throw new Error\("Gemini 未確認送出"\)/);
  assert.match(script, /submittedRuns\.set\([\s\S]*evidence/);
});

test("Gemini send selectors prefer its composer button over generic submit", async () => {
  const script = await readFile("src/content/provider-page.js", "utf8");
  const geminiBlock = script.slice(script.indexOf("gemini:"), script.indexOf("grok:"));
  assert.ok(geminiBlock.indexOf("button.send-button") < geminiBlock.indexOf("button[type='submit']"));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/contentSafety.test.mjs`

Expected: FAIL because no submit confirmation exists and the generic selector is first.

- [ ] **Step 3: Add Gemini user-message selectors and prioritize send buttons**

Update the Gemini config:

```js
sendSelectors: [
  "button.send-button",
  "button[aria-label*='Send']",
  "button[aria-label*='送出']",
  "button[type='submit']",
],
userMessageSelectors: [
  "user-query",
  "[data-message-author='user']",
  ".user-query",
],
```

Add `userMessageSelectors: []` for other providers or use `config.userMessageSelectors || []` when collecting.

- [ ] **Step 4: Scope the send-button search to the composer first**

```js
function findSendButton(config, input) {
  const scopes = [
    input?.closest("form"),
    input?.closest("rich-textarea")?.parentElement,
    document,
  ].filter(Boolean);

  for (const scope of scopes) {
    const candidates = collectElements(config.sendSelectors, scope)
      .filter((element) => element instanceof HTMLButtonElement || element.getAttribute("role") === "button")
      .filter(isVisible)
      .filter((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true");
    if (candidates[0]) return candidates[0];
  }
  return findLikelySendButton();
}
```

Change `collectElements(selectors, root = document)` to call `root.querySelectorAll(selector)`.

- [ ] **Step 5: Add DOM state readers**

```js
function readInputText(element) {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return element.value || "";
  }
  return element.innerText || element.textContent || "";
}

function readUserSnapshot(config) {
  const texts = [...new Set(collectElements(config.userMessageSelectors || []))]
    .filter(isVisible)
    .map((element) => element.innerText || element.textContent || "")
    .map((text) => text.trim())
    .filter(Boolean);
  return assistantSnapshot(texts);
}
```

- [ ] **Step 6: Confirm once, then conditionally fall back to Enter**

Before writing, capture `const baselineUser = readUserSnapshot(config)`. After writing, wait until `inputContainsPrompt(readInputText(input), message.prompt)` is true.

After button click or initial Enter fallback:

```js
let evidence = await confirmPromptSubmission(config, providerId, input, message.prompt, baselineUser, 4000);
let submitMethod = sendButton ? "button" : "enter";
let retried = false;

if (!evidence && inputContainsPrompt(readInputText(input), message.prompt)) {
  dispatchEnter(input);
  retried = true;
  submitMethod = `${submitMethod}+enter`;
  evidence = await confirmPromptSubmission(config, providerId, input, message.prompt, baselineUser, 4000);
}

if (!evidence) {
  throw new Error(providerId === "gemini" ? "Gemini 未確認送出" : `${message.provider} 未確認送出`);
}
```

`confirmPromptSubmission()` polls `submissionEvidence()` using `readInputText(input)`, `isGenerating(config)` and `readUserSnapshot(config)`. Only after it returns evidence should `submittedRuns.set()` execute. Store `submitMethod`, `retried` and `evidence`, never the full prompt in diagnostics.

- [ ] **Step 7: Avoid relying on deprecated `execCommand()` success**

Keep it as a compatibility attempt, but verify the resulting content:

```js
const inserted = document.execCommand("insertText", false, text);
if (!inserted || !inputContainsPrompt(readInputText(element), text)) {
  element.textContent = text;
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
}
```

After either path, the caller waits for the input-content postcondition before attempting submit.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run:

```powershell
node --test tests/pageAutomation.test.mjs tests/contentSafety.test.mjs
node --check src/content/provider-page.js
```

Expected: all tests pass and syntax check exits 0.

- [ ] **Step 9: Commit reliable Gemini submit**

```powershell
git add src/content/provider-page.js tests/contentSafety.test.mjs
git commit -m "fix: confirm Gemini prompt submission"
```

### Task 4: Gemini Verification

**Files:**
- Modify only if focused verification finds a defect.

- [ ] **Step 1: Run the complete suite**

Run: `npm test`

Expected: zero failed tests.

- [ ] **Step 2: Run whitespace and syntax checks**

```powershell
git diff --check
node --check src/content/automation-core.js
node --check src/content/provider-page.js
```

Expected: no output and exit 0 for every command.

- [ ] **Step 3: Run a manual Chrome smoke test when available**

Manual steps:

1. Reload the unpacked extension.
2. Open a Gemini conversation and select that tab in LLMeeting tab hooking.
3. Start a two-provider one-round debate with a short unique prompt.
4. Verify Gemini receives exactly one user message.
5. Repeat five times; each attempt must either send exactly once or show `Gemini 未確認送出` with diagnostics, never silently continue.

Record the observed count and any failure stage in `MissionCenter/smoke-tests.md`.

## References

- MDN `execCommand()` deprecation and input-event caveat: `https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand`
