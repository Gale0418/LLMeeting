# LLMeeting Free / Pro Gate Design

## 目標

LLMeeting 先以 Chrome 商店免費安裝版發佈，不在這一階段接付款後端。插件內保留 Pro 入口與 entitlement 抽象層，讓之後接 Lemon Squeezy、綠界或自架授權時不需要重拆 UI 與 background flow。

## 功能切分

- Free：ChatGPT、Gemini、Grok、Claude 四家 AI 的基礎輪流辯論。
- Pro 預留：快速鬪技場、總結目前對話後開始辯論、歷史紀錄、匯出。
- Claude 不列入 Pro，因為它已經是基礎四模型辯論的一部分。

## 架構

- `src/shared/entitlements.js` 定義 plan、feature flags、功能標籤與 Pro 鎖定訊息。
- Side panel 使用 entitlement 決定按鈕外觀與點擊行為；Free 點 Pro 入口只顯示鎖定提示。
- Background service worker 也會檢查 Pro feature，避免有人繞過 side panel 直接送 runtime message。
- 基礎辯論使用 sequential scheduler；快速鬪技場保留既有先送出再收回的 fast scheduler。

## 驗證

- Entitlement test 驗證 Free/Pro feature matrix，且 provider access 不因 Pro 改變。
- Side panel static test 驗證基礎辯論按鈕、Pro 標籤與 Claude 預設勾選存在。
- Service worker static test 驗證 basic/fast scheduler 分流與 Pro gate 存在。
- 完整驗證以 `npm test`、service worker 語法檢查、side panel app 語法檢查為準。
