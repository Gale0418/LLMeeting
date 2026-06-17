import { ENTITLEMENT_STORAGE_KEY } from "../shared/entitlements.js";

const CLICK_WINDOW_MS = 1800;

export function attachDevUnlock({ planBadge, renderMessage, loadState }) {
  if (!planBadge || !globalThis.chrome?.storage?.local) {
    return false;
  }

  let unlockClicks = 0;
  let resetTimer = 0;

  planBadge.addEventListener("click", async () => {
    unlockClicks += 1;
    globalThis.clearTimeout(resetTimer);
    resetTimer = globalThis.setTimeout(() => {
      unlockClicks = 0;
    }, CLICK_WINDOW_MS);

    if (unlockClicks >= 5) {
      unlockClicks = 0;
      globalThis.clearTimeout(resetTimer);

      const stored = await chrome.storage.local.get(ENTITLEMENT_STORAGE_KEY);
      const nextPlan = stored?.[ENTITLEMENT_STORAGE_KEY] === "pro" ? "free" : "pro";
      await chrome.storage.local.set({ [ENTITLEMENT_STORAGE_KEY]: nextPlan });
      
      if (nextPlan === "pro") {
        renderMessage?.(`作者模式：Pro 已啟用！歡迎訂閱作者頻道！`);
        const goToYT = globalThis.confirm("🎉 恭喜解鎖 PRO 模式！\n\n覺得這個擴充功能好用嗎？\n歡迎大家訂閱作者的 YouTube 頻道、按讚並分享喔！\n\n要去看看嗎？ (被拖走)");
        if (goToYT) {
          globalThis.open("https://www.youtube.com/@gale0418", "_blank");
        }
      } else {
        renderMessage?.(`作者模式：Free 已啟用`);
      }

      await loadState?.();
    }
  });

  return true;
}
