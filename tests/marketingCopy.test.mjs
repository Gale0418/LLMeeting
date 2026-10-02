import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("recommendation material distinguishes candidate availability and third-party costs", async () => {
  const readme = await readFile("README.md", "utf8");
  const listing = await readFile("store/listing.md", "utf8");
  const kit = await readFile("store/recommendation-kit.md", "utf8");
  for (const copy of [readme, listing, kit]) {
    assert.match(copy, /候選/);
    assert.match(copy, /實機驗收|端到端測試/);
    assert.match(copy, /訂閱/);
    assert.match(copy, /用量/);
  }
  assert.match(readme, /0\.4\.7/);
  assert.match(listing, /Anonymous modes use aliases.*not anonymous accounts/);
});

test("public-facing pitch avoids unsupported accuracy guarantees", async () => {
  for (const file of ["README.md", "store/listing.md"]) {
    const copy = await readFile(file, "utf8");
    assert.doesNotMatch(copy, /徹底過濾幻覺|確保產出最優解|穩定支援/);
    assert.match(copy, /查證/);
  }
});

test("meeting launch labels name the action without changing mode values", async () => {
  const source = await readFile("src/sidepanel/app.js", "utf8");
  const context = vm.createContext({});
  const body = source.slice(source.indexOf("function debateModeButtonLabel"), source.indexOf("function debateModeButtonTitle"));
  vm.runInContext(`${body}\nglobalThis.label = debateModeButtonLabel;`, context);
  assert.equal(context.label("fast"), "開始快速鬥技場 ⚡");
  assert.equal(context.label("summary"), "開始總結辯論 ✦");
  assert.equal(context.label("chat"), "開啟群聊 💬");
  assert.equal(context.label("theater"), "開始劇場大亂鬥 🎭");
  assert.equal(context.label("unknown"), context.label("fast"));
});

test("empty transcript is not mislabeled as Fast Arena in other modes", async () => {
  const html = await readFile("src/sidepanel/index.html", "utf8");
  const source = await readFile("src/sidepanel/app.js", "utf8");
  const message = "會議開始後，各家回覆會出現在這裡。比較觀點，也記得查證重要事實。";
  assert.ok(html.includes(message));
  assert.ok(source.includes(message));
  assert.doesNotMatch(source, /empty-state">輸入問題，開始快速鬥技場/);
});
