import test from "node:test";
import assert from "node:assert/strict";
import {attachPlayScenes, PLAY_SCENES} from "../src/sidepanel/playScenes.js";
import {extraChallenges} from "../src/sidepanel/playChallenges.js";
import {uiText, setLocale} from "../src/shared/i18n.js";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

function fixture() {
  const buttons = PLAY_SCENES.map(scene => ({dataset: {playScene: scene.id}}));
  const container = {handlers: {}, addEventListener(k, f) {this.handlers[k] = f;}, contains: b => buttons.includes(b), querySelectorAll: () => buttons};
  const input = {value: "", addEventListener() {}, focus() {this.focused = true;}};
  let blocked = false, applied = 0;
  const view = attachPlayScenes({container, input, translate: uiText, isBlocked: () => blocked, onApply: () => applied++});
  return {buttons, container, input, view, applied: () => applied, block: () => blocked = true};
}

test("play openings localize a fictional draft and require a separate launch", () => {
  setLocale("en");
  const f = fixture();
  f.container.handlers.click({target: {closest: () => f.buttons[0]}});
  assert.equal(f.buttons[0].textContent, "Cat Night Market");
  assert.match(f.input.value, /^\[Fictional Scenario Game\]/);
  assert.equal(f.applied(), 1);
  assert.equal(f.input.focused, true);
  assert.equal(f.container.hidden, true);
  setLocale("zh_TW");
});

test("a saved draft and a blocked meeting are never replaced by an opening", () => {
  const f = fixture();
  f.input.value = "我的原稿";
  f.container.handlers.click({target: {closest: () => f.buttons[0]}});
  assert.equal(f.input.value, "我的原稿");
  f.input.value = "";
  f.block();
  f.view.render();
  f.container.handlers.click({target: {closest: () => f.buttons[1]}});
  assert.equal(f.input.value, "");
  assert.equal(f.applied(), 0);
  assert.equal(f.container.hidden, true);
});

test("each extra deck is authored, translated, and imposter cards protect hidden roles", () => {
  for (const category of ["theater", "discussion", "imposter"]) {
    const cards = extraChallenges(category);
    assert.equal(cards.length, 6);
    assert.equal(new Set(cards.map(c => c.id)).size, 6);
    for (const card of cards) for (const locale of ["en", "ja"]) {
      assert.notEqual(uiText(card.label, locale), card.label);
      assert.notEqual(uiText(card.text, locale), card.text);
    }
  }
  assert.ok(extraChallenges("imposter").every(c => /禁止|嚴禁|切勿|不探究/.test(c.text)));
});

test("the actual scene preset selects theater and opens interactive play without launching", async () => {
  const source = await readFile("src/sidepanel/app.js", "utf8");
  const body = source.match(/const playScenes = attachPlayScenes\(\{[\s\S]*?onApply: \(\) => \{([\s\S]*?)\n  \},/)[1];
  const modes = ["fast", "chat", "theater", "summary"].map(value => ({value, checked: value === "fast"}));
  const context = vm.createContext({debateModeEls: modes, interactionStyleSelect: {value: "critique"}, chatControls: {open: false},
    renderDebateModeState() {}, updateContinuationPreview() {}, starterQuestions: {render() {}}, renderMessage() {}});
  vm.runInContext(body, context);
  assert.deepEqual(modes.filter(m => m.checked).map(m => m.value), ["theater"]);
  assert.equal(context.interactionStyleSelect.value, "yesand");
  assert.equal(context.chatControls.open, true);
});
