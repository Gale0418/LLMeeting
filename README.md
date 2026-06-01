# AI Debate Host

私人用 Chrome Manifest V3 插件，用側邊欄主持多個 AI 的辯論流程。預設使用 ChatGPT、Gemini、Grok；Claude 可在進階設定中手動啟用。

## 功能

1. 自動逐頁喚醒已勾選的 AI，再把原始問題送出，不需要手動切換分頁。
2. 等所有 AI 回答後，把其他 AI 的回答貼回各自原本對話串請它們互評。
3. 最後把原題、第一輪回答、第二輪互評貼回指定裁判 AI，預設由 ChatGPT 總結。
4. 側邊欄顯示進度、氣泡式 transcript、錯誤與本機狀態。
5. 提供 Mock Mode，不需要開任何 AI 網頁也能先測完整流程。
6. 每場真實辯論會為各 provider 開啟新的對話分頁，再於同一分頁延續互評。
7. 可展開診斷資訊，查看各 provider 的執行階段、綁定分頁、網址與錯誤。
8. 等待新回覆時會排除剛送出的主人提問泡泡，避免誤判為 AI 回答。

## 本機載入

1. 在 Chrome 開啟 `chrome://extensions`。
2. 打開 Developer mode。
3. 點 Load unpacked。
4. 選擇這個資料夾：`D:\MyGame\LLMeeting`。
5. 先手動登入 ChatGPT、Gemini、Grok；若要使用 Claude，也先登入 Claude。
6. 點 Chrome 工具列的 AI Debate Host 圖示開啟側邊欄。
7. 輸入短問題測試，例如：`天為什麼是藍的？`

修改插件檔案後，請回到 `chrome://extensions` 對 AI Debate Host 按重新載入，再重新開啟側邊欄。

## 建議測試順序

1. 先開啟 Mock Mode，跑一場模擬辯論，確認側邊欄流程與 transcript 正常。
2. 關閉 Mock Mode，只勾選 ChatGPT、Gemini，跑一場雙 AI 短辯論。
3. 再加入 Grok。
4. Claude 免費額度較少，建議最後再手動勾選測試。

## 注意

- 這個 MVP 不會自動登入，也不會繞過 CAPTCHA、付費牆或平台限制。
- 各家 AI 網頁 DOM 改版時，`src/content/provider-page.js` 的 selector 可能需要調整。
- 若某家 AI 卡住或逾時，插件會把該 provider 標記成錯誤並嘗試讓其餘流程繼續。
- Chrome Manifest V3 service worker 可能被重啟，插件會從 `chrome.storage.local` 嘗試還原最近狀態。

## 測試

```powershell
npm test
```
