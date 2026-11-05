import { describe, it, expect, beforeEach, vi } from 'vitest';

// #471 (FEAT-111, D18): the bulk actions on wines, run against a small
// in-memory stand-in for the database, so that what they promise — every
// copy in stock and only those, identical lines joined, nothing created or
// lost — is checked on the rows they leave behind.

type Row = Record<string, unknown> & { id: string };

const db = vi.hoisted(() => ({
  items: new Map<string, Record<string, unknown> & { id: string }>(), families: [] as Array<Record<string, unknown> & { id: string }>,
  cellars: new Set<string>(), order: [] as string[],
  // FEAT-93: the cells of the plan (item_slots), a fakeSlots() set in beforeEach.
  slots: null as unknown as ReturnType<typeof import('../support/fake-slots').fakeSlots>,
}));

/** A Prisma `where` of equalities and the operators the services use (not, in, gt, equals, NOT). */
function matches(row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([field, value]) => {
    if (field === 'NOT') return !matches(row, value as Record<string, unknown>);
    if (value !== null && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
      const op = value as { not?: unknown; in?: unknown[]; gt?: number; equals?: unknown };
      return Object.entries(op).every(([name, operand]) => {
        if (name === 'not') return operand === null ? row[field] != null : row[field] !== operand;
        if (name === 'in') return (operand as unknown[]).includes(row[field]);
        if (name === 'gt') return typeof row[field] === 'number' && (row[field] as number) > (operand as number);
        if (name === 'equals') return row[field] === operand;
        return true;
      });
    }
    return (row[field] ?? null) === value;
  });
}

const byCreation = (a: Row, b: Row) =>
  (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime() || (a.id < b.id ? -1 : 1);

vi.mock('../../src/lib/prisma', () => {
  const live = () => [...db.items.values()];
  const tx = {
    product: {
      // LISTED_PRODUCT_FILTER: out of the trash, and some unit out of the trash (or none at all).
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => db.families.filter((family) => {
        if (!where.id.in.includes(family.id) || family.deletedAt != null) return false;
        const units = live().filter((unit) => unit.productId === family.id);
        return units.length === 0 || units.some((unit) => unit.deletedAt == null);
      })),
    },
    cellar: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (db.cellars.has(where.id) ? { id: where.id } : null)) },
    inventoryItem: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        live().filter((row) => matches(row, where)).sort(byCreation).map((row) => ({ ...row }))),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const row = live().find((candidate) => matches(candidate, where));
        return row ? { ...row } : null;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({ ...db.items.get(where.id)! })),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        db.order.push(`update:${where.id}`);
        const row = db.items.get(where.id)!;
        Object.assign(row, data);
        return { ...row };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        db.order.push('updateMany');
        const hit = live().filter((row) => matches(row, where));
        hit.forEach((row) => Object.assign(row, data));
        return { count: hit.length };
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> & { id: string } }) => {
        db.order.push(`create:${data.id}`);
        db.items.set(data.id, { createdAt: new Date('2026-11-04T10:00:00Z'), ...data });
        return { ...data };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        where.id.in.forEach((id) => db.items.delete(id));
        return { count: where.id.in.length };
      }),
    },
    inventoryCountEntry: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 0 })) },
    get itemSlot() { return db.slots.delegate; },
    inventoryCountSession: { findFirst: vi.fn(async () => null) },
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async (_sql: unknown, id: string) => { db.order.push(`lock:${id}`); return []; }),
    $transaction: vi.fn(),
  };
  tx.$transaction.mockImplementation(async (callback: (client: unknown) => unknown) => callback(tx));
  return { prisma: tx };
});

import { bulkStockService } from '../../src/services/bulk-stock.service';
import { AppError } from '../../src/lib/errors';
import { itemSpend, itemUnits } from '../../src/lib/finished-item';
import { fakeSlots, slot } from '../support/fake-slots';

const DAY = new Date('2026-01-15T00:00:00.000Z');

