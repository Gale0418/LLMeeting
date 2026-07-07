import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("manifest declares the side-panel MV3 extension shell", async () => {
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(manifest.name, "LLMeeting");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.version, packageJson.version);
  assert.equal(manifest.version, "0.4.6");
  assert.equal(packageJson.version, "0.4.6");
  assert.equal(manifest.action.default_title, "LLMeeting");
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.side_panel.default_path, "src/sidepanel/index.html");
  assert.equal(manifest.background.service_worker, "src/background/service-worker.js");
  assert.equal(manifest.background.type, "module");
  assert.deepEqual(
    manifest.content_scripts[0].js,
    ["src/content/automation-core.js", "src/content/provider-page.js"],
  );
  assert.ok(manifest.permissions.includes("sidePanel"));
  assert.ok(manifest.permissions.includes("storage"));
  assert.ok(manifest.permissions.includes("tabs"));
});

test("manifest has host permissions for ChatGPT, Gemini, Grok, and optional Claude", async () => {
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));

  assert.ok(manifest.host_permissions.includes("https://chatgpt.com/*"));
  assert.ok(manifest.host_permissions.includes("https://chat.openai.com/*"));
  assert.ok(manifest.host_permissions.includes("https://gemini.google.com/*"));
  assert.ok(manifest.host_permissions.includes("https://grok.com/*"));
  assert.ok(manifest.host_permissions.includes("https://x.com/i/grok*"));
  assert.ok(manifest.host_permissions.includes("https://claude.ai/*"));
  assert.ok(manifest.content_scripts[0].matches.includes("https://claude.ai/*"));
});
