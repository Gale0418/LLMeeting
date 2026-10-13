import test from "node:test";
import assert from "node:assert/strict";

import {
  applyStaticLocale,
  createTextTranslator,
  currentLocale,
  normalizeLocale,
  setLocale,
  translateUiMarkup,
  uiText,
} from "../src/shared/i18n.js";
import { DEFAULT_LOCALE, MESSAGES, SUPPORTED_LOCALES } from "../src/shared/i18n-catalog.js";
import { UI_COPY } from "../src/shared/ui-copy-catalog.js";

test("production UI catalog is complete in three languages with unchanged dynamic parameters", () => {
  assert.equal(UI_COPY.length, 515);
  assert.equal(uiText("背景電路", "en"), "Circuit Glow");
  assert.equal(uiText("電流動畫", "ja"), "パルスアニメ");
  assert.equal(new Set(UI_COPY.map(e=>e.id)).size, UI_COPY.length);
  for (const entry of UI_COPY) for (const locale of SUPPORTED_LOCALES) {
    assert.equal(typeof entry[locale], "string", `${entry.id}/${locale}`);
    assert.deepEqual(placeholders(entry[locale]), placeholders(entry.source), `${entry.id}/${locale}`);
  }
  assert.equal(uiText("貼上 AI 回覆", "en"), "Paste AI reply");
  assert.notEqual(uiText("讓 AI 離席", "ja"), "讓 AI 離席");
  assert.equal(uiText("任意使用者私人內容", "en"), "任意使用者私人內容");
});

test("duplicate source entries do not make existing translations ambiguous when switching locales", () => {
  const entry = {source: "狀態", zh_TW: "狀態", en: "Status", ja: "状態"};
  const translate = createTextTranslator([entry, {...entry}]);
  assert.equal(translate("Status", "ja"), "状態");
  const leading = createTextTranslator([{source: " 等待 {p0}", zh_TW: " 等待 {p0}", en: " Waiting {p0}", ja: " 待機 {p0}"}]);
  assert.equal(leading(" 等待 Claude", "en"), " Waiting Claude");
});

function placeholders(value) {
  return [...String(value).matchAll(/\{[^{}]+\}/g)].map(([token]) => token).sort();
}

function text(value, parent = null) {
  return { nodeType: 3, nodeValue: value, parentElement: parent, childNodes: [] };
}

function element(tagName, className = "", children = [], attrs = {}) {
  const node = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    parentElement: null,
    childNodes: children,
    attributes: [],
    classList: { contains: (name) => className.split(/\s+/).includes(name) },
    getAttribute(name) { return attrs[name] ?? (name === "class" ? className : null); },
    setAttribute(name, value) {
      const existing = this.attributes.find((attribute) => attribute.name === name);
      if (existing) existing.value = String(value);
      else this.attributes.push({ name, value: String(value) });
    },
  };
  for (const [name, value] of Object.entries(attrs)) node.attributes.push({ name, value });
  for (const child of children) child.parentElement = node;
  return node;
}

test("key catalog has the same complete key and placeholder set in all three locales", () => {
  assert.deepEqual(SUPPORTED_LOCALES, ["zh_TW", "en", "ja"]);
  const locales = Object.keys(MESSAGES);
  const baselineKeys = Object.keys(MESSAGES[locales[0]]).sort();
  assert.equal(baselineKeys.length, 106);
  for (const locale of SUPPORTED_LOCALES) {
    assert.deepEqual(Object.keys(MESSAGES[locale]).sort(), baselineKeys);
    for (const key of baselineKeys) {
      assert.deepEqual(placeholders(MESSAGES[locale][key]), placeholders(MESSAGES[DEFAULT_LOCALE][key]), `${locale}.${key}`);
    }
  }
});

test("locale normalization accepts supported script and region aliases and defaults unsupported values", () => {
  assert.equal(currentLocale, DEFAULT_LOCALE);
  assert.equal(normalizeLocale("zh-TW"), "zh_TW");
  assert.equal(normalizeLocale("zh-Hant"), "zh_TW");
  assert.equal(normalizeLocale("JA"), "ja");
  assert.equal(normalizeLocale("en-US"), DEFAULT_LOCALE);
  assert.equal(normalizeLocale("fr"), DEFAULT_LOCALE);
  assert.equal(setLocale("ja"), "ja");
  assert.equal(setLocale("unknown"), DEFAULT_LOCALE);
});

test("UI translator matches exact and anchored dynamic sources and keeps unknown text unchanged", () => {
  const translate = createTextTranslator([
    { source: "Continue: {p0}!", zh_TW: "接續：{p0}！", en: "Continue: {p0}!", ja: "続行：{p0}！" },
    { source: "Room {p0} closed at {p1}.", zh_TW: "房間 {p0} 已於 {p1} 關閉。", en: "Room {p0} closed at {p1}.", ja: "ルーム {p0} は {p1} に終了しました。" },
    { source: "Provider {p0} at {p1}", zh_TW: "{p1} 時的服務商 {p0}", en: "At {p1}, provider {p0}", ja: "{p1} の提供元 {p0}" },
    { source: "Save (draft).", zh_TW: "儲存（草稿）。", en: "Save (draft).", ja: "保存（下書き）。" },
    { source: "Room {p0} closed", zh_TW: "房間 {p0} 關閉", en: "Room {p0} closed", ja: "ルーム {p0} 終了" },
  ]);

  assert.equal(translate("Save (draft).", "zh_TW"), "儲存（草稿）。");
  assert.equal(translate("Room Meeting 12 closed at 9:30 AM.", "ja"), "ルーム Meeting 12 は 9:30 AM に終了しました。");
  assert.equal(translate("Provider ChatGPT at 9:30", "ja"), "9:30 の提供元 ChatGPT");
  assert.equal(translate("At 9:30, provider ChatGPT", "zh_TW"), "9:30 時的服務商 ChatGPT");
  assert.equal(translate("prefix Room x closed at y." , "ja"), "prefix Room x closed at y.");
  assert.equal(translate("Continue: <b>AI text</b>!", "zh_TW"), "接續：<b>AI text</b>！");
  assert.equal(translate("unlisted AI answer", "ja"), "unlisted AI answer");
});

