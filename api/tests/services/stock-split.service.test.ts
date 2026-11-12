import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    product: { findFirst: vi.fn(), findUnique: vi.fn() },
    cellar: { findUnique: vi.fn() },
    stockMovement: { createMany: vi.fn(async () => ({ count: 0 })) },
    inventoryItem: { findMany: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    itemSlot: {},
    inventoryCountEntry: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

import { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { stockSplitService, type SplitOutcome } from '../../src/services/stock-split.service';
import { PRODUCT_FIELDS } from '../../src/lib/product-fields';
import { AppError } from '../../src/lib/errors';
import { itemSpend, itemUnits, itemValue } from '../../../shared/units';
import { fakeSlots, slot, type FakeSlot } from '../support/fake-slots';

function family(fields: Record<string, unknown> = {}) {
  return {
    id: 'p1', userId: 'u1', updatedBy: null,
    ...Object.fromEntries(PRODUCT_FIELDS.map((field) => [field, null])),
    category: 'wine', name: 'Cuvée X', producer: 'Domaine Y',
    tags: [], grapeVarieties: [], otherPhotoUrls: [], alertsPaused: false, alertStatus: 'none',
    lockedFields: [], fieldSources: null, deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-10-01T10:00:00Z'),
    ...fields,
  };
}

/** A unit row (money columns as numbers, as the extended client reads them). */
function unit(fields: Record<string, unknown> = {}) {
  return {
    id: 'g1', productId: 'p1', userId: 'u1', updatedBy: null, cellarId: 'garage',
    location: null, purchasePrice: 20, estimatedValue: null, purchasePlace: 'Caviste',
    purchasedAt: new Date('2026-01-15T00:00:00Z'), bottleSize: null, quantity: 6, cigarsPerBox: null, cigarsLeft: null,
    isOpened: false, fillLevel: null, openedAt: null, parentItemId: null, writtenOffAt: null, needsReview: false,
    fieldSources: null, lockedFields: [], deletedAt: null,
    createdAt: new Date('2026-01-15T09:00:00Z'), updatedAt: new Date('2026-01-15T09:00:00Z'),
    category: 'wine', name: 'Cuvée X', producer: 'Domaine Y',
    ...fields,
  };
}

type Row = ReturnType<typeof unit>;

/** The rows of the family as the transaction reads them; writes are applied to them. */
let rows: Row[];
/** FEAT-93: the cells of the plan (item_slots). */
let slots: ReturnType<typeof fakeSlots>;
const placeIn = (...placed: FakeSlot[]) => { slots.rows.push(...placed); };

const updates = () => vi.mocked(prisma.inventoryItem.update).mock.calls
  .map((call) => call[0] as { where: { id: string }; data: Record<string, unknown> })
  .map(({ where, data }) => ({ where, data }));
const created = () => vi.mocked(prisma.inventoryItem.create).mock.calls.map((call) => (call[0] as { data: Record<string, unknown> }).data);
/** The ids whose inventory entries were frozen (`keepFoundQuantities`), per call. */
const foundKeptFor = () => vi.mocked(prisma.$executeRaw).mock.calls
  .filter((call) => (call[0] as unknown as string[]).join('?').includes('coalesce(e."foundQuantity"'))
  .map((call) => (call[1] as { values: string[] }).values);
const sqlTexts = () => vi.mocked(prisma.$executeRaw).mock.calls.map((call) => (call[0] as unknown as string[]).join('?'));

function applied(outcome: SplitOutcome | null) {
  if (!outcome || 'conflict' in outcome) throw new Error(`expected an applied split, got ${JSON.stringify(outcome)}`);
  return outcome;
}

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(() => null, (err: unknown) => err);
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

/** Units, value and spending of the family's rows in stock, as the cards and the budget count them. */
function totals() {
  const live = rows.filter((row) => row.deletedAt === null);
  return {
    units: live.reduce((sum, row) => sum + itemUnits(row), 0),
    value: live.reduce((sum, row) => sum + itemValue(row), 0),
    spend: live.reduce((sum, row) => sum + itemSpend(row), 0),
  };
}
const unitsIn = (cellarId: string) => rows.filter((row) => row.cellarId === cellarId).reduce((sum, row) => sum + itemUnits(row), 0);

/** Rows are read as copies, as from a database: a later write never changes what was read. */
const copy = (row: Row | undefined) => (row ? { ...row } : null);

beforeEach(() => {
  vi.clearAllMocks();
  rows = [unit()];
  slots = fakeSlots();
  Object.assign(prisma, { itemSlot: slots.delegate });
  vi.mocked(prisma.inventoryItem.findUniqueOrThrow).mockImplementation(((args: { where: { id: string } }) =>
    Promise.resolve({ ...rows.find((row) => row.id === args.where.id)!, slots: slots.viewsOf(args.where.id) })) as never);
  vi.mocked(prisma.$transaction).mockImplementation(((callback: (tx: unknown) => unknown) => callback(prisma)) as never);
  vi.mocked(prisma.product.findFirst).mockResolvedValue(family() as never);
  vi.mocked(prisma.product.findUnique).mockResolvedValue(family() as never);
  vi.mocked(prisma.cellar.findUnique).mockImplementation(((args: { where: { id: string } }) =>
    Promise.resolve(args.where.id === 'nowhere' ? null : { id: args.where.id })) as never);
  vi.mocked(prisma.inventoryCountEntry.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.inventoryItem.findFirst).mockImplementation(((args: { where: { id: string } }) =>
    Promise.resolve(copy(rows.find((row) => row.id === args.where.id && row.deletedAt === null)))) as never);
  vi.mocked(prisma.inventoryItem.findMany).mockImplementation(((args: { where: { id: { not: string }; needsReview?: boolean } }) =>
    Promise.resolve(rows.filter((row) => row.id !== args.where.id.not && row.deletedAt === null && row.writtenOffAt === null
      && (args.where.needsReview === undefined || row.needsReview === args.where.needsReview))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(copy))) as never);
  vi.mocked(prisma.inventoryItem.update).mockImplementation(((args: { where: { id: string }; data: Record<string, unknown> }) => {
    const row = rows.find((candidate) => candidate.id === args.where.id)!;
    Object.assign(row, args.data, { updatedAt: new Date('2026-10-31T12:00:00Z') });
    return Promise.resolve({ ...row });
  }) as never);
  vi.mocked(prisma.inventoryItem.create).mockImplementation(((args: { data: Record<string, unknown> }) => {
    const row = { ...unit(), ...args.data, updatedAt: new Date('2026-10-31T12:00:00Z') } as Row;
    if (!('createdAt' in args.data)) row.createdAt = new Date('2026-10-31T12:00:00Z');
    rows.push(row);
    return Promise.resolve({ ...row });
  }) as never);
  vi.mocked(prisma.inventoryItem.deleteMany).mockImplementation(((args: { where: { id: { in: string[] } } }) => {
    rows = rows.filter((row) => !args.where.id.in.includes(row.id));
    return Promise.resolve({ count: 1 });
  }) as never);
});

describe('stockSplitService.moveUnits (FEAT-98 c1-c4)', () => {
  it('c1-c2: 2 of a garage ×6 to the kitchen leave garage ×4 and make kitchen ×2, nothing else changes', async () => {
    const before = totals();

    const outcome = applied(await stockSplitService.moveUnits('u2', 'g1', { count: 2, cellarId: 'kitchen' }));

    // The family is locked before any unit is written (locking rule).
    expect(vi.mocked(prisma.$queryRaw).mock.calls.map((call) => call[1])).toEqual(['p1']);
    expect(vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(prisma.inventoryItem.update).mock.invocationCallOrder[0]);
    expect(updates()).toEqual([{ where: { id: 'g1' }, data: { quantity: 4, updatedBy: 'u2' } }]);
    expect(created()).toHaveLength(1);
    // The price, the size and the purchase day follow the bottles; no slot, no parent, nothing to review.
    expect(created()[0]).toMatchObject({
      productId: 'p1', userId: 'u2', cellarId: 'kitchen', quantity: 2, purchasePrice: 20, purchasePlace: 'Caviste',
      purchasedAt: new Date('2026-01-15T00:00:00Z'), parentItemId: null, needsReview: false,
    });
    expect(created()[0].id).not.toBe('g1');
    expect(outcome.result).toMatchObject({
      data: { cellarId: 'kitchen', quantity: 2, purchasedAt: '2026-01-15' },
      changed: [{ id: 'g1', cellarId: 'garage', quantity: 4 }],
      removedIds: [],
    });
    expect(totals()).toEqual(before);
    expect([unitsIn('garage'), unitsIn('kitchen')]).toEqual([4, 2]);
  });

  it('records the move on both groups (point 57)', async () => {
    const outcome = applied(await stockSplitService.moveUnits('u2', 'g1', { count: 2, cellarId: 'kitchen' }));
    const lineId = outcome.result.data.id;

    expect(outcome).toMatchObject({ productId: 'p1', count: 2, change: { field: 'cellarId', from: 'garage', to: 'kitchen' } });
    expect(outcome.entries).toEqual([
      { itemId: 'g1', toItemId: lineId, changes: [{ field: 'quantity', from: 6, to: 4 }] },
      { itemId: lineId, fromItemId: 'g1', changes: [{ field: 'quantity', from: null, to: 2 }, { field: 'cellarId', from: 'garage', to: 'kitchen' }] },
    ]);
  });

  it('#848: "2 bouteilles déplacées vers Cuisine" in the wine\'s journal, once', async () => {
    await stockSplitService.moveUnits('u2', 'g1', { count: 2, cellarId: 'kitchen' });

    expect(prisma.stockMovement.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.stockMovement.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({
      productId: 'p1', itemId: 'g1', kind: 'MOVED', delta: 0, count: 2, userId: 'u2',
      details: { cellarId: 'garage', fromCellarId: 'garage', toCellarId: 'kitchen' },
    })] });
  });

  it('leaves the cells of placed copies and the sub-records with the group of origin (unplaced copies move first)', async () => {
    rows = [unit(), unit({ id: 'opened', quantity: 1, isOpened: true, fillLevel: 60, parentItemId: 'g1' })];
    placeIn(slot({ itemId: 'g1', cellarId: 'garage', column: 2, row: 3 }));

    const outcome = applied(await stockSplitService.moveUnits('u1', 'g1', { count: 2, cellarId: 'kitchen' }));

    expect(rows.find((row) => row.id === 'g1')).toMatchObject({ quantity: 4 });
    expect(slots.cellsOf('g1')).toBe('2:3');
    expect(slots.cellsOf(created()[0].id as string)).toBe('');
    expect(created()[0]).toMatchObject({ parentItemId: null });
    expect(rows.find((row) => row.id === 'opened')).toMatchObject({ parentItemId: 'g1', cellarId: 'garage' });
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(outcome.result.changed.map((row) => row.id)).toEqual(['g1']);
  });

  it('the guessed number stays to review on the group, not on the copies the member counted', async () => {
    rows = [unit({ needsReview: true })];

    await stockSplitService.moveUnits('u1', 'g1', { count: 2, cellarId: 'kitchen' });

    expect(created()[0]).toMatchObject({ needsReview: false });
    expect(rows[0]).toMatchObject({ id: 'g1', needsReview: true, quantity: 4 });
  });

  it('c3: completes the identical group of the kitchen (×1 → ×3) instead of making a line', async () => {
    rows.push(unit({ id: 'k1', cellarId: 'kitchen', quantity: 1, purchasePlace: null, createdAt: new Date('2026-02-01T00:00:00Z') }));
    const before = totals();

    const outcome = applied(await stockSplitService.moveUnits('u2', 'g1', { count: 2, cellarId: 'kitchen' }));

    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
    expect(updates()).toEqual([
      { where: { id: 'g1' }, data: { quantity: 4, updatedBy: 'u2' } },
      {
        where: { id: 'k1' },
        // What the kitchen line left empty, the copies bring (nothing lost).
        data: { quantity: 3, purchasePlace: 'Caviste', location: null, lockedFields: [], fieldSources: Prisma.DbNull, updatedBy: 'u2' },
      },
    ]);
    // D15: an inventory entry that counted the kitchen line keeps the number it found.
    expect(foundKeptFor()).toEqual([['k1']]);
    expect(outcome.result).toMatchObject({ data: { id: 'k1', quantity: 3 }, changed: [{ id: 'g1', quantity: 4 }], removedIds: [] });
    expect(outcome.entries[1]).toEqual({
      itemId: 'k1', fromItemId: 'g1', changes: [{ field: 'quantity', from: 1, to: 3 }, { field: 'cellarId', from: 'garage', to: 'kitchen' }],
    });
    expect(totals()).toEqual(before);
    expect([unitsIn('garage'), unitsIn('kitchen')]).toEqual([4, 3]);
  });

  it.each([
    ['another purchase day', { purchasedAt: new Date('2026-06-01T00:00:00Z') }],
    ['another price', { purchasePrice: 25 }],
    ['another size', { bottleSize: 'Magnum' }],
    ['another estimated value (the value would change)', { estimatedValue: 40 }],
    ['an opened bottle', { quantity: 1, isOpened: true, fillLevel: 50 }],
    ['a write-off', { writtenOffAt: new Date('2026-05-01T00:00:00Z') }],
    ['a group in the trash', { deletedAt: new Date('2026-05-01T00:00:00Z') }],
    ['a number still to review (as the review merge)', { needsReview: true }],
    // design.md rule 4 (W3 review): joining would lose one of the two.
    ['another place of purchase', { purchasePlace: 'Autre caviste' }],
  ])('never completes a kitchen line with %s', async (_label, fields) => {
    rows.push(unit({ id: 'k1', cellarId: 'kitchen', quantity: 1, ...fields }));

    await stockSplitService.moveUnits('u1', 'g1', { count: 2, cellarId: 'kitchen' });

    expect(created()).toHaveLength(1);
    expect(updates().map((update) => update.where.id)).toEqual(['g1']);
  });

  it('never completes a line whose location contradicts the copies taken (rule 4): a new line', async () => {
    rows[0] = unit({ location: 'Bas' });
    rows.push(unit({ id: 'k1', cellarId: 'kitchen', quantity: 1, location: 'Haut' }));

    await stockSplitService.moveUnits('u1', 'g1', { count: 2, cellarId: 'kitchen' });

    expect(created()).toHaveLength(1);
    expect(updates().map((update) => update.where.id)).toEqual(['g1']);
  });

  it('places agree when one is empty or they differ only by case and spaces: the line is completed', async () => {
    rows.push(unit({ id: 'k1', cellarId: 'kitchen', quantity: 1, purchasePlace: '  caviste ', location: 'Haut' }));

    await stockSplitService.moveUnits('u1', 'g1', { count: 2, cellarId: 'kitchen' });

    expect(created()).toHaveLength(0);
    expect(updates().map((update) => update.where.id)).toEqual(['g1', 'k1']);
  });

  it('matches the size as the group identity does (trimmed, case-insensitive)', async () => {
    rows = [unit({ bottleSize: 'Magnum' }), unit({ id: 'k1', cellarId: 'kitchen', quantity: 1, bottleSize: ' magnum ' })];

    await stockSplitService.moveUnits('u1', 'g1', { count: 2, cellarId: 'kitchen' });

    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
  });

  it('moves a whole group by changing its cellar, and its cells stay behind (freed before the cellar is written)', async () => {
    placeIn(slot({ itemId: 'g1', cellarId: 'garage', column: 1, row: 1 }));
    const before = totals();

    const outcome = applied(await stockSplitService.moveUnits('u2', 'g1', { count: 6, cellarId: 'kitchen' }));

    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
    expect(updates()).toEqual([{ where: { id: 'g1' }, data: { cellarId: 'kitchen', updatedBy: 'u2' } }]);
    expect(slots.cellsOf('g1')).toBe('');
    expect(slots.delegate.deleteMany.mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(prisma.inventoryItem.update).mock.invocationCallOrder[0]);
    expect(outcome.result).toMatchObject({ data: { id: 'g1', cellarId: 'kitchen', quantity: 6 }, changed: [], removedIds: [] });
    expect(outcome.entries).toEqual([{
      itemId: 'g1',
      changes: [{ field: 'cellarId', from: 'garage', to: 'kitchen' }, { field: 'slot', from: { column: 1, row: 1 }, to: null }],
    }]);
    expect(totals()).toEqual(before);
  });

  it('FEAT-93 (q=3, s=3, 2 moved) without slotIds: 409 SLOTS_TO_FREE_REQUIRED {needed: 2}, nothing written', async () => {
    rows = [unit({ quantity: 3 })];
    placeIn(
      slot({ itemId: 'g1', cellarId: 'garage', column: 1, row: 1 }),
      slot({ itemId: 'g1', cellarId: 'garage', column: 2, row: 1 }),
      slot({ itemId: 'g1', cellarId: 'garage', column: 3, row: 1 }),
    );

    const error = await rejection(stockSplitService.moveUnits('u1', 'g1', { count: 2, cellarId: 'kitchen' }));

    expect(error).toMatchObject({ status: 409, code: 'SLOTS_TO_FREE_REQUIRED', details: { needed: 2 } });
    expect((error.details as { slots: unknown[] }).slots).toHaveLength(3);
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    expect(slots.cellsOf('g1')).toBe('1:1 2:1 3:1');
  });

  it('FEAT-93 (q=3, s=3, 2 moved) with the cells named: those are freed, the copies arrive unplaced', async () => {
    rows = [unit({ quantity: 3 })];
    const [first, second, third] = [
      slot({ itemId: 'g1', cellarId: 'garage', column: 1, row: 1 }),
      slot({ itemId: 'g1', cellarId: 'garage', column: 2, row: 1 }),
      slot({ itemId: 'g1', cellarId: 'garage', column: 3, row: 1 }),
    ];
    placeIn(first, second, third);

    const outcome = applied(await stockSplitService.moveUnits('u1', 'g1', { count: 2, cellarId: 'kitchen', slotIds: [first.id, third.id] }));

    expect(slots.cellsOf('g1')).toBe('2:1');
    expect(slots.cellsOf(outcome.result.data.id)).toBe('');
    expect(outcome.entries[0].changes).toEqual([
      { field: 'quantity', from: 3, to: 1 },
      { field: 'slot', from: { column: 3, row: 1 }, to: null },
      { field: 'slot', from: { column: 1, row: 1 }, to: null },
    ]);
  });

  it('FEAT-93 (q=3, s=1, 2 moved): unplaced copies leave, no question, the cell stays', async () => {
    rows = [unit({ quantity: 3 })];
    placeIn(slot({ itemId: 'g1', cellarId: 'garage', column: 1, row: 1 }));

    applied(await stockSplitService.moveUnits('u1', 'g1', { count: 2, cellarId: 'kitchen' }));

    expect(slots.cellsOf('g1')).toBe('1:1');
  });

  it('FEAT-93: a whole group moved frees every cell without asking', async () => {
    rows = [unit({ quantity: 2 })];
    placeIn(slot({ itemId: 'g1', cellarId: 'garage', column: 1, row: 1 }), slot({ itemId: 'g1', cellarId: 'garage', column: 2, row: 1 }));

    applied(await stockSplitService.moveUnits('u1', 'g1', { count: 2, cellarId: 'kitchen' }));

    expect(slots.cellsOf('g1')).toBe('');
  });

  it('moves a group of one without asking how many, out of any cellar too', async () => {
    rows = [unit({ quantity: 1 })];

    const outcome = applied(await stockSplitService.moveUnits('u1', 'g1', { count: 1, cellarId: null }));

    expect(outcome.result.data).toMatchObject({ id: 'g1', cellarId: null });
    expect(prisma.cellar.findUnique).not.toHaveBeenCalled();
  });

  it('a whole group joining an identical one loses nothing of its own: place, location, locks, sources, number to review', async () => {
    rows = [
      unit({ needsReview: true, location: 'Rack B', lockedFields: ['purchasePrice'], fieldSources: { purchasePrice: 'manual', location: 'import_csv' } }),
      unit({ id: 'k1', cellarId: 'kitchen', quantity: 1, purchasePlace: ' ', lockedFields: ['location'], fieldSources: { location: 'manual' } }),
    ];

    await stockSplitService.moveUnits('u2', 'g1', { count: 6, cellarId: 'kitchen' });

    expect(updates()).toEqual([{
      where: { id: 'k1' },
      data: {
        quantity: 7, purchasePlace: 'Caviste', location: 'Rack B', lockedFields: ['location', 'purchasePrice'],
        fieldSources: { purchasePrice: 'manual', location: 'manual' }, needsReview: true, updatedBy: 'u2',
      },
    }]);
    // D15: the entries of both groups keep the number they found, before either changes.
    expect(foundKeptFor()).toEqual([['g1', 'k1']]);
    expect(vi.mocked(prisma.$executeRaw).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(prisma.inventoryItem.update).mock.invocationCallOrder[0]);
  });

  it('a whole group joining an identical one gives it its copies, links and history, then is gone', async () => {
    rows.push(unit({ id: 'k1', cellarId: 'kitchen', quantity: 1 }));
    const before = totals();

    const outcome = applied(await stockSplitService.moveUnits('u2', 'g1', { count: 6, cellarId: 'kitchen' }));

    expect(outcome.result).toMatchObject({ data: { id: 'k1', quantity: 7 }, changed: [], removedIds: ['g1'] });
    expect(rows.map((row) => row.id)).toEqual(['k1']);
    // Tastings, history, inventory entries, wishlist link and sub-records follow (review.service absorbGroups).
    for (const table of ['tasting_notes', 'audit_logs', 'inventory_count_entries', 'wishlist_items', 'bottles']) {
      expect(sqlTexts().some((text) => text.startsWith(`UPDATE "${table}" SET`))).toBe(true);
    }
    expect(outcome.entries).toEqual([{
      itemId: 'k1', fromItemId: 'g1', changes: [{ field: 'quantity', from: 1, to: 7 }, { field: 'cellarId', from: 'garage', to: 'kitchen' }],
    }]);
    expect(totals()).toEqual(before);
  });

  it('a whole group placed joining an identical one tells the cells it freed on the line it joined (recette #847, KO 6.6)', async () => {
    rows = [unit({ quantity: 2 }), unit({ id: 'k1', cellarId: 'kitchen', quantity: 1 })];
    placeIn(slot({ itemId: 'g1', cellarId: 'garage', column: 2, row: 2 }));

    const outcome = applied(await stockSplitService.moveUnits('u2', 'g1', { count: 2, cellarId: 'kitchen' }));

    expect(slots.cellsOf('g1')).toBe('');
    expect(outcome.entries).toEqual([{
      itemId: 'k1', fromItemId: 'g1', changes: [
        { field: 'quantity', from: 1, to: 3 }, { field: 'cellarId', from: 'garage', to: 'kitchen' },
        { field: 'slot', from: { column: 2, row: 2 }, to: null },
      ],
    }]);
  });

  it('a whole group counted in the same inventory session as the identical one simply changes cellar', async () => {
    rows.push(unit({ id: 'k1', cellarId: 'kitchen', quantity: 1 }));
    vi.mocked(prisma.inventoryCountEntry.findMany).mockResolvedValue([
      { itemId: 'g1', sessionId: 's1' }, { itemId: 'k1', sessionId: 's1' },
    ] as never);

    const outcome = applied(await stockSplitService.moveUnits('u2', 'g1', { count: 6, cellarId: 'kitchen' }));

    expect(prisma.inventoryItem.deleteMany).not.toHaveBeenCalled();
    expect(outcome.result).toMatchObject({ data: { id: 'g1', cellarId: 'kitchen', quantity: 6 }, removedIds: [] });
  });

  it('without purchase day, never completes a line created another day, and keeps its creation date (its spending stays in its period)', async () => {
    rows = [
      unit({ purchasedAt: null, createdAt: new Date('2026-03-10T09:00:00Z') }),
      unit({ id: 'k1', cellarId: 'kitchen', quantity: 1, purchasedAt: null, createdAt: new Date('2026-01-05T09:00:00Z') }),
    ];

    await stockSplitService.moveUnits('u1', 'g1', { count: 2, cellarId: 'kitchen' });

    expect(created()[0]).toMatchObject({ purchasedAt: null, createdAt: new Date('2026-03-10T09:00:00Z'), quantity: 2 });
    expect(updates().map((update) => update.where.id)).toEqual(['g1']);
  });

  it('without purchase day, a whole group simply changes, next to the dateless line', async () => {
    rows = [unit({ purchasedAt: null }), unit({ id: 'k1', cellarId: 'kitchen', quantity: 1, purchasedAt: null })];

    const outcome = applied(await stockSplitService.repriceUnits('u1', 'g1', { count: 6, purchasePrice: 25 }));

    expect(rows.map((row) => row.id)).toEqual(['g1', 'k1']);
    expect(outcome.result).toMatchObject({ data: { id: 'g1', purchasePrice: 25 }, removedIds: [] });
  });

  it('works on cigars the same way: boxes of the group, cigars counted', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(family({ category: 'cigar' }) as never);
    rows = [unit({ quantity: 3, cigarsPerBox: 25, purchasePrice: 200 })];
    const before = totals();

    await stockSplitService.moveUnits('u1', 'g1', { count: 1, cellarId: 'humidor' });

    expect(created()[0]).toMatchObject({ quantity: 1, cigarsPerBox: 25, cellarId: 'humidor' });
    expect(totals()).toEqual(before);
    expect(unitsIn('humidor')).toBe(25);
  });

  describe('refusals', () => {
    it('c4: more copies than the group holds → 400, nothing written', async () => {
      const error = await rejection(stockSplitService.moveUnits('u1', 'g1', { count: 7, cellarId: 'kitchen' }));

      expect([error.status, error.code]).toEqual([400, 'COUNT_ABOVE_GROUP']);
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
      expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
    });

    it.each([
      ['an opened bottle', { quantity: 1, isOpened: true, fillLevel: 60 }],
      ['a finished bottle', { quantity: 1, isOpened: true, fillLevel: 0 }],
      ['an opened box', { quantity: 1, cigarsPerBox: 25, cigarsLeft: 10, isOpened: true }],
      ['a write-off', { writtenOffAt: new Date('2026-05-01T00:00:00Z') }],
    ])('%s is not a group → 409 NOT_A_GROUP', async (_label, fields) => {
      rows = [unit(fields)];

      const error = await rejection(stockSplitService.moveUnits('u1', 'g1', { count: 1, cellarId: 'kitchen' }));

      expect([error.status, error.code]).toEqual([409, 'NOT_A_GROUP']);
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    });

    it('the same cellar → 400 SAME_CELLAR', async () => {
      const error = await rejection(stockSplitService.moveUnits('u1', 'g1', { count: 2, cellarId: 'garage' }));

      expect([error.status, error.code]).toEqual([400, 'SAME_CELLAR']);
    });

    it('an unknown cellar → 400 CELLAR_NOT_FOUND', async () => {
      const error = await rejection(stockSplitService.moveUnits('u1', 'g1', { count: 2, cellarId: 'nowhere' }));

      expect([error.status, error.code]).toEqual([400, 'CELLAR_NOT_FOUND']);
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    });

    it('a family in the trash → 409 PRODUCT_IN_TRASH', async () => {
      vi.mocked(prisma.product.findFirst).mockResolvedValue(null as never);

      const error = await rejection(stockSplitService.moveUnits('u1', 'g1', { count: 2, cellarId: 'kitchen' }));

      expect([error.status, error.code]).toEqual([409, 'PRODUCT_IN_TRASH']);
    });

    it('an unknown or trashed unit → null (404)', async () => {
      expect(await stockSplitService.moveUnits('u1', 'nope', { count: 1, cellarId: 'kitchen' })).toBeNull();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('a group changed since the client read it → conflict, checked under the lock, nothing written', async () => {
      const outcome = await stockSplitService.moveUnits('u1', 'g1', { count: 2, cellarId: 'kitchen', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' });

      expect(outcome).toMatchObject({ conflict: true, item: { id: 'g1', quantity: 6 } });
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    });

    it('accepts the group as the client read it', async () => {
      const outcome = await stockSplitService.moveUnits('u1', 'g1', { count: 2, cellarId: 'kitchen', expectedUpdatedAt: '2026-01-15T09:00:00.000Z' });

      expect(applied(outcome).result.changed).toHaveLength(1);
    });

    it('a group merged into another family meanwhile → conflict (its family was not the one locked)', async () => {
      vi.mocked(prisma.inventoryItem.findFirst)
        .mockResolvedValueOnce({ productId: 'p1' } as never)
        .mockResolvedValueOnce(unit({ productId: 'p2' }) as never);

      expect(await stockSplitService.moveUnits('u1', 'g1', { count: 2, cellarId: 'kitchen' })).toMatchObject({ conflict: true });
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    });

    it('a completed group beyond 1000 copies → 400 QUANTITY_TOO_LARGE', async () => {
      rows.push(unit({ id: 'k1', cellarId: 'kitchen', quantity: 999 }));

      const error = await rejection(stockSplitService.moveUnits('u1', 'g1', { count: 2, cellarId: 'kitchen' }));

      expect([error.status, error.code]).toEqual([400, 'QUANTITY_TOO_LARGE']);
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    });
  });
});

describe('stockSplitService.repriceUnits (FEAT-98 c5)', () => {
  it('#848 (point 57): "prix de 2 bouteilles 20 € → 25 €" in the wine\'s journal', async () => {
    await stockSplitService.repriceUnits('u2', 'g1', { count: 2, purchasePrice: 25 });

    expect(prisma.stockMovement.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({
      kind: 'PRICE_CHANGED', delta: 0, count: 2, details: { cellarId: 'garage', fromPrice: 20, toPrice: 25 },
    })] });
  });

  it('c5: 2 of a ×6 at 20 € to 25 € leave ×4 at 20 € and ×2 at 25 € in the same cellar; spending 120 € → 130 €', async () => {
    expect(totals()).toEqual({ units: 6, value: 120, spend: 120 });

    const outcome = applied(await stockSplitService.repriceUnits('u2', 'g1', { count: 2, purchasePrice: 25 }));

    expect(created()[0]).toMatchObject({ cellarId: 'garage', purchasePrice: 25, quantity: 2, purchasedAt: new Date('2026-01-15T00:00:00Z') });
    expect(outcome.result).toMatchObject({
      data: { cellarId: 'garage', purchasePrice: 25, quantity: 2 },
      changed: [{ id: 'g1', purchasePrice: 20, quantity: 4 }],
    });
    // Units unchanged; spending and value follow the new price.
    expect(totals()).toEqual({ units: 6, value: 130, spend: 130 });
    expect(outcome.change).toEqual({ field: 'purchasePrice', from: 20, to: 25 });
    expect(outcome.entries[1].changes).toEqual([{ field: 'quantity', from: null, to: 2 }, { field: 'purchasePrice', from: 20, to: 25 }]);
  });

  it('keeps the value of copies with an estimated value', async () => {
    rows = [unit({ estimatedValue: 30 })];

    await stockSplitService.repriceUnits('u1', 'g1', { count: 2, purchasePrice: 25 });

    expect(totals()).toEqual({ units: 6, value: 180, spend: 130 });
  });

  it('the whole group simply changes price, its cells kept', async () => {
    placeIn(slot({ itemId: 'g1', cellarId: 'garage', column: 1, row: 2 }));

    const outcome = applied(await stockSplitService.repriceUnits('u2', 'g1', { count: 6, purchasePrice: 25 }));

    expect(updates()).toEqual([{ where: { id: 'g1' }, data: { purchasePrice: 25, updatedBy: 'u2' } }]);
    expect(outcome.result.data).toMatchObject({ id: 'g1', purchasePrice: 25 });
    expect(slots.cellsOf('g1')).toBe('1:2');
    expect(outcome.entries).toEqual([{ itemId: 'g1', changes: [{ field: 'purchasePrice', from: 20, to: 25 }] }]);
    expect(totals().spend).toBe(150);
  });

  it('part of the group completes an identical group at the new price', async () => {
    rows.push(unit({ id: 'g25', purchasePrice: 25, quantity: 1 }));

    const outcome = applied(await stockSplitService.repriceUnits('u1', 'g1', { count: 2, purchasePrice: 25 }));

    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
    expect(outcome.result.data).toMatchObject({ id: 'g25', quantity: 3 });
    expect(totals()).toEqual({ units: 7, value: 155, spend: 155 });
  });

  it('FEAT-93: the whole group joining the one at the new price, both placed: their cells are united on the survivor', async () => {
    rows = [unit(), unit({ id: 'g25', purchasePrice: 25, quantity: 1 })];
    placeIn(slot({ itemId: 'g1', cellarId: 'garage', column: 4, row: 1 }), slot({ itemId: 'g25', cellarId: 'garage', column: 5, row: 1 }));

    const outcome = applied(await stockSplitService.repriceUnits('u1', 'g1', { count: 6, purchasePrice: 25 }));

    expect(outcome.result).toMatchObject({ data: { id: 'g25', quantity: 7 }, removedIds: ['g1'] });
    // absorbGroups moves the absorbed group's cells to the survivor before deleting it.
    const moveSlots = sqlTexts().findIndex((sql) => sql.includes('UPDATE "item_slots" SET "itemId"'));
    expect(moveSlots).toBeGreaterThanOrEqual(0);
    expect(vi.mocked(prisma.$executeRaw).mock.invocationCallOrder[moveSlots])
      .toBeLessThan(vi.mocked(prisma.inventoryItem.deleteMany).mock.invocationCallOrder[0]);
  });

  it('FEAT-93: two groups of single cigars each in a cell: the group simply changes price, no cell lost', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(family({ category: 'cigar' }) as never);
    rows = [unit({ category: 'cigar' }), unit({ id: 'g25', purchasePrice: 25, quantity: 1, category: 'cigar' })];
    placeIn(slot({ itemId: 'g1', cellarId: 'garage', column: 4, row: 1 }), slot({ itemId: 'g25', cellarId: 'garage', column: 5, row: 1 }));

    const outcome = applied(await stockSplitService.repriceUnits('u1', 'g1', { count: 6, purchasePrice: 25 }));

    expect(prisma.inventoryItem.deleteMany).not.toHaveBeenCalled();
    expect(outcome.result).toMatchObject({ data: { id: 'g1', purchasePrice: 25 }, removedIds: [] });
    expect(slots.cellsOf('g1')).toBe('4:1');
    expect(slots.cellsOf('g25')).toBe('5:1');
  });

  it('FEAT-93 (decision #471 point 74, q=3, s=1, 2 repriced): unplaced copies take the new price, no question', async () => {
    rows = [unit({ quantity: 3 })];
    placeIn(slot({ itemId: 'g1', cellarId: 'garage', column: 1, row: 1 }));

    const outcome = applied(await stockSplitService.repriceUnits('u1', 'g1', { count: 2, purchasePrice: 25 }));

    expect(slots.cellsOf('g1')).toBe('1:1');
    expect(slots.cellsOf(outcome.result.data.id)).toBe('');
  });

  it('FEAT-93 (point 74, q=3, s=2, 2 repriced) without slotIds: 409 SLOTS_TO_FREE_REQUIRED {needed: 1}', async () => {
    rows = [unit({ quantity: 3 })];
    placeIn(slot({ itemId: 'g1', cellarId: 'garage', column: 1, row: 1 }), slot({ itemId: 'g1', cellarId: 'garage', column: 2, row: 1 }));

    const error = await rejection(stockSplitService.repriceUnits('u1', 'g1', { count: 2, purchasePrice: 25 }));

    expect(error).toMatchObject({ status: 409, code: 'SLOTS_TO_FREE_REQUIRED', details: { needed: 1 } });
    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
  });

  it('FEAT-93 (point 74, q=3, s=2, 2 repriced) with the cell named: it stays occupied and follows the line at the new price', async () => {
    rows = [unit({ quantity: 3 })];
    const first = slot({ itemId: 'g1', cellarId: 'garage', column: 1, row: 1 });
    placeIn(first, slot({ itemId: 'g1', cellarId: 'garage', column: 2, row: 1 }));

    const outcome = applied(await stockSplitService.repriceUnits('u1', 'g1', { count: 2, purchasePrice: 25, slotIds: [first.id] }));

    expect(slots.cellsOf('g1')).toBe('2:1');
    expect(slots.cellsOf(outcome.result.data.id)).toBe('1:1');
    expect(outcome.entries[0].changes).toContainEqual({ field: 'slot', from: { column: 1, row: 1 }, to: null });
    expect(outcome.entries[1].changes).toContainEqual({ field: 'slot', from: null, to: { column: 1, row: 1 } });
  });

  it('an empty price is a price of its own (≠ 0), and so is 0', async () => {
    rows.push(unit({ id: 'free', purchasePrice: 0, quantity: 1 }));

    const outcome = applied(await stockSplitService.repriceUnits('u1', 'g1', { count: 2, purchasePrice: null }));

    expect(created()[0]).toMatchObject({ purchasePrice: null, quantity: 2 });
    expect(outcome.result.data.purchasePrice).toBeNull();
  });

  it('the same price → 400 SAME_PRICE', async () => {
    const error = await rejection(stockSplitService.repriceUnits('u1', 'g1', { count: 2, purchasePrice: 20 }));

    expect([error.status, error.code]).toEqual([400, 'SAME_PRICE']);
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('more copies than the group holds → 400', async () => {
    const error = await rejection(stockSplitService.repriceUnits('u1', 'g1', { count: 7, purchasePrice: 25 }));

    expect(error.code).toBe('COUNT_ABOVE_GROUP');
  });
});
