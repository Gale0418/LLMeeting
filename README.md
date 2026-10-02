# LLMeeting｜一個問題，多個 AI 觀點

不用再把同一題貼到好幾個聊天視窗。LLMeeting 在 Chrome 側欄協調你已登入的 AI：收集回答、交叉互評，再整理共識與分歧。你也可以加入討論，或替 AI 設定人設，看它們如何接招。

本儲存庫版本：**0.5.0 發布候選版**，尚未完成整場實機驗收。

[查看 Chrome 商店公開版](https://chromewebstore.google.com/detail/llmeeting/cjombmcmgifhanenolhaeepbpnlchjdp)（2026-10-02 查核頁面顯示 0.4.7，與本儲存庫候選版不同；安裝前請確認商店版本）。

---

## 什麼時候值得打開 LLMeeting？

- **拿不定主意**：請各家比較方案、質疑假設，看看分歧在哪裡。
- **卡在創作**：讓 AI 提不同方向，再互相挑出值得留下的點子。
- **想玩一場 AI 劇場**：設定人設、中途插話，看同一題如何長出不同故事。

目前提供 ChatGPT、Gemini、Grok、Claude，以及預設關閉的 Meta AI Beta。多一個觀點，不代表多一份真相：AI 可能一起答錯，重要事實仍要查證。

## 第一次使用：先跑一場小會議

1. 在同一個 Chrome 使用者設定檔登入至少兩家 AI。
2. 開啟 LLMeeting 側欄，點亮要參與的模型；不必一次啟用五家。
3. 輸入問題，維持預設「快速鬥技場」，按下開始。手動檢查連線可跳過；啟動時仍會檢查必要模型，一般會議預設開新對話分頁。
4. 在會議紀錄比較回答、互評與總結。若有模型未就緒，先按逐家指引處理，不要反覆送出同一題。

可以從這題開始：

> 我每週只有五小時做個人專案。應該先做完整功能，還是先做小型原型？請比較取捨、指出風險，並提出一週內能驗證的做法。

LLMeeting 功能免費，但不包含 AI 帳號或訂閱。各家的用量、等待時間與地區限制照常適用；啟用越多模型、設定越多互評輪，通常會花更多時間與用量。會議期間請避免在受控分頁手動送新訊息，以免干擾回覆辨識。

---

## 四種玩法，依你想得到的結果選

### 🚀 四大會議模式任你挑選

所有會議功能免費開放。側欄會說明各模式的運作方式；連線失敗時提供逐家處理指引與官方網頁入口。重置已有會議會先確認，模型選擇不會被重置。

* **快速鬥技場 ⚡**：預設模式，先送出各家問題，再收集回答與交叉互評。
* **自由群聊 💬**：沒有回合上限，可持續插話、互評，直到主動總結或停止；恢復等待中的會議也能繼續。
* **劇場大亂鬥 🎭**：手動幫每一位 AI 設定專屬人設，讓他們在設定好的劇本下互動。
* **總結辯論 ✦**：從目前 AI 分頁的對話摘要開始，再交給其他 AI 辯論。

### 輪到你時，給討論一個轉折

自由群聊、劇場與總結辯論等待你發言時，互動控制台會提供三個「轉折靈感」。劇場可以加一條怪規則、替對手辯護或三句接龍；群聊可以加限制、找反例或要求下一步。抓內鬼互動則提供追問矛盾、試探邊界與辯護，不會由按鈕揭露答案。

點靈感只會加入草稿，不覆蓋原本台詞，也不自動送出。改好後按「送出補充」才交給 AI；你仍可選擇再互評或結案。這是方便即興的提示，不保證 AI 一定照劇本演。

### 🎭 百變互動風格：今天想看哪種戲碼？
同一個問題，也可以換一種互動風格：
* ⚖️ **嚴肅互評**：真理越辯越明，邏輯碰撞無極限！
* 🍻 **酒吧閒聊**：大家放輕鬆，像在酒吧喝杯酒一樣閒聊（AI 的語氣會變得超級 Chill 喔！）。
* 🥊 **無差別格鬥**：不管三七二十一，瘋狂開砲就對了！
* 🤝 **共識接龍 (Yes, and...)**：不准反駁！每位 AI 都必須順著上一位的答案繼續往下接龍，看最後會長出什麼神奇大樹！
* 🕵️‍♂️ **抓內鬼模式**：大家都在認真回答，但其中有一台 AI 被暗中下了「搗亂指令」當內鬼，你能看出是誰在帶風向嗎？！(✪ω✪)

### 👑 誰來當老大？【主席與總結模式】全面升級
吵完之後總得有人來收拾殘局，你來決定誰是法官：
* **裁判總結**：指定某家 AI 來統整大家的意見，也能以抽籤選擇裁判。
* 🕵️ **圍觀主席**：指定一位 AI 「只看不說」，直到最後才跳出來進行終極客觀總結！
* 🥸 **匿名評論**：全體化名互評，再由一位裁判總結。
* 👥 **全員匿名**：全體化名互評，每位參與者都當裁判，各自產生一份總結。
* 🛌 **放空模式**：不想看總結？勾選「略過最後的總結裁決」，吵完直接原地解散去睡覺！

### 🎁 噓... 聽說有隱藏彩蛋？！【🐑模式彩蛋】
發現介面上有個小小的 **「Free」徽章** 嗎？
所有功能直接開放；徽章五連點可以喚出純裝飾的羊羊彩蛋，Reset 會恢復 Free，不影響功能。

### 🛠️ 2026-10-03 可靠性更新

- 模型參與按鈕與 readiness 分開顯示；記住模型選擇，手動「檢查連線」可選，正式會議仍會建立新對話分頁並檢查必要模型。
- Provider Driver 保留舊版與語意辨識退路，支援新版 ChatGPT 訊息標記、ProseMirror 段落換行驗證及 Gemini 非同步富文字／空白段落；不依賴固定模型版本名稱。網站改版仍可能需要維護，不能保證永遠免更新。
- 送出未確認或通道中斷時不盲目重送；回覆擷取會拒絕偵測到的後續手動回合，避免混入別段對話。虛擬化網頁仍可能限制訊息辨識，會議期間請避免手動在其分頁送新訊息。
- 一般結案只引用原問題與最後有效輪；完整逐字紀錄仍保留。修補儲存／清除競態、失敗草稿保留、匿名缺名標籤及聊天焦點。
- 修正自由聊天／劇場 preflight 交接誤擋，以及劇場抓內鬼最低兩輪與畫面輪數不一致；加入背景流程回歸測試。
- 自由群聊抓內鬼可在首輪後主動揭曉；即使恢復時有未完成輪，也只採最後完整輪的猜測。一般劇場抓內鬼仍維持最低兩輪。
- 無限群聊第 6 輪以上的狀態、等待泡泡、進度與診斷不再被截成第 5 輪；設定用的 1–5 輪限制維持不變。

驗證狀態：最新全套 317/317 通過。2026-10-03 CodeRabbit 納入既有核心程式、測試、工具與小型文件共 59 檔，提出兩項問題；回歸測試確認後修正，修後複查實際覆蓋 22 檔（含相關上下文），0 issues；本輪合計 2/3 次。Chrome 唯讀檢查確認 ChatGPT 草稿段落的 25 個來源換行會被 innerText 讀成 59 個，Driver .6 補上精確段落還原；未操作該會議重送。Chrome 獨立 Gemini 格式測試收到回覆；320–480px 模擬側欄完成修復指引、推薦入口與轉折草稿操作檢查。使用者回報目前試用正常，但沒有具名模式／模型矩陣；這些不是 LLMeeting 全員匿名整場實機、完整鍵盤驗收或真實遊玩測試，候選版仍待端到端測試。

平台更新：Chrome 商店後台被瀏覽器控制工具禁止操作；本次準備更新包與 Git main 保存，未上傳、送審或發布。請由開發者手動上傳 ZIP 並保留回執，商店公開版本不會因推送 Git 自動更新。

開發驗證：`npm test`；封裝：`npm run package`，產物位於 `dist/llmeeting-0.5.0.zip`。更新本機未封裝版本後，請重新載入擴充套件以啟用新 Driver。

想分享給朋友？[推薦文案與示範題](store/recommendation-kit.md) 已整理好；分享前請先核對對方會安裝的版本。

---

## English Quick Start

1. [Install LLMeeting from the Chrome Web Store](https://chromewebstore.google.com/detail/llmeeting/cjombmcmgifhanenolhaeepbpnlchjdp).
2. Sign in to at least two supported AI services in Chrome: ChatGPT, Gemini, Grok, Claude, or Meta AI Beta.
3. Open the LLMeeting side panel, choose participants, enter a topic, and start Fast Arena with the default settings.

LLMeeting features are free; AI accounts, subscriptions, quotas, and regional restrictions remain separate. AI agreement is not fact-checking. The repository contains a 0.5.0 release candidate; the Store page checked on October 2, 2026 showed 0.4.7.

## Built with Codex and GPT-5.6

LLMeeting was designed and directed by me, with all code developed collaboratively through Codex. Earlier versions used GPT-5.4. During OpenAI Build Week, GPT-5.6 and Codex meaningfully extended the project with stronger provider automation, recovery flows, response normalization, Meta AI Beta support, and expanded regression tests. The dated Git history distinguishes this new work from the earlier version.

---

<p align="right">
  <sup>
    <b>隱私權與版權聲明 (｀・ω・´)ゞ</b>：<br>
    LLMeeting 在瀏覽器本機協調你已登入的 AI 網頁，不會把對話傳送到 LLMeeting 開發者伺服器。<br>
    你選擇參與辯論的 AI 服務會收到問題與其他 AI 的引用回覆，並依各服務自己的隱私政策處理。<br>
    最新一場辯論會暫存在 Chrome 本機儲存空間，最長保留 24 小時，也可以從側邊欄立即清除。<br>
    <br>
    本專案原始碼僅供個人學習與非商業用途參考。嚴禁未經授權的商業使用、重新封裝或上架。<br>
    Copyright &copy; 2026 Gale0418. All Rights Reserved. (See <a href="LICENSE">LICENSE</a>)
  </sup>
</p>
