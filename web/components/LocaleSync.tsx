"use client";

import { useEffect } from "react";
import { useTranslations } from "../lib/i18n/I18nProvider";

export function LocaleSync() {
  const { locale } = useTranslations();

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  return null;
}
