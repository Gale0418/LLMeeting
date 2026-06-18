# LLMeeting 大改回歸修復與 Free 彩蛋設計

## 狀態

- 日期：2026-06-18
- 核准者：主人
- 實作原則：最小安全變更、先測試後實作、不夾帶無關重構

## 目標

1. 修復 MV3 service worker 重啟後互動會議使用空 `DebateEngine` 的問題。
2. 修復緊急停止後舊異步回覆汙染新會議的競態。
3. 統一自由群聊、劇場模式的 Free/Pro 前後端邊界。
4. 允許互動會議在初始 1至5 輪之後繼續新增回合，不寫回第 5 輪。
5. 讓使用者插話顯示在正確回合，並納入最後總結。
6. 修正回覆末尾 `image` 被過度移除的資料損壞。
7. 恢復現有自動測試為全綠，並為新行為增加回歸測試。
8. 完成 Free badge 第 1、3、5 次點擊的彩蛋對話。
9. 修復 Gemini 偶發「輸入已寫入但未送出」，且不造成重複送出。

## 非目標

- 不重寫整個 `service-worker.js`。
- 不更換 Chrome extension 框架或引入 UI 框架。
- 不新增付款後端、雲端同步或新的 provider。
- 不對 Gemini 進行無條件重試，避免重複送出提示。
- 不改變目前四家 AI 的預設啟用狀態。

## 設計方案

### 1. 可恢復的辯論階段

`DebateEngine` 的 snapshot 要包含繼續建立 prompt 所需的設定：`activeProviders`、`summaryProvider`、`interactionStyle`、`isTheaterMode` 與 `customPersonas`。

新增可測試的 restore API，從儲存的 transcript 與階段設定重建 engine。`getRuntimeState()` 讀到 `waiting_for_user` 時，必須同步恢復 engine。如果儲存狀態是 `running`，代表 worker 在異步作業中被中斷，應轉為可讀的 error 狀態並要求重新開始，不假裝續傳尚未完成的網路等待。如果 snapshot 驗證失敗，則安全回到 idle，保留診斷訊息，不使用半套狀態繼續。

### 2. Run token 與取消

以小型 `RunController` 取代全局 `isAborted` boolean。每次 start 或 next-round 取得獨立 token；stop、reset 或新任務會使舊 token 失效。

每個會寫入 engine/runtimeState 的異步邊界，都在 await 後檢查 token。舊 provider 回覆可完成網頁端等待，但不得寫入新會議、發佈 error 或覆蓋「已緊急暫停」。

### 3. Free/Pro 邊界

新增單一 feature ID `chatMode`，Free 為 `false`、Pro 為 `true`。`chat` 與 `theater` 在 side panel 的 `featureForMode()` 及 background 的啟動函式都使用這個 ID。

前端 gate 只負責體驗，background `requireProFeature()` 是最後邊界，不信任 UI 傳入。

### 4. 初始回合與動態回合

`normalizeDebateRounds()` 僅用於初始設定，仍限制 1至5。互動期間已存在的 `critiqueRounds.length` 是實際上限，`recordCritique()`、`buildCritiqueJobs()` 與 phase 解析不再將動態輪號夾在 5。

不允許跳輪或寫入不存在的輪號；這些狀況應立即拋出明確錯誤。

### 5. 使用者插話

每輪 `critiqueRounds[index].USER` 是插話的單一來源。UI 與最終總結都從該輪讀取，不再使用無法對齊輪號的緊密 `userMessages` 陣列。

現有互動 snapshot 已同時在所屬回合寫入 `USER`，因此 restore 保留該欄位即可。舊 `userMessages` 可保留但不再當作 UI 與總結的來源，避免無法確定輪號時錯誤搬移。

### 6. Provider 回覆後處理

不再從所有 provider 回覆無條件移除末尾單字 `image`。只在 Gemini 回覆的最後一行完整等於 UI artifact `image` 時移除；「This is an image」等合法句子必須保留。

### 7. Gemini 可靠送出

Gemini 送出按鈕應優先從輸入框所在 composer 尋找 provider-specific `send-button`，廣泛 `button[type='submit']` 僅為後備。

寫入完成後，先確認輸入框反映 prompt 且按鈕可用。點擊後不立即回報成功，必須在限時內觀察下列任一證據：

- 輸入框清空。
- provider 進入產生中狀態。
- 使用者訊息 snapshot 新增或出現該 prompt。

若無證據且 prompt 仍完整留在輸入框，才使用 Enter 補送一次。補送後再做相同確認；仍失敗時回報 `Gemini 未確認送出`，而且不建立 `submittedRuns` 紀錄。

