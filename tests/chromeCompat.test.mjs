import test from "node:test";
import assert from "node:assert/strict";

import { setSidePanelOpenOnActionClick } from "../src/background/chromeCompat.js";

test("setSidePanelOpenOnActionClick returns false when sidePanel API is unavailable", async () => {
  const result = await setSidePanelOpenOnActionClick({});

  assert.equal(result, false);
});

test("setSidePanelOpenOnActionClick enables action click behavior when API exists", async () => {
  const calls = [];
  const result = await setSidePanelOpenOnActionClick({
    sidePanel: {
      setPanelBehavior(options) {
        calls.push(options);
        return Promise.resolve();
      },
    },
  });

  assert.equal(result, true);
  assert.deepEqual(calls, [{ openPanelOnActionClick: true }]);
});

test("setSidePanelOpenOnActionClick swallows browser compatibility errors", async () => {
  const result = await setSidePanelOpenOnActionClick({
    sidePanel: {
      setPanelBehavior() {
        return Promise.reject(new Error("not supported"));
      },
    },
  });

  assert.equal(result, false);
});
