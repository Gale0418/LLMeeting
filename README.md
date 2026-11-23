# LLMeeting｜讓多個 AI 一起討論

LLMeeting 是 Chrome 側欄擴充功能：把同一個問題交給多個 AI，集中閱讀各自的回答、互評與總結，方便比較共識和分歧。也能從既有對話接續討論，並下載完整會議紀錄。

支援 ChatGPT、Claude、Gemini、Grok 與 Meta AI（Beta，預設關閉）。使用你已登入的 AI 網頁，免填 API 金鑰；訂閱、用量與地區限制依各服務及帳號而定。重要資訊請自行查證。

## 安裝與開始

一般使用者可從 [Chrome 線上應用程式商店安裝 LLMeeting](https://chromewebstore.google.com/detail/llmeeting/cjombmcmgifhanenolhaeepbpnlchjdp)。

若要載入本機版本：

1. 下載或複製此儲存庫。
2. 在 Chrome 開啟 `chrome://extensions`，啟用「開發人員模式」，選擇「載入未封裝項目」，並選取專案資料夾。
3. 在 Chrome 登入至少兩個支援的 AI 網站，點擊工具列上的 LLMeeting 圖示開啟側邊欄。
4. 選擇參與的 AI、輸入問題並開始會議。可在設定中切換繁體中文、英文或日文介面。

**English quick start**  Load this folder as an unpacked extension at `chrome://extensions`, sign in to at least two supported AI sites, then open LLMeeting from Chrome’s toolbar.

## 資料與隱私

會議內容保存在瀏覽器本機，最長 24 小時，並在下次檢查時清除。問題與互評內容只會送到你選擇的 AI 網站，並依各服務的隱私政策處理；LLMeeting 不會將聊天內容傳送到開發者伺服器。下載的會議紀錄含有對話原文，請妥善保管。[隱私政策](store/privacy-policy.md)

## 開發與紀錄

- `npm test`：執行回歸測試。
- `npm run package`：打包擴充功能。
- [驗收與 smoke test 紀錄](MissionCenter/smoke-tests.md)
- [Git 提交歷史](https://github.com/Gale0418/LLMeeting/commits/main/)
