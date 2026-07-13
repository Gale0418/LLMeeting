import test from "node:test";
import assert from "node:assert/strict";

import { clipText, formatSpeakerBlock } from "../src/shared/text.js";

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