/** A unit: an intact bottle of family p1, 20 € each, bought on DAY, in the garage. */
function unit(fields: Partial<Row> & { id: string }): Row {
  return {
    userId: 'u1', productId: 'p1', cellarId: 'garage', location: null,
    purchasePrice: 20, estimatedValue: null, purchasePlace: null, purchasedAt: DAY, bottleSize: null,
    quantity: 1, cigarsPerBox: null, cigarsLeft: null, isOpened: false, fillLevel: null, openedAt: null,
    parentItemId: null, writtenOffAt: null, needsReview: false, deletedAt: null,
    lockedFields: [], fieldSources: null, category: 'wine', name: 'Cuvée', producer: 'Domaine',
    createdAt: DAY, updatedAt: DAY, updatedBy: null,
    ...fields,
  };
}

const family = (id: string, category = 'wine') => ({ id, category, deletedAt: null });

function seed(units: Row[], families = [family('p1'), family('p2'), family('p3')]) {
  db.items = new Map(units.map((row) => [row.id, { ...row }]));
  db.families = families;
}

const rows = () => [...db.items.values()];
const unitsOf = (productId: string, where: Record<string, unknown> = {}) => rows()
  .filter((row) => row.productId === productId && row.deletedAt == null && matches(row, where))
  .reduce((sum, row) => sum + itemUnits(row as never), 0);
const spendOf = (productId: string) => rows().filter((row) => row.productId === productId).reduce((sum, row) => sum + itemSpend(row as never), 0);

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(() => null, (err: unknown) => err);
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const P3 = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.clearAllMocks();
  db.cellars = new Set(['garage', 'kitchen']);
  db.order = [];
  db.slots = fakeSlots();
});

/**
 * Three wines, 14 bottles in the cellar: P1 ×6 in the garage and an opened
 * one (FEAT-111 c1), P2 ×2 garage + ×3 kitchen at another date, P3 ×2 —
 * plus a finished bottle of P1 that no bulk action touches (c4).
 */
function threeWines() {
  seed([
    unit({ id: 'a-group', productId: P1, quantity: 6 }),
    unit({ id: 'a-opened', productId: P1, isOpened: true, fillLevel: 60, openedAt: new Date('2026-10-01'), parentItemId: 'a-group' }),
    unit({ id: 'a-drunk', productId: P1, isOpened: true, fillLevel: 0, parentItemId: 'a-group' }),
    unit({ id: 'b-garage', productId: P2, quantity: 2 }),
    unit({ id: 'b-kitchen', productId: P2, quantity: 3, cellarId: 'kitchen', purchasedAt: new Date('2026-03-01T00:00:00Z') }),
    unit({ id: 'c-group', productId: P3, quantity: 2 }),
  ], [family(P1), family(P2), family(P3)]);
  db.slots.rows.push(slot({ itemId: 'a-group', cellarId: 'garage', column: 1, row: 1 }));
}

