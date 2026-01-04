"use client";

import { createContext, useContext, useMemo, useState } from "react";
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

export function I18nProvider({ children, initialLocale = defaultLocale }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const dictionary = useMemo(() => dictionaries[locale] ?? dictionaries[defaultLocale], [locale]);

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
