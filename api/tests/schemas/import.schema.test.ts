import { describe, it, expect } from 'vitest';
import {
  csvRawRowSchema,
  csvImportRowSchema,
  confirmCsvImportSchema,
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

describe('confirmCsvImportSchema (canonical, already-typed rows)', () => {
  const row = { name: 'X', producer: 'Y', category: 'wine' as const };

  it('accepts 1..500 rows', () => {
    expect(confirmCsvImportSchema.safeParse({ rows: [row] }).success).toBe(true);
    expect(confirmCsvImportSchema.safeParse({ rows: [] }).success).toBe(false);
    expect(confirmCsvImportSchema.safeParse({ rows: Array(501).fill(row) }).success).toBe(false);
  });

  it('rejects a row whose vintage is still a string (must be pre-parsed)', () => {
    expect(csvImportRowSchema.safeParse({ ...row, vintage: '2015' }).success).toBe(false);
    expect(csvImportRowSchema.safeParse({ ...row, vintage: 2015 }).success).toBe(true);
  });
});
