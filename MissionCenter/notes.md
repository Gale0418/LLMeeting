# 筆記

- 2026-06-18 審查發現：
  1. 自由群聊與劇場模式標示為 Pro，但 entitlement 和 background 都沒有 gate，Free 可直接啟動。
  2. MV3 service worker 恢復儲存的 `runtimeState` 時沒有恢復 `engine`，互動續聊在 worker 被回收後會用空 engine。
  3. 互動輪數可增加到 6 以上，但 job 與寫入仍被 `normalizeDebateRounds()` 夾在 5，導致第 6 輪永遠不完整。
  4. 緊急停止只用全局 boolean；新任務會把它重置，舊異步任務回來後可能汙染新 engine/state。
  5. 新增 835 行功能沒有同步新增或修改測試，目前 `npm test` 有 3 項失敗。
  6. 互動插話的 `userMessages` 以緊密陣列儲存，UI 卻以實際輪號取值，多輪後會顯示在錯的輪次。
  7. 回覆文字末尾的 `image` 會在所有 provider 被無條件移除，可能截斷合法回覆。
- 補強優先順序：
  1. reload LLMeeting 0.4.0 後手動試跑基礎辯論與多輪互評。
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
