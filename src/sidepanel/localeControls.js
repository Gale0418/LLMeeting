import { currentLocale, setLocale, normalizeLocale, resolveSupportedLocale, applyStaticLocale, uiText, t } from "../shared/i18n.js";
import { DEFAULT_LOCALE } from "../shared/i18n-catalog.js";

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

function detectBrowserLocale(browserI18n, navigatorObject) {
  try {
    const language = browserI18n?.getUILanguage?.();
    if (typeof language === "string" && language.trim()) return normalizeLocale(language);
  } catch { /* Use the browser's preferred languages if its UI API is unavailable. */ }
  const languages = Array.isArray(navigatorObject?.languages) ? navigatorObject.languages : [navigatorObject?.language];
  return languages.map(resolveSupportedLocale).find(Boolean) || DEFAULT_LOCALE;
}

export async function initializeLocale({ documentObject = globalThis.document, storage = globalThis.chrome?.storage?.local,
  browserI18n = globalThis.chrome?.i18n, navigatorObject = globalThis.navigator,
  storageChanged = globalThis.chrome?.storage?.onChanged } = {}) {
  if (!documentObject) return;
  const select = documentObject.querySelector("#languageSelect");
  const status = documentObject.querySelector("#languageStatus");
  let savedLocale, readError, changedDuringRead = false, changedPreference;
  const applyPreference = (nextPreference, dispatch = false) => {
    const preference = resolveSupportedLocale(nextPreference) || "auto";
    const locale = preference === "auto" ? detectBrowserLocale(browserI18n, navigatorObject) : preference;
    setLocale(locale);
    if (select) select.value = preference;
    applyLocaleToUi(documentObject);
    if (dispatch) {
      const EventType = documentObject.defaultView?.CustomEvent || globalThis.CustomEvent;
      if (EventType && documentObject.dispatchEvent) documentObject.dispatchEvent(new EventType("llmeeting:locale-changed", {detail: {locale}}));
    }
    return preference;
  };
  const onStorageChanged = (changes, areaName) => {
    if (areaName !== "local" || !Object.hasOwn(changes || {}, LOCALE_STORAGE_KEY)) return;
    const nextPreference = resolveSupportedLocale(changes[LOCALE_STORAGE_KEY]?.newValue) || "auto";
    changedDuringRead = true;
    changedPreference = nextPreference;
    preference = applyPreference(nextPreference, true);
  };
  let preference = "auto";
  storageChanged?.addListener?.(onStorageChanged);
  try { savedLocale = (await storage?.get(LOCALE_STORAGE_KEY))?.[LOCALE_STORAGE_KEY]; }
  catch (error) { readError = error; }
  preference = applyPreference(changedDuringRead ? changedPreference : savedLocale);
  if (readError && status) status.textContent = uiText(`語言設定讀取失敗：${readError.message}`);
  let saveQueue = Promise.resolve();
  const onSelectChange = () => {
    preference = select.value === "auto" ? "auto" : normalizeLocale(select.value);
    applyPreference(preference, true);
    if (status) status.textContent = "";
    const savedPreference = preference;
    saveQueue = saveQueue.catch(() => {}).then(() => storage?.set({[LOCALE_STORAGE_KEY]: savedPreference})).catch((error) => {
      if (status) status.textContent = uiText(`語言偏好未能保存，這次切換仍會保留在目前視窗。${error.message}`);
    });
  };
  select?.addEventListener("change", onSelectChange);
  return {
    flush: () => saveQueue,
    destroy() {
      select?.removeEventListener?.("change", onSelectChange);
      storageChanged?.removeListener?.(onStorageChanged);
    },
  };
}
