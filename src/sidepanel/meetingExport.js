export function hasTranscriptContent(transcript) {
  if (!transcript || typeof transcript !== "object") return false;
  return Object.values(transcript).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return hasTranscriptContent(value);
    return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
  });
}

export function canExportMeeting(state) {
  return hasTranscriptContent(state?.transcript);
}

/** Attach the full-meeting export action while keeping the download mechanics injectable for tests. */
export function attachMeetingExport({
  button,
  sendMessage = (message) => globalThis.chrome.runtime.sendMessage(message),
  documentObject = globalThis.document,
  createObjectURL = (blob) => globalThis.URL.createObjectURL(blob),
  revokeObjectURL = (url) => globalThis.URL.revokeObjectURL(url),
  BlobClass = globalThis.Blob,
  now = () => new Date(),
  getVersion = () => globalThis.chrome.runtime.getManifest().version,
  onError = () => {},
} = {}) {
  if (!button) return () => {};

  button.disabled = true;
  button.addEventListener("click", async () => {
    try {
      const response = await sendMessage({ type: "aiDebate:exportMeeting" });
      if (!response?.ok || response.export?.schemaVersion !== 1) {
        throw new Error(response?.error || "匯出資料格式不完整");
      }
      const exportedAt = now().toISOString().replace(/[:.]/g, "-");
      const report = { ...response.export, version: response.export.version ?? getVersion() };
      const url = createObjectURL(new BlobClass([JSON.stringify(report, null, 2)], {
        type: "application/json;charset=utf-8",
      }));
      const link = documentObject.createElement("a");
      link.href = url;
      link.download = `llmeeting-meeting-${exportedAt}.json`;
      link.click();
      setTimeout(() => revokeObjectURL(url), 1000);
    } catch (error) {
      onError(error);
    }
  });

  return (state) => {
    button.disabled = !canExportMeeting(state);
  };
}
