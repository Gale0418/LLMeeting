# Smoke Tests

| 日期 | 關聯任務 ID | 測試內容 | 測試方式 | 預期結果 | 實際結果 | 通過 / 失敗 | 執行類型 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-05 | LLM-T6 | 完整自動化測試 | `npm test` | 所有測試通過 | 43/43 pass | 通過 | automated |
| 2026-06-05 | LLM-T6 | Service worker 語法 | `node --check src\background\service-worker.js` | 無語法錯誤 | 無輸出，exit 0 | 通過 | automated |
| 2026-06-05 | LLM-T6 | Content script 語法 | `node --check src\content\provider-page.js` | 無語法錯誤 | 無輸出，exit 0 | 通過 | automated |
| 2026-06-05 | LLM-T6 | Side panel app 語法 | `node --check src\sidepanel\app.js` | 無語法錯誤 | 無輸出，exit 0 | 通過 | automated |
| 2026-06-05 | LLM-T6 | Diff whitespace 檢查 | `git diff --check` | 無 whitespace error | 只有 Windows CRLF 提示 | 通過 | automated |
| 2026-06-05 | LLM-T5 | Side panel 按鈕與 Mock 移除 | 本機預覽 DOM/截圖檢查 | 快速辯論、總結辯論可見，Mock 不存在，無水平溢出 | 按鈕寬 218px、高 46px，無水平溢出 | 通過 | manual |
| 2026-06-11 | LLM-T11 | 四家 AI 預設啟用 | `npm test` | DEFAULT_ACTIVE_PROVIDER_IDS 包含 ChatGPT/Gemini/Grok/Claude，Claude checkbox 預設 checked | 44/44 pass | 通過 | automated |
| 2026-06-11 | LLM-T12 | Free/Pro 完整自動化測試 | `npm test` | entitlement、side panel、service worker 測試全部通過 | 48/48 pass | 通過 | automated |
| 2026-06-11 | LLM-T12 | Free/Pro 語法檢查 | `node --check src\background\service-worker.js`、`node --check src\sidepanel\app.js`、`node --check src\shared\entitlements.js` | 無語法錯誤 | 三個指令皆無輸出，exit 0 | 通過 | automated |
| 2026-06-11 | LLM-T12 | Diff whitespace 檢查 | `git diff --check` | 無 whitespace error | exit 0，只有 Windows CRLF 提示 | 通過 | automated |
| 2026-06-11 | LLM-T8 | CodeRabbit review | `coderabbit review --agent --base master --base-commit 93c108d` | 取得 review 結果並修正真實問題 | 3 minor issues；2 個真實修正、1 個防禦性改善 | 通過 | external |
| 2026-06-11 | LLM-T13 | 商店準備測試 | `npm test` | store prep test 與既有測試全部通過 | 50/50 pass | 通過 | automated |
| 2026-06-11 | LLM-T13 | Chrome Web Store zip | `npm run package`、`tar -tf dist\llmeeting-0.3.0.zip` | 產生 zip，內容只含 manifest、assets、src | `dist\llmeeting-0.3.0.zip` 1,749,463 bytes；未包含測試與任務文件 | 通過 | automated |
