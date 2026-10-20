'use client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import { safeReadStorage, safeWriteStorage } from './safe-storage';

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
//
// #495: an English user used to download the French file too, because
// i18next always loads `fallbackLng` and the app started in French before
// switching. It now starts in the language the user will actually see (the
// last one used on this device, else the browser's) and loads no fallback:
// both files carry the same keys (web/lib/__tests__/i18n-parity.test.ts).
// ThemeWrapper keeps the boot placeholder up until that file has arrived,
// so raw keys never flash.
const LANG_STORAGE_KEY = 'glou:lang';

function initialLanguage(): 'fr' | 'en' {
  if (typeof window === 'undefined') return 'fr';
  const saved = safeReadStorage(window.localStorage, LANG_STORAGE_KEY);
  if (saved === 'fr' || saved === 'en') return saved;
  const browser = (navigator.languages?.[0] ?? navigator.language ?? '').slice(0, 2).toLowerCase();
  return browser === 'en' ? 'en' : 'fr';
}

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    lng: initialLanguage(),
    fallbackLng: false,
    load: 'currentOnly',
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

if (typeof window !== 'undefined') {
  i18n.on('languageChanged', (lng) => safeWriteStorage(window.localStorage, LANG_STORAGE_KEY, lng));
}

export default i18n;
