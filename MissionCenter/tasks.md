# 任務

| ID | 標題 | 類型 | 上層 | 優先級 | 狀態 | 負責人 | 依賴 | 下一步 | 驗證方式 | 估算 | 標籤 | 備註 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LLM-E1 | LLMeeting MVP 收尾 | Epic |  | P1 | Review | Codex |  | 上架前擷取實際 Chrome Web Store 截圖 | 自動測試、語法檢查、Chrome 實機試跑、CodeRabbit review | 12 | chrome-extension, ai-debate | 0.3.0 已完成 Free/Pro 軟鎖、商店準備與進階模式收納 |
| LLM-T1 | 多 AI 辯論基礎流程 | Task | LLM-E1 | P1 | Done | Codex |  | 無 | 使用 ChatGPT/Gemini/Grok 實際試跑，主人回報可運行 | 2 | mvp | 已完成 |
| LLM-T2 | Claude 參與者支援 | Task | LLM-E1 | P2 | Done | Codex |  | 無 | 主人 Chrome 實機跑四家 AI 辯論，Claude 可參與 | 2 | provider, claude | 主人回報四家 AI 實機辯論正常 |
| LLM-T3 | 快速鬥技場排程 | Task | LLM-E1 | P1 | Done | Codex |  | 無 | `npm test`、service worker 語法檢查 | 3 | pro-feature, scheduler | 已改成先送出再收回 |
| LLM-T4 | 總結目前問題開始辯論 | Task | LLM-E1 | P1 | Done | Codex |  | 無 | `npm test`、prompt test、side panel UI 檢查 | 3 | pro-feature, summary | 目前分頁 AI 會先產生上下文摘要 |
| LLM-T5 | 移除 Mock Mode 並更新 UI | Task | LLM-E1 | P1 | Done | Codex |  | 無 | side panel DOM/截圖檢查 | 1 | ui | Mock 已移除；快速與總結後續收進進階辯論模式選項 |
| LLM-T6 | 自動化測試與語法驗證 | Task | LLM-E1 | P1 | Done | Codex |  | 無 | `npm test` 44/44、`node --check`、`git diff --check` | 1 | verification | `git diff --check` 只有 CRLF 提示 |
| LLM-T7 | Chrome 實機驗收 | Task | LLM-E1 | P1 | Done | 主人 | LLM-T3, LLM-T4 | 無 | Chrome 實際分頁中跑 ChatGPT/Gemini/Grok/Claude | 2 | manual-smoke | 主人回報四家 AI 實機沒問題 |
| LLM-T8 | CodeRabbit review | Task | LLM-E1 | P2 | Done | Codex | LLM-T6 | 無 | `coderabbit review --agent --base master --base-commit 93c108d` | 1 | review, third-party | CodeRabbit raised 3 minor issues，已驗證並修正 |
| LLM-T9 | Pro 功能邊界與授權設計 | Task | LLM-E1 | P3 | Done | Codex | LLM-T7 | 無 | README 與 design spec 記錄 Free/Pro 邊界 | 3 | monetization | Claude 不列為 Pro；快速鬥技場與總結辯論先列 Pro |
| LLM-T10 | 長文本與逾時韌性 | Task | LLM-E1 | P2 | Backlog | Codex | LLM-T7 | 收集實機卡住案例後調整 timeout/retry/摘要截斷 | 加入 timeout regression test 與手動壓力測試 | 3 | reliability | 總結辯論可能遇到超長對話 |
| LLM-T11 | 四家 AI 預設啟用 | Task | LLM-E1 | P1 | Done | Codex |  | 無 | `npm test` 檢查 DEFAULT_ACTIVE_PROVIDER_IDS 與 Claude checkbox | 1 | provider, ui | ChatGPT/Gemini/Grok/Claude 預設皆勾選 |
| LLM-T12 | Free/Pro 分層軟鎖 | Task | LLM-E1 | P1 | Done | Codex | LLM-T9 | 無 | `npm test` 48/48、service worker / sidepanel / entitlement 語法檢查 | 2 | monetization, ui | Free 保留四家 AI 基礎輪流辯論；Pro 鎖快速與總結 |
| LLM-T13 | Chrome Web Store 上架準備 | Task | LLM-E1 | P1 | Done | Codex | LLM-T12 | 無 | `npm test` 50/50、`npm run package`、zip 內容檢查 | 2 | webstore, packaging | 已補 package script、store listing、privacy policy、screenshot checklist |
| LLM-T14 | 作者模式 Pro 解鎖 | Task | LLM-E1 | P2 | Done | Codex | LLM-T12 | 無 | `npm test` 53/53、store zip 內容檢查 | 1 | dev-tool, entitlement | 五連點 Free badge 切換 Free/Pro；依主人要求作為公開彩蛋保留進商店 zip |
| LLM-T15 | 進階辯論模式收納 | Task | LLM-E1 | P1 | Done | Codex | LLM-T12 | 無 | `npm test`、side panel 語法檢查、store zip 內容檢查 | 1 | ui, monetization | 外層只留單一主按鈕；快速鬥技場與總結辯論改為進階設定互斥選項 |
| LLM-T16 | 辯論輪次設定 | Task | LLM-E1 | P1 | Review | Codex | LLM-T15 | 等主人在知情第三方資料傳輸風險後再次確認 CodeRabbit review | `npm test`、語法檢查、CodeRabbit review | 2 | ui, debate-engine, review | 1-5 輪交叉評析已完成；CodeRabbit review 被執行環境擋下 |