describe('bulkStockService.move (FEAT-111 c1, c4)', () => {
  it('c1: the 14 bottles of the 3 wines end up in the kitchen, the finished one stays (c4)', async () => {
    threeWines();

    const outcome = await bulkStockService.move('u1', { productIds: [P3, P1, P2], cellarId: 'kitchen' });

    expect(outcome.result).toEqual({ wines: 3, units: 11 });
    for (const productId of [P1, P2, P3]) {
      expect(unitsOf(productId, { cellarId: 'garage' })).toBe(0);
    }
    expect(unitsOf(P1, { cellarId: 'kitchen' }) + unitsOf(P2, { cellarId: 'kitchen' }) + unitsOf(P3, { cellarId: 'kitchen' })).toBe(14);
    // c4: the finished bottle is neither moved nor counted.
    expect(db.items.get('a-drunk')).toMatchObject({ cellarId: 'garage' });
    // A moved group leaves its cells (places in its old cellar's plan).
    expect(db.items.get('a-group')).toMatchObject({ cellarId: 'kitchen' });
    expect(db.slots.cellsOf('a-group')).toBe('');
    // The families are locked first, in sorted order, before any write.
    const locks = db.order.filter((step) => step.startsWith('lock:'));
    expect(locks).toEqual([`lock:${P1}`, `lock:${P2}`, `lock:${P3}`]);
    expect(db.order.findIndex((step) => !step.startsWith('lock:'))).toBe(3);
  });

  it('a group moved next to an identical group joins it: one line, never two', async () => {
    seed([
      unit({ id: 'old', productId: P1, quantity: 4, cellarId: 'kitchen', createdAt: new Date('2026-01-15T08:00:00Z') }),
      unit({ id: 'moved', productId: P1, quantity: 2 }),
    ], [family(P1)]);
    const spend = spendOf(P1);

    const outcome = await bulkStockService.move('u1', { productIds: [P1], cellarId: 'kitchen' });

    expect(outcome.result).toEqual({ wines: 1, units: 2 });
    expect(rows().map((row) => [row.id, row.cellarId, row.quantity])).toEqual([['old', 'kitchen', 6]]);
    expect(spendOf(P1)).toBe(spend);
    expect(outcome.entries).toEqual([expect.objectContaining({
      action: 'MOVE_UNITS', bottleId: 'old', productId: P1,
      details: expect.objectContaining({ count: 2, fromItemId: 'moved', cellarId: { from: 'garage', to: 'kitchen' } }),
    })]);
  });

  it('two identical groups of two cellars moved together become one line', async () => {
    seed([
      unit({ id: 'g', productId: P1, quantity: 2, cellarId: 'garage', createdAt: new Date('2026-01-15T08:00:00Z') }),
      unit({ id: 'k', productId: P1, quantity: 3, cellarId: 'cave' }),
    ], [family(P1)]);
    db.cellars.add('cave');
    db.cellars.add('cuisine');

    await bulkStockService.move('u1', { productIds: [P1], cellarId: 'cuisine' });

    expect(rows().filter((row) => row.deletedAt == null).map((row) => [row.cellarId, row.quantity])).toEqual([['cuisine', 5]]);
  });

  it('an opened bottle moves on its own, unplaced, and is logged as a cellar change', async () => {
    seed([unit({ id: 'o', productId: P1, isOpened: true, fillLevel: 40 })], [family(P1)]);
    db.slots.rows.push(slot({ itemId: 'o', cellarId: 'garage', column: 2, row: 2 }));

    const outcome = await bulkStockService.move('u1', { productIds: [P1], cellarId: null });

    expect(db.items.get('o')).toMatchObject({ cellarId: null, isOpened: true, fillLevel: 40 });
    expect(db.slots.cellsOf('o')).toBe('');
    expect(outcome.entries[0]).toMatchObject({
      action: 'UPDATE', bottleId: 'o',
      details: { changes: [{ field: 'cellarId', from: 'garage', to: null }, { field: 'slot', from: { column: 2, row: 2 }, to: null }] },
    });
  });

  it('copies already in the destination are left alone; an unknown cellar is refused before any write', async () => {
    threeWines();
    expect((await rejection(bulkStockService.move('u1', { productIds: [P1], cellarId: 'attic' }))).code).toBe('CELLAR_NOT_FOUND');
    expect(db.order.filter((step) => !step.startsWith('lock:'))).toEqual([]);

    const outcome = await bulkStockService.move('u1', { productIds: [P2], cellarId: 'kitchen' });
    expect(outcome.result).toEqual({ wines: 1, units: 2 });
    expect(db.items.get('b-kitchen')).toMatchObject({ quantity: 3, cellarId: 'kitchen' });
  });

  it('a wine in the trash is left out', async () => {
    threeWines();
    db.families = [family(P1), { ...family(P2), deletedAt: new Date() }, family(P3)];

    const outcome = await bulkStockService.move('u1', { productIds: [P2], cellarId: 'kitchen' });

    expect(outcome.result).toEqual({ wines: 0, units: 0 });
    expect(db.items.get('b-garage')).toMatchObject({ cellarId: 'garage' });
  });
});

