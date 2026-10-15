// Program UI sources and three-language copy authored by Antigravity Bridge Codex.
// Dynamic parameters are plain text; rendering boundaries own HTML escaping.
export const UI_COPY = [
  { "id": "live.enabled", "source": "{p0}：已啟用", "zh_TW": "{p0}：已啟用", "en": "{p0}: Enabled", "ja": "{p0}：有効" },
  { "id": "live.disabled", "source": "{p0}：未啟用", "zh_TW": "{p0}：未啟用", "en": "{p0}: Disabled", "ja": "{p0}：無効" },
  { "id": "live.readinessCounts", "source": "{p0} 家已啟用・{p1} 家就緒・{p2} 家需要處理", "zh_TW": "{p0} 家已啟用・{p1} 家就緒・{p2} 家需要處理", "en": "{p0} enabled · {p1} ready · {p2} needs attention", "ja": "{p0}社 有効・{p1}社 準備完了・{p2}社 要対応" },
  { "id": "stage.identify", "source": "辨識頁面", "zh_TW": "辨識頁面", "en": "Identify page", "ja": "ページ認識" },
  { "id": "stage.findInput", "source": "尋找輸入框", "zh_TW": "尋找輸入框", "en": "Find input box", "ja": "入力ボックスの検出" },
  { "id": "stage.fillPrompt", "source": "填入提示", "zh_TW": "填入提示", "en": "Enter prompt", "ja": "プロンプト入力" },
  { "id": "stage.sendPrompt", "source": "送出提示", "zh_TW": "送出提示", "en": "Send prompt", "ja": "プロンプト送信" },
  { "id": "stage.waitReply", "source": "等待新回覆", "zh_TW": "等待新回覆", "en": "Wait for new response", "ja": "新規応答の待機" },
  { "id": "stage.readReply", "source": "讀取新回覆", "zh_TW": "讀取新回覆", "en": "Read new response", "ja": "新規応答の読み取り" },
  { "id": "live.reviewing", "source": "{p0} 評析中", "zh_TW": "{p0} 評析中", "en": "{p0} is reviewing", "ja": "{p0}がレビュー中" },
  { "id": "live.responding", "source": "{p0} 回應中", "zh_TW": "{p0} 回應中", "en": "{p0} is responding", "ja": "{p0}が返答中" },
  { "id": "live.review", "source": "{p0} 評析", "zh_TW": "{p0} 評析", "en": "{p0}'s Review", "ja": "{p0}のレビュー" },
  { "id": "live.response", "source": "{p0} 回應", "zh_TW": "{p0} 回應", "en": "{p0}'s Response", "ja": "{p0}の返答" },
  { "id": "live.writingReview", "source": "撰寫互評中", "zh_TW": "撰寫互評中", "en": "Writing peer reviews", "ja": "相互レビュー作成中" },
  { "id": "live.compiling", "source": "彙整精華中…", "zh_TW": "彙整精華中…", "en": "Compiling highlights…", "ja": "ハイライトまとめ中…" },
  { "id": "live.incomplete", "source": "總結未完成", "zh_TW": "總結未完成", "en": "Summary incomplete", "ja": "要約未完了" },
  {
    "id": "ui.rawProviderNotice",
    "source": "以下是該 AI 網頁顯示的原文，不是這位 AI 對題目的正式回答：",
    "zh_TW": "以下是該 AI 網頁顯示的原文，不是這位 AI 對題目的正式回答：",
    "en": "The following is the original text displayed on the AI webpage, not this AI's official response to the question:",
    "ja": "以下は当該AIのWebページに表示された原文であり、設問に対する正式な回答ではありません："
  },
  {
    "id": "ui.questionLabel",
    "source": "使用者提問 🙋",
    "zh_TW": "使用者提問 🙋",
    "en": "User Question 🙋",
    "ja": "ユーザーの質問 🙋"
  },
  {
    "id": "ui.copy.001",
    "source": "",
    "zh_TW": "",
    "en": "",
    "ja": ""
  },
  {
    "id": "ui.copy.002",
    "source": "\n\n要去看看嗎？ (被拖走)",
    "zh_TW": "\n\n要去看看嗎？ (被拖走)",
    "en": "\n\nWant to check it out? (dragged away)",
    "ja": "\n\n見に行ってみる？ (引きずられて退場)"
  },
  {
    "id": "ui.copy.003",
    "source": " 未加入：{p0}。",
    "zh_TW": " 未加入：{p0}。",
    "en": " Not added: {p0}.",
    "ja": " 未追加：{p0}。"
  },
  {
    "id": "ui.copy.004",
    "source": " 先前的接續草稿仍保留，可取消後重新擷取。",
    "zh_TW": " 先前的接續草稿仍保留，可取消後重新擷取。",
    "en": " The previous continuation draft is kept. You can cancel and capture again.",
    "ja": " 前回の続きの下書きは保持されています。キャンセルして再取得できます。"
  },
  {
    "id": "ui.copy.005",
    "source": "[分頁] {p0}",
    "zh_TW": "[分頁] {p0}",
    "en": "[Tab] {p0}",
    "ja": "[タブ] {p0}"
  },
  {
    "id": "ui.copy.006",
    "source": "[服務狀態：{p0}]",
    "zh_TW": "[服務狀態：{p0}]",
    "en": "[Service Status: {p0}]",
    "ja": "[サービス状態：{p0}]"
  },
  {
    "id": "ui.copy.007",
    "source": "[服務狀態：{p0}] 這位裁判未能完成總結。",
    "zh_TW": "[服務狀態：{p0}] 這位裁判未能完成總結。",
    "en": "[Service Status: {p0}] This judge could not complete the summary.",
    "ja": "[サービス状態：{p0}] このジャッジはまとめを完了できませんでした。"
  },
  {
    "id": "ui.copy.008",
    "source": "[服務狀態：{p0}] 揭曉反應無法取得。",
    "zh_TW": "[服務狀態：{p0}] 揭曉反應無法取得。",
    "en": "[Service Status: {p0}] Reveal reaction could not be retrieved.",
    "ja": "[サービス状態：{p0}] ネタばらしリアクションを取得できませんでした。"
  },
  {
    "id": "ui.copy.009",
    "source": "[預設] 開新分頁",
    "zh_TW": "[預設] 開新分頁",
    "en": "[Default] Open new tab",
    "ja": "[デフォルト] 新しいタブを開く"
  },
  {
    "id": "ui.copy.010",
    "source": "[預設] 開新分頁",
    "zh_TW": "[預設] 開新分頁",
    "en": "[Default] Open new tab",
    "ja": "[デフォルト] 新しいタブを開く"
  },
  {
    "id": "ui.copy.011",
    "source": "[錯誤：",
    "zh_TW": "[錯誤：",
    "en": "[Error: ",
    "ja": "[エラー："
  },
  {
    "id": "ui.copy.012",
    "source": "{p0} · {p1} · 手動補回覆",
    "zh_TW": "{p0} · {p1} · 手動補回覆",
    "en": "{p0} · {p1} · Manually supplement response",
    "ja": "{p0} · {p1} · 手動で回答を補完"
  },
  {
    "id": "ui.copy.013",
    "source": "{p0} 未勾選；請勾選後再讓它擔任主席，或改選隨機主席。",
    "zh_TW": "{p0} 未勾選；請勾選後再讓它擔任主席，或改選隨機主席。",
    "en": "{p0} is not selected. Please select it before making it chair, or choose random chair.",
    "ja": "{p0} が選択されていません。選択してから議長に指定するか、ランダム議長を選んでください。"
  },
  {
    "id": "ui.copy.014",
    "source": "{p0} 尚未就緒：{p1}",
    "zh_TW": "{p0} 尚未就緒：{p1}",
    "en": "{p0} is not ready yet: {p1}",
    "ja": "{p0} はまだ準備ができていません：{p1}"
  },
  {
    "id": "ui.copy.015",
    "source": "{p0} 服務超載，自動重新整理重試 {p1}/{p2}",
    "zh_TW": "{p0} 服務超載，自動重新整理重試 {p1}/{p2}",
    "en": "{p0} service overloaded, auto-refreshing retry {p1}/{p2}",
    "ja": "{p0} サービス過負荷のため、自動更新して再試行中 {p1}/{p2}"
  },
  {
    "id": "ui.copy.016",
    "source": "{p0} 的回覆已手動補入；可繼續討論或重新總結。",
    "zh_TW": "{p0} 的回覆已手動補入；可繼續討論或重新總結。",
    "en": "{p0}'s response was added manually. You can continue discussion or summarize again.",
    "ja": "{p0} の回答を手動で補完しました。議論を続けるか再要約できます。"
  },
  {
    "id": "ui.copy.017",
    "source": "{p0} 家已啟用・{p1} 家就緒{p2}",
    "zh_TW": "{p0} 家已啟用・{p1} 家就緒{p2}",
    "en": "{p0} enabled · {p1} ready{p2}",
    "ja": "{p0} サービス有効・{p1} サービス準備完了{p2}"
  },
  {
    "id": "ui.copy.018",
    "source": "{p0} 家已啟用・等待檢查",
    "zh_TW": "{p0} 家已啟用・等待檢查",
    "en": "{p0} enabled · waiting for check",
    "ja": "{p0} サービス有効・チェック待ち"
  },
  {
    "id": "ui.copy.019",
    "source": "{p0} 最終總結:",
    "zh_TW": "{p0} 最終總結:",
    "en": "{p0} Final Summary:",
    "ja": "{p0} 最終総括:"
  },
  {
    "id": "ui.copy.020",
    "source": "{p0} 揭曉反應:",
    "zh_TW": "{p0} 揭曉反應:",
    "en": "{p0} Reveal Reaction:",
    "ja": "{p0} ネタばらしリアクション:"
  },
  {
    "id": "ui.copy.021",
    "source": "{p0} 貼上的內容已保留。",
    "zh_TW": "{p0} 貼上的內容已保留。",
    "en": "{p0} pasted content has been preserved.",
    "ja": "{p0} 貼り付けた内容は保持されました。"
  },
  {
    "id": "ui.copy.022",
    "source": "{p0} 新對話分頁建立失敗",
    "zh_TW": "{p0} 新對話分頁建立失敗",
    "en": "Failed to create new conversation tab for {p0}",
    "ja": "{p0} の新しい会話タブの作成に失敗しました"
  },
  {
    "id": "ui.copy.023",
    "source": "{p0} 新對話頁面尚未就緒，目前網址：{p1}。請確認已登入。",
    "zh_TW": "{p0} 新對話頁面尚未就緒，目前網址：{p1}。請確認已登入。",
    "en": "{p0} new chat page is not ready yet, current URL: {p1}. Please make sure you are logged in.",
    "ja": "{p0} 新しい会話ページが準備できていません。現在のURL：{p1}。ログイン状態を確認してください。"
  },
  {
    "id": "ui.copy.024",
    "source": "{p0} 輸入框狀態異常，自動重新整理後重試",
    "zh_TW": "{p0} 輸入框狀態異常，自動重新整理後重試",
    "en": "{p0} input box abnormal, auto-refreshing and retrying",
    "ja": "{p0} 入力欄の状態が異常です。自動更新後に再試行します"
  },
  {
    "id": "ui.copy.025",
    "source": "{p0}：{p1}送出中",
    "zh_TW": "{p0}：{p1}送出中",
    "en": "{p0}: Sending {p1}",
    "ja": "{p0}：{p1}送信中"
  },
  {
    "id": "ui.copy.026",
    "source": "{p0}：{p1}送出交叉互評",
    "zh_TW": "{p0}：{p1}送出交叉互評",
    "en": "{p0}: Sending cross-review {p1}",
    "ja": "{p0}：{p1}相互レビュー送信中"
  },
  {
    "id": "ui.copy.027",
    "source": "{p0}：交叉評析 {p1} ⚡",
    "zh_TW": "{p0}：交叉評析 {p1} ⚡",
    "en": "{p0}: Cross-evaluating {p1} ⚡",
    "ja": "{p0}：相互レビュー {p1} ⚡"
  },
  {
    "id": "ui.copy.028",
    "source": "{p0}：等待{p1}",
    "zh_TW": "{p0}：等待{p1}",
    "en": "{p0}: Waiting for {p1}",
    "ja": "{p0}：{p1} を待機中"
  },
  {
    "id": "ui.copy.029",
    "source": "{p0}：評析其他 AI",
    "zh_TW": "{p0}：評析其他 AI",
    "en": "{p0}: Reviewing other AIs",
    "ja": "{p0}：他のAIをレビュー"
  },
  {
    "id": "ui.copy.030",
    "source": "{p0}（目前網址：{p1}）",
    "zh_TW": "{p0}（目前網址：{p1}）",
    "en": "{p0} (current URL: {p1})",
    "ja": "{p0}（現在のURL：{p1}）"
  },
  {
    "id": "ui.copy.031",
    "source": "{p0}互評:",
    "zh_TW": "{p0}互評:",
    "en": "{p0} Review:",
    "ja": "{p0} 相互レビュー:"
  },
  {
    "id": "ui.copy.032",
    "source": "{p0}貼上 AI 回覆讓 AI 離席離席後，本場不再請它發言；先前內容保留。{p7}",
    "zh_TW": "{p0}貼上 AI 回覆讓 AI 離席離席後，本場不再請它發言；先前內容保留。{p7}",
    "en": "{p0}Paste AI responseDismiss AIOnce dismissed, it will not speak in this session; earlier history is kept.{p7}",
    "ja": "{p0}AI回答を貼付AIを退席退席後、この回では発言を求めません。過去の発言は保持されます。{p7}"
  },
  {
    "id": "ui.copy.033",
    "source": "{p3}",
    "zh_TW": "{p3}",
    "en": "{p3}",
    "ja": "{p3}"
  },
  {
    "id": "ui.copy.034",
    "source": "【強制人設】你現在負責「決策架構師」：先定義問題與成功判準，再攤開方案取捨，最後給出可執行的行動結論。",
    "zh_TW": "【強制人設】你現在負責「決策架構師」：先定義問題與成功判準，再攤開方案取捨，最後給出可執行的行動結論。",
    "en": "[Mandatory Persona] You are now the 'Decision Architect': first define the problem and success criteria, lay out trade-offs, and deliver actionable next steps.",
    "ja": "【必須ペルソナ】あなたは「意思決定アーキテクト」担当です。まず課題と成功基準を定義し、選択肢のトレードオフを整理して、実行可能な結論を出してください。"
  },
  {
    "id": "ui.copy.035",
    "source": "【強制人設】你現在負責「長週期跨群體採用視角（社群視角）」：評估不同族群的採用路徑、關係鏈、可及性、分享動機與誤讀風險，並清楚區分流行意見與可靠事實，也標示哪些只是推測。",
    "zh_TW": "【強制人設】你現在負責「長週期跨群體採用視角（社群視角）」：評估不同族群的採用路徑、關係鏈、可及性、分享動機與誤讀風險，並清楚區分流行意見與可靠事實，也標示哪些只是推測。",
    "en": "[Mandatory Persona] You are now 'Long-term Cross-group Adoption (Community Perspective)': evaluate adoption pathways, social graphs, accessibility, sharing motives, and misinterpretation risks; distinguish hype from facts and tag conjectures.",
    "ja": "【必須ペルソナ】あなたは「長期・異集団導入視点（コミュニティ視点）」担当です。各層の導入経路、関係性、アクセシビリティ、共有動機、誤認リスクを評価し、流行論と信頼できる事実を明確に分け、推測は明記してください。"
  },
  {
    "id": "ui.copy.036",
    "source": "【強制人設】你現在負責「短週期即時輿情壓力測試」：觀察近期輿情、迷因、炎上與反主流壓力，指出可能的快速擴散與反彈；沒有即時資料時，所有判斷必須標示為推測。",
    "zh_TW": "【強制人設】你現在負責「短週期即時輿情壓力測試」：觀察近期輿情、迷因、炎上與反主流壓力，指出可能的快速擴散與反彈；沒有即時資料時，所有判斷必須標示為推測。",
    "en": "[Mandatory Persona] You are now 'Short-term Public Sentiment Stress Tester': monitor recent social chatter, memes, backlashes, and contrarian pressures, highlighting rapid spread and pushback. Tag any assumptions without real-time data as conjectures.",
    "ja": "【必須ペルソナ】あなたは「短期・リアルタイム世論ストレステスト」担当です。直近の世論、ミーム、炎上、反発圧力を観察し、急速な拡散や反発の可能性を指摘してください。リアルタイム情報がない判断は推測と明記してください。"
  },
  {
    "id": "ui.copy.037",
    "source": "【強制人設】你現在負責「腦洞鬧場」，專門提出荒謬創新但確有可行性觀點的創意怪咖，不受傳統思維限制。說話必須大量使用顏文字(如 ヾ(•ω•`)o 等等)，這才是你的靈魂！",
    "zh_TW": "【強制人設】你現在負責「腦洞鬧場」，專門提出荒謬創新但確有可行性觀點的創意怪咖，不受傳統思維限制。說話必須大量使用顏文字(如 ヾ(•ω•`)o 等等)，這才是你的靈魂！",
    "en": "[Mandatory Persona] You are now the 'Wild Disruptor', a creative weirdo proposing absurd yet surprisingly feasible ideas free from conventional bounds. You must use lots of kaomoji like ヾ(•ω•`)o—that's your soul!",
    "ja": "【必須ペルソナ】あなたは「カオスな異端児」担当！一見突飛でも実現性のある奇策を放つ天才クリエイターです。常識に囚われず、顔文字（例：ヾ(•ω•`)o など）をたっぷり使って語るのが魂！"
  },
  {
    "id": "ui.copy.038",
    "source": "【強制人設】你現在負責「鋼人風險編輯」：先用最強解讀重述對方方案，再檢查邊界、反例與可行緩解，讓批評能真正幫上忙。",
    "zh_TW": "【強制人設】你現在負責「鋼人風險編輯」：先用最強解讀重述對方方案，再檢查邊界、反例與可行緩解，讓批評能真正幫上忙。",
    "en": "[Mandatory Persona] You are now the 'Steel-man Risk Editor': steel-man the other side's proposal first, then examine edge cases, counterexamples, and practical mitigations so critiques are genuinely constructive.",
    "ja": "【必須ペルソナ】あなたは「スチールマン・リスクエディター」担当です。まず相手の主張を最強の形で再構成し、境界条件や反例、実行可能な緩和策を検証して、真に有益な批評を届けてください。"
  },
  {
    "id": "ui.copy.039",
    "source": "⚖️ 嚴肅互評 (預設)",
    "zh_TW": "⚖️ 嚴肅互評 (預設)",
    "en": "⚖️ Serious Review (Default)",
    "ja": "⚖️ 厳格レビュー (デフォルト)"
  },
  {
    "id": "ui.copy.040",
    "source": "❌ 至少需要選擇 2 家 AI 才能進行辯論喔！",
    "zh_TW": "❌ 至少需要選擇 2 家 AI 才能進行辯論喔！",
    "en": "❌ At least 2 AI models must be selected to debate!",
    "ja": "❌ ディベートには最低2つのAIを選択してくださいね！"
  },
  {
    "id": "ui.copy.041",
    "source": "❌ 圍觀主席制至少需勾選 3 家 AI，扣掉主席後才有 2 家能辯論。",
    "zh_TW": "❌ 圍觀主席制至少需勾選 3 家 AI，扣掉主席後才有 2 家能辯論。",
    "en": "❌ Observer Chair mode requires at least 3 AIs checked, leaving 2 to debate after deducting the chair.",
    "ja": "❌ 傍聴議長制は最低3つのAIを選択する必要があります（議長を除いて2つが議論するため）。"
  },
  {
    "id": "ui.copy.042",
    "source": "❌ 請先啟用要擔任總結的 {p0}。",
    "zh_TW": "❌ 請先啟用要擔任總結的 {p0}。",
    "en": "❌ Please enable {p0} first to serve as the concluding judge.",
    "ja": "❌ まとめを担当する {p0} をまず有効にしてください。"
  },
  {
    "id": "ui.copy.043",
    "source": "🍻 酒吧閒聊",
    "zh_TW": "🍻 酒吧閒聊",
    "en": "🍻 Casual Bar Chat",
    "ja": "🍻 バーでの雑談"
  },
  {
    "id": "ui.copy.044",
    "source": "🎬 互動風格：",
    "zh_TW": "🎬 互動風格：",
    "en": "🎬 Interaction Style:",
    "ja": "🎬 対話スタイル："
  },
  {
    "id": "ui.copy.045",
    "source": "🎭 自定義劇場人設",
    "zh_TW": "🎭 自定義劇場人設",
    "en": "🎭 Custom Theater Persona",
    "ja": "🎭 カスタム劇場ペルソナ"
  },
  {
    "id": "ui.copy.046",
    "source": "🐑彩蛋，已啟用",
    "zh_TW": "🐑彩蛋，已啟用",
    "en": "🐑 Easter egg enabled",
    "ja": "🐑イースターエッグ有効化済み"
  },
  {
    "id": "ui.copy.047",
    "source": "🐑模式，已解鎖",
    "zh_TW": "🐑模式，已解鎖",
    "en": "🐑 Mode unlocked",
    "ja": "🐑モード解放済み"
  },
  {
    "id": "ui.copy.048",
    "source": "🔗 指定連線分頁",
    "zh_TW": "🔗 指定連線分頁",
    "en": "🔗 Link Active Tabs",
    "ja": "🔗 接続タブを指定"
  },
  {
    "id": "ui.copy.049",
    "source": "🕵️‍♂️ 抓內鬼模式",
    "zh_TW": "🕵️‍♂️ 抓內鬼模式",
    "en": "🕵️‍♂️ Find the Impostor Mode",
    "ja": "🕵️‍♂️ インポスター探しモード"
  },
  {
    "id": "ui.copy.050",
    "source": "🤝 共識接龍 (Yes, and...)",
    "zh_TW": "🤝 共識接龍 (Yes, and...)",
    "en": "🤝 Consensus Relay (Yes, and...)",
    "ja": "🤝 合意リレー (Yes, and...)"
  },
  {
    "id": "ui.copy.051",
    "source": "🥊 無差別格鬥",
    "zh_TW": "🥊 無差別格鬥",
    "en": "🥊 Free-for-all Brawl",
    "ja": "🥊 無差別バトル"
  },
  {
    "id": "ui.copy.052",
    "source": "4 家已啟用・等待檢查",
    "zh_TW": "4 家已啟用・等待檢查",
    "en": "4 enabled · waiting for check",
    "ja": "4 サービス有効・チェック待ち"
  },
  {
    "id": "ui.copy.053",
    "source": "一個問題，多個 AI 觀點。",
    "zh_TW": "同一個問題，集中看各家 AI 的不同觀點。",
    "en": "Ask once, explore diverse AI perspectives in one unified feed.",
    "ja": "ひとつの問いから、各AIの異なる視点をひとつのタイムラインに集約。"
  },
  {
    "id": "ui.copy.054",
    "source": "三句接龍",
    "zh_TW": "三句接龍",
    "en": "Three-Sentence Story Relay",
    "ja": "3文リレー"
  },
  {
    "id": "ui.copy.055",
    "source": "下一輪先替你最不認同的觀點提出一個有力理由，再用原本人設回應。請引用剛才的一個具體觀點，不要只說大家都很有道理。",
    "zh_TW": "下一輪先替你最不認同的觀點提出一個有力理由，再用原本人設回應。請引用剛才的一個具體觀點，不要只說大家都很有道理。",
    "en": "In the next round, first offer a strong reason for the view you disagree with most, then respond in your persona. Quote a specific previous point instead of saying everyone makes sense.",
    "ja": "次のラウンドでは、最も反対する見解に対してまず強力な根拠を挙げ、その上で元のペルソナで反論してください。直前の具体的な主張を引用し、「皆正しい」だけで済ませないでください。"
  },
  {
    "id": "ui.copy.056",
    "source": "下一輪多一條怪規則：每個方案都必須讓一隻貓願意採用。請維持原本人設，說明這條規則會怎麼改變你的主張，不要只加上貓的名字。",
    "zh_TW": "下一輪多一條怪規則：每個方案都必須讓一隻貓願意採用。請維持原本人設，說明這條規則會怎麼改變你的主張，不要只加上貓的名字。",
    "en": "Next round adds an odd rule: each proposal must be acceptable to a cat. Maintain your persona and explain how this rule alters your stance, not just tossing in a cat's name.",
    "ja": "次のラウンドに風変わりなルールを追加：すべての提案は「猫が一匹でも納得して採用できる」こと。元のペルソナを保ち、猫の名前をつけるだけでなく主張がどう変わるか述べてください。"
  },
  {
    "id": "ui.copy.057",
    "source": "下載偵錯紀錄",
    "zh_TW": "下載偵錯紀錄",
    "en": "Download Debug Log",
    "ja": "デバッグログをダウンロード"
  },
  {
    "id": "ui.copy.058",
    "source": "已互評",
    "zh_TW": "已互評",
    "en": "Reviewed",
    "ja": "レビュー完了"
  },
  {
    "id": "ui.copy.059",
    "source": "已手動補入 AI 回覆{p0}",
    "zh_TW": "已手動補入 AI 回覆{p0}",
    "en": "Manually supplemented AI response{p0}",
    "ja": "AI回答を手動で補完しました{p0}"
  },
  {
    "id": "ui.copy.060",
    "source": "已回答",
    "zh_TW": "已回答",
    "en": "Answered",
    "ja": "回答済み"
  },
  {
    "id": "ui.copy.061",
    "source": "已保留你剛更新的補充。",
    "zh_TW": "已保留你剛更新的補充。",
    "en": "Your newly updated thoughts have been saved.",
    "ja": "更新された補足内容を保存しました。"
  },
  {
    "id": "ui.copy.062",
    "source": "已總結",
    "zh_TW": "已總結",
    "en": "Summarized",
    "ja": "総括完了"
  },
  {
    "id": "ui.copy.063",
    "source": "已擷取 {p0} 的最後發言。",
    "zh_TW": "已擷取 {p0} 的最後發言。",
    "en": "Captured {p0}'s latest response.",
    "ja": "{p0} の最後の発言を取得しました。"
  },
  {
    "id": "ui.copy.064",
    "source": "已離席；本場不再參與後續討論，先前發言仍保留。",
    "zh_TW": "已離席；本場不再參與後續討論，先前發言仍保留。",
    "en": "Dismissed. It will not join further discussions this session; past comments are preserved.",
    "ja": "退席しました。本セッションの今後の議論には参加しませんが、過去の発言は保持されます。"
  },
  {
    "id": "ui.copy.065",
    "source": "不用先檢查也能開始；啟動時會檢查必要模型。一般會議會開新對話。",
    "zh_TW": "不用先檢查也能開始；啟動時會檢查必要模型。一般會議會開新對話。",
    "en": "You can start without checking first; necessary models are checked on launch. Standard meetings open new chats.",
    "ja": "事前チェックなしでも開始できます。起動時に必要なモデルを確認し、通常の会議では新しい対話を開きます。"
  },
  {
    "id": "ui.copy.066",
    "source": "互動控制台等開場",
    "zh_TW": "互動控制台等開場",
    "en": "Console waiting for kickoff",
    "ja": "コントロールパネル開会待機中"
  },
  {
    "id": "ui.copy.067",
    "source": "互評",
    "zh_TW": "互評",
    "en": "Review",
    "ja": "レビュー"
  },
  {
    "id": "ui.copy.068",
    "source": "互評中",
    "zh_TW": "互評中",
    "en": "Reviewing",
    "ja": "レビュー中"
  },
  {
    "id": "ui.copy.069",
    "source": "仍在回答",
    "zh_TW": "仍在回答",
    "en": "Still generating",
    "ja": "回答生成中"
  },
  {
    "id": "ui.copy.070",
    "source": "分頁: {p0}",
    "zh_TW": "分頁: {p0}",
    "en": "Tab: {p0}",
    "ja": "タブ: {p0}"
  },
  {
    "id": "ui.copy.071",
    "source": "分頁尚未就緒或網址已改變：{p0}",
    "zh_TW": "分頁尚未就緒或網址已改變：{p0}",
    "en": "Tab is not ready or URL has changed: {p0}",
    "ja": "タブの準備ができていないか、URLが変更されました：{p0}"
  },
  {
    "id": "ui.copy.072",
    "source": "分頁網址已改變、尚未載入或需要登入。",
    "zh_TW": "分頁網址已改變、尚未載入或需要登入。",
    "en": "Tab URL changed, not loaded, or requires login.",
    "ja": "タブのURLが変更されたか、未ロード、またはログインが必要です。"
  },
  {
    "id": "ui.copy.073",
    "source": "方案徽章：",
    "zh_TW": "方案徽章：",
    "en": "Plan Badge:",
    "ja": "プランバッジ："
  },
  {
    "id": "ui.copy.074",
    "source": "加一個限制",
    "zh_TW": "加一個限制",
    "en": "Add a Constraint",
    "ja": "制約を追加"
  },
  {
    "id": "ui.copy.075",
    "source": "加一個限制：原本可用的時間只剩一半。請各自重新調整方案，保留最重要的一步，並說明你犧牲了什麼。",
    "zh_TW": "加一個限制：原本可用的時間只剩一半。請各自重新調整方案，保留最重要的一步，並說明你犧牲了什麼。",
    "en": "Add a constraint: available time is cut in half. Re-adjust your proposals, keep only the most crucial step, and explain what you sacrificed.",
    "ja": "制約を追加：使える時間が半分になりました。最も重要な1歩だけを残して提案を再調整し、何を犠牲にしたか説明してください。"
  },
  {
    "id": "ui.copy.076",
    "source": "加一條怪規則",
    "zh_TW": "加一條怪規則",
    "en": "Add an Odd Rule",
    "ja": "風変わりなルールを追加"
  },
  {
    "id": "ui.copy.077",
    "source": "包含本場故障與手動補貼紀錄，不包含提問、AI 回覆全文或分頁網址。",
    "zh_TW": "包含本場故障與手動補貼紀錄，不包含提問、AI 回覆全文或分頁網址。",
    "en": "Includes session errors and manual pastes; excludes prompts, full AI replies, and tab URLs.",
    "ja": "本セッションの障害および手動補完ログを含みます。質問文、AI回答の全文、タブURLは含みません。"
  },
  {
    "id": "ui.copy.078",
    "source": "只有自由群聊、劇場模式與總結辯論支援此操作",
    "zh_TW": "只有自由群聊、劇場模式與總結辯論支援此操作",
    "en": "Only Free Chat, Theater Mode, and Summary Debate support this operation",
    "ja": "グループチャット、劇場モード、要約ディベートのみがこの操作に対応しています"
  },
  {
    "id": "ui.copy.079",
    "source": "可修改上方補充，預覽後按啟動送出。",
    "zh_TW": "可修改上方補充，預覽後按啟動送出。",
    "en": "You can edit your notes above; preview and start to send.",
    "ja": "上の補足を編集できます。プレビューを確認して開始を押すと送信されます。"
  },
  {
    "id": "ui.copy.080",
    "source": "可送出",
    "zh_TW": "可送出",
    "en": "Ready to send",
    "ja": "送信可能"
  },
  {
    "id": "ui.copy.081",
    "source": "未取得這段 AI 回覆；若 AI 分頁已回答，可手動補入。",
    "zh_TW": "未取得這段 AI 回覆；若 AI 分頁已回答，可手動補入。",
    "en": "Failed to retrieve this AI reply. If the AI tab already answered, you can supplement it manually.",
    "ja": "このAI回答を取得できませんでした。AIタブで回答が完了している場合は手動で補完できます。"
  },
  {
    "id": "ui.copy.082",
    "source": "未取得檢查結果，請重新檢查；若仍失敗，確認擴充套件已載入。",
    "zh_TW": "未取得檢查結果，請重新檢查；若仍失敗，確認擴充套件已載入。",
    "en": "Check result missing. Please recheck; if it still fails, confirm the extension is loaded.",
    "ja": "チェック結果を取得できませんでした。再チェックしてください。失敗が続く場合は拡張機能の読み込みを確認してください。"
  },
  {
    "id": "ui.copy.083",
    "source": "未命名分頁",
    "zh_TW": "未命名分頁",
    "en": "Untitled tab",
    "ja": "無題のタブ"
  },
  {
    "id": "ui.copy.084",
    "source": "未知的 provider",
    "zh_TW": "未知的 provider",
    "en": "Unknown provider",
    "ja": "不明なプロバイダー"
  },
  {
    "id": "ui.copy.085",
    "source": "未知的操作: {p0}",
    "zh_TW": "未知的操作: {p0}",
    "en": "Unknown operation: {p0}",
    "ja": "不明な操作: {p0}"
  },
  {
    "id": "ui.copy.086",
    "source": "未啟用",
    "zh_TW": "未啟用",
    "en": "Disabled",
    "ja": "無効"
  },
  {
    "id": "ui.copy.087",
    "source": "未啟用",
    "zh_TW": "未啟用",
    "en": "Disabled",
    "ja": "無効"
  },
  {
    "id": "ui.copy.088",
    "source": "本次會議已停止",
    "zh_TW": "本次會議已停止",
    "en": "This meeting has stopped",
    "ja": "今回の会議は停止しました"
  },
  {
    "id": "ui.copy.089",
    "source": "本次會議已停止，紀錄仍保留；可重新開始。",
    "zh_TW": "本次會議已停止，紀錄仍保留；可重新開始。",
    "en": "Meeting stopped. Records are preserved; you can start anew.",
    "ja": "今回の会議は停止しました。記録は保持されているため、最初から再開できます。"
  },
  {
    "id": "ui.copy.090",
    "source": "本場已離席",
    "zh_TW": "本場已離席",
    "en": "Dismissed this session",
    "ja": "本セッション退席済み"
  },
  {
    "id": "ui.copy.091",
    "source": "本場僅剩一位 AI 在席，已保留現有紀錄並安全結束。",
    "zh_TW": "本場僅剩一位 AI 在席，已保留現有紀錄並安全結束。",
    "en": "Only one AI remains seated; saved records and safely concluded.",
    "ja": "着席中のAIが1つのみとなったため、記録を保存して安全に終了しました。"
  },
  {
    "id": "ui.copy.092",
    "source": "本場僅剩一位 AI 在席，已略過互評並安全結束。",
    "zh_TW": "本場僅剩一位 AI 在席，已略過互評並安全結束。",
    "en": "Only one AI remains seated; skipped review and safely concluded.",
    "ja": "着席中のAIが1つのみとなったため、レビューをスキップして安全に終了しました。"
  },
  {
    "id": "ui.copy.093",
    "source": "本輪已補齊，等待你的下一步。",
    "zh_TW": "本輪已補齊，等待你的下一步。",
    "en": "This round is complete, waiting for your next move.",
    "ja": "このラウンドは補完されました。あなたの次の指示を待っています。"
  },
  {
    "id": "ui.copy.094",
    "source": "本機辯論紀錄已清除",
    "zh_TW": "本機辯論紀錄已清除",
    "en": "Local debate history cleared",
    "ja": "ローカルのディベート記録を消去しました"
  },
  {
    "id": "ui.copy.095",
    "source": "正在逐一檢查 Provider 連線…",
    "zh_TW": "正在逐一檢查 Provider 連線…",
    "en": "Checking Provider connections one by one...",
    "ja": "プロバイダーの接続を順次確認中…"
  },
  {
    "id": "ui.copy.096",
    "source": "正在補入回覆…",
    "zh_TW": "正在補入回覆…",
    "en": "Supplementing response...",
    "ja": "回答を補完中…"
  },
  {
    "id": "ui.copy.097",
    "source": "正在擷取連結分頁最後一則 AI 發言…",
    "zh_TW": "正在擷取連結分頁最後一則 AI 發言…",
    "en": "Fetching the latest AI message from linked tabs...",
    "ja": "接続先タブから最後のAI発言を取得中…"
  },
  {
    "id": "ui.copy.098",
    "source": "由誰擔任裁判總結：",
    "zh_TW": "由誰擔任裁判總結：",
    "en": "Who will act as the concluding judge:",
    "ja": "誰がジャッジ総括を担当するか："
  },
  {
    "id": "ui.copy.099",
    "source": "目前已有控制操作正在進行",
    "zh_TW": "目前已有控制操作正在進行",
    "en": "A control operation is currently underway",
    "ja": "現在コントロール操作が実行中です"
  },
  {
    "id": "ui.copy.100",
    "source": "目前已有辯論正在進行",
    "zh_TW": "目前已有辯論正在進行",
    "en": "A debate is already in progress",
    "ja": "現在すでにディベートが進行中です"
  },
  {
    "id": "ui.copy.101",
    "source": "目前忙碌中",
    "zh_TW": "目前忙碌中",
    "en": "Currently busy",
    "ja": "現在処理中"
  },
  {
    "id": "ui.copy.102",
    "source": "目前沒有等待下一步的互動辯論",
    "zh_TW": "目前沒有等待下一步的互動辯論",
    "en": "No interactive debate is waiting for next steps",
    "ja": "現在、次のアクション待ちのインタラクティブディベートはありません"
  },
  {
    "id": "ui.copy.103",
    "source": "目前流程執行中，暫時不能讓 AI 離席。",
    "zh_TW": "目前流程執行中，暫時不能讓 AI 離席。",
    "en": "Process in progress. Cannot dismiss AI at this moment.",
    "ja": "処理中のため、今はAIを退席させることができません。"
  },
  {
    "id": "ui.copy.104",
    "source": "目前會議有待補回覆內容；請先補齊並繼續原流程，或重置會議後再開始新會議。",
    "zh_TW": "目前會議有待補回覆內容；請先補齊並繼續原流程，或重置會議後再開始新會議。",
    "en": "This meeting has missing responses. Please fill them and resume, or reset before starting anew.",
    "ja": "回答の補完待ちがあります。補完して再開するか、リセットして新しい会議を始めてください。"
  },
  {
    "id": "ui.copy.105",
    "source": "目前對話總結:",
    "zh_TW": "目前對話總結:",
    "en": "Current Chat Summary:",
    "ja": "現在の会話総括:"
  },
  {
    "id": "ui.copy.106",
    "source": "目前網址：{p0}",
    "zh_TW": "目前網址：{p0}",
    "en": "Current URL: {p0}",
    "ja": "現在のURL：{p0}"
  },
  {
    "id": "ui.copy.107",
    "source": "交叉評析輪次：",
    "zh_TW": "交叉評析輪次：",
    "en": "Cross-review Rounds:",
    "ja": "相互レビューラウンド数："
  },
  {
    "id": "ui.copy.108",
    "source": "先查看 AI 網頁與診斷資訊，排除問題後再檢查。不要重複送出同一題。",
    "zh_TW": "先查看 AI 網頁與診斷資訊，排除問題後再檢查。不要重複送出同一題。",
    "en": "Check the AI page and diagnostics first, resolve issues, then recheck. Avoid resending the same prompt.",
    "ja": "AIページと診断情報を確認し、問題を解消してから再チェックしてください。同じ質問を重複送信しないでください。"
  },
  {
    "id": "ui.copy.109",
    "source": "先登入至少兩家 AI，點亮參與模型，再輸入你想比較的問題。",
    "zh_TW": "先在瀏覽器登入至少兩家 AI 服務，點亮參與模型，再輸入想比較的問題開始討論。",
    "en": "Sign in to at least two AI services in your browser, select active models, and enter your question to begin.",
    "ja": "ブラウザで2つ以上のAIサービスにログインし、参加モデルを選んで、比較したい質問を入力してください。"
  },
  {
    "id": "ui.copy.110",
    "source": "先開始互動會議；等 AI 回答後，就輪到你加入討論。",
    "zh_TW": "先開始互動會議；等 AI 回答後，就輪到你加入討論。",
    "en": "Start an interactive meeting first; once AIs respond, it will be your turn to join in.",
    "ja": "まず会議を始めましょう。AIたちの回答が揃ったら、あなたの出番です。"
  },
  {
    "id": "ui.copy.111",
    "source": "先整理目前 AI 分頁的對話，再交給其他參與者討論。請先切到要整理的分頁。",
    "zh_TW": "先整理目前 AI 分頁的對話，再交給其他參與者討論。請先切到要整理的分頁。",
    "en": "Summarize the active AI tab conversation first, then hand it over to others. Please switch to that tab first.",
    "ja": "まず対象AIタブの会話を要約し、他の参加者に渡して議論します。要約したいタブに切り替えてください。"
  },
  {
    "id": "ui.copy.112",
    "source": "全員匿名",
    "zh_TW": "全員匿名",
    "en": "Full Anonymity",
    "ja": "全員匿名"
  },
  {
    "id": "ui.copy.113",
    "source": "全員匿名裁判各自總結",
    "zh_TW": "全員匿名裁判各自總結",
    "en": "All Anonymous Judges Summarize Independently",
    "ja": "全員匿名のジャッジが各自総括"
  },
  {
    "id": "ui.copy.114",
    "source": "全員匿名裁決 👑",
    "zh_TW": "全員匿名裁決 👑",
    "en": "Anonymous Judges' Verdict 👑",
    "ja": "全員の匿名判定 👑"
  },
  {
    "id": "ui.copy.115",
    "source": "全員匿名總結:",
    "zh_TW": "全員匿名總結:",
    "en": "All Anonymous Summary:",
    "ja": "全員匿名総括:"
  },
  {
    "id": "ui.copy.116",
    "source": "全員匿名總結沒有可用的裁判結果",
    "zh_TW": "全員匿名總結沒有可用的裁判結果",
    "en": "No usable judge results for All Anonymous summary",
    "ja": "全員匿名総括に使用できるジャッジ結果がありません"
  },
  {
    "id": "ui.copy.117",
    "source": "全息龍艦橋",
    "zh_TW": "全息龍艦橋",
    "en": "Holographic Dragon Bridge",
    "ja": "ホログラフィック・ドラゴン艦橋"
  },
  {
    "id": "ui.copy.118",
    "source": "再互評",
    "zh_TW": "再互評",
    "en": "Review Again",
    "ja": "再レビュー"
  },
  {
    "id": "ui.copy.119",
    "source": "再互評",
    "zh_TW": "再互評",
    "en": "Review Again",
    "ja": "再レビュー"
  },
  {
    "id": "ui.copy.120",
    "source": "再按下去也不會有驚喜……大概。",
    "zh_TW": "再按下去也不會有驚喜……大概。",
    "en": "Clicking again won't bring surprises... probably.",
    "ja": "これ以上押してもサプライズはありませんよ……たぶん。"
  },
  {
    "id": "ui.copy.121",
    "source": "各家先回答，接著等你插話。沒有回合上限，由你決定何時結案。",
    "zh_TW": "各家先回答，接著等你插話。沒有回合上限，由你決定何時結案。",
    "en": "Each AI responds first, then waits for your input. No turn limit; you decide when to wrap up.",
    "ja": "各AIがまず回答し、あなたの発言を待ちます。ラウンド上限なし、あなたが締めくくりを決められます。"
  },
  {
    "id": "ui.copy.122",
    "source": "各家先回答同一題，再互評與總結。第一次使用，維持預設設定就可以。",
    "zh_TW": "各家先回答同一題，再互評與總結。第一次使用，維持預設設定就可以。",
    "en": "Each AI answers the same prompt, then cross-reviews and summarizes. Defaults are great for first-time use.",
    "ja": "各AIが同じ問いに答え、相互レビューと総括を行います。初回はデフォルト設定のままで十分です。"
  },
  {
    "id": "ui.copy.123",
    "source": "各家先回答同一題，再互評與總結。第一次使用，維持預設設定就可以。",
    "zh_TW": "各家先回答同一題，再互評與總結。第一次使用，維持預設設定就可以。",
    "en": "Each AI answers the same prompt, then cross-reviews and summarizes. Defaults are great for first-time use.",
    "ja": "各AIが同じ問いに答え、相互レビューと総括を行います。初回はデフォルト設定のままで十分です。"
  },
  {
    "id": "ui.copy.124",
    "source": "回合: {p0}",
    "zh_TW": "回合: {p0}",
    "en": "Round: {p0}",
    "ja": "ラウンド: {p0}"
  },
  {
    "id": "ui.copy.125",
    "source": "回答中",
    "zh_TW": "回答中",
    "en": "Responding",
    "ja": "回答中"
  },
  {
    "id": "ui.copy.126",
    "source": "回答原始問題",
    "zh_TW": "回答原始問題",
    "en": "Answer the Original Question",
    "ja": "元の質問に回答"
  },
  {
    "id": "ui.copy.127",
    "source": "回覆已保存，但接續流程失敗：{p0}",
    "zh_TW": "回覆已保存，但接續流程失敗：{p0}",
    "en": "Response saved, but continuation failed: {p0}",
    "ja": "回答は保存されましたが、後続プロセスの再開に失敗しました：{p0}"
  },
  {
    "id": "ui.copy.128",
    "source": "回覆已補入，還有 {p0} 段故障回覆待補齊；會議保持暫停。",
    "zh_TW": "回覆已補入，還有 {p0} 段故障回覆待補齊；會議保持暫停。",
    "en": "Response supplemented. {p0} failed section(s) still pending; meeting remains paused.",
    "ja": "回答を補完しました。残り {p0} 件の障害回答の補完待ちです。会議は一時停止を維持します。"
  },
  {
    "id": "ui.copy.129",
    "source": "好啦，什麼都沒發生，真的喔。",
    "zh_TW": "好啦，什麼都沒發生，真的喔。",
    "en": "Alright, nothing happened, really!",
    "ja": "はい、何も起きませんでした。本当ですよ。"
  },
  {
    "id": "ui.copy.130",
    "source": "收集 AI 回覆",
    "zh_TW": "收集 AI 回覆",
    "en": "Collecting AI Responses",
    "ja": "AIの回答を収集中"
  },
  {
    "id": "ui.copy.131",
    "source": "有 {p0} 段 AI 回覆未取得。先確認原分頁，再用「貼上 AI 回覆」補入，或讓無法繼續的 AI 離席。",
    "zh_TW": "有 {p0} 段 AI 回覆未取得。先確認原分頁，再用「貼上 AI 回覆」補入，或讓無法繼續的 AI 離席。",
    "en": "{p0} AI response(s) could not be retrieved. Check the tab and use 'Paste AI Response' to fill in, or dismiss the AI.",
    "ja": "{p0} 件のAI回答が未取得です。元のタブを確認して「AI回答を貼付」で補完するか、続行できないAIを退席させてください。"
  },
  {
    "id": "ui.copy.132",
    "source": "此 AI 網頁顯示服務異常。先查看網頁上的提示；用量限制不會靠重試消失。",
    "zh_TW": "此 AI 網頁顯示服務異常。先查看網頁上的提示；用量限制不會靠重試消失。",
    "en": "This AI page shows a service error. Check on-page notices first; usage quotas will not vanish via retries.",
    "ja": "このAIページで異常が発生しています。画面の表示を確認してください。利用制限は再試行しても解消しません。"
  },
  {
    "id": "ui.copy.133",
    "source": "此分頁仍在回答。等回答完成後重新檢查，不必再送一次問題。",
    "zh_TW": "此分頁仍在回答。等回答完成後重新檢查，不必再送一次問題。",
    "en": "This tab is still generating. Wait for completion and recheck; do not resend the prompt.",
    "ja": "このタブは回答生成中です。完了を待ってから再チェックしてください。再度質問を送信する必要はありません。"
  },
  {
    "id": "ui.copy.134",
    "source": "自由群聊 💬",
    "zh_TW": "自由群聊 💬",
    "en": "Free Chat 💬",
    "ja": "自由チャット 💬"
  },
  {
    "id": "ui.copy.135",
    "source": "自由群聊開始：各就各位，準備送出第一句話",
    "zh_TW": "自由群聊開始：各就各位，準備送出第一句話",
    "en": "Free Chat starting: All set, preparing to send the opening message",
    "ja": "自由チャット開始：準備完了、最初の一文を送信します"
  },
  {
    "id": "ui.copy.136",
    "source": "自動重新整理重試 {p0}/{p1}",
    "zh_TW": "自動重新整理重試 {p0}/{p1}",
    "en": "Auto-refreshing retry {p0}/{p1}",
    "ja": "自動更新して再試行中 {p0}/{p1}"
  },
  {
    "id": "ui.copy.137",
    "source": "至少需要啟用 2 家 AI",
    "zh_TW": "至少需要啟用 2 家 AI",
    "en": "At least 2 AIs must be enabled",
    "ja": "最低2つのAIを有効にする必要があります"
  },
  {
    "id": "ui.copy.138",
    "source": "作者模式載入失敗: ",
    "zh_TW": "作者模式載入失敗: ",
    "en": "Failed to load Author Mode: ",
    "ja": "作者モードの読み込みに失敗しました: "
  },
  {
    "id": "ui.copy.139",
    "source": "你的好奇心正在消耗滑鼠壽命。",
    "zh_TW": "你的好奇心正在消耗滑鼠壽命。",
    "en": "Your curiosity is wearing out your mouse button.",
    "ja": "あなたの好奇心がマウスの寿命を削っています。"
  },
  {
    "id": "ui.copy.140",
    "source": "你是在測按鈕，還是在測我的耐心？",
    "zh_TW": "你是在測按鈕，還是在測我的耐心？",
    "en": "Are you testing the button, or testing my patience?",
    "ja": "ボタンをテストしているのですか？それとも私の忍耐力？"
  },
  {
    "id": "ui.copy.141",
    "source": "你還真的繼續按嗎？",
    "zh_TW": "你還真的繼續按嗎？",
    "en": "You're really going to keep clicking?",
    "ja": "本当にまだ押し続けるつもりですか？"
  },
  {
    "id": "ui.copy.142",
    "source": "即時會議紀錄",
    "zh_TW": "即時會議紀錄",
    "en": "Live Meeting Transcript",
    "ja": "リアルタイム会議録"
  },
  {
    "id": "ui.copy.143",
    "source": "即時會議紀錄",
    "zh_TW": "即時會議紀錄",
    "en": "Live Meeting Transcript",
    "ja": "リアルタイム会議録"
  },
  {
    "id": "ui.copy.144",
    "source": "即將送給 AI 的接續內容",
    "zh_TW": "即將送給 AI 的接續內容",
    "en": "Continuation Content to be Sent to AI",
    "ja": "AIへ送信する続きの内容"
  },
  {
    "id": "ui.copy.145",
    "source": "完成",
    "zh_TW": "完成",
    "en": "Completed",
    "ja": "完了"
  },
  {
    "id": "ui.copy.146",
    "source": "完成",
    "zh_TW": "完成",
    "en": "Completed",
    "ja": "完了"
  },
  {
    "id": "ui.copy.147",
    "source": "快速",
    "zh_TW": "快速",
    "en": "Fast",
    "ja": "スピード"
  },
  {
    "id": "ui.copy.148",
    "source": "快速鬥技場 ⚡",
    "zh_TW": "快速鬥技場 ⚡",
    "en": "Fast Arena ⚡",
    "ja": "スピード闘技場 ⚡"
  },
  {
    "id": "ui.copy.149",
    "source": "快速鬥技場：準備送出原始問題",
    "zh_TW": "快速鬥技場：準備送出原始問題",
    "en": "Fast Arena: preparing to send the original prompt",
    "ja": "スピード闘技場：元の質問を送信準備中"
  },
  {
    "id": "ui.copy.150",
    "source": "快速辯論：將目前對話總結送給其他 AI",
    "zh_TW": "快速辯論：將目前對話總結送給其他 AI",
    "en": "Fast Debate: sending current chat summary to other AIs",
    "ja": "スピードディベート：現在の会話要約を他のAIに送信"
  },
  {
    "id": "ui.copy.151",
    "source": "我有說沒用，你偏要做壓力測試。",
    "zh_TW": "我有說沒用，你偏要做壓力測試。",
    "en": "I told you it does nothing, but you insisted on stress testing.",
    "ja": "無駄だと言ったのに、ストレステストを強行するなんて。"
  },
  {
    "id": "ui.copy.152",
    "source": "找一個反例",
    "zh_TW": "找一個反例",
    "en": "Find a Counterexample",
    "ja": "反例を探す"
  },
  {
    "id": "ui.copy.153",
    "source": "找不到 provider 分頁",
    "zh_TW": "找不到 provider 分頁",
    "en": "Provider tab not found",
    "ja": "プロバイダーのタブが見つかりません"
  },
  {
    "id": "ui.copy.154",
    "source": "找不到分頁",
    "zh_TW": "找不到分頁",
    "en": "Tab not found",
    "ja": "タブが見つかりません"
  },
  {
    "id": "ui.copy.155",
    "source": "找不到對應的故障回覆，請重新整理故障格後再試。",
    "zh_TW": "找不到對應的故障回覆，請重新整理故障格後再試。",
    "en": "Target failed response not found. Refresh the slot and try again.",
    "ja": "該当する障害回答が見つかりません。枠を更新してから再試行してください。"
  },
  {
    "id": "ui.copy.156",
    "source": "找不到輸入區",
    "zh_TW": "找不到輸入區",
    "en": "Input field not found",
    "ja": "入力欄が見つかりません"
  },
  {
    "id": "ui.copy.157",
    "source": "把目前討論接成下一幕：各自用三句話，以原本人設接續前面的內容，帶入一個新障礙，留下能讓我決定的選擇。不要替我決定結局。",
    "zh_TW": "把目前討論接成下一幕：各自用三句話，以原本人設接續前面的內容，帶入一個新障礙，留下能讓我決定的選擇。不要替我決定結局。",
    "en": "Frame the discussion into the next scene: use 3 sentences in your persona to build on the prior context, introduce an obstacle, and leave choices for me to decide. Do not decide the ending for me.",
    "ja": "現在の議論を次のシーンへ繋げてください。各自のペルソナで3文を使い、前の内容を引き継ぎつつ新たな障害を導入し、私が決断できる選択肢を残してください。勝手に結末を決めないでください。"
  },
  {
    "id": "ui.copy.158",
    "source": "每一輪輸出與人類補充都保留在本機。",
    "zh_TW": "每一輪輸出與人類補充都保留在本機。",
    "en": "Every round output and user addition is saved locally.",
    "ja": "各ラウンドの出力とユーザーの追記はローカルに保存されます。"
  },
  {
    "id": "ui.copy.159",
    "source": "沒有可擷取的 AI 發言。",
    "zh_TW": "沒有可擷取的 AI 發言。",
    "en": "No AI messages available to capture.",
    "ja": "取得可能なAI発言がありません。"
  },
  {
    "id": "ui.copy.160",
    "source": "使用者手動取消操作",
    "zh_TW": "使用者手動取消操作",
    "en": "User cancelled operation manually",
    "ja": "ユーザーにより操作がキャンセルされました"
  },
  {
    "id": "ui.copy.161",
    "source": "來源摘要提供者已離席，已安全結束本場並保留歷史紀錄。",
    "zh_TW": "來源摘要提供者已離席，已安全結束本場並保留歷史紀錄。",
    "en": "Source summary provider dismissed; session safely ended and records kept.",
    "ja": "元要約の提供者が退席したため、記録を保存して安全に終了しました。"
  },
  {
    "id": "ui.copy.162",
    "source": "來源總結",
    "zh_TW": "來源總結",
    "en": "Source Summary",
    "ja": "元ソースの要約"
  },
  {
    "id": "ui.copy.163",
    "source": "例如：我的新專案，應該先做哪個功能？",
    "zh_TW": "例如：我的新專案，應該先做哪個功能？",
    "en": "e.g., Which feature should I build first for my new project?",
    "ja": "例：新しいプロジェクトで最初に作るべき機能はどれ？"
  },
  {
    "id": "ui.copy.164",
    "source": "協調",
    "zh_TW": "協調",
    "en": "Coordinate",
    "ja": "協調"
  },
  {
    "id": "ui.copy.165",
    "source": "協調",
    "zh_TW": "協調",
    "en": "Coordinate",
    "ja": "協調"
  },
  {
    "id": "ui.copy.166",
    "source": "取消",
    "zh_TW": "取消",
    "en": "Cancel",
    "ja": "キャンセル"
  },
  {
    "id": "ui.copy.167",
    "source": "取消接續",
    "zh_TW": "取消接續",
    "en": "Cancel Continuation",
    "ja": "続きをキャンセル"
  },
  {
    "id": "ui.copy.168",
    "source": "尚未啟用模型",
    "zh_TW": "尚未啟用模型",
    "en": "No models enabled yet",
    "ja": "モデルがまだ有効化されていません"
  },
  {
    "id": "ui.copy.169",
    "source": "尚未開始",
    "zh_TW": "尚未開始",
    "en": "Not started",
    "ja": "未開始"
  },
  {
    "id": "ui.copy.170",
    "source": "尚未開始",
    "zh_TW": "尚未開始",
    "en": "Not started",
    "ja": "未開始"
  },
  {
    "id": "ui.copy.171",
    "source": "所有 AI 均已離席；本場已安全結束，歷史紀錄仍保留。",
    "zh_TW": "所有 AI 均已離席；本場已安全結束，歷史紀錄仍保留。",
    "en": "All AIs have been dismissed. Session safely ended; history is preserved.",
    "ja": "すべてのAIが退席しました。セッションは安全に終了し、履歴は保持されます。"
  },
  {
    "id": "ui.copy.172",
    "source": "所有模型皆可送出",
    "zh_TW": "所有模型皆可送出",
    "en": "All models ready to send",
    "ja": "すべてのモデルが送信可能です"
  },
  {
    "id": "ui.copy.173",
    "source": "服務異常",
    "zh_TW": "服務異常",
    "en": "Service Error",
    "ja": "サービス異常"
  },
  {
    "id": "ui.copy.174",
    "source": "狀態: {p0}",
    "zh_TW": "狀態: {p0}",
    "en": "Status: {p0}",
    "ja": "状態: {p0}"
  },
  {
    "id": "ui.copy.175",
    "source": "待命",
    "zh_TW": "待命",
    "en": "Standby",
    "ja": "待機中"
  },
  {
    "id": "ui.copy.176",
    "source": "待補回",
    "zh_TW": "待補回",
    "en": "Pending Supplement",
    "ja": "補完待ち"
  },
  {
    "id": "ui.copy.177",
    "source": "待檢查",
    "zh_TW": "待檢查",
    "en": "Pending Check",
    "ja": "チェック待ち"
  },
  {
    "id": "ui.copy.178",
    "source": "待檢查",
    "zh_TW": "待檢查",
    "en": "Pending Check",
    "ja": "チェック待ち"
  },
  {
    "id": "ui.copy.179",
    "source": "故障已處理，正在自動接續原流程…",
    "zh_TW": "故障已處理，正在自動接續原流程…",
    "en": "Failure resolved, resuming original flow automatically...",
    "ja": "障害が解消されました。元の処理を自動再開しています…"
  },
  {
    "id": "ui.copy.180",
    "source": "故障回覆已補齊，正在自動接續原流程…",
    "zh_TW": "故障回覆已補齊，正在自動接續原流程…",
    "en": "Failed responses completed, resuming original flow automatically...",
    "ja": "障害回答の補完が完了しました。元の処理を自動再開しています…"
  },
  {
    "id": "ui.copy.181",
    "source": "流程已暫停，尚有 {p0} 段回覆待處理。補入回覆或讓故障 AI 離席後，會自動接續。",
    "zh_TW": "流程已暫停，尚有 {p0} 段回覆待處理。補入回覆或讓故障 AI 離席後，會自動接續。",
    "en": "Paused. {p0} response(s) pending. It will resume automatically once supplemented or dismissed.",
    "ja": "一時停止中。未処理の回答が {p0} 件あります。回答を補完するかAIを退席させると自動再開します。"
  },
  {
    "id": "ui.copy.182",
    "source": "流程已暫停；補入回覆或讓故障 AI 離席後，會自動接續原流程。",
    "zh_TW": "流程已暫停；補入回覆或讓故障 AI 離席後，會自動接續原流程。",
    "en": "Paused. The flow will resume automatically once responses are added or the failed AI is dismissed.",
    "ja": "一時停止中。回答を補完するか問題のAIを退席させると、元の処理を自動再開します。"
  },
  {
    "id": "ui.copy.183",
    "source": "重新掃描分頁",
    "zh_TW": "重新掃描分頁",
    "en": "Rescan Tabs",
    "ja": "タブを再スキャン"
  },
  {
    "id": "ui.copy.184",
    "source": "重置",
    "zh_TW": "重置",
    "en": "Reset",
    "ja": "リセット"
  },
  {
    "id": "ui.copy.185",
    "source": "重置未完成，請稍後再試。",
    "zh_TW": "重置未完成，請稍後再試。",
    "en": "Reset not completed. Please try again shortly.",
    "ja": "リセットが完了しませんでした。しばらくしてから再試行してください。"
  },
  {
    "id": "ui.copy.186",
    "source": "重置會結束目前會議並清除這場紀錄，無法復原。模型選擇會保留。確定重置？",
    "zh_TW": "重置會結束目前會議並清除這場紀錄，無法復原。模型選擇會保留。確定重置？",
    "en": "Resetting ends this meeting and clears its transcript permanently. Model picks are kept. Confirm reset?",
    "ja": "リセットすると現在の会議を終了し、記録を消去します（元に戻せません）。モデル選択は保持されます。リセットしますか？"
  },
  {
    "id": "ui.copy.187",
    "source": "頁面沒有及時回應。確認網路與聊天頁已載入，再重新檢查。",
    "zh_TW": "頁面沒有及時回應。確認網路與聊天頁已載入，再重新檢查。",
    "en": "Page did not respond in time. Confirm network and chat page are loaded, then recheck.",
    "ja": "ページが時間内に応答しませんでした。通信状況とチャット画面の読み込みを確認の上、再チェックしてください。"
  },
  {
    "id": "ui.copy.188",
    "source": "原問題:",
    "zh_TW": "原問題:",
    "en": "Original Question:",
    "ja": "元の質問:"
  },
  {
    "id": "ui.copy.189",
    "source": "展開以指定要沿用的既有分頁；未指定時，每次會議都會開啟新分頁。",
    "zh_TW": "展開以指定要沿用的既有分頁；未指定時，每次會議都會開啟新分頁。",
    "en": "Expand to reuse existing tabs; otherwise, new tabs are opened for each meeting.",
    "ja": "既存タブを再利用する場合は展開して指定してください。指定しない場合は毎回新しいタブを開きます。"
  },
  {
    "id": "ui.copy.190",
    "source": "恭喜解鎖🐑模式~\n\n覺得這個擴充功能好用嗎？\n歡迎訂閱作者的 YouTube 頻道、按讚並分享：\n",
    "zh_TW": "恭喜解鎖🐑模式~\n\n覺得這個擴充功能好用嗎？\n歡迎訂閱作者的 YouTube 頻道、按讚並分享：\n",
    "en": "Congrats on unlocking 🐑 Mode~\n\nEnjoying this extension?\nSubscribe to the creator's YouTube, like, and share:\n",
    "ja": "🐑モード解放おめでとうございます~\n\nこの拡張機能を気に入っていただけましたか？\n作者のYouTubeチャンネル登録、高評価、シェアをお待ちしています：\n"
  },
  {
    "id": "ui.copy.191",
    "source": "追問矛盾",
    "zh_TW": "追問矛盾",
    "en": "Press on Contradictions",
    "ja": "矛盾を追及"
  },
  {
    "id": "ui.copy.192",
    "source": "送出使用者的補充發言",
    "zh_TW": "送出使用者的補充發言",
    "en": "Send user supplementary comment",
    "ja": "ユーザーの補足発言を送信"
  },
  {
    "id": "ui.copy.193",
    "source": "送出尚未確認；AI 可能已回答，請先查看 AI 分頁，避免重複送出。",
    "zh_TW": "送出尚未確認；AI 可能已回答，請先查看 AI 分頁，避免重複送出。",
    "en": "Send not confirmed; AI may have replied. Check the AI tab to prevent duplicate sends.",
    "ja": "送信が確認できていません。AIが回答済みの可能性もあるため、重複送信を防ぐためタブを確認してください。"
  },
  {
    "id": "ui.copy.194",
    "source": "送出補充",
    "zh_TW": "送出補充",
    "en": "Send Notes",
    "ja": "補足を送信"
  },
  {
    "id": "ui.copy.195",
    "source": "停止中...",
    "zh_TW": "停止中...",
    "en": "Stopping...",
    "ja": "停止中..."
  },
  {
    "id": "ui.copy.196",
    "source": "停止失敗，請重試",
    "zh_TW": "停止失敗，請重試",
    "en": "Failed to stop, please retry",
    "ja": "停止に失敗しました。再試行してください"
  },
  {
    "id": "ui.copy.197",
    "source": "停止本次會議",
    "zh_TW": "停止本次會議",
    "en": "Stop This Meeting",
    "ja": "今回の会議を停止"
  },
  {
    "id": "ui.copy.198",
    "source": "停止本次會議 🛑",
    "zh_TW": "停止本次會議 🛑",
    "en": "Stop This Meeting 🛑",
    "ja": "今回の会議を停止 🛑"
  },
  {
    "id": "ui.copy.199",
    "source": "停止目前流程；無法從中斷處續跑",
    "zh_TW": "停止目前流程；無法從中斷處續跑",
    "en": "Stop current flow; cannot resume from the interrupt point",
    "ja": "現在の処理を停止します（中断箇所からの再開はできません）"
  },
  {
    "id": "ui.copy.200",
    "source": "偵錯紀錄下載失敗：{p0}",
    "zh_TW": "偵錯紀錄下載失敗：{p0}",
    "en": "Failed to download debug log: {p0}",
    "ja": "デバッグログのダウンロードに失敗しました：{p0}"
  },
  {
    "id": "ui.copy.201",
    "source": "匿名參與者（暱稱未取得）",
    "zh_TW": "匿名參與者（暱稱未取得）",
    "en": "Anonymous Participant (handle unretrieved)",
    "ja": "匿名参加者（ニックネーム未取得）"
  },
  {
    "id": "ui.copy.202",
    "source": "匿名評論",
    "zh_TW": "匿名評論",
    "en": "Anonymous Review",
    "ja": "匿名レビュー"
  },
  {
    "id": "ui.copy.203",
    "source": "彩蛋：🐑已啟用！歡迎大家訂閱分享按讚((被拖走",
    "zh_TW": "彩蛋：🐑已啟用！歡迎大家訂閱分享按讚((被拖走",
    "en": "Easter egg: 🐑 enabled! Don't forget to like, subscribe, and share ((dragged away",
    "ja": "イースターエッグ：🐑解放！チャンネル登録・高評価・シェアよろしくね((引きずられて退場"
  },
  {
    "id": "ui.copy.204",
    "source": "接續內容預覽",
    "zh_TW": "接續內容預覽",
    "en": "Continuation Preview",
    "ja": "続きの内容のプレビュー"
  },
  {
    "id": "ui.copy.205",
    "source": "接續草稿已取消，上方補充仍保留。",
    "zh_TW": "接續草稿已取消，上方補充仍保留。",
    "en": "Continuation draft cancelled; notes above are preserved.",
    "ja": "続きの下書きをキャンセルしました。上の補足は保持されています。"
  },
  {
    "id": "ui.copy.206",
    "source": "接續草稿請使用快速鬥技場、自由群聊或劇場模式；總結辯論會另外擷取目前對話。",
    "zh_TW": "接續草稿請使用快速鬥技場、自由群聊或劇場模式；總結辯論會另外擷取目前對話。",
    "en": "Use Fast Arena, Free Chat, or Theater Mode for drafts; Summary Debate captures the chat separately.",
    "ja": "続きの下書きにはスピード闘技場、自由チャット、劇場モードをご利用ください。要約ディベートは別途現在の会話を取得します。"
  },
  {
    "id": "ui.copy.207",
    "source": "接續連結分頁的討論",
    "zh_TW": "接續連結分頁的討論",
    "en": "Continue Discussion from Linked Tabs",
    "ja": "接続先タブの議論を引き継ぐ"
  },
  {
    "id": "ui.copy.208",
    "source": "啟動失敗",
    "zh_TW": "啟動失敗",
    "en": "Failed to start",
    "ja": "起動に失敗しました"
  },
  {
    "id": "ui.copy.209",
    "source": "啟動多 AI 會議",
    "zh_TW": "啟動多 AI 會議",
    "en": "Start Multi-AI Meeting",
    "ja": "複数AI会議を起動"
  },
  {
    "id": "ui.copy.210",
    "source": "啟動自由群聊中...",
    "zh_TW": "啟動自由群聊中...",
    "en": "Launching Free Chat...",
    "ja": "自由チャットを起動中..."
  },
  {
    "id": "ui.copy.211",
    "source": "啟動快速鬥技場中...",
    "zh_TW": "啟動快速鬥技場中...",
    "en": "Launching Fast Arena...",
    "ja": "スピード闘技場を起動中..."
  },
  {
    "id": "ui.copy.212",
    "source": "啟動劇場大亂鬥中...",
    "zh_TW": "啟動劇場大亂鬥中...",
    "en": "Launching Theater Brawl...",
    "ja": "劇場バトルを起動中..."
  },
  {
    "id": "ui.copy.213",
    "source": "啟動總結辯論中...",
    "zh_TW": "啟動總結辯論中...",
    "en": "Launching Summary Debate...",
    "ja": "要約ディベートを起動中..."
  },
  {
    "id": "ui.copy.214",
    "source": "清除",
    "zh_TW": "清除",
    "en": "Clear",
    "ja": "クリア"
  },
  {
    "id": "ui.copy.215",
    "source": "清除失敗",
    "zh_TW": "清除失敗",
    "en": "Failed to clear",
    "ja": "消去に失敗しました"
  },
  {
    "id": "ui.copy.216",
    "source": "清除本機辯論紀錄",
    "zh_TW": "清除本機辯論紀錄",
    "en": "Clear Local Debate History",
    "ja": "ローカルのディベート記録を消去"
  },
  {
    "id": "ui.copy.217",
    "source": "略過最後的總結裁決 (放空模式)",
    "zh_TW": "略過最後的總結裁決 (放空模式)",
    "en": "Skip Final Verdict (Casual Mode)",
    "ja": "最終総括裁定をスキップ (まったりモード)"
  },
  {
    "id": "ui.copy.218",
    "source": "第 {p0} 輪",
    "zh_TW": "第 {p0} 輪",
    "en": "Round {p0}",
    "ja": "第 {p0} ラウンド"
  },
  {
    "id": "ui.copy.219",
    "source": "第 {p0} 輪：送出交叉互評",
    "zh_TW": "第 {p0} 輪：送出交叉互評",
    "en": "Round {p0}: sending cross-review",
    "ja": "第 {p0} ラウンド：相互レビューを送信中"
  },
  {
    "id": "ui.copy.220",
    "source": "第 {p0} 輪互評",
    "zh_TW": "第 {p0} 輪互評",
    "en": "Round {p0} Review",
    "ja": "第 {p0} ラウンド相互レビュー"
  },
  {
    "id": "ui.copy.221",
    "source": "第 {p0}/{p1} 輪互評",
    "zh_TW": "第 {p0}/{p1} 輪互評",
    "en": "Round {p0}/{p1} Review",
    "ja": "第 {p0}/{p1} ラウンド相互レビュー"
  },
  {
    "id": "ui.copy.222",
    "source": "第一輪",
    "zh_TW": "第一輪",
    "en": "Round 1",
    "ja": "第1ラウンド"
  },
  {
    "id": "ui.copy.223",
    "source": "第一輪：{p0}送出原始問題",
    "zh_TW": "第一輪：{p0}送出原始問題",
    "en": "Round 1: {p0} sending original question",
    "ja": "第1ラウンド：{p0} が元の質問を送信中"
  },
  {
    "id": "ui.copy.224",
    "source": "第一輪：各抒己見 📢",
    "zh_TW": "第一輪：各抒己見 📢",
    "en": "Round 1: Stating Positions 📢",
    "ja": "第1ラウンド：それぞれの主張 📢"
  },
  {
    "id": "ui.copy.225",
    "source": "第一輪回答",
    "zh_TW": "第一輪回答",
    "en": "Round 1 Answers",
    "ja": "第1ラウンドの回答"
  },
  {
    "id": "ui.copy.226",
    "source": "第一輪回答:",
    "zh_TW": "第一輪回答:",
    "en": "Round 1 Answers:",
    "ja": "第1ラウンドの回答:"
  },
  {
    "id": "ui.copy.227",
    "source": "第二輪",
    "zh_TW": "第二輪",
    "en": "Round 2",
    "ja": "第2ラウンド"
  },
  {
    "id": "ui.copy.228",
    "source": "第三次了，理智還在線嗎？",
    "zh_TW": "第三次了，理智還在線嗎？",
    "en": "Three times already. Still holding onto your sanity?",
    "ja": "3回目ですよ、まだ正気は保てていますか？"
  },
  {
    "id": "ui.copy.229",
    "source": "第三輪",
    "zh_TW": "第三輪",
    "en": "Round 3",
    "ja": "第3ラウンド"
  },
  {
    "id": "ui.copy.230",
    "source": "第五輪",
    "zh_TW": "第五輪",
    "en": "Round 5",
    "ja": "第5ラウンド"
  },
  {
    "id": "ui.copy.231",
    "source": "第六輪",
    "zh_TW": "第六輪",
    "en": "Round 6",
    "ja": "第6ラウンド"
  },
  {
    "id": "ui.copy.232",
    "source": "第四輪",
    "zh_TW": "第四輪",
    "en": "Round 4",
    "ja": "第4ラウンド"
  },
  {
    "id": "ui.copy.233",
    "source": "聊天分頁已關閉或無法存取。開啟此 AI 網頁後重新檢查。",
    "zh_TW": "聊天分頁已關閉或無法存取。開啟此 AI 網頁後重新檢查。",
    "en": "Chat tab closed or inaccessible. Open this AI page and recheck.",
    "ja": "チャットタブが閉じられたかアクセスできません。AIページを開いて再チェックしてください。"
  },
  {
    "id": "ui.copy.234",
    "source": "逐家",
    "zh_TW": "逐家",
    "en": "Per Provider",
    "ja": "サービス個別"
  },
  {
    "id": "ui.copy.235",
    "source": "這不是電梯，多按不會比較快。",
    "zh_TW": "這不是電梯，多按不會比較快。",
    "en": "This isn't an elevator; spamming clicks won't make it faster.",
    "ja": "エレベーターのボタンではありません。連打しても速くなりませんよ。"
  },
  {
    "id": "ui.copy.236",
    "source": "這位 AI 的揭曉反應未取得；若 AI 分頁已回答，可手動補入。",
    "zh_TW": "這位 AI 的揭曉反應未取得；若 AI 分頁已回答，可手動補入。",
    "en": "Reveal reaction not retrieved. If the AI tab replied, you can supplement it manually.",
    "ja": "このAIのネタばらしリアクションが未取得です。タブで回答済みの場合は手動で補完できます。"
  },
  {
    "id": "ui.copy.237",
    "source": "這位裁判的總結未取得；若 AI 分頁已完成，可手動補入。",
    "zh_TW": "這位裁判的總結未取得；若 AI 分頁已完成，可手動補入。",
    "en": "Judge summary not retrieved. If the AI tab completed it, you can supplement it manually.",
    "ja": "このジャッジのまとめが未取得です。タブで完了している場合は手動で補完できます。"
  },
  {
    "id": "ui.copy.238",
    "source": "這段總結已變更或不是故障回覆，請重新確認。",
    "zh_TW": "這段總結已變更或不是故障回覆，請重新確認。",
    "en": "This summary has changed or is not a failed response. Please confirm again.",
    "ja": "この要約は変更されたか障害回答ではありません。確認してください。"
  },
  {
    "id": "ui.copy.239",
    "source": "這麼執著，該不會真期待彩蛋吧？",
    "zh_TW": "這麼執著，該不會真期待彩蛋吧？",
    "en": "So persistent! Are you really expecting an Easter egg?",
    "ja": "そんなに粘るなんて、本気でサプライズを期待しているのですか？"
  },
  {
    "id": "ui.copy.240",
    "source": "連線",
    "zh_TW": "連線",
    "en": "Connect",
    "ja": "接続"
  },
  {
    "id": "ui.copy.241",
    "source": "連線",
    "zh_TW": "連線",
    "en": "Connect",
    "ja": "接続"
  },
  {
    "id": "ui.copy.242",
    "source": "部分模型尚未就緒",
    "zh_TW": "部分模型尚未就緒",
    "en": "Some models are not ready yet",
    "ja": "一部のモデルがまだ準備できていません"
  },
  {
    "id": "ui.copy.243",
    "source": "都說沒用了，怎麼就是不信呢？",
    "zh_TW": "都說沒用了，怎麼就是不信呢？",
    "en": "I told you it does nothing, why don't you believe me?",
    "ja": "無駄だと言っているのに、どうして信じてくれないのですか？"
  },
  {
    "id": "ui.copy.244",
    "source": "最終回合：全員匿名裁判各自總結",
    "zh_TW": "最終回合：全員匿名裁判各自總結",
    "en": "Final Round: All Anonymous Judges Summarize Independently",
    "ja": "最終ラウンド：全員匿名のジャッジが各自総括"
  },
  {
    "id": "ui.copy.245",
    "source": "最終回合：請 {p0} 總結",
    "zh_TW": "最終回合：請 {p0} 總結",
    "en": "Final Round: Asking {p0} to summarize",
    "ja": "最終ラウンド：{p0} にまとめを依頼中"
  },
  {
    "id": "ui.copy.246",
    "source": "最終裁決 👑 {p3}",
    "zh_TW": "最終裁決 👑 {p3}",
    "en": "Final Verdict 👑 {p3}",
    "ja": "最終裁決 👑 {p3}"
  },
  {
    "id": "ui.copy.247",
    "source": "最終總結 👑",
    "zh_TW": "最終總結 👑",
    "en": "Final Summary 👑",
    "ja": "最終総括 👑"
  },
  {
    "id": "ui.copy.248",
    "source": "最新一場辯論會保存在此瀏覽器，最長 24 小時。內容只會送往你選擇的 AI 網頁，不會傳給 LLMeeting 開發者伺服器。",
    "zh_TW": "最新一場辯論會保存在此瀏覽器，最長 24 小時。內容只會送往你選擇的 AI 網頁，不會傳給 LLMeeting 開發者伺服器。",
    "en": "The latest debate is saved in this browser for up to 24 hours. Data is sent only to your chosen AI sites, never to LLMeeting developer servers.",
    "ja": "直近のディベートはこのブラウザに最長24時間保存されます。データは選択したAIサイトにのみ送信され、LLMeetingの開発者サーバーには送信されません。"
  },
  {
    "id": "ui.copy.249",
    "source": "圍觀主席",
    "zh_TW": "圍觀主席",
    "en": "Observer Chair",
    "ja": "傍聴議長"
  },
  {
    "id": "ui.copy.250",
    "source": "圍觀主席制至少需勾選 3 家 AI，且主席必須來自已勾選 AI。",
    "zh_TW": "圍觀主席制至少需勾選 3 家 AI，且主席必須來自已勾選 AI。",
    "en": "Observer Chair requires at least 3 AIs checked, and the chair must come from the checked AIs.",
    "ja": "傍聴議長制は最低3つのAIを選択し、議長は選択されたAIの中から指定する必要があります。"
  },
  {
    "id": "ui.copy.251",
    "source": "圍觀主席制至少需勾選 3 家 AI，扣掉主席後才有 2 家能辯論。",
    "zh_TW": "圍觀主席制至少需勾選 3 家 AI，扣掉主席後才有 2 家能辯論。",
    "en": "Observer Chair requires at least 3 AIs checked, leaving 2 to debate after deducting the chair.",
    "ja": "傍聴議長制は最低3つのAIを選択する必要があります（議長を除いて2つが議論するため）。"
  },
  {
    "id": "ui.copy.252",
    "source": "換個角度辯護",
    "zh_TW": "換個角度辯護",
    "en": "Defend from Another Angle",
    "ja": "別視点から弁護"
  },
  {
    "id": "ui.copy.253",
    "source": "揭曉反應",
    "zh_TW": "揭曉反應",
    "en": "Reveal Reaction",
    "ja": "ネタばらしリアクション"
  },
  {
    "id": "ui.copy.254",
    "source": "揭曉反應已補齊，會議完成",
    "zh_TW": "揭曉反應已補齊，會議完成",
    "en": "Reveal reactions complete; meeting concluded",
    "ja": "ネタばらしリアクションが補完され、会議が完了しました"
  },
  {
    "id": "ui.copy.255",
    "source": "揭曉完成：已收集各 AI 的揭曉反應",
    "zh_TW": "揭曉完成：已收集各 AI 的揭曉反應",
    "en": "Reveal complete: collected reveal reactions from all AIs",
    "ja": "ネタばらし完了：各AIのリアクションを収集しました"
  },
  {
    "id": "ui.copy.256",
    "source": "揭曉輪 🕵️",
    "zh_TW": "揭曉輪 🕵️",
    "en": "Reveal Round 🕵️",
    "ja": "ネタばらしラウンド 🕵️"
  },
  {
    "id": "ui.copy.257",
    "source": "揭曉輪：公開本局真正的內鬼狀態，等待各 AI 回應",
    "zh_TW": "揭曉輪：公開本局真正的內鬼狀態，等待各 AI 回應",
    "en": "Reveal Round: exposing real impostor status and awaiting AI reactions",
    "ja": "ネタばらしラウンド：真のインポスター設定を公開し、各AIの応答を待機中"
  },
  {
    "id": "ui.copy.258",
    "source": "替對手辯護",
    "zh_TW": "替對手辯護",
    "en": "Defend the Opponent",
    "ja": "相手の立場を弁護"
  },
  {
    "id": "ui.copy.259",
    "source": "無法取得目前會議狀態",
    "zh_TW": "無法取得目前會議狀態",
    "en": "Failed to retrieve current meeting status",
    "ja": "現在の会議状態を取得できません"
  },
  {
    "id": "ui.copy.260",
    "source": "無法取得操作結果",
    "zh_TW": "無法取得操作結果",
    "en": "Failed to get operation result",
    "ja": "操作結果を取得できません"
  },
  {
    "id": "ui.copy.261",
    "source": "無法送出",
    "zh_TW": "無法送出",
    "en": "Unable to send",
    "ja": "送信できません"
  },
  {
    "id": "ui.copy.262",
    "source": "無法連線",
    "zh_TW": "無法連線",
    "en": "Unable to connect",
    "ja": "接続できません"
  },
  {
    "id": "ui.copy.263",
    "source": "無法連線到擴充套件；重置結果尚未確認，請先確認目前會議狀態。",
    "zh_TW": "無法連線到擴充套件；重置結果尚未確認，請先確認目前會議狀態。",
    "en": "Cannot connect to extension; reset unconfirmed. Please verify meeting status first.",
    "ja": "拡張機能に接続できません。リセット結果未確認のため、会議状態を確認してください。"
  },
  {
    "id": "ui.copy.264",
    "source": "無法擷取發言，請確認連線分頁。",
    "zh_TW": "無法擷取發言，請確認連線分頁。",
    "en": "Cannot capture message. Please check the linked tab.",
    "ja": "発言を取得できません。接続先タブを確認してください。"
  },
  {
    "id": "ui.copy.265",
    "source": "無法讓 AI 離席",
    "zh_TW": "無法讓 AI 離席",
    "en": "Cannot dismiss AI",
    "ja": "AIを退席させることができません"
  },
  {
    "id": "ui.copy.266",
    "source": "發送失敗：{p0}",
    "zh_TW": "發送失敗：{p0}",
    "en": "Send failed: {p0}",
    "ja": "送信失敗：{p0}"
  },
  {
    "id": "ui.copy.267",
    "source": "等 AI 回答後，就輪到你加入討論。",
    "zh_TW": "等 AI 回答後，就輪到你加入討論。",
    "en": "Once AIs respond, it will be your turn to join in.",
    "ja": "AIの回答が揃ったら、あなたの出番です。"
  },
  {
    "id": "ui.copy.268",
    "source": "等待 AI 回覆逾時",
    "zh_TW": "等待 AI 回覆逾時",
    "en": "Timed out waiting for AI response",
    "ja": "AIの回答待機がタイムアウトしました"
  },
  {
    "id": "ui.copy.269",
    "source": "等待中",
    "zh_TW": "等待中",
    "en": "Waiting",
    "ja": "待機中"
  },
  {
    "id": "ui.copy.270",
    "source": "等待使用者發言或選擇下一步...",
    "zh_TW": "等待使用者發言或選擇下一步...",
    "en": "Waiting for user comments or next step...",
    "ja": "ユーザーの発言または次のアクション待ち..."
  },
  {
    "id": "ui.copy.271",
    "source": "等待開始",
    "zh_TW": "等待開始",
    "en": "Waiting to start",
    "ja": "開始待ち"
  },
  {
    "id": "ui.copy.272",
    "source": "等待開始",
    "zh_TW": "等待開始",
    "en": "Waiting to start",
    "ja": "開始待ち"
  },
  {
    "id": "ui.copy.273",
    "source": "等開場",
    "zh_TW": "等開場",
    "en": "Waiting for kickoff",
    "ja": "開会待ち"
  },
  {
    "id": "ui.copy.274",
    "source": "結束並重置目前會議；模型選擇會保留",
    "zh_TW": "結束並重置目前會議；模型選擇會保留",
    "en": "End and reset current meeting; model picks are preserved",
    "ja": "現在の会議を終了してリセット（モデル選択は保持）"
  },
  {
    "id": "ui.copy.275",
    "source": "結案總結",
    "zh_TW": "結案總結",
    "en": "Final Synthesis",
    "ja": "結審総括"
  },
  {
    "id": "ui.copy.276",
    "source": "給我下一步",
    "zh_TW": "給我下一步",
    "en": "Give Me the Next Step",
    "ja": "次のステップを提示"
  },
  {
    "id": "ui.copy.277",
    "source": "裁判總結",
    "zh_TW": "裁判總結",
    "en": "Judge Summary",
    "ja": "ジャッジ総括"
  },
  {
    "id": "ui.copy.278",
    "source": "診斷完成；正式會議仍會建立全新對話",
    "zh_TW": "診斷完成；正式會議仍會建立全新對話",
    "en": "Diagnostics complete; official meetings will still create new chats",
    "ja": "診断完了。正式な会議では新規チャットが作成されます"
  },
  {
    "id": "ui.copy.279",
    "source": "診斷資訊",
    "zh_TW": "診斷資訊",
    "en": "Diagnostics",
    "ja": "診断情報"
  },
  {
    "id": "ui.copy.280",
    "source": "貼上這位 AI 在該階段的完整回覆",
    "zh_TW": "貼上這位 AI 在該階段的完整回覆",
    "en": "Paste the full response from this AI for this stage",
    "ja": "この段階における該当AIの完全な回答を貼り付け"
  },
  {
    "id": "ui.copy.281",
    "source": "貼上對應階段的 AI 回覆；全部故障段落補齊後會自動繼續原流程。請先確認 AI 網頁已回答，最多 12,000 字元。",
    "zh_TW": "貼上對應階段的 AI 回覆；全部故障段落補齊後會自動繼續原流程。請先確認 AI 網頁已回答，最多 12,000 字元。",
    "en": "Paste the AI response for this stage; the flow will resume once all failed sections are filled. Verify the AI page answered first (up to 12,000 characters).",
    "ja": "該当段階のAI回答を貼り付けてください。すべての障害箇所が埋まると自動再開します。事前にAIの回答完了を確認してください（最大12,000文字）。"
  },
  {
    "id": "ui.copy.282",
    "source": "開始快速鬥技場",
    "zh_TW": "開始快速鬥技場",
    "en": "Start Fast Arena",
    "ja": "スピード闘技場を開始"
  },
  {
    "id": "ui.copy.283",
    "source": "開始快速鬥技場 ⚡",
    "zh_TW": "開始快速鬥技場 ⚡",
    "en": "Start Fast Arena ⚡",
    "ja": "スピード闘技場を開始 ⚡"
  },
  {
    "id": "ui.copy.284",
    "source": "開始劇場大亂鬥 🎭",
    "zh_TW": "開始劇場大亂鬥 🎭",
    "en": "Start Theater Brawl 🎭",
    "ja": "劇場バトルを開始 🎭"
  },
  {
    "id": "ui.copy.285",
    "source": "開始總結辯論 ✦",
    "zh_TW": "開始總結辯論 ✦",
    "en": "Start Summary Debate ✦",
    "ja": "要約ディベートを開始 ✦"
  },
  {
    "id": "ui.copy.286",
    "source": "開啟 {p0}",
    "zh_TW": "開啟 {p0}",
    "en": "Open {p0}",
    "ja": "{p0} を開く"
  },
  {
    "id": "ui.copy.287",
    "source": "開啟此 AI 的聊天頁，確認輸入區已載入；若仍失敗，查看診斷資訊。",
    "zh_TW": "開啟此 AI 的聊天頁，確認輸入區已載入；若仍失敗，查看診斷資訊。",
    "en": "Open this AI's chat page and ensure the input field is loaded; if it fails, check diagnostics.",
    "ja": "このAIのチャット画面を開き、入力欄が読み込まれているか確認してください。失敗が続く場合は診断情報を確認してください。"
  },
  {
    "id": "ui.copy.288",
    "source": "開啟此 AI 的聊天首頁，再重新檢查。",
    "zh_TW": "開啟此 AI 的聊天首頁，再重新檢查。",
    "en": "Open this AI's chat home page, then recheck.",
    "ja": "このAIのチャットトップページを開いてから再チェックしてください。"
  },
  {
    "id": "ui.copy.289",
    "source": "開啟此 AI 網頁並登入，再重新檢查。LLMeeting 不會代你登入。",
    "zh_TW": "開啟此 AI 網頁並登入，再重新檢查。LLMeeting 不會代你登入。",
    "en": "Open this AI webpage and log in, then recheck. LLMeeting will not log in for you.",
    "ja": "このAIページを開いてログイン後、再チェックしてください。LLMeetingが代理ログインすることはありません。"
  },
  {
    "id": "ui.copy.290",
    "source": "開啟群聊 💬",
    "zh_TW": "開啟群聊 💬",
    "en": "Start Group Chat 💬",
    "ja": "グループチャット開始 💬"
  },
  {
    "id": "ui.copy.291",
    "source": "彙整總結",
    "zh_TW": "彙整總結",
    "en": "Consolidated Summary",
    "ja": "まとめと総括"
  },
  {
    "id": "ui.copy.292",
    "source": "想做什麼呢！按再多次都沒用的唷",
    "zh_TW": "想做什麼呢！按再多次都沒用的唷",
    "en": "What are you up to? Clicking repeatedly won't change anything!",
    "ja": "何をしているんですか？何度押しても変わりませんよ！"
  },
  {
    "id": "ui.copy.293",
    "source": "會議已因故障暫停，請先補齊回覆，再按「繼續原流程」。",
    "zh_TW": "會議已因故障暫停，請先補齊回覆，再按「繼續原流程」。",
    "en": "Meeting paused due to error. Complete missing responses, then click 'Resume Original Flow'.",
    "ja": "エラーにより会議が一時停止しました。回答を補完してから「元の処理を再開」を押してください。"
  },
  {
    "id": "ui.copy.294",
    "source": "會議已暫停：請在故障訊息下方貼上對應 AI 回覆，全部補齊後會自動繼續原流程。",
    "zh_TW": "會議已暫停：請在故障訊息下方貼上對應 AI 回覆，全部補齊後會自動繼續原流程。",
    "en": "Meeting paused: Paste corresponding AI responses below error cards; it resumes automatically once filled.",
    "ja": "会議が一時停止中：エラーカードの下に対応するAI回答を貼り付けてください。すべて補完されると自動再開します。"
  },
  {
    "id": "ui.copy.295",
    "source": "會議已變更，請重新選擇要補回覆的訊息。",
    "zh_TW": "會議已變更，請重新選擇要補回覆的訊息。",
    "en": "Meeting state has changed. Please select the target message to supplement again.",
    "ja": "会議の状態が変更されました。回答を補完するメッセージを選び直してください。"
  },
  {
    "id": "ui.copy.296",
    "source": "會議已變更；貼上的內容仍保留，請取消後重新選擇故障訊息。",
    "zh_TW": "會議已變更；貼上的內容仍保留，請取消後重新選擇故障訊息。",
    "en": "Meeting changed; pasted text is preserved. Cancel and reselect the failed message.",
    "ja": "会議が変更されました。貼り付けた内容は保持されています。キャンセルして障害メッセージを選び直してください。"
  },
  {
    "id": "ui.copy.297",
    "source": "會議或參與者已變更，請重新整理故障格後再試。",
    "zh_TW": "會議或參與者已變更，請重新整理故障格後再試。",
    "en": "Meeting or participants changed. Refresh the failure slot and try again.",
    "ja": "会議または参加者が変更されました。障害枠を更新してから再試行してください。"
  },
  {
    "id": "ui.copy.298",
    "source": "會議問題",
    "zh_TW": "會議問題",
    "en": "Meeting Topic",
    "ja": "会議の議題"
  },
  {
    "id": "ui.copy.299",
    "source": "會議進度",
    "zh_TW": "會議進度",
    "en": "Meeting Progress",
    "ja": "会議の進行状況"
  },
  {
    "id": "ui.copy.300",
    "source": "會議開始後，各家回覆會出現在這裡。比較觀點，也記得查證重要事實。",
    "zh_TW": "會議開始後，各家回覆會出現在這裡。比較觀點，也記得查證重要事實。",
    "en": "Once the meeting starts, AI responses will appear here. Compare viewpoints and verify critical facts.",
    "ja": "会議が始まると、ここに各AIの回答が表示されます。視点を比較しつつ重要な事実の検証も忘れずに。"
  },
  {
    "id": "ui.copy.301",
    "source": "會議開始後，各家回覆會出現在這裡。比較觀點，也記得查證重要事實。",
    "zh_TW": "會議開始後，各家回覆會出現在這裡。比較觀點，也記得查證重要事實。",
    "en": "Once the meeting starts, AI responses will appear here. Compare viewpoints and verify critical facts.",
    "ja": "会議が始まると、ここに各AIの回答が表示されます。視点を比較しつつ重要な事実の検証も忘れずに。"
  },
  {
    "id": "ui.copy.302",
    "source": "會議模式與進階設定",
    "zh_TW": "會議模式與進階設定",
    "en": "Meeting Modes & Advanced Settings",
    "ja": "会議モードと高度な設定"
  },
  {
    "id": "ui.copy.303",
    "source": "補入失敗，貼上的內容已保留。",
    "zh_TW": "補入失敗，貼上的內容已保留。",
    "en": "Supplementing failed; pasted content has been kept.",
    "ja": "補完に失敗しました。貼り付けた内容は保持されています。"
  },
  {
    "id": "ui.copy.304",
    "source": "補入這段回覆",
    "zh_TW": "補入這段回覆",
    "en": "Supplement This Response",
    "ja": "この回答を補完"
  },
  {
    "id": "ui.copy.305",
    "source": "補充想法、提出疑問，或請大家換個角度...",
    "zh_TW": "補充想法、提出疑問，或請大家換個角度...",
    "en": "Add your thoughts, ask questions, or shift perspectives...",
    "ja": "考えを補足したり、質問を投げかけたり、視点の転換を促したり..."
  },
  {
    "id": "ui.copy.306",
    "source": "補充會議內容",
    "zh_TW": "補充會議內容",
    "en": "Add Meeting Notes",
    "ja": "会議内容を補足"
  },
  {
    "id": "ui.copy.307",
    "source": "補回覆已完成，接續原流程…",
    "zh_TW": "補回覆已完成，接續原流程…",
    "en": "Response supplemented; resuming original flow...",
    "ja": "回答の補完が完了しました。元の処理を再開中…"
  },
  {
    "id": "ui.copy.308",
    "source": "試探邊界",
    "zh_TW": "試探邊界",
    "en": "Probe the Boundaries",
    "ja": "境界線を探る"
  },
  {
    "id": "ui.copy.309",
    "source": "遊戲揭曉:",
    "zh_TW": "遊戲揭曉:",
    "en": "Game Reveal:",
    "ja": "ゲームのネタばらし:"
  },
  {
    "id": "ui.copy.310",
    "source": "零",
    "zh_TW": "零",
    "en": "Zero",
    "ja": "ゼロ"
  },
  {
    "id": "ui.copy.311",
    "source": "對話完成 (略過總結)",
    "zh_TW": "對話完成 (略過總結)",
    "en": "Dialogue Completed (Summary Skipped)",
    "ja": "対話完了 (総括スキップ)"
  },
  {
    "id": "ui.copy.312",
    "source": "對話結束並已總結",
    "zh_TW": "對話結束並已總結",
    "en": "Dialogue Finished and Summarized",
    "ja": "対話終了・総括完了"
  },
  {
    "id": "ui.copy.313",
    "source": "網址: {p0}",
    "zh_TW": "網址: {p0}",
    "en": "URL: {p0}",
    "ja": "URL: {p0}"
  },
  {
    "id": "ui.copy.314",
    "source": "網址不符",
    "zh_TW": "網址不符",
    "en": "URL mismatch",
    "ja": "URLが一致しません"
  },
  {
    "id": "ui.copy.315",
    "source": "需要處理",
    "zh_TW": "需要處理",
    "en": "Action required",
    "ja": "要対応"
  },
  {
    "id": "ui.copy.316",
    "source": "需要登入",
    "zh_TW": "需要登入",
    "en": "Login required",
    "ja": "ログインが必要"
  },
  {
    "id": "ui.copy.317",
    "source": "劇場大亂鬥 🎭",
    "zh_TW": "劇場大亂鬥 🎭",
    "en": "Theater Brawl 🎭",
    "ja": "劇場バトル 🎭"
  },
  {
    "id": "ui.copy.318",
    "source": "劇場大亂鬥：各就各位，準備送出第一句話",
    "zh_TW": "劇場大亂鬥：各就各位，準備送出第一句話",
    "en": "Theater Brawl: All set, preparing to send the opening message",
    "ja": "劇場バトル：準備完了、最初の一文を送信します"
  },
  {
    "id": "ui.copy.319",
    "source": "暫停紀錄不完整，請結束目前會議後重新開始。",
    "zh_TW": "暫停紀錄不完整，請結束目前會議後重新開始。",
    "en": "Pause record is incomplete. Please end the current meeting and restart.",
    "ja": "一時停止ログが不完全です。現在の会議を終了して最初からやり直してください。"
  },
  {
    "id": "ui.copy.320",
    "source": "模型已就緒，準備啟航",
    "zh_TW": "模型已就緒，準備啟航",
    "en": "Models ready, set to sail",
    "ja": "モデルの準備完了、出航準備OK"
  },
  {
    "id": "ui.copy.321",
    "source": "模型連線修復指引",
    "zh_TW": "模型連線修復指引",
    "en": "Model Connection Troubleshooting Guide",
    "ja": "モデル接続の修復ガイド"
  },
  {
    "id": "ui.copy.322",
    "source": "模型選擇未能保存；目前選擇仍可使用，重新開啟後可能恢復舊設定。",
    "zh_TW": "模型選擇未能保存；目前選擇仍可使用，重新開啟後可能恢復舊設定。",
    "en": "Model selections failed to save; current choices still work, but may revert upon reopening.",
    "ja": "モデルの選択を保存できませんでした。現在の選択は利用可能ですが、再起動時に以前の設定へ戻る可能性があります。"
  },
  {
    "id": "ui.copy.323",
    "source": "確定要清除本機保存的辯論內容與等待紀錄嗎？",
    "zh_TW": "確定要清除本機保存的辯論內容與等待紀錄嗎？",
    "en": "Are you sure you want to clear locally stored debate transcripts and pending records?",
    "ja": "ローカルに保存されたディベート記録と待機ログを消去してもよろしいですか？"
  },
  {
    "id": "ui.copy.324",
    "source": "確認聊天輸入區可使用、沒有遮住操作的視窗，再重新檢查。",
    "zh_TW": "確認聊天輸入區可使用、沒有遮住操作的視窗，再重新檢查。",
    "en": "Ensure the chat input is accessible with no blocking overlays, then recheck.",
    "ja": "チャット入力欄が利用可能で、遮るモーダルがないことを確認して再チェックしてください。"
  },
  {
    "id": "ui.copy.325",
    "source": "確認擴充套件有此網站的存取權；更新套件後需重新載入，再檢查連線。",
    "zh_TW": "確認擴充套件有此網站的存取權；更新套件後需重新載入，再檢查連線。",
    "en": "Ensure extension has site permissions; reload the extension after updates, then recheck.",
    "ja": "拡張機能に対象サイトへのアクセス権限があることを確認してください。更新後はリロードして再確認してください。"
  },
  {
    "id": "ui.copy.326",
    "source": "請 {p0} 總結",
    "zh_TW": "請 {p0} 總結",
    "en": "Ask {p0} to summarize",
    "ja": "{p0} にまとめを依頼"
  },
  {
    "id": "ui.copy.327",
    "source": "請 {p0} 總結目前對話",
    "zh_TW": "請 {p0} 總結目前對話",
    "en": "Ask {p0} to summarize the current conversation",
    "ja": "{p0} に現在の会話の要約を依頼"
  },
  {
    "id": "ui.copy.328",
    "source": "請先切到要當作來源的 ChatGPT、Gemini、Grok、Claude 或 Meta AI 對話分頁，再按總結辯論。",
    "zh_TW": "請先切到要當作來源的 ChatGPT、Gemini、Grok、Claude 或 Meta AI 對話分頁，再按總結辯論。",
    "en": "Please switch to the target ChatGPT, Gemini, Grok, Claude, or Meta AI chat tab before starting Summary Debate.",
    "ja": "要約ディベートを押す前に、情報元となるChatGPT、Gemini、Grok、Claude、またはMeta AIのタブに切り替えてください。"
  },
  {
    "id": "ui.copy.329",
    "source": "請先用最合理的方式解釋剛才最可疑的一句話，再指出這個解釋還缺什麼證據。先不要公布內鬼身分。",
    "zh_TW": "請先用最合理的方式解釋剛才最可疑的一句話，再指出這個解釋還缺什麼證據。先不要公布內鬼身分。",
    "en": "Explain the most suspicious sentence just now in the most reasonable way, then point out what evidence is missing. Do not reveal the impostor's identity yet.",
    "ja": "直前で最も疑わしかった一文を最も合理的に解釈し、その解釈に欠けている証拠を挙げてください。まだインポスターの正体は明かさないでください。"
  },
  {
    "id": "ui.copy.330",
    "source": "請先在「指定連線分頁」選擇要接續的 AI 對話。",
    "zh_TW": "請先在「指定連線分頁」選擇要接續的 AI 對話。",
    "en": "Please select the AI chat to continue in 'Link Active Tabs' first.",
    "ja": "まず「接続タブを指定」で引き継ぐAIの対話を選択してください。"
  },
  {
    "id": "ui.copy.331",
    "source": "請先在該模型分頁登入，再重新檢查",
    "zh_TW": "請先在該模型分頁登入，再重新檢查",
    "en": "Please log into that model's tab, then recheck",
    "ja": "対象モデルのタブでログインしてから再チェックしてください"
  },
  {
    "id": "ui.copy.332",
    "source": "請先完成或取消目前的補回覆，再讓 AI 離席；草稿仍保留。",
    "zh_TW": "請先完成或取消目前的補回覆，再讓 AI 離席；草稿仍保留。",
    "en": "Please finish or cancel the current response supplement before dismissing the AI; draft is preserved.",
    "ja": "AIを退席させる前に、現在の回答補完を完了またはキャンセルしてください（下書きは保持されます）。"
  },
  {
    "id": "ui.copy.333",
    "source": "請先完成或取消目前這段補回覆，再選擇另一格。",
    "zh_TW": "請先完成或取消目前這段補回覆，再選擇另一格。",
    "en": "Please finish or cancel this supplement before picking another slot.",
    "ja": "別の枠を選ぶ前に、現在の回答補完を完了またはキャンセルしてください。"
  },
  {
    "id": "ui.copy.334",
    "source": "請先啟用至少一家 AI",
    "zh_TW": "請先啟用至少一家 AI",
    "en": "Please enable at least one AI",
    "ja": "最低1つのAIを有効にしてください"
  },
  {
    "id": "ui.copy.335",
    "source": "請先啟用至少一家 AI 再檢查連線",
    "zh_TW": "請先啟用至少一家 AI 再檢查連線",
    "en": "Please enable at least one AI before checking connections",
    "ja": "接続を確認する前に、最低1つのAIを有効にしてください"
  },
  {
    "id": "ui.copy.336",
    "source": "請先啟用要擔任總結的 {p0}",
    "zh_TW": "請先啟用要擔任總結的 {p0}",
    "en": "Please enable {p0} to serve as the concluding judge",
    "ja": "まとめを担当する {p0} をまず有効にしてください"
  },
  {
    "id": "ui.copy.337",
    "source": "請先補齊並繼續目前暫停的流程，或重置會議後再擷取接續內容。",
    "zh_TW": "請先補齊並繼續目前暫停的流程，或重置會議後再擷取接續內容。",
    "en": "Please supplement and resume the paused flow, or reset before capturing continuation content.",
    "ja": "一時停止中の処理を補完して再開するか、リセットしてから続きの内容を取得してください。"
  },
  {
    "id": "ui.copy.338",
    "source": "請先補齊所有故障回覆，再繼續原流程。",
    "zh_TW": "請先補齊所有故障回覆，再繼續原流程。",
    "en": "Please supplement all failed responses before resuming the flow.",
    "ja": "すべての障害回答を補完してから、元の処理を再開してください。"
  },
  {
    "id": "ui.copy.339",
    "source": "請先補齊故障回覆，再繼續討論或總結。",
    "zh_TW": "請先補齊故障回覆，再繼續討論或總結。",
    "en": "Please supplement failed responses before continuing discussion or summarizing.",
    "ja": "障害回答を補完してから、議論の継続または要約を行ってください。"
  },
  {
    "id": "ui.copy.340",
    "source": "請先補齊故障回覆並繼續原流程，或重置目前會議。",
    "zh_TW": "請先補齊故障回覆並繼續原流程，或重置目前會議。",
    "en": "Please supplement failed responses to resume, or reset the current meeting.",
    "ja": "障害回答を補完して元の処理を再開するか、現在の会議をリセットしてください。"
  },
  {
    "id": "ui.copy.341",
    "source": "請先輸入問題",
    "zh_TW": "請先輸入問題",
    "en": "Please enter a question first",
    "ja": "まず質問を入力してください"
  },
  {
    "id": "ui.copy.342",
    "source": "請各自引用目前發言中的一個具體矛盾，提出需要對方澄清的問題。先討論證據，不猜身分。",
    "zh_TW": "請各自引用目前發言中的一個具體矛盾，提出需要對方澄清的問題。先討論證據，不猜身分。",
    "en": "Quote a concrete contradiction in current statements and pose a question needing clarification. Discuss evidence first, no role guessing.",
    "ja": "これまでの発言から具体的な矛盾を1つ引用し、相手に明確化を求める質問をしてください。正体当てではなく証拠の議論を優先してください。"
  },
  {
    "id": "ui.copy.343",
    "source": "請各自找出目前最有共識的方案可能失敗的一個具體情境，再提出一個可測試的修正。沒有資料支持時請標示為假設。",
    "zh_TW": "請各自找出目前最有共識的方案可能失敗的一個具體情境，再提出一個可測試的修正。沒有資料支持時請標示為假設。",
    "en": "Identify a concrete scenario where the consensus proposal could fail, then propose a testable fix. Tag any point without supporting data as an assumption.",
    "ja": "最も合意形成が進んでいる案が失敗する具体的な状況を1つ特定し、検証可能な修正案を提示してください。データに裏付けがない場合は仮定と明記してください。"
  },
  {
    "id": "ui.copy.344",
    "source": "請各自提出一個能測試目前主張是否前後一致的假設情境，並回答自己的情境。不要求任何人揭露隱藏設定。",
    "zh_TW": "請各自提出一個能測試目前主張是否前後一致的假設情境，並回答自己的情境。不要求任何人揭露隱藏設定。",
    "en": "Pose a hypothetical scenario testing whether current positions remain consistent, and answer it yourself. Do not demand revealing hidden personas.",
    "ja": "これまでの主張が一貫しているかを試す仮定のシナリオを各自提示し、自ら回答してください。裏設定の開示は要求しないでください。"
  },
  {
    "id": "ui.copy.345",
    "source": "請各自提出一個現在就能開始的小實驗：要做什麼、觀察什麼，以及出現什麼結果時應該改變主張。先不要結案。",
    "zh_TW": "請各自提出一個現在就能開始的小實驗：要做什麼、觀察什麼，以及出現什麼結果時應該改變主張。先不要結案。",
    "en": "Propose a small experiment that can start right now: what to do, what to observe, and what result would change your stance. Do not conclude yet.",
    "ja": "今すぐ始められる小さな実験を各自提案してください：何を実行し、何を観察し、どんな結果が出たら主張を変えるべきか。まだ締めくくらないでください。"
  },
  {
    "id": "ui.copy.346",
    "source": "請至少勾選 1 家 AI 才能隨機抽主席。",
    "zh_TW": "請至少勾選 1 家 AI 才能隨機抽主席。",
    "en": "Please select at least 1 AI to draw a random chair.",
    "ja": "ランダム議長を選ぶには最低1つのAIを選択してください。"
  },
  {
    "id": "ui.copy.347",
    "source": "請求失敗，內容已保留",
    "zh_TW": "請求失敗，內容已保留",
    "en": "Request failed, content preserved",
    "ja": "リクエストに失敗しました（内容は保持されています）"
  },
  {
    "id": "ui.copy.348",
    "source": "請等目前流程結束後再操作。",
    "zh_TW": "請等目前流程結束後再操作。",
    "en": "Please wait until the current process completes.",
    "ja": "現在の処理が完了するまでお待ちください。"
  },
  {
    "id": "ui.copy.349",
    "source": "請貼上 1–12,000 字元的 AI 回覆；過長的內容請先精簡，內容不會自動截斷。",
    "zh_TW": "請貼上 1–12,000 字元的 AI 回覆；過長的內容請先精簡，內容不會自動截斷。",
    "en": "Please paste a 1–12,000 character AI response. Trim excessive text manually, as it will not auto-truncate.",
    "ja": "1〜12,000文字のAI回答を貼り付けてください。長すぎる内容は自動切り捨てされないため、手動で要約してください。"
  },
  {
    "id": "ui.copy.350",
    "source": "請貼上完整 AI 回覆（1–12,000 字元），不能貼上故障訊息。",
    "zh_TW": "請貼上完整 AI 回覆（1–12,000 字元），不能貼上故障訊息。",
    "en": "Please paste the full AI response (1–12,000 characters); do not paste error messages.",
    "ja": "完全なAI回答（1〜12,000文字）を貼り付けてください。エラーメッセージは貼り付けないでください。"
  },
  {
    "id": "ui.copy.351",
    "source": "輪到你",
    "zh_TW": "輪到你",
    "en": "Your Turn",
    "ja": "あなたの番"
  },
  {
    "id": "ui.copy.352",
    "source": "輪到你改變局勢。加個轉折、再互評，或結案收下這場討論。",
    "zh_TW": "輪到你改變局勢。加個轉折、再互評，或結案收下這場討論。",
    "en": "Your turn to shake things up. Add a twist, trigger another review, or wrap up the discussion.",
    "ja": "展開を動かすあなたの番です。ひねりを加えるか、再レビューするか、議論を締めくくりましょう。"
  },
  {
    "id": "ui.copy.353",
    "source": "整合",
    "zh_TW": "整合",
    "en": "Integrate",
    "ja": "統合"
  },
  {
    "id": "ui.copy.354",
    "source": "整合",
    "zh_TW": "整合",
    "en": "Integrate",
    "ja": "統合"
  },
  {
    "id": "ui.copy.355",
    "source": "整理目前對話",
    "zh_TW": "整理目前對話",
    "en": "Organize Active Chat",
    "ja": "現在の対話を整理"
  },
  {
    "id": "ui.copy.356",
    "source": "輸入 ChatGPT 的人設...",
    "zh_TW": "輸入 ChatGPT 的人設...",
    "en": "Enter ChatGPT's persona...",
    "ja": "ChatGPT のペルソナを入力..."
  },
  {
    "id": "ui.copy.357",
    "source": "輸入 Claude 的人設...",
    "zh_TW": "輸入 Claude 的人設...",
    "en": "Enter Claude's persona...",
    "ja": "Claude のペルソナを入力..."
  },
  {
    "id": "ui.copy.358",
    "source": "輸入 Gemini 的人設...",
    "zh_TW": "輸入 Gemini 的人設...",
    "en": "Enter Gemini's persona...",
    "ja": "Gemini のペルソナを入力..."
  },
  {
    "id": "ui.copy.359",
    "source": "輸入 Grok 的人設...",
    "zh_TW": "輸入 Grok 的人設...",
    "en": "Enter Grok's persona...",
    "ja": "Grok のペルソナを入力..."
  },
  {
    "id": "ui.copy.360",
    "source": "輸入 Meta AI 的人設...",
    "zh_TW": "輸入 Meta AI 的人設...",
    "en": "Enter Meta AI's persona...",
    "ja": "Meta AI のペルソナを入力..."
  },
  {
    "id": "ui.copy.361",
    "source": "輸入框狀態異常，自動重新整理後重試",
    "zh_TW": "輸入框狀態異常，自動重新整理後重試",
    "en": "Input field abnormal, auto-refreshing and retrying",
    "ja": "入力欄の状態が異常です。自動更新後に再試行します"
  },
  {
    "id": "ui.copy.362",
    "source": "選擇參與會議的 AI",
    "zh_TW": "選擇參與會議的 AI",
    "en": "Select Participating AIs",
    "ja": "会議に参加するAIを選択"
  },
  {
    "id": "ui.copy.363",
    "source": "錯誤:",
    "zh_TW": "錯誤:",
    "en": "Error:",
    "ja": "エラー:"
  },
  {
    "id": "ui.copy.364",
    "source": "錯誤: {p0}",
    "zh_TW": "錯誤: {p0}",
    "en": "Error: {p0}",
    "ja": "エラー: {p0}"
  },
  {
    "id": "ui.copy.365",
    "source": "隨機主席",
    "zh_TW": "隨機主席",
    "en": "Random Chair",
    "ja": "ランダム議長"
  },
  {
    "id": "ui.copy.366",
    "source": "隨機主席",
    "zh_TW": "隨機主席",
    "en": "Random Chair",
    "ja": "ランダム議長"
  },
  {
    "id": "ui.copy.367",
    "source": "檢查未完成，請依下方指引處理；技術細節可在診斷資訊查看。",
    "zh_TW": "檢查未完成，請依下方指引處理；技術細節可在診斷資訊查看。",
    "en": "Check incomplete. Follow guidance below; see diagnostics for technical details.",
    "ja": "チェックが完了していません。以下の案内に従ってください。詳細は診断情報で確認できます。"
  },
  {
    "id": "ui.copy.368",
    "source": "檢查連線",
    "zh_TW": "檢查連線",
    "en": "Check Connection",
    "ja": "接続を確認"
  },
  {
    "id": "ui.copy.369",
    "source": "檢查逾時",
    "zh_TW": "檢查逾時",
    "en": "Check timed out",
    "ja": "チェックがタイムアウトしました"
  },
  {
    "id": "ui.copy.370",
    "source": "總結",
    "zh_TW": "總結",
    "en": "Summary",
    "ja": "総括"
  },
  {
    "id": "ui.copy.371",
    "source": "總結已補齊，會議完成",
    "zh_TW": "總結已補齊，會議完成",
    "en": "Summary complete; meeting concluded",
    "ja": "総括が補完され、会議が完了しました"
  },
  {
    "id": "ui.copy.372",
    "source": "總結中",
    "zh_TW": "總結中",
    "en": "Summarizing",
    "ja": "総括中"
  },
  {
    "id": "ui.copy.373",
    "source": "總結方式",
    "zh_TW": "總結方式",
    "en": "Summary Mode",
    "ja": "総括方式"
  },
  {
    "id": "ui.copy.374",
    "source": "總結失敗",
    "zh_TW": "總結失敗",
    "en": "Summary failed",
    "ja": "総括に失敗しました"
  },
  {
    "id": "ui.copy.375",
    "source": "總結目前對話",
    "zh_TW": "總結目前對話",
    "en": "Summarize Active Chat",
    "ja": "現在の対話を要約"
  },
  {
    "id": "ui.copy.376",
    "source": "總結辯論 ✦",
    "zh_TW": "總結辯論 ✦",
    "en": "Summary Debate ✦",
    "ja": "要約ディベート ✦"
  },
  {
    "id": "ui.copy.377",
    "source": "總結辯論至少需要目前頁面以外的 2 家 AI。",
    "zh_TW": "總結辯論至少需要目前頁面以外的 2 家 AI。",
    "en": "Summary Debate requires at least 2 other AIs besides the current page.",
    "ja": "要約ディベートには現在のページ以外に最低2つのAIが必要です。"
  },
  {
    "id": "ui.copy.378",
    "source": "總結辯論至少需要目前頁面以外的 2 家 AI。現在目前頁面是 {p0}，請再勾選兩家其他 AI。",
    "zh_TW": "總結辯論至少需要目前頁面以外的 2 家 AI。現在目前頁面是 {p0}，請再勾選兩家其他 AI。",
    "en": "Summary Debate requires at least 2 other AIs besides the active page. The active page is {p0}; please check two other AIs.",
    "ja": "要約ディベートには現在のページ以外に最低2つのAIが必要です。現在は {p0} なので、他のAIを2つ選択してください。"
  },
  {
    "id": "ui.copy.379",
    "source": "總結辯論至少需要目前頁面以外的 2 家 AI。現在目前頁面是 {p0}，請再啟用兩家其他 AI。",
    "zh_TW": "總結辯論至少需要目前頁面以外的 2 家 AI。現在目前頁面是 {p0}，請再啟用兩家其他 AI。",
    "en": "Summary Debate requires at least 2 other AIs besides the active page. The active page is {p0}; please enable two other AIs.",
    "ja": "要約ディベートには現在のページ以外に最低2つのAIが必要です。現在は {p0} なので、他のAIを2つ有効化してください。"
  },
  {
    "id": "ui.copy.380",
    "source": "還有故障回覆待補齊，會議繼續保持暫停。",
    "zh_TW": "還有故障回覆待補齊，會議繼續保持暫停。",
    "en": "Missing failed responses remain; meeting continues to be paused.",
    "ja": "未補完の障害回答があるため、会議の一時停止を継続します。"
  },
  {
    "id": "ui.copy.381",
    "source": "擷取目前發言",
    "zh_TW": "擷取目前發言",
    "en": "Capture Current Messages",
    "ja": "現在の発言を取得"
  },
  {
    "id": "ui.copy.382",
    "source": "擷取各連結分頁最後一則 AI 發言一次，再加上上方的補充。預覽後按啟動才會送出。",
    "zh_TW": "擷取各連結分頁最後一則 AI 發言一次，再加上上方的補充。預覽後按啟動才會送出。",
    "en": "Captures the latest message from linked AI tabs once, appending your notes above. Starts sending only after preview.",
    "ja": "接続先タブの最後のAI発言を一度取得し、上の補足を加えます。プレビュー後に開始を押すと送信されます。"
  },
  {
    "id": "ui.copy.383",
    "source": "轉折已加入草稿；修改好，再按送出補充。",
    "zh_TW": "轉折已加入草稿；修改好，再按送出補充。",
    "en": "Twist added to draft. Once polished, click 'Send Notes'.",
    "ja": "ひねりを下書きに追加しました。編集後、「補足を送信」を押してください。"
  },
  {
    "id": "ui.copy.384",
    "source": "轉折靈感，僅加入草稿",
    "zh_TW": "轉折靈感，僅加入草稿",
    "en": "Twist prompt, added to draft only",
    "ja": "ひねりのヒント（下書きに追加のみ）"
  },
  {
    "id": "ui.copy.385",
    "source": "離席後接續流程失敗：{p0}",
    "zh_TW": "離席後接續流程失敗：{p0}",
    "en": "Client flow continuation after dismissal failed: {p0}",
    "ja": "退席後の処理再開に失敗しました：{p0}"
  },
  {
    "id": "ui.copy.386",
    "source": "繼續原流程",
    "zh_TW": "繼續原流程",
    "en": "Resume Original Flow",
    "ja": "元の処理を再開"
  },
  {
    "id": "ui.copy.387",
    "source": "辯論失敗",
    "zh_TW": "辯論失敗",
    "en": "Debate failed",
    "ja": "ディベートに失敗しました"
  },
  {
    "id": "ui.copy.388",
    "source": "辯論完成",
    "zh_TW": "辯論完成",
    "en": "Debate completed",
    "ja": "ディベート完了"
  },
  {
    "id": "ui.copy.389",
    "source": "辯論模式",
    "zh_TW": "辯論模式",
    "en": "Debate Mode",
    "ja": "ディベートモード"
  },
  {
    "id": "ui.copy.390",
    "source": "讓各家依人設回答與互評，再等你加入討論。可在設定中修改人設。",
    "zh_TW": "讓各家依人設回答與互評，再等你加入討論。可在設定中修改人設。",
    "en": "AIs answer and critique by persona, then await your input. Personas can be customized in settings.",
    "ja": "設定されたペルソナで回答＆批評し、あなたの発言を待ちます。ペルソナは設定で変更可能です。"
  },
  {
    "id": "ui.copy.391",
    "source": "靈感只加入草稿，可以修改；按「送出補充」才會送給 AI。",
    "zh_TW": "靈感只加入草稿，可以修改；按「送出補充」才會送給 AI。",
    "en": "Ideas are only added to draft and editable; click 'Send Notes' to deliver to AI.",
    "ja": "ヒントは下書きに追加されるだけなので編集可能です。「補足を送信」を押すとAIに送られます。"
  },
  {
    "id": "ui.copy.392",
    "source": "AI 正在回應，轉折靈感稍後可用。",
    "zh_TW": "AI 正在回應，轉折靈感稍後可用。",
    "en": "AI is responding; twist ideas will be available shortly.",
    "ja": "AIが応答中です。ひねりのヒントは後ほど利用可能になります。"
  },
  {
    "id": "ui.copy.393",
    "source": "AI 回應中",
    "zh_TW": "AI 回應中",
    "en": "AI responding",
    "ja": "AI応答中"
  },
  {
    "id": "ui.copy.394",
    "source": "ChatGPT (預設: 決策架構師)",
    "zh_TW": "ChatGPT (預設: 決策架構師)",
    "en": "ChatGPT (Default: Decision Architect)",
    "ja": "ChatGPT (デフォルト: 意思決定アーキテクト)"
  },
  {
    "id": "ui.copy.395",
    "source": "Claude (預設: 鋼人風險編輯)",
    "zh_TW": "Claude (預設: 鋼人風險編輯)",
    "en": "Claude (Default: Steel-man Risk Editor)",
    "ja": "Claude (デフォルト: スチールマン・リスクエディター)"
  },
  {
    "id": "ui.copy.396",
    "source": "Free，所有功能已開放",
    "zh_TW": "Free，所有功能已開放",
    "en": "Free, all features unlocked",
    "ja": "Free、全機能開放中"
  },
  {
    "id": "ui.copy.397",
    "source": "Free，所有功能已開放",
    "zh_TW": "Free，所有功能已開放",
    "en": "Free, all features unlocked",
    "ja": "Free、全機能開放中"
  },
  {
    "id": "ui.copy.398",
    "source": "Gemini (預設: 腦洞鬧場)",
    "zh_TW": "Gemini (預設: 腦洞鬧場)",
    "en": "Gemini (Default: Wild Disruptor)",
    "ja": "Gemini (デフォルト: カオスな異端児)"
  },
  {
    "id": "ui.copy.399",
    "source": "Grok (預設: 短週期輿情壓力測試)",
    "zh_TW": "Grok (預設: 短週期輿情壓力測試)",
    "en": "Grok (Default: Short-term Public Sentiment Stress Tester)",
    "ja": "Grok (デフォルト: 短期・リアルタイム世論ストレステスト)"
  },
  {
    "id": "ui.copy.400",
    "source": "Meta AI Beta (預設: 社群視角)（長週期採用視角）",
    "zh_TW": "Meta AI Beta (預設: 社群視角)（長週期採用視角）",
    "en": "Meta AI Beta (Default: Community Perspective) (Long-term Adoption)",
    "ja": "Meta AI Beta (デフォルト: コミュニティ視点)（長期導入視点）"
  },
  {
    "id": "ui.copy.401",
    "source": "Provider 分頁不存在",
    "zh_TW": "Provider 分頁不存在",
    "en": "Provider tab does not exist",
    "ja": "プロバイダーのタブが存在しません"
  },
  {
    "id": "ui.copy.402",
    "source": "Provider 檢查期限已到",
    "zh_TW": "Provider 檢查期限已到",
    "en": "Provider check timed out",
    "ja": "プロバイダーの確認期限が切れました"
  },
  {
    "id": "ui.copy.403",
    "source": "Provider Driver 契約版本不一致，請重新整理該分頁後再試一次",
    "zh_TW": "Provider Driver 契約版本不一致，請重新整理該分頁後再試一次",
    "en": "Provider Driver contract version mismatch; please refresh that tab and retry",
    "ja": "Provider Driver の規約バージョンが一致しません。タブを更新して再試行してください"
  },
  {
    "id": "ui.copy.404",
    "source": "readiness: Provider 檢查期限已到",
    "zh_TW": "readiness: Provider 檢查期限已到",
    "en": "readiness: Provider check timed out",
    "ja": "readiness: プロバイダーの確認期限が切れました"
  },
  {
    "id": "extra.copy.001",
    "source": "{p0} 目前無法使用，請重新開啟側邊欄。",
    "zh_TW": "{p0} 目前無法使用，請重新開啟側邊欄。",
    "en": "{p0} is currently unavailable. Please reopen the sidebar to try again!",
    "ja": "{p0} は現在利用できません。サイドバーを開き直してみてくださいね！"
  },
  {
    "id": "extra.copy.002",
    "source": "互動控制台",
    "zh_TW": "互動控制台",
    "en": "Interactive Console",
    "ja": "インタラクティブコンソール"
  },
  {
    "id": "extra.copy.003",
    "source": "自由群聊與劇場模式",
    "zh_TW": "自由群聊與劇場模式",
    "en": "Free Group Chat & Theater Mode",
    "ja": "フリーグループチャット＆シアターモード"
  },
  {
    "id": "extra.copy.004",
    "source": "快速鬥技場",
    "zh_TW": "快速鬥技場",
    "en": "Quick Arena",
    "ja": "クイックアリーナ"
  },
  {
    "id": "extra.copy.005",
    "source": "沒有可接續的 AI 發言；請先指定連線分頁，並確認 AI 已回答。",
    "zh_TW": "沒有可接續的 AI 發言；請先指定連線分頁，並確認 AI 已回答。",
    "en": "No AI response to continue from! Please select a connected tab first and make sure the AI has replied.",
    "ja": "続きとなるAIの発言が見つかりません！まずは接続タブを指定して、AIが回答済みか確認してくださいね。"
  },
  {
    "id": "extra.copy.006",
    "source": "匿名評論制",
    "zh_TW": "匿名評論制",
    "en": "Anonymous Critique Mode",
    "ja": "匿名レビュー制"
  },
  {
    "id": "extra.copy.007",
    "source": "基礎辯論",
    "zh_TW": "基礎辯論",
    "en": "Basic Debate",
    "ja": "ベーシックディベート"
  },
  {
    "id": "extra.copy.008",
    "source": "接續內容超過 60,000 字元，請先手動精簡發言後再開始。",
    "zh_TW": "接續內容超過 60,000 字元，請先手動精簡發言後再開始。",
    "en": "The content to continue exceeds 60,000 characters! Please trim the text a bit before starting.",
    "ja": "引き継ぐ内容が 60,000 文字を超えています！手動で発言を少し短縮してから開始してくださいね。"
  },
  {
    "id": "extra.copy.009",
    "source": "這項功能",
    "zh_TW": "這項功能",
    "en": "This feature",
    "ja": "この機能"
  },
  {
    "id": "extra.copy.010",
    "source": "圍觀主席制",
    "zh_TW": "圍觀主席制",
    "en": "Spectator Moderator Mode",
    "ja": "観戦モデレーター制"
  },
  {
    "id": "extra.copy.011",
    "source": "匯出",
    "zh_TW": "匯出",
    "en": "Export",
    "ja": "エクスポート"
  },
  {
    "id": "extra.copy.012",
    "source": "歷史紀錄",
    "zh_TW": "歷史紀錄",
    "en": "History",
    "ja": "履歴"
  },
  {
    "id": "extra.copy.013",
    "source": "總結辯論",
    "zh_TW": "總結辯論",
    "en": "Summarize Debate",
    "ja": "ディベートを要約"
  },
  {
    "id": "extra.copy.014",
    "source": "語言設定讀取失敗：{p0}",
    "zh_TW": "語言設定讀取失敗：{p0}",
    "en": "Failed to load language settings: {p0}",
    "ja": "言語設定の読み込みに失敗しました：{p0}"
  },
  {
    "id": "extra.copy.015",
    "source": "語言偏好未能保存，這次切換仍會保留在目前視窗。{p0}",
    "zh_TW": "語言偏好未能保存，這次切換仍會保留在目前視窗。{p0}",
    "en": "Could not save language preferences, but your switch will stay active in this window! {p0}",
    "ja": "言語設定の保存に失敗しましたが、今回の切り替えは現在のウィンドウで保持されますよ！{p0}"
  },
  {
    "id": "extra.copy.016",
    "source": "Free",
    "zh_TW": "免費",
    "en": "Free",
    "ja": "無料"
  },
  {
    "id": "gap.copy.001",
    "source": "未加入",
    "zh_TW": "未加入",
    "en": "Not joined",
    "ja": "未参加"
  },
  {
    "id": "gap.copy.002",
    "source": "先前的接續草稿仍保留，可取消後重新擷取。",
    "zh_TW": "先前的接續草稿仍保留，可取消後重新擷取。",
    "en": "The previous continuation draft is preserved. You can cancel and capture again.",
    "ja": "前回の続きの下書きは保持されています。キャンセルして再取得できます。"
  },
  {
    "id": "gap.copy.003",
    "source": "貼上的內容已保留。",
    "zh_TW": "貼上的內容已保留。",
    "en": "Pasted content has been preserved.",
    "ja": "貼り付けた内容は保持されています。"
  },
  {
    "id": "gap.copy.004",
    "source": "{p0} 正在總結",
    "zh_TW": "{p0} 正在總結",
    "en": "{p0} is summarizing",
    "ja": "{p0} がまとめ中"
  },
  {
    "id": "gap.copy.005",
    "source": "整理上下文中",
    "zh_TW": "整理上下文中",
    "en": "Organizing context...",
    "ja": "文脈を整理中"
  },
  {
    "id": "gap.copy.006",
    "source": "{p0} · 來源總結",
    "zh_TW": "{p0} · 來源總結",
    "en": "{p0} · Source Summary",
    "ja": "{p0} · ソースのまとめ"
  },
  {
    "id": "gap.copy.007",
    "source": "思考生成中",
    "zh_TW": "思考生成中",
    "en": "Thinking & generating...",
    "ja": "思考・生成中"
  },
  {
    "id": "gap.copy.008",
    "source": "使用者插話 🙋",
    "zh_TW": "使用者插話 🙋",
    "en": "User chime-in 🙋",
    "ja": "ユーザーの割り込み発言 🙋"
  },
  {
    "id": "gap.copy.009",
    "source": "遊戲揭曉",
    "zh_TW": "遊戲揭曉",
    "en": "Game Reveal",
    "ja": "ゲーム結果発表"
  },
  {
    "id": "gap.copy.010",
    "source": "{p0} 的揭曉反應",
    "zh_TW": "{p0} 的揭曉反應",
    "en": "{p0}'s reveal reaction",
    "ja": "{p0} の結果発表リアクション"
  },
  {
    "id": "gap.copy.011",
    "source": "{p0} 的總結",
    "zh_TW": "{p0} 的總結",
    "en": "{p0}'s summary",
    "ja": "{p0} のまとめ"
  },
  {
    "id": "gap.copy.012",
    "source": "{p0} 總結裁決中",
    "zh_TW": "{p0} 總結裁決中",
    "en": "{p0} is deliberating the verdict",
    "ja": "{p0} が総括・裁定中"
  },
  {
    "id": "gap.copy.013",
    "source": "彙整精華中",
    "zh_TW": "彙整精華中",
    "en": "Compiling key highlights...",
    "ja": "要点をまとめ中"
  },
  {
    "id": "gap.copy.014",
    "source": "{p0} 總結裁決",
    "zh_TW": "{p0} 總結裁決",
    "en": "{p0}'s Final Verdict",
    "ja": "{p0} の総括裁定"
  },
  {
    "id": "gap.copy.015",
    "source": "最終裁決 👑",
    "zh_TW": "最終裁決 👑",
    "en": "Final Verdict 👑",
    "ja": "最終裁定 👑"
  },
  {
    "id": "gap.copy.016",
    "source": "已手動補入 AI 回覆",
    "zh_TW": "已手動補入 AI 回覆",
    "en": "Manually filled in AI reply",
    "ja": "AIの返答を手動で追加しました"
  },
  {
    "id": "gap.copy.017",
    "source": "查看原故障",
    "zh_TW": "查看原故障",
    "en": "View original error",
    "ja": "元のエラーを確認"
  },
  {
    "id": "gap.copy.018",
    "source": "貼上 AI 回覆",
    "zh_TW": "貼上 AI 回覆",
    "en": "Paste AI reply",
    "ja": "AIの返答を貼り付け"
  },
  {
    "id": "gap.copy.019",
    "source": "讓 AI 離席",
    "zh_TW": "讓 AI 離席",
    "en": "Excuse AI from session",
    "ja": "AIを退席させる"
  },
  {
    "id": "gap.copy.020",
    "source": "離席後，本場不再請它發言；先前內容保留。",
    "zh_TW": "離席後，本場不再請它發言；先前內容保留。",
    "en": "Once dismissed, it won't be called to speak again in this session; previous content is preserved.",
    "ja": "退席後は本セッションで発言を求めなくなります。これまでの内容は保持されます。"
  },
  {
    "id": "gap.copy.021",
    "source": "目前流程結束後即可處理。",
    "zh_TW": "目前流程結束後即可處理。",
    "en": "Can be processed once the current flow finishes.",
    "ja": "現在の処理が終了した後に対応できます。"
  },
  {
    "id": "gap.copy.023",
    "source": "連線：等待開始",
    "zh_TW": "連線：等待開始",
    "en": "Connection: Waiting to start",
    "ja": "接続：開始待ち"
  },
  {
    "id": "gap.copy.024",
    "source": "已離席；本場不再參與後續討論，先前發言仍保留。",
    "zh_TW": "已離席；本場不再參與後續討論，先前發言仍保留。",
    "en": "Dismissed. It will not join further discussions this session; past comments are preserved.",
    "ja": "退席しました。本セッションの今後の議論には参加しませんが、過去の発言は保持されます。"
  },
  {
    "id": "experience.latest",
    "source": "查看最新回覆 ↓",
    "zh_TW": "查看最新回覆 ↓",
    "en": "Jump to latest reply ↓",
    "ja": "最新の返信を見る ↓"
  },
  {
    "id": "experience.reading",
    "source": "有新內容；閱讀位置已保留。",
    "zh_TW": "有新內容囉！已為你保留目前的閱讀位置。",
    "en": "New updates arrived! We've kept your reading spot.",
    "ja": "新しいメッセージがあります！読んでいる位置はそのままキープされています。"
  },
  {
    "id": "experience.reset",
    "source": "重置會結束目前會議並清除這場紀錄，無法復原。模型選擇會保留。確定重置？",
    "zh_TW": "重置會結束目前會議並清除這場紀錄，無法復原。模型選擇會保留。確定重置？",
    "en": "Resetting ends this meeting and clears its transcript permanently. Model picks are kept. Confirm reset?",
    "ja": "リセットすると現在の会議を終了し、記録を消去します（元に戻せません）。モデル選択は保持されます。リセットしますか？"
  },
  {
    "id": "experience.clear",
    "source": "確定要清除本機保存的辯論內容與等待紀錄嗎？",
    "zh_TW": "確定要清除本機保存的辯論內容與等待紀錄嗎？",
    "en": "Are you sure you want to clear locally stored debate transcripts and pending records?",
    "ja": "ローカルに保存されたディベート記録と待機ログを消去してもよろしいですか？"
  },
  {
    "id": "examples.heading",
    "source": "不知道從哪裡開始？",
    "zh_TW": "不知道從哪裡開始？",
    "en": "Not sure where to start?",
    "ja": "どこから始めるか迷ったら？"
  },
  {
    "id": "examples.note",
    "source": "點一題放進草稿，改好再開始；不會自動送出。",
    "zh_TW": "點一題放進草稿，改好再開始；不會自動送出。",
    "en": "Click a prompt to fill your draft, edit freely before starting; it won't submit automatically.",
    "ja": "クリックで下書きに入ります。編集してから開始でき、自動送信はされません。"
  },
  {
    "id": "examples.decision",
    "source": "比較方案",
    "zh_TW": "比較方案",
    "en": "Compare options",
    "ja": "選択肢の比較"
  },
  {
    "id": "examples.writing",
    "source": "找創作方向",
    "zh_TW": "找創作方向",
    "en": "Brainstorm directions",
    "ja": "創作の方向性を探す"
  },
  {
    "id": "examples.review",
    "source": "找計畫盲點",
    "zh_TW": "找計畫盲點",
    "en": "Spot plan blind spots",
    "ja": "計画の盲点を探す"
  },
  {
    "id": "examples.decisionPrompt",
    "source": "我每週有五小時做個人專案。該先做完整功能，還是小型原型？請比較取捨、指出各自風險，並提出一週內可驗證的做法。",
    "zh_TW": "我每週有五小時做個人專案。該先做完整功能，還是小型原型？請比較取捨、指出各自風險，並提出一週內可驗證的做法。",
    "en": "I have 5 hours a week for a personal project. Should I build full features or a small prototype first? Please compare tradeoffs, point out risks, and suggest a 1-week testable plan.",
    "ja": "毎週5時間を個人開発にあてています。完成版を目指すべきか、小さなプロトタイプから作るべきか？それぞれの取捨選択とリスクを比較し、1週間で検証できる方法を提案してください。"
  },
  {
    "id": "examples.writingPrompt",
    "source": "我想寫一篇介紹日常小發現的短文。請提出三種不同切入角度、各自適合的讀者與一個開頭範例，並指出哪些角度可能流於老套。",
    "zh_TW": "我想寫一篇介紹日常小發現的短文。請提出三種不同切入角度、各自適合的讀者與一個開頭範例，並指出哪些角度可能流於老套。",
    "en": "I want to write a short essay about everyday discoveries. Please propose three different angles, target audiences, an opening example for each, and note which angles might feel cliché.",
    "ja": "日常のちょっとした気づきを紹介するエッセイを書きたいです。3つの切り口とそれぞれの想定読者、冒頭の例文を提案し、陳腐になりがちなアプローチも指摘してください。"
  },
  {
    "id": "examples.reviewPrompt",
    "source": "我打算用一週做一個簡單的待辦工具，先加入新增、完成與刪除功能。請找出計畫中的假設與風險，區分需要先驗證的事，並提出最小測試。",
    "zh_TW": "我打算用一週做一個簡單的待辦工具，先加入新增、完成與刪除功能。請找出計畫中的假設與風險，區分需要先驗證的事，並提出最小測試。",
    "en": "I plan to spend a week building a simple to-do tool with create, complete, and delete features. Please identify key assumptions and risks, separate what needs early validation, and suggest a minimal test.",
    "ja": "1週間でシンプルなTODOツール（追加・完了・削除）を作る予定です。計画の前提とリスクを洗い出し、先に検証すべき項目を切り分けて最小テストを提案してください。"
  },
  {
    "id": "recommend.heading",
    "source": "推薦給朋友",
    "zh_TW": "推薦給朋友",
    "en": "Recommend to friends",
    "ja": "友達に推薦する"
  },
  {
    "id": "recommend.note",
    "source": "下面只介紹 LLMeeting，不包含你的提問或會議內容。商店版可能與目前候選版不同，安裝前請確認版本。",
    "zh_TW": "下面只介紹 LLMeeting，不包含你的提問或會議內容。商店版可能與目前候選版不同，安裝前請確認版本。",
    "en": "The text below only introduces LLMeeting and excludes your prompts or meeting content. The store release may differ from this candidate build; please check the version before installing.",
    "ja": "下記はLLMeetingの紹介のみで、あなたの質問や会議内容は含まれません。ストア版は現在の候補版と異なる場合があるため、インストール前にバージョンをご確認ください。"
  },
  {
    "id": "recommend.body",
    "source": "我在試用 LLMeeting：把同一題交給已登入的不同 AI，集中比較回答、互評與分歧。功能免費，AI 帳號和額度另計；共識不保證正確。商店版本與候選版可能不同，安裝前請確認。",
    "zh_TW": "我在試用 LLMeeting：把同一題交給已登入的不同 AI，集中比較回答、互評與分歧。功能免費，AI 帳號和額度另計；共識不保證正確。商店版本與候選版可能不同，安裝前請確認。",
    "en": "I'm trying out LLMeeting: it sends the same question to different logged-in AIs to compare answers, critiques, and divergences in one place. The extension is free; AI accounts and quotas are managed separately; consensus does not guarantee accuracy. Store releases may differ from candidate builds—please check before installing.",
    "ja": "LLMeetingをお試し中：ログイン済みの異なるAIに同じ質問を投げ、回答・相互評価・相違点をまとめて比較できます。機能は無料、AIアカウントや利用枠は各自計算、合意も正確性を保証するものではありません。ストア版は候補版と異なる場合があるため、確認してインストールしてください。"
  },
  {
    "id": "recommend.copy",
    "source": "複製推薦文字",
    "zh_TW": "複製推薦文字",
    "en": "Copy recommendation",
    "ja": "紹介文をコピー"
  },
  {
    "id": "recommend.copied",
    "source": "推薦文字已複製，可以貼給朋友囉。",
    "zh_TW": "推薦文字已複製，可以貼給朋友囉。",
    "en": "Recommendation copied! You can now paste it to a friend.",
    "ja": "紹介文をコピーしました。友達にシェアできます。"
  },
  {
    "id": "recommend.fallback",
    "source": "無法自動複製；文字已選取，請用複製快捷鍵。",
    "zh_TW": "無法自動複製；文字已選取，請用複製快捷鍵。",
    "en": "Automatic copy failed; text is selected, please use the copy shortcut.",
    "ja": "自動コピーできませんでした。選択されたテキストをショートカットキーでコピーしてください。"
  },
  {
    "id": "recommend.label",
    "source": "推薦文字（不含會議內容）",
    "zh_TW": "推薦文字（不含會議內容）",
    "en": "Recommendation text (session content excluded)",
    "ja": "紹介テキスト（会議内容は含みません）"
  },
  {
    "id": "recommend.store",
    "source": "查看商店版本",
    "zh_TW": "查看商店版本",
    "en": "View store version",
    "ja": "ストアのバージョンを確認"
  },
  {
    "id": "play.openTitle",
    "source": "想玩一場嗎？",
    "zh_TW": "想玩一場嗎？",
    "en": "Up for a game?",
    "ja": "一局遊んでみる？"
  },
  {
    "id": "play.openNote",
    "source": "點選套用劇場＋共識接龍與開場題，只寫空白草稿，按啟動才送出；不改人設！",
    "zh_TW": "點選套用劇場＋共識接龍與開場題，只寫空白草稿，按啟動才送出；不改人設！",
    "en": "Applies Theater & Consensus Relay opening draft. Review anytime and start when ready; personas stay intact!",
    "ja": "劇場＋リレー合意のオープニング下書きを適用します。開始を押すまで送信されず、キャラ設定も変わりません！"
  },
  {
    "id": "play.shuffle",
    "source": "換一組挑戰",
    "zh_TW": "換一組挑戰",
    "en": "Shuffle Challenges",
    "ja": "別のチャレンジを引く"
  },
  {
    "id": "play.shuffleHint",
    "source": "只換卡片，不改草稿也不送出。",
    "zh_TW": "只換卡片，不改草稿也不送出。",
    "en": "Only changes cards without editing or sending the draft.",
    "ja": "カードのみ更新し、下書きの変更や送信は行いません。"
  },
  {
    "id": "play.added",
    "source": "挑戰已加入草稿，可以修改再送出！",
    "zh_TW": "挑戰已加入草稿，可以修改再送出！",
    "en": "Challenge added to draft! You can tweak it before sending.",
    "ja": "チャレンジを下書きに追加しました。調整してから送信できます！"
  },
  {
    "id": "play.batch",
    "source": "第 {p0} 組・每組 3 個轉折",
    "zh_TW": "第 {p0} 組・每組 3 個轉折",
    "en": "Deck {p0} · 3 twists per deck",
    "ja": "第 {p0} セット・各3つの展開"
  },
  {
    "id": "play.applied",
    "source": "劇場開場已填入，模式切為劇場與共識接龍；可先改設定再啟動。",
    "zh_TW": "劇場開場已填入，模式切為劇場與共識接龍；可先改設定再啟動。",
    "en": "Opening ready! Switched to Theater & Consensus Relay; feel free to adjust settings before starting.",
    "ja": "オープニングを入力し、劇場＆リレー合意モードに切替完了。開始前に設定調整も可能です。"
  },
  {
    "id": "scene.night-market.label",
    "source": "貓咪夜市",
    "zh_TW": "貓咪夜市",
    "en": "Cat Night Market",
    "ja": "猫の夜市"
  },
  {
    "id": "scene.night-market.prompt",
    "source": "【虛構情境遊戲】歡迎光臨喵喵夜市！請各位依照現有人設，各提出1個特色攤位點子與1個胡鬧障礙，並保持在3句內。最後請留1道選擇題給人類決定，別替人類下定論喔！",
    "zh_TW": "【虛構情境遊戲】歡迎光臨喵喵夜市！請各位依照現有人設，各提出1個特色攤位點子與1個胡鬧障礙，並保持在3句內。最後請留1道選擇題給人類決定，別替人類下定論喔！",
    "en": "[Fictional Scenario Game] Welcome to the Cat Night Market! In your current persona, propose 1 booth idea and 1 silly obstacle within 3 sentences. Leave 1 final choice for the human—do not decide the ending for them!",
    "ja": "【架空ロールプレイ】猫の夜市へようこそ！各自のキャラ設定のまま、屋台のアイデア1つとお茶目なトラブル1つを3文以内で提案してください。最後は人間に1つ選択肢を残し、勝手に結末を決めないでね！"
  },
  {
    "id": "scene.space-picnic.label",
    "source": "太空野餐",
    "zh_TW": "太空野餐",
    "en": "Space Picnic",
    "ja": "宇宙ピクニック"
  },
  {
    "id": "scene.space-picnic.prompt",
    "source": "【虛構情境遊戲】無重力野餐派對開始！請依現有人設，各提出1道漂浮料理點子與1個失重突發障礙，每人限3句內發言。請在結尾留1個關鍵抉擇讓人類定奪，不要幫人類做決定！",
    "zh_TW": "【虛構情境遊戲】無重力野餐派對開始！請依現有人設，各提出1道漂浮料理點子與1個失重突發障礙，每人限3句內發言。請在結尾留1個關鍵抉擇讓人類定奪，不要幫人類做決定！",
    "en": "[Fictional Scenario Game] Zero-gravity picnic has begun! In your persona, pitch 1 floating dish and 1 zero-g obstacle within 3 sentences. End with 1 key choice for the human without deciding the outcome for them!",
    "ja": "【架空ロールプレイ】無重力ピクニック開催！現在のキャラ設定のまま、宇宙グルメ1品と無重力ならではのアクシデント1つを3文以内で提案してね。結末を決めず、人間に委ねる選択肢を1つ残してください！"
  },
  {
    "id": "scene.odd-inventions.label",
    "source": "怪發明展",
    "zh_TW": "怪發明展",
    "en": "Odd Inventions Expo",
    "ja": "珍発明エキスポ"
  },
  {
    "id": "scene.odd-inventions.prompt",
    "source": "【虛構情境遊戲】怪奇發明博覽會開展！請依目前人設各展示1項古怪發明與其爆笑副作用，發言在3句內完成。結尾請拋出1個投資方向讓人類來挑選，請勿代替人類作結！",
    "zh_TW": "【虛構情境遊戲】怪奇發明博覽會開展！請依目前人設各展示1項古怪發明與其爆笑副作用，發言在3句內完成。結尾請拋出1個投資方向讓人類來挑選，請勿代替人類作結！",
    "en": "[Fictional Scenario Game] Welcome to the Odd Inventions Expo! In your persona, present 1 bizarre gadget and its funny side effect within 3 sentences. Present 1 choice for the human to pick an investment—don't conclude for them!",
    "ja": "【架空ロールプレイ】珍発明エキスポが開幕！現在のキャラ設定のまま、奇妙な発明品1つと愉快な副作用1つを3文以内で発表してね。人間のために最後の投資選択肢を1つ残し、勝手に結果を決めないでね！"
  },
  {
    "id": "card.theater-stage-shift.label",
    "source": "舞台劇變",
    "zh_TW": "舞台劇變",
    "en": "Stage Shift",
    "ja": "ステージ激変"
  },
  {
    "id": "card.theater-stage-shift.text",
    "source": "突然遭遇地震或場景翻轉！請依目前人設，用1句話說明你如何適應這片全新地形並繼續行動。（此為虛構設定，不影響客觀事實）",
    "zh_TW": "突然遭遇地震或場景翻轉！請依目前人設，用1句話說明你如何適應這片全新地形並繼續行動。（此為虛構設定，不影響客觀事實）",
    "en": "The scenery suddenly flips upside down! Stay in persona and describe in one sentence how you adapt to this new terrain. (Fictional premise only).",
    "ja": "舞台が一瞬で別の場所に急変！現在のキャラ設定のまま、新たな地形にどう適応するか1文で描写して行動を続けてね。（※架空の演出です）"
  },
  {
    "id": "card.theater-prop-glitch.label",
    "source": "道具大當機",
    "zh_TW": "道具大當機",
    "en": "Prop Malfunction",
    "ja": "小道具トラブル"
  },
  {
    "id": "card.theater-prop-glitch.text",
    "source": "你手中的關鍵道具突然失靈或發出怪聲！保持原本人設，提出一個令人噴飯的即興應急辦法。（虛構舞台狀況，非真實故障）",
    "zh_TW": "你手中的關鍵道具突然失靈或發出怪聲！保持原本人設，提出一個令人噴飯的即興應急辦法。（虛構舞台狀況，非真實故障）",
    "en": "Your key prop unexpectedly malfunctions with weird noises! Stay in character and improvise a hilarious workaround. (Fictional stage prop only).",
    "ja": "手元のキーアイテムが突然変な音を出して故障！既存キャラのまま、思わず笑える即興の代用策を1つ提案してください。（※架空の設定です）"
  },
  {
    "id": "card.theater-swap-view.label",
    "source": "視角大對調",
    "zh_TW": "視角大對調",
    "en": "Perspective Swap",
    "ja": "視点スイッチ"
  },
  {
    "id": "card.theater-swap-view.text",
    "source": "請維持自己的語調與人設，但改站在身邊夥伴的立場發聲，替對方提出一項顧慮。（此為同理扮演，不改變基本設定）",
    "zh_TW": "請維持自己的語調與人設，但改站在身邊夥伴的立場發聲，替對方提出一項顧慮。（此為同理扮演，不改變基本設定）",
    "en": "Keep your persona's tone, but speak from a peer's perspective to raise a concern for them. (Roleplay exercise; does not alter your persona).",
    "ja": "口調やキャラはそのままに、仲間の立場に立って相手の懸念点を1つ代弁してみてください。（※共感ロールプレイであり基本設定は不変です）"
  },
  {
    "id": "card.theater-countdown.label",
    "source": "三句倒數",
    "zh_TW": "三句倒數",
    "en": "Three-Line Timer",
    "ja": "3文カウントダウン"
  },
  {
    "id": "card.theater-countdown.text",
    "source": "警報響起，危機即將在倒數後爆發！請依照現有人設，嚴格在「恰好三句話」內完成警告與你的對策。（純虛構情境倒數）",
    "zh_TW": "警報響起，危機即將在倒數後爆發！請依照現有人設，嚴格在「恰好三句話」內完成警告與你的對策。（純虛構情境倒數）",
    "en": "An alarm is buzzing! Staying in persona, wrap up your warning and proposed reaction in strictly three sentences. (Fictional game timer only).",
    "ja": "アラーム発動！キャラ設定を崩さず、ちょうど「3文以内」で警告とあなたの次の一手を述べてください。（※劇中のカウントダウン演出です）"
  },
  {
    "id": "card.theater-hidden-cost.label",
    "source": "隱藏的代價",
    "zh_TW": "隱藏的代價",
    "en": "Hidden Cost",
    "ja": "隠された代償"
  },
  {
    "id": "card.theater-hidden-cost.text",
    "source": "剛才的成功其實伴隨著一個可愛又尷尬的副作用！維持人設，揭露這個代價並請大家幫忙善後。（虛構情節，切勿當作現實事實）",
    "zh_TW": "剛才的成功其實伴隨著一個可愛又尷尬的副作用！維持人設，揭露這個代價並請大家幫忙善後。（虛構情節，切勿當作現實事實）",
    "en": "That recent success came with a silly unexpected drawback! Stay in persona, reveal the drawback, and ask the group for help. (Fictional premise).",
    "ja": "さっきの成功には思わぬオチと代償が！キャラを維持したまま、その代償を明かして仲間にフォローを求めてね。（※フィクションの展開です）"
  },
  {
    "id": "card.theater-guest-star.label",
    "source": "神秘路人入場",
    "zh_TW": "神秘路人入場",
    "en": "Passerby Drops In",
    "ja": "謎の通りすがり"
  },
  {
    "id": "card.theater-guest-star.text",
    "source": "一位迷路的配角誤闖現場！依現有人設，向這位陌生路人打招呼並用一句話說明當前局勢。（虛構 NPC 登場，不變更主線人設）",
    "zh_TW": "一位迷路的配角誤闖現場！依現有人設，向這位陌生路人打招呼並用一句話說明當前局勢。（虛構 NPC 登場，不變更主線人設）",
    "en": "A confused bystander wanders onto the stage! Greet them in persona and explain the situation in a single sentence. (Fictional NPC interaction).",
    "ja": "道に迷った通りすがりが乱入！キャラ設定のまま、その人物に挨拶して現在の状況を1文でわかりやすく教えてあげて。（※架空の演出です）"
  },
  {
    "id": "card.discussion-reverse.label",
    "source": "極限反向設計",
    "zh_TW": "極限反向設計",
    "en": "Inverted Design",
    "ja": "逆転の発想"
  },
  {
    "id": "card.discussion-reverse.text",
    "source": "如果目標是「讓這個專案以最快速度搞砸」，我們會做什麼？請列出1點假設，並反推防禦解法，不直接下結論。",
    "zh_TW": "如果目標是「讓這個專案以最快速度搞砸」，我們會做什麼？請列出1點假設，並反推防禦解法，不直接下結論。",
    "en": "If the goal were to ruin this project as fast as possible, what would we do? State one assumption and invert it into a safeguard. Keep open-ended.",
    "ja": "もし「最短でこの企画を大失敗させる」としたら何をしますか？前提を1点明記して逆説的な防止策を導き出し、結論は開いたままにしてください。"
  },
  {
    "id": "card.discussion-devils-advocate.label",
    "source": "假想反方審查",
    "zh_TW": "假想反方審查",
    "en": "Devil's Advocate",
    "ja": "仮想ライバル審査"
  },
  {
    "id": "card.discussion-devils-advocate.text",
    "source": "假設你是挑剔的競爭對手，請標註「假設立場：反方」，點出目前方案最致命的1個漏洞，留待團隊探討。",
    "zh_TW": "假設你是挑剔的競爭對手，請標註「假設立場：反方」，點出目前方案最致命的1個漏洞，留待團隊探討。",
    "en": "Pretend you are a skeptical competitor. Label your note '[Assumption: Rival View]' and spotlight one critical weakness for the team to consider.",
    "ja": "「仮定：辛口な競合視点」と明記した上で、現行プランの最も痛い弱点を1つ指摘してください。即座に合意せず議論の余地を残しましょう。"
  },
  {
    "id": "card.discussion-mini-test.label",
    "source": "最小探路實驗",
    "zh_TW": "最小探路實驗",
    "en": "Micro-Experiment",
    "ja": "最小プローブ実験"
  },
  {
    "id": "card.discussion-mini-test.text",
    "source": "在資訊不足的情況下，能用半天完成的「最小探路實驗」是什麼？請標示假設與驗證指標，不預先宣布成敗。",
    "zh_TW": "在資訊不足的情況下，能用半天完成的「最小探路實驗」是什麼？請標示假設與驗證指標，不預先宣布成敗。",
    "en": "With limited data, what half-day micro-experiment could we run? Clearly state the assumption and success metric without prejudging the outcome.",
    "ja": "情報不足の今、半日で試せる「最小の探り実験」は何でしょう？仮定と検証指標を明示し、成否を断定せずに提案してください。"
  },
  {
    "id": "card.discussion-layman-pitch.label",
    "source": "說給外行聽",
    "zh_TW": "說給外行聽",
    "en": "Layman Pitch",
    "ja": "素人さん向け説明"
  },
  {
    "id": "card.discussion-layman-pitch.text",
    "source": "禁用所有術語！想像要解釋給十歲小孩或阿嬤聽，用超日常的比喻講述核心價值，結尾詢問大家聽懂了嗎。",
    "zh_TW": "禁用所有術語！想像要解釋給十歲小孩或阿嬤聽，用超日常的比喻講述核心價值，結尾詢問大家聽懂了嗎。",
    "en": "Banned: all technical jargon! Explain the core value to a 10-year-old using a vivid everyday analogy, ending with an open question for feedback.",
    "ja": "専門用語を全面禁止！10歳の子どもに教えるつもりで、身近な例えを使ってコアな価値を説明し、伝わったか皆に尋ねてみてください。"
  },
  {
    "id": "card.discussion-resource-cut.label",
    "source": "預算砍半限制",
    "zh_TW": "預算砍半限制",
    "en": "Resource Pinch",
    "ja": "リソース激減縛り"
  },
  {
    "id": "card.discussion-resource-cut.text",
    "source": "標示「假設情境：預算與時間砍半」。在此限制下，我們必須保留哪一項核心，捨棄什麼？提出選項供決策。",
    "zh_TW": "標示「假設情境：預算與時間砍半」。在此限制下，我們必須保留哪一項核心，捨棄什麼？提出選項供決策。",
    "en": "Tag as '[Hypothetical: 50% budget & time]'. Under this limit, which core piece must stay and what gets cut? Offer choices for decision.",
    "ja": "「仮定：予算と時間が半分に」と設定！この縛りの下で死守すべき核と、削るべきものを提示し、判断材料として共有してください。"
  },
  {
    "id": "card.discussion-reversible-loss.label",
    "source": "可逆失敗沙盤",
    "zh_TW": "可逆失敗沙盤",
    "en": "Reversible Failure",
    "ja": "可逆的失敗シミュ"
  },
  {
    "id": "card.discussion-reversible-loss.text",
    "source": "如果這步走錯了，代價容易復原嗎？請分析最壞後果與「單向門／雙向門」屬性，標示假設，不做最後宣判。",
    "zh_TW": "如果這步走錯了，代價容易復原嗎？請分析最壞後果與「單向門／雙向門」屬性，標示假設，不做最後宣判。",
    "en": "If this move fails, is it easy to undo? Analyze the worst-case fallout and two-way door traits, noting assumptions without closing the debate.",
    "ja": "もし失敗しても元に戻せる？最悪のシナリオと「引き返せるかどうか（両開きドア）」を仮定を添えて分析し、議論を開いておきましょう。"
  },
  {
    "id": "card.imposter-public-evidence.label",
    "source": "回顧發言證據",
    "zh_TW": "回顧發言證據",
    "en": "Statement Evidence",
    "ja": "発言ログ検証"
  },
  {
    "id": "card.imposter-public-evidence.text",
    "source": "請引用前面對話中的某句公開發言，指出它與當前目標吻合或矛盾之處。禁止指認身分，只專注文字客觀分析。",
    "zh_TW": "請引用前面對話中的某句公開發言，指出它與當前目標吻合或矛盾之處。禁止指認身分，只專注文字客觀分析。",
    "en": "Quote one public statement from the log and examine how it aligns or conflicts with our goal. Analyze the text objectively—no guessing roles.",
    "ja": "これまでの発言から1つ引用し、現在の目標と一致するか矛盾するかを検証して。身元当ては禁止、テキストの客観的事実だけに集中しましょう。"
  },
  {
    "id": "card.imposter-dual-interpretation.label",
    "source": "雙重角度解讀",
    "zh_TW": "雙重角度解讀",
    "en": "Dual Interpretation",
    "ja": "2通りの解釈"
  },
  {
    "id": "card.imposter-dual-interpretation.text",
    "source": "針對某個看似奇怪的提案，給出「善意出發點」與「潛在風險點」兩種不同解讀，讓大家客觀評估，切勿揣測動機。",
    "zh_TW": "針對某個看似奇怪的提案，給出「善意出發點」與「潛在風險點」兩種不同解讀，讓大家客觀評估，切勿揣測動機。",
    "en": "Take an unusual proposal and offer two interpretations: one charitable and one risk-aware. Allow the team to weigh both without suspecting motives.",
    "ja": "一見奇妙な提案に対し、「善意の意図」と「リスク要因」の2つの解釈を並べて提示して。動機を邪推せず、客観的に評価しましょう。"
  },
  {
    "id": "card.imposter-clarify-question.label",
    "source": "精準澄清發問",
    "zh_TW": "精準澄清發問",
    "en": "Targeted Clarification",
    "ja": "ピンポイント質問"
  },
  {
    "id": "card.imposter-clarify-question.text",
    "source": "請挑選一處定義模糊的發言，提出1個具體、非侵略性的澄清問題，協助釐清語意，嚴禁質問「你是不是內鬼」。",
    "zh_TW": "請挑選一處定義模糊的發言，提出1個具體、非侵略性的澄清問題，協助釐清語意，嚴禁質問「你是不是內鬼」。",
    "en": "Spot an ambiguous point and ask one constructive, non-hostile clarifying question to clear up meaning. Never ask if anyone is an imposter.",
    "ja": "曖昧な発言を1つ選び、真意を確かめる具体的で建設的な質問を1つ投げかけてみて。誰が怪しいかを問う質問は禁止です。"
  },
  {
    "id": "card.imposter-steel-man.label",
    "source": "最強善意辯護",
    "zh_TW": "最強善意辯護",
    "en": "Steelman Defense",
    "ja": "最強の弁護"
  },
  {
    "id": "card.imposter-steel-man.text",
    "source": "找出最容易被質疑的觀點，為它建立一個邏輯最嚴密、最合理的論證支持（Steelman），禁止討論成員隱藏身分。",
    "zh_TW": "找出最容易被質疑的觀點，為它建立一個邏輯最嚴密、最合理的論證支持（Steelman），禁止討論成員隱藏身分。",
    "en": "Find the most controversial idea and build the strongest possible logical defense (steelman) for it. Do not discuss any hidden player identities.",
    "ja": "一番ツッコミを受けそうな意見を拾い上げ、最も筋の通った強力な擁護論（スチールマン）を組み立てて。隠し設定の議論は禁止です。"
  },
  {
    "id": "card.imposter-premise-ranking.label",
    "source": "前提可靠度排序",
    "zh_TW": "前提可靠度排序",
    "en": "Premise Ranking",
    "ja": "前提の確度ランク"
  },
  {
    "id": "card.imposter-premise-ranking.text",
    "source": "列出剛才討論依賴的3個核心前提，依「已被驗證」到「純屬假設」排序，釐清論點根基，不探究是誰提出該前提。",
    "zh_TW": "列出剛才討論依賴的3個核心前提，依「已被驗證」到「純屬假設」排序，釐清論點根基，不探究是誰提出該前提。",
    "en": "List 3 underlying premises in the discussion, ranking them from 'verified' to 'pure assumption'. Clarify foundations without judging who made them.",
    "ja": "議論の土台になっている3つの前提を挙げ、「検証済み」から「単なる思い込み」順に並べてみて。誰の提案かは追及しないでね。"
  },
  {
    "id": "card.imposter-contrast-claims.label",
    "source": "前後說法對照",
    "zh_TW": "前後說法對照",
    "en": "Claim Comparison",
    "ja": "発言の前後対照"
  },
  {
    "id": "card.imposter-contrast-claims.text",
    "source": "將先前的某個建議與後來的修正對照，分析兩者在可行性上的客觀差異，嚴禁下定論或揣摩任何發言者的隱藏角色。",
    "zh_TW": "將先前的某個建議與後來的修正對照，分析兩者在可行性上的客觀差異，嚴禁下定論或揣摩任何發言者的隱藏角色。",
    "en": "Compare an earlier suggestion with a later revision, highlighting objective shifts in feasibility. Avoid labeling or guessing hidden roles.",
    "ja": "以前の提案と修正案を並べ、実現可能性の客観的な変化を分析して。誰かの隠しキャラを決めつけたり推測するのは禁止です。"
  },
  {
    "id": "background.circuit",
    "source": "背景電路",
    "zh_TW": "背景電路",
    "en": "Circuit Glow",
    "ja": "サイバー回路"
  },
  {
    "id": "background.motion",
    "source": "電流動畫",
    "zh_TW": "電流動畫",
    "en": "Pulse Sparks",
    "ja": "パルスアニメ"
  },
  {
    "id": "background.effects",
    "source": "背景效果",
    "zh_TW": "背景效果",
    "en": "Backdrop Effects",
    "ja": "背景エフェクト"
  },
  {
    "id": "locale.completion.0",
    "source": "確定",
    "zh_TW": "確定",
    "en": "Confirm",
    "ja": "確認"
  },
  {
    "id": "locale.completion.1",
    "source": "跟隨瀏覽器",
    "zh_TW": "跟隨瀏覽器",
    "en": "Follow browser",
    "ja": "ブラウザに合わせる"
  },
  {
    "id": "locale.completion.2",
    "source": "方案徽章：{p0}",
    "zh_TW": "方案徽章：{p0}",
    "en": "Plan badge: {p0}",
    "ja": "プランバッジ: {p0}"
  },
  {
    "id": "locale.easterInvite",
    "source": "恭喜解鎖🐑模式~\n\n覺得這個擴充功能好用嗎？\n歡迎訂閱作者的 YouTube 頻道、按讚並分享：\n{p0}\n\n要去看看嗎？ (被拖走)",
    "zh_TW": "恭喜解鎖🐑模式~\n\n覺得這個擴充功能好用嗎？\n歡迎訂閱作者的 YouTube 頻道、按讚並分享：\n{p0}\n\n要去看看嗎？ (被拖走)",
    "en": "Congrats on unlocking 🐑 Mode~\n\nEnjoying this extension?\nSubscribe to the creator's YouTube, like, and share:\n{p0}\n\nWant to check it out? (dragged away)",
    "ja": "🐑モード解放おめでとうございます~\n\nこの拡張機能を気に入っていただけましたか？\n作者のYouTubeチャンネル登録、高評価、シェアをお待ちしています：\n{p0}\n\n見に行ってみる？ (引きずられて退場)"
  },
  {
    "id": "roundZero.1",
    "source": "第 0 輪：分頁對話與你的補充",
    "zh_TW": "第 0 輪：分頁對話＋你的補充 ✨",
    "en": "Round 0: Tab Chat + Your Notes ✨",
    "ja": "ラウンド 0：タブの会話＋追加メモ ✨"
  },
  {
    "id": "roundZero.2",
    "source": "選擇既有分頁後，啟動時會收集該頁已載入的對話，和上方輸入一起分享給所有參與 AI。未指定時開啟新對話。",
    "zh_TW": "選好分頁後，啟動時會把已載入的對話與上方輸入打包，一起分享給 AI 夥伴！沒選就開啟新話題囉～",
    "en": "Select a tab and we'll bundle its loaded chat with your notes for all AI buddies! Leave unselected to start fresh.",
    "ja": "タブを選ぶと読み込み済みの会話と入力をまとめてAIたちに共有するよ！選ばないと新規スタート♪"
  },
  {
    "id": "roundZero.3",
    "source": "正在收集指定分頁的第 0 輪對話…",
    "zh_TW": "正在收集指定分頁的第 0 輪對話中，稍等一下下…",
    "en": "Gathering Round 0 chat from the selected tab, hang tight!…",
    "ja": "指定タブからラウンド 0 の会話を集め中…ちょっと待ってね！"
  },
  {
    "id": "roundZero.4",
    "source": "指定分頁讀取失敗，尚未送出新提示：{p0}",
    "zh_TW": "指定分頁讀取失敗，新提示尚未送出唷：{p0}",
    "en": "Couldn't read the selected tab; prompt not sent yet: {p0}",
    "ja": "指定タブの読み取りに失敗したため、プロンプトはまだ未送信です：{p0}"
  },
  {
    "id": "roundZero.5",
    "source": "第 0 輪內容超過 60,000 字元，請減少連線分頁或精簡原對話後再開始。",
    "zh_TW": "第 0 輪內容超過 60,000 字元囉！請精簡原對話或減少連線分頁後再出發～",
    "en": "Round 0 is over 60,000 characters! Please trim the chat or disconnect tabs before starting.",
    "ja": "ラウンド 0 が60,000文字を超えています！会話を整理するかタブを減らしてから再開してね。"
  },
  {
    "id": "roundZero.6",
    "source": "指定的對話分頁已失效，請重新選擇。",
    "zh_TW": "指定的對話分頁好像走丟了，請重新選擇一個吧！",
    "en": "The selected chat tab is no longer available, please pick another one!",
    "ja": "指定されたタブが見つからないみたい…もう一度選び直してね！"
  },
  {
    "id": "roundZero.7",
    "source": "指定分頁沒有已載入的對話，請輸入本次問題。",
    "zh_TW": "指定分頁還沒有載入的對話，直接輸入這次想問的問題吧！",
    "en": "No loaded chat found in this tab, feel free to type your question!",
    "ja": "指定タブに読み込み済みの会話がありません。今回の質問を入力してね！"
  },
  {
    "id": "roundZero.8",
    "source": "第 0 輪對話已收集，準備分享給參與 AI。",
    "zh_TW": "第 0 輪對話已打包完成！準備分享給 AI 夥伴們開聊囉 ✨",
    "en": "Round 0 chat is all gathered! Ready to share with the AI crew ✨",
    "ja": "ラウンド 0 の会話をまとめました！AIのみんなにシェアする準備完了だよ ✨"
  }
];
