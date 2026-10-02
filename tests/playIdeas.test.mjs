import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { appendPlayIdea, canUsePlayIdeas, playIdeas } from "../src/sidepanel/playIdeas.js";

test("interactive modes receive distinct authored choices without altering meeting rules", () => {
  assert.deepEqual(playIdeas("fast", "critique"), []);
  assert.deepEqual(playIdeas("unknown", "critique"), []);
  assert.equal(playIdeas("theater", "critique").length, 3);
  assert.equal(playIdeas("chat", "critique").length, 3);
  assert.deepEqual(playIdeas("summary", "critique"), playIdeas("chat", "critique"));
  assert.notDeepEqual(playIdeas("theater", "critique"), playIdeas("chat", "critique"));
  for (const idea of playIdeas("theater", "imposter")) {
    assert.match(idea.text, /不猜身分|不要求.*揭露|不要公布/);
  }
});

test("idea callers cannot mutate the authored catalogue", () => {
  const ideas = playIdeas("theater", "critique");
  ideas[0].text = "changed";
  ideas.pop();
  assert.equal(playIdeas("theater", "critique").length, 3);
  assert.notEqual(playIdeas("theater", "critique")[0].text, "changed");
});

test("ideas are enabled only in an interactive waiting phase including a recovered session", () => {
  for (const mode of ["chat", "theater", "summary"]) {
    const recovered = JSON.parse(JSON.stringify({ mode, busy: false, phase: "waiting_for_user" }));
    assert.equal(canUsePlayIdeas(recovered), true);
    assert.equal(canUsePlayIdeas(recovered, true), false);
    assert.equal(canUsePlayIdeas({ ...recovered, busy: true }), false);
    assert.equal(canUsePlayIdeas({ ...recovered, phase: "done" }), false);
  }
  assert.equal(canUsePlayIdeas(null), false);
  assert.equal(canUsePlayIdeas({ mode: "fast", phase: "waiting_for_user" }), false);
});

test("adding an idea preserves a draft verbatim and repeated clicks do not duplicate it", () => {
  const draft = "  我的自訂台詞\n還沒寫完  ";
  const text = playIdeas("theater", "critique")[0].text;
  assert.equal(appendPlayIdea(draft, text), `${draft}\n\n${text}`);
  const combined = appendPlayIdea(draft, text);
  assert.equal(appendPlayIdea(combined, text), combined);
  assert.equal(appendPlayIdea("", text), text);
  assert.equal(appendPlayIdea(draft, ""), draft);
});

const source = await readFile("src/sidepanel/app.js", "utf8");
function harness(state = { mode: "theater", interactionStyle: "critique", busy: false, phase: "waiting_for_user" }) {
  let focusCount = 0;
  let sends = 0;
  const container = { children: [], replaceChildren() { this.children = []; }, append(node) { this.children.push(node); } };
  const context = {
    latestState: state, chatActionPending: false,
    playIdeaButtons: container, playCue: {}, chatRoundBadge: {},
    selectedDebateMode: () => "chat", interactionStyleSelect: { value: "casual" },
    chatInput: { value: "我自己的台詞", focus() { focusCount++; }, dispatchEvent() {} },
    appendPlayIdea, canUsePlayIdeas, playIdeas, Event: class {},
    chrome: { runtime: { sendMessage() { sends++; } } },
    document: { createElement() { return { listeners: {}, addEventListener(name, handler) { this.listeners[name] = handler; } }; } },
  };
  vm.createContext(context);
  const body = source.slice(source.indexOf("function renderPlayIdeas"), source.indexOf("const stopDebateBtn"));
  vm.runInContext(`${body}\nglobalThis.render = renderPlayIdeas;`, context);
  context.render();
  return { context, container, focusCount: () => focusCount, sends: () => sends };
}

test("idea buttons append to the draft, focus the editor and never submit a prompt", () => {
  const h = harness();
  assert.equal(h.container.children.length, 3);
  assert.equal(h.container.children[0].textContent, "加一條怪規則");
  assert.equal(h.container.children[0].type, "button");
  h.container.children[0].listeners.click();
  assert.ok(h.context.chatInput.value.startsWith("我自己的台詞\n\n"));
  assert.match(h.context.chatInput.value, /一隻貓/);
  assert.equal(h.focusCount(), 1);
  assert.equal(h.sends(), 0);
  assert.match(h.context.playCue.textContent, /草稿/);
});

test("stale buttons cannot modify a draft after a request starts or waiting ends", () => {
  for (const mutation of [{ chatActionPending: true }, { latestState: { mode: "theater", phase: "first-round", busy: true } }]) {
    const h = harness();
    const button = h.container.children[0];
    Object.assign(h.context, mutation);
    button.listeners.click();
    assert.equal(h.context.chatInput.value, "我自己的台詞");
    assert.equal(h.focusCount(), 0);
    assert.equal(h.sends(), 0);
    h.context.render();
    assert.equal(h.container.children.every((item) => item.disabled), true);
  }
});

test("idle choices follow current settings while live imposter choices follow the session", () => {
  const h = harness({ mode: "theater", interactionStyle: "imposter", phase: "done", busy: false });
  assert.equal(h.container.children[0].textContent, "加一個限制");
  h.context.latestState.phase = "waiting_for_user";
  h.context.render();
  assert.equal(h.container.children[0].textContent, "追問矛盾");
  assert.equal(h.context.chatRoundBadge.textContent, "輪到你");
});
