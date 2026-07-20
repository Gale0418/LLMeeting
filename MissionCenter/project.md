# 專案

- 目標：完成 LLMeeting 社交推理與劇場差異化切片，讓揭曉證據、荒謬但可辯護的內鬼任務、五角劇場人設與驗證流程可維護且可實機收尾。
- 週期：2026-07-21 社交推理與劇場差異化
- 標籤：chrome-extension, llmeeting, ai-debate, privacy, reliability, meta-ai
- 活動紀錄：
  - [2026-07-17] 從誤用 `git restore` 事故重建未提交的 service worker 功能，並修復 content script 重複區塊；完整測試恢復為 116/116。
  - [2026-07-17] 完成 0.4.7 自動驗證與候選包：116/116 測試通過；加入可見服務錯誤原文轉述、超載最多 3 次自動重新整理重送，額度不足不重試。
  - [2026-07-17] 使用者核准全方位審查補強項全部實作，並加入 Meta AI Beta；建立 LLM-E2 與 0.4.7 驗收範圍。
  - [2026-06-20] 依使用者要求升版為 0.4.1，準備重新封裝可上傳的 Chrome Web Store zip。
  - [2026-06-20] CodeRabbit 完成第三方審查：首輪 4 項建議中確認 3 項成立並已修正，follow-up uncommitted review 為 0 issues。
  - [2026-06-20] 0.4.1 候選包驗證完成：`npm test` 81/81 pass，`dist\llmeeting-0.4.1.zip` 1,809,886 bytes，封裝內容符合上傳需求。
  - [2026-06-19] 完成大型回歸修復：MV3 工作階段恢復、執行權杖、Pro gate、動態互動輪次、插話顯示、Gemini 回覆正規化與可靠送出、Free badge 1／3／5 彩蛋皆已落盤。
  - [2026-06-19] 最終自動驗證：`npm test` 78/78、10 個變更 JavaScript 語法檢查通過、diff whitespace 無錯誤、0.4.0 商店包內容正確。
  - [2026-06-18] 使用者核准完整修復設計：包含 MV3 狀態恢復、取消競態、Pro 邊界、動態回合、Free 彩蛋與 Gemini 可靠送出。
  - [2026-06-18] 本地審查完成：`npm test` 51/54，diff whitespace 檢查失敗，並確認 Pro 邊界、互動回合、MV3 狀態恢復與緊急停止風險。
  - [2026-06-18 14:38:18 +08:00] 新增 LLM-T17 大型功能回歸審查；鍵定 `d12bca6..HEAD` 範圍。
  - [2026-06-11 17:06:09 +08:00] 檢查程式狀態，發現 Claude 已有部分未提交的穩定性修改；新增四家 AI 預設啟用並更新到 0.2.2。
  - [2026-06-05 20:59:28 +08:00] 建立 MissionCenter 任務板，整理目前完成狀態、驗證紀錄與補強項。
  - [2026-06-05 20:59:28 +08:00] 快速辯論與總結辯論已實作到 0.2.0，等待使用者在 Chrome 實際 reload 後試跑。
- 開放留言：
  - Gemini 可靠送出已有單元與來源安全測試，仍需在使用者登入的 Chrome 實際跑一次完整流程。
  - 0.4.1 上傳包已產生；商店截圖仍待乾淨實機畫面。
  - MissionCenter `sync_mission_center.py` 無法解析既有繁中欄位，本輪保留手動同步。


  - [2026-07-21] 使用者核准 LLM-E3「社交推理與劇場差異化」：鎖定 Gemini 腦洞鬧場原文、Grok 短週期輿情、Meta 長週期群體採用，揭曉保留最後猜測與內鬼第一輪原文並附真相，內鬼採單一荒謬但自洽怪規則。
  - CodeRabbit 已取得明確上傳同意；僅在本地驗證後做小範圍審查，任何維修先交由使用者查看。
  - [2026-07-21] T30 CodeRabbit minor 修正完成：app.js transcript 支援 reveal-only、新增 diagnostics regression；165/165 pass、uncommitted review 0 issues，並產出 0.4.7 封裝。
