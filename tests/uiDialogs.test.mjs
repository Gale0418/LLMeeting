import test from "node:test";
import assert from "node:assert/strict";
import { createUiDialogs } from "../src/sidepanel/uiDialogs.js";
import { setLocale } from "../src/shared/i18n.js";

class ElementFixture {
  constructor(tagName, documentObject) {
    this.tagName = tagName.toUpperCase();
    this.documentObject = documentObject;
    this.children = [];
    this.listeners = new Map();
    this.attributes = {};
    this.textContent = "";
    this.open = false;
  }
  append(...elements) { for (const element of elements) { element.parentElement = this; this.children.push(element); } }
  appendChild(element) { this.append(element); return element; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener({type, preventDefault() { this.defaultPrevented = true; }, ...event});
  }
  focus() { this.documentObject.activeElement = this; this.focused = true; }
  remove() {
    const siblings = this.parentElement?.children;
    if (siblings) siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }
  showModal() {
    if (this.documentObject.failShowModal) throw new Error("modal unavailable");
    this.open = true;
  }
  close() {
    this.open = false;
    this.dispatch("close");
  }
  click() { this.dispatch("click"); }
  getAttribute(name) { return this.attributes[name] ?? null; }
}

function createDocumentFixture() {
  const documentObject = {
    listeners: new Map(),
    activeElement: null,
    failShowModal: false,
    createElement(tagName) { return new ElementFixture(tagName, documentObject); },
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    },
    dispatchEvent(event) { for (const listener of this.listeners.get(event.type) ?? []) listener(event); },
  };
  documentObject.body = new ElementFixture("body", documentObject);
  return documentObject;
}

function activeDialog(documentObject) { return documentObject.body.children.find((node) => node.tagName === "DIALOG"); }
function descendants(root, tagName) {
  const found = [];
  for (const child of root.children) {
    if (child.tagName === tagName.toUpperCase()) found.push(child);
    found.push(...descendants(child, tagName));
  }
  return found;
}
function buttons(dialog) { return descendants(dialog, "button"); }
function tick() { return new Promise((resolve) => setImmediate(resolve)); }

test("late close events from a removed dialog cannot cancel the next queued dialog", async () => {
  const documentObject = createDocumentFixture();
  const dialogs = createUiDialogs({documentObject});
  const first = dialogs.confirm("first");
  const second = dialogs.confirm("second");
  await tick();
  const previousDialog = activeDialog(documentObject);
  buttons(previousDialog)[0].click(); assert.equal(await first, true);
  await tick();
  const nextDialog = activeDialog(documentObject);
  previousDialog.dispatch("close");
  assert.equal(activeDialog(documentObject), nextDialog);
  assert.equal(nextDialog.open, true);
  buttons(nextDialog)[1].click(); assert.equal(await second, false);
});

test("confirm remains pending until a button is chosen and restores focus", async () => {
  setLocale("zh_TW");
  const documentObject = createDocumentFixture();
  const originalFocus = documentObject.createElement("button");
  originalFocus.focus();
  const dialogs = createUiDialogs({documentObject});
  let settled = false;
  const result = dialogs.confirm("確定要繼續嗎？").then((value) => { settled = true; return value; });
  await tick();
  const dialog = activeDialog(documentObject);
  assert.ok(dialog);
  assert.equal(settled, false);
  assert.equal(documentObject.activeElement, buttons(dialog)[1], "cancel should receive initial focus");
  buttons(dialog)[0].click();
  assert.equal(await result, true);
  assert.equal(documentObject.body.children.length, 0);
  assert.equal(documentObject.activeElement, originalFocus);
});

test("cancel button, Escape, and an unrequested close all resolve false", async () => {
  const documentObject = createDocumentFixture();
  const dialogs = createUiDialogs({documentObject});

  const cancelResult = dialogs.confirm("取消測試");
  await tick();
  buttons(activeDialog(documentObject))[1].click();
  assert.equal(await cancelResult, false);

  const escapeResult = dialogs.confirm("Escape 測試");
  await tick();
  activeDialog(documentObject).dispatch("cancel");
  assert.equal(await escapeResult, false);

  const closeResult = dialogs.confirm("close 測試");
  await tick();
  activeDialog(documentObject).close();
  assert.equal(await closeResult, false);
});

test("dialogs queue and message payload is rendered only as text", async () => {
  const documentObject = createDocumentFixture();
  const dialogs = createUiDialogs({documentObject});
  const first = dialogs.confirm("第一個");
  const second = dialogs.confirm("<img src=x onerror=alert(1)>\n第二行");
  await tick();
  const openDialog = activeDialog(documentObject);
  assert.equal(documentObject.body.children.length, 1);
  buttons(openDialog)[0].click();
  assert.equal(await first, true);
  await tick();
  const nextDialog = activeDialog(documentObject);
  assert.ok(nextDialog);
  const paragraph = descendants(nextDialog, "p")[0];
  assert.equal(paragraph.textContent, "<img src=x onerror=alert(1)>\n第二行");
  assert.deepEqual(descendants(paragraph, "img"), []);
  buttons(nextDialog)[1].click();
  assert.equal(await second, false);
});

test("alert has one action and resolves void after dismissal", async () => {
  const documentObject = createDocumentFixture();
  const dialogs = createUiDialogs({documentObject});
  const result = dialogs.alert("通知");
  await tick();
  const dialog = activeDialog(documentObject);
  assert.equal(buttons(dialog).length, 2);
  assert.equal(buttons(dialog)[1].hidden, true);
  buttons(dialog)[0].click();
  assert.equal(await result, undefined);
});

test("modal failure and missing DOM fail closed", async () => {
  const documentObject = createDocumentFixture();
  documentObject.failShowModal = true;
  const dialogs = createUiDialogs({documentObject});
  assert.equal(await dialogs.confirm("dangerous action"), false);
  assert.equal(documentObject.body.children.length, 0);
  assert.equal(await createUiDialogs({documentObject: null}).confirm("unavailable"), false);
  await createUiDialogs({documentObject: null}).alert("unavailable");
});

test("button labels and dialog title refresh across all supported locales", async () => {
  const documentObject = createDocumentFixture();
  const dialogs = createUiDialogs({documentObject});
  const pending = dialogs.confirm("跟隨瀏覽器");
  await tick();
  const dialog = activeDialog(documentObject);
  const title = descendants(dialog, "h2")[0];
  const body = descendants(dialog, "p")[0];
  const [confirm, cancel] = buttons(dialog);

  const expected = [
    ["zh_TW", "確定", "取消"],
    ["en", "Confirm", "Cancel"],
    ["ja", "確認", "キャンセル"],
  ];
  for (const [locale, yes, no] of expected) {
    setLocale(locale);
    documentObject.dispatchEvent({type: "llmeeting:locale-changed", detail: {locale}});
    assert.equal(title.textContent, "LLMeeting");
    assert.equal(confirm.textContent, yes);
    assert.equal(cancel.textContent, no);
    assert.equal(body.textContent, locale === "zh_TW" ? "跟隨瀏覽器" : locale === "en" ? "Follow browser" : "ブラウザに合わせる");
  }
  setLocale("zh_TW");
  buttons(dialog)[1].click();
  assert.equal(await pending, false);
});
