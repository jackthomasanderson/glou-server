import en from '../../../public/locales/en/common.json';
import fr from '../../../public/locales/fr/common.json';
import type { PairingKey } from '../recommendations';

/** The translated food pairing labels of a language, as the components pass them to the engine (#653). */
export function pairingLabels(lang: 'fr' | 'en'): (key: PairingKey) => string {
  const labels = (lang === 'fr' ? fr : en).tastings.pairings as Record<PairingKey, string>;
  return (key) => labels[key];
}
