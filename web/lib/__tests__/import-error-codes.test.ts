import { describe, it, expect } from 'vitest';
import i18next from 'i18next';
import { CSV_IMPORT_ERROR_CODES, CSV_REQUIRED_COLUMNS } from '@shared/import';
import en from '../../public/locales/en/common.json';
import fr from '../../public/locales/fr/common.json';

// #1035: a reason the screen did not know was shown as its raw code (or, before
// the API named it, as the validator's English text). Every reason the CSV
// preview may give, and every required column it may name, has its words.
describe('CSV import reasons (#1035)', () => {
  for (const lng of ['en', 'fr'] as const) {
    it(`${lng}: every reason and required column is translated`, async () => {
      const i = i18next.createInstance();
      await i.init({ lng, resources: { [lng]: { common: lng === 'fr' ? fr : en } }, defaultNS: 'common', interpolation: { escapeValue: false } });
      const missing = [
        ...CSV_IMPORT_ERROR_CODES.map((code) => `onboarding.csv.errorCodes.${code}`),
        ...CSV_REQUIRED_COLUMNS.map((column) => `onboarding.csv.requiredColumns.${column}`),
      ].filter((key) => !i.exists(key, { count: 1 }) || !i.exists(key, { count: 2 }));
      expect(missing).toEqual([]);
    });
  }
});
