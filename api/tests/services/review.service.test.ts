import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ZodError } from 'zod';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    product: { findMany: vi.fn(), count: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    productDistinction: { findMany: vi.fn(), count: vi.fn(), createMany: vi.fn() },
    inventoryItem: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    inventoryCountEntry: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));
vi.mock('../../src/services/product.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/product.service')>()),
  productService: { views: vi.fn() },
}));

import { prisma } from '../../src/lib/prisma';
import { productService } from '../../src/services/product.service';
import { reviewService } from '../../src/services/review.service';
import { PRODUCT_FIELDS } from '../../src/lib/product-fields';
import { AppError } from '../../src/lib/errors';

/** A family as Prisma returns it, every description field empty unless given. */
function family(fields: Record<string, unknown> = {}) {
  return {
    id: 'p1', userId: 'u1', updatedBy: null,
    ...Object.fromEntries(PRODUCT_FIELDS.map((field) => [field, null])),
    category: 'wine', name: 'Cuvée X', producer: 'Domaine Y', vintage: 2020,
    tags: [], grapeVarieties: [], otherPhotoUrls: [], alertsPaused: false, alertStatus: 'none',
    lockedFields: [], fieldSources: null, deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...fields,
  };
}

/** A unit row (money columns as numbers, as the extended client reads them at the top level). */
function unit(fields: Record<string, unknown> = {}) {
  return {
    id: 'b1', productId: 'p1', userId: 'u1', updatedBy: null, cellarId: 'c1', slotColumn: null, slotRow: null,
    location: null, purchasePrice: 20, estimatedValue: null, purchasePlace: null,
    purchasedAt: new Date('2026-01-15T00:00:00Z'), bottleSize: null, quantity: 1, cigarsPerBox: null, cigarsLeft: null,
    isOpened: false, fillLevel: null, openedAt: null, parentItemId: null, writtenOffAt: null, needsReview: false,
    fieldSources: null, lockedFields: [], isOwned: true, deletedAt: null,
    createdAt: new Date('2026-01-15T09:00:00Z'), updatedAt: new Date('2026-01-15T09:00:00Z'),
    ...fields,
  };
}

/** A stand-in for a family's card (productService.views is tested with the product service). */
const view = (id: string, items: unknown[] = []) => ({ id, items });

/** Every lock and raw write, in order: `lock p1`, then `UPDATE "bottles" …`. */
let events: string[] = [];
const raw = () => vi.mocked(prisma.$executeRaw).mock.calls.map(([strings, ...values]) => ({
  sql: (strings as unknown as string[]).join('?'),
  values: values.map((value) => (value && typeof value === 'object' && 'values' in value ? (value as { values: unknown[] }).values : value)),
}));
const rawLike = (fragment: string) => raw().filter((call) => call.sql.includes(fragment));
const productUpdate = () => (vi.mocked(prisma.product.update).mock.calls[0]?.[0] as { where: { id: string }; data: Record<string, unknown> });

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(() => null, (err: unknown) => err);
}

beforeEach(() => {
  vi.clearAllMocks();
  events = [];
  vi.mocked(prisma.$transaction).mockImplementation(((callback: (tx: unknown) => unknown) => callback(prisma)) as never);
  vi.mocked(prisma.$queryRaw).mockImplementation(((_strings: unknown, id: string) => {
    events.push(`lock ${id}`);
    return Promise.resolve([]);
  }) as never);
  vi.mocked(prisma.$executeRaw).mockImplementation(((strings: string[]) => {
    events.push(strings[0].trim().split('\n')[0]);
    return Promise.resolve(1);
  }) as never);
  vi.mocked(prisma.product.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.product.update).mockImplementation(((args: { data: Record<string, unknown> }) => {
    events.push('write family');
    return Promise.resolve(family(args.data));
  }) as never);
  vi.mocked(prisma.productDistinction.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.productDistinction.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.inventoryCountEntry.findMany).mockResolvedValue([] as never);
  vi.mocked(productService.views).mockImplementation(((ids: string[]) =>
    Promise.resolve([...new Set(ids)].map((id) => view(id)))) as never);
});

