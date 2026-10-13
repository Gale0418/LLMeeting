/* Three-language source copy authored by Antigravity; presentation uses uiText. */
const CARDS = [
  {
    "id": "theater-stage-shift",
    "category": "theater",
    "label": "舞台劇變",
    "text": "突然遭遇地震或場景翻轉！請依目前人設，用1句話說明你如何適應這片全新地形並繼續行動。（此為虛構設定，不影響客觀事實）"
  },
  {
    "id": "theater-prop-glitch",
    "category": "theater",
    "label": "道具大當機",
    "text": "你手中的關鍵道具突然失靈或發出怪聲！保持原本人設，提出一個令人噴飯的即興應急辦法。（虛構舞台狀況，非真實故障）"
  },
  {
    "id": "theater-swap-view",
    "category": "theater",
    "label": "視角大對調",
    "text": "請維持自己的語調與人設，但改站在身邊夥伴的立場發聲，替對方提出一項顧慮。（此為同理扮演，不改變基本設定）"
  },
  {
    "id": "theater-countdown",
    "category": "theater",
    "label": "三句倒數",
    "text": "警報響起，危機即將在倒數後爆發！請依照現有人設，嚴格在「恰好三句話」內完成警告與你的對策。（純虛構情境倒數）"
  },
  {
    "id": "theater-hidden-cost",
    "category": "theater",
    "label": "隱藏的代價",
    "text": "剛才的成功其實伴隨著一個可愛又尷尬的副作用！維持人設，揭露這個代價並請大家幫忙善後。（虛構情節，切勿當作現實事實）"
  },
  {
    "id": "theater-guest-star",
    "category": "theater",
    "label": "神秘路人入場",
    "text": "一位迷路的配角誤闖現場！依現有人設，向這位陌生路人打招呼並用一句話說明當前局勢。（虛構 NPC 登場，不變更主線人設）"
  },
  {
    "id": "discussion-reverse",
    "category": "discussion",
    "label": "極限反向設計",
    "text": "如果目標是「讓這個專案以最快速度搞砸」，我們會做什麼？請列出1點假設，並反推防禦解法，不直接下結論。"
  },
  {
    "id": "discussion-devils-advocate",
    "category": "discussion",
    "label": "假想反方審查",
    "text": "假設你是挑剔的競爭對手，請標註「假設立場：反方」，點出目前方案最致命的1個漏洞，留待團隊探討。"
  },
  {
    "id": "discussion-mini-test",
    "category": "discussion",
    "label": "最小探路實驗",
    "text": "在資訊不足的情況下，能用半天完成的「最小探路實驗」是什麼？請標示假設與驗證指標，不預先宣布成敗。"
  },
  {
    "id": "discussion-layman-pitch",
    "category": "discussion",
    "label": "說給外行聽",
    "text": "禁用所有術語！想像要解釋給十歲小孩或阿嬤聽，用超日常的比喻講述核心價值，結尾詢問大家聽懂了嗎。"
  },
  {
    "id": "discussion-resource-cut",
    "category": "discussion",
    "label": "預算砍半限制",
    "text": "標示「假設情境：預算與時間砍半」。在此限制下，我們必須保留哪一項核心，捨棄什麼？提出選項供決策。"
  },
  {
    "id": "discussion-reversible-loss",
    "category": "discussion",
    "label": "可逆失敗沙盤",
    "text": "如果這步走錯了，代價容易復原嗎？請分析最壞後果與「單向門／雙向門」屬性，標示假設，不做最後宣判。"
  },
  {
    "id": "imposter-public-evidence",
    "category": "imposter",
    "label": "回顧發言證據",
    "text": "請引用前面對話中的某句公開發言，指出它與當前目標吻合或矛盾之處。禁止指認身分，只專注文字客觀分析。"
  },
  {
    "id": "imposter-dual-interpretation",
    "category": "imposter",
    "label": "雙重角度解讀",
    "text": "針對某個看似奇怪的提案，給出「善意出發點」與「潛在風險點」兩種不同解讀，讓大家客觀評估，切勿揣測動機。"
  },
  {
    "id": "imposter-clarify-question",
    "category": "imposter",
    "label": "精準澄清發問",
    "text": "請挑選一處定義模糊的發言，提出1個具體、非侵略性的澄清問題，協助釐清語意，嚴禁質問「你是不是內鬼」。"
  },
  {
    "id": "imposter-steel-man",
    "category": "imposter",
    "label": "最強善意辯護",
    "text": "找出最容易被質疑的觀點，為它建立一個邏輯最嚴密、最合理的論證支持（Steelman），禁止討論成員隱藏身分。"
  },
  {
    "id": "imposter-premise-ranking",
    "category": "imposter",
    "label": "前提可靠度排序",
    "text": "列出剛才討論依賴的3個核心前提，依「已被驗證」到「純屬假設」排序，釐清論點根基，不探究是誰提出該前提。"
  },
  {
    "id": "imposter-contrast-claims",
    "category": "imposter",
    "label": "前後說法對照",
    "text": "將先前的某個建議與後來的修正對照，分析兩者在可行性上的客觀差異，嚴禁下定論或揣摩任何發言者的隱藏角色。"
  }
];

export function extraChallenges(category) {
  return CARDS.filter(card => card.category === category).map(card => ({...card}));
}

