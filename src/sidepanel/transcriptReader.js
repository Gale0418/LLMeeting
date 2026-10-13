/**
 * Incrementally renders transcript HTML while keeping the reader's position.
 * Pass already escaped and localized HTML to render(). The supplied document
 * must support template elements, and element must be the scroll container.
 */
export function createTranscriptReader({ element, latestButton, announcement, documentObject, translate }) {
  let hasRendered = false;
  let announcementVersion = 0;
  const lastRenderedSignature = new WeakMap();

  const isAtBottom = () => element.scrollHeight - element.clientHeight - element.scrollTop <= 48;

  function jumpToLatest() {
    element.scrollTop = element.scrollHeight;
    latestButton.hidden = true;
    element.focus?.({ preventScroll: true });
  }

  function announceNewContent() {
    if (!announcement) return;
    const text = translate("有新內容；閱讀位置已保留。");
    const version = ++announcementVersion;
    if (announcement.textContent === text) {
      announcement.textContent = "";
      queueMicrotask(() => {
        if (version === announcementVersion) announcement.textContent = text;
      });
    } else {
      announcement.textContent = text;
    }
  }

  latestButton.addEventListener("click", jumpToLatest);
  element.addEventListener("scroll", () => {
    if (isAtBottom()) latestButton.hidden = true;
  });

  function render(html, { announce = true } = {}) {
    if (!announce) announcementVersion += 1;
    const wasAtBottom = isAtBottom();
    const oldScrollTop = element.scrollTop;
    const previousLatestHidden = latestButton.hidden;
    const containerTop = element.getBoundingClientRect?.().top;
    const anchor = Number.isFinite(containerTop)
      ? Array.from(element.childNodes).find(node => {
        if (node.nodeType !== 1 || typeof node.getBoundingClientRect !== "function") return false;
        return node.getBoundingClientRect().bottom > containerTop;
      })
      : null;
    const anchorTop = anchor?.getBoundingClientRect().top;
    const template = documentObject.createElement("template");
    template.innerHTML = String(html);
    const newNodes = Array.from(template.content.childNodes);
    const oldNodes = Array.from(element.childNodes);
    const oldBySignature = new Map();
    for (const node of oldNodes) {
      const signature = lastRenderedSignature.get(node) ?? nodeSignature(node);
      let queue = oldBySignature.get(signature);
      if (!queue) oldBySignature.set(signature, queue = []);
      queue.push(node);
    }
    const reused = new Set();
    let changed = false;

    // Signatures index existing nodes once, so insertions do not rescan the
    // remaining transcript. isEqualNode guards each reuse.
    for (let index = 0; index < newNodes.length; index += 1) {
      const wanted = newNodes[index];
      const current = element.childNodes[index];
      const signature = nodeSignature(wanted);
      let retained = current && !reused.has(current)
        && (lastRenderedSignature.get(current) === signature || current.isEqualNode(wanted)) ? current : null;
      const queue = oldBySignature.get(signature);
      if (!retained && queue) {
        while (queue.length && !retained) {
          const candidate = queue.pop();
          if (!reused.has(candidate)
            && (lastRenderedSignature.get(candidate) === signature || candidate.isEqualNode(wanted))) retained = candidate;
        }
      }

      if (retained) {
        reused.add(retained);
        lastRenderedSignature.set(retained, signature);
        if (retained !== current) {
          element.insertBefore(retained, current ?? null);
          changed = true;
        }
      } else {
        const inserted = wanted.cloneNode(true);
        lastRenderedSignature.set(inserted, signature);
        element.insertBefore(inserted, current ?? null);
        changed = true;
      }
    }

    for (const node of oldNodes) {
      if (!reused.has(node) && node.parentNode === element) {
        element.removeChild(node);
        changed = true;
      }
    }

    if (changed) {
      if (wasAtBottom) {
        element.scrollTop = element.scrollHeight;
      } else {
        const updatedAnchorTop = anchor?.parentNode === element
          ? anchor.getBoundingClientRect().top
          : null;
        element.scrollTop = Number.isFinite(anchorTop) && Number.isFinite(updatedAnchorTop)
          ? oldScrollTop + updatedAnchorTop - anchorTop
          : oldScrollTop;
      }
      if (announce && hasRendered) announceNewContent();
    } else if (!wasAtBottom) {
      element.scrollTop = oldScrollTop;
    }
    latestButton.hidden = announce ? (wasAtBottom ? true : !changed ? previousLatestHidden : false) : previousLatestHidden;

    hasRendered = true;
    return changed;
  }

  return { render, jumpToLatest };
}

function nodeSignature(node) {
  if (node.nodeType === 1) return `element:${node.outerHTML}`;
  if (node.nodeType === 3) return `text:${node.nodeValue}`;
  return `node:${node.nodeType}:${node.nodeValue}`;
}
