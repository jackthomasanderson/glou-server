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
    stockMovement: { createMany: vi.fn(async () => ({ count: 0 })) },
    inventoryItem: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), groupBy: vi.fn() },
    // FEAT-93: the cells of the plan, a fakeSlots() set in beforeEach.
    itemSlot: {},
    tastingNote: { findMany: vi.fn(), groupBy: vi.fn() },
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
import { FINISHED_ITEM_STATE, IN_STOCK_ITEM_FILTER } from '../../src/lib/finished-item';
import { fakeSlots, slot } from '../support/fake-slots';

/** FEAT-93: the cells of the plan (item_slots). */
let slots: ReturnType<typeof fakeSlots>;
beforeEach(() => {
  slots = fakeSlots();
  Object.assign(prisma, { itemSlot: slots.delegate });
});

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
    id: 'b1', productId: 'p1', userId: 'u1', updatedBy: null, cellarId: 'c1',
    location: null, purchasePrice: new Prisma.Decimal('20.00'), estimatedValue: null, purchasePlace: null,
    purchasedAt: new Date('2026-01-15T00:00:00Z'), bottleSize: null, quantity: 6, cigarsPerBox: null, cigarsLeft: null,
    isOpened: false, fillLevel: null, openedAt: null, parentItemId: null, writtenOffAt: null, needsReview: false,
    fieldSources: null, lockedFields: [], deletedAt: null,
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
  vi.mocked(prisma.tastingNote.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.inventoryItem.groupBy).mockResolvedValue([] as never);
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

  it('#475: scoped to a cellar, lists only the families with a bottle in stock there', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as never);

    await productService.list({ cellarId: 'c1' });

    const args = vi.mocked(prisma.product.findMany).mock.calls[0][0]!;
    expect(args.where).toEqual({
      deletedAt: null,
      items: { some: { ...IN_STOCK_ITEM_FILTER, cellarId: 'c1' } },
    });
    // Every bottle in stock still comes with the family ("2 ici · 9 en tout").
    expect(args.include).toMatchObject({ items: { where: IN_STOCK_ITEM_FILTER } });
    expect(args.take).toBe(2001);
  });

  it('serves the description on the family and only the unit columns on its units', async () => {
    const year = new Date().getFullYear();
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { ...family({ region: 'Médoc', peakMaturityFrom: year - 1, peakMaturityTo: year + 1, fieldSources: { region: 'ocr' }, collections: [{ id: 'col1', name: 'Fêtes', color: '#fff', icon: null }] }), items: [unit({ fieldSources: { region: 'ocr', purchasePrice: 'import_csv' }, slots: [{ id: 's1', column: 2, row: 1 }] })] },
      { ...family({ id: 'p2', name: 'Goûté ailleurs' }), items: [] },
    ] as never);

    const { data, truncated } = await productService.list();

    expect(truncated).toBe(false);
    expect(data[0]).toMatchObject({ id: 'p1', region: 'Médoc', fieldSources: { region: 'ocr' }, collections: [{ id: 'col1' }] });
    expect(data[0].readiness).toEqual(expect.any(Number));
    expect(data[0].items).toEqual([{
      id: 'b1', productId: 'p1', userId: 'u1', updatedBy: null, cellarId: 'c1', slots: [{ id: 's1', column: 2, row: 1 }],
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

  // §10.5: a "Plus en cave" card shows when the wine was last tasted or drunk.
  it('dates the last activity of each family from its tastings and finished bottles, in two queries', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { ...family({ id: 'p1' }), items: [] }, { ...family({ id: 'p2' }), items: [] }, { ...family({ id: 'p3' }), items: [] },
    ] as never);
    vi.mocked(prisma.tastingNote.groupBy).mockResolvedValue([
      { productId: 'p1', _max: { tastedAt: new Date('2026-05-01') } },
      { productId: 'p2', _max: { tastedAt: new Date('2026-03-01') } },
    ] as never);
    vi.mocked(prisma.inventoryItem.groupBy).mockResolvedValue([
      { productId: 'p1', _max: { updatedAt: new Date('2026-04-01') } },
      { productId: 'p2', _max: { updatedAt: new Date('2026-06-01') } },
    ] as never);

    const { data } = await productService.list();

    expect(data.map((view) => view.lastActivityAt)).toEqual([new Date('2026-05-01'), new Date('2026-06-01'), null]);
    expect(prisma.tastingNote.groupBy).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.inventoryItem.groupBy).mock.calls).toHaveLength(1);
    expect(vi.mocked(prisma.inventoryItem.groupBy).mock.calls[0][0]).toMatchObject({
      where: { productId: { in: ['p1', 'p2', 'p3'] }, deletedAt: null, ...FINISHED_ITEM_STATE },
    });
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

    // FEAT-87 references (until the transformation removes them) are not bottles of the wine.
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

