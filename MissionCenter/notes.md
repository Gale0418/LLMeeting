# 筆記

- 2026-10-02 main 原始碼保存與擴大 CodeRabbit 審查（LLM-T50）：
  1. 確認本機 main 與 origin/main 同為 b37be87，CodeRabbit 0.7.6 已登入；上次 review 12:47 已超過 rolling hour，重新計算本輪 2/3 次額度。隔離 repo 的空 main baseline 使未改動的舊程式也納入審查，共 48 個檔案，排除圖片、封裝、cache、MissionCenter 和大型歷史文稿；沒有為湊 150 製造重複檔案。
  2. 首掃 2 issues：Critical 是 startInteractiveDebate 的 busy guard 擋住合法 preflight-complete；Major 是互動劇場 local debateRounds 與 Engine 的內鬼最少兩輪不一致。新流程測試先重現兩者失敗，分別核實後修復，沒有套用未驗證建議。
  3. 修正 diff 三檔，隔離副本以審查前內容作 baseline；複查完成 0 issues（complete receipt 列出 17 個 context／reviewedFiles，並非只輸出三檔）。新全套 289/289；全量 node --check、封裝通過。zip 2304150 bytes；SHA256 8CDBBFEAE5A7B7659B4C69CB421133C269A2A7362AADFDD1E519E39C008A2295。
  4. README 已同步四模式、四總結方式、開放功能、Driver 韌性及最新驗證限制。此次只依使用者授權直接 main commit/push 原始碼，不建立分支／PR，不發布商店；T47/T50 保持 Review。Chrome extension E2E／窄側欄／鍵盤仍未知；前次專家快照不涵蓋本輪交接與輪數新修，不冒稱完整 CACC 已過。

- 2026-10-02 正式多席抓蟲與清理（LLM-T50，仍 Review）：
  1. 使用者批准三席 Luna＋獨立仲裁，各席累計 6000 tokens，總 24000 tokens／40 工具／30 分鐘，不逐輪重設；14:19 起。初輪盲審、封存後仲裁、聚焦修復複查，immutable artifact 在 output/mission-center-critique/LLM-T50-20261002-wave1～wave3。
  2. 修正已核實的延遲 storage.set 與 clear 競態（狀態 set/remove 共用序列佇列）、過期廣播、模型偏好保存失敗無提示、等待聊天重複搶焦點、匿名缺名編號映射（含文字版揭曉），及後續手動使用者回合污染擷取；新增相關回歸。手動回合偵測仍受真實虛擬 DOM 計數能力限制。
  3. Gemini 新建獨立 Chrome 對話測試粗體、斜體、空白段落及字面星號；只點傳送一次，實際收到 LLMEETING_GEMINI_FORMAT_OK。原使用者未送草稿未修改。現場 Quill 空段落為 p/br，精確來源重建已避免重複換行；不是 extension 全員匿名端到端通過證據。
  4. 全套 286/286；最後文字版匿名備援小修後 focused 7/7。src/tests/scripts 所有 JS/MJS node --check、git diff --check 通過（只有 CRLF 提示）；driver.5；zip 2304089 bytes，SHA256 D7989B330226F4CF3E9750A255F7023C84B94E3F7F5A9B6BFA2A37E7515CC126。
  5. CodeRabbit 本小時三次額度已用完，本輪新修未外部重掃。MissionCenter 套件未附 critic_contract.py，有限範圍檔案搜尋確認缺失，機器 schema validator 未執行。正式門檻維持 limited：Chrome extension 完整 allAnonymous 送出／擷取、320/480 實際側欄與鍵盤焦點仍 unknown，不以沒有發現 P0/P1 取代缺少的驗證。沒有 commit/push 或自動登入。

