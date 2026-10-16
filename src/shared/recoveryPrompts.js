import { isProviderId } from "./providers.js";

// Full originals only. Never silently truncate a prompt and present it as reusable.
export const MAX_RECOVERY_PROMPT_CHARS = 600000;
const phaseKey = value => value === "critique-1" ? "critique" : value;
const validPhase = value => /^(first-round|critique(?:-\d+)?|summary|source-summary|reveal)$/.test(value || "");

export function boundRecoveryPrompts(records = {}) {
  const result = {};
  let used = 0;
  for (const [provider, entry] of Object.entries(records || {}).reverse()) {
    if (!isProviderId(provider) || !entry || !validPhase(entry.phase)) continue;
    const phase = phaseKey(entry.phase);
    if (typeof entry.prompt === "string" && entry.prompt.trim() && used + entry.prompt.length <= MAX_RECOVERY_PROMPT_CHARS) {
      result[provider] = { phase, prompt: entry.prompt };
      used += entry.prompt.length;
    } else result[provider] = { phase, unavailable: true };
  }
  return Object.fromEntries(Object.entries(result).reverse());
}

export function rememberRecoveryPrompt(records, job) {
  const next = { ...records };
  delete next[job.provider];
  next[job.provider] = { phase: phaseKey(job.phase), prompt: job.prompt };
  return boundRecoveryPrompts(next);
}

export function forgetRecoveryPrompt(records, provider, phase) {
  const next = { ...records };
  if (next[provider]?.phase === phaseKey(phase)) delete next[provider];
  return next;
}

export function originalRecoveryPrompt(state, provider, phase) {
  if (!isProviderId(provider)) return null;
  const entry = state?.recoveryPrompts?.[provider];
  return entry?.phase === phaseKey(phase) && typeof entry.prompt === "string" ? entry.prompt : null;
}
