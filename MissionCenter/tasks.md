# 任務

| ID | 標題 | 類型 | 上層 | 優先級 | 狀態 | 負責人 | 依賴 | 下一步 | 驗證方式 | 估算 | 標籤 | 備註 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LLM-E1 | LLMeeting MVP 收尾 | Epic |  | P1 | In Progress | Codex |  | 完成 Gemini Chrome 實機確認後擷取商店截圖 | 自動測試、語法檢查、Chrome 實機試跑、CodeRabbit review | 12 | chrome-extension, ai-debate | 0.4.1 候選包與 CodeRabbit follow-up 已完成，剩實機與上架素材 |
| LLM-T1 | 多 AI 辯論基礎流程 | Task | LLM-E1 | P1 | Done | Codex |  | 無 | 使用 ChatGPT/Gemini/Grok 實際試跑，主人回報可運行 | 2 | mvp | 已完成 |
| LLM-T2 | Claude 參與者支援 | Task | LLM-E1 | P2 | Done | Codex |  | 無 | 主人 Chrome 實機跑四家 AI 辯論，Claude 可參與 | 2 | provider, claude | 主人回報四家 AI 實機辯論正常 |
| LLM-T3 | 快速鬥技場排程 | Task | LLM-E1 | P1 | Done | Codex |  | 無 | `npm test`、service worker 語法檢查 | 3 | pro-feature, scheduler | 已改成先送出再收回 |
| LLM-T4 | 總結目前問題開始辯論 | Task | LLM-E1 | P1 | Done | Codex |  | 無 | `npm test`、prompt test、side panel UI 檢查 | 3 | pro-feature, summary | 目前分頁 AI 會先產生上下文摘要 |
| LLM-T5 | 移除 Mock Mode 並更新 UI | Task | LLM-E1 | P1 | Done | Codex |  | 無 | side panel DOM/截圖檢查 | 1 | ui | Mock 已移除；快速與總結後續收進進階辯論模式選項 |
| LLM-T6 | 自動化測試與語法驗證 | Task | LLM-E1 | P1 | Done | Codex |  | 無 | `npm test` 44/44、`node --check`、`git diff --check` | 1 | verification | `git diff --check` 只有 CRLF 提示 |
| LLM-T7 | Chrome 實機驗收 | Task | LLM-E1 | P1 | Done | 主人 | LLM-T3, LLM-T4 | 無 | Chrome 實際分頁中跑 ChatGPT/Gemini/Grok/Claude | 2 | manual-smoke | 主人回報四家 AI 實機沒問題 |
| LLM-T8 | CodeRabbit review | Task | LLM-E1 | P2 | Done | Codex | LLM-T6 | 無 | `coderabbit review --agent --base master --base-commit 93c108d` | 1 | review, third-party | CodeRabbit raised 3 minor issues，已驗證並修正 |
| LLM-T9 | Pro 功能邊界與授權設計 | Task | LLM-E1 | P3 | Done | Codex | LLM-T7 | 無 | README 與 design spec 記錄 Free/Pro 邊界 | 3 | monetization | Claude 不列為 Pro；快速鬥技場與總結辯論先列 Pro |
| LLM-T10 | 長文本與逾時韌性 | Task | LLM-E1 | P2 | Done | Codex | LLM-T7 | 無 | timeout、長文本預算與服務錯誤 regression tests | 3 | reliability | ChatGPT 等待生成結束；提示內容有總字元預算；超載可自動重試 |
| LLM-T11 | 四家 AI 預設啟用 | Task | LLM-E1 | P1 | Done | Codex |  | 無 | `npm test` 檢查 DEFAULT_ACTIVE_PROVIDER_IDS 與 Claude checkbox | 1 | provider, ui | ChatGPT/Gemini/Grok/Claude 預設皆勾選 |
| LLM-T12 | Free/Pro 分層軟鎖 | Task | LLM-E1 | P1 | Done | Codex | LLM-T9 | 無 | `npm test` 48/48、service worker / sidepanel / entitlement 語法檢查 | 2 | monetization, ui | Free 保留四家 AI 基礎輪流辯論；Pro 鎖快速與總結 |
| LLM-T13 | Chrome Web Store 上架準備 | Task | LLM-E1 | P1 | Done | Codex | LLM-T12 | 無 | `npm test` 50/50、`npm run package`、zip 內容檢查 | 2 | webstore, packaging | 已補 package script、store listing、privacy policy、screenshot checklist |
| LLM-T14 | 作者模式 Pro 解鎖 | Task | LLM-E1 | P2 | Done | Codex | LLM-T12 | 無 | `npm test` 53/53、store zip 內容檢查 | 1 | dev-tool, entitlement | 五連點 Free badge 切換 Free/Pro；依主人要求作為公開彩蛋保留進商店 zip |
| LLM-T15 | 進階辯論模式收納 | Task | LLM-E1 | P1 | Done | Codex | LLM-T12 | 無 | `npm test`、side panel 語法檢查、store zip 內容檢查 | 1 | ui, monetization | 外層只留單一主按鈕；快速鬥技場與總結辯論改為進階設定互斥選項 |
| LLM-T16 | 辯論輪次設定 | Task | LLM-E1 | P1 | Done | Codex | LLM-T15 | 無 | `npm test`、語法檢查、CodeRabbit review | 2 | ui, debate-engine, review | 1-5 輪交叉評析已完成；CodeRabbit raised 2 minor issues 並已修正 |
| LLM-T17 | 修復 0.4.0 RC 後大型功能回歸 | Task | LLM-E1 | P1 | Done | Codex | LLM-T16 | 無 | `npm test`、`node --check`、diff 審查 | 5 | review, regression, interaction | MV3 恢復、run token、Pro gate、動態輪次、插話對齊與 response artifact 均已修復 |
| LLM-T18 | Free 五連點彩蛋對話 | Task | LLM-E1 | P2 | Done | Codex | LLM-T17 | 無 | 單元測試與封裝內容檢查 | 1 | easter-egg, ui | 第 1 次固定台詞，第 3 次從 10 句隨機挑選，第 5 次切換方案並顯示 YouTube 連結 |
| LLM-T19 | Gemini 可靠送出與確認 | Task | LLM-E1 | P1 | Review | Codex | LLM-T17 | 在登入 Gemini 的 Chrome 跑一次完整送出與收回 | 單元測試、content script 安全檢查與 Chrome 實機試跑 | 2 | gemini, automation, reliability | 自動測試已通過；按鈕未確認時只補一次 Enter，仍失敗會明確報錯 |
| LLM-E2 | 0.4.7 信任與穩定性版本 | Epic |  | P1 | Review | Codex | LLM-E1 | 完成五家 provider 登入態 smoke 後關閉週期 | 自動測試、語法檢查、封裝、Chrome 實機 smoke | 13 | hardening, privacy, meta-ai | 自動驗證與封裝完成；Meta AI 仍為 Beta |
| LLM-T20 | 文件、隱私與版本一致性 | Task | LLM-E2 | P1 | Done | Codex |  | 無 | store prep tests、版本一致性測試 | 2 | docs, privacy, webstore | README、商店文案、隱私政策與 0.4.7 已對齊 |
| LLM-T21 | 本機資料保留與清除 | Task | LLM-E2 | P1 | Done | Codex | LLM-T20 | 無 | session recovery、side panel、storage tests | 2 | privacy, storage, ux | 24 小時過期與一鍵清除 transcript／submitted run 已完成 |
| LLM-T22 | Provider adapter 與 Meta AI Beta | Task | LLM-E2 | P1 | Review | Gemini/Codex |  | 在登入態 Chrome 完成五家 provider smoke | provider、manifest、content safety、Chrome Meta smoke | 3 | provider, meta-ai, beta | adapter 與 Meta 自動測試完成；Meta 預設未啟用 |
| LLM-T23 | 長文本預算與提示引用邊界 | Task | LLM-E2 | P1 | Done | Codex |  | 無 | text、prompt、debate engine regression tests | 2 | prompt, reliability, safety | 限制總上下文並標示引用內容不是指令 |
| LLM-T24 | 辯論流程去重與 checkpoint | Task | LLM-E2 | P2 | Done | Codex | LLM-T22 | 無 | service worker safety、session recovery tests | 3 | mv3, architecture, maintainability | 共通流程已去重；checkpoint 可診斷中斷位置 |
| LLM-T25 | 0.4.7 完整驗證與封裝 | Task | LLM-E2 | P1 | Done | Codex | LLM-T20, LLM-T21, LLM-T22, LLM-T23, LLM-T24 | 無 | `npm test`、`node --check`、`git diff --check`、`npm run package` | 1 | verification, packaging | 116/116 pass；0.4.7 zip 已產生並檢查內容 |

