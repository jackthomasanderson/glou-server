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

    // Use custom accent color if set, otherwise default to blue
    const rawAccentColor = user.accentColor || "#2563EB";
    // Ensure the color is valid (not empty and has proper format)
    const isValidColor = rawAccentColor && rawAccentColor.trim() !== "" && rawAccentColor.trim() !== "#";
    const normalizedColor = isValidColor
      ? (rawAccentColor.startsWith("#") ? rawAccentColor : `#${rawAccentColor}`)
      : "#2563EB";

    const accentColor = normalizedColor;
    const accentHover = isValidColor ? adjustColorBrightness(accentColor, -10) : "#1D4ED8";

    root.style.setProperty("--accent", accentColor);
    root.style.setProperty("--accent-hover", accentHover);

    // Helper function to darken color for hover state
    function adjustColorBrightness(hex: string, percent: number): string {
      const num = parseInt(hex.replace("#", ""), 16);
      const amt = Math.round(2.55 * percent);
      const R = (num >> 16) + amt;
      const G = (num >> 8 & 0x00FF) + amt;
      const B = (num & 0x0000FF) + amt;
      return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255))
        .toString(16).slice(1).toUpperCase();
    }
  }, [user]);

  return null;
}
