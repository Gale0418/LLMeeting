# Free Badge Easter Egg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作 Free badge 第 1、3、5 次點擊的彩蛋，第 3 次從固定 10 句中隨機吐槽，第 5 次解鎖羊模式並顯示 YouTube 連結。

**Architecture:** 保留 `attachDevUnlock()` 入口與 1800 ms 點擊視窗，但將 dialog、confirm、open URL、random 與 timer 以可選 dependency 注入，讓 Node 測試可真實驅動點擊流程。

**Tech Stack:** JavaScript ES modules、Node.js `node:test`、Chrome storage

---

## File Map

- Modify: `src/sidepanel/dev-unlock.js` - 彩蛋狀態機、十句吐槽、YouTube 導向。
- Modify: `tests/devUnlock.test.mjs` - 實際點擊流程與可測亂數。

### Task 1: Specify Click 1, 3 and 5 Behavior

**Files:**
- Modify: `tests/devUnlock.test.mjs`

- [ ] **Step 1: Replace static-only checks with a functional badge fixture**

```js
function createBadge(textContent = "Free") {
  let clickHandler = null;
  return {
    textContent,
    addEventListener(type, handler) {
      if (type === "click") clickHandler = handler;
    },
    async click() {
      return clickHandler?.();
    },
  };
}

function createChrome(initialPlan = "free") {
  let plan = initialPlan;
  return {
    storage: {
      local: {
        async get() { return { "aiDebate.entitlementPlan": plan }; },
        async set(value) { plan = value["aiDebate.entitlementPlan"]; },
      },
    },
    currentPlan() { return plan; },
  };
}
```

- [ ] **Step 2: Add failing staged-dialog test**

```js
test("Free badge shows easter eggs on clicks one, three and five", async () => {
  const badge = createBadge();
  const chromeApi = createChrome("free");
  const alerts = [];
  const confirms = [];
  const opened = [];

  attachDevUnlock({
    planBadge: badge,
    chromeApi,
    showAlert: (message) => alerts.push(message),
    showConfirm: (message) => { confirms.push(message); return true; },
    openUrl: (url) => opened.push(url),
    random: () => 0.3,
    setTimer: () => 1,
    clearTimer: () => {},
  });

  await badge.click();
  await badge.click();
  await badge.click();
  await badge.click();
  await badge.click();

  assert.equal(alerts[0], "想做什麼呢！按再多次都沒用的唷");
  assert.equal(alerts.length, 2);
  assert.match(confirms[0], /https:\/\/www\.youtube\.com\/@gale0418/);
  assert.deepEqual(opened, ["https://www.youtube.com/@gale0418"]);
  assert.equal(chromeApi.currentPlan(), "pro");
});
```

- [ ] **Step 3: Add failing random-boundary and Pro-silence tests**

```js
test("third-click random selection stays inside all ten messages", () => {
  assert.equal(thirdClickMessage(() => 0), THIRD_CLICK_MESSAGES[0]);
  assert.equal(thirdClickMessage(() => 0.999999), THIRD_CLICK_MESSAGES[9]);
  assert.equal(THIRD_CLICK_MESSAGES.length, 10);
});

test("Pro badge keeps the five-click downgrade without Free taunts", async () => {
  // click five times with initial plan pro
  // assert no alerts, plan becomes free
});
```

Implement the Pro test fully using the same fixture and assert `alerts.length === 0` and `currentPlan() === "free"`.

- [ ] **Step 4: Run tests and verify RED**

Run: `node --test tests/devUnlock.test.mjs`

Expected: FAIL because exported message helpers and injectable dependencies do not exist.

### Task 2: Implement the Testable Easter Egg

**Files:**
- Modify: `src/sidepanel/dev-unlock.js`
- Modify: `tests/devUnlock.test.mjs`

- [ ] **Step 1: Add constants and deterministic selection**

```js
const YOUTUBE_URL = "https://www.youtube.com/@gale0418";

export const THIRD_CLICK_MESSAGES = [
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

export function thirdClickMessage(random = Math.random) {
  const sample = Number(random());
  const index = Math.min(THIRD_CLICK_MESSAGES.length - 1, Math.max(0, Math.floor(sample * THIRD_CLICK_MESSAGES.length)));
  return THIRD_CLICK_MESSAGES[index];
}
```

- [ ] **Step 2: Inject browser side effects with safe defaults**

Extend the function options:

```js
export function attachDevUnlock({
  planBadge,
  renderMessage,
  loadState,
  chromeApi = globalThis.chrome,
  showAlert = globalThis.alert,
  showConfirm = globalThis.confirm,
  openUrl = (url) => globalThis.open(url, "_blank", "noopener"),
  random = Math.random,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
}) {
```

Use `chromeApi.storage.local` everywhere instead of the global `chrome` binding.

- [ ] **Step 3: Implement staged Free-only dialogs**

Inside the click handler, read the current plan before choosing a dialog:

```js
const stored = await chromeApi.storage.local.get(ENTITLEMENT_STORAGE_KEY);
const currentPlan = stored?.[ENTITLEMENT_STORAGE_KEY] === "pro" ? "pro" : "free";

if (currentPlan === "free" && unlockClicks === 1) {
  showAlert?.("想做什麼呢！按再多次都沒用的唷");
} else if (currentPlan === "free" && unlockClicks === 3) {
  showAlert?.(thirdClickMessage(random));
}
```

At click five, toggle the plan. For Free to Pro:

```js
const goToYT = showConfirm?.(
  `恭喜解鎖🐑模式~\n\n作者 YouTube：\n${YOUTUBE_URL}\n\n要前往頻道嗎？`,
);
if (goToYT) openUrl?.(YOUTUBE_URL);
```

For Pro to Free, do not show Free click-one/click-three taunts and preserve `renderMessage("作者模式：Free 已啟用")`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/devUnlock.test.mjs`

Expected: all staged-dialog, random-boundary, downgrade and package-presence tests pass.

- [ ] **Step 5: Run the full suite**

Run: `npm test`

Expected: zero failed tests.

- [ ] **Step 6: Commit the easter egg**

```powershell
git add src/sidepanel/dev-unlock.js tests/devUnlock.test.mjs
git commit -m "feat: expand Free badge easter egg"
```
