import { useSyncExternalStore } from "react";
import {
  isLanguage,
  translate,
  languageTags,
  type Language,
} from "../../shared/i18n";

export const LANGUAGE_STORAGE_KEY = "easycode:language";
function storedLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : "ru";
  } catch {
    return "ru";
  }
}
let language: Language =
  typeof window === "undefined" ? "ru" : storedLanguage();
const listeners = new Set<() => void>();
export const getLanguage = () => language;
export const getLanguageTag = () => languageTags[language];
export const t = <T>(value: T): T => translate(value, language);
export function setLanguage(next: Language) {
  if (!isLanguage(next)) return;
  language = next;
  if (typeof document !== "undefined") document.documentElement.lang = next;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  } catch {
    /* Session-only preference. */
  }
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage, () => "ru" as Language);
}
if (typeof window !== "undefined") {
  document.documentElement.lang = language;
  window.addEventListener("storage", (event) => {
    if (event.key !== LANGUAGE_STORAGE_KEY) return;
    language = isLanguage(event.newValue) ? event.newValue : "ru";
    document.documentElement.lang = language;
    listeners.forEach((listener) => listener());
  });
}