- 2026-10-02 Gemini 全員匿名總結送出前驗證補強（LLM-T47）：
  1. Chrome 唯讀現場：草稿保留；唯一「傳送訊息」按鈕 enabled 且屬於 composer，ql-editor 啟用 rich-query-formatting-enabled，內容已轉成 STRONG 節點。未取得該 run 原始提示字串，不能斷言歷史失敗必定是同一比對差異。
  2. 可重現程式缺陷：Markdown 粗體寫入驗證成功後被 Quill 非同步轉換，原本 readiness 僅逐字比較 innerText 與原始 Markdown，會拋 PROVIDER_SUBMISSION_NOT_READY。現在僅對該富文字 editor 重建已知粗斜體來源、仍精確比對完整文字；未加入模糊比對、延長等待或重送。
  3. content/background 握手升 driver.4；新增格式化通過、文字改動拒絕、非 Quill 不放行等測試。全套 278/278、兩來源 node --check、diff／封裝通過（2302534 bytes）。未點傳送、未改使用者草稿；extension 重載後實機驗收待完成。

- 2026-10-02 ChatGPT 實機訊息擷取修復（LLM-T47）：
  1. 已讀使用者引用「測試回應」對話；首輪、互評、總結實際有回答，但 LLMeeting 的引用誤記未確認送出，不能當成模型未回應。
  2. Chrome 唯讀 DOM 證據：既有 ChatGPT responseSelectors 與 userMessageSelectors 各 0 命中；data-chatgpt-search-unit-key 的 :assistant 與 :user 各辨識 4 則。assistant 只取其 data-chatgpt-selection-message-id 內容節點，避免 heading／控制鈕；同屬性保留回覆 identity。
  3. 保留舊 selector、新增兩個新版 selector；content script / background handshake 同升 driver.3。新增新版正文與舊 composer 未清空但新使用者訊息已出現的回歸測試。
  4. 相關 113/113、全套 277/277；三來源 node --check、git diff --check、封裝通過（2301594 bytes）。沒有重送訊息或 reload 使用者頁面；重新載入 extension 後的真實會議送出／擷取仍待驗，不宣稱現有 run 已恢復。未增加 CodeRabbit 次數。

- 2026-10-02 本機擴大抓蟲（LLM-T50，仍 Review）：
  1. 檢查 run/session 恢復、儲存、互動請求、總結及 provider driver；修正啟動重入、互動失敗清空草稿、重複互動請求、停止後舊儲存重試，以及讀不到舊 checkpoint 時最小 fallback 覆寫風險。
  2. 本小時第 3 次 CodeRabbit 完成（43 個 tracked 變更檔；不涵蓋 untracked），提出 2 minor：顯式 sheepMode=false 被舊 Pro 蓋過、空裁判結果回傳 undefined；已核實修正並加入行為測試，受額度限制未再次兔子重掃。
  3. 275/275 測試、三個修改來源語法、diff 檢查與封裝通過。zip 2301408 bytes；SHA256 2C26ED3CE1EE33EDFF2DD0B8EF12F1258912104842AB8766D70F11AEC8B5E684。
  4. 正式 CACC 尚未派席：Mission Center 要求使用者批准數值預算，已詢問 3 Luna 專家＋1 仲裁、每席 6000 tokens、總 24000 tokens／40 tools／30 分鐘，或精簡方案；尚未取得回答。不能宣稱完整專家驗收或無剩餘 P0/P1。
  5. Chrome 實際送出矩陣仍未完成；儲存 fence 只能阻止過期重試，不能取消 Chrome 已受理的 set。未 commit／push，保留既有未提交工作。

