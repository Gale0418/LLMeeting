# LLMeeting 主席與匿名總結模式設計

## 狀態

- 日期：2026-07-01
- 核准者：主人
- 實作原則：最小安全變更、先測試後實作、保留既有辯論行為、兩個新模式皆放在 Pro

## 背景

LLMeeting 目前支援一般裁判總結：參與辯論的 AI 完成第一輪回答與交叉評析後，由 `summaryProvider` 接收完整資料並產生總結。主人希望新增兩種更高階的總結策略：

1. 圍觀主席制：主席不能親自下場辯論，只在其他 AI 辯論完後收集資料總結。
2. 匿名評論制：參與 AI 先用可愛匿名名稱發言，最後把匿名後資料交給一個新開的主席對話視窗總結。

兩者都屬於 Pro 功能，且是互斥的「總結方式」，不是可以同時開啟的 checkbox。

## 目標

1. 在進階設定新增互斥的 `總結方式` 選項：一般總結、圍觀主席制、匿名評論制。
2. 在既有「由誰擔任裁判總結」下拉選單新增 `隨機主席`。
3. 圍觀主席制從已勾選 AI 池決定主席，主席排除於辯論者外，剩餘至少 2 家 AI 才能開始。
4. 匿名評論制由所有已勾選 AI 參與辯論，第一輪 prompt 第一行要求輸出 `匿名名：...`，最後以匿名資料交給新開主席視窗。
5. 隨機主席只從已勾選 AI 抽；未勾選 provider 完全不參與，也不會被抽去當主席。
6. 修正 Free badge 重複綁定導致需要點十下、且第一句提示出現兩次的問題。

## 非目標

- 不新增 provider。
- 不新增付款後端或雲端授權驗證。
- 不改寫整個 `service-worker.js` 排程器。
- 不把匿名評論制拆成額外「先問名字」的獨立網頁自動化輪次。
- 不讓未勾選 provider 以任何身分參與本場流程。
- 不改變現有一般總結、快速鬥技場、自由群聊、劇場模式的既有語意，除非它們顯式使用新總結方式。

## 設計方案

### 1. Feature gate

新增兩個 Pro-only feature gate：

- `observerChair`：圍觀主席制。
- `anonymousReview`：匿名評論制。

Free 模式會在 side panel 隱藏或鎖住這兩個總結方式；background 也必須用 `requireProFeature()` 做最後防線，避免直接送 runtime message 繞過 UI。

### 2. UI

進階設定新增 `總結方式` radio group：

- `一般裁判總結`：現有行為。
- `圍觀主席制 PRO`：主席不下場。
- `匿名評論制 PRO`：匿名後交給新主席視窗。

既有 `summaryProviderSelect` 新增 `隨機主席` 選項，內部值可用 `random`。這個欄位仍是唯一的主席選擇來源，避免新增第二組裁判設定讓 UI 變胖。

### 3. 主席解析

啟動辯論時先根據 `summaryStrategy` 與 `summaryProvider` 解析出本場固定主席：

- 具名主席：使用該 provider。
- 隨機主席：只從本場已勾選 provider 抽一個。

解析結果必須存入 runtime state 與 engine snapshot，例如 `resolvedSummaryProvider`。一旦抽中，本場不再重新抽籤；service worker 恢復或 UI 重繪也必須使用同一位主席。

### 4. 圍觀主席制

圍觀主席制的可用池是使用者勾選的 provider。流程：

1. 從勾選池解析主席。
2. 從辯論者清單排除主席。
3. 若剩餘辯論者少於 2，立即回傳清楚錯誤，不建立 `DebateEngine`。
4. 其他 AI 照現有第一輪與互評流程辯論。
5. 最終總結送給已解析主席。

固定主席若有勾選，仍會被視為本場可用 AI，但只擔任主席，不參加第一輪與互評。

### 5. 匿名評論制

匿名評論制不另外增加「取名輪次」，而是在第一輪 prompt 開頭加入格式要求：

```text
請先為本場討論取一個可愛匿名名，第一行必須使用：
匿名名：<你的匿名名>

第二行之後再回答問題。
```

背景收到第一輪回答後解析匿名名：

- 優先讀取第一行 `匿名名：...`。
- 移除過長、空白、換行、Markdown 標記與明顯廢話。
- 若解析失敗，使用穩定 fallback，例如 `星砂麻糬 1`、`雲朵布丁 2`。

第一輪與互評仍可在內部用真實 provider id 記錄，方便診斷與恢復；只有交給主席的最終 prompt 使用匿名名稱。

匿名評論制最後必須強制新開主席對話視窗，即使主席 provider 與某個辯論 provider 相同，也不能重用該 provider 的辯論分頁。這需要在送 final job 時支援 `forceNewTab` 或獨立的主席 tab binding，避免 `getOrCreateProviderTab()` 拿到既有辯論 tab。

### 6. Prompt 與資料格式

