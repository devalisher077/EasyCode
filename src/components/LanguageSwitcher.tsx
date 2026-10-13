import { getLanguage, setLanguage, useLanguage } from "../lib/i18n";
import { isLanguage } from "../../shared/i18n";
import "./language-switcher.css";

export function LanguageSwitcher() {
  const language = useLanguage();
  return (
    <label className="language-switcher">
      <span className="sr-only">
        {language === "kk" ? "Тіл" : language === "en" ? "Language" : "Язык"}
      </span>
      <select
        value={language}
        onChange={(event) => {
          const next = event.target.value;
          if (isLanguage(next) && next !== getLanguage()) setLanguage(next);
        }}
      >
        <option value="ru" lang="ru">
          Русский
        </option>
        <option value="kk" lang="kk">
          Қазақша
        </option>
        <option value="en" lang="en">
          English
        </option>
      </select>
    </label>
  );
}
