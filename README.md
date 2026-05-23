# AI Debate Host

私人用 Chrome Manifest V3 插件，用側邊欄主持 ChatGPT、Gemini、Grok 的固定辯論流程。

## 功能

1. 同時把原始問題送到 ChatGPT、Gemini、Grok。
2. 等三方回答後，把另外兩位的回答貼回各自原本對話串請它們互評。
3. 最後把原題、第一輪回答、第二輪互評貼回 ChatGPT 原本對話串，請 ChatGPT 總結。
4. 側邊欄顯示進度、transcript 與錯誤。

## 本機載入

1. 在 Chrome 開啟 `chrome://extensions`。
2. 打開 Developer mode。
3. 點 Load unpacked。
4. 選擇這個資料夾：`D:\MyGame\LLMeeting`。
5. 先手動登入 ChatGPT、Gemini、Grok。
6. 點 Chrome 工具列的 AI Debate Host 圖示開啟側邊欄。
7. 輸入短問題測試，例如：`天為什麼是藍的？`

## 注意

- 這個 MVP 不會自動登入，也不會繞過 CAPTCHA、付費牆或平台限制。
- 各家 AI 網頁 DOM 改版時，`src/content/provider-page.js` 的 selector 可能需要調整。
- 若某家 AI 卡住或逾時，插件會把該 provider 標記成錯誤並嘗試讓其餘流程繼續。

## 測試

```powershell
npm test
```
