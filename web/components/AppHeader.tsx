"use client";

import { useTranslations } from "../lib/i18n/I18nProvider";
import { type Locale } from "../lib/i18n/locales";

export function AppHeader() {
  const { t, locale, setLocale } = useTranslations();

  const toggleLocale = () => {
    const nextLocale: Locale = locale === "en" ? "fr" : "en";
    setLocale(nextLocale);
  };

  return (
    <header className="app-header">
      <div className="app-header__brand">
        <h1>{t("app.title")}</h1>
        <p className="eyebrow">{t("app.subtitle")}</p>
      </div>
      <div className="app-header__controls">
        <button
          type="button"
          className="ghost icon-button"
          onClick={toggleLocale}
          aria-label={t("header.language")}
          aria-live="polite"
          aria-atomic="true"
          title={t("header.language")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span className="locale-indicator" aria-label={`Current language: ${locale === "fr" ? "Français" : "English"}`}>
            {locale.toUpperCase()}
          </span>
        </button>
      </div>
    </header>
  );
}
