import { describe, it, expect, vi } from 'vitest';

// `previewCsv` never touches the database, but the module graph reaches
// `lib/prisma` through `inventory.service` — mock it so no client is built.
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    inventoryItem: { create: vi.fn(), findFirst: vi.fn() },
  },
}));

import { importService } from '../../src/services/import.service';

const csv = (text: string) => Buffer.from(text, 'utf-8');

describe('ImportService.previewCsv', () => {
  it('accepts a comma-separated file', () => {
    const result = importService.previewCsv(
      csv('name,producer,category,vintage\nPétrus,Château Pétrus,wine,2015\n'),
    );
    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual([
      { name: 'Pétrus', producer: 'Château Pétrus', category: 'wine', vintage: 2015 },
    ]);
  });

  it('accepts a French Excel export: UTF-8 BOM + semicolon delimiter (ISSUE_039)', () => {
    const result = importService.previewCsv(
      csv('\uFEFFname;producer;category;vintage\r\nPétrus;Château Pétrus;wine;2015\r\nLagavulin;Diageo;spirit;\r\n'),
    );
    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual([
      { name: 'Pétrus', producer: 'Château Pétrus', category: 'wine', vintage: 2015 },
      { name: 'Lagavulin', producer: 'Diageo', category: 'spirit' },
    ]);
  });

  it('reports one global error instead of one per row when no column is recognized', () => {
    const result = importService.previewCsv(
      csv('libellé|domaine|type\nPétrus|Château Pétrus|wine\nLagavulin|Diageo|spirit\n'),
    );
    expect(result.valid).toEqual([]);
    expect(result.errors).toEqual([{ row: 1, reason: 'UNRECOGNIZED_COLUMNS' }]);
  });

  it('still reports per-row errors once the header is understood', () => {
    const result = importService.previewCsv(
      csv('name;producer;category\n;Château Pétrus;wine\nLagavulin;Diageo;beer\n'),
    );
    expect(result.valid).toEqual([]);
    expect(result.errors).toEqual([
      { row: 2, reason: 'NAME_REQUIRED' },
      { row: 3, reason: 'INVALID_CATEGORY' },
    ]);
  });

  it('returns an empty preview for an empty file', () => {
    expect(importService.previewCsv(csv(''))).toEqual({ valid: [], errors: [] });
  });
});