`buildFinalSummaryPrompt()` 支援可選 `speakerLabels` 或 `anonymousNames` map。一般與圍觀主席制使用真實 label；匿名評論制傳入匿名 label。

最終匿名 prompt 不應包含 ChatGPT、Gemini、Grok、Claude 等真實 provider label。錯誤與診斷資料仍保留在 side panel 與 transcript，不塞進主席 prompt。

### 7. Free badge 修復

目前症狀是 Free badge 需要點十下，且第一句「想做什麼呢！按再多次都沒用的唷」出現兩次。根因是 side panel 可能重複初始化或文件殼重複，導致 `attachDevUnlock()` 綁定多個 click handler。

候選修復保留：

- `src/sidepanel/index.html` 只有一組 document shell。
- `attachDevUnlock()` 在 `planBadge` 上寫入私有 attached key，同一 DOM 只綁定一次。
- 新增 double attach regression test。

## 資料流

1. Side panel 收集：勾選 provider、辯論模式、總結方式、主席選擇、輪次、互動風格。
2. Background 驗證 Pro gate 與 provider 數量。
3. Background 解析並固定 `resolvedSummaryProvider`。
4. 圍觀主席制先排除主席再建立 `DebateEngine`。
5. 匿名評論制建立 engine 時帶入匿名命名要求，第一輪回覆後解析 `anonymousNames`。
6. 互評與互動照現有 engine 狀態流運行。
7. 最終總結階段依總結方式建立 final job：
   - 一般總結：現有 provider tab 行為。
   - 圍觀主席制：主席 tab 收真實 label 資料。
   - 匿名評論制：強制新開主席 tab，收匿名 label 資料。

## 錯誤處理

- Free 使用 Pro 總結方式：顯示 Pro 鎖定提示，background 回 `PRO_REQUIRED`。
- 圍觀主席制剩餘辯論者少於 2：提示「圍觀主席制至少需勾選 3 家 AI」。
- 隨機主席候選池為空：提示至少勾選 1 家 AI；實務上辯論本身仍要求至少 2 家。
- 匿名名解析失敗：使用穩定 fallback，不中斷辯論。
- 匿名主席新視窗建立失敗：回報主席 provider 與目前網址，不把結果寫成完成。
- service worker 恢復：保留已解析主席與匿名名，不重新抽主席或改名。

## 測試策略

先補失敗測試，再實作。

- Entitlement test：Free 鎖 `observerChair` 與 `anonymousReview`，Pro 解鎖。
- Side panel static test：總結方式 radio group 存在，兩個新模式標為 Pro，主席下拉有 `隨機主席`。
- Service worker test：兩個新模式都走 background Pro gate。
- 主席解析 test：隨機主席只從已勾選 provider 抽，解析後固定。
- 圍觀主席 test：固定主席被排除，剩餘不足 2 時優雅失敗。
- Snapshot/restore test：`resolvedSummaryProvider` 與匿名名保留，不重抽不重算。
- 匿名解析 test：標準 `匿名名：...` 可解析，非標準與過長文字 fallback。
- Final prompt test：匿名評論制的最終 prompt 不含真實 provider label，改用匿名名。
- Tab routing test：匿名評論制 final job 強制新開主席視窗，不重用辯論分頁。
- Free badge regression：重複 attach 只處理每次點擊一次，五下切換一次。
- 完整驗證：`npm test`、變更檔 `node --check`、`git diff --check`。

## 驗收條件

1. Free 看不到或不能啟動兩個新 Pro 總結方式。
2. Pro 可選一般總結、圍觀主席制、匿名評論制，三者互斥。
3. 圍觀主席制不會讓主席出現在第一輪與互評 job 中。
4. 隨機主席一場只抽一次，恢復狀態後不改變。
5. 匿名評論制最終主席 prompt 只看到匿名名，不看到真實 provider 名稱。
6. 匿名評論制主席視窗一定是新對話，不污染辯論分頁。
7. Free badge 回到五下切換，不再出現雙重第一句提示。
8. 相關單元測試與現有回歸測試通過。

## 風險與緩解

- AI 不遵守匿名名格式：用解析器與 fallback 名稱緩解。
- 多一段 prompt 讓第一輪答案格式變亂：只要求第一行固定，第二行後正常回答。
- 隨機主席狀態漂移：解析後寫入 runtime state 與 engine snapshot。
- 同 provider 主席污染原辯論 tab：匿名 final job 強制新開 tab。
- 現有工作樹已有大量未提交格式變更：實作時限制檔案範圍，避免無關重排。

## Gemini 協作審查

本設計已透過本機 Antigravity/Gemini loopback bridge 做不改檔審查。Gemini 認可最小安全方向，並提醒：

- 圍觀主席制要先檢查勾選數，避免排除主席後只剩 1 家 AI。
- 匿名名獨立取名輪次會拖慢流程，併入第一輪 prompt 較穩。
- Free badge 的 attached key 與單一 document shell 可對應「十下與雙 alert」症狀。