- 2026-10-02 readiness 通道修復：
  1. Chrome 唯讀確認 Grok 有唯一 DIV contenteditable textbox（Ask Grok anything）；Claude 目前網址為 /login 並顯示 Sign in，未進行登入或送出。
  2. 握手 1.5 秒、注入 3 秒、DOM readiness 5 秒與共同期限；只讀重查最多一次。注入結果未知不再啟第二次；DOM timeout 不強制換 listener。送題失去回覆不等同未送出，禁止通道錯誤自動重送。
  3. 同版重注入移除舊 listener，初始化完成才寫版本標記；content driver.2 強迫舊版 handshake 更新。一般 provider driver 的契約版仍為 1。
  4. 267/267 pass；兩次 CodeRabbit 共檢查 43 個已追蹤變更檔（未涵蓋 untracked 新檔），首輪 2 minor 已核實修正，末輪 0 issues；新檔有 Luna 測試與 Codex 檢查。定向工程複查未見新 P0/P1，不等同正式完整 CACC 或實機送出驗收。
  5. 封裝 2300918 bytes，SHA256 2F638C798430F2DB3A2A3E576AB57106B8DFDDDD9426E80E790499A17B02845D。已受理的單次 Chrome 注入無法取消；測試覆蓋晚完成不重複注入。Antigravity request llmeeting-readonly-channel-review-20261002 為 INPUT_REQUIRED，沒有審查結果。

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

- 2026-08-27 v0.5.0 provider readiness drift：
  1. Chrome 唯讀 DOM 顯示 Grok 使用 `div[aria-label='Ask Grok anything']`，空 composer 時送出控制可能延遲掛載；Claude 使用 `div[aria-label='Write your prompt to Claude']`，空 composer 的送出鈕可存在但 disabled。
  2. Claude 的側欄歷史對話「異星工廠停止更新的消息」讓「更多選項」aria-label 含有「停止」，觸發過寬的 `aria-label*='停止'` 假生成判斷；所有 provider 已改成完整停止片語與 test-id。
  3. 採 provider-specific accessibility／test-id selector、短輪詢等待 hydration、生成狀態 200ms 穩定取樣；不填入探測文字、不點擊、不依賴整頁泛用 `aria-busy`。
  4. 參考 GitHub 上的 multi-LLM orchestrator 與 AI council selector registry（僅作 Learn，不複製程式碼、不新增外部依賴），並以官方 Playwright locator 與 Chrome content-script 文件作為 selector 與 SPA DOM 判斷依據。
  5. 登入牆／provider error 會提前結束 readiness 輪詢；Gemini 首次回覆慢屬送出後冷啟動／生成等待，與 readiness 不混為同一狀態。
  6. Claude 空白 composer 的可編輯 div 與 `chat-input-send` 均存在，但送出鈕正常 disabled；已補 `sendControlDeferredWhenEmpty`，避免把待輸入狀態誤報為 `SEND_UNAVAILABLE`。

- 2026-09-21 Web Provider Driver 抗改版研究：
  1. 官方 Playwright locator 指南支持以 role、label 等使用者可見語意定位，並在每次動作重新解析 DOM；採為 LLMeeting 的語意 fallback 與 SPA 重驗原則。
  2. GitHub `microsoft/playwright`、`browserbase/stagehand`、`Skyvern-AI/skyvern` 僅作 Learn：採用 locator ladder、observe／validate／act、element evidence／fingerprint 概念；不引入 runtime LLM、遠端腳本、視覺服務或新增套件。
  3. 新增本機 `provider-driver.js`，統一 candidate dedupe、score、ambiguity margin、confidence、無頁面文字的結構指紋與 versioned capability contract。
  4. 模型策略固定為 `site-default`：provider 路由與模型 identity 分離；網站升級或改名時不猜名稱、不硬編碼版本，也不阻塞送出。
  5. Chrome 唯讀證據：ChatGPT 暴露 `prompt-textarea`／textbox；Gemini 為 `ql-editor`、`role=textbox`、aria「請輸入 Gemini 提示詞」；Grok 為 `data-testid=chat-input` 內 ProseMirror；Claude 為 `data-testid=chat-input` 與 disabled `chat-input-send`；Meta 為 Lexical `composer-input` 與 disabled `composer-send-button`。
  6. Antigravity read-only architecture lane request `6acfbf87-9415-4eb7-976c-8584fb5d8d77` 於 2026-09-23 對帳為 `COMPLETED/DONE`，marker `30bb742ff2d240e19719ace3b9157eb5`；交付唯讀架構報告，沒有修改工作樹。Codex 已逐項核對，不把報告中的建議直接視為已驗證事實。
  7. CodeRabbit 首輪確認兩項有效問題：過時 Gemini submission alias 造成假覆蓋、readiness 提示未說明 summary 會沿用來源分頁；修正後 follow-up 為 0 findings。
  8. 當時候選包 `dist/llmeeting-0.5.0.zip` 為 2288264 bytes，SHA256 `4870785DFE9AE6D0C30F33B738DF28426FDAF17C0AAA83EE3697919A179DB138`；T47 維持 Review，等待重載擴充套件後的五家 readiness／實際送出 smoke。

