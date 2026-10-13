import test from "node:test";
import assert from "node:assert/strict";
import { createTranscriptReader } from "../src/sidepanel/transcriptReader.js";

class FixtureNode {
  constructor(tagName, text = "", attributes = {}) {
    this.tagName = tagName;
    this.nodeType = tagName === "#text" ? 3 : 1;
    this.nodeValue = this.nodeType === 3 ? text : null;
    this._textContent = text;
    this.attributes = attributes;
    this.childNodes = [];
    this.parentNode = null;
    this.rectTop = 120;
    this.rectBottom = 140;
  }

  isEqualNode(other) {
    FixtureNode.comparisons += 1;
    return Boolean(other && this.tagName === other.tagName && this.textContent === other.textContent
      && JSON.stringify(this.attributes) === JSON.stringify(other.attributes)
      && this.childNodes.length === other.childNodes.length
      && this.childNodes.every((child, index) => child.isEqualNode(other.childNodes[index])));
  }

  get textContent() {
    return this.nodeType === 3 ? this.nodeValue : this.childNodes.length
      ? this.childNodes.map(node => node.textContent).join("") : this._textContent;
  }

  set textContent(value) {
    if (this.nodeType === 3) this.nodeValue = value;
    else { this._textContent = value; this.childNodes = []; }
  }

  get outerHTML() {
    const attrs = Object.entries(this.attributes).map(([key, value]) => ` ${key}="${value}"`).join("");
    return `<${this.tagName}${attrs}>${this.childNodes.map(node => node.nodeType === 3 ? node.nodeValue : node.outerHTML).join("")}</${this.tagName}>`;
  }

  getBoundingClientRect() { return {top: this.rectTop, bottom: this.rectBottom}; }

  cloneNode(deep = false) {
    const copy = new FixtureNode(this.tagName, this.nodeValue ?? this._textContent, {...this.attributes});
    copy.rectTop = this.rectTop;
    copy.rectBottom = this.rectBottom;
    if (deep) {
      copy.childNodes = this.childNodes.map(node => {
        const child = node.cloneNode(true);
        child.parentNode = copy;
        return child;
      });
    }
    return copy;
  }
}

class FixtureContainer extends FixtureNode {
  constructor() {
    super("container");
    this.handlers = {};
    this.scrollTop = 0;
    this.scrollHeight = 1000;
    this.clientHeight = 400;
    this.focusOptions = null;
    this.rectTop = 100;
    this.rectBottom = 500;
    this.onInsert = null;
  }

  addEventListener(type, handler) { this.handlers[type] = handler; }
  focus(options) { this.focusOptions = options; }

  insertBefore(node, reference) {
    if (node.parentNode) {
      const oldIndex = node.parentNode.childNodes.indexOf(node);
      if (oldIndex >= 0) node.parentNode.childNodes.splice(oldIndex, 1);
    }
    const index = reference ? this.childNodes.indexOf(reference) : -1;
    this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, node);
    node.parentNode = this;
    this.onInsert?.(node);
    return node;
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }
}

function parseHtml(html) {
  const fragment = new FixtureContainer();
  const stack = [fragment];
  for (const token of String(html).match(/<[^>]+>|[^<]+/g) ?? []) {
    if (token.startsWith("</")) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (token.startsWith("<")) {
      const [, tagName, rawAttributes = ""] = token.match(/^<([\w-]+)([^>]*)>$/) ?? [];
      const attributes = Object.fromEntries(Array.from(rawAttributes.matchAll(/([\w-]+)="([^"]*)"/g), match => [match[1], match[2]]));
      const node = new FixtureNode(tagName, "", attributes);
      stack.at(-1).childNodes.push(node);
      node.parentNode = stack.at(-1);
      stack.push(node);
      continue;
    }
    const text = new FixtureNode("#text", token);
    stack.at(-1).childNodes.push(text);
    text.parentNode = stack.at(-1);
  }
  return fragment;
}

function fixture() {
  const element = new FixtureContainer();
  const latestButton = {hidden: true, handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; }};
  const announcement = {textContent: ""};
  const documentObject = {createElement(name) {
    assert.equal(name, "template");
    const template = {content: null};
    Object.defineProperty(template, "innerHTML", {set(value) { template.content = parseHtml(value); }});
    return template;
  }};
  let locale = "EN";
  const translate = value => `${locale}:${value}`;
  return {element, latestButton, announcement, setLocale(value) { locale = value; }, reader: createTranscriptReader({element, latestButton, announcement, documentObject, translate})};
}

test("render preserves unchanged top-level nodes and keeps a mid-transcript reading position", () => {
  const f = fixture();
  f.reader.render('<p id="one">第一段</p><p id="two">第二段</p>');
  const retained = f.element.childNodes[1];
  f.element.scrollTop = 250;
  f.reader.render('<p id="zero">新增</p><p id="one">第一段</p><p id="two">第二段</p>');
  assert.equal(f.element.childNodes[2], retained);
  assert.equal(f.element.scrollTop, 250);
  assert.equal(f.latestButton.hidden, false);
  assert.equal(f.announcement.textContent, "EN:有新內容；閱讀位置已保留。");
});

