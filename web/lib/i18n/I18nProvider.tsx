"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import en from "../../locales/en/common.json";
import fr from "../../locales/fr/common.json";
import { defaultLocale, type Locale } from "./locales";

type Dictionary = typeof en;

type I18nContextValue = {
  locale: Locale;
  dictionary: Dictionary;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
};

const dictionaries: Record<Locale, Dictionary> = {
  en,
  fr
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const resolveKey = (dictionary: Dictionary, key: string) => {
  return key.split(".").reduce<string | Dictionary>((acc, part) => {
    if (typeof acc === "string") return acc;
    return (acc as Record<string, string | Dictionary>)[part] as string | Dictionary;
  }, dictionary);
};

const detectBrowserLocale = (): Locale => {
  if (typeof window === "undefined") return defaultLocale;
  
  const stored = localStorage.getItem("glou-locale");
  if (stored && (stored === "en" || stored === "fr")) {
    return stored as Locale;
  }

  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith("fr")) {
    return "fr";
  }
  
  return "en";
};

export function I18nProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return initialLocale || defaultLocale;
    return detectBrowserLocale();
  });

  const dictionary = useMemo(() => dictionaries[locale] ?? dictionaries[defaultLocale], [locale]);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof window !== "undefined") {
      localStorage.setItem("glou-locale", newLocale);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const detected = detectBrowserLocale();
      if (detected !== locale) {
        setLocaleState(detected);
      }
    }
  }, []);

  const t = (key: string) => {
    const value = resolveKey(dictionary, key);
    if (typeof value === "string") {
      return value;
    }
    return key;
  };

  const value: I18nContextValue = useMemo(
    () => ({
      locale,
      dictionary,
      setLocale,
      t
    }),
    [locale, dictionary]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useTranslations = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useTranslations must be used within I18nProvider");
  }
  return ctx;
};
