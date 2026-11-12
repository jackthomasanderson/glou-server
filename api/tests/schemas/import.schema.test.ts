import { describe, it, expect } from 'vitest';
import { MAX_COPIES } from '../../src/schemas/stock.schema';
import { CSV_IMPORT_MAX_COPIES } from '../../../shared/import';
import {
  csvRawRowSchema,
  csvImportRowSchema,
  confirmCsvImportSchema,
  toPurchaseDay,
} from '../../src/schemas/import.schema';

describe('csvRawRowSchema (raw CSV cells, all strings)', () => {
  it('normalizes category case/whitespace and coerces vintage', () => {
    const res = csvRawRowSchema.safeParse({
      name: '  Pétrus  ',
      producer: 'Château Pétrus',
      category: '  WINE ',
      vintage: '2015',
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.category).toBe('wine');
      expect(res.data.name).toBe('Pétrus');
      expect(res.data.vintage).toBe(2015);
    }
  });

  it('treats a blank vintage cell as absent', () => {
    const res = csvRawRowSchema.safeParse({ name: 'X', producer: 'Y', category: 'wine', vintage: '   ' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.vintage).toBeUndefined();
  });

  it('rejects missing name/producer with stable codes', () => {
    const res = csvRawRowSchema.safeParse({ name: '', producer: 'Y', category: 'wine' });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0].message).toBe('NAME_REQUIRED');
  });

  it('rejects an unknown category and an out-of-range vintage', () => {
    expect(csvRawRowSchema.safeParse({ name: 'X', producer: 'Y', category: 'beer' }).success).toBe(false);
    expect(
      csvRawRowSchema.safeParse({ name: 'X', producer: 'Y', category: 'wine', vintage: '1700' }).success,
    ).toBe(false);
  });
});

// #624: the vintage cell is now read through the one vintage rule
// (lib/years.ts): what a file imported before still imports, and what was
// refused is still refused with the same (translated) code.
describe('csvRawRowSchema vintage and years (#624)', () => {
  const row = { name: 'X', producer: 'Y', category: 'wine' };
  const year = new Date().getFullYear();
  const vintageOf = (vintage: string) => {
    const res = csvRawRowSchema.safeParse({ ...row, vintage });
    return res.success ? res.data.vintage : res.error.issues.map((issue) => issue.message).join(' | ');
  };

  it.each([['2015', 2015], [' 2015 ', 2015], ['2015.0', 2015], ['1800', 1800], [String(year), year], ['', undefined]])(
    'still reads %j as %j', (cell, vintage) => expect(vintageOf(cell)).toBe(vintage),
  );

  it.each(['1799', String(year + 1), '2015.5', 'deux mille', 'NV'])('still refuses %j with INVALID_VINTAGE', (cell) => {
    expect(vintageOf(cell)).toBe('INVALID_VINTAGE');
  });

  it('keeps a base and a manufacture year in bounds, and leaves an unreadable one out', () => {
    const sparkling = csvRawRowSchema.parse({ ...row, category: 'sparkling', baseYear: '2015' });
    expect(sparkling.baseYear).toBe(2015);
    expect(csvRawRowSchema.parse({ ...row, category: 'sparkling', baseYear: '1700' }).baseYear).toBeUndefined();
    const cigar = csvRawRowSchema.parse({ ...row, category: 'cigar', manufactureYear: '1950' });
    expect(cigar.manufactureYear).toBe(1950);
    expect(csvRawRowSchema.parse({ ...row, category: 'cigar', manufactureYear: '1850' }).manufactureYear).toBeUndefined();
    expect(csvImportRowSchema.safeParse({ ...row, manufactureYear: 1850 }).error?.issues[0].message).toBe('INVALID_MANUFACTURE_YEAR');
    expect(csvImportRowSchema.safeParse({ ...row, baseYear: year + 1 }).error?.issues[0].message).toBe('INVALID_BASE_YEAR');
  });
});

describe('toPurchaseDay (spreadsheet days)', () => {
  it('reads ISO and European days, and leaves anything else for the schema to refuse', () => {
    expect(toPurchaseDay('2024-03-15')).toBe('2024-03-15');
    expect(toPurchaseDay('5/3/2024')).toBe('2024-03-05');
    expect(toPurchaseDay('05.03.2024')).toBe('2024-03-05');
    expect(toPurchaseDay('29-02-2024')).toBe('2024-02-29');
    expect(toPurchaseDay('29/02/2023')).toBe('29/02/2023');
    expect(toPurchaseDay('0001-01-01')).toBe('0001-01-01');
    expect(toPurchaseDay('2200-01-01')).toBe('2200-01-01');
    expect(toPurchaseDay('31/12/1899')).toBe('31/12/1899');
    expect(toPurchaseDay('mars 2024')).toBe('mars 2024');
    expect(toPurchaseDay('  ')).toBeUndefined();
  });
});

