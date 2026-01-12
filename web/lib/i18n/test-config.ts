import i18n from "i18next";
import { initReactI18next } from "react-i18next";

i18n.use(initReactI18next).init({
  lng: "fr",
  fallbackLng: "fr",
  resources: {
    fr: {
      translation: {
        loading: "Chargement...",
        foodPairing: {
          suggestFood: "Idées d'accords mets",
          error: "Erreur IA",
        },
      },
    },
  },
  interpolation: { escapeValue: false },
});

export default i18n;
