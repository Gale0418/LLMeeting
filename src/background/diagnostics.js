export function createProviderDiagnostics(providerIds = []) {
  return Object.fromEntries(providerIds.map((providerId) => [
    providerId,
    {
      stage: "idle",
      phase: "",
      tabId: null,
      url: "",
      error: "",
    },
  ]));
}

export function updateProviderDiagnostic(diagnostics, providerId, patch) {
  return {
    ...diagnostics,
    [providerId]: {
      stage: "idle",
      phase: "",
      tabId: null,
      url: "",
      error: "",
      ...diagnostics?.[providerId],
      ...patch,
    },
  };
}
