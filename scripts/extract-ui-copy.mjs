import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFiles = [
  ...fs.readdirSync(path.join(root, 'src/sidepanel'))
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => `src/sidepanel/${name}`),
  'src/background/service-worker.js',
];
const outputFile = path.join(root, 'output/ui-copy-inventory.json');
const HAN = /\p{Script=Han}/u;

function decodeJsString(raw) {
  // JSON handles the common escapes; single-quoted strings and JS-only escapes
  // are decoded with a small safe scanner instead of evaluating source code.
  let result = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch !== '\\') { result += ch; continue; }
    const next = raw[++i];
    if (next === undefined) break;
    const simple = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };
    if (Object.hasOwn(simple, next)) result += simple[next];
    else if (next === '\n') continue;
    else if (next === '\r') { if (raw[i + 1] === '\n') i += 1; }
    else if (next === 'x' && /^[\da-f]{2}$/i.test(raw.slice(i + 1, i + 3))) {
      result += String.fromCharCode(parseInt(raw.slice(i + 1, i + 3), 16)); i += 2;
    } else if (next === 'u' && raw[i + 1] === '{') {
      const end = raw.indexOf('}', i + 2);
      if (end >= 0) { result += String.fromCodePoint(parseInt(raw.slice(i + 2, end), 16)); i = end; }
      else result += next;
    } else if (next === 'u' && /^[\da-f]{4}$/i.test(raw.slice(i + 1, i + 5))) {
      result += String.fromCharCode(parseInt(raw.slice(i + 1, i + 5), 16)); i += 4;
    } else result += next;
  }
  return result;
}

function readQuoted(code, start, quote) {
  let i = start + 1;
  while (i < code.length) {
    if (code[i] === '\\') { i += 2; continue; }
    if (code[i] === quote) return { end: i + 1, value: decodeJsString(code.slice(start + 1, i)) };
    if (code[i] === '\n' && quote !== '`') break;
    i += 1;
  }
  return { end: Math.min(i + 1, code.length), value: '' };
}

function readTemplate(code, start) {
  let i = start + 1;
  let text = '';
  let hasInterpolation = false;
  let depth = 0;
  let inExpression = false;
  let expressionStart = -1;
  const expressions = [];
  let quote = '';
  let comment = '';
  let interpolationIndex = 0;
  while (i < code.length) {
    const ch = code[i];
    if (!inExpression) {
      if (ch === '\\') { text += code.slice(i, i + 2); i += 2; continue; }
      if (ch === '`') return { end: i + 1, value: decodeJsString(text), hasInterpolation, expressions };
      if (ch === '$' && code[i + 1] === '{') { hasInterpolation = true; text += `\u0000INT${interpolationIndex++}\u0000`; inExpression = true; depth = 1; expressionStart = i + 2; i += 2; continue; }
      text += ch; i += 1; continue;
    }
    if (comment === 'line') { if (ch === '\n') comment = ''; i += 1; continue; }
    if (comment === 'block') { if (ch === '*' && code[i + 1] === '/') { comment = ''; i += 2; } else i += 1; continue; }
    if (quote) {
      if (ch === '\\') i += 2;
      else { if (ch === quote) quote = ''; i += 1; }
      continue;
    }
    if (ch === '/' && code[i + 1] === '/') { comment = 'line'; i += 2; continue; }
    if (ch === '/' && code[i + 1] === '*') { comment = 'block'; i += 2; continue; }
    if (ch === '"' || ch === "'") { quote = ch; i += 1; continue; }
    if (ch === '`') { // Nested template: scan to its closing delimiter, including nested expressions.
      const nested = readTemplate(code, i); i = nested.end; continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}' && --depth === 0) { expressions.push(code.slice(expressionStart, i)); inExpression = false; }
    i += 1;
  }
  return { end: code.length, value: decodeJsString(text), hasInterpolation, expressions };
}

