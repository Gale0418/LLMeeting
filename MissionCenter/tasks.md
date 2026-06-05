# 任務

| ID | 標題 | 類型 | 上層 | 優先級 | 狀態 | 負責人 | 依賴 | 下一步 | 驗證方式 | 估算 | 標籤 | 備註 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LLM-E1 | LLMeeting MVP 收尾 | Epic |  | P1 | Review | Codex |  | 完成實機驗收與 review | 自動測試、語法檢查、Chrome 實機試跑 | 12 | chrome-extension, ai-debate | 0.2.0 已完成程式碼實作 |
| LLM-T1 | 多 AI 辯論基礎流程 | Task | LLM-E1 | P1 | Done | Codex |  | 無 | 使用 ChatGPT/Gemini/Grok 實際試跑，主人回報可運行 | 2 | mvp | 已完成 |
| LLM-T2 | Claude 參與者支援 | Task | LLM-E1 | P2 | Backlog | Codex | LLM-T7 | 等主人有 Claude 可用額度時實機測試 | Chrome 實機跑 Claude input/send/response selector | 2 | provider, claude | 目前僅保留 Beta |
| LLM-T3 | 快速鬪技場排程 | Task | LLM-E1 | P1 | Done | Codex |  | 無 | `npm test`、service worker 語法檢查 | 3 | pro-feature, scheduler | 已改成先送出再收回 |
| LLM-T4 | 總結目前問題開始辯論 | Task | LLM-E1 | P1 | Done | Codex |  | 無 | `npm test`、prompt test、side panel UI 檢查 | 3 | pro-feature, summary | 目前分頁 AI 會先產生上下文摘要 |
| LLM-T5 | 移除 Mock Mode 並更新 UI | Task | LLM-E1 | P1 | Done | Codex |  | 無 | side panel DOM/截圖檢查 | 1 | ui | 已換成快速辯論、總結辯論兩顆按鈕 |
| LLM-T6 | 自動化測試與語法驗證 | Task | LLM-E1 | P1 | Done | Codex |  | 無 | `npm test` 43/43、`node --check`、`git diff --check` | 1 | verification | `git diff --check` 只有 CRLF 提示 |
| LLM-T7 | Chrome 實機驗收 | Task | LLM-E1 | P1 | Ready | 主人 | LLM-T3, LLM-T4 | reload extension 後測快速辯論與總結辯論 | Chrome 實際分頁中跑 ChatGPT/Gemini/Grok | 2 | manual-smoke | 需要主人目前登入狀態 |
| LLM-T8 | CodeRabbit review | Task | LLM-E1 | P2 | Blocked | Codex | LLM-T6 | 等主人同意傳送 diff/code 給 CodeRabbit | `coderabbit review --agent --base-commit 6dfbf57` | 1 | review, third-party | 需明確同意資料傳送 |
| LLM-T9 | Pro 功能邊界與授權設計 | Task | LLM-E1 | P3 | Backlog | Codex | LLM-T7 | 決定哪些功能要鎖 Pro、是否做 license/backend | 文件化授權流程與 UI gate | 3 | monetization | 目前尚未實作付費牆 |
| LLM-T10 | 長文本與逾時韌性 | Task | LLM-E1 | P2 | Backlog | Codex | LLM-T7 | 收集實機卡住案例後調整 timeout/retry/摘要截斷 | 加入 timeout regression test 與手動壓力測試 | 3 | reliability | 總結辯論可能遇到超長對話 |
