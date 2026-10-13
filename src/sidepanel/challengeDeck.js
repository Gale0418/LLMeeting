function cloneCard(card) {
  if (typeof structuredClone === "function") return structuredClone(card);

  if (Array.isArray(card)) return card.map(cloneCard);
  if (card && typeof card === "object") {
    return Object.fromEntries(Object.entries(card).map(([key, value]) => [key, cloneCard(value)]));
  }
  return card;
}

function shuffle(cards, random) {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index--) {
    let value;
    try {
      value = random();
    } catch {
      value = Math.random();
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 1) {
      value = Math.random();
    }
    const otherIndex = Math.floor(value * (index + 1));
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
  }
  return shuffled;
}

export function createChallengeDeck(cards, { random = Math.random, size = 3 } = {}) {
  if (!Array.isArray(cards) || cards.length < 3) {
    throw new TypeError("挑戰牌庫至少需要 3 張卡片");
  }
  if (!Number.isInteger(size) || size < 1 || size > cards.length) {
    throw new RangeError("每組張數必須是介於 1 與牌庫張數之間的整數");
  }

  const ids = new Set();
  for (const card of cards) {
    if (!card || typeof card !== "object" || Array.isArray(card)
      || typeof card.id !== "string" || card.id.trim() === "") {
      throw new TypeError("每張挑戰卡都必須有非空白字串 id");
    }
    if (ids.has(card.id)) throw new TypeError(`挑戰卡 id 重複：${card.id}`);
    ids.add(card.id);
  }

  const source = cards.map(cloneCard);
  let pool = shuffle(source, random);
  let poolIndex = 0;
  let latest = null;
  let draws = 0;

  function makeBatch() {
    const batch = [];
    while (batch.length < size) {
      const available = pool.length - poolIndex;
      if (available >= size - batch.length) {
        const needed = size - batch.length;
        batch.push(...pool.slice(poolIndex, poolIndex + needed));
        poolIndex += needed;
        break;
      }

      if (available > 0) {
        batch.push(...pool.slice(poolIndex));
        poolIndex = pool.length;
      }

      const fresh = shuffle(source, random);
      const batchIds = new Set(batch.map((card) => card.id));
      const previousIds = new Set((latest ?? []).map((card) => card.id));
      const eligible = fresh.filter((card) => !batchIds.has(card.id) && !previousIds.has(card.id));
      const fallback = fresh.filter((card) => !batchIds.has(card.id) && previousIds.has(card.id));
      const needed = size - batch.length;
      const selected = [...eligible, ...fallback].slice(0, needed);
      batch.push(...selected);

      const selectedIds = new Set(selected.map((card) => card.id));
      pool = fresh.filter((card) => !selectedIds.has(card.id));
      poolIndex = 0;
    }
    return batch;
  }

  return {
    draw() {
      latest = makeBatch();
      draws++;
      return latest.map(cloneCard);
    },
    current() {
      return latest?.map(cloneCard) ?? null;
    },
    batchNumber() {
      return draws;
    },
  };
}
