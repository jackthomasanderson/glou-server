import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    inventoryItem: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    tastingNote: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../../src/lib/prisma';
import { productService } from '../../src/services/product.service';
import { PRODUCT_FIELDS } from '../../src/lib/product-fields';
import { IN_STOCK_ITEM_FILTER } from '../../src/lib/finished-item';

/** A family as Prisma returns it, every description field empty unless given. */
function family(fields: Record<string, unknown> = {}) {
  return {
    id: 'p1', userId: 'u1', updatedBy: null,
    ...Object.fromEntries(PRODUCT_FIELDS.map((field) => [field, null])),
    category: 'wine', name: 'Cuvée X', producer: 'Domaine Y',
    tags: [], grapeVarieties: [], otherPhotoUrls: [], alertsPaused: false, alertStatus: 'none',
    lockedFields: [], fieldSources: null, deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-10-01T10:00:00Z'),
    collections: [],
    ...fields,
  };
}

/** A unit row, with the transitional mirror columns a real row still carries. */
function unit(fields: Record<string, unknown> = {}) {
  return {
    id: 'b1', productId: 'p1', userId: 'u1', updatedBy: null, cellarId: 'c1', slotColumn: null, slotRow: null,
    location: null, purchasePrice: new Prisma.Decimal('20.00'), estimatedValue: null, purchasePlace: null,
    purchasedAt: new Date('2026-01-15T00:00:00Z'), bottleSize: null, quantity: 6, cigarsPerBox: null, cigarsLeft: null,
    isOpened: false, fillLevel: null, openedAt: null, parentItemId: null, writtenOffAt: null, needsReview: false,
    fieldSources: null, lockedFields: [], isOwned: true, deletedAt: null,
    createdAt: new Date('2026-01-15T09:00:00Z'), updatedAt: new Date('2026-01-15T09:00:00Z'),
    // Mirror of the description, never served by /api/products.
    name: 'stale mirror', region: 'stale', notes: 'stale',
    ...fields,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(((callback: (tx: unknown) => unknown) => callback(prisma)) as never);
  vi.mocked(prisma.product.update).mockImplementation(((args: { data: Record<string, unknown> }) =>
    Promise.resolve(family(args.data))) as never);
  vi.mocked(prisma.product.findUnique).mockResolvedValue({ ...family(), items: [] } as never);
  vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.tastingNote.findMany).mockResolvedValue([] as never);
});

describe('productService.list (D9)', () => {
  it('lists families with their units in stock, wines known without bottle included, trashed ones excluded', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as never);

    await productService.list();

    const args = vi.mocked(prisma.product.findMany).mock.calls[0][0]!;
    // D10: out of the trash itself, and not every unit of it in the trash —
    // a family without any unit (FEAT-101) is listed.
    expect(args.where).toEqual({
      deletedAt: null,
      OR: [{ items: { none: {} } }, { items: { some: { deletedAt: null } } }],
    });
    expect(args.include).toMatchObject({
      collections: { select: { id: true, name: true, color: true, icon: true } },
      // Opened ones are in stock too; finished and written-off ones are not.
      items: { where: IN_STOCK_ITEM_FILTER },
    });
    expect(args.take).toBe(2001);
  });

  it('serves the description on the family and only the unit columns on its units', async () => {
    const year = new Date().getFullYear();
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { ...family({ region: 'Médoc', peakMaturityFrom: year - 1, peakMaturityTo: year + 1, fieldSources: { region: 'ocr' }, collections: [{ id: 'col1', name: 'Fêtes', color: '#fff', icon: null }] }), items: [unit({ fieldSources: { region: 'ocr', purchasePrice: 'import_csv' } })] },
      { ...family({ id: 'p2', name: 'Goûté ailleurs' }), items: [] },
    ] as never);

    const { data, truncated } = await productService.list();

    expect(truncated).toBe(false);
    expect(data[0]).toMatchObject({ id: 'p1', region: 'Médoc', fieldSources: { region: 'ocr' }, collections: [{ id: 'col1' }] });
    expect(data[0].readiness).toEqual(expect.any(Number));
    expect(data[0].items).toEqual([{
      id: 'b1', productId: 'p1', userId: 'u1', updatedBy: null, cellarId: 'c1', slotColumn: null, slotRow: null,
      location: null, purchasePrice: 20, estimatedValue: null, purchasePlace: null,
      // D6: a day, never a timestamp.
      purchasedAt: '2026-01-15', bottleSize: null, quantity: 6, cigarsPerBox: null, cigarsLeft: null,
      isOpened: false, fillLevel: null, openedAt: null, parentItemId: null, writtenOffAt: null, needsReview: false,
      fieldSources: { purchasePrice: 'import_csv' }, deletedAt: null,
      createdAt: new Date('2026-01-15T09:00:00Z'), updatedAt: new Date('2026-01-15T09:00:00Z'),
    }]);
    // A wine known without bottle (FEAT-101): listed, no units.
    expect(data[1]).toMatchObject({ id: 'p2', items: [], readiness: null, fieldSources: null });
  });

  // ISSUE_083: a ceiling with a `truncated` flag, not a silent cutoff.
  it('caps the list at 2000 families and says so', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue(
      Array.from({ length: 2001 }, (_, i) => ({ ...family({ id: `p${i}` }), items: [] })) as never,
    );

    const { data, truncated } = await productService.list();

    expect(data).toHaveLength(2000);
    expect(truncated).toBe(true);
  });
});

