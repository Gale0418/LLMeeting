import { ENTITLEMENT_STORAGE_KEY } from "../shared/entitlements.js";

const CLICK_WINDOW_MS = 1800;
const AUTHOR_YOUTUBE_URL = "https://www.youtube.com/@gale0418";

export const THIRD_CLICK_TAUNTS = Object.freeze([
  "你還真的繼續按嗎？",
  "都說沒用了，怎麼就是不信呢？",
  "這不是電梯，多按不會比較快。",
  "你的好奇心正在消耗滑鼠壽命。",
  "第三次了，理智還在線嗎？",
  "我有說沒用，你偏要做壓力測試。",
  "你是在測按鈕，還是在測我的耐心？",
  "這麼執著，該不會真期待彩蛋吧？",
  "好啦，什麼都沒發生，真的喔。",
  "再按下去也不會有驚喜……大概。",
]);

export function attachDevUnlock({
  planBadge,
  renderMessage,
  loadState,
  storage = globalThis.chrome?.storage?.local,
  dialogs = { alert: globalThis.alert, confirm: globalThis.confirm },
  openPage = globalThis.open,
  random = Math.random,
  timers = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout },
  getDisplayedPlan = () => planBadge?.textContent,
}) {
  if (!planBadge || !storage) {
    return false;
  }

  let unlockClicks = 0;
  let resetTimer = 0;

  planBadge.addEventListener("click", async () => {
    unlockClicks += 1;
    timers.clearTimeout(resetTimer);

    const displayedPlan = String(getDisplayedPlan?.() || "free").trim().toLowerCase();
    if (displayedPlan !== "pro" && unlockClicks === 1) {
      dialogs.alert?.("想做什麼呢！按再多次都沒用的唷");
    } else if (displayedPlan !== "pro" && unlockClicks === 3) {
      const index = Math.min(THIRD_CLICK_TAUNTS.length - 1, Math.floor(random() * THIRD_CLICK_TAUNTS.length));
      dialogs.alert?.(THIRD_CLICK_TAUNTS[index]);
    }

    if (unlockClicks >= 5) {
      unlockClicks = 0;
      timers.clearTimeout(resetTimer);

      const stored = await storage.get(ENTITLEMENT_STORAGE_KEY);
      const nextPlan = stored?.[ENTITLEMENT_STORAGE_KEY] === "pro" ? "free" : "pro";
      await storage.set({ [ENTITLEMENT_STORAGE_KEY]: nextPlan });

      if (nextPlan === "pro") {
        renderMessage?.(`作者模式：Pro 已啟用！歡迎訂閱作者頻道！`);
        const goToYT = dialogs.confirm?.(`恭喜解鎖 PRO 模式！\n\n覺得這個擴充功能好用嗎？\n歡迎訂閱作者的 YouTube 頻道、按讚並分享：\n${AUTHOR_YOUTUBE_URL}\n\n要去看看嗎？ (被拖走)`);
        if (goToYT) {
          openPage?.(AUTHOR_YOUTUBE_URL, "_blank");
        }
      } else {
        renderMessage?.(`作者模式：Free 已啟用`);
      }

      await loadState?.();
      return;
    }

    resetTimer = timers.setTimeout(() => {
      unlockClicks = 0;
    }, CLICK_WINDOW_MS);
  });

  return true;
}
