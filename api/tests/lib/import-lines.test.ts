import { describe, it, expect } from 'vitest';
import { csvLineKey, csvRowGroup, groupCsvRows, type CsvImportRow } from '../../../shared/import';

// #471 (FEAT-99): the rows of a file grouped into the lines the import writes.
const wine = (overrides: Partial<CsvImportRow> = {}): CsvImportRow => ({
  name: 'Cuvée X', producer: 'Domaine Y', category: 'wine', vintage: 2020, ...overrides,
});
const cigar = (overrides: Partial<CsvImportRow> = {}): CsvImportRow => ({
  name: 'Robusto', producer: 'Cohiba', category: 'cigar', ...overrides,
});

describe('groupCsvRows', () => {
  it('reads a row of quantity N as one line of N, an empty quantity as 1', () => {
    expect(groupCsvRows([wine({ quantity: 6 }), wine({ name: 'Autre' })]).map(({ count, units }) => [count, units])).toEqual([[6, 6], [1, 1]]);
  });

  // Decision 38: same wine, cellar, price, size and purchase day.
  it('adds up identical rows, whatever the case and spaces of the wine and cellar', () => {
    const lines = groupCsvRows([
      wine({ quantity: 3, cellar: 'Garage', purchasePrice: 20 }),
      wine({ name: ' cuvée x ', producer: 'DOMAINE Y', quantity: 3, cellar: 'garage ', purchasePrice: 20 }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ count: 6, rowCount: 2, units: 6 });
    expect(lines[0].row.name).toBe('Cuvée X');
  });

  it.each([
    ['vintage', { vintage: 2021 }],
    ['cellar', { cellar: 'Cuisine' }],
    ['price', { purchasePrice: 25 }],
    ['purchase day (decision 58)', { purchasedAt: '2024-06-01' }],
    ['bottle size', { bottleSize: 'Magnum' }],
  ])('keeps rows that differ by %s apart', (_label, difference) => {
    expect(groupCsvRows([wine(), wine(difference)])).toHaveLength(2);
  });

  it('tells an empty price from a price of 0, and an empty vintage from a year (D26)', () => {
    expect(groupCsvRows([wine(), wine({ purchasePrice: 0 })])).toHaveLength(2);
    expect(groupCsvRows([wine(), wine({ vintage: undefined })])).toHaveLength(2);
  });

  it('ignores a spirit\'s vintage, which is not stored', () => {
    const spirit = (vintage?: number) => wine({ category: 'spirit', vintage });
    expect(groupCsvRows([spirit(2010), spirit()])).toHaveLength(1);
  });

  it('fills in a description cell a later identical row gives', () => {
    const [line] = groupCsvRows([wine(), wine({ region: 'Bordeaux' })]);
    expect(line.row.region).toBe('Bordeaux');
  });

  it('keeps the order in which each line first appears', () => {
    const lines = groupCsvRows([wine({ name: 'B' }), wine({ name: 'A' }), wine({ name: 'B' })]);
    expect(lines.map((line) => line.row.name)).toEqual(['B', 'A']);
  });
});

describe('csvRowGroup (FEAT-95 cigars)', () => {
  it('reads closed boxes, single cigars, and a row without box size as one box of its quantity', () => {
    expect(csvRowGroup(cigar({ quantity: 3, cigarsPerBox: 25 }))).toEqual({ count: 3, cigarsPerBox: 25 });
    expect(csvRowGroup(cigar({ quantity: 4, cigarsPerBox: 'single' }))).toEqual({ count: 4, cigarsPerBox: null });
    expect(csvRowGroup(cigar({ quantity: 25 }))).toEqual({ count: 1, cigarsPerBox: 25 });
    expect(csvRowGroup(cigar())).toEqual({ count: 1, cigarsPerBox: 1 });
  });

  it('counts cigars: 3 boxes of 25 + 4 single = 79', () => {
    const lines = groupCsvRows([cigar({ quantity: 3, cigarsPerBox: 25 }), cigar({ quantity: 4, cigarsPerBox: 'single' })]);
    expect(lines.reduce((n, line) => n + line.units, 0)).toBe(79);
  });

  it('adds up two boxes of the same size, not boxes of another size or vitola', () => {
    expect(groupCsvRows([cigar({ quantity: 25 }), cigar({ quantity: 25 })]).map((l) => l.count)).toEqual([2]);
    expect(groupCsvRows([cigar({ quantity: 25 }), cigar({ quantity: 20 })])).toHaveLength(2);
    expect(groupCsvRows([cigar({ format: '52' }), cigar({ format: '56' })])).toHaveLength(2);
  });

  it('ignores a box size on a bottle row', () => {
    expect(csvLineKey(wine({ cigarsPerBox: 25 }))).toBe(csvLineKey(wine()));
  });
});
