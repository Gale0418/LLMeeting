# LLMeeting Chair And Anonymous Summary Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 LLMeeting 顯示與封包版號同步到 0.4.6，並實作 spec 中的圍觀主席制、匿名評論制與隨機主席入口。

**Architecture:** Side panel 只負責收集互斥的 `summaryStrategy` 與主席選擇，background 進行 Pro gate、主席解析、辯論者重算與 tab 路由。`DebateEngine` 保存已解析主席、匿名名稱與 prompt 輸出規則，讓 session restore 不會重抽主席或重算名稱。

**Tech Stack:** Chrome Manifest V3、原生 ES modules、Node `node:test`。

---

### Task 1: Version And Static UI Regression Tests

**Files:**
- Modify: `tests/manifest.test.mjs`
- Modify: `tests/diagnostics.test.mjs`
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `src/sidepanel/index.html`

- [ ] **Step 1: Write failing tests**

Add assertions that `manifest.json`, `package.json`, and the side panel badge all expose `0.4.6`. Add static UI assertions for `summaryStrategy`, `observerChair`, `anonymousReview`, and `summaryProviderSelect` option `random`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/manifest.test.mjs tests/diagnostics.test.mjs`

Expected: FAIL because current versions are `0.4.5` / `v0.4.3`, and summary strategy controls are absent.

- [ ] **Step 3: Implement minimal UI/version changes**

Set `manifest.json` and `package.json` version to `0.4.6`, set side panel badge to `v0.4.6`, add the summary strategy radio group, and add `<option value="random">隨機主席</option>`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/manifest.test.mjs tests/diagnostics.test.mjs`

Expected: PASS.

### Task 2: Entitlement And Side Panel Message Payload

**Files:**
- Modify: `tests/entitlements.test.mjs`
- Modify: `src/shared/entitlements.js`
- Modify: `src/sidepanel/app.js`

- [ ] **Step 1: Write failing tests**

Assert Free locks `observerChair` and `anonymousReview`, Pro unlocks both, and labels are user-facing. Static app tests must see `summaryStrategy`, `featureForSummaryStrategy`, and `summaryStrategy: selectedSummaryStrategy()`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/entitlements.test.mjs tests/diagnostics.test.mjs`

Expected: FAIL because the new feature ids and payload field are absent.

- [ ] **Step 3: Implement minimal side panel behavior**

Add feature ids, collect selected summary strategy, gate Pro-only strategies before send, include `summaryStrategy` in runtime message, and render Pro-only strategy rows the same way existing mode options are rendered.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/entitlements.test.mjs tests/diagnostics.test.mjs`

Expected: PASS.

### Task 3: Prompt And Engine Summary Strategy

**Files:**
- Modify: `tests/prompts.test.mjs`
- Modify: `tests/debateEngine.test.mjs`
- Modify: `src/shared/prompts.js`
- Modify: `src/background/debateEngine.js`

- [ ] **Step 1: Write failing tests**

Add tests for anonymous first-round name instruction, anonymous name parsing fallback, final summary prompt using speaker labels, and `DebateEngine` preserving `summaryStrategy`, `resolvedSummaryProvider`, and `anonymousNames` through snapshot restore.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/prompts.test.mjs tests/debateEngine.test.mjs`

Expected: FAIL because these APIs and snapshot fields are absent.

- [ ] **Step 3: Implement minimal engine and prompt support**

Add optional `summaryStrategy`, `resolvedSummaryProvider`, `anonymousNames`, anonymous first-round prompt prefix, parser/fallback names, and `speakerLabels` support in final summary prompt.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/prompts.test.mjs tests/debateEngine.test.mjs`

Expected: PASS.

### Task 4: Background Routing And Pro Gate

**Files:**
- Modify: `tests/serviceWorkerSafety.test.mjs`
- Modify: `src/background/service-worker.js`

- [ ] **Step 1: Write failing tests**

Add static safety assertions that the service worker receives `summaryStrategy`, calls `requireProFeature("observerChair")` and `requireProFeature("anonymousReview")`, resolves random chair from checked providers, excludes observer chair from debate providers, and sends anonymous final jobs with `forceNewTab`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/serviceWorkerSafety.test.mjs`

Expected: FAIL because routing and gate code is absent.

- [ ] **Step 3: Implement minimal background behavior**

Add summary strategy handling to start paths, resolve `random`, enforce observer-chair minimum participants, pass strategy metadata into `DebateEngine`, and make `getOrCreateProviderTab(providerId, { forceNewTab })` ignore bound tabs for anonymous final summary jobs.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/serviceWorkerSafety.test.mjs`

Expected: PASS.

### Task 5: Verification

**Files:**
- Read: all changed source and tests

- [ ] **Step 1: Run targeted tests**

Run: `node --test tests/manifest.test.mjs tests/diagnostics.test.mjs tests/entitlements.test.mjs tests/prompts.test.mjs tests/debateEngine.test.mjs tests/serviceWorkerSafety.test.mjs tests/devUnlock.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Package extension**

Run: `npm run package`

Expected: writes `dist/llmeeting-0.4.6.zip`.
