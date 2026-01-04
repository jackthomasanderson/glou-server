"use client";

import { useEffect } from "react";
import { useTranslations } from "../lib/i18n/I18nProvider";

interface PageTitleProps {
  pageKey: string;
  suffix?: string;
}

/**
 * Composant pour gérer le titre de la page dynamiquement
 * Pattern: "Glou - [Zone]" traduit selon la langue active
 */
export function PageTitle({ pageKey, suffix }: PageTitleProps) {
  const { t } = useTranslations();

  useEffect(() => {
    const appName = t("app.name");
    const pageTitle = t(`pageTitles.${pageKey}`);
    const fullTitle = suffix 
      ? `${appName} - ${pageTitle} - ${suffix}`
      : `${appName} - ${pageTitle}`;
    
    document.title = fullTitle;
  }, [t, pageKey, suffix]);

  return null;
}
