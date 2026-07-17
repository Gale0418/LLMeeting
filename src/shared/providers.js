export const PROVIDERS = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    startUrl: "https://chatgpt.com/",
    matchPatterns: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
  },
  {
    id: "gemini",
    label: "Gemini",
    startUrl: "https://gemini.google.com/",
    matchPatterns: ["https://gemini.google.com/*"],
  },
  {
    id: "grok",
    label: "Grok",
    startUrl: "https://grok.com/",
    matchPatterns: ["https://grok.com/*", "https://x.com/i/grok*"],
  },
  {
    id: "claude",
    label: "Claude",
    startUrl: "https://claude.ai/",
    matchPatterns: ["https://claude.ai/*"],
  },
  {
    id: "meta",
    label: "Meta AI",
    startUrl: "https://www.meta.ai/",
    matchPatterns: ["https://www.meta.ai/*", "https://meta.ai/*"],
    beta: true,
  },
];

export const PROVIDER_IDS = PROVIDERS.map((provider) => provider.id);
export const DEFAULT_ACTIVE_PROVIDER_IDS = ["chatgpt", "gemini", "grok", "claude"];

export function providerById(providerId) {
  return PROVIDERS.find((item) => item.id === providerId) || null;
}

export function isProviderId(providerId) {
  return Boolean(providerById(providerId));
}

export function providerLabel(providerId) {
  const provider = providerById(providerId);
  return provider?.label || providerId;
}

export function otherProviders(providerId) {
  return PROVIDERS.filter((provider) => provider.id !== providerId);
}

export function normalizeProviderIds(providerIds, fallback = DEFAULT_ACTIVE_PROVIDER_IDS) {
  if (!Array.isArray(providerIds)) {
    return [...fallback];
  }

  const normalized = [];
  for (const providerId of providerIds) {
    if (isProviderId(providerId) && !normalized.includes(providerId)) {
      normalized.push(providerId);
    }
  }

  return normalized.length ? normalized : [...fallback];
}
