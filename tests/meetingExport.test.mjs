import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { attachMeetingExport, canExportMeeting, hasTranscriptContent } from "../src/sidepanel/meetingExport.js";
import { setLocale, uiText } from "../src/shared/i18n.js";

test("full meeting export is available wherever transcript content remains", () => {
  assert.equal(hasTranscriptContent({ answers: {} }), false);
  assert.equal(hasTranscriptContent({ answers: { chatgpt: "   " } }), false);
  assert.equal(hasTranscriptContent({ answers: { chatgpt: "回答" } }), true);
  assert.equal(canExportMeeting({ status: "running", transcript: { answers: { chatgpt: "回答" } } }), true);
  assert.equal(canExportMeeting({ status: "waiting_for_user", transcript: { answers: { chatgpt: "回答" } } }), true);
  assert.equal(canExportMeeting({ status: "done", transcript: { answers: { chatgpt: "回答" } } }), true);
  assert.equal(canExportMeeting({ status: "idle", transcript: { answers: { chatgpt: "回答" } } }), true);
  assert.equal(canExportMeeting({ status: "error", transcript: { answers: { chatgpt: "回答" } } }), true);
  assert.equal(canExportMeeting({ status: "running", transcript: { answers: {} } }), false);
});

test("meeting export requests and downloads the complete Unicode JSON payload", async () => {
  const button = { disabled: false, listeners: {}, addEventListener(type, listener) { this.listeners[type] = listener; } };
  const providerEvents = [{ provider: "chatgpt", phase: "answer", inputPrompt: "原提示", response: "完整回答" }];
  const exported = {
    schemaVersion: 1, version: "0.5.1", exportedAt: "2026-11-15T01:00:00.000Z",
    transcript: { answers: { chatgpt: "繁體中文內容" } }, status: "done", phase: "done", mode: "theater",
    summaries: {}, sourceSummary: "來源摘要", summary: "最終摘要", reveal: {}, providerEvents,
    completeness: { legacy: false, missing: [], saveFailed: false },
  };
  const downloaded = [];
  let sentMessage;
  let capturedBlob;
  const updateAvailability = attachMeetingExport({
    button,
    sendMessage: async (message) => { sentMessage = message; return { ok: true, export: exported }; },
    documentObject: { createElement: () => ({ click() { downloaded.push(this); } }) },
    createObjectURL: (blob) => { capturedBlob = blob; return "blob:meeting"; },
    revokeObjectURL() {},
    now: () => new Date("2026-11-15T02:03:04.000Z"),
  });

  updateAvailability({ status: "running", transcript: exported.transcript });
  assert.equal(button.disabled, false);
  await button.listeners.click();
  assert.deepEqual(sentMessage, { type: "aiDebate:exportMeeting" });
  assert.equal(downloaded.length, 1);
  assert.equal(downloaded[0].href, "blob:meeting");
  assert.equal(downloaded[0].download, "llmeeting-meeting-2026-11-15T02-03-04-000Z.json");
  assert.match(capturedBlob.type, /application\/json;charset=utf-8/);
  assert.deepEqual(JSON.parse(await capturedBlob.text()), exported);
  assert.deepEqual(JSON.parse(await capturedBlob.text()).providerEvents, providerEvents);
});

test("meeting export failures are surfaced and catalog copy is localized in all three languages", async () => {
  const errors = [];
  const button = { disabled: false, addEventListener(type, listener) { this.listener = listener; } };
  attachMeetingExport({ button, sendMessage: async () => ({ ok: false, error: "save failed" }), onError: (error) => errors.push(error) });
  await button.listener();
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /save failed/);

  try {
    const expected = { zh_TW: "下載整場對話", en: "Download full meeting", ja: "会話全体をダウンロード" };
    for (const [locale, label] of Object.entries(expected)) {
      setLocale(locale);
      assert.equal(uiText("下載整場對話"), label);
      assert.ok(uiText("此下載檔包含對話原文與提示內容，請妥善保管。"));
    }
  } finally {
    setLocale("en");
  }
  const html = await readFile("src/sidepanel/index.html", "utf8");
  assert.match(html, /id="downloadMeetingButton"/);
  assert.match(html, /對話原文與提示內容/);
});
