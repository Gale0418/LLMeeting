<!-- Generated materialized view. Do not edit directly; rebuild from canonical MissionCenter files. -->
<!-- mission-center-derived schema=1.0 fingerprint-format=sha256-v2-lf source-fingerprint=a4e361ad408109742f25ead8e9df5eca7a1481f1ab99775a32a4cabe01e84846 -->
# 當前工作集

- 唯一真實來源: `tasks.md`
- 可執行項目數: 6

| ID | 標題 | 優先級 | 狀態 | 下一步 | 依賴 | 驗證方式 | 阻塞原因 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LLM-E1 | LLMeeting MVP 收尾 | P1 | In Progress | 完成 Gemini Chrome 實機確認後擷取商店截圖 |  | 自動測試、語法檢查、Chrome 實機試跑、CodeRabbit review |  |
| LLM-E3 | 社交推理與劇場差異化 | P1 | In Progress | 完成揭曉證據板並通過本地驗證後推進劇場與實機收尾 |  | 自動測試、語法檢查、登入態 Chrome 實機試玩、CodeRabbit 小範圍 review |  |
| LLM-E4 | v0.5.0 Holographic Dragon Command Deck 發布準備 | P1 | In Progress | 完成文件、視覺方向、介面落地與發布驗證後再評估收尾 |  | 文件靜態檢查、自動測試、語法檢查、封裝與登入態 Chrome 驗證 |  |
| LLM-T36 | v0.5.0 驗證、實機與封裝 | P1 | In Progress | 完成自動測試、登入態 Chrome smoke matrix、CodeRabbit 審查與新版封裝 | LLM-T35, LLM-T37, LLM-T42 | npm test、node --check、git diff --check、npm run package、登入態 Chrome、CodeRabbit |  |
| LLM-T42 | 全域對抗回歸與登入態 Smoke | P1 | In Progress | 完成動態競態、五家登入態 Chrome、劇場恢復、Impeccable 與封裝驗證 | LLM-T38, LLM-T39, LLM-T40, LLM-T41 | npm test、node --check、git diff --check、Chrome matrix、Impeccable、package、第三方 review |  |
| LLM-T27 | 揭曉證據板 | P1 | Review | 固定呈現最後猜測、內鬼第一輪原文與真相，並保留可追溯證據順序 |  | 單元測試、UI 靜態檢查、揭曉流程手動試跑 |  |
