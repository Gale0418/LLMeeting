# LLMeeting｜讓多個 AI 一起討論

LLMeeting 是 Chrome 側邊欄擴充功能，讓多個 AI 針對同一個問題回答、互評並整理重點，方便比較不同觀點。可用於快速比較、自由群聊、情境角色扮演或多輪辯論，也能從已開啟的 AI 對話接續討論，並下載會議紀錄。

支援 ChatGPT、Claude、Gemini、Grok 與 Meta AI（Beta，預設關閉）。LLMeeting 免費使用，直接操作你已登入的 AI 網頁，免填 API 金鑰；各 AI 服務的訂閱、用量與地區限制依帳號而定。多個 AI 的回答不保證正確，重要資訊請自行查證。

## 安裝與開始

一般使用者可從 [Chrome 線上應用程式商店安裝 LLMeeting](https://chromewebstore.google.com/detail/llmeeting/cjombmcmgifhanenolhaeepbpnlchjdp)。

若要載入本機版本：

1. 下載或複製此儲存庫。
2. 在 Chrome 開啟 `chrome://extensions`，啟用「開發人員模式」，選擇「載入未封裝項目」，並選取專案資料夾。
3. 在 Chrome 登入至少兩個支援的 AI 網站，點擊工具列上的 LLMeeting 圖示開啟側邊欄。
4. 選擇參與的 AI、輸入問題並開始會議。自由群聊可補充訊息、發起互評或結束討論。可在設定中切換繁體中文、英文或日文介面。

**English quick start**  Load this folder as an unpacked extension at `chrome://extensions`, sign in to at least two supported AI sites, then open LLMeeting from Chrome’s toolbar.

遇到暫停或網頁未能自動帶回回答時，可貼上 AI 網頁已產生的內容來補齊，或讓無法繼續的 AI 離席並保留先前內容。已收到的回答也能手動修改；會議進度會保存在瀏覽器中，方便恢復進行中的討論。

## 資料與隱私

會議紀錄保存在瀏覽器本機，最長保留 24 小時，之後會在下次檢查時清除。LLMeeting 只會將問題和用於互評的回覆送到你選擇的 AI 網站，由各服務依其隱私政策處理；不會傳送到開發者伺服器。下載的會議紀錄含有對話原文，請妥善保管。[隱私政策](store/privacy-policy.md)

## 授權與回饋

本專案採非商業授權，詳見 [LICENSE](LICENSE)。使用上有問題或想提出建議，歡迎到 [GitHub Issues](https://github.com/Gale0418/LLMeeting/issues) 留言。

## 開發

- 執行 `npm test` 跑回歸測試。
- 執行 `npm run package` 打包擴充功能。
- [驗收與 smoke test 紀錄](MissionCenter/smoke-tests.md)
