import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import i18next from 'i18next';
import en from '../../public/locales/en/common.json';
import fr from '../../public/locales/fr/common.json';
import { getShareStatus, type GuestShare } from '../shares/types';
import { gridWording } from '../cellars/gridWording';
import { NEUTRAL_TAB_TITLE } from '@/hooks/useBrowserTabTitle';

// #471 (recette v2): labels seen as raw keys, in both languages at once, or
// speaking of wine for a cigar.

async function translator(lng: 'fr' | 'en') {
  const instance = i18next.createInstance();
  await instance.init({ lng, resources: { [lng]: { common: lng === 'fr' ? fr : en } }, defaultNS: 'common', interpolation: { escapeValue: false } });
  return instance;
}

describe('share status (Profile > Shares)', () => {
  // The key ShareCard builds: shares.status + capitalised status.
  const keyOf = (status: string) => `shares.status${status.charAt(0).toUpperCase()}${status.slice(1)}`;
  const share = (over: Partial<GuestShare>) => ({ revokedAt: null, expiresAt: null, ...over }) as GuestShare;
  const statuses = [
    getShareStatus(share({})),
    getShareStatus(share({ expiresAt: '2000-01-01T00:00:00.000Z' })),
    getShareStatus(share({ revokedAt: '2000-01-01T00:00:00.000Z' })),
  ];

  it.each(['fr', 'en'] as const)('every status has a %s translation', async (lng) => {
    expect(statuses).toEqual(['active', 'expired', 'revoked']);
    const i = await translator(lng);
    for (const status of statuses) {
      expect(i.exists(keyOf(status)), keyOf(status)).toBe(true);
    }
  });
});

describe('tab titles', () => {
  const appDir = path.join(import.meta.dirname, '..', '..', 'app');
  const files = (readdirSync(appDir, { recursive: true }) as string[])
    .filter((file) => /(^|[\\/])(page|layout)\.tsx$/.test(file));

  it('no page sets a title of its own on the server: one neutral title, never two languages', () => {
    const titled = files.filter((file) => /^\s*title:/m.test(readFileSync(path.join(appDir, file), 'utf8')));
    expect(titled).toEqual(['layout.tsx']);
    expect(readFileSync(path.join(appDir, 'layout.tsx'), 'utf8')).toMatch(new RegExp(`^\\s*title: '${NEUTRAL_TAB_TITLE}',$`, 'm'));
  });
});

describe('cigar wording', () => {
  it('the tastings of a cigar or a spirit are not "of this wine"', async () => {
    for (const lng of ['fr', 'en'] as const) {
      const i = await translator(lng);
      const wine = i.t('familyDrawer.tastings.empty', { context: 'wine' });
      expect(i.t('familyDrawer.tastings.empty', { context: 'sparkling' })).toBe(wine);
      for (const category of ['cigar', 'spirit']) {
        const text = i.t('familyDrawer.tastings.empty', { context: category });
        expect(text).not.toBe(wine);
        expect(text).not.toMatch(/\b(vin|wine)\b/i);
      }
    }
    const i = await translator('fr');
    expect(i.t('familyDrawer.tastings.empty', { context: 'cigar' })).toBe("Aucune dégustation de ce cigare pour l'instant.");
  });

  it('the plan of a humidor, or of a cellar holding only cigars, speaks of cigars', async () => {
    expect(gridWording('HUMIDOR', [])).toEqual({ context: 'cigar' });
    expect(gridWording('VINTAGE', [{ category: 'cigar' }])).toEqual({ context: 'cigar' });
    expect(gridWording('VINTAGE', [{ category: 'cigar' }, { category: 'wine' }])).toEqual({});
    expect(gridWording('VINTAGE', [])).toEqual({});
    for (const lng of ['fr', 'en'] as const) {
      const i = await translator(lng);
      const cigar = { col: 1, row: 2, context: 'cigar' };
      for (const key of ['assignTitle', 'noUnassignedBottles', 'cellLabelEmpty', 'dragInstructions']) {
        expect(i.t(`cellars.grid.${key}`, cigar), key).not.toMatch(/bouteille|bottle/i);
        expect(i.t(`cellars.grid.${key}`, { col: 1, row: 2 }), key).toMatch(/bouteille|bottle/i);
      }
    }
    const i = await translator('fr');
    expect(i.t('cellars.grid.assignTitle', { col: 1, row: 2, context: 'cigar' })).toBe("Assigner un cigare ou une boîte à l'emplacement C1·R2");
  });
});
