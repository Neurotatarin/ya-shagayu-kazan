import { useSyncExternalStore } from "react";
import { messages } from "./messages";
import { platform } from "../platform/runtime";

export const languages = ["ru", "en", "ar"] as const;
export type Language = typeof languages[number];
export const languageNames: Record<Language, string> = { ru: "Русский", en: "English", ar: "العربية" };
export const isLanguage = (value: unknown): value is Language => languages.includes(value as Language);
const storageKey = "kazan:language:v1";
let language: Language = "ru";
try { const saved = localStorage.getItem(storageKey); if (isLanguage(saved)) language = saved; } catch { /* Session language still works without storage. */ }
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

function applyLanguage() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  document.title = translate("Я шагаю по Казани", language);
}
export function getLanguage() { return language; }
export function setLanguage(next: Language) {
  if (!isLanguage(next) || next === language) return;
  language = next;
  try { localStorage.setItem(storageKey, next); } catch { /* Keep the session choice. */ }
  applyLanguage();
  for (const listener of listeners) listener();
}
window.addEventListener("storage", event => { if (event.key === storageKey && isLanguage(event.newValue)) setLanguage(event.newValue); });

type Values = Record<string | number, string | number>;
const sourceKeys = new Map(Object.entries(messages).flatMap(([source, translations]) => translations.map(text => [text, source] as const)));
export function translate(message: string, locale: Language, values: Values = {}): string {
  const source = messages[message] ? message : sourceKeys.get(message) ?? message;
  const pair = messages[source];
  const text = locale === "ru" ? source : pair?.[locale === "en" ? 0 : 1] ?? message;
  const deviceText = platform === "android" ? text.replace(/iPhone/g, "Android") : text;
  return deviceText.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
}
export function t(message: string, values?: Values) { return translate(message, language, values); }
export function useI18n() { return { language: useSyncExternalStore(subscribe, getLanguage), t }; }
export const numberLocale = (locale = language) => locale === "ar" ? "ar-u-nu-latn" : locale === "en" ? "en-GB" : "ru-RU";
export function countPlaces(count: number) {
  if (language === "en") return `${count} ${count === 1 ? "place" : "places"}`;
  if (language === "ar") return `${count} ${count === 1 ? "مكان" : count === 2 ? "مكانان" : "أماكن"}`;
  return `${count} ${{ one: "место", few: "места", many: "мест", other: "мест" }[new Intl.PluralRules("ru").select(count) as "one" | "few" | "many" | "other"]}`;
}
applyLanguage();
