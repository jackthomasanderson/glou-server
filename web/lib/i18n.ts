'use client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';


import frMessages from '../public/locales/fr/common.json';
import enMessages from '../public/locales/en/common.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      fr: { common: frMessages },
      en: { common: enMessages },
    },
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en'],
    ns: ['common'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
