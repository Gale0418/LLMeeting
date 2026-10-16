// Read-only metadata probe. Never read response text or other conversations.
(() => {
  if (!/^(?:www\.)?meta\.ai$/.test(location.hostname) || !/^\/prompt\/[^/]+\/?$/.test(location.pathname)) return null;
  const titles = new Set();
  for (const link of document.querySelectorAll('a[data-sidebar="menu-button"][data-active="true"][href]')) {
    let url;
    try { url = new URL(link.getAttribute("href"), location.href); } catch { continue; }
    if (url.origin !== location.origin || url.pathname.replace(/\/$/, "") !== location.pathname.replace(/\/$/, "")) continue;
    const title = String(link.innerText || "").trim();
    if (title && title.length <= 200 && !/[\r\n]/.test(title)) titles.add(title);
  }
  return titles.size === 1 ? { title: [...titles][0], url: location.href } : null;
})();
