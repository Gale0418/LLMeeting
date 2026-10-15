import { pendingReplyRepairs } from "../shared/meetingRecovery.js";
import { PROVIDERS } from "../shared/providers.js";
import { isProviderTabReady } from "./chromeCompat.js";

// Focus once when pausing. Never reopen a closed tab, navigate, resend, or trap user focus.
export async function focusPendingRepairTab(state, tabs, assertCurrent = () => {}, windows) {
  const pending = pendingReplyRepairs(state);
  for (const repair of pending) {
    assertCurrent();
    const diagnostic = state.providerDiagnostics?.[repair.provider];
    const tabId = diagnostic?.phase === repair.phase && Number.isInteger(diagnostic.tabId)
      ? diagnostic.tabId : state.providerTabs?.[repair.provider];
    if (!Number.isInteger(tabId)) continue;
    let tab;
    try { tab = await tabs.get(tabId); } catch { assertCurrent(); continue; }
    assertCurrent();
    const provider = PROVIDERS.find(item => item.id === repair.provider);
    if (!isProviderTabReady(tab, provider)) continue;
    try { await tabs.update(tabId, { active: true }); } catch { assertCurrent(); continue; }
    assertCurrent();
    if (Number.isInteger(tab.windowId) && typeof windows?.update === "function") {
      try { await windows.update(tab.windowId, { focused: true }); } catch { /* A closed window must not break recovery. */ }
      assertCurrent();
    }
    return repair.provider;
  }
  return null;
}
