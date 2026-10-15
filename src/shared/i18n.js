import { DEFAULT_LOCALE, SUPPORTED_LOCALES, t } from "./i18n-catalog.js";
import { UI_COPY } from "./ui-copy-catalog.js";

export { t };

export let currentLocale = DEFAULT_LOCALE;

const ATTRIBUTE_WHITELIST = new Set(["title", "aria-label", "aria-valuetext", "placeholder"]);
const staticSources = new WeakMap();
// Only these slots contain program-owned UI labels. Never recursively translate
// arbitrary parameters: they can be AI replies, nicknames, URLs or raw faults.
const LOCALIZED_UI_SLOTS = new Map([
  ["{p0} · {p1} · 手動補回覆", ["{p1}"]],
  ["{p0}：等待{p1}", ["{p1}"]],
  ["{p0}：{p1}送出中", ["{p1}"]],
  ["{p0}：評析其他 AI", ["{p0}"]],
  ["{p0}：{p1}送出交叉互評", ["{p0}", "{p1}"]],
  ["{p0}：交叉評析 {p1} ⚡", ["{p0}"]],
  ["{p0}互評:", ["{p0}"]],
]);

/** Resolve the small set of locale names accepted by the UI runtime. */
export function normalizeLocale(locale) {
  return resolveSupportedLocale(locale) || DEFAULT_LOCALE;
}

export function resolveSupportedLocale(locale) {
  if (typeof locale !== "string") return null;
  const normalized = locale.trim().replaceAll("_", "-").toLowerCase();
  const match = /^(en|ja|zh)(?:-[a-z0-9]{2,8})*$/.exec(normalized);
  return match ? (match[1] === "zh" ? "zh_TW" : match[1]) : null;
}

export function setLocale(locale) {
  currentLocale = normalizeLocale(locale);
  return currentLocale;
}

