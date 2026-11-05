import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  groupKey, isGroupableItem, isIntactItem, itemSpend, itemUnits, itemValue, productKey, summarizeStock, unitKind,
  type GroupKeyFields, type ProductKeyFields, type UnitKind,
} from '../../../shared/units';

// #471: the cases live in the migration bench so the SQL re-implementation of
// the families transformation (F3) is checked against the very same table.
const CASES_FILE = path.resolve(__dirname, '../../../e2e/migration/fixtures/units-cases.json');

type ItemCase = Record<string, unknown>;
interface Cases {
  units: Array<{ case: string; item: ItemCase; intact: boolean; units: number; value: number; spend: number }>;
  stock: Array<{
    case: string; kind: UnitKind; cellarId?: string; items: ItemCase[];
    units: number; unitsHere?: number; value: number; intactUnits: number; closedBoxes: number; singleCigars: number; opened: number;
  }>;
  productKey: Array<{ case: string; same: boolean; a: ProductKeyFields; b: ProductKeyFields }>;
  groupKey: Array<{ case: string; kind: UnitKind; same: boolean; a: GroupKeyFields; b: GroupKeyFields }>;
}
const cases = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8')) as Cases;

/** Fields left out of a case take the defaults stated in the file's `_comment`. */
const unit = (item: ItemCase) => ({
  quantity: 1, isOpened: false, fillLevel: null, cigarsPerBox: null, cigarsLeft: null, writtenOffAt: null,
  purchasePrice: null, estimatedValue: null, cellarId: null, deletedAt: null,
  ...item,
}) as Parameters<typeof itemValue>[0] & { cellarId: string | null; deletedAt: string | null };

describe('itemUnits / itemValue / itemSpend / isIntactItem (shared/units.ts)', () => {
  it.each(cases.units)('$case', (c) => {
    const item = unit(c.item);
    expect(itemUnits(item)).toBe(c.units);
    expect(itemValue(item)).toBe(c.value);
    expect(itemSpend(item)).toBe(c.spend);
    expect(isIntactItem(item)).toBe(c.intact);
  });
});

describe('summarizeStock', () => {
  it.each(cases.stock)('$case', (c) => {
    const summary = summarizeStock(c.items.map(unit), { kind: c.kind, cellarId: c.cellarId });
    expect(summary).toMatchObject({
      units: c.units, value: c.value, intactUnits: c.intactUnits, closedBoxes: c.closedBoxes, singleCigars: c.singleCigars,
    });
    expect(summary.opened).toHaveLength(c.opened);
    expect(summary.unitsHere).toBe(c.unitsHere);
  });
});

describe('productKey', () => {
  it.each(cases.productKey)('$case', (c) => {
    expect(productKey(c.a) === productKey(c.b)).toBe(c.same);
  });
});

describe('groupKey', () => {
  it.each(cases.groupKey)('$case', (c) => {
    expect(groupKey(c.a, c.kind) === groupKey(c.b, c.kind)).toBe(c.same);
  });

  it('only intact units, out of the trash and not written off, can form a group', () => {
    const intact = unit({ quantity: 6 });
    expect(isGroupableItem(intact)).toBe(true);
    expect(isGroupableItem({ ...intact, deletedAt: '2026-01-01T00:00:00.000Z' })).toBe(false);
    expect(isGroupableItem({ ...intact, writtenOffAt: '2026-01-01T00:00:00.000Z' })).toBe(false);
    expect(isGroupableItem({ ...intact, isOpened: true })).toBe(false);
  });
});

describe('unitKind', () => {
  it('counts cigars in cigars and everything else in bottles', () => {
    expect(unitKind('cigar')).toBe('cigar');
    expect(['wine', 'sparkling', 'spirit'].map((c) => unitKind(c as 'wine'))).toEqual(['bottle', 'bottle', 'bottle']);
  });
});
