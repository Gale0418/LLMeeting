import { isInteractiveDebateMode } from "./modeRules.js";

const THEATER_IDEAS = [
  { id: "odd-rule", label: "加一條怪規則", text: "下一輪多一條怪規則：每個方案都必須讓一隻貓願意採用。請維持原本人設，說明這條規則會怎麼改變你的主張，不要只加上貓的名字。" },
  { id: "reverse", label: "替對手辯護", text: "下一輪先替你最不認同的觀點提出一個有力理由，再用原本人設回應。請引用剛才的一個具體觀點，不要只說大家都很有道理。" },
  { id: "story", label: "三句接龍", text: "把目前討論接成下一幕：各自用三句話，以原本人設接續前面的內容，帶入一個新障礙，留下能讓我決定的選擇。不要替我決定結局。" },
];
const DISCUSSION_IDEAS = [
  { id: "constraint", label: "加一個限制", text: "加一個限制：原本可用的時間只剩一半。請各自重新調整方案，保留最重要的一步，並說明你犧牲了什麼。" },
  { id: "counterexample", label: "找一個反例", text: "請各自找出目前最有共識的方案可能失敗的一個具體情境，再提出一個可測試的修正。沒有資料支持時請標示為假設。" },
  { id: "next-step", label: "給我下一步", text: "請各自提出一個現在就能開始的小實驗：要做什麼、觀察什麼，以及出現什麼結果時應該改變主張。先不要結案。" },
];
const IMPOSTER_IDEAS = [
  { id: "evidence", label: "追問矛盾", text: "請各自引用目前發言中的一個具體矛盾，提出需要對方澄清的問題。先討論證據，不猜身分。" },
  { id: "boundary", label: "試探邊界", text: "請各自提出一個能測試目前主張是否前後一致的假設情境，並回答自己的情境。不要求任何人揭露隱藏設定。" },
  { id: "defense", label: "換個角度辯護", text: "請先用最合理的方式解釋剛才最可疑的一句話，再指出這個解釋還缺什麼證據。先不要公布內鬼身分。" },
];

export function playIdeas(mode, interactionStyle) {
  if (!isInteractiveDebateMode(mode)) return [];
  const ideas = interactionStyle === "imposter" ? IMPOSTER_IDEAS
    : mode === "theater" ? THEATER_IDEAS : DISCUSSION_IDEAS;
  return ideas.map((idea) => ({ ...idea }));
}

export function canUsePlayIdeas(state, pending = false) {
  return !pending && !state?.busy && state?.phase === "waiting_for_user"
    && isInteractiveDebateMode(state.mode);
}

export function appendPlayIdea(draft, text) {
  if (!text || draft.trimEnd().endsWith(text)) return draft;
  return draft.trim() ? `${draft}\n\n${text}` : text;
}
