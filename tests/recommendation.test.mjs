import test from "node:test";
import assert from "node:assert/strict";
import {attachStarterQuestions, attachRecommendation, STARTER_QUESTIONS, STORE_URL} from "../src/sidepanel/recommendation.js";
import {uiText, setLocale} from "../src/shared/i18n.js";

function control(properties = {}) {
  return {...properties, handlers: {}, addEventListener(name, handler) {this.handlers[name] = handler;}, focus() {this.focused = true;}, select() {this.selected = true;}};
}

test("starter questions fill only an empty editable draft in the selected language", () => {
  setLocale("en");
  const buttons = STARTER_QUESTIONS.map(q => control({dataset: {starter: q.id}}));
  const container = control({querySelectorAll: () => buttons, contains: button => buttons.includes(button)});
  const input = control({value: ""});
  let blocked = false, changes = 0;
  const view = attachStarterQuestions({container, input, translate: uiText, isBlocked: () => blocked, onDraftChange: () => changes++});
  assert.equal(container.hidden, false);
  assert.equal(buttons[0].textContent, "Compare options");
  container.handlers.click({target: {closest: () => buttons[0]}});
  assert.match(input.value, /^I have 5 hours/);
  assert.equal(input.focused, true);
  assert.equal(changes, 1);
  assert.equal(container.hidden, true);
  input.value = "My private draft";
  container.handlers.click({target: {closest: () => buttons[1]}});
  assert.equal(input.value, "My private draft");
  input.value = "";
  blocked = true;
  view.render();
  container.handlers.click({target: {closest: () => buttons[2]}});
  assert.equal(input.value, "");
  assert.equal(changes, 1);
  assert.equal(container.hidden, true);
  setLocale("zh_TW");
});

test("recommendation copies product introduction and version context, not supplied meeting content", async () => {
  setLocale("ja");
  const button = control(), field = control(), status = control();
  let copied;
  const view = attachRecommendation({button, field, status, translate: uiText, clipboard: {async writeText(text) {copied = text;}}, meeting: {question: "PRIVATE QUESTION", transcript: "PRIVATE ANSWER"}});
  await view.copy();
  assert.ok(copied.includes(STORE_URL));
  assert.match(copied, /候補版/);
  assert.doesNotMatch(copied, /PRIVATE/);
  assert.match(status.textContent, /コピーしました/);
  assert.equal(button.disabled, false);
  setLocale("zh_TW");
});

test("unavailable clipboard offers focused selected text for manual copy", async () => {
  const button = control(), field = control(), status = control();
  const view = attachRecommendation({button, field, status, translate: uiText});
  await view.copy();
  assert.equal(field.focused, true);
  assert.equal(field.selected, true);
  assert.match(status.textContent, /快捷鍵/);
  assert.equal(button.disabled, false);
});

test("repeat clicks do not race clipboard writes and locale changes keep a product-only draft", async () => {
  const button = control(), field = control(), status = control();
  let release, writes = 0;
  const view = attachRecommendation({button, field, status, translate: uiText, clipboard: {writeText() {writes++; return new Promise(resolve => release = resolve);}}});
  const first = view.copy();
  await view.copy();
  assert.equal(writes, 1);
  setLocale("en");
  view.render();
  assert.match(field.value, /^I'm trying out LLMeeting/);
  release();
  await first;
  assert.match(status.textContent, /Recommendation copied/);
  setLocale("zh_TW");
});
