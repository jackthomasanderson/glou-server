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

// Second review of #1051: the wording itself, as the screen renders it.
describe('CSV import counters, in words (#1035)', () => {
  const instance = async (lng: 'en' | 'fr') => {
    const i = i18next.createInstance();
    await i.init({ lng, resources: { [lng]: { common: lng === 'fr' ? fr : en } }, defaultNS: 'common', interpolation: { escapeValue: false } });
    return i;
  };

  it('tells refused rows apart from rows already in the cellar', async () => {
    const f = await instance('fr');
    expect(f.t('onboarding.csv.errorRows', { count: 1 })).toBe('1 ligne en erreur');
    expect(f.t('onboarding.csv.errorRows', { count: 3 })).toBe('3 lignes en erreur');
    expect(f.t('onboarding.csv.skippedRows', { count: 3 })).toBe('3 lignes déjà en cave, ignorées');
    const e = await instance('en');
    expect(e.t('onboarding.csv.errorRows', { count: 3 })).toBe('3 rows with errors');
    expect(e.t('onboarding.csv.skippedRows', { count: 1 })).toBe('1 row already in the cellar, skipped');
  });

  it('says "and 1 more" / "et 1 autre" in the singular', async () => {
    const f = await instance('fr');
    expect(f.t('onboarding.csv.unrecognizedColumnsMore', { count: 1, columns: 'A, B' })).toBe('Colonnes non reconnues, laissées de côté : A, B et 1 autre');
    expect(f.t('onboarding.csv.unrecognizedColumnsMore', { count: 5, columns: 'A, B' })).toBe('Colonnes non reconnues, laissées de côté : A, B et 5 autres');
    const e = await instance('en');
    expect(e.t('onboarding.csv.unrecognizedColumnsMore', { count: 1, columns: 'A' })).toBe('Unrecognised columns, left out: A and 1 more');
  });
});
