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