describe('productService.get — history of moves, new prices and corrections (#471, W3)', () => {
  it('tells how many copies were moved or repriced, and why a number was corrected', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue({ ...family(), items: [unit()] } as never);
    vi.mocked(prisma.tastingNote.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      { id: 3, userId: 'u1', bottleId: 'b2', action: 'MOVE_UNITS', status: 'success', createdAt: new Date(),
        details: { count: 2, cellarId: { from: 'garage', to: 'kitchen' }, fromItemId: 'b1', changes: [{ field: 'quantity', from: null, to: 2 }, { field: 'cellarId', from: 'garage', to: 'kitchen' }] } },
      { id: 2, userId: 'u1', bottleId: 'b1', action: 'CORRECT_QUANTITY', status: 'success', createdAt: new Date(),
        details: { reason: 'written_off', changes: [{ field: 'quantity', from: 6, to: 4 }] } },
      { id: 1, userId: 'u1', bottleId: 'b1', action: 'UPDATE', status: 'success', createdAt: new Date(),
        details: { reason: 'not a reason', count: '2', changes: [] } },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', displayName: 'Romain', username: 'r' }] as never);

    const detail = await productService.get('p1');

    expect(detail?.history[0]).toMatchObject({ action: 'MOVE_UNITS', count: 2 });
    expect(detail?.history[1]).toMatchObject({ action: 'CORRECT_QUANTITY', reason: 'written_off' });
    expect(detail?.history[1]).not.toHaveProperty('count');
    // Anything else in the details stays out of the history.
    expect(detail?.history[2]).not.toHaveProperty('count');
    expect(detail?.history[2]).not.toHaveProperty('reason');
  });
});

