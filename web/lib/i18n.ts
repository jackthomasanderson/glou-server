'use client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';

// ISSUE_383: both locale files (~160KB combined) used to be static imports,
// so every page's JS bundle carried both languages' full translations even
// for a guest hitting a lightweight page like /login or a shared link.
// HttpBackend fetches only the active language's file at startup, from the
// same static files now served as-is from public/locales/.
//
// `useSuspense: false`: with the resources no longer available
// synchronously at init, the default (Suspense) would require wrapping
// every `useTranslation()` consumer's ancestor tree in a loading boundary.
// Falling back to the key itself until the fetch resolves is a much
// smaller change, and the fetch is a same-origin static file — fast enough
// that no caller has reported seeing raw keys in practice.
i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en'],
    ns: ['common'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
