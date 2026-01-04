"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { useAuth } from "../lib/auth/AuthContext";

export function AppHeaderClient() {
  const { t, locale, setLocale } = useTranslations();
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const toggleLocale = () => {
    setLocale(locale === "en" ? "fr" : "en");
  };

  if (!isHydrated) {
    return null; // Avoid hydration mismatch by rendering nothing on server
  }

  const avatarLabel = user?.username?.trim()?.[0]?.toUpperCase() || "?";

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <header className="app-header">
      <div className="app-header__brand">
        <h1>{t("app.title")}</h1>
        <p className="eyebrow">{t("app.subtitle")}</p>
      </div>
      <div className="app-header__controls">
        {isAuthenticated && (
          <button
            type="button"
            className="ghost icon-button"
            onClick={handleLogout}
            aria-label={t("auth.logout")}
            title={t("auth.logout")}
          >
            <span className="avatar-badge" aria-hidden="true">
              {avatarLabel}
            </span>
          </button>
        )}
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
        </button>
      </div>
    </header>
  );
}
