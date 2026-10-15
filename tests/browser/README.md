# 隔離瀏覽器驗收

這套驗收使用 Playwright 1.62.1 與它配套的 Chromium，建立全新持久化設定檔。**不連接、不複製日常 Chrome 設定檔或登入資料**。

## 執行

在儲存庫根目錄執行：

```powershell
npm --prefix tests/browser ci
npm --prefix tests/browser exec -- playwright install chromium
npm --prefix tests/browser test
```

可加 `-- --skip-native` 只跑獨立頁面。需要使用現成工具包時，直接執行：

```powershell
node tests/browser/run.mjs --playwright-module <playwright/index.mjs的絕對路徑> --browser-cache <配套瀏覽器快取的絕對路徑>
```

一般 `npm test` 仍執行原有快速測試，不會自動開瀏覽器。

## 兩層結果

1. **獨立側欄頁面**：普通分頁載入真正的 `chrome-extension://.../src/sidepanel/index.html`，以320／480px測試。
2. **原生 Side Panel**：使用 `PW_CHROMIUM_ATTACH_TO_OTHER=1` 與隔離副本中的使用者點擊按鈕開啟。核對目標類型、確認側欄不是普通分頁，清除viewport模擬並檢查實際寬度，再執行同組操作。這個非正式介面可能隨版本改變，失敗會保留原因，不能當作通過。

每層都涵蓋：首輪／互評／總結／故障狀態，各六次中英日來回切換；補回覆空白驗證、切語言保留草稿、失敗保留草稿、成功關閉編輯器、補入正文與查看原故障。設定頁使用真正的Chrome storage跨頁事件。英文狀態與載入文字不得殘留中文，日文不得殘留已知中文狀態；AI原文與原始故障必須保留。

## 測試邊界

診斷驗收另含：健康狀態及時間軸三語切換、保留離席者、故障／手動補入／離席順序、技術原文預設收合、一般摘要不洩漏原始錯誤、頁面沒有水平溢出，以及歷史展開可使用鍵盤 Enter。這些斷言併入既有每個狀態／語言檢查，並非額外五家後端驗收。

前端、CSS、語言模組、設定頁和Chrome runtime／storage都使用專案實作。只有背景service worker在隔離副本換成測試替身，透過固定合成資料模擬狀態與修復回執；**不是五家AI或正式背景修復流程的端到端驗收**。

測試替身不匯入正式後端，拒絕未知操作；瀏覽器網頁的HTTP(S)請求一律中止。不會發送真實提問或消耗AI配額。開啟側欄的測試頁只存在於 `output` 中的副本，正式manifest與出貨包不包含它。

所有設定檔、副本、截圖及 `report.json` 保存於 `output/browser-acceptance/<時間>/`，已由Git忽略。`standalone` 與 `native` 分開記錄，含錯誤、版本、視窗寬度與逐項結果。結束時關閉本次建立的瀏覽器；不關閉其他Chrome程序。測試失敗會回傳非零退出碼。

參考：[Playwright擴充功能文件](https://playwright.dev/docs/chrome-extensions)、[側欄支援議題 #26693](https://github.com/microsoft/playwright/issues/26693)。
