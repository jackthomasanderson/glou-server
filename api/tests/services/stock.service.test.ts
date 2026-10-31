import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    product: { findFirst: vi.fn(), findUnique: vi.fn() },
    cellar: { findUnique: vi.fn() },
    inventoryItem: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../../src/lib/prisma';
import { stockService } from '../../src/services/stock.service';
import { PRODUCT_FIELDS } from '../../src/lib/product-fields';
import { AppError } from '../../src/lib/errors';

/** A family as Prisma returns it, every description field empty unless given. */
function family(fields: Record<string, unknown> = {}) {
  return {
    id: 'p1', userId: 'u1', updatedBy: null,
    ...Object.fromEntries(PRODUCT_FIELDS.map((field) => [field, null])),
    category: 'wine', name: 'Cuvée X', producer: 'Domaine Y', region: 'Bordeaux',
    tags: [], grapeVarieties: [], otherPhotoUrls: [], alertsPaused: false, alertStatus: 'none',
    lockedFields: [], fieldSources: null, deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-10-01T10:00:00Z'),
    ...fields,
  };
}

/** A unit row (money columns as numbers, as the extended client reads them at the top level). */
function unit(fields: Record<string, unknown> = {}) {
  return {
    id: 'b1', productId: 'p1', userId: 'u1', updatedBy: null, cellarId: 'c1', slotColumn: null, slotRow: null,
    location: null, purchasePrice: 20, estimatedValue: null, purchasePlace: null,
    purchasedAt: new Date('2026-01-15T00:00:00Z'), bottleSize: null, quantity: 6, cigarsPerBox: null, cigarsLeft: null,
    isOpened: false, fillLevel: null, openedAt: null, parentItemId: null, writtenOffAt: null, needsReview: false,
    fieldSources: null, lockedFields: [], isOwned: true, deletedAt: null,
    createdAt: new Date('2026-01-15T09:00:00Z'), updatedAt: new Date('2026-01-15T09:00:00Z'),
    // Transitional mirror of the description.
    category: 'wine', name: 'Cuvée X', producer: 'Domaine Y', region: 'Bordeaux',
    ...fields,
  };
}

const updateArgs = (call = 0) => vi.mocked(prisma.inventoryItem.update).mock.calls[call]?.[0] as
  { where: { id: string }; data: Record<string, unknown> } | undefined;
const createData = () => (vi.mocked(prisma.inventoryItem.create).mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
const lockedIds = () => vi.mocked(prisma.$queryRaw).mock.calls.map((call) => call[1]);

/** The group a correction reads; an update answers it with the data written. */
function storeGroup(fields: Record<string, unknown>) {
  const row = unit(fields);
  vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(row as never);
  vi.mocked(prisma.inventoryItem.update).mockImplementation(((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...row, ...args.data })) as never);
}

/** The correction as applied (neither unknown nor in conflict). */
function applied(outcome: Awaited<ReturnType<typeof stockService.correctQuantity>>) {
  if (!outcome || 'conflict' in outcome) throw new Error(`expected an applied correction, got ${JSON.stringify(outcome)}`);
  return outcome;
}

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(() => null, (err: unknown) => err);
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(((callback: (tx: unknown) => unknown) => callback(prisma)) as never);
  vi.mocked(prisma.product.findFirst).mockResolvedValue(family() as never);
  vi.mocked(prisma.product.findUnique).mockResolvedValue(family() as never);
  vi.mocked(prisma.cellar.findUnique).mockImplementation(((args: { where: { id: string } }) =>
    Promise.resolve({ id: args.where.id })) as never);
  vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.inventoryItem.update).mockImplementation(((args: { where: { id: string }; data: Record<string, unknown> }) =>
    Promise.resolve(unit({ id: args.where.id, ...args.data }))) as never);
  vi.mocked(prisma.inventoryItem.create).mockImplementation(((args: { data: Record<string, unknown> }) =>
    Promise.resolve(unit({ ...args.data, updatedAt: new Date() }))) as never);
});

