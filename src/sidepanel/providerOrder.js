import { PROVIDER_IDS, normalizeProviderIds } from "../shared/providers.js";

// Move existing nodes so keyboard order follows visual order; keep selections,
// draft persona values, event listeners and the focused control intact.
export function reorderProviderControls(selectedIds, doc = document) {
  const ids = [...new Set([...normalizeProviderIds(selectedIds, []), ...PROVIDER_IDS])];
  const focused = doc.activeElement;
  let moved = false;
  const reorder = nodes => {
    const present = nodes.filter(Boolean);
    const parent = present[0]?.parentElement;
    if (!parent || present.some(node => node.parentElement !== parent)) return;
    if (present.every((node, i) => Array.from(parent.children).indexOf(node) === i)) return;
    for (const node of present) parent.appendChild(node);
    moved = true;
  };
  reorder(ids.map(id => doc.querySelector(`[data-provider-toggle="${id}"]`)?.closest(".provider-row")));
  for (const prefix of ["hook", "persona"]) {
    reorder(ids.map(id => doc.querySelector(`#${prefix}${id[0].toUpperCase()}${id.slice(1)}`)?.parentElement));
  }
  const summary = doc.querySelector("#summaryProviderSelect");
  if (summary) {
    const selected = summary.value;
    reorder([...ids.map(id => Array.from(summary.options).find(option => option.value === id)),
      ...Array.from(summary.options).filter(option => !ids.includes(option.value))]);
    summary.value = selected;
  }
  if (moved && focused && doc.activeElement !== focused && focused.isConnected) focused.focus({ preventScroll: true });
}
