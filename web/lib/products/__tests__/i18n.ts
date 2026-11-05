import i18next from 'i18next';
import fr from '../../../public/locales/fr/common.json';

/** The real French bundle, so the tests read the exact words of ux-ui.md §10. */
export async function frenchT() {
  const instance = i18next.createInstance();
  await instance.init({ lng: 'fr', resources: { fr: { common: fr } }, defaultNS: 'common', interpolation: { escapeValue: false } });
  return (key: string, options?: Record<string, unknown>) => instance.t(key, options) as string;
}
