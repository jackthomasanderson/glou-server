"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTranslations } from "@/lib/i18n/I18nProvider";

export function UserPreferencesSync() {
  const { user } = useAuth();
  const { locale, setLocale } = useTranslations();

  useEffect(() => {
    if (!user) return;

    if (user.preferredLocale && user.preferredLocale !== locale) {
      setLocale(user.preferredLocale);
    }
  }, [user, locale, setLocale]);

  useEffect(() => {
    if (!user) return;

    const root = document.documentElement;
    let theme = user.themeMode ?? "dark";

    if (theme === "auto") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      theme = isDark ? "dark" : "light";
    }

    if (theme === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
    }

    if (user.accentColor) {
      root.style.setProperty("--accent", user.accentColor);
    }
  }, [user]);

  return null;
}