function compileTemplate(entry, template, locale, kind) {
  const text = String(template ?? "");
  const pieces = [];
  const tokenPattern = /\{p\d+\}/g;
  let cursor = 0;
  let match;
  let fixedLength = 0;

  while ((match = tokenPattern.exec(text))) {
    const literal = text.slice(cursor, match.index);
    pieces.push({ literal });
    fixedLength += literal.length;
    pieces.push({ token: match[0] });
    cursor = match.index + match[0].length;
  }
  const tail = text.slice(cursor);
  pieces.push({ literal: tail });
  fixedLength += tail.length;

  const tokens = pieces.filter((piece) => piece.token).map((piece) => piece.token);
  const pattern = pieces.map((piece) => piece.token ? "([\\s\\S]*?)" : escapeRegExp(piece.literal)).join("");
  return {
    entry,
    text,
    locale,
    kind,
    tokens,
    fixedLength,
    dynamic: tokens.length > 0,
    matcher: tokens.length ? new RegExp(`^${pattern}$`) : null,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function substitute(template, values) {
  return template.replace(/\{p\d+\}/g, (token) => values.has(token) ? values.get(token) : token);
}

/** Build a translator from UI-only entries, useful for isolated tests and small catalogs. */
export function createTextTranslator(entries = []) {
  const sourceExact = new Map();
  const sourcePatterns = [];
  const reverseExact = new Map();
  const reversePatterns = [];
  const seenSources = new Set();

  const addReverseExact = (text, compiled) => {
    let candidates = reverseExact.get(text);
    if (!candidates) reverseExact.set(text, candidates = new Set());
    candidates.add(compiled.entry);
  };

  for (const entry of entries) {
    const source = compileTemplate(entry, entry?.source, null, "source");
    if (!source.text || seenSources.has(source.text)) continue;
    seenSources.add(source.text);
    if (source.dynamic) sourcePatterns.push(source);
    else if (!sourceExact.has(source.text)) sourceExact.set(source.text, source);

    for (const locale of SUPPORTED_LOCALES) {
      const localizedText = entry?.[locale];
      if (typeof localizedText !== "string") continue;
      const localized = compileTemplate(entry, localizedText, locale, "localized");
      if (localized.dynamic) reversePatterns.push(localized);
      else addReverseExact(localized.text, localized);
    }
  }
  const bySpecificity = (a, b) => b.fixedLength - a.fixedLength || b.text.length - a.text.length;
  sourcePatterns.sort(bySpecificity);
  reversePatterns.sort(bySpecificity);

  function matchTemplate(compiled, input) {
    const match = compiled.matcher?.exec(input);
    if (!match) return null;
    const values = new Map(compiled.tokens.map((token, index) => [token, match[index + 1]]));
    // This inner phase template must not consume an enclosing waiting status
    // as its round label, especially when Japanese reorders the placeholders.
    if (compiled.entry.source === "{p0}：評析其他 AI"
      && !/^(?:互評|第\s+\d+(?:\/\d+)?\s+輪互評|Review|Round\s+\d+(?:\/\d+)?\s+Review|レビュー|相互レビュー|第\s+\d+(?:\/\d+)?\s+ラウンド相互レビュー)$/.test(values.get("{p0}") || "")) return null;
    return { entry: compiled.entry, values };
  }

  function resolve(raw) {
    if (typeof raw !== "string") return null;
    const leading = raw.match(/^\s*/u)?.[0] ?? "";
    const trailing = raw.match(/\s*$/u)?.[0] ?? "";
    const trimmed = raw.slice(leading.length, raw.length - trailing.length || undefined);
    if (!trimmed) return null;

    const exactSource = sourceExact.get(raw);
    if (exactSource) return { entry: exactSource.entry, values: new Map(), sourceText: raw, leading: "", trailing: "" };
    const trimmedSource = sourceExact.get(trimmed);
    if (trimmedSource) return { entry: trimmedSource.entry, values: new Map(), sourceText: `${leading}${trimmed}${trailing}`, leading, trailing };

    const exactCandidates = reverseExact.get(trimmed);
    if (exactCandidates?.size === 1) {
      const entry = exactCandidates.values().next().value;
      return { entry, values: new Map(), sourceText: `${leading}${entry.source}${trailing}`, leading, trailing };
    }
    if (exactCandidates?.size > 1) return null;

    const matches = [];
    let bestSpecificity = -1;
    // Prefer explicit localized labels over generic source templates. Then
    // compare both template directions by specificity so a {p0}-only source
    // cannot swallow an already-translated sentence during a locale switch.
    for (const compiled of sourcePatterns) {
      if (compiled.fixedLength < bestSpecificity) break;
      const rawResult = matchTemplate(compiled, raw);
      const result = rawResult || matchTemplate(compiled, trimmed);
      if (!result) continue;
      if (compiled.fixedLength > bestSpecificity) {
        bestSpecificity = compiled.fixedLength;
        matches.length = 0;
      }
      matches.push({...result, template: compiled, sourceText: rawResult ? raw : `${leading}${substitute(compiled.text, result.values)}${trailing}`,
        leading: rawResult ? "" : leading, trailing: rawResult ? "" : trailing});
    }
    for (const compiled of reversePatterns) {
      if (compiled.fixedLength < bestSpecificity) break;
      const result = matchTemplate(compiled, trimmed);
      if (!result) continue;
      if (compiled.fixedLength > bestSpecificity) {
        bestSpecificity = compiled.fixedLength;
        matches.length = 0;
      }
      matches.push({ ...result, template: compiled, sourceText: `${leading}${substitute(compiled.entry.source, result.values)}${trailing}`, leading, trailing });
    }
    if (!matches.length) return null;
    const entriesMatched = new Set(matches.map((candidate) => candidate.entry));
    if (entriesMatched.size !== 1) return null;
    const { entry, values, sourceText, leading: matchLeading, trailing: matchTrailing } = matches[0];
    return { entry, values, sourceText, leading: matchLeading, trailing: matchTrailing };
  }

  function translateUiText(raw, locale = currentLocale, depth = 0) {
    if (typeof raw !== "string") return raw;
    if (depth > 4) return raw;
    const match = resolve(raw);
    if (!match) return raw;
    const template = match.entry?.[normalizeLocale(locale)];
    const values = new Map(match.values);
    for (const token of LOCALIZED_UI_SLOTS.get(match.entry.source) || []) {
      if (values.has(token)) values.set(token, translateUiText(values.get(token), locale, depth + 1));
    }
    return typeof template === "string" ? `${match.leading ?? ""}${substitute(template, values)}${match.trailing ?? ""}` : raw;
  }

  const resolveUiSource = (raw, depth = 0) => {
    if (depth > 4) return raw;
    const match = resolve(raw);
    if (!match) return raw;
    const values = new Map(match.values);
    for (const token of LOCALIZED_UI_SLOTS.get(match.entry.source) || []) {
      if (values.has(token)) values.set(token, resolveUiSource(values.get(token), depth + 1));
    }
    return `${match.leading ?? ""}${substitute(match.entry.source, values)}${match.trailing ?? ""}`;
  };
  translateUiText.resolveSource = resolveUiSource;
  return translateUiText;
}

export const uiText = createTextTranslator(UI_COPY);

function isElement(node) {
  return node?.nodeType === 1;
}

function hasClass(node, className) {
  return isElement(node) && (node.classList?.contains(className)
    || (` ${node.getAttribute?.("class") ?? ""} `).includes(` ${className} `));
}

function hasRecoveryDetailsAncestor(node) {
  let current = isElement(node) ? node : node?.parentElement;
  while (current) {
    if (current.tagName?.toLowerCase() === "details") {
      if (hasClass(current, "reply-recovery")) return true;
      let ancestor = current.parentElement;
      while (ancestor) {
        if (hasClass(ancestor, "reply-recovery")) return true;
        ancestor = ancestor.parentElement;
      }
    }
    current = current.parentElement;
  }
  return false;
}

function isInsideBubbleContent(node) {
  let current = isElement(node) ? node : node?.parentElement;
  let inBubbleContent = false;
  let inLoadingDots = false;
  while (current) {
    if (hasClass(current, "loading-dots")) inLoadingDots = true;
    if (hasClass(current, "bubble-content")) inBubbleContent = true;
    current = current.parentElement;
  }
  return inBubbleContent && !inLoadingDots;
}

function isExcludedTextNode(node) {
  let current = isElement(node) ? node : node?.parentElement;
  while (current) {
    const tag = current.tagName?.toLowerCase();
    if (tag === "pre" || tag === "script" || tag === "style" || tag === "textarea" || tag === "input" || hasClass(current, "bubble-meta")) return true;
    if (tag === "p" && hasRecoveryDetailsAncestor(current)) return true;
    current = current.parentElement;
  }
  return isInsideBubbleContent(node);
}

function isExcludedAttribute(element) {
  const tag = element?.tagName?.toLowerCase();
  if (tag === "pre" || tag === "script" || tag === "style" || hasClass(element, "bubble-meta")) return true;
  if (tag === "p" && hasRecoveryDetailsAncestor(element)) return true;
  return isInsideBubbleContent(element);
}

function childrenOf(node) {
  return Array.from(node?.childNodes ?? []);
}

function walkElementsAndText(root, visitText, visitElement) {
  const visit = (node) => {
    if (isElement(node)) visitElement(node);
    else if (node?.nodeType === 3) visitText(node);
    for (const child of childrenOf(node)) visit(child);
  };
  visit(root);
}

function translateMarkupTree(root, translate, rememberOriginals = false) {
  walkElementsAndText(root, (textNode) => {
    if (isExcludedTextNode(textNode)) return;
    const record = rememberOriginals ? staticSources.get(textNode) : null;
    const source = record && textNode.nodeValue === record.lastRendered
      ? record.source
      : (translate.resolveSource?.(textNode.nodeValue) ?? textNode.nodeValue);
    const rendered = translate(source);
    if (rememberOriginals) staticSources.set(textNode, { source, lastRendered: rendered });
    textNode.nodeValue = rendered;
  }, (element) => {
    if (isExcludedAttribute(element)) return;
    for (const attribute of Array.from(element.attributes ?? [])) {
      const name = attribute.name.toLowerCase();
      if (!ATTRIBUTE_WHITELIST.has(name)) continue;
      const key = `${name}`;
      let records = rememberOriginals ? staticSources.get(element) : null;
      if (rememberOriginals && !records) staticSources.set(element, records = new Map());
      const record = records?.get(key);
      const source = record && attribute.value === record.lastRendered
        ? record.source
        : (translate.resolveSource?.(attribute.value) ?? attribute.value);
      const rendered = translate(source);
      if (rememberOriginals) records.set(key, { source, lastRendered: rendered });
      element.setAttribute(attribute.name, rendered);
    }
  });
}

/** Translate only catalog-matched UI strings in an HTML fragment using a template parser. */
export function translateUiMarkup(html, documentObject = globalThis.document) {
  if (!documentObject?.createElement) return String(html ?? "");
  const template = documentObject.createElement("template");
  template.innerHTML = String(html ?? "");
  translateMarkupTree(template.content, (source) => uiText(source));
  return template.innerHTML;
}

/** Re-apply the selected locale to an existing static UI tree without touching form values. */
export function applyStaticLocale(root, translate = uiText) {
  if (!root) return root;
  const translateWithSource = (source) => translate(source);
  if (typeof translate.resolveSource === "function") translateWithSource.resolveSource = (value) => translate.resolveSource(value);
  translateMarkupTree(root, translateWithSource, true);
  return root;
}
