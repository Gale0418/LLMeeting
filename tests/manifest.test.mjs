import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("manifest declares the side-panel MV3 extension shell", async () => {
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.side_panel.default_path, "src/sidepanel/index.html");
  assert.equal(manifest.background.service_worker, "src/background/service-worker.js");
  assert.equal(manifest.background.type, "module");
  assert.deepEqual(manifest.content_scripts[0].js, ["src/content/provider-page.js"]);
  assert.ok(manifest.permissions.includes("sidePanel"));
  assert.ok(manifest.permissions.includes("storage"));
  assert.ok(manifest.permissions.includes("tabs"));
});

test("manifest has host permissions for ChatGPT, Gemini, and Grok", async () => {
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));

  assert.ok(manifest.host_permissions.includes("https://chatgpt.com/*"));
  assert.ok(manifest.host_permissions.includes("https://chat.openai.com/*"));
  assert.ok(manifest.host_permissions.includes("https://gemini.google.com/*"));
  assert.ok(manifest.host_permissions.includes("https://grok.com/*"));
  assert.ok(manifest.host_permissions.includes("https://x.com/*"));
});
