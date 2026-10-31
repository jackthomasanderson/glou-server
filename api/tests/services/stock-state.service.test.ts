import { describe, it, expect, vi } from 'vitest';
import { AppError } from '../../src/lib/errors';
import { itemSpend, itemUnits } from '../../src/lib/finished-item';
import {
  applyState, finishUnits, planState, type StateItem, type StateWrite,
} from '../../src/services/stock-state.service';

// #471 (FEAT-103/106): the detach / reattach rule, run against a small
// in-memory stand-in for the transaction client, so that what the rule
// promises — never a copy created or lost, never a spending changed — is
// checked on the rows it leaves behind.

type Row = Record<string, unknown> & { id: string };

const DAY = new Date('2026-01-15T00:00:00.000Z');
const NOW = new Date('2026-10-31T12:00:00.000Z');

/** A unit as the transaction reads it: an intact bottle of family p1, 20 € each, bought on DAY. */
function unit(fields: Partial<StateItem> & { id: string }): Row {
  return {
    userId: 'creator', productId: 'p1', cellarId: 'c1', slotColumn: null, slotRow: null,
    purchasedAt: DAY, cigarsPerBox: null, cigarsLeft: null, parentItemId: null, writtenOffAt: null,
    needsReview: false, category: 'wine', name: 'Talbot', producer: 'Château Talbot', location: null,
    purchasePrice: 20, estimatedValue: null, purchasePlace: null, bottleSize: '75cl', quantity: 1,
    isOpened: false, fillLevel: null, openedAt: null, lockedFields: [], fieldSources: null,
    deletedAt: null, createdAt: DAY, updatedAt: DAY, updatedBy: null, isOwned: true,
    ...fields,
  };
}

/** Rows matching a Prisma `where` of plain equalities (what the rule uses). */
const matches = (row: Record<string, unknown>, where: Record<string, unknown> = {}) =>
  Object.entries(where).every(([field, value]) => row[field] === value);

function fakeDb(rows: Row[], options: { tastings?: Row[]; audits?: Row[]; entries?: Row[]; wishlist?: Row[]; categories?: Record<string, string> } = {}) {
  const items = new Map(rows.map((row) => [row.id, { ...row }]));
  const tastings = (options.tastings ?? []).map((row) => ({ ...row }));
  const audits = (options.audits ?? []).map((row) => ({ ...row }));
  const entries = (options.entries ?? []).map((row) => ({ ...row }));
  const wishlist = (options.wishlist ?? []).map((row) => ({ ...row }));
  const withInclude = (row: Row | undefined, include?: Record<string, unknown>) => {
    if (!row) return null;
    const copy: Record<string, unknown> = { ...row };
    if (include?.product) copy.product = { category: options.categories?.[row.productId as string] ?? row.category };
    return copy;
  };
  const updateMany = (list: Row[]) => async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    const hit = list.filter((row) => matches(row, where));
    hit.forEach((row) => Object.assign(row, data));
    return { count: hit.length };
  };
  const order: string[] = [];
  const tx = {
    inventoryItem: {
      findUnique: async ({ where }: { where: { id: string } }) => withInclude(items.get(where.id)),
      findUniqueOrThrow: async ({ where, include }: { where: { id: string }; include?: Record<string, unknown> }) => {
        const row = withInclude(items.get(where.id), include);
        if (!row) throw new Error(`no unit ${where.id}`);
        return row;
      },
      findFirst: async ({ where, include }: { where: Record<string, unknown>; include?: Record<string, unknown> }) =>
        withInclude([...items.values()].find((row) => matches(row, where)), include),
      update: vi.fn(async ({ where, data, include }: { where: { id: string }; data: Record<string, unknown>; include?: Record<string, unknown> }) => {
        order.push(`update:${where.id}`);
        const row = items.get(where.id);
        if (!row) throw new Error(`no unit ${where.id}`);
        Object.assign(row, data);
        return withInclude(row, include);
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        order.push(`create:${data.id}`);
        items.set(data.id, { createdAt: NOW, updatedAt: NOW, ...data });
        return { ...data };
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        order.push(`delete:${where.id}`);
        items.delete(where.id);
      }),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) =>
        updateMany([...items.values()])({ where, data }),
    },
    tastingNote: {
      count: async ({ where }: { where: Record<string, unknown> }) => tastings.filter((row) => matches(row, where)).length,
      updateMany: updateMany(tastings),
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        const keep = tastings.filter((row) => !matches(row, where));
        tastings.splice(0, tastings.length, ...keep);
      },
    },
    auditLog: { updateMany: updateMany(audits) },
    wishlistItem: { updateMany: updateMany(wishlist) },
    inventoryCountEntry: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => entries.filter((row) => matches(row, where)),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => entries.find((row) => matches(row, where)) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Object.assign(entries.find((row) => row.id === where.id)!, data),
    },
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => { order.push('lock'); return []; }),
  };
  const all = () => [...items.values()];
  return {
    tx: tx as never,
    raw: tx,
    items,
    tastings,
    audits,
    entries,
    wishlist,
    order,
    get: (id: string) => items.get(id)!,
    /** Copies in stock (bottles or cigars). */
    unitsInStock: () => all().filter((row) => row.deletedAt == null).reduce((total, row) => total + itemUnits(row as never), 0),
    /** Spending: every copy bought, drunk ones included. */
    spend: () => all().reduce((total, row) => total + itemSpend(row as never), 0),
    /** Copies bought: in stock, opened, finished — each row counts its copies. */
    copies: () => all().reduce((total, row) => total + ((row.quantity as number | null) ?? 1), 0),
  };
}