describe('bulkStockService.trash (FEAT-111 c2, c4)', () => {
  it('c2: the bottles in the cellar of the 3 wines go to the trash with one date; the finished one stays (c4)', async () => {
    threeWines();

    const outcome = await bulkStockService.trash('u1', { productIds: [P1, P2, P3] });

    expect(outcome.result).toEqual({ wines: 3, units: 14 });
    const trashed = rows().filter((row) => row.deletedAt != null);
    expect(trashed.map((row) => row.id).sort()).toEqual(['a-group', 'a-opened', 'b-garage', 'b-kitchen', 'c-group']);
    expect(new Set(trashed.map((row) => (row.deletedAt as Date).getTime())).size).toBe(1);
    expect(outcome.deletedAt).toEqual(trashed[0].deletedAt);
    expect(db.items.get('a-drunk')).toMatchObject({ deletedAt: null });
    // The groups keep their number and their cells, in the trash with them: a restore brings them back as they were.
    expect(db.items.get('a-group')).toMatchObject({ quantity: 6 });
    expect(db.slots.rows.filter((row) => row.itemId === 'a-group')).toEqual([
      expect.objectContaining({ column: 1, row: 1, deletedAt: outcome.deletedAt }),
    ]);
    expect(outcome.entries.map((entry) => [entry.action, entry.bottleId])).toContainEqual(['DELETE', 'c-group']);
    const locks = db.order.filter((step) => step.startsWith('lock:'));
    expect(locks).toEqual([`lock:${P1}`, `lock:${P2}`, `lock:${P3}`]);
  });
});

