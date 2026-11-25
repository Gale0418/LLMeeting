<!-- Generated materialized view. Do not edit directly; rebuild from canonical MissionCenter files. -->
<!-- mission-center-derived schema=1.0 fingerprint-format=sha256-v2-lf source-fingerprint=9b8dfa7347d62a5436d531de6dd123010f7bba7e2b25fba28b8759ceea704984 -->
# 當前工作集

- 唯一真實來源: `tasks.md`
- 可執行項目數: 6

| ID | 標題 | 優先級 | 狀態 | 下一步 | 依賴 | 驗證方式 | 阻塞原因 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LLM-E1 | LLMeeting MVP 收尾 | P1 | In Progress | 完成 Gemini Chrome 實機確認後擷取商店截圖 |  | 自動測試、語法檢查、Chrome 實機試跑、CodeRabbit review |  |
| LLM-E3 | 社交推理與劇場差異化 | P1 | In Progress | 完成揭曉證據板並通過本地驗證後推進劇場與實機收尾 |  | 自動測試、語法檢查、登入態 Chrome 實機試玩、CodeRabbit 小範圍 review |  |
| LLM-E4 | v0.5.0 Holographic Dragon Command Deck 發布準備 | P1 | In Progress | 完成文件、視覺方向、介面落地與發布驗證後再評估收尾 |  | 文件靜態檢查、自動測試、語法檢查、封裝與登入態 Chrome 驗證 |  |
| LLM-E5 | Web Provider Driver 與抗改版自癒 | P1 | In Progress | 完成能力契約、語意定位核心、五家 Driver、改版變異回歸與登入態 smoke |  | 單元測試、DOM mutation matrix、唯讀 Chrome 證據、語法／diff／封裝檢查 |  |
| LLM-T82 | 長會議全文、回覆擷取與第 0 輪可靠性 | P1 | Review | 使用 0.5.3 修補版核對五家登入態的長會議與後續輪次 | LLM-T81 | Node 回歸、隔離 Chrome、封裝、CodeRabbit |  |
| LLM-T27 | 揭曉證據板 | P1 | Review | 真人內鬼至少兩輪，核對猜測／第一輪原文／真相順序；見acceptance-audit.md |  | 單元測試、UI 靜態檢查、揭曉流程手動試跑 |  |