test("first render stays quiet, then changed content follows the bottom and announces briefly", () => {
  const f = fixture();
  f.reader.render('<p>初始</p>');
  assert.equal(f.announcement.textContent, "");
  f.element.scrollTop = 600;
  f.reader.render('<p>初始</p><p>後續</p>');
  assert.equal(f.element.scrollTop, f.element.scrollHeight);
  assert.equal(f.latestButton.hidden, true);
  assert.equal(f.announcement.textContent, "EN:有新內容；閱讀位置已保留。");
});

test("jumpToLatest hides the button and focuses the transcript without scrolling focus", () => {
  const f = fixture();
  f.latestButton.hidden = false;
  f.latestButton.handlers.click();
  assert.equal(f.element.scrollTop, f.element.scrollHeight);
  assert.equal(f.latestButton.hidden, true);
  assert.deepEqual(f.element.focusOptions, {preventScroll: true});
});

test("locale-only rendering can update content without announcing a new reply", () => {
  const f = fixture();
  f.reader.render('<p>第一段</p>');
  f.element.scrollTop = 200;
  f.announcement.textContent = "既有公告";
  f.latestButton.hidden = false;
  f.reader.render('<p>First paragraph</p>', {announce: false});
  assert.equal(f.element.scrollTop, 200);
  assert.equal(f.announcement.textContent, "既有公告");
  assert.equal(f.latestButton.hidden, false);
});

test("unchanged rendering preserves node identity and reading position", () => {
  const f = fixture();
  f.reader.render('<p>固定內容</p>');
  const retained = f.element.childNodes[0];
  f.element.scrollTop = 320;
  f.reader.render('<p>固定內容</p>');
  assert.equal(f.element.childNodes[0], retained);
  assert.equal(f.element.scrollTop, 320);
});

test("repeats the same live hint for later updates and hides latest when scrolling to bottom", async () => {
  const f = fixture();
  f.reader.render("<p>初始</p>");
  f.reader.render("<p>初始</p><p>第二段</p>");
  f.reader.render("<p>初始</p><p>第二段</p><p>第三段</p>");
  await Promise.resolve();
  assert.equal(f.announcement.textContent, "EN:有新內容；閱讀位置已保留。");
  f.latestButton.hidden = false;
  f.element.scrollTop = 600;
  f.element.handlers.scroll();
  assert.equal(f.latestButton.hidden, true);
});

test("signature queues keep existing nodes through a large front insertion", () => {
  const f = fixture();
  const original = Array.from({length: 180}, (_, index) => `<p id="old-${index}">內容${index}</p>`).join("");
  f.reader.render(original);
  const retained = f.element.childNodes.slice();
  FixtureNode.comparisons = 0;
  const inserted = Array.from({length: 180}, (_, index) => `<p id="new-${index}">新${index}</p>`).join("");
  f.reader.render(inserted + original);
  assert.equal(f.element.childNodes.length, 360);
  assert.deepEqual(f.element.childNodes.slice(180), retained);
  assert.ok(FixtureNode.comparisons < 800, `expected near-linear comparisons, got ${FixtureNode.comparisons}`);
});

test("keeps a retained visible anchor at the same viewport position after insertion", () => {
  const f = fixture();
  f.reader.render('<p id="anchor">可見段落</p><p id="later">後續</p>');
  const anchor = f.element.childNodes[0];
  anchor.rectTop = 150;
  anchor.rectBottom = 180;
  f.element.scrollTop = 240;
  f.element.onInsert = node => {
    if (node.attributes.id === "prefix") anchor.rectTop += 55;
  };
  f.reader.render('<p id="prefix">前插內容</p><p id="anchor">可見段落</p><p id="later">後續</p>');
  assert.equal(f.element.childNodes[1], anchor);
  assert.equal(f.element.scrollTop, 295);
});

test("locale-only render cancels a queued announcement in the previous locale", async () => {
  const f = fixture();
  f.reader.render("<p>初始</p>");
  f.announcement.textContent = "EN:有新內容；閱讀位置已保留。";
  f.reader.render("<p>初始</p><p>回覆</p>");
  f.setLocale("JA");
  f.reader.render("<p>初始</p><p>返答</p>", {announce: false});
  await Promise.resolve();
  assert.equal(f.announcement.textContent, "");
});

test("retains locally opened details until the source content changes", () => {
  const f = fixture();
  const original = '<details id="fault"><summary>查看原故障</summary><p>截圖失敗</p></details>';
  f.reader.render(original);
  const details = f.element.childNodes[0];
  details.attributes.open = "";
  assert.equal(f.reader.render(original), false);
  assert.equal(f.element.childNodes[0], details);
  assert.equal(details.attributes.open, "");

  const changed = '<details id="fault"><summary>查看原故障</summary><p>截圖失敗：權限不足</p></details>';
  assert.equal(f.reader.render(changed), true);
  assert.notEqual(f.element.childNodes[0], details);
  assert.equal(f.element.childNodes[0].attributes.open, undefined);
});