describe('stockService.addUnits (FEAT-92 c1-c2, D5)', () => {
  it('completes the group of the same cellar, price, size and purchase day (×6 → ×8)', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([unit({ quantity: 6 })] as never);

    const outcome = await stockService.addUnits('u2', 'p1', {
      quantity: 2, cellarId: 'c1', purchasePrice: 20, purchasedAt: '2026-01-15',
    });

    expect(lockedIds()).toEqual(['p1']);
    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
    expect(updateArgs()).toEqual({ where: { id: 'b1' }, data: { quantity: 8, updatedBy: 'u2' } });
    expect(outcome).toMatchObject({ merged: true, from: 6, to: 8 });
    expect(outcome.result).toMatchObject({ data: { id: 'b1', quantity: 8, purchasedAt: '2026-01-15' }, changed: [], removedIds: [] });
  });

  it('matches the size as the group identity does: trimmed, case-insensitive', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([unit({ bottleSize: 'Magnum' })] as never);

    const outcome = await stockService.addUnits('u1', 'p1', {
      quantity: 1, cellarId: 'c1', purchasePrice: 20, bottleSize: ' magnum ', purchasedAt: '2026-01-15',
    });

    expect(outcome.merged).toBe(true);
  });

  it.each([
    ['another purchase day', { purchasedAt: '2026-06-01' }],
    ['another cellar', { cellarId: 'c2' }],
    ['another price', { purchasePrice: 25 }],
    ['no price (≠ 0)', { purchasePrice: null }],
    ['a magnum', { bottleSize: 'magnum' }],
  ])('creates a new line of the family for %s (point 58)', async (_label, change) => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([unit({ purchasePrice: 20 })] as never);

    const outcome = await stockService.addUnits('u2', 'p1', {
      quantity: 1, cellarId: 'c1', purchasePrice: 20, purchasedAt: '2026-01-15', ...change,
    });

    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ merged: false, from: null, to: 1 });
    expect(createData()).toMatchObject({ productId: 'p1', userId: 'u2', quantity: 1 });
  });

  it('without purchase day, never completes a line: each dates its spending by its own creation', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([unit({ purchasedAt: null, createdAt: new Date('2026-01-05T09:00:00Z') })] as never);

    const outcome = await stockService.addUnits('u1', 'p1', { quantity: 2, cellarId: 'c1', purchasePrice: 20, purchasedAt: null });

    expect(outcome.merged).toBe(false);
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    expect(createData()).toMatchObject({ purchasedAt: null, quantity: 2 });
  });

  it('keeps the number an inventory entry found in the group before completing it (D15)', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([unit({ quantity: 6 })] as never);

    await stockService.addUnits('u1', 'p1', { quantity: 2, cellarId: 'c1', purchasePrice: 20, purchasedAt: '2026-01-15' });

    const frozen = vi.mocked(prisma.$executeRaw).mock.calls
      .filter((call) => (call[0] as unknown as string[]).join('?').includes('coalesce(e."foundQuantity"'));
    expect(frozen.map((call) => (call[1] as { values: string[] }).values)).toEqual([['b1']]);
    expect(vi.mocked(prisma.$executeRaw).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(prisma.inventoryItem.update).mock.invocationCallOrder[0]);
  });

  it('never completes a unit that is not an intact group in stock', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      unit({ id: 'opened', quantity: 1, isOpened: true, fillLevel: 60 }),
      unit({ id: 'half-box', quantity: 1, cigarsLeft: 10 }),
    ] as never);

    const outcome = await stockService.addUnits('u1', 'p1', { quantity: 1, cellarId: 'c1', purchasePrice: 20, purchasedAt: '2026-01-15' });

    expect(outcome.merged).toBe(false);
    // Write-offs, trashed units and FEAT-87 references are not even read.
    expect(vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0]).toMatchObject({
      where: { productId: 'p1', deletedAt: null, writtenOffAt: null, isOwned: true },
    });
  });

  it('creates the line with the family description on its mirror columns, purchased today by default (D6)', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(family({ name: 'Cuvée X', region: 'Médoc', vintage: 2020 }) as never);

    const outcome = await stockService.addUnits('u2', 'p1', { quantity: 6, purchasePrice: 20 });

    const data = createData();
    expect(data).toMatchObject({
      productId: 'p1', userId: 'u2', quantity: 6, purchasePrice: 20, cellarId: null,
      bottleSize: null, cigarsPerBox: null,
      category: 'wine', name: 'Cuvée X', producer: 'Domaine Y', region: 'Médoc', vintage: 2020,
    });
    expect(data.id).toEqual(expect.any(String));
    const today = new Date();
    expect(data.purchasedAt).toEqual(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())));
    // The unit served carries no description (D9).
    expect(outcome.result.data).not.toHaveProperty('region');
    expect(outcome.result.data.quantity).toBe(6);
  });

  it('puts a wine known without bottle back in stock (FEAT-101 c3)', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    const outcome = await stockService.addUnits('u1', 'p1', { quantity: 3, purchasedAt: '2026-10-31' });

    expect(outcome).toMatchObject({ merged: false, to: 3 });
    expect(createData()).toMatchObject({ quantity: 3, purchasedAt: new Date('2026-10-31T00:00:00.000Z') });
  });

  it('refuses a family in the trash, itself or with every unit in the trash (D10)', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.product.findUnique).mockResolvedValue(family({ deletedAt: new Date() }) as never);

    const error = await rejection(stockService.addUnits('u1', 'p1', { quantity: 1 }));

    expect(error).toMatchObject({ status: 409, code: 'PRODUCT_IN_TRASH' });
    expect(vi.mocked(prisma.product.findFirst).mock.calls[0][0]).toMatchObject({
      where: { id: 'p1', deletedAt: null, OR: [{ items: { none: {} } }, { items: { some: { deletedAt: null } } }] },
    });
    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown family, and refuses an unknown cellar', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null as never);
    expect(await rejection(stockService.addUnits('u1', 'nope', { quantity: 1 }))).toMatchObject({ status: 404, code: 'PRODUCT_NOT_FOUND' });

    vi.mocked(prisma.product.findFirst).mockResolvedValue(family() as never);
    vi.mocked(prisma.cellar.findUnique).mockResolvedValue(null as never);
    expect(await rejection(stockService.addUnits('u1', 'p1', { quantity: 1, cellarId: 'gone' })))
      .toMatchObject({ status: 400, code: 'CELLAR_NOT_FOUND' });
    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
  });

  describe('cigars (FEAT-95)', () => {
    beforeEach(() => {
      vi.mocked(prisma.product.findFirst).mockResolvedValue(family({ category: 'cigar', format: 'Robusto' }) as never);
    });

    it('3 closed boxes of 25 then 4 single cigars make two groups', async () => {
      await stockService.addUnits('u1', 'p1', { quantity: 3, cigarsPerBox: 25, purchasePrice: 200, purchasedAt: '2026-01-15' });
      expect(createData()).toMatchObject({ quantity: 3, cigarsPerBox: 25, purchasePrice: 200 });

      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        unit({ quantity: 3, cigarsPerBox: 25, purchasePrice: 200, cellarId: null, category: 'cigar' }),
      ] as never);
      vi.mocked(prisma.inventoryItem.create).mockClear();
      const singles = await stockService.addUnits('u1', 'p1', { quantity: 4, purchasePrice: 200, purchasedAt: '2026-01-15' });

      expect(singles.merged).toBe(false);
      expect(createData()).toMatchObject({ quantity: 4, cigarsPerBox: null });
    });

    it('completes the group of boxes of the same size', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        unit({ quantity: 3, cigarsPerBox: 25, purchasePrice: 200, category: 'cigar' }),
      ] as never);

      const outcome = await stockService.addUnits('u1', 'p1', {
        quantity: 1, cellarId: 'c1', cigarsPerBox: 25, purchasePrice: 200, purchasedAt: '2026-01-15',
      });

      expect(outcome).toMatchObject({ merged: true, from: 3, to: 4 });
    });
  });

  it('refuses to make a group of more than 1000 copies', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([unit({ quantity: 999 })] as never);
    const same = { cellarId: 'c1', purchasePrice: 20, purchasedAt: '2026-01-15' };

    expect(await rejection(stockService.addUnits('u1', 'p1', { quantity: 2, ...same })))
      .toMatchObject({ status: 400, code: 'QUANTITY_TOO_LARGE' });
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();

    expect(await stockService.addUnits('u1', 'p1', { quantity: 1, ...same })).toMatchObject({ merged: true, to: 1000 });
  });

  it('refuses a box size for bottles', async () => {
    expect(await rejection(stockService.addUnits('u1', 'p1', { quantity: 1, cigarsPerBox: 25 })))
      .toMatchObject({ status: 400, code: 'CIGARS_PER_BOX_FOR_CIGARS_ONLY' });
  });
});

