import test from "node:test";
import assert from "node:assert/strict";

import {
  clipText,
  contextBlockCharLimit,
  formatSpeakerBlock,
} from "../src/shared/text.js";

test("clipText preserves short text", () => {
  assert.equal(clipText("短回答", 10), "短回答");
});

test("clipText marks long text as clipped", () => {
  const clipped = clipText("abcdefghijklmnopqrstuvwxyz", 10);
  assert.ok(clipped.length <= 10);
  assert.match(clipped, /^\n\n\[已截斷：原文 /);
});

test("formatSpeakerBlock writes speaker label followed by content", () => {
  assert.equal(formatSpeakerBlock("Gemini", "就是藍的呀~"), "Gemini:\n就是藍的呀~");
});

test("contextBlockCharLimit shares a total prompt budget across blocks", () => {
  assert.equal(contextBlockCharLimit(4, { totalChars: 12000, maxChars: 5000 }), 3000);
  assert.equal(contextBlockCharLimit(1, { totalChars: 12000, maxChars: 5000 }), 5000);
  assert.equal(contextBlockCharLimit(100, { totalChars: 12000, minChars: 800 }), 120);
});

test("contextBlockCharLimit treats maxChars as a ceiling without breaking the total", () => {
  const limit = contextBlockCharLimit(5, {
    totalChars: 1000,
    maxChars: 10000,
    minChars: 800,
  });

  assert.equal(limit, 200);
  assert.ok(5 * limit <= 1000);
});
