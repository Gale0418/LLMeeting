export async function hookTabTitle(tab, providerId, scripting, timeoutMs = 1000) {
  const fallback = tab.title || "";
  if (providerId !== "meta" || !/^Meta AI(?:$|\s*[-–—|])/i.test(fallback) || !scripting?.executeScript
      || tab.status !== "complete") return fallback;
  let url;
  try { url = new URL(tab.url); } catch { return fallback; }
  if (!/^(?:www\.)?meta\.ai$/.test(url.hostname) || !/^\/prompt\/[^/]+\/?$/.test(url.pathname)) return fallback;
  let timer;
  try {
    const results = await Promise.race([
      scripting.executeScript({ target: { tabId: tab.id }, files: ["src/content/conversation-title.js"] }),
      new Promise(resolve => { timer = setTimeout(() => resolve([]), timeoutMs); }),
    ]);
    const metadata = results?.[0]?.result;
    return metadata?.url === tab.url && typeof metadata.title === "string" && metadata.title.trim()
      ? metadata.title : fallback;
  } catch { return fallback; }
  finally { clearTimeout(timer); }
}