function scanJs(code, file, onTemplate, onHtmlString) {
  const found = [];
  let i = 0;
  let previous = '';
  let importStatement = false;
  let expressionCanStart = true;
  while (i < code.length) {
    const ch = code[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '/' && code[i + 1] === '/') { const end = code.indexOf('\n', i + 2); i = end < 0 ? code.length : end + 1; continue; }
    if (ch === '/' && code[i + 1] === '*') { const end = code.indexOf('*/', i + 2); i = end < 0 ? code.length : end + 2; continue; }
    if (ch === '/' && expressionCanStart) { // Skip regex literals, including escaped slashes and character classes.
      i += 1; let inClass = false;
      while (i < code.length) {
        if (code[i] === '\\') { i += 2; continue; }
        if (code[i] === '[') inClass = true;
        else if (code[i] === ']') inClass = false;
        else if (code[i] === '/' && !inClass) { i += 1; while (/[a-z]/i.test(code[i] || '')) i += 1; break; }
        if (code[i] === '\n') break;
        i += 1;
      }
      previous = 'regex'; expressionCanStart = false; continue;
    }
    if (ch === '"' || ch === "'") {
      const item = readQuoted(code, i, ch);
      if (HAN.test(item.value) && !importStatement) found.push({ value: item.value, kind: 'string', file, offset: i });
      if (onHtmlString && /<[a-z!/]/i.test(item.value)) onHtmlString(item.value, i);
      i = item.end; previous = 'literal'; expressionCanStart = false; continue;
    }
    if (ch === '`') {
      const item = readTemplate(code, i);
      if (HAN.test(item.value) && !importStatement) found.push({ value: item.value, kind: item.hasInterpolation ? 'template' : 'template', file, offset: i });
      if (onTemplate) onTemplate(item, i);
      i = item.end; previous = 'literal'; expressionCanStart = false; continue;
    }
    const ident = /^[\p{ID_Start}_$][\p{ID_Continue}$]*/u.exec(code.slice(i));
    if (ident) {
      const word = ident[0];
      if (word === 'import') importStatement = true;
      if (importStatement && word === 'from') { previous = word; i += word.length; continue; }
      if (importStatement && (word === 'const' || word === 'function' || word === 'class')) importStatement = false;
      previous = word;
      expressionCanStart = /^(return|throw|case|delete|void|typeof|instanceof|in|of|yield|await|new|else|do|extends|import|export)$/.test(word);
      i += word.length; continue;
    }
    if (ch === ';') importStatement = false;
    if (ch === '}' || ch === ')' || ch === ']' || /[\w$]/.test(ch)) expressionCanStart = false;
    else if (/[({[,:;=!?&|+*%~^<>-]/.test(ch)) expressionCanStart = true;
    previous = ch; i += 1;
  }
  return found;
}

function decodeHtml(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, entity) => {
    if (entity[0] === '#') return String.fromCodePoint(entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' })[entity.toLowerCase()] ?? all;
  });
}

function scanHtml(html, file) {
  const found = [];
  const attrPattern = /\b(title|placeholder|aria-label)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  for (const match of html.matchAll(attrPattern)) {
    const value = decodeHtml(match[2] ?? match[3] ?? '').trim();
    if (HAN.test(value)) found.push({ value, kind: match[1].toLowerCase(), file });
  }
  const blocks = [];
  const looseText = [];
  const blockTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'button', 'label', 'summary', 'option', 'title', 'legend', 'th', 'td', 'li', 'pre']);
  const token = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<[^>]*>|[^<]+/gi;
  let active = null;
  for (const match of html.matchAll(token)) {
    const part = match[0];
    if (part.startsWith('<!--') || /^<(script|style)\b/i.test(part)) continue;
    const tag = /^<\s*(\/?)\s*([\w-]+)/.exec(part);
    if (tag) {
      const closing = tag[1] === '/'; const name = tag[2].toLowerCase();
      if (closing && blockTags.has(name) && active?.tag === name) { blocks.push(active); active = null; }
      else if (!closing && blockTags.has(name)) { if (active) blocks.push(active); active = { tag: name, value: '' }; }
      continue;
    }
    if (active) active.value += part.replace(/\s+/g, ' ');
    else looseText.push(part.replace(/\s+/g, ' '));
  }
  if (active) blocks.push(active);
  for (const block of blocks) {
    const value = decodeHtml(block.value).trim();
    if (HAN.test(value)) found.push({ value, kind: `html:${block.tag}`, file });
  }
  for (const text of looseText) {
    const value = decodeHtml(text).trim();
    if (HAN.test(value)) found.push({ value, kind: 'html:text', file });
  }
  return found;
}

