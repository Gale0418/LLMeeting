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
  const controller = await initializeLocale({documentObject: f.doc, storage});
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
  const controller = await initializeLocale({documentObject: f.doc, storage});
  assert.equal(f.doc.documentElement.lang, "zh-Hant-TW");
  assert.match(f.status.textContent, /read failure/);
  f.select.value = "en"; f.handlers.change();
  await controller.flush();
  assert.equal(f.doc.documentElement.lang, "en");
  assert.match(f.status.textContent, /write failure/);
  assert.equal(f.persona.value, "my own persona");
});
