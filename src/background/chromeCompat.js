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
