import { originalRecoveryPrompt } from "../shared/recoveryPrompts.js";

export function restoreOriginalPromptFields(container, state) {
  for (const button of container?.querySelectorAll?.("[data-copy-prompt-provider]") || []) {
    const prompt = originalRecoveryPrompt(state, button.dataset.copyPromptProvider, button.dataset.copyPromptPhase);
    const field = button.closest(".recovery-prompt")?.querySelector("textarea");
    // HTML parsers remove an initial newline in TEXTAREA; assign the exact value after rendering.
    if (field && prompt !== null && field.value !== prompt) field.value = prompt;
  }
}

export function recoveryPromptControls(state, provider, phase, { translate, escape }) {
  const prompt = originalRecoveryPrompt(state, provider, phase);
  if (!prompt) return `<p class="settings-note">${translate(state.recoveryPrompts?.[provider]?.unavailable
    ? "原提示過大，未保存完整副本，請勿使用不完整內容重送。" : "這段原提示未保存，無法完整還原。")}</p>`;
  return `<div class="recovery-prompt"><button type="button" class="secondary-action" data-copy-prompt-provider="${escape(provider)}" data-copy-prompt-phase="${escape(phase)}">${translate("複製原提示")}</button>
    <p class="settings-note">${translate("先確認原分頁沒有已完成的回答，避免重複送出。")}</p>
    <details><summary>${translate("查看原提示")}</summary><p class="settings-note">${translate("這份提示包含本輪對話內容，只會在你按下複製時寫入剪貼簿。")}</p>
    <textarea class="original-prompt" readonly data-i18n-skip rows="6">\n${escape(prompt)}</textarea></details>
    <p class="settings-note" data-copy-prompt-status role="status"></p></div>`;
}

export async function copyOriginalPrompt(button, state, { clipboard, translate }) {
  const prompt = originalRecoveryPrompt(state, button.dataset.copyPromptProvider, button.dataset.copyPromptPhase);
  const root = button.closest(".recovery-prompt");
  if (!root || !prompt) return;
  try {
    await clipboard.writeText(prompt);
    if (root.isConnected !== false) root.querySelector("[data-copy-prompt-status]").textContent = translate("原提示已複製");
  } catch {
    if (root.isConnected === false) return;
    root.querySelector("details").open = true;
    const input = root.querySelector("textarea");
    input.focus(); input.select();
    root.querySelector("[data-copy-prompt-status]").textContent = translate("無法自動複製，請在下方選取原提示後手動複製。");
  }
}
