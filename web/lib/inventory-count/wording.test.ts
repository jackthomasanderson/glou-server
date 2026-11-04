import { beforeAll, describe, expect, it } from 'vitest';
import { frenchT } from '@/lib/products/__tests__/i18n';

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

// The count report words each unit in its own noun and gender (W4).
describe('inventory count wording (real French bundle)', () => {
  it('missing copies agree with the unit', () => {
    expect(t('inventoryCount.report.missingOf', { count: 2, expected: 6 })).toBe('2 manquantes sur 6');
    expect(t('inventoryCount.report.missingOf', { count: 2, expected: 6, context: 'cigar' })).toBe('2 manquants sur 6');
    expect(t('inventoryCount.report.missingOf', { count: 2, expected: 6, context: 'box' })).toBe('2 manquantes sur 6');
    expect(t('inventoryCount.report.missingOf', { count: 1, expected: 6, context: 'cigar' })).toBe('1 manquant sur 6');
  });
  it('a surplus is added in the unit of the group', () => {
    expect(t('inventoryCount.report.addSurplus', { count: 2 })).toBe('Ajouter 2 bouteilles au groupe');
    expect(t('inventoryCount.report.addSurplus', { count: 2, context: 'cigar' })).toBe('Ajouter 2 cigares au groupe');
    expect(t('inventoryCount.report.addSurplus', { count: 2, context: 'box' })).toBe('Ajouter 2 boîtes au groupe');
  });
});
