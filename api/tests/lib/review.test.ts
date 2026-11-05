import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  findDisagreements, formMergeCases, planGroupFusion, preselectedFamily, REVIEW_FIELDS,
  type FusionUnit, type ReviewFamily,
} from '../../../shared/review';
import type { UnitKind } from '../../../shared/units';

// #471 (FEAT-102, lot J1): the fusion of identical groups is read from the
// same case table as the counting rules, the one the migration bench uses
// for the SQL transformation (e2e/migration/fixtures/units-cases.json).
const CASES_FILE = path.resolve(__dirname, '../../../e2e/migration/fixtures/units-cases.json');

interface FuseCase {
  case: string;
  kind: UnitKind;
  units: Array<Record<string, unknown> & { id: string; sessions?: string[] }>;
  fused: Array<{ ids: string[]; quantity: number; purchasePlace: string | null; location: string | null }>;
}
const cases = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8')) as { fuse: FuseCase[] };

/** Fields left out of a case take the defaults stated in the file's `_fuseComment`; creation order = list order. */
const fusionUnit = (unit: FuseCase['units'][number], index: number): FusionUnit => {
  const { sessions = [], ...fields } = unit;
  return {
    productId: 'p1', cellarId: 'c1', purchasePrice: 20, purchasedAt: '2026-01-15', bottleSize: null, cigarsPerBox: null,
    estimatedValue: null, purchasePlace: null, location: null, quantity: 1, isOpened: false, fillLevel: null,
    cigarsLeft: null, writtenOffAt: null, deletedAt: null, needsReview: false, slotColumn: null, slotRow: null,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
    sessionIds: sessions,
    ...fields,
  } as FusionUnit;
};

describe('planGroupFusion (design.md rule 4, D5) — the case table of the migration bench', () => {
  it.each(cases.fuse)('$case', (c) => {
    const plan = planGroupFusion(c.units.map(fusionUnit), c.kind);
    expect(plan.map((group) => ({
      ids: [group.survivorId, ...group.absorbedIds],
      quantity: group.quantity,
      purchasePlace: group.purchasePlace,
      location: group.location,
    }))).toEqual(c.fused);
  });

  it('walks by creation date then id, whatever the order it is given', () => {
    const units = cases.fuse[0].units.map(fusionUnit).reverse();
    expect(planGroupFusion(units, 'bottle')[0].survivorId).toBe('a');
  });
});

/** A family with every compared field empty unless given. */
function reviewFamily(id: string, fields: Partial<ReviewFamily> = {}): ReviewFamily {
  return {
    id,
    ...Object.fromEntries(REVIEW_FIELDS.map((field) => [field, null])),
    grapeVarieties: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...fields,
  } as ReviewFamily;
}

describe('findDisagreements (FEAT-102 c1, decision #471 point 40)', () => {
  it('shows only the fields in disagreement, pre-selected on the most recently changed family', () => {
    const older = reviewFamily('p1', { region: 'Bordeaux', color: 'red', updatedAt: new Date('2026-03-01T00:00:00Z') });
    const newer = reviewFamily('p2', { region: 'Graves', color: ' RED ', updatedAt: new Date('2026-05-01T00:00:00Z') });

    expect(findDisagreements([older, newer])).toEqual([{
      field: 'region',
      values: [{ productId: 'p1', value: 'Bordeaux' }, { productId: 'p2', value: 'Graves' }],
      preselectedProductId: 'p2',
    }]);
  });

  it('never counts an empty value as a disagreement', () => {
    const families = [reviewFamily('p1', { region: 'Bordeaux' }), reviewFamily('p2', { region: '  ' }), reviewFamily('p3')];
    expect(findDisagreements(families)).toEqual([]);
  });

  it('compares grape varieties as sets of normalised names, numbers and dates strictly', () => {
    const a = reviewFamily('p1', { grapeVarieties: ['Merlot', 'Cabernet'], alcoholDegree: 13, batchDate: new Date('2020-01-01T00:00:00Z') });
    const b = reviewFamily('p2', { grapeVarieties: [' cabernet', 'MERLOT'], alcoholDegree: 13.5, batchDate: '2020-01-01T00:00:00.000Z' });
    expect(findDisagreements([a, b]).map((d) => d.field)).toEqual(['alcoholDegree']);
  });

  it('pre-selects, among the families holding a value, the most recent one', () => {
    const a = reviewFamily('p1', { region: 'Bordeaux', updatedAt: new Date('2026-01-01T00:00:00Z') });
    const b = reviewFamily('p2', { region: 'Graves', updatedAt: new Date('2026-02-01T00:00:00Z') });
    const c = reviewFamily('p3', { updatedAt: new Date('2026-09-01T00:00:00Z') });
    expect(findDisagreements([a, b, c])[0].preselectedProductId).toBe('p2');
    expect(preselectedFamily('region', [a, b, c])).toBe('p2');
    expect(preselectedFamily('color', [a, b, c])).toBeNull();
  });
});

describe('formMergeCases ("À regrouper ?", decision #471 point 41)', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 0, minute));
  const key = (id: string, minute: number, k = 'k1') => ({ id, key: k, createdAt: at(minute) });

  it('proposes the families sharing a product key, alone ones never', () => {
    const cases = formMergeCases([key('a', 0), key('b', 1), key('c', 2, 'k2')], []);
    expect(cases).toEqual([['a', 'b']]);
  });

  it('never proposes two families declared different wines, and lets the others meet', () => {
    // a ≠ b: a and c form one case; b stays alone until that case is settled.
    expect(formMergeCases([key('a', 0), key('b', 1), key('c', 2)], [['a', 'b']])).toEqual([['a', 'c']]);
    // a ≠ b and a ≠ c (c kept apart from a): b and c meet.
    expect(formMergeCases([key('a', 0), key('b', 1), key('c', 2)], [['a', 'b'], ['a', 'c']])).toEqual([['b', 'c']]);
    // Every pair declared different: nothing to review.
    expect(formMergeCases([key('a', 0), key('b', 1)], [['a', 'b']])).toEqual([]);
  });
});
