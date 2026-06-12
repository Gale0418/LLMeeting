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
      renderMessage?.(`作者模式：${nextPlan === "pro" ? "Pro 已啟用" : "Free 已啟用"}`);
      await loadState?.();
    }
  });

  return true;
}