- 2026-09-23 Antigravity 架構報告驗收與回覆定位補強：
  1. 報告指出既有 `readAssistantSnapshot` 在 response selector 全失效時直接回傳空快照；程式碼核對屬實。
  2. 新增只接受明確 assistant／model 身分的語意備援，排除 user/human、身份不明文章與模型選單；既有 selector 優先，語意備援僅於沒有可用回覆時啟動。
  3. 報告建議預先派發合成 `beforeinput`，但該事件由 `dispatchEvent()` 產生時為 untrusted，不能保證富文本編輯器執行真實輸入的預設動作；保留現有寫入與同步驗證流程。
  4. `npm test` 238/238；修正最後一個模型選單反例後 targeted page automation 69/69；CodeRabbit uncommitted review 0 findings。
  5. 重建 `dist/llmeeting-0.5.0.zip` 為 2290452 bytes，SHA256 `F98798C5F2931FC8748F4D1A245FBD3024E9763C731F7B9C08B795C71B86DF56`；仍待重載擴充套件後的五家實際送出 smoke。

- 2026-10-02 免費產品體驗第一批：
  1. 保留所有功能免費與羊模式彩蛋，以 Impeccable harden 改善模式說明、空題焦點、逐家 readiness 修復指引及官方網頁入口，不改寫 Provider automation。
  2. 重置已有會議須確認；請求失敗不顯示假成功，以獨立 pending guard 阻擋重複重置。
  3. Chrome 模擬側欄的第二輪 320/480px QA 修正窄版標頭重疊；314/474px iframe 內容無水平溢位，修復入口高 44px。證據 `output/experience-320-480-recovery.jpg`，不是 extension E2E。
  4. 全套 296/296；最後未知狀態碼補強後相關 25/25、語法與 diff 通過。Impeccable detector 缺少 parser，degraded 並報既有規格漂移，不宣稱視覺全數通過。
  5. 當日 PRODUCT/DESIGN 尚有舊 Pro 與版面描述，僅記錄漂移；LLM-T49/T50 維持原狀，未重新做正式 council 或五家實際會議，不宣稱商用品質已達成。2026-10-03 已修正文檔漂移，未額外重設計介面。

- 2026-10-03 平台更新交接：
  1. 使用者回報目前正常並授權 main／CodeRabbit／平台更新；未提供逐模型模式矩陣，不據此補造完整 E2E 證據。
  2. CodeRabbit CLI 0.7.6 已登入；隔離 corpus 59 檔首查（含既有歷史核心），兩個有效 findings 經失敗回歸確認；修後複查實際覆蓋 22 檔，0 issues；本輪 2/3，單次均低於 150 檔。
  3. 開放式內鬼不套最低兩輪，首輪即可主動揭曉；恢復未完成輪以最後完整輪猜測為準，內鬼首輪獨立證據與 bounded 最低兩輪保持不變。
  4. 設定輪數 1–5 與執行輪號分離；全套 317/317、48 檔語法、diff、封裝通過。T36/T47/T49/T50 保持 Review，既有正式 CACC 為 limited。
  5. Chrome 官方後台禁止 scripting，未上傳／送審／發布；手動接手 dist/llmeeting-0.5.0.zip，2317446 bytes，SHA256 CCA5514ED6864DBE6182B51D970BF6C6909A44509796BF14314BEF41B1C0A70B。
