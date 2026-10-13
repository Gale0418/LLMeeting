import { currentLocale, setLocale, normalizeLocale, applyStaticLocale, uiText, t } from "../shared/i18n.js";

export const LOCALE_STORAGE_KEY = "llmeeting.uiLocale.v1";
const DOCUMENT_LANG = { zh_TW: "zh-Hant-TW", en: "en", ja: "ja" };

// Only program-owned persona defaults follow the locale. Edited drafts stay put.
const personaDefaults = new WeakMap();
export function applyLocaleToUi(documentObject) {
  documentObject.documentElement.lang = DOCUMENT_LANG[currentLocale];
  applyStaticLocale(documentObject);
  const label = documentObject.querySelector("#languageLabel");
  if (label) label.textContent = t(currentLocale, "lang.selectLabel");
  for (const field of documentObject.querySelectorAll("textarea[id^='persona']")) {
    let entry = personaDefaults.get(field);
    if (!entry) {
      entry = {source: field.defaultValue, previous: field.defaultValue};
      personaDefaults.set(field, entry);
    }
    if (field.value === entry.previous) {
      field.value = uiText(entry.source);
      entry.previous = field.value;
    }
  }
}

export async function initializeLocale({ documentObject = globalThis.document, storage = globalThis.chrome?.storage?.local } = {}) {
  if (!documentObject) return;
  const select = documentObject.querySelector("#languageSelect");
  const status = documentObject.querySelector("#languageStatus");
  let savedLocale;
  try { savedLocale = (await storage?.get(LOCALE_STORAGE_KEY))?.[LOCALE_STORAGE_KEY]; }
  catch (error) { if (status) status.textContent = uiText(`語言設定讀取失敗：${error.message}`); }
  setLocale(savedLocale);
  if (select) select.value = currentLocale;
  applyLocaleToUi(documentObject);
  let saveQueue = Promise.resolve();
  select?.addEventListener("change", () => {
    const locale = normalizeLocale(select.value);
    setLocale(locale);
    select.value = locale;
    applyLocaleToUi(documentObject);
    const EventType = documentObject.defaultView?.CustomEvent || globalThis.CustomEvent;
    if (EventType && documentObject.dispatchEvent) documentObject.dispatchEvent(new EventType("llmeeting:locale-changed", {detail: {locale}}));
    if (status) status.textContent = "";
    saveQueue = saveQueue.catch(() => {}).then(() => storage?.set({[LOCALE_STORAGE_KEY]: locale})).catch((error) => {
      if (status) status.textContent = uiText(`語言偏好未能保存，這次切換仍會保留在目前視窗。${error.message}`);
    });
  });
  return {flush: () => saveQueue};
}
