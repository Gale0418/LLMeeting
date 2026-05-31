import test from "node:test";
import assert from "node:assert/strict";

import {
  isProviderTabReady,
  setSidePanelOpenOnActionClick,
  urlMatchesPattern,
} from "../src/background/chromeCompat.js";

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

test("urlMatchesPattern handles Chrome-style provider host patterns", () => {
  assert.equal(urlMatchesPattern("https://chatgpt.com/", "https://chatgpt.com/*"), true);
  assert.equal(urlMatchesPattern("https://chatgpt.com/c/123", "https://chatgpt.com/*"), true);
  assert.equal(urlMatchesPattern("chrome://newtab/", "https://chatgpt.com/*"), false);
});

test("provider tab is ready only after it reaches an allowed host and finishes loading", () => {
  const provider = { matchPatterns: ["https://chatgpt.com/*", "https://chat.openai.com/*"] };

  assert.equal(isProviderTabReady({ status: "complete", url: "chrome://newtab/" }, provider), false);
  assert.equal(isProviderTabReady({ status: "loading", url: "https://chatgpt.com/" }, provider), false);
  assert.equal(isProviderTabReady({ status: "complete", url: "https://chatgpt.com/" }, provider), true);
});
