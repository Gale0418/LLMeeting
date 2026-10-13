import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { normalizeDebateRounds } from "../src/background/debateEngine.js";
import { normalizeRoundNumber } from "../src/shared/text.js";

// Evaluate the production pure functions without installing a fake extension DOM.
function functionsBetween(source, start, end) {
  return source.slice(source.indexOf(`function ${start}(`), source.indexOf(`function ${end}(`));
}

test("sticky progress keeps the completed stage while waiting and does not call an early failure complete", async () => {
  const source = await readFile("src/sidepanel/app.js", "utf8");
  const context = vm.createContext({isCritiquePhase: phase => /^critique/.test(phase)});
  vm.runInContext(functionsBetween(source, "progressStageForState", "progressStageLabel"), context);
  assert.equal(context.progressStageForState({phase: "waiting_for_user", currentCritiqueRound: 0}), 1);
  assert.equal(context.progressStageForState({phase: "waiting_for_user", currentCritiqueRound: 3}), 2);
  assert.equal(context.progressStageForState({status: "error", phase: "first-round"}), 1);
  assert.equal(context.progressStageForState({phase: "waiting_for_user", repairPause: {pausedPhase: "critique-2"}}), 2);
  assert.equal(context.progressStageForState({phase: "waiting_for_user", repairPause: {pausedPhase: "summary"}}), 3);
  assert.equal(context.progressStageForState({status: "done"}), 3);
});

test("runtime round normalization rejects invalid or unsafe numbers without capping valid rounds", () => {
  for (const value of [0, -2, 1.5, "7oops", Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(normalizeRoundNumber(value), 1);
  }
  assert.equal(normalizeRoundNumber("12"), 12);
});

test("side panel progress and active transcript round use uncapped runtime numbers", async () => {
  const source = await readFile("src/sidepanel/app.js", "utf8");
  const progressBar = { style: {}, classList: { add() {}, remove() {} } };
  const context = vm.createContext({ normalizeDebateRounds, normalizeRoundNumber, progressBar,
    progressNodes: [], progressContainer: null, isCritiquePhase: () => true,
    progressStageForState: () => 2, progressStageLabel: () => "互評" });
  vm.runInContext(functionsBetween(source, "updateProgressBar", "progressStageForState"), context);
  context.updateProgressBar({ status: "running", phase: "critique-6", debateRounds: 7, currentCritiqueRound: 6 });
  assert.equal(progressBar.style.transform, "scaleX(0.69)");
  context.updateProgressBar({status: "waiting", phase: "waiting_for_user", repairPause: {pausedPhase: "summary"}});
  assert.equal(progressBar.style.transform, "scaleX(0.85)");
  context.updateProgressBar({status: "error", phase: "critique-2"});
  assert.equal(progressBar.style.transform, "scaleX(0.75)");
  assert.match(source, /const activeCritiqueRound = isCritiquePhase\(state.phase\)\s*\? normalizeRoundNumber\(/);
});

test("runtime round labels and phase parsing preserve rounds above five", async () => {
  const source = await readFile("src/background/service-worker.js", "utf8");
  const text = await import("../src/shared/text.js");
  const context = vm.createContext({ normalizeDebateRounds, ...text });
  vm.runInContext(functionsBetween(source, "critiqueRoundLabel", "createRunId"), context);
  assert.equal(context.critiqueRoundLabel(6, 7), "第 6/7 輪互評");
  assert.equal(context.critiqueRoundFromPhase("critique-12"), 12);
  assert.equal(context.critiqueRoundFromPhase("critique"), 1);
  assert.equal(normalizeDebateRounds(12), 5, "configured limits remain bounded");
});

test("side panel selects current and completed round maps above five", async () => {
  const source = await readFile("src/sidepanel/app.js", "utf8");
  const text = await import("../src/shared/text.js");
  const context = vm.createContext({ normalizeDebateRounds, ...text });
  vm.runInContext(functionsBetween(source, "critiqueRoundMaps", "zhRoundLabel"), context);
  const critiqueRounds = Array.from({ length: 7 }, (_, i) => ({ chatgpt: `round ${i + 1}` }));
  assert.equal(context.currentCritiqueMap({ phase: "critique-6", currentCritiqueRound: 6,
    transcript: { critiqueRounds } }).chatgpt, "round 6");
  assert.equal(context.currentCritiqueMap({ phase: "done", transcript: { critiqueRounds } }).chatgpt, "round 7");
});