describe('bulkStockService.drink (FEAT-111 c3)', () => {
  it('FEAT-93 (decision #471 point 75): from a group whose every bottle is placed, the most recent cell is freed and told in its history', async () => {
    seed([unit({ id: 'two', productId: P1, quantity: 2 })], [family(P1)]);
    db.slots.rows.push(
      slot({ itemId: 'two', cellarId: 'garage', column: 1, row: 1 }),
      slot({ itemId: 'two', cellarId: 'garage', column: 2, row: 1 }),
    );

    const outcome = await bulkStockService.drink('u1', { items: [{ productId: P1, count: 1 }] });

    expect(db.slots.cellsOf('two')).toBe('1:1');
    expect(outcome.entries).toContainEqual(expect.objectContaining({
      bottleId: 'two',
      details: expect.objectContaining({ changes: [{ field: 'quantity', from: 2, to: 1 }, { field: 'slot', from: { column: 2, row: 1 }, to: null }] }),
    }));
  });

  it('c3: 1 of a wine of 6 leaves 5, the wine of one bottle has none left', async () => {
    seed([
      unit({ id: 'six', productId: P1, quantity: 6 }),
      unit({ id: 'one', productId: P2, quantity: 1 }),
    ], [family(P1), family(P2)]);
    db.slots.rows.push(slot({ itemId: 'one', cellarId: 'garage', column: 3, row: 1 }));
    const spend = spendOf(P1) + spendOf(P2);

    const outcome = await bulkStockService.drink('u1', { items: [{ productId: P1, count: 1 }, { productId: P2, count: 1 }] });

    expect(outcome.result).toEqual({ wines: 2, units: 2 });
    expect(unitsOf(P1)).toBe(5);
    expect(unitsOf(P2)).toBe(0);
    // Detached (FEAT-103): a finished sub-record of the group; the group keeps 5.
    expect(db.items.get('six')).toMatchObject({ quantity: 5, isOpened: false });
    const drunk = rows().find((row) => row.parentItemId === 'six')!;
    expect(drunk).toMatchObject({ isOpened: true, fillLevel: 0, quantity: 1 });
    // A line of one is finished itself, and gives its cell back; its history says which.
    expect(db.items.get('one')).toMatchObject({ isOpened: true, fillLevel: 0 });
    expect(db.slots.cellsOf('one')).toBe('');
    expect(outcome.entries).toContainEqual(expect.objectContaining({
      bottleId: 'one', details: expect.objectContaining({ changes: expect.arrayContaining([{ field: 'slot', from: { column: 3, row: 1 }, to: null }]) }),
    }));
    // Drunk bottles stay in the spending.
    expect(spendOf(P1) + spendOf(P2)).toBe(spend);
    // The group's own history: one bottle fewer.
    expect(outcome.entries).toContainEqual(expect.objectContaining({
      bottleId: 'six', details: expect.objectContaining({ changes: [{ field: 'quantity', from: 6, to: 5 }], subItemId: drunk.id }),
    }));
  });

  it('an opened bottle is finished first, then the preselected line (bought first)', async () => {
    seed([
      unit({ id: 'recent', productId: P1, quantity: 3, purchasedAt: new Date('2026-06-01T00:00:00Z') }),
      unit({ id: 'oldest', productId: P1, quantity: 2, cellarId: 'kitchen', purchasedAt: new Date('2025-06-01T00:00:00Z') }),
      unit({ id: 'opened', productId: P1, isOpened: true, fillLevel: 30, openedAt: new Date('2026-10-01') }),
    ], [family(P1)]);

    await bulkStockService.drink('u1', { items: [{ productId: P1, count: 2 }] });

    expect(db.items.get('opened')).toMatchObject({ fillLevel: 0 });
    expect(db.items.get('oldest')).toMatchObject({ quantity: 1 });
    expect(db.items.get('recent')).toMatchObject({ quantity: 3 });
  });

  it('openedFirst: false leaves the opened bottle and takes the line of the cellar looked at', async () => {
    seed([
      unit({ id: 'oldest', productId: P1, quantity: 2, purchasedAt: new Date('2025-06-01T00:00:00Z') }),
      unit({ id: 'here', productId: P1, quantity: 3, cellarId: 'kitchen', purchasedAt: new Date('2026-06-01T00:00:00Z') }),
      unit({ id: 'opened', productId: P1, isOpened: true, fillLevel: 30 }),
    ], [family(P1)]);

    await bulkStockService.drink('u1', { items: [{ productId: P1, count: 1, openedFirst: false }], cellarIds: ['kitchen'] });

    expect(db.items.get('opened')).toMatchObject({ fillLevel: 30 });
    expect(db.items.get('here')).toMatchObject({ quantity: 2 });
    expect(db.items.get('oldest')).toMatchObject({ quantity: 2 });
  });

  it('cigars: 3 smoked out of a closed box open it and come out of that same box', async () => {
    seed([unit({ id: 'boxes', productId: P1, quantity: 2, cigarsPerBox: 25, category: 'cigar' })], [family(P1, 'cigar')]);

    const outcome = await bulkStockService.drink('u1', { items: [{ productId: P1, count: 3 }] });

    expect(outcome.result).toEqual({ wines: 1, units: 3 });
    expect(db.items.get('boxes')).toMatchObject({ quantity: 1 });
    const opened = rows().filter((row) => row.parentItemId === 'boxes');
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ isOpened: true, cigarsLeft: 22 });
    expect(unitsOf(P1)).toBe(47);
  });

  it('more than the wine has in the cellar is refused, and nothing is written', async () => {
    seed([unit({ id: 'two', productId: P1, quantity: 2 }), unit({ id: 'gone', productId: P1, isOpened: true, fillLevel: 0 })], [family(P1)]);

    const error = await rejection(bulkStockService.drink('u1', { items: [{ productId: P1, count: 3 }] }));

    expect(error).toMatchObject({ status: 400, code: 'COUNT_ABOVE_STOCK' });
    expect(db.items.get('two')).toMatchObject({ quantity: 2 });
  });
});
