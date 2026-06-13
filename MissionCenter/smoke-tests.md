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
| 2026-06-12 | LLM-T14 | 作者模式 Pro 解鎖 | `npm test` | dev unlock 測試與既有測試全部通過 | 53/53 pass | 通過 | automated |
| 2026-06-12 | LLM-T14 | 商店 zip 排除作者模式 | `npm run package`、`tar -tf dist\llmeeting-0.3.0.zip` | zip 不含 `src/sidepanel/dev-unlock.js` | 歷史結果：當時未出現；2026-06-14 已由 LLM-T15 改為公開彩蛋保留 | 通過 | automated |
| 2026-06-14 | LLM-T15 | 進階模式與公開彩蛋驗證 | `npm test`、`node --check src\sidepanel\app.js`、`node --check src\sidepanel\dev-unlock.js`、`node --check scripts\package-extension.mjs`、`node --check src\background\service-worker.js`、`npm run package`、`tar -tf dist\llmeeting-0.3.0.zip`、`git diff --check` | 單一主按鈕、進階模式互斥、彩蛋進 zip、無語法與 whitespace error | 53/53 pass；四個語法檢查 exit 0；zip 1,753,303 bytes 且含 `src/sidepanel/dev-unlock.js`；`git diff --check` 只有 CRLF 提示 | 通過 | automated |
| 2026-06-14 | LLM-T16 | 辯論輪次本地驗證 | `npm test`、`node --check src\background\debateEngine.js`、`node --check src\background\service-worker.js`、`node --check src\shared\prompts.js`、`node --check src\sidepanel\app.js`、`npm run package`、`tar -tf dist\llmeeting-0.3.0.zip`、`git diff --check` | 1-5 輪互評測試通過、語法正確、zip 內容仍只含 extension 檔案 | 57/57 pass；四個語法檢查 exit 0；zip 1,760,411 bytes 且含 `src/sidepanel/dev-unlock.js`；`git diff --check` 只有 CRLF 提示 | 通過 | automated |
| 2026-06-14 | LLM-T16 | CodeRabbit review 嘗試 | `coderabbit review --agent -t uncommitted` | 取得第三方 review 結果 | 執行環境因第三方資料輸出風險拒絕執行，需主人再次明確確認後重試 | 失敗 | external |
