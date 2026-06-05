# 筆記

- 補強優先順序：
  1. Chrome 實機驗收快速辯論。
  2. Chrome 實機驗收總結辯論。
  3. 跑 CodeRabbit review。
  4. 視實機結果補 retry、timeout、provider selector。
  5. 設計 Pro 功能授權與 UI gate。
- 主要風險：
  - AI 網頁 DOM 會變，selector 需要維護。
  - 背景分頁可能被節流，快速模式仍要依靠分頁輪流啟用。
  - 總結辯論遇到超長對話可能輸入太長，需要日後加入壓縮或截斷策略。
  - Claude 尚未真實驗證。
- 可賣錢但暫時不做的東西：
  - 會議紀錄匯出、歷史記錄、模板、評分表、授權系統、雲端同步。