describe('productService.updateDescription (FEAT-92 c4)', () => {
  beforeEach(() => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(family() as never);
    vi.mocked(prisma.product.findUniqueOrThrow).mockResolvedValue(family() as never);
  });

  it('writes the family once, its units untouched (D22, no copy since lot Z)', async () => {
    const result = await productService.updateDescription('u2', 'p1', { region: 'Médoc' });

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { region: 'Médoc', lockedFields: ['region'], updatedBy: 'u2' },
    });
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ changes: [{ field: 'region', from: null, to: 'Médoc' }] });
  });

  // Review of #854: a wine made a cigar is a group of single cigars — one cell for the group.
  it('FEAT-93: a new category frees the cells a unit can no longer hold, the most recent first, for its history', async () => {
    vi.mocked(prisma.product.update).mockResolvedValue(family({ category: 'cigar' }) as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([unit({ id: 'b1', quantity: 3 })] as never);
    slots.rows.push(...[1, 2, 3].map((column) => slot({ itemId: 'b1', column, row: 1 })));

    const result = await productService.updateDescription('u2', 'p1', { category: 'cigar' });

    expect(slots.cellsOf('b1')).toBe('1:1');
    expect(result).toMatchObject({
      unitSlotChanges: [{
        itemId: 'b1',
        changes: [{ field: 'slot', from: { column: 3, row: 1 }, to: null }, { field: 'slot', from: { column: 2, row: 1 }, to: null }],
      }],
    });
  });

  it('a description edit that keeps the category leaves the cells alone', async () => {
    slots.rows.push(slot({ itemId: 'b1', column: 1, row: 1 }), slot({ itemId: 'b1', column: 2, row: 1 }));

    const result = await productService.updateDescription('u2', 'p1', { region: 'Médoc' });

    expect(slots.cellsOf('b1')).toBe('1:1 2:1');
    expect(result).toMatchObject({ unitSlotChanges: [] });
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

  // #593: a "Lagavulin 16" saved as a wine with a 2026-2030 window, then corrected.
  it('clears the drinking window of a wine made a spirit or a cigar, never its bottles', async () => {
    const year = new Date().getFullYear();
    for (const category of ['spirit', 'cigar'] as const) {
      vi.mocked(prisma.product.update).mockClear();
      vi.mocked(prisma.product.findUniqueOrThrow).mockResolvedValue(family({
        peakMaturityFrom: year - 1, peakMaturityTo: year + 3, curveShape: 'BELL', alertStatus: 'peak',
      }) as never);
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([unit()] as never);

      const result = await productService.updateDescription('u2', 'p1', { category });

      const { data } = vi.mocked(prisma.product.update).mock.calls[0][0];
      expect(data).toMatchObject({ category, peakMaturityFrom: null, peakMaturityTo: null, curveShape: null, alertStatus: 'none' });
      expect(data).not.toHaveProperty('quantity');
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
      expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
      expect(result).toMatchObject({ changes: expect.arrayContaining([
        { field: 'peakMaturityFrom', from: year - 1, to: null },
        { field: 'peakMaturityTo', from: year + 3, to: null },
        { field: 'curveShape', from: 'BELL', to: null },
      ]) });
    }
  });

  it('#593: drops the locks and sources of the cleared window, the others kept', async () => {
    vi.mocked(prisma.product.findUniqueOrThrow).mockResolvedValue(family({
      peakMaturityFrom: 2026, peakMaturityTo: 2030,
      lockedFields: ['region', 'peakMaturityFrom'], fieldSources: { region: 'ocr', peakMaturityTo: 'import_csv' },
    }) as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    await productService.updateDescription('u2', 'p1', { category: 'spirit', peakMaturityTo: 2031 });

    const { data } = vi.mocked(prisma.product.update).mock.calls[0][0];
    expect(data.lockedFields).toEqual(['region', 'category']);
    expect(data.fieldSources).toEqual({ region: 'ocr' });
  });

  it('#593: writes no drinking window on a spirit, and keeps it on a wine made a sparkling wine', async () => {
    vi.mocked(prisma.product.findUniqueOrThrow).mockResolvedValue(family({ category: 'spirit' }) as never);
    await productService.updateDescription('u2', 'p1', { region: 'Islay', peakMaturityFrom: 2026, peakMaturityTo: 2030 });
    expect(vi.mocked(prisma.product.update).mock.calls[0][0].data).not.toHaveProperty('peakMaturityFrom');
    expect(vi.mocked(prisma.product.update).mock.calls[0][0].data).not.toHaveProperty('peakMaturityTo');

    vi.mocked(prisma.product.update).mockClear();
    vi.mocked(prisma.product.findUniqueOrThrow).mockResolvedValue(family({ peakMaturityFrom: 2026, peakMaturityTo: 2030 }) as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);
    await productService.updateDescription('u2', 'p1', { category: 'sparkling' });
    expect(vi.mocked(prisma.product.update).mock.calls[0][0].data).not.toHaveProperty('peakMaturityFrom');
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

    const result = await productService.trash('p1', 'u1');

    const unitWrite = vi.mocked(prisma.inventoryItem.updateMany).mock.calls[0][0]!;
    expect(unitWrite.where).toEqual({ productId: 'p1', deletedAt: null });
    // FEAT-93 (#174): their cells go to the trash with them, same timestamp.
    expect(slots.delegate.updateMany).toHaveBeenCalledWith({
      where: { itemId: { in: ['b1', 'b2'] }, deletedAt: null }, data: { deletedAt: unitWrite.data.deletedAt },
    });
    const familyWrite = vi.mocked(prisma.product.update).mock.calls[0][0];
    expect(familyWrite).toEqual({ where: { id: 'p1' }, data: { deletedAt: unitWrite.data.deletedAt } });
    expect(result).toEqual({ deletedAt: unitWrite.data.deletedAt, itemIds: ['b1', 'b2'] });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('is null for a family in the trash, itself or through all its units (D10)', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null);

    expect(await productService.trash('p1', 'u1')).toBeNull();
    expect(vi.mocked(prisma.product.findFirst).mock.calls[0][0]!.where).toEqual({
      id: 'p1', deletedAt: null, OR: [{ items: { none: {} } }, { items: { some: { deletedAt: null } } }],
    });
    expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it('brings back the units trashed with the family, not the ones trashed on their own before', async () => {
    const deletedAt = new Date(Date.now() - 60_000);
    vi.mocked(prisma.product.findFirst).mockResolvedValue(family({ deletedAt }) as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([{ id: 'b1' }] as never);

    const restored = await productService.restore('p1', 'u1');

    expect(vi.mocked(prisma.product.findFirst).mock.calls[0][0]!.where).toMatchObject({ id: 'p1', deletedAt: { not: null, gte: expect.any(Date) } });
    expect(vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0]!.where).toEqual({ productId: 'p1', deletedAt });
    expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['b1'] } }, data: { deletedAt: null } });
    expect(prisma.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { deletedAt: null } });
    expect(restored).toMatchObject({ id: 'p1' });
  });

  // #174: a cell may have been given to another bottle meanwhile.
  it('brings a copy back unplaced when its cell was taken meanwhile, the others in theirs (FEAT-93)', async () => {
    const deletedAt = new Date(Date.now() - 60_000);
    vi.mocked(prisma.product.findFirst).mockResolvedValue(family({ deletedAt }) as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([{ id: 'b1' }] as never);
    slots.rows.push(
      slot({ itemId: 'b1', column: 2, row: 3, deletedAt }),
      slot({ itemId: 'b1', column: 4, row: 3, deletedAt }),
      slot({ itemId: 'other', column: 2, row: 3 }),
    );

    await productService.restore('p1', 'u1');

    expect(slots.cellsOf('b1')).toBe('4:3');
    expect(slots.rows.filter((row) => row.itemId === 'b1')).toHaveLength(1);
    expect(slots.cellsOf('other')).toBe('2:3');
  });

  // Review of #854 (nit): cells its category no longer allows (made single cigars) — never a 500 at the commit.
  it('a unit back with more cells than its family now allows keeps only what it may hold, told in its history', async () => {
    const deletedAt = new Date(Date.now() - 60_000);
    vi.mocked(prisma.product.findFirst).mockResolvedValue(family({ deletedAt, category: 'cigar' }) as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      { id: 'b1', quantity: 3, cigarsPerBox: null, isOpened: false, fillLevel: null, cigarsLeft: null, writtenOffAt: null, deletedAt: null },
    ] as never);
    slots.rows.push(...[1, 2, 3].map((column) => slot({ itemId: 'b1', column, row: 1, deletedAt })));
    const freed: Array<{ itemId: string; changes: unknown[] }> = [];

    await productService.restore('p1', 'u1', freed as never);

    expect(slots.rows.filter((row) => row.itemId === 'b1' && row.deletedAt === null)).toHaveLength(1);
    expect(freed).toEqual([{ itemId: 'b1', changes: [expect.objectContaining({ field: 'slot', to: null }), expect.objectContaining({ field: 'slot', to: null })] }]);
  });

  it('is null once the family is past the retention period', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null);

    expect(await productService.restore('p1', 'u1')).toBeNull();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('lists a trashed family with the units trashed together with it', async () => {
    const deletedAt = new Date();
    vi.mocked(prisma.product.findMany).mockResolvedValue([{
      ...family({ deletedAt }),
      items: [unit({ id: 'b1', deletedAt: new Date(deletedAt) }), unit({ id: 'b0', deletedAt: new Date(deletedAt.getTime() - 1000) })],
    }] as never);

    const [trashed] = await productService.listTrash();

    expect(vi.mocked(prisma.product.findMany).mock.calls[0][0]!.include).toMatchObject({ items: { where: { deletedAt: { not: null } } } });
    expect(trashed).toMatchObject({ id: 'p1', deletedAt });
    expect(trashed.items.map((item) => item.id)).toEqual(['b1']);
  });
});

