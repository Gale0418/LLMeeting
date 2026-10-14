import test from "node:test";
import assert from "node:assert/strict";
import { initializeLocale, LOCALE_STORAGE_KEY } from "../src/sidepanel/localeControls.js";

function fixture() {
  const handlers = {};
  const select = {value: "", addEventListener: (type, handler) => handlers[type] = handler};
  const status = {textContent: ""};
  const label = {textContent: ""};
  const persona = {defaultValue: "preset", value: "my own persona"};
  const events = [];
  const doc = {documentElement: {lang: ""}, childNodes: [],
    querySelector: id => ({"#languageSelect": select, "#languageStatus": status, "#languageLabel": label}[id]),
    querySelectorAll: () => [persona],
    dispatchEvent: event => events.push(event),
  };
  return {doc, select, status, label, persona, handlers, events};
}

test("locale preference loads and rapid changes persist in order without touching edited personas", async () => {
  const f = fixture();
  const writes = [];
  const storage = {get: async () => ({[LOCALE_STORAGE_KEY]: "ja"}), set: async entry => writes.push(entry[LOCALE_STORAGE_KEY])};
  const controller = await initializeLocale({documentObject: f.doc, storage, browserI18n: {getUILanguage: () => "en-US"}});
  assert.equal(f.doc.documentElement.lang, "ja");
  assert.equal(f.label.textContent, "言語：");
  f.select.value = "en"; f.handlers.change();
  f.select.value = "zh_TW"; f.handlers.change();
  await controller.flush();
  assert.deepEqual(writes, ["en", "zh_TW"]);
  assert.equal(f.doc.documentElement.lang, "zh-Hant-TW");
  assert.equal(f.persona.value, "my own persona");
  assert.deepEqual(f.events.map(e => e.type), ["llmeeting:locale-changed", "llmeeting:locale-changed"]);
});

test("language storage failures leave the current UI usable and display the failure", async () => {
  const f = fixture();
  const storage = {get: async () => {throw new Error("read failure");}, set: async () => {throw new Error("write failure");}};
  const controller = await initializeLocale({documentObject: f.doc, storage, browserI18n: {getUILanguage: () => "en-US"}});
  assert.equal(f.doc.documentElement.lang, "en");
  assert.match(f.status.textContent, /read failure/);
  f.select.value = "en"; f.handlers.change();
  await controller.flush();
  assert.equal(f.doc.documentElement.lang, "en");
  assert.match(f.status.textContent, /write failure/);
  assert.equal(f.persona.value, "my own persona");
});

test("first launch follows browser UI language and unsupported languages fall back to English", async () => {
  for (const [language, expected] of [["ja-JP", "ja"], ["zh-TW", "zh-Hant-TW"], ["zh-CN", "zh-Hant-TW"], ["en-GB", "en"], ["fr-FR", "en"]]) {
    const f = fixture();
    const writes = [];
    await initializeLocale({documentObject: f.doc, storage: {get: async () => ({}), set: async value => writes.push(value)},
      browserI18n: {getUILanguage: () => language}, navigatorObject: {languages: ["ja-JP"]}});
    assert.equal(f.doc.documentElement.lang, expected, language);
    assert.equal(f.select.value, "auto");
    assert.deepEqual(writes, [], "auto detection must not pin a manual preference");
  }
});

test("manual preference wins and selecting auto restores browser language and persists auto", async () => {
  const f = fixture(); const writes = [];
  const controller = await initializeLocale({documentObject: f.doc,
    storage: {get: async () => ({[LOCALE_STORAGE_KEY]: "ja"}), set: async value => writes.push(value[LOCALE_STORAGE_KEY])},
    browserI18n: {getUILanguage: () => "en-US"}});
  assert.equal(f.doc.documentElement.lang, "ja");
  f.select.value = "auto"; f.handlers.change(); await controller.flush();
  assert.equal(f.doc.documentElement.lang, "en"); assert.equal(f.select.value, "auto");
  assert.deepEqual(writes, ["auto"]);
});

test("invalid saved locale and unavailable Chrome language API use navigator or English", async () => {
  for (const [languages, expected] of [[["de-DE", "ja-JP"], "ja"], [[], "en"]]) {
    const f = fixture();
    await initializeLocale({documentObject: f.doc,
      storage: {get: async () => ({[LOCALE_STORAGE_KEY]: "broken"})},
      browserI18n: {getUILanguage: () => {throw new Error("unavailable");}}, navigatorObject: {languages}});
    assert.equal(f.doc.documentElement.lang, expected); assert.equal(f.select.value, "auto");
  }
});
