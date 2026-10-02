# LLMeeting 🤖 💬 🤖

(ﾉ>ω<)ﾉ 想看看不同立場的 AI 怎麼爭論嗎？LLMeeting 讓你在瀏覽網頁時，隨時發起一場 AI 神仙打架！

目前版本：**0.5.0**（發布準備中；新功能以驗證結果為準）

🌟 **[👉 快點我！前往 Chrome 線上應用程式商店安裝 LLMeeting 吧！ヾ(•ω•`)o](https://chromewebstore.google.com/detail/llmeeting/cjombmcmgifhanenolhaeepbpnlchjdp)**

---

## 🎯 這到底是什麼神奇魔法？

這是一個超好玩、超酷炫的 Chrome 擴充功能！(๑•̀ㅂ•́)و✧ 
有時候你問 ChatGPT 一個問題，它給了你一個答案，但你心裡難免會想：「如果是 Gemini 會怎麼說？Grok 會同意嗎？Claude 會不會有更毒舌的見解？」

透過 **LLMeeting** 的側邊欄，你可以一次把問題交給多位頂尖 AI，然後**讓它們互相看對方的答案、互相吐槽、最後再做總結**！目前穩定支援 ChatGPT、Gemini、Grok、Claude，並提供預設關閉的 Meta AI Beta。從此不用再辛苦地在各個分頁間「複製貼上」到手抽筋啦！(つ´ω`)つ

---

## ✨ 超狂功能大全！準備好大開眼界了嗎？

### 🚀 四大會議模式任你挑選
* **快速鬥技場 ⚡**：預設模式，先送出各家問題，再收集回答與交叉互評。
* **自由群聊 💬**：沒有回合上限，可持續插話、互評，直到主動總結或停止；恢復等待中的會議也能繼續。
* **劇場大亂鬥 🎭**：手動幫每一位 AI 設定專屬人設，讓他們在設定好的劇本下互動。
* **總結辯論 ✦**：從目前 AI 分頁的對話摘要開始，再交給其他 AI 辯論。

### 🎭 百變互動風格：今天想看哪種戲碼？
不只嚴肅辯論，我們還有超多有趣的互動風格，保證讓你笑到腹肌痛：
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

### 🛠️ 2026-10-02 可靠性更新

- 模型參與按鈕與 readiness 分開顯示；記住模型選擇，手動「檢查連線」可選，正式會議仍會建立新對話分頁並檢查必要模型。
- Provider Driver 保留舊版與語意辨識退路，支援新版 ChatGPT 訊息標記、Gemini 非同步富文字／空白段落；不依賴固定模型版本名稱。網站改版仍可能需要維護，不能保證永遠免更新。
- 送出未確認或通道中斷時不盲目重送；回覆擷取會拒絕偵測到的後續手動回合，避免混入別段對話。虛擬化網頁仍可能限制訊息辨識，會議期間請避免手動在其分頁送新訊息。
- 一般結案只引用原問題與最後有效輪；完整逐字紀錄仍保留。修補儲存／清除競態、失敗草稿保留、匿名缺名標籤及聊天焦點。
- 修正自由聊天／劇場 preflight 交接誤擋，以及劇場抓內鬼最低兩輪與畫面輪數不一致；加入背景流程回歸測試。

驗證狀態：最新完整測試 289/289 通過；CodeRabbit 全量原始碼審查提出兩項問題，核實修正後複查 0 issues；Chrome 獨立 Gemini 格式測試成功送出並收到回覆。LLMeeting 全員匿名整場實機流程、320–480px 側欄與鍵盤操作仍待驗收，不能把網頁測試或程式審查當成完整端到端通過。

開發驗證：`npm test`；封裝：`npm run package`，產物位於 `dist/llmeeting-0.5.0.zip`。更新本機未封裝版本後，請重新載入擴充套件以啟用新 Driver。

---

## English Quick Start

1. [Install LLMeeting from the Chrome Web Store](https://chromewebstore.google.com/detail/llmeeting/cjombmcmgifhanenolhaeepbpnlchjdp).
2. Sign in to at least two supported AI services in Chrome: ChatGPT, Gemini, Grok, Claude, or Meta AI Beta.
3. Open the LLMeeting side panel, enter a topic, choose the participants and meeting mode, then start the AI party.

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
