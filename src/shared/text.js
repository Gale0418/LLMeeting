export const DEFAULT_SAFE_CHAR_LIMIT = 12000;
export const DEFAULT_PROMPT_CONTEXT_LIMIT = 32000;
export const MIN_CONTEXT_BLOCK_LIMIT = 800;

export function normalizeText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

export function clipText(value, maxChars = DEFAULT_SAFE_CHAR_LIMIT) {
  const text = normalizeText(value);
  if (text.length <= maxChars) {
    return text;
  }

  const notice = "\n\n[已截斷：原文 " + text.length + " 字元]";
  if (maxChars <= notice.length) {
    return notice.slice(0, Math.max(0, maxChars));
  }
  return text.slice(0, maxChars - notice.length) + notice;
}

export function contextBlockCharLimit(
  blockCount,
  {
    totalChars = DEFAULT_PROMPT_CONTEXT_LIMIT,
    maxChars = DEFAULT_SAFE_CHAR_LIMIT,
    minChars = MIN_CONTEXT_BLOCK_LIMIT,
  } = {},
) {
  const normalizedCount = Number.isInteger(blockCount) && blockCount > 0 ? blockCount : 1;
  const normalizedTotal = Number.isFinite(totalChars)
    ? Math.max(0, Math.floor(totalChars))
    : DEFAULT_PROMPT_CONTEXT_LIMIT;
  const normalizedMax = Number.isFinite(maxChars)
    ? Math.max(0, Math.floor(maxChars))
    : DEFAULT_SAFE_CHAR_LIMIT;
  const fairShare = Math.floor(normalizedTotal / normalizedCount);

  // minChars 是偏好值；大量區塊時讓硬性總預算優先，避免 blockCount * limit 超額。
  return Math.min(normalizedMax, fairShare);
}

export function formatSpeakerBlock(speaker, content, options = {}) {
  const maxChars = options.maxChars ?? DEFAULT_SAFE_CHAR_LIMIT;
  return String(speaker) + ":\n" + clipText(content, maxChars);
}
