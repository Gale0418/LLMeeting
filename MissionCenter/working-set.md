<!-- Generated materialized view. Do not edit directly; rebuild from canonical MissionCenter files. -->
<!-- mission-center-derived schema=1.0 fingerprint-format=sha256-v2-lf source-fingerprint=16eced7d4f9a2a1e88bfc6146dfdc1a5d4d5e9b35fcf427f8d326d9e21c0cf2c -->
# 當前工作集

- 唯一真實來源: `tasks.md`
- 可執行項目數: 6

| ID | 標題 | 優先級 | 狀態 | 下一步 | 依賴 | 驗證方式 | 阻塞原因 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LLM-E1 | LLMeeting MVP 收尾 | P1 | In Progress | 完成 Gemini Chrome 實機確認後擷取商店截圖 |  | 自動測試、語法檢查、Chrome 實機試跑、CodeRabbit review |  |
| LLM-E3 | 社交推理與劇場差異化 | P1 | In Progress | 完成揭曉證據板並通過本地驗證後推進劇場與實機收尾 |  | 自動測試、語法檢查、登入態 Chrome 實機試玩、CodeRabbit 小範圍 review |  |
| LLM-E4 | v0.5.0 Holographic Dragon Command Deck 發布準備 | P1 | In Progress | 完成文件、視覺方向、介面落地與發布驗證後再評估收尾 |  | 文件靜態檢查、自動測試、語法檢查、封裝與登入態 Chrome 驗證 |  |
| LLM-E5 | Web Provider Driver 與抗改版自癒 | P1 | In Progress | 完成能力契約、語意定位核心、五家 Driver、改版變異回歸與登入態 smoke |  | 單元測試、DOM mutation matrix、唯讀 Chrome 證據、語法／diff／封裝檢查 |  |
| LLM-T27 | 揭曉證據板 | P1 | Review | 固定呈現最後猜測、內鬼第一輪原文與真相，並保留可追溯證據順序 |  | 單元測試、UI 靜態檢查、揭曉流程手動試跑 |  |
| LLM-T28 | 荒謬但可辯護內鬼任務 | P1 | Review | 落地單一荒謬但自洽怪規則並驗證第一輪可辯護、最後一輪可揭曉 |  | prompt regression tests、至少 2 輪內鬼模式手動試跑 |  |
