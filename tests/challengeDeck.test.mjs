import test from "node:test";
import assert from "node:assert/strict";
import { createChallengeDeck } from "../src/sidepanel/challengeDeck.js";

function cards(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `card-${index + 1}`,
    text: `挑戰 ${index + 1}`,
    details: { rank: index + 1 },
  }));
}

test("9 張牌連抽 3 組會覆蓋整輪且每組沒有重複", () => {
  const deck = createChallengeDeck(cards(9), { random: () => 0 });
  const batches = [deck.draw(), deck.draw(), deck.draw()];

  for (const batch of batches) {
    assert.equal(batch.length, 3);
    assert.equal(new Set(batch.map((card) => card.id)).size, 3);
  }
  assert.deepEqual(new Set(batches.flat().map((card) => card.id)),
    new Set(cards(9).map((card) => card.id)));
  assert.equal(deck.batchNumber(), 3);
});

test("重洗後的新組避免與上一組撞卡", () => {
  const deck = createChallengeDeck(cards(6), { random: () => 0 });
  deck.draw();
  const previous = new Set(deck.draw().map((card) => card.id));
  const next = deck.draw();

  assert.equal(next.some((card) => previous.has(card.id)), false);
  assert.equal(new Set(next.map((card) => card.id)).size, 3);
});

test("牌少於兩組時仍保證組內唯一", () => {
  const deck = createChallengeDeck(cards(4), { random: () => 0, size: 3 });
  for (let index = 0; index < 8; index++) {
    const batch = deck.draw();
    assert.equal(batch.length, 3);
    assert.equal(new Set(batch.map((card) => card.id)).size, 3);
  }
});

test("回傳卡片可修改而不影響輸入、牌庫或 current", () => {
  const source = cards(3);
  const deck = createChallengeDeck(source, { random: () => 0 });
  const first = deck.draw();
  first[0].text = "被外部改掉";
  first[0].details.rank = -1;
  first.pop();

  const current = deck.current();
  assert.equal(current.length, 3);
  assert.notEqual(current[0].text, "被外部改掉");
  assert.ok(current.every((card) => card.details.rank > 0));
  assert.ok(source.every((card) => card.details.rank > 0));
});

test("current 不抽新牌，只有 draw 增加批號", () => {
  const deck = createChallengeDeck(cards(6), { random: () => 0 });
  assert.equal(deck.current(), null);
  assert.equal(deck.batchNumber(), 0);

  const first = deck.draw();
  for (let index = 0; index < 5; index++) {
    assert.deepEqual(deck.current(), first);
    assert.equal(deck.batchNumber(), 1);
  }
  deck.draw();
  assert.equal(deck.batchNumber(), 2);
});

test("拒絕無效牌庫與重複 id", () => {
  assert.throws(() => createChallengeDeck(null), /至少需要 3 張/);
  assert.throws(() => createChallengeDeck(cards(2)), /至少需要 3 張/);
  assert.throws(() => createChallengeDeck([{ id: "a" }, { id: "a" }, { id: "c" }]), /id 重複/);
  assert.throws(() => createChallengeDeck([{ id: "a" }, {}, { id: "c" }]), /非空白字串 id/);
  assert.throws(() => createChallengeDeck(cards(3), { size: 4 }), /每組張數/);
});

test("random 回傳越界值或丟錯時仍能安全完成抽牌", () => {
  for (const random of [() => 1, () => -1, () => Number.NaN, () => { throw new Error("broken"); }]) {
    const deck = createChallengeDeck(cards(4), { random, size: 3 });
    const batch = deck.draw();
    assert.equal(batch.length, 3);
    assert.equal(new Set(batch.map((card) => card.id)).size, 3);
  }
});
