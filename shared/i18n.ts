import ui from "./locales/ui.json" with { type: "json" };
import workspace from "./locales/workspace.json" with { type: "json" };
import landing from "./locales/landing.json" with { type: "json" };
import learning from "./locales/learning-ui.json" with { type: "json" };
import errors from "./locales/errors.json" with { type: "json" };
import materials from "./locales/materials.json" with { type: "json" };
import journal from "./locales/journal.json" with { type: "json" };
import coursePractice from "./locales/course-practice.json" with { type: "json" };
import drone from "./locales/drone.json" with { type: "json" };

export type Language = "ru" | "kk" | "en";
export const languages: readonly Language[] = ["ru", "kk", "en"];
export const isLanguage = (value: unknown): value is Language =>
  languages.includes(value as Language);
export const languageTags = { ru: "ru-RU", kk: "kk-KZ", en: "en-US" };
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
export const messages = [
  ...ui,
  ...workspace,
  ...landing,
  ...learning,
  ...errors,
  ...materials,
  ...journal,
  ...coursePractice,
  ...drone,
];
const dictionary = new Map(
  messages.map(([ru, en, kk]) => [normalize(ru), { en, kk }]),
);
const patterns = [...dictionary]
  .filter(([key]) => /\{\d+\}/.test(key))
  .sort(
    ([a], [b]) =>
      b.replace(/\{\d+\}/g, "").length - a.replace(/\{\d+\}/g, "").length,
  )
  .map(([key, translations]) => {
    const slots: number[] = [];
    const pattern = key
      .split(/(\{\d+\})/)
      .map((part) => {
        if (/^\{\d+\}$/.test(part)) {
          slots.push(Number(part.slice(1, -1)));
          return "(.+?)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    return { regex: new RegExp(`^${pattern}$`), slots, translations };
  });

/** Translate display text only. Never use on identifiers, code or user-authored content. */
export function translate<T>(value: T, language: Language, depth = 0): T {
  if (typeof value !== "string" || language === "ru" || depth > 4) return value;
  const key = normalize(value);
  const exact = dictionary.get(key)?.[language];
  let translated = exact;
  if (translated === undefined) {
    for (const { regex, slots, translations } of patterns) {
      const match = regex.exec(key);
      if (!match) continue;
      translated = translations[language].replace(/\{(\d+)\}/g, (_, slot) => {
        const index = slots.indexOf(Number(slot));
        return translate(match[index + 1], language, depth + 1);
      });
      break;
    }
  }
  if (translated === undefined) return value;
  const leading = value.match(/^\s*/)?.[0] || "";
  const trailing = value.match(/\s*$/)?.[0] || "";
  return (leading + translated + trailing) as T;
}
