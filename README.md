# LLMeeting

私人用 Chrome Manifest V3 插件，用側邊欄主持多個 AI 的辯論流程。預設使用 ChatGPT、Gemini、Grok、Claude。

## 功能

1. Free 版提供基礎辯論：逐家喚醒已勾選的 AI，送出原始問題並等待回答。
2. 等所有 AI 回答後，把其他 AI 的回答貼回各自原本對話串請它們互評。
3. 最後把原題、第一輪回答、第二輪互評貼回指定裁判 AI，預設由 ChatGPT 總結。
4. 側邊欄顯示 Free/Pro 狀態、進度、氣泡式 transcript、錯誤與本機診斷資訊。
5. 進階辯論設定可選 1 到 5 輪交叉評析。
6. Pro 入口已預留在進階辯論設定：快速鬥技場與總結辯論目前會顯示鎖定提示，之後接授權後解鎖。
7. 每場真實辯論會為各 provider 開啟新的對話分頁，再於同一分頁延續互評。
8. 等待新回覆時會排除剛送出的主人提問泡泡，避免誤判為 AI 回答。

## Free / Pro 分層

- Free：四家 AI 基礎輪流辯論、1 到 5 輪交叉評析、provider 勾選、裁判選擇、transcript 與診斷資訊。
- Pro 預留：快速鬥技場、總結目前對話後開始辯論、匯出、歷史紀錄。
- Claude 不列為 Pro；它是基礎四模型辯論的一部分。
- 目前不接付款後端，授權來源先保留在 entitlement 抽象層。

## Chrome 商店定位

上架時先作為免費安裝版，不使用 Chrome Web Store 付款。付費功能以插件內 Pro 入口保留，日後再接外部金流與授權驗證。

## 本機載入

1. 在 Chrome 開啟 `chrome://extensions`。
2. 打開 Developer mode。
3. 點 Load unpacked。
4. 選擇這個資料夾：`D:\MyGame\LLMeeting`。
5. 先手動登入 ChatGPT、Gemini、Grok、Claude。
6. 點 Chrome 工具列的 LLMeeting 圖示開啟側邊欄。
7. 輸入短問題測試，例如：`天為什麼是藍的？`

修改插件檔案後，請回到 `chrome://extensions` 對 LLMeeting 按重新載入，再重新開啟側邊欄。

## 建議測試順序

1. 只勾選 ChatGPT、Gemini，跑一場基礎雙 AI 短辯論。
2. 加入 Grok，再跑一場三方辯論。
3. 把交叉評析輪次設為 2，確認 transcript 會出現第二輪與第三輪互評。
4. 加入 Claude，跑一場四方辯論。
5. 在進階辯論設定改選快速鬥技場或總結辯論，再按主按鈕，確認 Free 版只顯示 Pro 鎖定提示。

## 注意

- 這個 MVP 不會自動登入，也不會繞過 CAPTCHA、付費牆或平台限制。
- 各家 AI 網頁 DOM 改版時，`src/content/provider-page.js` 的 selector 可能需要調整。
- 若某家 AI 卡住或逾時，插件會把該 provider 標記成錯誤並嘗試讓其餘流程繼續。
- Chrome Manifest V3 service worker 可能被重啟，插件會從 `chrome.storage.local` 嘗試還原最近狀態。

## 測試

```powershell
npm test
```

---
<p align="right">
  <sup>
    <b>聲明</b>：本專案僅供個人學習與非商業用途。嚴禁未經授權的商業使用、重新封裝或上架。<br>
    Copyright &copy; 2026 Gale0418. All Rights Reserved. (See <a href="LICENSE">LICENSE</a>)
  </sup>
</p>