const INCLUDE = { product: true } as const;

async function apply(db: ReturnType<typeof fakeDb>, id: string, write: StateWrite, kind: 'bottle' | 'cigar' = 'bottle') {
  const item = db.get(id) as unknown as StateItem;
  return applyState<typeof INCLUDE, Row>(db.tx, item, write, { userId: 'member', kind, include: INCLUDE, now: NOW });
}

const expectAppError = async (promise: Promise<unknown>, status: number, code: string) => {
  const error = await promise.then(() => null, (err: unknown) => err);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ status, code });
};

describe('applyState — detach (FEAT-103)', () => {
  it('c1: opening one bottle of a group of 6 leaves a group of 5 and one opened bottle, 6 in stock', async () => {
    const db = fakeDb([unit({ id: 'g', quantity: 6, slotColumn: 2, slotRow: 3, lockedFields: ['purchasePrice'], location: 'A3' })]);

    const result = await apply(db, 'g', { state: { isOpened: true, fillLevel: 60, openedAt: NOW } });

    expect(result.outcome).toBe('detached');
    expect(db.get('g')).toMatchObject({ quantity: 5, isOpened: false, slotColumn: 2, slotRow: 3, updatedBy: 'member', updatedAt: NOW });
    const sub = result.data;
    expect(sub.id).not.toBe('g');
    expect(db.get(sub.id)).toMatchObject({
      quantity: 1, isOpened: true, fillLevel: 60, openedAt: NOW, parentItemId: 'g',
      // The slot stays with the group; the copy keeps what it was bought as.
      slotColumn: null, slotRow: null, cellarId: 'c1', purchasePrice: 20, purchasedAt: DAY, bottleSize: '75cl',
      location: 'A3', productId: 'p1', lockedFields: ['purchasePrice'], userId: 'member', needsReview: false,
    });
    expect(result.changed.map((row) => row.id)).toEqual(['g']);
    expect(result.removedIds).toEqual([]);
    expect(db.unitsInStock()).toBe(6);
    expect(db.copies()).toBe(6);
    // The new row's description mirror is copied from its family.
    const [sql, ...values] = db.raw.$executeRaw.mock.calls[0] as unknown as [string[], ...unknown[]];
    expect(sql.join('?')).toContain('UPDATE "bottles"');
    expect(values).toContain(sub.id);
  });

  it('c2: drinking one bottle of a group of 6 at 20 € leaves 5 in stock and one finished bottle, 120 € spent', async () => {
    const db = fakeDb([unit({ id: 'g', quantity: 6 })]);
    expect(db.spend()).toBe(120);

    const result = await apply(db, 'g', { state: { isOpened: true, fillLevel: 0 } });

    expect(result.outcome).toBe('detached');
    expect(db.get(result.data.id)).toMatchObject({ isOpened: true, fillLevel: 0, quantity: 1, parentItemId: 'g' });
    expect(db.unitsInStock()).toBe(5);
    expect(db.spend()).toBe(120);
  });

  it('c3: opening the only bottle of a group of 1 changes it, without a second unit', async () => {
    const db = fakeDb([unit({ id: 'g', quantity: 1, slotColumn: 1, slotRow: 1 })]);

    const result = await apply(db, 'g', { state: { isOpened: true, fillLevel: 70 } });

    expect(result.outcome).toBe('updated');
    expect(result.data.id).toBe('g');
    expect(db.items.size).toBe(1);
    expect(db.get('g')).toMatchObject({ isOpened: true, fillLevel: 70, quantity: 1, slotColumn: 1 });
    expect(db.raw.inventoryItem.create).not.toHaveBeenCalled();
  });

  it('finishing the only bottle of a group gives its slot back (#573)', async () => {
    const db = fakeDb([unit({ id: 'g', quantity: 1, slotColumn: 1, slotRow: 1 })]);

    const result = await apply(db, 'g', { state: { isOpened: true, fillLevel: 0 } });

    expect(result.releasedSlot).toBe(true);
    expect(db.get('g')).toMatchObject({ slotColumn: null, slotRow: null });
  });

  it('a level lowered without "opened" is an individual state too', async () => {
    const db = fakeDb([unit({ id: 'g', quantity: 3 })]);

    const result = await apply(db, 'g', { state: { fillLevel: 80 } });

    expect(result.outcome).toBe('detached');
    expect(db.get('g').quantity).toBe(2);
  });

  it('the other fields of the same write go to the group and to the copy alike', async () => {
    const db = fakeDb([unit({ id: 'g', quantity: 4 })]);

    const result = await apply(db, 'g', { unit: { location: 'Rack B', quantity: 4 }, state: { isOpened: true, fillLevel: 50 } });

    expect(db.get('g')).toMatchObject({ location: 'Rack B', quantity: 3 });
    expect(db.get(result.data.id)).toMatchObject({ location: 'Rack B', quantity: 1 });
  });

  it('a new count sent with the state is the group before the copy is taken', async () => {
    const db = fakeDb([unit({ id: 'g', quantity: 1 })]);

    const result = await apply(db, 'g', { unit: { quantity: 3 }, state: { isOpened: true, fillLevel: 50 } });

    expect(result.outcome).toBe('detached');
    expect(db.get('g').quantity).toBe(2);
    expect(db.unitsInStock()).toBe(3);
  });

  it('takes no lock itself: the caller holds the family lock', async () => {
    const db = fakeDb([unit({ id: 'g', quantity: 2 })]);
    await apply(db, 'g', { state: { isOpened: true } });
    expect(db.raw.$queryRaw).not.toHaveBeenCalled();
  });

  it('refuses an individual state on a write-off of several copies', async () => {
    const db = fakeDb([unit({ id: 'w', quantity: 3, writtenOffAt: NOW })]);
    await expectAppError(apply(db, 'w', { state: { isOpened: true } }), 400, 'INDIVIDUAL_STATE_ON_GROUP');
  });

  it('refuses a count above one on a sub-record', async () => {
    const db = fakeDb([unit({ id: 's', quantity: 1, isOpened: true, fillLevel: 40 })]);
    await expectAppError(apply(db, 's', { unit: { quantity: 3 } }), 400, 'INDIVIDUAL_STATE_ON_GROUP');
  });

  it('an opened bottle whose level moves stays the same sub-record', async () => {
    const db = fakeDb([unit({ id: 's', isOpened: true, fillLevel: 60, parentItemId: 'g' }), unit({ id: 'g', quantity: 5 })]);

    const result = await apply(db, 's', { state: { fillLevel: 30 } });

    expect(result.outcome).toBe('updated');
    expect(db.get('s')).toMatchObject({ fillLevel: 30, parentItemId: 'g' });
    expect(db.get('g').quantity).toBe(5);
  });
});