診斷狀態記錄使用的送出方式、是否補送、確認證據與最終結果。不記錄完整 prompt 內容。

### 8. Free badge 五連點彩蛋

保留 1800 ms 點擊視窗與第 5 次切換 Free/Pro 行為。

- 第 1 次：彈出「想做什麼呢！按再多次都沒用的唷」。
- 第 2 次：無彈窗。
- 第 3 次：從 10 句核准吐槽中均勻隨機挑選 1 句。
- 第 4 次：無彈窗。
- 第 5 次：切換方案；解鎖 Pro 時彈窗明確顯示 `https://www.youtube.com/@gale0418`，使用者確認後開啟頻道。

第 3 次吐槽固定為：

1. 你還真的繼續按嗎？
2. 都說沒用了，怎麼就是不信呢？
3. 這不是電梯，多按不會比較快。
4. 你的好奇心正在消耗滑鼠壽命。
5. 第三次了，理智還在線嗎？
6. 我有說沒用，你偏要做壓力測試。
7. 你是在測按鈕，還是在測我的耐心？
8. 這麼執著，該不會真期待彩蛋吧？
9. 好啦，什麼都沒發生，真的喔。
10. 再按下去也不會有驚喜……大概。

上述第 1、3 次對話僅在當前 plan 為 Free 時顯示。當前為 Pro 時，仍保留五連點切回 Free，但第 1、3 次不彈出 Free 吐槽。

對話 API、開啟連結 API 與亂數來源要能注入，以便測試不需真實彈窗或開啟分頁。第 3 次的亂數索引要夾在陣列範圍，避免測試替身值異常。

## 資料流

1. Side panel 建立 start/next-round 訊息。
2. Background 建立 run token，驗證 entitlement，建立或恢復 `DebateEngine`。
3. Provider job 只在 token 仍有效時寫入 engine。
4. Content script 寫入 prompt、送出、驗證送出，然後才登記 submitted run。
5. Provider 回覆經 provider-specific artifact 清理後返回 background。
6. Background 再次驗證 token，寫入 transcript 並儲存 runtime state。

## 錯誤處理

- 舊 run 回覆：忽略狀態寫入，不覆蓋現行會議訊息。
- snapshot 無法恢復：安全回到 idle，錯誤紀錄恢復失敗原因。
- 動態輪號非法：立即拒絕，不自動夾到另一輪。
- Gemini 未確認送出：只在 prompt 仍留存時補送一次；失敗後保留可追蹤診斷。
- 彩蛋彈窗或開啟連結失敗：不回滾 entitlement，但狀態列顯示已切換方案。

## 測試策略

每項生產程式變更前先建立最小失敗測試，確認失敗原因正確後才實作。

- `DebateEngine` restore 後可產生正確下一輪 prompt。
- 初始 5 輪後新增第 6 輪，job 與 record 皆使用第 6 輪，最後總結成功。
- 非法跳輪會失敗，不寫入另一輪。
- stop/reset 後的舊 token 不能寫入新狀態。
- Free 拒絕 `chat` 與 `theater`，Pro 允許。
- UI 在互動回合顯示該輪 `USER` 內容。
- Gemini 獨立 artifact 被移除，合法末尾 `image` 保留。
- Gemini 按鈕點擊已確認送出時不補送。
- Gemini 點擊未送出且 prompt 仍留存時，只以 Enter 補送一次。
- Gemini 補送仍無證據時明確失敗，不登記 submitted run。
- Free badge 第 1、3、5 次行為、第 2、4 次靜默、第 3 次十句邊界與第 5 次 YouTube 連結皆有測試。
- 現有三項失敗測試根據新 API 與核准 prompt 文字更新。
- 完整 `npm test`、變更檔 `node --check`、`git diff --check`、`npm run package` 皆必須通過。

## 驗收條件

1. 完整自動測試全部通過，沒有忽略或待處理測試。
2. 封裝成功，zip 仍只包含 extension 必要檔案。
3. Free 無法繞過 background gate 啟動 `chat` 或 `theater`。
4. 互動會議經 worker 恢復後可繼續插話、互評與總結。
5. 緊急停止後新開會議，舊回覆不會改寫新 transcript。
6. 第 6 輪以上不會回寫第 5 輪或阻塞最後總結。
7. Gemini 送出成功有可觀察證據；失敗時不假裝成功，也不重複發送。
8. Free badge 彩蛋節奏為 1、3、5，第 5 次顯示並可開啟主人的 YouTube 頻道。