describe('productService.rollbackField (FEAT-05 on a wine)', () => {
  /** An audit row of the family's history, as `readFieldHistory` reads it. */
  const logged = (changes: { field: string; from: unknown; to: unknown }[], bottleId: string | null = null) => ({
    id: 1, action: 'UPDATE', status: 'success', userId: 'u1', bottleId, productId: 'p1',
    details: { changes }, createdAt: new Date('2026-10-30T10:00:00Z'),
  });
  /** What the route hands over: the value as read in the history, and as parsed. */
  const restore = (field: string, toValue: unknown, value: unknown = toValue) => ({ field, toValue, patch: { [field]: value } });

  beforeEach(() => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(family({ region: 'Médoc' }) as never);
    vi.mocked(prisma.product.findUniqueOrThrow).mockResolvedValue(family({ region: 'Médoc' }) as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([logged([{ field: 'region', from: 'Bordeaux', to: 'Médoc' }])] as never);
  });

  it('writes a value of the wine\'s history back on the family, locked as a manual entry', async () => {
    const result = await productService.rollbackField('u2', 'p1', restore('region', 'Bordeaux'));

    expect(vi.mocked(prisma.auditLog.findMany).mock.calls[0][0]!.where).toMatchObject({ productId: 'p1' });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { region: 'Bordeaux', lockedFields: ['region'], updatedBy: 'u2' },
    });
    // D22: the bottles are not written (no copy of the description since lot Z).
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'success', changes: [{ field: 'region', from: 'Médoc', to: 'Bordeaux' }] });
  });

  it('drops an automated source: the restored field is a manual entry again', async () => {
    vi.mocked(prisma.product.findUniqueOrThrow).mockResolvedValue(family({ region: 'Médoc', fieldSources: { region: 'ocr' } }) as never);

    await productService.rollbackField('u2', 'p1', restore('region', 'Bordeaux'));

    expect(vi.mocked(prisma.product.update).mock.calls[0][0].data).toMatchObject({ lockedFields: ['region'], fieldSources: {} });
  });

  it('accepts a value changed through one of its bottles before the families', async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([logged([{ field: 'region', from: 'Graves', to: 'Médoc' }], 'b1')] as never);

    expect(await productService.rollbackField('u2', 'p1', restore('region', 'Graves'))).toMatchObject({ status: 'success' });
  });

  it('refuses a value that is not in the wine\'s history, writing nothing', async () => {
    expect(await productService.rollbackField('u2', 'p1', restore('region', 'Bourgogne'))).toEqual({ status: 'invalid_value' });
    expect(await productService.rollbackField('u2', 'p1', restore('region', undefined))).toEqual({ status: 'invalid_value' });
    // A value of another field does not count.
    expect(await productService.rollbackField('u2', 'p1', restore('appellation', 'Bordeaux'))).toEqual({ status: 'invalid_value' });
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('answers a conflict, writing nothing, when the family changed since the history was read', async () => {
    const result = await productService.rollbackField('u2', 'p1', restore('region', 'Bordeaux'), '2026-09-30T10:00:00.000Z');

    expect(result).toMatchObject({ conflict: true, product: { id: 'p1' } });
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('checks expectedUpdatedAt on the family once locked', async () => {
    const result = await productService.rollbackField('u2', 'p1', restore('region', 'Bordeaux'), '2026-10-01T10:00:00.000Z');

    expect(result).toMatchObject({ status: 'success' });
    // The second read is the one under the lock (the first only answers an unknown wine early).
    expect(vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(prisma.product.findFirst).mock.invocationCallOrder[1]);
  });

  it('compares the value as read in the history and writes it as parsed (a date)', async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      logged([{ field: 'reminderDate', from: '2027-01-01T00:00:00.000Z', to: null }]),
    ] as never);
    const day = new Date('2027-01-01T00:00:00.000Z');

    await productService.rollbackField('u2', 'p1', restore('reminderDate', '2027-01-01T00:00:00.000Z', day));

    expect(vi.mocked(prisma.product.update).mock.calls[0][0].data).toMatchObject({ reminderDate: day });
  });

  it('refuses a drinking window ending before its stored start', async () => {
    vi.mocked(prisma.product.findUniqueOrThrow).mockResolvedValue(family({ peakMaturityFrom: 2030 }) as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([logged([{ field: 'peakMaturityTo', from: 2025, to: 2035 }])] as never);

    await expect(productService.rollbackField('u2', 'p1', restore('peakMaturityTo', 2025))).rejects.toBeInstanceOf(ZodError);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('is null for an unknown or trashed family', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null);

    expect(await productService.rollbackField('u2', 'p1', restore('region', 'Bordeaux'))).toBeNull();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
});

// #471 (FEAT-97 c1, c3): "Vous avez déjà ce vin" — the families of the wine
// being typed (`productKey`: category, producer, name, vintage; the vitola
// for a cigar), wines known without bottle included, the trash excluded.
describe('productService.matching (FEAT-97)', () => {
  const asked = { category: 'wine' as const, producer: '  domaine y ', name: 'CUVÉE X', vintage: 2020, format: null, anyFormat: false };

  it('finds the family of the same wine, case and edge spaces ignored, without bottle included', async () => {
    vi.mocked(prisma.product.findMany)
      .mockResolvedValueOnce([family({ vintage: 2020 }), family({ id: 'p9', vintage: 2020, name: 'Cuvée X Réserve' })] as never)
      .mockResolvedValueOnce([{ ...family({ vintage: 2020 }), items: [] }] as never);

    const found = await productService.matching(asked);

    expect(found.map((view) => view.id)).toEqual(['p1']);
    // Narrowed in the database by category and name, listed families only (D10: the trash excluded).
    expect(vi.mocked(prisma.product.findMany).mock.calls[0][0]).toMatchObject({
      where: {
        category: 'wine', deletedAt: null,
        OR: [{ items: { none: {} } }, { items: { some: { deletedAt: null } } }],
        name: { contains: 'CUVÉE X', mode: 'insensitive' },
      },
    });
  });

  it('does not propose the same wine of another vintage, nor a vintage for a wine without one (D26)', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValueOnce([family({ vintage: 2019 }), family({ id: 'p2', vintage: null })] as never);

    expect(await productService.matching(asked)).toEqual([]);
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
  });

  it('finds every vitola of a cigar asked without one, when told to (a wish has no vitola)', async () => {
    vi.mocked(prisma.product.findMany)
      .mockResolvedValueOnce([
        family({ category: 'cigar', name: 'No. 2', producer: 'Montecristo', format: 'Robusto' }),
        family({ id: 'p2', category: 'cigar', name: 'No. 2', producer: 'Montecristo', format: null }),
        family({ id: 'p3', category: 'cigar', name: 'No. 2', producer: 'Partagás', format: 'Robusto' }),
      ] as never)
      .mockResolvedValueOnce([] as never);

    await productService.matching({ category: 'cigar', producer: 'Montecristo', name: 'No. 2', vintage: null, format: null, anyFormat: true });

    expect(vi.mocked(prisma.product.findMany).mock.calls[1][0]).toMatchObject({ where: { id: { in: ['p1', 'p2'] } } });
  });

  it('compares the vitola, not the vintage, for a cigar', async () => {
    vi.mocked(prisma.product.findMany)
      .mockResolvedValueOnce([
        family({ category: 'cigar', name: 'No. 2', producer: 'Montecristo', format: 'Robusto' }),
        family({ id: 'p2', category: 'cigar', name: 'No. 2', producer: 'Montecristo', format: 'Churchill' }),
      ] as never)
      .mockResolvedValueOnce([{ ...family({ category: 'cigar' }), items: [] }] as never);

    const found = await productService.matching({ category: 'cigar', producer: 'Montecristo', name: 'No. 2', vintage: 2020, format: ' robusto', anyFormat: false });

    expect(found.map((view) => view.id)).toEqual(['p1']);
    expect(vi.mocked(prisma.product.findMany).mock.calls[1][0]).toMatchObject({ where: { id: { in: ['p1'] } } });
  });
});