describe('productService.get (D9)', () => {
  it('is null for an unknown or trashed family', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null);

    expect(await productService.get('p1')).toBeNull();
    expect(vi.mocked(prisma.product.findFirst).mock.calls[0][0]!.where).toEqual({ id: 'p1', deletedAt: null });
  });

  it('serves every unit out of the trash, the tastings of the family and its whole history', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue({
      ...family(), items: [unit(), unit({ id: 'b2', isOpened: true, fillLevel: 0, quantity: 1 })],
    } as never);
    vi.mocked(prisma.tastingNote.findMany).mockResolvedValue([{ id: 't1', productId: 'p1', itemId: null }] as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      { id: 2, userId: 'u2', bottleId: null, action: 'UPDATE', status: 'success', details: { changes: [{ field: 'region', from: null, to: 'Médoc' }] }, createdAt: new Date() },
      { id: 1, userId: 'u1', bottleId: 'b1', action: 'CREATE', status: 'success', details: {}, createdAt: new Date() },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', displayName: 'Romain', username: 'r' }, { id: 'u2', displayName: null, username: 'marie' }] as never);

    const detail = await productService.get('p1');

    expect(vi.mocked(prisma.product.findFirst).mock.calls[0][0]!.include).toMatchObject({ items: { where: { deletedAt: null } } });
    expect(detail?.items.map((item) => item.id)).toEqual(['b1', 'b2']);
    // Tastings are read on the family, whichever bottle (or none) they were noted on.
    expect(prisma.tastingNote.findMany).toHaveBeenCalledWith({ where: { productId: 'p1' }, orderBy: { tastedAt: 'desc' } });
    expect(detail?.tastings).toEqual([{ id: 't1', productId: 'p1', itemId: null }]);
    // One history for the description and the units of the family.
    expect(vi.mocked(prisma.auditLog.findMany).mock.calls[0][0]!.where).toMatchObject({ productId: 'p1', status: 'success' });
    expect(detail?.history).toEqual([
      expect.objectContaining({ id: 2, actorName: 'marie', itemId: null, changes: [{ field: 'region', from: null, to: 'Médoc' }] }),
      expect.objectContaining({ id: 1, actorName: 'Romain', itemId: 'b1' }),
    ]);
  });
});

