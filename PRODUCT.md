# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

使用 Chrome、同時登入多個 AI 網頁服務，想比較不同回答、觀點與推理過程的個人使用者。使用者在瀏覽器側邊欄提出問題、選擇參與者與流程，並在需要時中途插話或查看診斷資訊。

## Product Purpose

LLMeeting 是一個 Chrome MV3 擴充功能，從側邊欄協調多個已登入的 AI 網頁，讓同一個問題經過初始回答、交叉評析、互動討論與可選的主席總結。成功代表使用者能在同一個本機流程中清楚比較多家 AI 的回答，而不必手動往返複製貼上。

## Positioning

LLMeeting 的差異在於它協調的是使用者已登入的 AI 網頁，而非把內容先送到 LLMeeting 自有伺服器；AI 不只並排回答，也能依回合互讀、互評、扮演角色，並保留可追溯的逐段 transcript。

## Operating Context

- 使用者從 Chrome 工具列開啟 side panel，輸入問題或從目前 AI 分頁產生摘要。
- 使用者可選 ChatGPT、Gemini、Grok、Claude，並選擇性啟用預設關閉的 Meta AI Beta。
- 流程包含快速鬥技場、自由群聊、劇場大亂鬥與總結辯論；互動風格包含嚴肅互評、酒吧閒聊、無差別格鬥、Yes-and 與抓內鬼。
- 自由群聊沒有輪數上限，首輪後等待使用者插話、互評、結案或停止；其他模式可設定 1–5 輪交叉評析。
- 總結分為裁判總結、圍觀主席、匿名評論與全員匿名；全員匿名由每位參與者各自總結。一般結案只引用原問題與最後有效輪，內鬼揭曉另保留獨立首輪證據。
- 互動控制台的轉折靈感只追加草稿，不自動送出；診斷資訊與逐家修復入口協助理解 provider 狀態與錯誤。

## Capabilities and Constraints

- 目前穩定支援 ChatGPT、Gemini、Grok、Claude；Meta AI 為 Beta 且預設未啟用，頁面結構與帳號／地區可用性可能不同。
- 使用 Chrome Manifest V3 的 `sidePanel`、`storage`、`tabs`、`scripting` 與明確列出的 provider host permissions；自動化只作用於支援的 AI 網頁。
- 最新一場辯論狀態只保存在瀏覽器本機，最長 24 小時，並提供明確的清除入口；LLMeeting 不接收聊天內容到開發者伺服器。
- 服務超載可有限次數自動重新整理重送；額度／使用上限不重試。失敗時需保留可見服務狀態，不能把錯誤誤標成正式回答。
- 所有 LLMeeting 功能免費開放；AI 帳號、訂閱、額度與地區限制仍由各 provider 決定。🐑 模式僅為裝飾彩蛋，不解鎖功能。
- 版本與新設計文件可先進入發布準備；任何尚未完成的自動驗證、登入態 Chrome 試玩或商店上架，不得當成已發布功能宣稱。

## Brand Commitments

- 產品名稱為 LLMeeting；既有公開語氣為繁體中文、親切、帶有 AI 議事與戲劇化互動感。
- 既有品牌與素材包含機器人對話意象、`assets/llmeeting-icon-master.png`、`assets/icons/` 與 `assets/images/dragon-bg.png`；未經授權不得替換或臆造商標與商店證據。

## Evidence on Hand

- 產品入口與流程：`src/sidepanel/index.html`、`src/sidepanel/app.js`、`src/sidepanel/styles.css`。
- Provider 與共用規則：`src/shared/providers.js`、`src/shared/prompts.js`、`src/shared/entitlements.js`。
- 發布設定：`manifest.json`、`package.json`、`scripts/package-extension.mjs`。
- 既有驗證紀錄：`tests/` 與 MissionCenter 中記載的自動測試、封裝與 review 結果；登入態 Chrome 試玩仍須以當次實際結果為準。
- 沒有已核准的外部客戶、營收、效能基準或第三方背書；後續文件不得捏造這些證據。

## Product Principles

- 先讓使用者看懂每個 AI 的角色與狀態，再讓流程變得有趣。
- 內容在本機協調，資料邊界與 provider 責任要說清楚。
- 回合、引用、錯誤與揭曉證據必須可追溯，不能把推測包裝成事實。
- 功能可漸進增強；Beta provider 與未驗證流程都要保留誠實的狀態語言，不保證網站改版永遠無需維護。

## Accessibility & Inclusion

介面需支援鍵盤操作、可見 focus、語意化表單與展開區塊、足夠的文字／背景對比，以及不依賴顏色或動畫才能理解的 provider 狀態。動態更新應可被輔助科技理解；使用者可在不觀看動畫的情況下完成輸入、啟動、暫停、清除與閱讀 transcript。