describe('reviewService.list (FEAT-102 c1, c4, c5)', () => {
  it('c5: nothing to review gives empty lists', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([family({ id: 'p1' }), family({ id: 'p2', name: 'Autre cuvée' })] as never);

    expect(await reviewService.list()).toEqual({ merges: [], counts: [] });
    expect(prisma.productDistinction.findMany).not.toHaveBeenCalled();
  });

  it('c1: two families of the same wine apart for their region show that field only, pre-selected on the most recent', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      family({ id: 'p2', region: 'Graves', color: 'red', updatedAt: new Date('2026-09-01T00:00:00Z'), createdAt: new Date('2026-02-01T00:00:00Z') }),
      family({ id: 'p1', region: 'Bordeaux', color: 'Red ', updatedAt: new Date('2026-03-01T00:00:00Z') }),
      family({ id: 'p3', name: 'Autre cuvée', region: 'Médoc' }),
    ] as never);

    const list = await reviewService.list();

    expect(list.counts).toEqual([]);
    expect(list.merges).toEqual([{
      products: [view('p1'), view('p2')],
      units: 0,
      disagreements: [{
        field: 'region',
        values: [{ productId: 'p1', value: 'Bordeaux' }, { productId: 'p2', value: 'Graves' }],
        preselectedProductId: 'p2',
      }],
    }]);
  });

  it('matches the wine as productKey does: case and surrounding spaces do not matter', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      family({ id: 'p1' }), family({ id: 'p2', name: ' cuvée x', producer: 'DOMAINE Y ' }),
    ] as never);

    expect((await reviewService.list()).merges).toEqual([{ products: [view('p1'), view('p2')], units: 0, disagreements: [] }]);
  });

  it('tells how many bottles the merged card will hold (the confirmation before merging)', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([family({ id: 'p1' }), family({ id: 'p2' })] as never);
    vi.mocked(productService.views).mockResolvedValue([
      view('p1', [unit({ quantity: 6 }), unit({ id: 'b2', isOpened: true, fillLevel: 40 })]),
      view('p2', [unit({ id: 'b3', productId: 'p2', quantity: 2 })]),
    ] as never);

    expect((await reviewService.list()).merges[0].units).toBe(9);
  });

  it('c3: never proposes two families declared different wines', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([family({ id: 'p1', region: 'Bordeaux' }), family({ id: 'p2', region: 'Graves' })] as never);
    vi.mocked(prisma.productDistinction.findMany).mockResolvedValue([{ productId: 'p1', otherProductId: 'p2' }] as never);

    expect((await reviewService.list()).merges).toEqual([]);
  });

  it('c4: a guessed group shows with the bottle split off it', async () => {
    const group = unit({ id: 'g1', quantity: 5, needsReview: true });
    const finished = unit({ id: 's1', isOpened: true, fillLevel: 0, parentItemId: 'g1' });
    vi.mocked(prisma.inventoryItem.findMany)
      .mockResolvedValueOnce([group] as never)
      .mockResolvedValueOnce([finished] as never);

    const list = await reviewService.list();

    expect(vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0]).toMatchObject({
      where: { needsReview: true, deletedAt: null, product: { deletedAt: null } },
    });
    expect(list.counts).toEqual([{
      product: view('p1'),
      group: expect.objectContaining({ id: 'g1', quantity: 5, needsReview: true, purchasedAt: '2026-01-15' }),
      subRecords: [expect.objectContaining({ id: 's1', isOpened: true, fillLevel: 0, parentItemId: 'g1' })],
    }]);
  });
});

