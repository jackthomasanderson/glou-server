import { describe, it, expect } from 'vitest';
import i18next from 'i18next';
import en from '../../public/locales/en/common.json';
import fr from '../../public/locales/fr/common.json';

// #220 — plurals were hand-written as "cave(s)" / "actif(s) ajouté(s)", which
// reads as a typo and cannot be translated properly. They are real i18next
// plurals now (key_one / key_other), picked from the `count` the caller passes.

function leaves(o: Record<string, unknown>, path = ''): [string, string][] {
  return Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'string' ? [[`${path}${k}`, v] as [string, string]] : leaves(v as Record<string, unknown>, `${path}${k}.`),
  );
}

async function instance(lng: 'en' | 'fr') {
  const i = i18next.createInstance();
  await i.init({ lng, resources: { en: { common: en }, fr: { common: fr } }, defaultNS: 'common', interpolation: { escapeValue: false } });
  return i;
}

describe('plural forms (#220)', () => {
  for (const [name, bundle] of [['en', en], ['fr', fr]] as const) {
    it(`${name}: no hand-written "(s)" left`, () => {
      expect(leaves(bundle).filter(([, v]) => /\(s\)|\(e\)|\(x\)|é\(e\)|és\)/.test(v)).map(([k]) => k)).toEqual([]);
    });
  }

  it('English singular and plural', async () => {
    const t = (await instance('en')).t;
    expect(t('shares.cellarCount', { count: 1 })).toBe('1 cellar');
    expect(t('shares.cellarCount', { count: 3 })).toBe('3 cellars');
    expect(t('onboarding.csv.errorRows', { count: 1 })).toBe('1 skipped row');
  });

  it('French: 0 and 1 are singular, agreement follows the noun', async () => {
    const t = (await instance('fr')).t;
    expect(t('cellars.nFound', { count: 1 })).toBe('1 cave trouvée');
    expect(t('cellars.nFound', { count: 0 })).toBe('0 cave trouvée');
    expect(t('cellars.nFound', { count: 2 })).toBe('2 caves trouvées');
    expect(t('onboarding.summary.itemsAdded', { count: 5 })).toBe('5 actifs ajoutés à votre inventaire');
  });

  it('count-less labels of a pair now need a count', async () => {
    const t = (await instance('fr')).t;
    expect(t('cellars.grid.occupied', { count: 1 })).toBe('occupé');
    expect(t('cellars.grid.occupied', { count: 4 })).toBe('occupés');
    expect(t('analytics.regionMap.items', { count: 1 })).toBe('élément en stock');
    expect((await instance('en')).t('analytics.garde.bottles', { count: 2 })).toBe('bottles at peak');
  });
});