describe('applyState — cigars (FEAT-103 c4-c5, decision 28)', () => {
  const box = (fields: Partial<StateItem> & { id: string }) =>
    unit({ category: 'cigar', bottleSize: null, cigarsPerBox: 25, purchasePrice: 250, ...fields });

  it('c4: smoking one cigar of 3 closed boxes of 25 leaves 2 boxes and an opened box of 24 — 75 → 74', async () => {
    const db = fakeDb([box({ id: 'g', quantity: 3 })]);
    expect(db.unitsInStock()).toBe(75);

    const result = await apply(db, 'g', { smokeOne: true }, 'cigar');

    expect(result.outcome).toBe('detached');
    expect(db.get('g')).toMatchObject({ quantity: 2, isOpened: false, cigarsLeft: null });
    expect(db.get(result.data.id)).toMatchObject({ quantity: 1, isOpened: true, cigarsLeft: 24, cigarsPerBox: 25, openedAt: NOW, parentItemId: 'g' });
    expect(db.unitsInStock()).toBe(74);
    expect(db.spend()).toBe(750);
  });

  it('the next cigars are smoked in the opened box, the last one finishes it', async () => {
    const db = fakeDb([box({ id: 's', isOpened: true, cigarsLeft: 2, parentItemId: 'g' })]);

    await apply(db, 's', { smokeOne: true }, 'cigar');
    expect(db.get('s')).toMatchObject({ cigarsLeft: 1, isOpened: true, fillLevel: null });

    await apply(db, 's', { smokeOne: true }, 'cigar');
    expect(db.get('s')).toMatchObject({ cigarsLeft: 0, isOpened: true, fillLevel: 0 });
    expect(db.unitsInStock()).toBe(0);
    expect(db.spend()).toBe(250);
  });

  it('c5: smoking one of 4 single cigars leaves 3 and one finished cigar, the spending unchanged', async () => {
    const db = fakeDb([box({ id: 'g', quantity: 4, cigarsPerBox: null, purchasePrice: 12 })]);

    const result = await apply(db, 'g', { smokeOne: true }, 'cigar');

    expect(result.outcome).toBe('detached');
    expect(db.get('g')).toMatchObject({ quantity: 3, isOpened: false });
    expect(db.get(result.data.id)).toMatchObject({ quantity: 1, isOpened: true, fillLevel: 0, cigarsLeft: null, parentItemId: 'g' });
    expect(db.unitsInStock()).toBe(3);
    expect(db.spend()).toBe(48);
  });

  it('the last single cigar of a group finishes the group itself and frees its slot', async () => {
    const db = fakeDb([box({ id: 'g', quantity: 1, cigarsPerBox: null, slotColumn: 4, slotRow: 1 })]);

    const result = await apply(db, 'g', { smokeOne: true }, 'cigar');

    expect(result.outcome).toBe('updated');
    expect(db.get('g')).toMatchObject({ isOpened: true, fillLevel: 0, slotColumn: null, slotRow: null });
    expect(db.items.size).toBe(1);
  });

  it('a box of a single cigar is finished by its only cigar', async () => {
    const db = fakeDb([box({ id: 'g', quantity: 1, cigarsPerBox: 1 })]);

    await apply(db, 'g', { smokeOne: true }, 'cigar');

    expect(db.get('g')).toMatchObject({ isOpened: true, fillLevel: 0, cigarsLeft: 0 });
  });

  it('opening a box without smoking leaves it full', async () => {
    const db = fakeDb([box({ id: 'g', quantity: 2 })]);

    const result = await apply(db, 'g', { state: { isOpened: true } }, 'cigar');

    expect(db.get(result.data.id)).toMatchObject({ isOpened: true, cigarsLeft: 25 });
    expect(db.unitsInStock()).toBe(50);
  });

  it('refuses to smoke what is not a cigar, or what is already finished', async () => {
    const db = fakeDb([unit({ id: 'w', quantity: 2 }), box({ id: 'f', isOpened: true, fillLevel: 0, cigarsLeft: 0 })]);
    await expectAppError(apply(db, 'w', { smokeOne: true }), 400, 'NOT_A_CIGAR');
    await expectAppError(apply(db, 'f', { smokeOne: true }, 'cigar'), 409, 'NOTHING_LEFT_TO_SMOKE');
  });

  it('a box closed again with every cigar goes back into its group', async () => {
    const db = fakeDb([box({ id: 'g', quantity: 2 }), box({ id: 's', isOpened: true, cigarsLeft: 24, parentItemId: 'g' })]);

    const result = await apply(db, 's', { state: { isOpened: false } }, 'cigar');

    expect(result.outcome).toBe('reattached');
    expect(db.get('g').quantity).toBe(3);
    expect(db.items.has('s')).toBe(false);
  });
});

