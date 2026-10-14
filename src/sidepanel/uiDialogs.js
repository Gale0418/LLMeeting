import { uiText } from "../shared/i18n.js";

const TITLE_TEXT = "LLMeeting";
let dialogSequence = 0;

/** Create queued, locale-aware native HTML dialogs for the side panel. */
export function createUiDialogs({ documentObject = globalThis.document } = {}) {
  let dialog;
  let title;
  let body;
  let confirmButton;
  let cancelButton;
  let activeResolve;
  let localeListenerAttached = false;
  let queue = Promise.resolve();

  function updateLocale() {
    if (title) title.textContent = uiText(TITLE_TEXT);
    if (confirmButton) confirmButton.textContent = uiText("確定");
    if (cancelButton) cancelButton.textContent = uiText("取消");
    if (body) body.textContent = uiText(body.textContent);
  }

  function ensureDialog() {
    if (dialog) return dialog;
    if (!documentObject?.createElement || !documentObject?.body?.appendChild) return null;

    const id = `llmeeting-ui-dialog-${++dialogSequence}`;
    dialog = documentObject.createElement("dialog");
    dialog.className = "ui-dialog";
    dialog.setAttribute("aria-labelledby", `${id}-title`);
    dialog.setAttribute("aria-describedby", `${id}-body`);

    title = documentObject.createElement("h2");
    title.id = `${id}-title`;
    title.className = "ui-dialog__title";
    title.textContent = uiText(TITLE_TEXT);

    body = documentObject.createElement("p");
    body.id = `${id}-body`;
    body.className = "ui-dialog__body";

    const actions = documentObject.createElement("div");
    actions.className = "ui-dialog__actions";
    confirmButton = documentObject.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "ui-dialog__button ui-dialog__button--confirm";
    cancelButton = documentObject.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "ui-dialog__button ui-dialog__button--cancel";
    actions.append(confirmButton, cancelButton);
    dialog.append(title, body, actions);

    const owner = dialog;
    confirmButton.addEventListener("click", () => { if (dialog === owner) finish(true); });
    cancelButton.addEventListener("click", () => { if (dialog === owner) finish(false); });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (dialog === owner) finish(false);
    });
    dialog.addEventListener("close", () => { if (dialog === owner) finish(false); });

    updateLocale();
    return dialog;
  }

  function finish(result) {
    if (!activeResolve) return;
    const resolve = activeResolve;
    activeResolve = null;
    const previousFocus = dialog?.__previousFocus;
    delete dialog.__previousFocus;
    if (dialog?.open) {
      try { dialog.close(); } catch { /* A close event may already be in flight. */ }
    }
    if (localeListenerAttached) {
      documentObject.removeEventListener?.("llmeeting:locale-changed", updateLocale);
      localeListenerAttached = false;
    }
    dialog?.remove();
    dialog = title = body = confirmButton = cancelButton = null;
    try { previousFocus?.focus?.(); } catch { /* Focus restoration is best effort. */ }
    resolve(result);
  }

  function run(kind, message) {
    const node = ensureDialog();
    if (!node || typeof node.showModal !== "function") return Promise.resolve(false);

    return new Promise((resolve) => {
      activeResolve = resolve;
      node.__previousFocus = documentObject.activeElement;
      body.textContent = String(message ?? "");
      cancelButton.hidden = kind === "alert";
      updateLocale();
      if (!localeListenerAttached) {
        documentObject.addEventListener?.("llmeeting:locale-changed", updateLocale);
        localeListenerAttached = true;
      }
      try {
        documentObject.body.appendChild(node);
        node.showModal();
      } catch {
        finish(false);
        return;
      }
      (kind === "alert" ? confirmButton : cancelButton).focus();
    });
  }

  function enqueue(kind, message) {
    const result = queue.then(() => run(kind, message), () => run(kind, message));
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    alert(message) { return enqueue("alert", message).then(() => undefined); },
    confirm(message) { return enqueue("confirm", message).then((result) => result === true); },
  };
}
