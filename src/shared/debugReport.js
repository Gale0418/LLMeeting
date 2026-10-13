// Export diagnostics only; conversation bodies and page URLs stay in the browser.
const text = (value, limit = 500) => String(value ?? "").slice(0, limit);
const errorText = (value) => text(String(value ?? "").replace(/https?:\/\/[^\s）)\]"<>]+/gi, "[網址已遮蔽]"));
export function buildDebugReport(state = {}, version = "", now = Date.now()) {
  return {
    schemaVersion: 1, version: text(version, 80), exportedAt: new Date(now).toISOString(),
    status: text(state.status, 80), phase: text(state.phase, 80),
    departures: (state.departures || state.transcript?.departures || []).slice(-20).map((entry) => ({
      provider: text(entry.provider, 30), departedAt: entry.departedAt,
    })),
    faults: (state.debugEvents || []).slice(-100).map((entry) => ({
      timestamp: entry.timestamp, provider: text(entry.provider, 30), phase: text(entry.phase, 80),
      stage: text(entry.stage, 80), code: text(entry.code, 80), message: errorText(entry.message),
      input: inputDetails(entry.debugDetails),
    })),
    manualRepairs: (state.transcript?.manualRepairs || []).slice(-100).map((entry) => ({
      provider: text(entry.provider, 30), phase: text(entry.phase, 80), repairedAt: entry.repairedAt,
      originalError: errorText(entry.originalError),
    })),
    providers: Object.entries(state.providerDiagnostics || {}).map(([provider, entry]) => ({
      provider: text(provider, 30), stage: text(entry.stage, 80), phase: text(entry.phase, 80),
      error: errorText(entry.error),
    })),
  };
}

function inputDetails(details) {
  if (!details || typeof details !== "object") return undefined;
  const result = {};
  for (const key of ["expectedLength", "actualLength", "expectedLines", "actualLines", "firstMismatch", "connected", "focused", "selectionInside", "expectedUserTurns", "actualUserTurns"]) {
    if (typeof details[key] === "boolean" || Number.isFinite(details[key])) result[key] = details[key];
  }
  for (const key of ["reason", "editorTag"]) {
    if (typeof details[key] === "string") result[key] = text(details[key], 80);
  }
  return result;
}