describe('applyState — reattach (FEAT-106)', () => {
  async function openedFromSix(extra: Partial<StateItem> = {}) {
    const db = fakeDb([unit({ id: 'g', quantity: 6, ...extra })]);
    const opened = await apply(db, 'g', { state: { isOpened: true, fillLevel: 60, openedAt: NOW } });
    return { db, subId: opened.data.id };
  }

  it('c1: a bottle opened by mistake and put back closed and full gives a group of 6 again', async () => {
    const { db, subId } = await openedFromSix();
    expect(db.get('g').quantity).toBe(5);

    const result = await apply(db, subId, { state: { isOpened: false, fillLevel: 100 } });

    expect(result.outcome).toBe('reattached');
    expect(result.data.id).toBe('g');
    expect(result.removedIds).toEqual([subId]);
    expect(db.get('g')).toMatchObject({ quantity: 6, updatedBy: 'member', updatedAt: NOW });
    expect(db.items.size).toBe(1);
    expect(db.unitsInStock()).toBe(6);
    expect(db.spend()).toBe(120);
  });

  it('c4: a bottle marked drunk by mistake, put back full, is back in stock with the spending unchanged', async () => {
    const db = fakeDb([unit({ id: 'g', quantity: 6 })]);
    const drunk = await apply(db, 'g', { state: { isOpened: true, fillLevel: 0 } });
    expect(db.unitsInStock()).toBe(5);

    await apply(db, drunk.data.id, { state: { isOpened: false, fillLevel: 100 } });

    expect(db.unitsInStock()).toBe(6);
    expect(db.spend()).toBe(120);
    expect(db.get('g').quantity).toBe(6);
  });

  it('c3: when the group of origin moved to another cellar, the bottle becomes a group of 1 in its own cellar', async () => {
    const { db, subId } = await openedFromSix();
    db.get('g').cellarId = 'c2';

    const result = await apply(db, subId, { state: { isOpened: false, fillLevel: 100 } });

    expect(result.outcome).toBe('regrouped');
    expect(db.get(subId)).toMatchObject({ quantity: 1, isOpened: false, cellarId: 'c1', parentItemId: null, openedAt: null });
    expect(db.get('g').quantity).toBe(5);
    expect(db.unitsInStock()).toBe(6);
  });

  it.each([
    ['in the trash', { deletedAt: NOW }],
    ['written off', { writtenOffAt: NOW }],
    ['repriced', { purchasePrice: 25 }],
    ['of another size', { bottleSize: '150cl' }],
    ['bought another day', { purchasedAt: new Date('2026-02-01T00:00:00.000Z') }],
    ['opened itself', { isOpened: true, fillLevel: 20 }],
  ])('a group of origin %s is not joined: a group of 1 instead', async (_label, change) => {
    const { db, subId } = await openedFromSix();
    Object.assign(db.get('g'), change);

    const result = await apply(db, subId, { state: { isOpened: false, fillLevel: 100 } });

    expect(result.outcome).toBe('regrouped');
    expect(db.get(subId)).toMatchObject({ quantity: 1, parentItemId: null });
  });

  it('a group of origin gone altogether: a group of 1', async () => {
    const { db, subId } = await openedFromSix();
    db.items.delete('g');

    const result = await apply(db, subId, { state: { isOpened: false, fillLevel: 100 } });

    expect(result.outcome).toBe('regrouped');
    expect(db.get(subId).parentItemId).toBeNull();
  });

  it('a sub-record moved elsewhere in the same write does not join its group', async () => {
    const { db, subId } = await openedFromSix();

    const result = await apply(db, subId, { unit: { cellarId: 'c9' }, state: { isOpened: false, fillLevel: 100 } });

    expect(result.outcome).toBe('regrouped');
    expect(db.get(subId)).toMatchObject({ cellarId: 'c9', parentItemId: null });
  });

  it('an old opened bottle without a group of origin becomes a group of 1, even next to an identical group', async () => {
    const db = fakeDb([unit({ id: 'g', quantity: 5 }), unit({ id: 'old', isOpened: true, fillLevel: 40, openedAt: DAY })]);

    const result = await apply(db, 'old', { state: { isOpened: false, fillLevel: 100 } });

    expect(result.outcome).toBe('regrouped');
    expect(db.get('old')).toMatchObject({ quantity: 1, isOpened: false, openedAt: null });
    expect(db.get('g').quantity).toBe(5);
  });

  it('a sub-record put in a slot joins a group that has none, and brings the slot along', async () => {
    const { db, subId } = await openedFromSix();
    Object.assign(db.get(subId), { slotColumn: 5, slotRow: 2 });

    await apply(db, subId, { state: { isOpened: false, fillLevel: 100 } });

    expect(db.get('g')).toMatchObject({ quantity: 6, slotColumn: 5, slotRow: 2 });
    // Deleted before the group takes its slot (unique slot index).
    expect(db.order.indexOf(`delete:${subId}`)).toBeLessThan(db.order.lastIndexOf('update:g'));
  });

  it('two slots cannot become one: the sub-record stays a group of 1', async () => {
    const { db, subId } = await openedFromSix({ slotColumn: 1, slotRow: 1 });
    Object.assign(db.get(subId), { slotColumn: 5, slotRow: 2 });

    const result = await apply(db, subId, { state: { isOpened: false, fillLevel: 100 } });

    expect(result.outcome).toBe('regrouped');
    expect(db.get('g')).toMatchObject({ quantity: 5, slotColumn: 1 });
  });

  describe('c2: tastings noted on the sub-record', () => {
    async function withTasting() {
      const { db, subId } = await openedFromSix();
      db.tastings.push({ id: 't1', itemId: subId, productId: 'p1' });
      return { db, subId };
    }

    it('asks first: 409 TASTINGS_ON_ITEM, nothing written', async () => {
      const { db, subId } = await withTasting();

      await expectAppError(apply(db, subId, { state: { isOpened: false, fillLevel: 100 } }), 409, 'TASTINGS_ON_ITEM');

      expect(db.items.has(subId)).toBe(true);
      expect(db.get('g').quantity).toBe(5);
    });

    it('kept: the tasting stays on the family, the bottle goes back into its group', async () => {
      const { db, subId } = await withTasting();

      await apply(db, subId, { state: { isOpened: false, fillLevel: 100 }, keepTastings: true });

      expect(db.tastings).toEqual([{ id: 't1', itemId: null, productId: 'p1' }]);
      expect(db.get('g').quantity).toBe(6);
    });

    it('not kept: the tasting is deleted', async () => {
      const { db, subId } = await withTasting();

      await apply(db, subId, { state: { isOpened: false, fillLevel: 100 }, keepTastings: false });

      expect(db.tastings).toEqual([]);
      expect(db.get('g').quantity).toBe(6);
    });

    it('not asked when the sub-record stays (a group of 1)', async () => {
      const { db, subId } = await withTasting();
      db.get('g').cellarId = 'c2';

      const result = await apply(db, subId, { state: { isOpened: false, fillLevel: 100 } });

      expect(result.outcome).toBe('regrouped');
      expect(db.tastings[0]).toMatchObject({ itemId: subId });
    });
  });

  it('what pointed at the sub-record follows the group: history, inventory entries, wishlist link', async () => {
    const { db, subId } = await openedFromSix();
    db.audits.push({ id: 'a1', bottleId: subId });
    db.entries.push({ id: 'e1', sessionId: 's1', itemId: subId }, { id: 'e2', sessionId: 's2', itemId: subId }, { id: 'e3', sessionId: 's2', itemId: 'g' });
    db.wishlist.push({ id: 'w1', acquiredItemId: subId });

    await apply(db, subId, { state: { isOpened: false, fillLevel: 100 } });

    expect(db.audits[0].bottleId).toBe('g');
    expect(db.wishlist[0].acquiredItemId).toBe('g');
    expect(db.entries.find((entry) => entry.id === 'e1')?.itemId).toBe('g');
    // The group is already counted in s2: the sub-record's entry is left to the cascade.
    expect(db.entries.find((entry) => entry.id === 'e2')?.itemId).toBe(subId);
  });
});