test("dynamic UI values remain raw text and are localized when the locale changes", () => {
  setLocale("en");
  assert.equal(uiText("{unlisted dynamic source}"), "{unlisted dynamic source}");

  const translate = createTextTranslator([
    { source: "Hello, {p0}!", zh_TW: "你好，{p0}！", en: "Hello, {p0}!", ja: "こんにちは、{p0}！" },
  ]);
  const hostileLookingValue = "<img src=x onerror=alert(1)>";
  assert.equal(translate(`Hello, ${hostileLookingValue}!`, "zh_TW"), `你好，${hostileLookingValue}！`);
  assert.equal(translate(`Hello, ${hostileLookingValue}!`, "ja"), `こんにちは、${hostileLookingValue}！`);
  assert.equal(translate("Hello, {p1} literal!", "ja"), "こんにちは、{p1} literal！");
  assert.equal(translate.resolveSource("こんにちは、{p1} literal！"), "Hello, {p1} literal!");
});

test("static locale application translates only catalog-matched UI and preserves protected regions", () => {
  const translate = createTextTranslator([
    { source: "Start meeting", zh_TW: "開始會議", en: "Start meeting", ja: "会議を開始" },
    { source: "Waiting…", zh_TW: "等待中…", en: "Waiting…", ja: "待機中…" },
    { source: "Enter a question", zh_TW: "輸入問題", en: "Enter a question", ja: "質問を入力" },
    { source: "Open details", zh_TW: "開啟詳細資料", en: "Open details", ja: "詳細を開く" },
    { source: "Application", zh_TW: "應用程式", en: "Application", ja: "アプリ" },
    { source: "Speak", zh_TW: "發言", en: "Speak", ja: "発言する" },
  ]);
  const faultDetails = element("details", "reply-recovery", [
    element("summary", "", [text("Open details")]),
    element("p", "", [text("Start meeting")]),
    element("pre", "", [text("Start meeting")]),
  ]);
  const root = element("main", "", [
    element("button", "", [text("Start meeting")], { title: "Application", "aria-label": "Start meeting" }),
    element("div", "bubble-content", [text("Waiting…")]),
    element("div", "bubble-content", [element("span", "loading-dots", [text("Waiting…")])]),
    element("div", "bubble-meta", [text("Application")]),
    element("pre", "", [text("Start meeting")]),
    element("textarea", "", [text("Start meeting")], { placeholder: "Enter a question" }),
    element("input", "", [], { placeholder: "Enter a question", value: "user draft" }),
    element("section", "reply-recovery", [faultDetails]),
    element("p", "", [text("unlisted AI answer")]),
    text("  Start meeting\n "),
    text("会議を開始"),
  ]);

  setLocale("ja");
  applyStaticLocale(root, translate);
  assert.equal(root.childNodes[0].childNodes[0].nodeValue, "会議を開始");
  assert.equal(root.childNodes[0].attributes.find((attribute) => attribute.name === "title").value, "アプリ");
  assert.equal(root.childNodes[0].attributes.find((attribute) => attribute.name === "aria-label").value, "会議を開始");
  assert.equal(root.childNodes[1].childNodes[0].nodeValue, "Waiting…");
  assert.equal(root.childNodes[2].childNodes[0].childNodes[0].nodeValue, "待機中…");
  assert.equal(root.childNodes[3].childNodes[0].nodeValue, "Application");
  assert.equal(root.childNodes[4].childNodes[0].nodeValue, "Start meeting");
  assert.equal(root.childNodes[5].childNodes[0].nodeValue, "Start meeting");
  assert.equal(root.childNodes[5].attributes.find((attribute) => attribute.name === "placeholder").value, "質問を入力");
  assert.equal(root.childNodes[6].attributes.find((attribute) => attribute.name === "value").value, "user draft");
  assert.equal(faultDetails.childNodes[0].childNodes[0].nodeValue, "詳細を開く");
  assert.equal(faultDetails.childNodes[1].childNodes[0].nodeValue, "Start meeting");
  assert.equal(faultDetails.childNodes[2].childNodes[0].nodeValue, "Start meeting");
  assert.equal(root.childNodes[8].childNodes[0].nodeValue, "unlisted AI answer");
  assert.equal(root.childNodes[9].nodeValue, "  会議を開始\n ");
  assert.equal(root.childNodes[10].nodeValue, "会議を開始");

  setLocale("zh-TW");
  root.childNodes[0].childNodes[0].nodeValue = "Speak";
  root.childNodes[9].nodeValue = "Start meeting";
  applyStaticLocale(root, translate);
  assert.equal(root.childNodes[0].childNodes[0].nodeValue, "發言");
  assert.equal(root.childNodes[0].attributes.find((attribute) => attribute.name === "title").value, "應用程式");
  assert.equal(root.childNodes[9].nodeValue, "開始會議");
  assert.equal(root.childNodes[10].nodeValue, "開始會議");
});

test("markup translation without a DOM implementation returns the input untouched", () => {
  assert.equal(translateUiMarkup("<b>Start meeting</b>", null), "<b>Start meeting</b>");
});
