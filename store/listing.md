# LLMeeting 商店文案

本地 0.5.1 候選版文案，尚未公開發布。2026-10-14 本次讀到的[商店公開頁面](https://chromewebstore.google.com/detail/llmeeting/cjombmcmgifhanenolhaeepbpnlchjdp)仍顯示 0.4.7；本文件與新介面不代表商店已更新。完成候選版實機驗收後，再由開發者更新商店。

三語文案由 Antigravity Bridge Codex 編寫，整合時核對操作、成本與資料流。以下文字供 0.5.1 候選版使用。

## 繁體中文

### 短說明

同一問題集中掌握各家AI觀點！上下串接多輪討論，免費使用擴充功能（需登入至少2家AI網站）。

### 詳細說明

【同一個問題，集中看各家觀點】
想知道不同 AI 對同一件事有何看法？LLMeeting 讓你在單一畫面中，依序瀏覽各 AI 的逐段發言，激盪更多思考面向。

【3 步輕鬆開始】
1. 在瀏覽器登入至少 2 家想用的 AI 網站（如 ChatGPT、Claude、Gemini；Meta AI Beta 預設關閉，可手動開啟）。
2. 點擊側欄圖示，勾選想參與討論的 AI 夥伴。
3. 送出問題，檢視依序串接的多輪對話。

【計費與用量說明】
• LLMeeting 擴充功能本身免費使用。
• 各 AI 的帳號訂閱、地區限制與額度依各家服務各自計算。
• AI 消耗額度取決於您各自在各 AI 平台的方案。討論輪數與啟用的 AI 數量越多，通常使用量也越多，不保證固定消耗比例。

【隱私與事實查核】
• 您的聊天內容絕不傳送至 LLMeeting 開發者伺服器，對話紀錄僅於本機保留最多 24 小時。
• 注意：發出的問題與引用回覆仍會送到所選 AI 網站進行處理。
• AI 生成內容可能含有偏誤，重要資訊仍請自行進行事實查核。
• 會議中的「匿名」僅為討論化名，不會隱藏你對 AI 服務的帳號身分。

## English

### 短說明

Compare multiple AI views in one feed. Round-by-round discussion. Free tool (login 2+ AIs).

### 詳細說明

[Explore Diverse AI Perspectives in One Unified View]
Curious how different AI models approach the same prompt? LLMeeting sequences responses into a clean, round-by-round discussion feed so you can easily discover broader insights.

[Get Started in 3 Simple Steps]
1. Log in to at least two supported AI services in your browser (e.g., ChatGPT, Claude, Gemini; Meta AI Beta is off by default).
2. Open LLMeeting in the Chrome side panel and select which active models you want to join the chat.
3. Send your prompt and review the sequential discussion.

[Pricing & Quota]
• LLMeeting extension features are free to use.
• AI accounts, subscriptions, quotas, and regional restrictions remain separate.
• Token/quota consumption relies entirely on your accounts with each AI provider. More rounds and more active AIs generally consume more quota, though not at a fixed ratio.

[Privacy & Verification]
• Chat content is never sent to LLMeeting developer servers, and history is kept locally for up to 24 hours.
• Note: Prompts and referenced replies are still sent directly to your chosen AI websites.
• Always verify critical facts, as AI outputs may contain inaccuracies.
• Anonymous modes use aliases in meeting quotations, not anonymous accounts at the AI services.

## 日本語

### 短說明

ひとつの問いで複数AIの視点を一括確認。段落順で多角的に深掘り。拡張機能は無料（2つ以上のAIログインが必要）。

### 詳細說明

【ひとつの問いから、各AIの視点を一括確認】
同じテーマでもAIごとに着眼点は異なります。LLMeetingは各AIの発言を段落順に整理し、ひとつの画面で多角的な視点を素早く把握できます。

【かんたん3ステップ】
1. 利用したいAIサービスを2つ以上ブラウザでログイン（ChatGPT、Claude、Geminiなど。Meta AI Betaは初期設定でオフ）。
2. サイドパネルを開き、参加させたいAIモデルを選択。
3. 質問を送信し、順番に展開される議論を確認。

【料金と利用枠について】
• LLMeeting拡張機能自体の機能は無料で利用可能です。
• 利用枠は各AIサービスのアカウントプランに準じます。やりとりのターン数や参加AI数が多いほど通常は消費量が増加しますが、固定比率ではありません。

【プライバシーと事実確認】
• チャット内容がLLMeeting開発者サーバーへ送信されることはなく、履歴は端末ローカルに最大24時間のみ保持されます。
• ただし、入力した質問や引用された発言は選択した各AIサイトへ送信されます。
• AIの回答には誤りが含まれる可能性があるため、重要事項は必ずご自身で事実確認を行ってください。
• 会議内の「匿名」は表示用のニックネームです。

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
- `storage`: keep the latest local debate state for up to 24 hours and remember provider selections, UI language, and the local 🐑 mode easter egg preference.
- `tabs`: list provider tabs for an explicit connection choice, or open fresh provider tabs when none is selected.
- `scripting`: reinject the content script when a provider page is already open.
- Host permissions for ChatGPT, Gemini, Grok, X Grok, Claude, and Meta AI: automate prompt entry and read replies only on explicitly supported AI web apps. Meta AI remains opt-in in the side panel.