describe('planState', () => {
  it('a write that keeps a group intact is a plain update', () => {
    const plan = planState(unit({ id: 'g', quantity: 6 }) as unknown as StateItem, { unit: { location: 'X' } }, 'bottle', NOW);
    expect(plan.outcome).toBe('updated');
  });

  it('putting a bottle back full clears its opening date unless one is given', () => {
    const opened = unit({ id: 's', isOpened: true, fillLevel: 50, openedAt: DAY }) as unknown as StateItem;
    expect(planState(opened, { state: { isOpened: false, fillLevel: 100 } }, 'bottle', NOW).next.openedAt).toBeNull();
  });
});

describe('finishUnits (rotating inventory: missing copies drunk)', () => {
  it('finishes every copy of a group, one sub-record each, the last one the group itself', async () => {
    const db = fakeDb([unit({ id: 'g', quantity: 3, slotColumn: 1, slotRow: 2 })]);

    const finished = await finishUnits(db.tx, 'g', 3, { userId: 'member', now: NOW });

    expect(finished).toHaveLength(3);
    expect(finished.at(-1)).toBe('g');
    expect(db.items.size).toBe(3);
    for (const row of db.items.values()) expect(row).toMatchObject({ quantity: 1, isOpened: true, fillLevel: 0 });
    expect(db.get('g')).toMatchObject({ slotColumn: null, slotRow: null });
    expect(db.unitsInStock()).toBe(0);
    expect(db.spend()).toBe(60);
    // The family is locked before any unit is written.
    expect(db.order[0]).toBe('lock');
  });

  it('finishes only the copies asked for', async () => {
    const db = fakeDb([unit({ id: 'g', quantity: 6 })]);

    await finishUnits(db.tx, 'g', 2, { userId: 'member', now: NOW });

    expect(db.get('g').quantity).toBe(4);
    expect(db.unitsInStock()).toBe(4);
    expect(db.spend()).toBe(120);
  });

  it('does nothing for a unit gone or already finished', async () => {
    const db = fakeDb([unit({ id: 'f', isOpened: true, fillLevel: 0 })]);
    expect(await finishUnits(db.tx, 'nope', 1, { userId: 'member' })).toEqual([]);
    expect(await finishUnits(db.tx, 'f', 1, { userId: 'member' })).toEqual([]);
  });
});

describe('the counts never move (FEAT-103/106: total bought and spending)', () => {
  it('holds over a sequence of opens, drinks and put-backs', async () => {
    const db = fakeDb([unit({ id: 'g', quantity: 6 })]);
    const opened = await apply(db, 'g', { state: { isOpened: true, fillLevel: 70 } });
    const drunk = await apply(db, 'g', { state: { isOpened: true, fillLevel: 0 } });
    await apply(db, opened.data.id, { state: { fillLevel: 10 } });
    await apply(db, drunk.data.id, { state: { isOpened: false, fillLevel: 100 } });

    expect(db.copies()).toBe(6);
    expect(db.spend()).toBe(120);
    expect(db.get('g').quantity).toBe(5);
    expect(db.unitsInStock()).toBe(6);
  });
});