function scanHtmlLeaves(html, file) {
  const found = [];
  const tokens = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<[^>]*>|[^<]+/gi;
  const suppressed = [];
  for (const match of html.matchAll(tokens)) {
    const part = match[0];
    if (part.startsWith('<!--') || /^<(script|style)\b/i.test(part)) continue;
    const tag = /^<\s*(\/?)\s*([\w-]+)/.exec(part);
    if (tag) {
      const closing = tag[1] === '/'; const name = tag[2].toLowerCase();
      if (closing) { if (suppressed.at(-1) === name) suppressed.pop(); }
      else if (!suppressed.length && (name === 'textarea' || /\bclass\s*=\s*["'][^"']*\b(?:bubble-content|bubble-meta)\b[^"']*["']/i.test(part))) suppressed.push(name);
      continue;
    }
    if (suppressed.length) continue;
    const value = decodeHtml(part).trim();
    if (HAN.test(value)) found.push({ value, kind: 'html:text', file });
  }
  return found;
}

function templateSource(value, kind) {
  let source = value.replace(/\u0000INT(\d+)\u0000/g, '{p$1}');
  if (!/<[a-z!/]/i.test(source)) return source;
  // Template literals that build HTML are copy sources too. Keep rendered text,
  // drop tags/attributes, and omit slots whose content is user/AI or diagnostics.
  const tokens = /<!--[\s\S]*?-->|<[^>]*>|[^<]+/g;
  const suppressed = [];
  const chunks = [];
  for (const match of source.matchAll(tokens)) {
    const part = match[0];
    if (part.startsWith('<!--')) continue;
    const tag = /^<\s*(\/?)\s*([\w-]+)/.exec(part);
    if (tag) {
      const closing = tag[1] === '/'; const name = tag[2].toLowerCase();
      if (closing) { if (suppressed.at(-1) === name) suppressed.pop(); }
      else if (/\bclass\s*=\s*["'][^"']*(?:bubble-content|bubble-meta|diagnostic|fault-details)[^"']*["']/i.test(part) || ['script', 'style', 'pre', 'textarea'].includes(name)) suppressed.push(name);
      continue;
    }
    if (!suppressed.length) chunks.push(part.replace(/\s+/g, ' '));
  }
  return chunks.join('').replace(/\s+/g, ' ').trim();
}

function templateMarkup(value) {
  return value.replace(/\u0000INT(\d+)\u0000/g, '{p$1}');
}

function catalogKeyCounts(source) {
  const counts = {};
  const localeBlocks = [...source.matchAll(/^  (zh_TW|en|ja): \{$/gm)];
  for (let i = 0; i < localeBlocks.length; i += 1) {
    const locale = localeBlocks[i][1];
    const start = localeBlocks[i].index + localeBlocks[i][0].length;
    const end = localeBlocks[i + 1]?.index ?? source.length;
    counts[locale] = [...source.slice(start, end).matchAll(/^\s+"[^"]+":\s/gm)].length;
  }
  return counts;
}

function readUiTextLiteralCalls(code, file) {
  const found = [];
  let i = 0;
  let expressionCanStart = true;
  while (i < code.length) {
    const ch = code[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '/' && code[i + 1] === '/') { const end = code.indexOf('\n', i + 2); i = end < 0 ? code.length : end + 1; continue; }
    if (ch === '/' && code[i + 1] === '*') { const end = code.indexOf('*/', i + 2); i = end < 0 ? code.length : end + 2; continue; }
    if (ch === '/' && expressionCanStart) {
      i += 1; let inClass = false;
      while (i < code.length) {
        if (code[i] === '\\') { i += 2; continue; }
        if (code[i] === '[') inClass = true;
        else if (code[i] === ']') inClass = false;
        else if (code[i] === '/' && !inClass) { i += 1; while (/[a-z]/i.test(code[i] || '')) i += 1; break; }
        if (code[i] === '\n') break;
        i += 1;
      }
      expressionCanStart = false; continue;
    }
    if (ch === '"' || ch === "'") { const token = readQuoted(code, i, ch); i = token.end; expressionCanStart = false; continue; }
    if (ch === '`') {
      const literal = readTemplate(code, i);
      for (const expression of literal.expressions) found.push(...readUiTextLiteralCalls(expression, file));
      i = literal.end; expressionCanStart = false; continue;
    }
    const ident = /^[\p{ID_Start}_$][\p{ID_Continue}$]*/u.exec(code.slice(i));
    if (ident) {
      const word = ident[0];
      if (word === 'uiText') {
        let arg = i + word.length;
        while (/\s/.test(code[arg] || '')) arg += 1;
        if (code[arg] === '(') {
          arg += 1; while (/\s/.test(code[arg] || '')) arg += 1;
          const quote = code[arg];
          if (quote === '"' || quote === "'" || quote === '`') {
            const literal = quote === '`' ? readTemplate(code, arg) : readQuoted(code, arg, quote);
            const source = templateSource(literal.value, quote === '`' ? 'template' : 'string').trim();
            if (source && HAN.test(source) && !/^\{p\d+\}$/.test(source)) found.push({ source, kind: quote === '`' ? 'template' : 'string', file });
            if (quote === '`') for (const expression of literal.expressions) found.push(...readUiTextLiteralCalls(expression, file));
          }
        }
      }
      i += word.length; expressionCanStart = /^(return|throw|case|delete|void|typeof|instanceof|in|of|yield|await|new|else|do|extends|import|export)$/.test(word); continue;
    }
    if (ch === '}' || ch === ')' || ch === ']') expressionCanStart = false;
    else if (/[({[,:;=!?&|+*%~^<>-]/.test(ch)) expressionCanStart = true;
    i += 1;
  }
  return found;
}

if (process.argv.includes('--gaps')) {
  const catalogPath = path.join(root, 'src/shared/ui-copy-catalog.js');
  const catalogText = fs.readFileSync(catalogPath, 'utf8');
  const catalogSourceLiterals = [...catalogText.matchAll(/"source"\s*:\s*("(?:\\.|[^"\\])*")/g)];
  const catalogSources = new Set(catalogSourceLiterals.flatMap((match) => {
    try { const value = JSON.parse(match[1]); return value ? [value] : []; } catch { return []; }
  }));
  const candidates = [];
  const appFile = 'src/sidepanel/app.js';
  const appCode = fs.readFileSync(path.join(root, appFile), 'utf8');
  candidates.push(...readUiTextLiteralCalls(appCode, appFile));
  const collectHtml = (markup) => {
    if (/<[a-z!/]/i.test(markup)) candidates.push(...scanHtmlLeaves(markup, appFile));
  };
  const collectTemplate = (item) => {
    const markup = templateMarkup(item.value);
    collectHtml(markup);
    for (const expression of item.expressions) {
      candidates.push(...readUiTextLiteralCalls(expression, appFile));
      scanJs(expression, appFile, collectTemplate, collectHtml);
    }
  };
  scanJs(appCode, appFile, collectTemplate, collectHtml);
  const htmlFile = 'src/sidepanel/index.html';
  const staticHtml = fs.readFileSync(path.join(root, htmlFile), 'utf8');
  candidates.push(...scanHtmlLeaves(staticHtml, htmlFile));
  for (const match of staticHtml.matchAll(/\baria-valuetext\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const source = decodeHtml(match[1] ?? match[2] ?? '').trim();
    if (source && HAN.test(source)) candidates.push({ source, kind: 'html:aria-valuetext', file: htmlFile });
  }
  const seen = new Set();
  const entries = [];
  for (const candidate of candidates) {
    const source = candidate.source ?? templateSource(candidate.value, candidate.kind).trim();
    if (!source || !HAN.test(source) || /^\{p\d+\}$/.test(source) || /<[^>]*>/.test(source) || ['語言', '繁體中文', '日本語'].includes(source) || catalogSources.has(source) || seen.has(source)) continue;
    seen.add(source);
    const params = [...source.matchAll(/\{(p\d+)\}/g)].map((match) => match[1]);
    entries.push({ id: `gap.copy.${String(entries.length + 1).padStart(3, '0')}`, source,
      kind: candidate.kind ?? 'html:text', ...(params.length ? { params } : {}), file: candidate.file ?? appFile });
  }
  const result = {
    generatedAt: new Date().toISOString(),
    summary: { catalogSourceEntries: catalogSourceLiterals.length, nonEmptyCatalogSources: catalogSources.size, candidateOccurrences: candidates.length, uncoveredUniqueSources: entries.length },
    coverage: {
      includes: 'app.js uiText() direct literal/template arguments, per-text-node copy from HTML template literals, and static index.html leaf text nodes.',
      excludes: 'HTML comments, script/style, textarea contents, bubble-content/bubble-meta descendants, blank/pure-parameter/tag-only text, and sources already present in UI_COPY.',
      limitation: 'Lexical extraction is heuristic and does not prove every candidate is user-visible. Dynamic concatenation beyond literal template segments may be incomplete; catalog source count is a reference, not a completeness guarantee.',
    },
    entries,
  };
  fs.mkdirSync(path.join(root, 'output'), { recursive: true });
  fs.writeFileSync(path.join(root, 'output/ui-copy-render-gaps.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result.summary, null, 2));
  process.exit(0);
}

if (process.argv.includes('--extra')) {
  const priorPath = path.join(root, 'output/ui-copy-inventory.json');
  const prior = JSON.parse(fs.readFileSync(priorPath, 'utf8'));
  const covered = new Set(prior.entries.map((entry) => entry.source));
  const htmlFile = 'src/sidepanel/index.html';
  const html = fs.readFileSync(path.join(root, htmlFile), 'utf8');
  const sharedFiles = ['src/shared/meetingRecovery.js', 'src/shared/entitlements.js'];
  const sharedCopies = sharedFiles.flatMap((file) => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    return scanJs(source, file).filter((item) => {
      if (file !== 'src/shared/meetingRecovery.js') return true;
      const lineStart = source.lastIndexOf('\n', item.offset) + 1;
      const lineEnd = source.indexOf('\n', item.offset);
      return /throw\s+new\s+Error\s*\(/.test(source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd));
    });
  });
  const additions = [
    ...scanHtmlLeaves(html, htmlFile),
    ...sharedCopies,
  ];
  const groupedExtra = new Map();
  for (const item of additions) {
    const source = templateSource(item.value, item.kind).trim();
    if (!source || !HAN.test(source) || covered.has(source)) continue;
    const entry = groupedExtra.get(source) ?? { source, kind: item.kind, files: new Set(), occurrences: 0 };
    entry.files.add(item.file); entry.occurrences += 1; groupedExtra.set(source, entry);
  }
  const entries = [...groupedExtra.values()].sort((a, b) => a.source.localeCompare(b.source, 'zh-Hant') || a.kind.localeCompare(b.kind))
    .map((entry, index) => {
      const params = [...entry.source.matchAll(/\{(p\d+)\}/g)].map((match) => match[1]);
      return { id: `extra.copy.${String(index + 1).padStart(3, '0')}`, source: entry.source, kind: entry.kind,
        ...(params.length ? { params } : {}), file: [...entry.files].sort(), occurrences: entry.occurrences };
    });
  const extra = {
    generatedAt: new Date().toISOString(),
    summary: { comparedAgainstInventoryEntries: prior.entries.length, candidateOccurrences: additions.length, deduplicatedExtraEntries: entries.length },
    coverage: {
      method: 'Static lexical scan plus HTML leaf text-node extraction; application code is never executed.',
      includes: 'Han-containing trimmed HTML text nodes outside textarea, script, style, and comments; throw-message literals from meetingRecovery.js; Han-containing UI labels/fallbacks from entitlements.js.',
      excludes: 'Text nodes represented verbatim by ui-copy-inventory.json, HTML attributes, textarea values (including persona defaults), comments, regex literals, and import strings.',
      limitation: 'HTML leaf tokens preserve runtime node boundaries and may split prose across adjacent nodes. Meeting recovery is limited to literal throw messages so LLM prompt templates and dynamic user/AI content stay out of the copy inventory.',
    },
    entries,
  };
  const extraPath = path.join(root, 'output/ui-copy-leaf-extra.json');
  fs.writeFileSync(extraPath, `${JSON.stringify(extra, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(extra.summary, null, 2));
  process.exit(0);
}

const jsCopies = sourceFiles.flatMap((file) => scanJs(fs.readFileSync(path.join(root, file), 'utf8'), file));
const htmlFile = 'src/sidepanel/index.html';
const htmlCopies = scanHtml(fs.readFileSync(path.join(root, htmlFile), 'utf8'), htmlFile);
const rawCopies = [...jsCopies, ...htmlCopies];
const grouped = new Map();
for (const item of rawCopies) {
  const source = templateSource(item.value, item.kind);
  const key = `${item.kind}\0${source}`;
  const group = grouped.get(key) ?? { source, kind: item.kind, files: new Set(), count: 0 };
  group.files.add(item.file); group.count += 1; grouped.set(key, group);
}
const entries = [...grouped.values()].sort((a, b) => a.source.localeCompare(b.source, 'zh-Hant') || a.kind.localeCompare(b.kind))
  .map((entry, index) => {
    const params = [...entry.source.matchAll(/\{(p\d+)\}/g)].map((match) => match[1]);
    return { id: `ui.copy.${String(index + 1).padStart(3, '0')}`, source: entry.source, kind: entry.kind,
      ...(params.length ? { params } : {}), file: [...entry.files].sort(), occurrences: entry.count };
  });
const catalogPath = path.join(root, 'src/shared/i18n-catalog.js');
const catalogSource = fs.existsSync(catalogPath) ? fs.readFileSync(catalogPath, 'utf8') : '';
const catalogCounts = catalogSource ? catalogKeyCounts(catalogSource) : {};
const zhBlockStart = catalogSource.indexOf('  zh_TW: {');
const firstOtherLocale = catalogSource.indexOf('\n  en: {', zhBlockStart);
const zhBlock = zhBlockStart >= 0 ? catalogSource.slice(zhBlockStart, firstOtherLocale >= 0 ? firstOtherLocale : undefined) : '';
const catalogValues = new Set([...zhBlock.matchAll(/^\s+"[^"]+":\s*("(?:\\.|[^"\\])*"|`[^`]*`)/gm)]
  .map((match) => { try { return match[1][0] === '"' ? JSON.parse(match[1]) : match[1].slice(1, -1); } catch { return ''; } }));
const unrepresented = entries.filter((entry) => !catalogValues.has(entry.source)).length;
const inventory = {
  generatedAt: new Date().toISOString(),
  summary: {
    jsFiles: sourceFiles,
    htmlFiles: [htmlFile],
    scannedChineseLiterals: rawCopies.length,
    deduplicatedEntries: entries.length,
    catalogKeysByLocale: catalogCounts,
    catalogKeyCount: catalogCounts.zh_TW ?? null,
    inventoryEntriesNotFoundVerbatimInCatalogZhTW: unrepresented,
  },
  coverage: {
    method: 'Static lexical scan; application code is never executed.',
    includes: 'Han-containing JS quoted strings/templates plus HTML static block text and title/placeholder/aria-label attributes.',
    excludes: 'JS comments and regex literals, static import strings, HTML comments/scripts/styles, and text without Han characters.',
    limitations: 'Lexical scanning cannot determine whether a literal is visible UI copy or an internal prompt/error payload. Dynamically assembled text is not reconstructed; only literal text in template segments is inventoried. HTML block grouping follows a small tag list and is not a full HTML parser.',
  },
  entries,
};
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(inventory.summary, null, 2));
