import { ENTITLEMENT_STORAGE_KEY } from "../shared/entitlements.js";

const CLICK_WINDOW_MS = 1800;
const AUTHOR_YOUTUBE_URL = "https://www.youtube.com/@gale0418";
const ATTACHED_KEY = "__llmeetingDevUnlockAttached";
const ATTACHED_ATTR = "data-llmeeting-dev-unlock-attached";
const UNLOCK_STEPS = Object.freeze(["free🐑", "fre🐑", "fr🐑", "f🐑", "🐑"]);

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
  tabs = globalThis.chrome?.tabs,
  dialogs = {
    alert: (msg) => globalThis.alert?.(msg),
    confirm: (msg) => globalThis.confirm?.(msg),
  },
  openPage = globalThis.open,
  random = Math.random,
  timers = {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id),
  },
  getDisplayedPlan = () => planBadge?.textContent,
}) {
  if (!planBadge || !storage) {
    return false;
  }
  if (planBadge[ATTACHED_KEY] || planBadge.getAttribute?.(ATTACHED_ATTR) === "true" || planBadge.hasAttribute?.(ATTACHED_ATTR)) {
    return true;
  }
  planBadge[ATTACHED_KEY] = true;
  try {
    planBadge.setAttribute?.(ATTACHED_ATTR, "true");
  } catch (_error) {
    // Plain test doubles and unusual DOM wrappers may not allow attributes.
  }

  let unlockClicks = 0;
  let resetTimer = 0;
  let isTogglingPlan = false;

  const updateBadge = (text, isUnlocked = false) => {
    planBadge.textContent = text;
    planBadge.className = "plan-badge " + (isUnlocked ? "is-pro" : "is-free");
    planBadge.setAttribute?.("aria-label", isUnlocked ? "🐑模式，已解鎖" : "方案徽章：" + text);
  };

  const handleUnlockAttempt = async () => {
    if (isTogglingPlan || String(getDisplayedPlan?.() || "").trim() === "🐑") {
      return;
    }

    unlockClicks += 1;
    timers.clearTimeout(resetTimer);

    const displayedPlan = String(getDisplayedPlan?.() || "free").trim().toLowerCase();
    updateBadge(UNLOCK_STEPS[Math.min(unlockClicks - 1, UNLOCK_STEPS.length - 1)]);

    if (displayedPlan !== "pro" && unlockClicks === 1) {
      dialogs.alert?.("想做什麼呢！按再多次都沒用的唷");
    } else if (displayedPlan !== "pro" && unlockClicks === 3) {
      const index = Math.min(THIRD_CLICK_TAUNTS.length - 1, Math.floor(random() * THIRD_CLICK_TAUNTS.length));
      dialogs.alert?.(THIRD_CLICK_TAUNTS[index]);
    }

    if (unlockClicks >= 5) {
      if (isTogglingPlan) {
        return;
      }
      isTogglingPlan = true;
      unlockClicks = 0;
      timers.clearTimeout(resetTimer);

      try {
        const stored = await storage.get(ENTITLEMENT_STORAGE_KEY);
        if (stored?.[ENTITLEMENT_STORAGE_KEY] === "pro") {
          updateBadge("🐑", true);
          return;
        }

        await storage.set({ [ENTITLEMENT_STORAGE_KEY]: "pro" });
        updateBadge("🐑", true);
        renderMessage?.("作者模式：🐑已啟用！歡迎大家訂閱分享按讚((被拖走");

        const message = "恭喜解鎖🐑模式~\n\n覺得這個擴充功能好用嗎？\n歡迎訂閱作者的 YouTube 頻道、按讚並分享：\n" +
          AUTHOR_YOUTUBE_URL + "\n\n要去看看嗎？ (被拖走)";
        if (dialogs.confirm?.(message)) {
          try {
            if (tabs?.create) {
              tabs.create({ url: AUTHOR_YOUTUBE_URL });
            } else {
              openPage?.(AUTHOR_YOUTUBE_URL, "_blank");
            }
          } catch (error) {
            console.error(error);
          }
        }

        await loadState?.();
      } catch (error) {
        console.error(error);
        updateBadge("Free");
      } finally {
        isTogglingPlan = false;
      }
      return;
    }

    resetTimer = timers.setTimeout(() => {
      unlockClicks = 0;
      if (String(getDisplayedPlan?.() || "").trim() !== "🐑") {
        updateBadge("Free");
      }
    }, CLICK_WINDOW_MS);
  };

  planBadge.addEventListener("click", handleUnlockAttempt);
  planBadge.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault?.();
      void handleUnlockAttempt();
    }
  });

  return true;
}
