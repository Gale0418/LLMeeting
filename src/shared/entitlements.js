import { PROVIDER_IDS } from "./providers.js";

export const ENTITLEMENT_STORAGE_KEY = "aiDebate.entitlementPlan";
export const SHEEP_MODE_STORAGE_KEY = "aiDebate.sheepMode.v1";

const FEATURE_LABELS = {
  basicDebate: "基礎辯論",
  fastDebate: "快速鬥技場",
  summaryDebate: "總結辯論",
  observerChair: "圍觀主席制",
  anonymousReview: "匿名評論制",
  allAnonymous: "全員匿名",
  chatMode: "自由群聊與劇場模式",
  history: "歷史紀錄",
  export: "匯出",
};

const AVAILABLE_FEATURES = {
  basicDebate: true,
  fastDebate: true,
  summaryDebate: true,
  observerChair: true,
  anonymousReview: true,
  allAnonymous: true,
  chatMode: true,
  history: true,
  export: true,
};

export function normalizePlan(plan) {
  return plan === "pro" ? "pro" : "free";
}

export function entitlementsForPlan(plan = "free", sheepMode = plan === "pro") {
  const normalizedPlan = normalizePlan(plan);
  return {
    plan: normalizedPlan,
    isPro: normalizedPlan === "pro",
    sheepMode: sheepMode === true,
    includedProviders: [...PROVIDER_IDS],
    features: { ...AVAILABLE_FEATURES },
  };
}

export function canUseFeature(entitlements, featureId) {
  return Boolean(entitlements?.features?.[featureId]);
}

export function featureLabel(featureId) {
  return FEATURE_LABELS[featureId] || featureId || "這項功能";
}

export function proRequiredMessage(featureId) {
  return `${featureLabel(featureId)} 目前無法使用，請重新開啟側邊欄。`;
}
