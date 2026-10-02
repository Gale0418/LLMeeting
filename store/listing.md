# LLMeeting

版本：**0.5.0 發布候選文案**（尚未發布；需先完成整場實機驗收）。2026-10-02 查核商店公開頁面仍顯示 0.4.7；本文件不代表公開文案已更新。

## 繁體中文短說明

一個問題，多個 AI 觀點。在 Chrome 側欄收集回答、交叉互評，整理共識與分歧。

## 繁體中文詳細說明

不用再把同一題貼到好幾個聊天視窗。LLMeeting 協調你已登入的 ChatGPT、Gemini、Grok、Claude，以及可選的 Meta AI Beta，讓你在同一份會議紀錄比較各家回答。

想比較方案？用快速鬥技場收集回答、互評與總結。想邊聊邊改方向？用自由群聊插話。想找創作靈感？用劇場大亂鬥設定人設。也能從目前 AI 分頁的對話開始總結辯論。

第一次使用，先登入至少兩家 AI，在側欄點亮參與模型、輸入問題，再開始快速鬥技場。手動檢查連線可選；一般會議預設開新對話分頁，啟動時仍會檢查必要模型。

所有會議功能免費開放，AI 帳號與訂閱需自行準備。各服務的用量、等待時間與地區限制仍適用；AI 互評不保證正確，重要事實請自行查證。匿名評論僅將會議引用中的參與者化名，不會隱藏你對 AI 服務的帳號身分。

對話由你的瀏覽器協調，不會傳到 LLMeeting 開發者伺服器；問題與引用回覆仍會送到所選 AI 網站。最新一場會議最長在本機保留 24 小時，可隨時清除。

## Short description

Compare AI answers, cross-critiques, and summaries in your Chrome side panel.

## Detailed description

LLMeeting helps you run an interactive debate across AI web apps you are already signed in to. Open the side panel, choose participants, enter a question, and let the extension coordinate answers, cross-critiques, optional user interjections, and a final chair summary.

Core features:

- Fast arena debate with ChatGPT, Gemini, Grok, and Claude.
- Optional Meta AI Beta participation; it stays disabled by default because availability and page structure may vary by account or region.
- One to five cross-critique rounds.
- Serious critique, casual chat, brawl, Yes-and, and imposter interaction styles.
- Judge summary, observer chair, anonymous review, and all-anonymous judgments from every participant.
- Chat and theater modes with user interjections and custom personas; all modes are available without an upgrade.
- Bubble-style transcript and provider diagnostics.
- Fast arena scheduling.
- Summarize the current AI conversation and send it to the other providers.
- Local storage for the latest session only, with a 24-hour retention limit and an explicit clear-data control.

All LLMeeting meeting features are free. AI accounts, subscriptions, quotas, and regional restrictions remain separate. Cross-critiques do not guarantee accuracy. Anonymous modes use aliases in meeting quotations, not anonymous accounts at the AI services.

LLMeeting does not send chat content to an LLMeeting developer server. Prompts and quoted AI replies are submitted only to the AI websites selected by the user and are processed under those providers' own terms and privacy policies.

## Test instructions

1. Install the unpacked extension.
2. Sign in to ChatGPT, Gemini, Grok, and Claude in Chrome.
3. Optionally open Meta AI in a signed-in account; Meta AI Beta is not required for the stable four-provider flow.
4. Open the LLMeeting side panel from the toolbar icon.
5. Enter a short question such as `天為什麼是藍的？`.
6. Set 交叉評析輪次 to 2, run 快速鬥技場, and confirm every selected provider receives the initial prompt and two critique prompts. 裁判總結 sends the final prompt to one chair; 全員匿名 sends it to every participant independently.
7. Confirm Meta AI Beta is not enabled after a fresh install; activation buttons expose their state through aria-pressed.
8. Click 清除 (清除紀錄), confirm the operation, and verify the transcript returns to an empty local state without changing the selected participants.

## Permissions rationale

- `sidePanel`: show the LLMeeting control panel.
- `storage`: keep the latest local debate state for up to 24 hours and remember the local 🐑 mode easter egg preference.
- `tabs`: list provider tabs for an explicit connection choice, or open fresh provider tabs when none is selected.
- `scripting`: reinject the content script when a provider page is already open.
- Host permissions for ChatGPT, Gemini, Grok, X Grok, Claude, and Meta AI: automate prompt entry and read replies only on explicitly supported AI web apps. Meta AI remains opt-in in the side panel.
