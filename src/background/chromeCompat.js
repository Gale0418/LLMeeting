export async function setSidePanelOpenOnActionClick(chromeApi) {
  const setPanelBehavior = chromeApi?.sidePanel?.setPanelBehavior;
  if (typeof setPanelBehavior !== "function") {
    return false;
  }

  try {
    await setPanelBehavior({ openPanelOnActionClick: true });
    return true;
  } catch (_error) {
    return false;
  }
}

export function urlMatchesPattern(url, pattern) {
  if (!url || !pattern) {
    return false;
  }

  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");

  return new RegExp(`^${escaped}$`).test(url);
}

export function isProviderTabReady(tab, provider) {
  return Boolean(
    tab &&
    tab.status === "complete" &&
    provider?.matchPatterns?.some((pattern) => urlMatchesPattern(tab.url, pattern)),
  );
}
