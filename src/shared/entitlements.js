import { DEFAULT_ACTIVE_PROVIDER_IDS } from "./providers.js";

export const ENTITLEMENT_STORAGE_KEY = "aiDebate.entitlementPlan";

const FEATURE_LABELS = {
  basicDebate: "基礎辯論",
  fastDebate: "快速鬪技場",
  summaryDebate: "總結辯論",
  history: "歷史紀錄",
  export: "匯出",
};

const PLAN_FEATURES = {
  free: {
    basicDebate: true,
    fastDebate: false,
    summaryDebate: false,
    history: false,
    export: false,
  },
  pro: {
    basicDebate: true,
    fastDebate: true,
    summaryDebate: true,
    history: true,
    export: true,
  },
};

export function normalizePlan(plan) {
  return plan === "pro" ? "pro" : "free";
}

export function entitlementsForPlan(plan = "free") {
  const normalizedPlan = normalizePlan(plan);
  return {
    plan: normalizedPlan,
    isPro: normalizedPlan === "pro",
    includedProviders: [...DEFAULT_ACTIVE_PROVIDER_IDS],
    features: { ...PLAN_FEATURES[normalizedPlan] },
  };
}

export function canUseFeature(entitlements, featureId) {
  return Boolean(entitlements?.features?.[featureId]);
}

export function featureLabel(featureId) {
  return FEATURE_LABELS[featureId] || featureId;
}

export function proRequiredMessage(featureId) {
  return `${featureLabel(featureId)} 是 Pro 功能；目前先保留入口，之後接授權後開放。`;
}
