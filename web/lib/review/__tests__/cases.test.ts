import { beforeAll, describe, expect, it } from 'vitest';
import { frenchT } from '@/lib/products/__tests__/i18n';
import { openedBottle, product, unit } from '@/lib/products/__tests__/factories';
import { countSplit, describeCountSplit, preselectedChoices, reviewPointCount, reviewValueLabel } from '../cases';
import type { ReviewCount, ReviewMerge } from '../client';

// #471 (FEAT-102, ux-ui.md §10.7): what the review screen and its banner say.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

const merge = (over: Partial<ReviewMerge> = {}): ReviewMerge => ({
  products: [product({ id: 'p1' }), product({ id: 'p2' })],
  disagreements: [{
    field: 'region',
    values: [{ productId: 'p1', value: 'Bordeaux' }, { productId: 'p2', value: 'Graves' }],
    preselectedProductId: 'p2',
  }],
  units: 8,
  ...over,
});

const count = (over: Partial<ReviewCount> = {}): ReviewCount => ({
  product: product({ id: 'p1' }),
  group: unit({ id: 'g', quantity: 5, needsReview: true }),
  subRecords: [openedBottle(60, { id: 's', parentItemId: 'g' })],
  ...over,
});

describe('review cases (FEAT-102)', () => {
  it('counts one point per case to merge and per number to check (the banner)', () => {
    expect(reviewPointCount(undefined)).toBe(0);
    expect(reviewPointCount({ merges: [], counts: [] })).toBe(0);
    expect(reviewPointCount({ merges: [merge(), merge()], counts: [count()] })).toBe(3);
  });

  it('pre-checks every disagreeing field on the family the API pre-selected (point 40)', () => {
    expect(preselectedChoices(merge())).toEqual({ region: 'p2' });
    expect(preselectedChoices(merge({ disagreements: [] }))).toEqual({});
  });

  it('shows enumerated values by their label, the others as the history does', () => {
    expect(reviewValueLabel('color', 'red', t)).toBe('Rouge');
    expect(reviewValueLabel('sugarLevel', 'brut', t)).toBe('Brut');
    expect(reviewValueLabel('region', 'Graves', t)).toBe('Graves');
    expect(reviewValueLabel('needsAeration', true, t)).toBe(t('traceability.booleanTrue'));
    expect(reviewValueLabel('grapeVarieties', ['Merlot', 'Malbec'], t)).toBe('Merlot, Malbec');
  });

  it('says a guessed number in one sentence (§10.7): an opened bottle', () => {
    const split = countSplit(count());
    expect(split).toEqual({ noun: 'bottle', before: 6, split: 1, state: 'opened', full: 5 });
    expect(describeCountSplit(split!, t)).toBe('Avant la mise à jour : 6 bouteilles, entamée. Glou a compté 1 entamée + 5 pleines.');
  });

  it('says a finished bottle as drunk', () => {
    const split = countSplit(count({ group: unit({ id: 'g', quantity: 1, needsReview: true }), subRecords: [openedBottle(0, { id: 's' })] }));
    expect(describeCountSplit(split!, t)).toBe('Avant la mise à jour : 2 bouteilles, finie. Glou a compté 1 bue + 1 pleine.');
  });

  it('says boxes of cigars in boxes', () => {
    const split = countSplit(count({
      product: product({ id: 'p1', category: 'cigar' }),
      group: unit({ id: 'g', quantity: 3, cigarsPerBox: 25, cigarsLeft: null, needsReview: true }),
      subRecords: [unit({ id: 's', cigarsPerBox: 25, cigarsLeft: 10, isOpened: true })],
    }));
    expect(describeCountSplit(split!, t)).toBe('Avant la mise à jour : 4 boîtes, entamée. Glou a compté 1 boîte entamée + 3 boîtes fermées.');
  });

  it('says nothing of a split when the split-off copy is no longer there', () => {
    expect(countSplit(count({ subRecords: [] }))).toBeNull();
  });
});
