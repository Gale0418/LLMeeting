export const STORE_URL = "https://chromewebstore.google.com/detail/llmeeting/cjombmcmgifhanenolhaeepbpnlchjdp";

export const STARTER_QUESTIONS = [
  {id: "decision", label: "比較方案", prompt: "我每週有五小時做個人專案。該先做完整功能，還是小型原型？請比較取捨、指出各自風險，並提出一週內可驗證的做法。"},
  {id: "writing", label: "找創作方向", prompt: "我想寫一篇介紹日常小發現的短文。請提出三種不同切入角度、各自適合的讀者與一個開頭範例，並指出哪些角度可能流於老套。"},
  {id: "review", label: "找計畫盲點", prompt: "我打算用一週做一個簡單的待辦工具，先加入新增、完成與刪除功能。請找出計畫中的假設與風險，區分需要先驗證的事，並提出最小測試。"},
];

// Examples only fill an empty draft. They never launch a meeting or replace text.
export function attachStarterQuestions({container, input, translate, isBlocked, onDraftChange}) {
  function render() {
    container.hidden = Boolean(isBlocked() || input.value.trim());
    for (const button of container.querySelectorAll("[data-starter]")) {
      const question = STARTER_QUESTIONS.find(item => item.id === button.dataset.starter);
      if (question) button.textContent = translate(question.label);
    }
  }
  container.addEventListener("click", event => {
    const button = event.target.closest("[data-starter]");
    if (!button || !container.contains(button) || isBlocked() || input.value.trim()) return;
    const question = STARTER_QUESTIONS.find(item => item.id === button.dataset.starter);
    if (!question) return;
    input.value = translate(question.prompt);
    onDraftChange?.();
    render();
    input.focus();
  });
  input.addEventListener("input", render);
  render();
  return {render};
}

const RECOMMENDATION = "我在試用 LLMeeting：把同一題交給已登入的不同 AI，集中比較回答、互評與分歧。功能免費，AI 帳號和額度另計；共識不保證正確。商店版本與候選版可能不同，安裝前請確認。";

// This module has no meeting state input: shared text cannot include the transcript.
export function attachRecommendation({button, field, status, translate, clipboard}) {
  let pending = false;
  function render() {
    field.value = `${translate(RECOMMENDATION)}\n${STORE_URL}`;
    button.classList?.remove("is-copied");
    button.textContent = translate("複製推薦文字");
    status.textContent = "";
  }
  async function copy() {
    if (pending) return;
    pending = true;
    button.disabled = true;
    button.classList?.remove("is-copied");
    const text = field.value;
    try {
      if (typeof clipboard?.writeText !== "function") throw new Error("Clipboard unavailable");
      await clipboard.writeText(text);
      button.classList?.add("is-copied");
      status.textContent = translate("推薦文字已複製，可以貼給朋友囉。");
    } catch {
      field.focus();
      field.select();
      status.textContent = translate("無法自動複製；文字已選取，請用複製快捷鍵。");
    } finally {
      pending = false;
      button.disabled = false;
    }
  }
  button.addEventListener("click", copy);
  render();
  return {render, copy};
}
