export const DEFAULT_SAFE_CHAR_LIMIT = 12000;

export function normalizeText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

export function clipText(value, maxChars = DEFAULT_SAFE_CHAR_LIMIT) {
  const text = normalizeText(value);
  if (text.length <= maxChars) {
    return text;
  }

  const notice = `\n\n[已截斷：原文 ${text.length} 字元]`;
  if (maxChars <= notice.length) {
    return notice.slice(0, Math.max(0, maxChars));
  }
  return `${text.slice(0, maxChars - notice.length)}${notice}`;
}

export function formatSpeakerBlock(speaker, content, options = {}) {
  const maxChars = options.maxChars ?? DEFAULT_SAFE_CHAR_LIMIT;
  return `${speaker}:\n${clipText(content, maxChars)}`;
}
