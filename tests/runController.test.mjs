import test from "node:test";
import assert from "node:assert/strict";

import { RunController, isRunCancelledError } from "../src/background/runController.js";

test("starting a new run invalidates the previous token", () => {
  const controller = new RunController();
  const first = controller.start();
  const second = controller.start();

  assert.equal(controller.isCurrent(first), false);
  assert.equal(controller.isCurrent(second), true);
});

test("cancelling invalidates the active token", () => {
  const controller = new RunController();
  const token = controller.start();

  controller.cancel();

  assert.equal(controller.isCurrent(token), false);
  assert.throws(
    () => controller.assertCurrent(token),
    (error) => isRunCancelledError(error) && error.code === "RUN_CANCELLED",
  );
});

test("a reservation serializes starts before preflight completes", () => {
  const controller = new RunController();
  const first = controller.reserve();

  assert.equal(typeof first, "number");
  assert.equal(controller.reserve(), null);
  assert.equal(controller.isReserved(), true);

  controller.cancel();
  assert.equal(controller.isReserved(), false);
  assert.equal(controller.isCurrent(first), false);
  assert.throws(() => controller.claim(first), (error) => error.code === "RUN_CANCELLED");

  const second = controller.reserve();
  assert.equal(controller.claim(second), second);
  assert.equal(controller.isReserved(), false);
  assert.equal(controller.isCurrent(second), true);
});
