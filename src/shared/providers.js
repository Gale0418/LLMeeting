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
];

export const PROVIDER_IDS = PROVIDERS.map((provider) => provider.id);

export function providerLabel(providerId) {
  const provider = PROVIDERS.find((item) => item.id === providerId);
  return provider?.label || providerId;
}

export function otherProviders(providerId) {
  return PROVIDERS.filter((provider) => provider.id !== providerId);
}