describe('group bound', () => {
  it('is the same on both sides', () => {
    expect(CSV_IMPORT_MAX_COPIES).toBe(MAX_COPIES);
  });
});

describe('csvRawRowSchema (prices)', () => {
  it('keeps cents only, as the price column stores them', () => {
    expect(csvRawRowSchema.parse({ name: 'X', producer: 'Y', category: 'wine', purchasePrice: '12,505' }).purchasePrice).toBe(12.51);
  });
});

describe('confirmCsvImportSchema (canonical, already-typed rows)', () => {
  const row = { name: 'X', producer: 'Y', category: 'wine' as const };

  it('accepts 1..500 rows', () => {
    expect(confirmCsvImportSchema.safeParse({ rows: [row] }).success).toBe(true);
    expect(confirmCsvImportSchema.safeParse({ rows: [] }).success).toBe(false);
    expect(confirmCsvImportSchema.safeParse({ rows: Array(501).fill(row) }).success).toBe(false);
  });

  // #471 (FEAT-99 c4, decision 39): the cap counts rows, whatever the bottles they stand for.
  it('accepts 500 rows standing for far more than 500 bottles', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ ...row, name: `Wine ${i}`, quantity: 12 }));
    expect(confirmCsvImportSchema.safeParse({ rows }).success).toBe(true);

    const over = confirmCsvImportSchema.safeParse({ rows: [...rows, row] });
    expect(over.success).toBe(false);
    if (!over.success) expect(over.error.issues[0].message).toBe('TOO_MANY_ROWS');
  });

  it('refuses identical rows that add up past what one group may count', () => {
    const res = confirmCsvImportSchema.safeParse({ rows: [{ ...row, quantity: 600 }, { ...row, quantity: 600 }] });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0].message).toBe('LINE_TOO_LARGE');
  });

  it('takes the member\'s choices for wines already in the cellar, none by default', () => {
    expect(confirmCsvImportSchema.parse({ rows: [row] }).choices).toEqual([]);
    const choices = [{ key: 'k', inStock: 4, add: true }];
    expect(confirmCsvImportSchema.parse({ rows: [row], choices }).choices).toEqual(choices);
    expect(confirmCsvImportSchema.safeParse({ rows: [row], choices: [{ key: 'k', inStock: -1, add: true }] }).success).toBe(false);
  });

  it('takes a cigar box size or single cigars, and a purchase day as YYYY-MM-DD', () => {
    expect(csvImportRowSchema.safeParse({ ...row, cigarsPerBox: 25, purchasedAt: '2024-03-15' }).success).toBe(true);
    expect(csvImportRowSchema.safeParse({ ...row, cigarsPerBox: 'single' }).success).toBe(true);
    expect(csvImportRowSchema.safeParse({ ...row, cigarsPerBox: 'box' }).success).toBe(false);
    expect(csvImportRowSchema.safeParse({ ...row, purchasedAt: '15/03/2024' }).success).toBe(false);
  });

  it('rejects a row whose vintage is still a string (must be pre-parsed)', () => {
    expect(csvImportRowSchema.safeParse({ ...row, vintage: '2015' }).success).toBe(false);
    expect(csvImportRowSchema.safeParse({ ...row, vintage: 2015 }).success).toBe(true);
  });
});

describe('purchase day year bounds (H1 review)', () => {
  const base = { name: 'X', producer: 'Y', category: 'wine' };

  it('refuses an ISO day out of 1900-2100 in a raw row, as it does a day-first one', () => {
    for (const day of ['2200-01-01', '1899-12-31', '31/12/2101']) {
      const res = csvRawRowSchema.safeParse({ ...base, purchasedAt: day });
      expect(res.success, day).toBe(false);
      if (!res.success) expect(res.error.issues[0].message).toBe('INVALID_PURCHASE_DATE');
    }
    expect(csvRawRowSchema.safeParse({ ...base, purchasedAt: '2100-12-31' }).success).toBe(true);
  });

  it('refuses it in a confirmed row too, which a client could send without the preview', () => {
    expect(csvImportRowSchema.safeParse({ ...base, purchasedAt: '2200-01-01' }).success).toBe(false);
    expect(csvImportRowSchema.safeParse({ ...base, purchasedAt: '2024-03-15' }).success).toBe(true);
  });
});

describe('drinking window of a confirmed row', () => {
  it('refuses a window that ends before it starts (a client could send it without the preview)', () => {
    const base = { name: 'X', producer: 'Y', category: 'wine' };
    expect(csvImportRowSchema.safeParse({ ...base, peakMaturityFrom: 2030, peakMaturityTo: 2020 }).success).toBe(false);
    expect(csvImportRowSchema.safeParse({ ...base, peakMaturityFrom: 2020, peakMaturityTo: 2030 }).success).toBe(true);
  });
});