describe('reviewService.merge (FEAT-102 c2)', () => {
  const older = () => family({
    id: 'p1', region: 'Bordeaux', tags: ['garde'], notes: 'Acheté à la foire', alertsPaused: true,
    reminderDate: new Date('2027-05-01T00:00:00Z'), lockedFields: ['region'], fieldSources: { region: 'ocr', color: 'ocr' },
    createdAt: new Date('2026-01-01T10:00:00Z'), updatedAt: new Date('2026-03-01T00:00:00Z'),
  });
  const newer = () => family({
    id: 'p2', region: 'Graves', color: 'red', tags: ['garde', 'fête'], notes: 'Cadeau', photoUrl: '/uploads/products/b.jpg',
    otherPhotoUrls: ['/uploads/products/c.jpg'], reminderDate: new Date('2027-01-01T00:00:00Z'), fieldSources: { region: 'manual', color: 'import_csv' },
    createdAt: new Date('2026-02-01T10:00:00Z'), updatedAt: new Date('2026-09-01T00:00:00Z'),
  });
  const families = (...rows: unknown[]) => vi.mocked(prisma.product.findMany).mockResolvedValue(rows as never);

  it('makes one family of them, the oldest surviving with the values chosen, everything gathered', async () => {
    families(newer(), older());

    const outcome = await reviewService.merge('u2', { productIds: ['p2', 'p1'], choices: { region: 'p1' } });

    // Lock rule: both families, sorted, before any write.
    expect(events.slice(0, 2)).toEqual(['lock p1', 'lock p2']);
    expect(outcome).toMatchObject({ productId: 'p1', removedProductIds: ['p2'], removedItemIds: [], overLimits: { notes: false, tags: false } });
    expect(rawLike('UPDATE "bottles" SET "productId"')[0].values).toEqual(['p1', ['p2']]);
    expect(rawLike('UPDATE "tasting_notes" SET "productId"')[0].values).toEqual(['p1', ['p2']]);
    expect(rawLike('UPDATE "audit_logs" SET "productId"')[0].values).toEqual(['p1', ['p2']]);
    expect(rawLike('INSERT INTO "_CollectionProducts"')[0].values).toEqual(['p1', ['p2']]);
    expect(productUpdate().where).toEqual({ id: 'p1' });
    expect(productUpdate().data).toMatchObject({
      region: 'Bordeaux',
      color: 'red',
      tags: ['garde', 'fête'],
      photoUrl: '/uploads/products/b.jpg',
      otherPhotoUrls: ['/uploads/products/c.jpg'],
      notes: '2026-01-01\nAcheté à la foire\n\n2026-02-01\nCadeau',
      alertsPaused: false,
      reminderDate: new Date('2027-01-01T00:00:00Z'),
      lockedFields: ['region'],
      // Per field, the source of the family whose value was kept.
      fieldSources: { region: 'ocr', color: 'import_csv' },
      updatedBy: 'u2',
    });
    expect(prisma.product.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['p2'] } } });
    // Units moved before the description is copied onto them, families deleted after.
    expect(events.indexOf('UPDATE "bottles" SET "productId" = ')).toBeLessThan(events.indexOf('write family'));
    expect(outcome.changes).toEqual(expect.arrayContaining([
      { field: 'color', from: null, to: 'red' },
      { field: 'tags', from: ['garde'], to: ['garde', 'fête'] },
    ]));
    expect(outcome.changes.map((change) => change.field)).not.toContain('region');
  });

  it('keeps identical notes once, dated by the oldest family holding them, in chronological order', async () => {
    families(
      family({ id: 'pa', notes: 'Cadeau', createdAt: new Date('2026-01-01T10:00:00Z') }),
      family({ id: 'pb', notes: ' Cadeau ', createdAt: new Date('2026-03-01T10:00:00Z') }),
      family({ id: 'pc', notes: 'Foire', createdAt: new Date('2026-02-01T10:00:00Z') }),
    );

    await reviewService.merge('u2', { productIds: ['pa', 'pb', 'pc'] });

    expect(productUpdate().data.notes).toBe('2026-01-01\nCadeau\n\n2026-02-01\nFoire');
  });

  it('keeps the legacy label within 200 characters, first spelling first, the rest in the notes', async () => {
    const long = 'L'.repeat(190);
    families(
      family({ id: 'pa', collection: 'Fête', createdAt: new Date('2026-01-01T10:00:00Z') }),
      family({ id: 'pb', collection: ' fête ', createdAt: new Date('2026-02-01T10:00:00Z') }),
      family({ id: 'pc', collection: long, createdAt: new Date('2026-03-01T10:00:00Z') }),
      family({ id: 'pd', collection: 'Mariage', notes: 'Note', createdAt: new Date('2026-04-01T10:00:00Z') }),
    );

    await reviewService.merge('u2', { productIds: ['pa', 'pb', 'pc', 'pd'] });

    const { collection, notes } = productUpdate().data as { collection: string; notes: string };
    expect(collection).toBe(`Fête / ${long}`);
    expect(notes).toMatch(new RegExp(`^Note\\n\\n\\d{4}-\\d{2}-\\d{2}\\nLibellés d'origine : Fête / ${long} / Mariage$`));
  });

  it('keeps every label when they fit, and says when notes or tags exceed the form', async () => {
    families(
      family({ id: 'p1', collection: 'Fête', notes: 'N'.repeat(1500), tags: Array.from({ length: 12 }, (_v, i) => `a${i}`) }),
      family({ id: 'p2', collection: 'Mariage', notes: 'M'.repeat(600), tags: Array.from({ length: 12 }, (_v, i) => `b${i}`), createdAt: new Date('2026-02-01T00:00:00Z') }),
    );

    const outcome = await reviewService.merge('u2', { productIds: ['p1', 'p2'] });

    expect(productUpdate().data.collection).toBe('Fête / Mariage');
    expect(outcome.overLimits).toEqual({ notes: true, tags: true });
  });

  it('keeps, for a field left out, the value pre-selected on the most recent family (point 40)', async () => {
    families(older(), newer());

    await reviewService.merge('u2', { productIds: ['p1', 'p2'] });

    expect(productUpdate().data).toMatchObject({ region: 'Graves', alertStatus: 'none' });
  });

  it('fuses the groups that became strictly identical, their tastings and history following the survivor', async () => {
    families(older(), newer());
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      unit({ id: 'b1', quantity: 3, purchasePlace: 'Foire', createdAt: new Date('2026-01-15T09:00:00Z') }),
      unit({ id: 'b2', quantity: 2, location: 'Rack A', lockedFields: ['location'], createdAt: new Date('2026-02-15T09:00:00Z') }),
      unit({ id: 'b3', quantity: 4, purchasePrice: 25 }),
    ] as never);

    const outcome = await reviewService.merge('u2', { productIds: ['p1', 'p2'] });

    expect(vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0]).toMatchObject({
      where: { productId: 'p1', deletedAt: null, writtenOffAt: null, needsReview: false, slotColumn: null, slotRow: null, isOwned: true },
    });
    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: expect.objectContaining({ quantity: 5, purchasePlace: 'Foire', location: 'Rack A', lockedFields: ['location'], updatedBy: 'u2' }),
    });
    for (const table of ['tasting_notes', 'audit_logs', 'inventory_count_entries', 'wishlist_items', 'bottles']) {
      expect(raw().some((call) => call.sql.includes(`UPDATE "${table}" SET "`) && call.values[0] === 'b1'
        && JSON.stringify(call.values[1]) === JSON.stringify(['b2']))).toBe(true);
    }
    expect(rawLike('"foundQuantity" = coalesce')[0].values).toEqual([['b1', 'b2']]);
    expect(prisma.inventoryItem.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['b2'] } } });
    expect(outcome.removedItemIds).toEqual(['b2']);
  });

  it('never fuses two groups counted in the same inventory session', async () => {
    families(older(), newer());
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([unit({ id: 'b1' }), unit({ id: 'b2' })] as never);
    vi.mocked(prisma.inventoryCountEntry.findMany).mockResolvedValue([
      { itemId: 'b1', sessionId: 's1' }, { itemId: 'b2', sessionId: 's1' },
    ] as never);

    const outcome = await reviewService.merge('u2', { productIds: ['p1', 'p2'] });

    expect(outcome.removedItemIds).toEqual([]);
    expect(prisma.inventoryItem.deleteMany).not.toHaveBeenCalled();
  });

  it('keeps "another wine" memories of a merged family with a third one, on the survivor', async () => {
    families(older(), newer());
    vi.mocked(prisma.productDistinction.findMany).mockResolvedValue([
      { productId: 'p0', otherProductId: 'p2' }, { productId: 'p2', otherProductId: 'p9' },
    ] as never);

    await reviewService.merge('u2', { productIds: ['p1', 'p2'] });

    expect(prisma.productDistinction.createMany).toHaveBeenCalledWith({
      data: [{ productId: 'p0', otherProductId: 'p1' }, { productId: 'p1', otherProductId: 'p9' }],
      skipDuplicates: true,
    });
  });

  it.each([
    ['another wine', () => families(older(), { ...newer(), name: 'Autre cuvée' }), 400, 'NOT_SAME_WINE'],
    ['families declared different', () => { families(older(), newer()); vi.mocked(prisma.productDistinction.count).mockResolvedValue(1 as never); }, 409, 'DISTINCT_WINES'],
    ['an unknown family', () => { families(older()); vi.mocked(prisma.product.count).mockResolvedValue(1 as never); }, 404, 'PRODUCT_NOT_FOUND'],
    ['a family in the trash', () => { families(older()); vi.mocked(prisma.product.count).mockResolvedValue(2 as never); }, 409, 'PRODUCT_IN_TRASH'],
  ])('refuses %s, changing nothing', async (_label, arrange, status, code) => {
    arrange();

    const error = await rejection(reviewService.merge('u2', { productIds: ['p1', 'p2'] }));

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status, code });
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it.each([
    ['a family that is not merged', { region: 'p7' }],
    ['a family without a value for the field', { color: 'p1' }],
  ])('refuses a choice naming %s', async (_label, choices) => {
    families(older(), newer());

    const error = await rejection(reviewService.merge('u2', { productIds: ['p1', 'p2'], choices }));

    expect(error).toMatchObject({ status: 400, code: 'INVALID_CHOICE' });
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('refuses a drinking window put together backwards from two families', async () => {
    families(
      family({ id: 'p1', peakMaturityFrom: 2020, peakMaturityTo: 2025 }),
      family({ id: 'p2', peakMaturityFrom: 2027, peakMaturityTo: 2030, createdAt: new Date('2026-02-01T00:00:00Z') }),
    );

    const error = await rejection(reviewService.merge('u2', { productIds: ['p1', 'p2'], choices: { peakMaturityFrom: 'p2', peakMaturityTo: 'p1' } }));

    expect(error).toBeInstanceOf(ZodError);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('reviewService.distinguish (FEAT-102 c3)', () => {
  it('remembers every pair, ids ordered, whatever was already remembered', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([family({ id: 'p3' }), family({ id: 'p1' }), family({ id: 'p2' })] as never);

    const pairs = await reviewService.distinguish({ productIds: ['p3', 'p1', 'p2'] });

    expect(events).toEqual(['lock p1', 'lock p2', 'lock p3']);
    expect(pairs).toEqual([['p1', 'p3'], ['p2', 'p3'], ['p1', 'p2']]);
    expect(prisma.productDistinction.createMany).toHaveBeenCalledWith({
      data: [{ productId: 'p1', otherProductId: 'p3' }, { productId: 'p2', otherProductId: 'p3' }, { productId: 'p1', otherProductId: 'p2' }],
      skipDuplicates: true,
    });
  });

  it('refuses two different wines', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([family({ id: 'p1' }), family({ id: 'p2', vintage: 2021 })] as never);

    expect(await rejection(reviewService.distinguish({ productIds: ['p1', 'p2'] }))).toMatchObject({ status: 400, code: 'NOT_SAME_WINE' });
    expect(prisma.productDistinction.createMany).not.toHaveBeenCalled();
  });
});

describe('reviewService.confirmCount (FEAT-102 c4, "C\'est bon")', () => {
  it('lifts the mark only, its family locked first', async () => {
    vi.mocked(prisma.inventoryItem.findFirst)
      .mockResolvedValueOnce({ productId: 'p1' } as never)
      .mockResolvedValueOnce(unit({ id: 'g1', quantity: 5, needsReview: true }) as never);
    vi.mocked(prisma.inventoryItem.update).mockImplementation(((args: { data: Record<string, unknown> }) => {
      events.push('write unit');
      return Promise.resolve(unit({ id: 'g1', quantity: 5, ...args.data }));
    }) as never);

    const outcome = await reviewService.confirmCount('u2', 'g1');

    expect(events).toEqual(['lock p1', 'write unit']);
    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { needsReview: false, updatedBy: 'u2' } });
    expect(outcome).toEqual({ item: expect.objectContaining({ id: 'g1', quantity: 5, needsReview: false }), changed: true });
  });

  it('changes nothing when another member already settled it', async () => {
    vi.mocked(prisma.inventoryItem.findFirst)
      .mockResolvedValueOnce({ productId: 'p1' } as never)
      .mockResolvedValueOnce(unit({ id: 'g1', needsReview: false }) as never);

    expect(await reviewService.confirmCount('u2', 'g1')).toMatchObject({ changed: false, item: { id: 'g1' } });
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('is null for a unit unknown or in the trash', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null as never);

    expect(await reviewService.confirmCount('u2', 'gone')).toBeNull();
  });
});