describe('productService.updateDescription (FEAT-92 c4)', () => {
  beforeEach(() => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(family() as never);
    vi.mocked(prisma.product.findUniqueOrThrow).mockResolvedValue(family() as never);
  });

  it('writes the family once, mirrored onto its units without touching their updatedAt (D22)', async () => {
    const result = await productService.updateDescription('u2', 'p1', { region: 'Médoc' });

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { region: 'Médoc', lockedFields: ['region'], updatedBy: 'u2' },
    });
    const [sql] = vi.mocked(prisma.$executeRaw).mock.calls[0] as unknown as [string[]];
    expect(sql.join('?')).toContain('UPDATE "bottles"');
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ changes: [{ field: 'region', from: null, to: 'Médoc' }] });
  });

  it('locks the family row in the transaction before checking it', async () => {
    await productService.updateDescription('u2', 'p1', { region: 'Médoc' });

    const [sql, productId] = vi.mocked(prisma.$queryRaw).mock.calls[0] as unknown as [string[], string];
    expect(sql.join('?')).toMatch(/FOR UPDATE/);
    expect(productId).toBe('p1');
    expect(vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(prisma.product.findFirst).mock.invocationCallOrder[0]);
  });

  it('answers a conflict, writing nothing, when the family changed since the client read it', async () => {
    const result = await productService.updateDescription('u2', 'p1', {
      region: 'Médoc', expectedUpdatedAt: '2026-09-30T10:00:00.000Z',
    });

    expect(result).toMatchObject({ conflict: true, product: { id: 'p1' } });
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('writes when expectedUpdatedAt is the family as stored', async () => {
    const result = await productService.updateDescription('u2', 'p1', {
      region: 'Médoc', expectedUpdatedAt: '2026-10-01T10:00:00.000Z',
    });

    expect(result).not.toHaveProperty('conflict');
    expect(prisma.product.update).toHaveBeenCalled();
  });

  it('refuses a drinking window ending before its stored start', async () => {
    vi.mocked(prisma.product.findUniqueOrThrow).mockResolvedValue(family({ peakMaturityFrom: 2030 }) as never);

    await expect(productService.updateDescription('u2', 'p1', { peakMaturityTo: 2025 })).rejects.toBeInstanceOf(ZodError);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('recomputes the alert status from the window', async () => {
    const year = new Date().getFullYear();

    await productService.updateDescription('u2', 'p1', { peakMaturityFrom: year - 1, peakMaturityTo: year + 1 });

    expect(vi.mocked(prisma.product.update).mock.calls[0][0].data).toMatchObject({ alertStatus: 'peak' });
  });

  it('is null for an unknown or trashed family', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null);

    expect(await productService.updateDescription('u2', 'p1', { region: 'Médoc' })).toBeNull();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
});

describe('productService.trash / restore (D10)', () => {
  it('writes one timestamp on the family and on its units not already in the trash', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue({ id: 'p1' } as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([{ id: 'b1' }, { id: 'b2' }] as never);

    const result = await productService.trash('p1');

    const unitWrite = vi.mocked(prisma.inventoryItem.updateMany).mock.calls[0][0]!;
    expect(unitWrite.where).toEqual({ productId: 'p1', deletedAt: null });
    const familyWrite = vi.mocked(prisma.product.update).mock.calls[0][0];
    expect(familyWrite).toEqual({ where: { id: 'p1' }, data: { deletedAt: unitWrite.data.deletedAt } });
    expect(result).toEqual({ deletedAt: unitWrite.data.deletedAt, itemIds: ['b1', 'b2'] });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('is null for a family already in the trash', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null);

    expect(await productService.trash('p1')).toBeNull();
    expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it('brings back the units trashed with the family, not the ones trashed on their own before', async () => {
    const deletedAt = new Date(Date.now() - 60_000);
    vi.mocked(prisma.product.findFirst).mockResolvedValue(family({ deletedAt }) as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([{ id: 'b1', cellarId: null, slotColumn: null, slotRow: null }] as never);

    const restored = await productService.restore('p1');

    expect(vi.mocked(prisma.product.findFirst).mock.calls[0][0]!.where).toMatchObject({ id: 'p1', deletedAt: { not: null, gte: expect.any(Date) } });
    expect(vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0]!.where).toEqual({ productId: 'p1', deletedAt });
    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { deletedAt: null } });
    expect(prisma.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { deletedAt: null } });
    expect(restored).toMatchObject({ id: 'p1' });
  });

  // #174: the slot may have been given to another bottle meanwhile.
  it('brings a unit back unplaced when its slot was taken meanwhile', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(family({ deletedAt: new Date() }) as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([{ id: 'b1', cellarId: 'c1', slotColumn: 2, slotRow: 3 }] as never);
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ id: 'other' } as never);

    await productService.restore('p1');

    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'b1' }, data: { deletedAt: null, slotColumn: null, slotRow: null },
    });
  });

  it('is null once the family is past the retention period', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null);

    expect(await productService.restore('p1')).toBeNull();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('lists a trashed family with the units trashed together with it', async () => {
    const deletedAt = new Date();
    vi.mocked(prisma.product.findMany).mockResolvedValue([{
      ...family({ deletedAt }),
      items: [unit({ id: 'b1', deletedAt: new Date(deletedAt) }), unit({ id: 'b0', deletedAt: new Date(deletedAt.getTime() - 1000) })],
    }] as never);

    const [trashed] = await productService.listTrash();

    expect(trashed).toMatchObject({ id: 'p1', deletedAt });
    expect(trashed.items.map((item) => item.id)).toEqual(['b1']);
  });
});