describe('stockService.correctQuantity (FEAT-92 c3, point 34)', () => {
  beforeEach(() => {
    storeGroup({ quantity: 7, needsReview: true, slotColumn: 2, slotRow: 3 });
  });

  it('an input error lowers the group\'s number: never existed, out of the spending', async () => {
    const outcome = await stockService.correctQuantity('u2', 'b1', { quantity: 5, reason: 'input_error' });

    expect(lockedIds()).toEqual(['p1']);
    expect(updateArgs()).toEqual({ where: { id: 'b1' }, data: { quantity: 5, needsReview: false, updatedBy: 'u2' } });
    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      productId: 'p1',
      changes: [{ field: 'quantity', from: 7, to: 5 }],
      result: { data: { id: 'b1', quantity: 5, needsReview: false }, changed: [], removedIds: [] },
    });
  });

  it('an input error never takes a group below 1 (the trash is for that)', async () => {
    expect(await rejection(stockService.correctQuantity('u1', 'b1', { quantity: 0, reason: 'input_error' })))
      .toMatchObject({ status: 400, code: 'QUANTITY_BELOW_ONE' });
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('refuses a number that does not go down', async () => {
    expect(await rejection(stockService.correctQuantity('u1', 'b1', { quantity: 7, reason: 'written_off' })))
      .toMatchObject({ status: 400, code: 'QUANTITY_NOT_LOWER' });
  });

  it('broken / given away / lost detaches a write-off of k copies; the group keeps its slot', async () => {
    const outcome = applied(await stockService.correctQuantity('u2', 'b1', { quantity: 5, reason: 'written_off' }));

    expect(updateArgs()).toEqual({ where: { id: 'b1' }, data: { quantity: 5, needsReview: false, updatedBy: 'u2' } });
    const data = createData();
    expect(data).toMatchObject({
      productId: 'p1', userId: 'u2', quantity: 2, cellarId: 'c1', purchasePrice: 20,
      purchasedAt: new Date('2026-01-15T00:00:00Z'), slotColumn: null, slotRow: null,
      parentItemId: null, needsReview: false, writtenOffAt: expect.any(Date),
      // Mirror of the description, like any unit for now.
      name: 'Cuvée X', region: 'Bordeaux',
    });
    expect(data.id).not.toBe('b1');
    expect(data).not.toHaveProperty('createdAt');
    expect(outcome.result.data).toMatchObject({ quantity: 2, writtenOffAt: expect.any(Date) });
    expect(outcome.result.changed).toEqual([expect.objectContaining({ id: 'b1', quantity: 5 })]);
    expect(outcome.changes).toEqual([{ field: 'quantity', from: 7, to: 5 }]);
    expect(outcome.writtenOffItemId).toBe(outcome.result.data.id);
  });

  it('a whole group written off is marked itself and gives its slot back', async () => {
    const outcome = applied(await stockService.correctQuantity('u2', 'b1', { quantity: 0, reason: 'written_off' }));

    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
    expect(updateArgs()).toEqual({
      where: { id: 'b1' },
      data: { writtenOffAt: expect.any(Date), needsReview: false, slotColumn: null, slotRow: null, updatedBy: 'u2' },
    });
    expect(outcome.result).toMatchObject({ data: { id: 'b1', quantity: 7 }, changed: [] });
    expect(outcome.writtenOffItemId).toBe('b1');
  });

  it('a whole group written off loses its sub-records\' way back (never put back into stock)', async () => {
    await stockService.correctQuantity('u2', 'b1', { quantity: 0, reason: 'written_off' });

    const [sql, groupId] = vi.mocked(prisma.$executeRaw).mock.calls[0] as unknown as [TemplateStringsArray, string];
    expect(sql.join('?')).toBe('UPDATE "bottles" SET "parentItemId" = NULL WHERE "parentItemId" = ?');
    expect(groupId).toBe('b1');
  });

  it('a partial write-off leaves the sub-records attached to the group that stays', async () => {
    await stockService.correctQuantity('u2', 'b1', { quantity: 5, reason: 'written_off' });

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('cigars: 3 boxes corrected to 2 (FEAT-95 c4) — nothing smoked', async () => {
    storeGroup({ quantity: 3, cigarsPerBox: 25, category: 'cigar' });

    const outcome = applied(await stockService.correctQuantity('u1', 'b1', { quantity: 2, reason: 'input_error' }));

    expect(outcome.result.data).toMatchObject({ quantity: 2, cigarsPerBox: 25, isOpened: false, cigarsLeft: null });
  });

  it.each([
    ['an opened bottle', { quantity: 1, isOpened: true, fillLevel: 50 }],
    ['an opened box', { quantity: 1, isOpened: true, cigarsLeft: 10 }],
    ['a write-off', { quantity: 2, writtenOffAt: new Date() }],
    ['a former reference not owned (FEAT-87)', { quantity: 2, isOwned: false }],
  ])('refuses %s: only a group has a number', async (_label, fields) => {
    storeGroup(fields);

    expect(await rejection(stockService.correctQuantity('u1', 'b1', { quantity: 0, reason: 'written_off' })))
      .toMatchObject({ status: 409, code: 'NOT_A_GROUP' });
  });

  it('answers a conflict with the group as it is when it changed since the client read it', async () => {
    const outcome = await stockService.correctQuantity('u1', 'b1', {
      quantity: 5, reason: 'input_error', expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(outcome).toMatchObject({ conflict: true, item: { id: 'b1', quantity: 7 } });
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('answers a conflict when the group moved to another family meanwhile (its lock was not taken)', async () => {
    vi.mocked(prisma.inventoryItem.findFirst)
      .mockResolvedValueOnce(unit({ productId: 'p1' }) as never)
      .mockResolvedValueOnce(unit({ productId: 'p9', quantity: 6 }) as never);

    const outcome = await stockService.correctQuantity('u1', 'b1', { quantity: 5, reason: 'input_error' });

    expect(lockedIds()).toEqual(['p1']);
    expect(outcome).toMatchObject({ conflict: true, item: { id: 'b1', productId: 'p9' } });
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('reads the group again once its family is locked, and answers null when it is gone', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValueOnce(unit() as never).mockResolvedValueOnce(null as never);

    expect(await stockService.correctQuantity('u1', 'b1', { quantity: 1, reason: 'input_error' })).toBeNull();
    expect(lockedIds()).toEqual(['p1']);
  });
});
