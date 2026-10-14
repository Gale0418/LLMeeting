import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("extension descriptions resolve in all three packaged locales", async () => {
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
  assert.equal(manifest.default_locale, "en");
  assert.equal(manifest.description, "__MSG_extensionDescription__");
  for (const locale of ["zh_TW", "en", "ja"]) {
    const messages = JSON.parse(await readFile(`_locales/${locale}/messages.json`, "utf8"));
    assert.ok(messages.extensionDescription.message.length > 0);
  }
  const packager = await readFile("scripts/package-extension.mjs", "utf8");
  assert.match(packager, /INCLUDED_PATHS[^;]*"_locales"/);
});

test("manifest declares the side-panel MV3 extension shell", async () => {
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(manifest.name, "LLMeeting");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.version, packageJson.version);
  assert.equal(manifest.version, "0.5.1");
  assert.equal(packageJson.version, "0.5.1");
  assert.equal(manifest.action.default_title, "LLMeeting");
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.side_panel.default_path, "src/sidepanel/index.html");
  assert.deepEqual(manifest.options_ui, { page: "src/options/index.html", open_in_tab: false });
  const optionsHtml = await readFile(manifest.options_ui.page, "utf8");
  const panelHtml = await readFile(manifest.side_panel.default_path, "utf8");
  for (const id of ["languageSelect", "circuitBackgroundToggle", "circuitMotionToggle"]) {
    assert.ok(optionsHtml.includes(`id="${id}"`), `${id} is available in extension options`);
    assert.ok(!panelHtml.includes(`id="${id}"`), `${id} no longer occupies the side panel`);
  }
  assert.equal(manifest.background.service_worker, "src/background/service-worker.js");
  assert.equal(manifest.background.type, "module");
  assert.deepEqual(
    manifest.content_scripts[0].js,
    [
      "src/content/automation-core.js",
      "src/content/provider-driver.js",
      "src/content/provider-adapters.js",
      "src/content/provider-page.js",
    ],
  );
  assert.ok(manifest.permissions.includes("sidePanel"));
  assert.ok(manifest.permissions.includes("storage"));
  assert.ok(manifest.permissions.includes("tabs"));
});

test("manifest has host permissions for the proven providers and Meta AI beta", async () => {
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));

  assert.ok(manifest.host_permissions.includes("https://chatgpt.com/*"));
  assert.ok(manifest.host_permissions.includes("https://chat.openai.com/*"));
  assert.ok(manifest.host_permissions.includes("https://gemini.google.com/*"));
  assert.ok(manifest.host_permissions.includes("https://grok.com/*"));
  assert.ok(manifest.host_permissions.includes("https://x.com/i/grok*"));
  assert.ok(manifest.host_permissions.includes("https://claude.ai/*"));
  assert.ok(manifest.content_scripts[0].matches.includes("https://claude.ai/*"));
  assert.ok(manifest.host_permissions.includes("https://www.meta.ai/*"));
  assert.ok(manifest.host_permissions.includes("https://meta.ai/*"));
  assert.ok(manifest.content_scripts[0].matches.includes("https://www.meta.ai/*"));
});
