# 筆記

- 2026-07-17 0.4.7 補強範圍：
  1. 商店目前版本與 repo 0.4.6 不一致，README 的 API 敘述也與實作不符。
  2. 最新 transcript、summary 與 diagnostics 會存在 `chrome.storage.local`，需要保留期限與真正清除入口。
  3. Provider DOM 設定將抽成封裝內 adapter；Meta AI 只作為預設未勾選的 Beta。
  4. 長文本採總字元預算與可見截斷，不以關鍵字刪除代替提示注入防護。
  5. 群聊與劇場共通流程需去重；MV3 running 中斷保留 checkpoint 診斷，不宣稱能無條件續跑第三方 DOM 操作。
  6. 錯誤辨識同時檢查回覆區與可見 alert／aria-live 錯誤提示；超載自動 F5 重送 3 次，額度不足直接轉述原文給其他 AI。
- 2026-07-10 抓內鬼模式高級化：
  1. Antigravity/Gemini 透過本機 bridge 參與規則審查，確認 0/1 內鬼、偏航任務與延後指認可改善第一輪秒殺。
  2. 內鬼 secret prompt 從「放錯誤」改成「用半真半假、定義偷換、重點排序、範圍外推等手法讓討論偏航」。
  3. 抓內鬼模式現在至少跑 2 輪互評；第一輪只能釐清前提與追問，最後一輪才可判斷沒有內鬼或誰最像內鬼。
  4. 每局可能沒有內鬼，避免所有模型預設一定要抓出一個人。
- 2026-06-19 修復結果：
  1. `recoverSession()` 只恢復完整的等待互動快照；執行中遭回收會轉成可見錯誤，不假裝續跑半個 DOM 自動化步驟。
  2. `RunController` 以 generation token 阻止停止後或新任務開始後的舊非同步結果寫回。
  3. 互動輪次可超過初始 1 到 5 輪設定，且 `USER` 插話與 AI 回覆共用同一輪資料來源。
  4. Gemini 送出由輸入清空、生成開始或使用者訊息新增確認；只有未確認時補一次 Enter。
  5. Free badge 第 1、3、5 次點擊行為已有可注入亂數、儲存與對話框的單元測試。

- 2026-06-20 CodeRabbit follow-up：
  1. 首輪 review 提出 4 項建議，其中 3 項成立：prompt 互動風格測試、persona prompt 測試、Free badge 極速連點重入保護。
  2. sessionRecovery 的 createIdleState() 參數建議未採納，因為 service worker 端本來就以預設參數支援省略呼叫，並非真實 bug。
  3. 升版目標改為 0.4.1，重新產出可上傳商店 zip。

- 2026-06-18 審查發現：
  1. 自由群聊與劇場模式標示為 Pro，但 entitlement 和 background 都沒有 gate，Free 可直接啟動。
  2. MV3 service worker 恢復儲存的 `runtimeState` 時沒有恢復 `engine`，互動續聊在 worker 被回收後會用空 engine。
  3. 互動輪數可增加到 6 以上，但 job 與寫入仍被 `normalizeDebateRounds()` 夾在 5，導致第 6 輪永遠不完整。
  4. 緊急停止只用全局 boolean；新任務會把它重置，舊異步任務回來後可能汙染新 engine/state。
  5. 新增 835 行功能沒有同步新增或修改測試，目前 `npm test` 有 3 項失敗。
  6. 互動插話的 `userMessages` 以緊密陣列儲存，UI 卻以實際輪號取值，多輪後會顯示在錯的輪次。
  7. 回覆文字末尾的 `image` 會在所有 provider 被無條件移除，可能截斷合法回覆。
- 補強優先順序：
  1. reload LLMeeting 0.4.1 後手動試跑基礎辯論與多輪互評。
  2. 五連點 Free badge 切換 Pro，試跑進階辯論設定裡的快速鬥技場與總結辯論。
  3. 依 `store/screenshot-checklist.md` 擷取商店截圖。
  4. 視實機結果補 retry、timeout、provider selector。
  5. 未來再接付款平台與授權後端。
- 主要風險：
  - AI 網頁 DOM 會變，selector 需要維護。
  - 背景分頁可能被節流，快速模式仍要依靠分頁輪流啟用。
  - 總結辯論遇到超長對話可能輸入太長，需要日後加入壓縮或截斷策略。
  - 交叉評析輪次越多，實際等待時間與 AI 網頁用量會線性增加。
- 可賣錢但暫時不做的東西：
  - 會議紀錄匯出、歷史記錄、模板、評分表、授權系統、雲端同步。
  - 快速鬥技場與總結辯論已先放進 Pro gate，等後續授權來源接上再解鎖。


- 2026-07-20：羊模式補強完成：五連點徽章顯示 free🐑、fre🐑、fr🐑、f🐑、🐑；🐑 為單向解鎖，Reset 恢復 Free，並保留作者頻道跳轉。

- 2026-07-21 LLM-E3 核准方案：
  1. Gemini 腦洞鬧場保留原文並鎖定版本，避免改寫後失去可追溯性。
  2. Grok 聚焦短週期輿情，Meta 聚焦長週期群體採用；兩者不混用時間尺度。
  3. 揭曉板固定呈現最後猜測、內鬼第一輪原文與真相，讓玩家可回看證據鏈。
  4. 內鬼只使用一條荒謬但自洽的怪規則，維持可辯護性與戲劇張力。
  5. CodeRabbit 僅在本地驗證後小範圍上傳審查；任何修補先交使用者確認。
- 2026-07-21 同步檢查：檢視技能目錄 sync_mission_center.py 與 visual_state.py；目前可辨識主要繁中欄位，但 sync 會改寫 progress/project 並在 MissionCenter 外產生 HUD state，不符合本輪只修改 MissionCenter/既有檔案的範圍，因此不執行，保留 HUD。
- 2026-07-21 T30 follow-up：
  1. 修正 CodeRabbit minor：src/sidepanel/app.js transcript 支援 reveal-only，並新增 diagnostics regression。
  2. npm test 165/165；修後 CodeRabbit uncommitted review 0 issues。
  3. npm run package 產出 dist/llmeeting-0.4.7.zip，2186164 bytes，SHA256 51897478EF8B5D671799541F6DAC4261B0E13D22C97C9A4100246EBFB154DB9C。
  4. T30 維持 Review，T31 維持 Backlog；不得標 Done。