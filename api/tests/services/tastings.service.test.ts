import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    tastingNote: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    inventoryItem: { findFirst: vi.fn() },
    product: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../../src/lib/prisma';
import { tastingsService } from '../../src/services/tastings.service';

type NoteRow = {
  rating: number | null;
  readiness: string | null;
  product: { id: string; name: string; producer: string } | null;
};

/** One rated note per distinct item, ratings decreasing from 5. */
function notes(count: number): NoteRow[] {
  return Array.from({ length: count }, (_, i) => ({
    rating: 5 - i * 0.2,
    readiness: null,
    product: { id: `i${i + 1}`, name: `Item ${i + 1}`, producer: `Producer ${i + 1}` },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(((callback: (tx: unknown) => unknown) => callback(prisma)) as never);
  vi.mocked(prisma.tastingNote.create).mockResolvedValue({ id: 't1', item: null } as never);
  vi.mocked(prisma.tastingNote.update).mockResolvedValue({ id: 't1', item: null } as never);
});

// #471 (lot Z): a bottle has no description of its own; a tasting's bottle is
// served with its family's, flat, as before.
describe('tastingsService — the bottle of a tasting, described by its family', () => {
  const row = {
    id: 't1', itemId: 'b1', productId: 'p1',
    item: { id: 'b1', product: { name: 'Talbot', producer: 'Château Talbot', category: 'wine', photoUrl: '/p.jpg', color: 'red', spiritType: null, sparklingType: null, format: null } },
    product: { id: 'p1', name: 'Talbot' },
  };

  it('reads the description on the family and serves it flat on the bottle', async () => {
    vi.mocked(prisma.tastingNote.findMany).mockResolvedValue([row, { ...row, id: 't2', itemId: null, item: null }] as never);
    vi.mocked(prisma.tastingNote.count).mockResolvedValue(2 as never);

    const { notes: served } = await tastingsService.list();

    expect(served[0].item).toEqual({ id: 'b1', name: 'Talbot', producer: 'Château Talbot', category: 'wine', photoUrl: '/p.jpg', color: 'red', spiritType: null, sparklingType: null, format: null });
    expect(served[1].item).toBeNull();
    const include = vi.mocked(prisma.tastingNote.findMany).mock.calls[0][0]!.include as { item: { select: Record<string, unknown> } };
    expect(include.item.select).not.toHaveProperty('name');
    expect(include.item.select).toMatchObject({ id: true, product: { select: { name: true, producer: true } } });
  });

  it('serves a created or edited tasting the same way', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ productId: 'p1' } as never);
    vi.mocked(prisma.tastingNote.create).mockResolvedValue(row as never);
    vi.mocked(prisma.tastingNote.findFirst).mockResolvedValue({ id: 't1', itemId: 'b1', productId: 'p1' } as never);
    vi.mocked(prisma.tastingNote.update).mockResolvedValue(row as never);

    const created = await tastingsService.create('u1', { itemId: 'b1', rating: 4 } as never);
    const edited = await tastingsService.update('t1', { rating: 3 } as never);

    expect(created.item).toMatchObject({ id: 'b1', name: 'Talbot' });
    expect(edited!.item).toMatchObject({ id: 'b1', name: 'Talbot' });
  });
});

describe('tastingsService.analytics — top/flop items (ISSUE_038)', () => {
  it('hides the flop list while there are too few rated items', async () => {
    vi.mocked(prisma.tastingNote.findMany).mockResolvedValue(notes(1) as never);

    const stats = await tastingsService.analytics();

    expect(stats.topItems.map((i) => i.id)).toEqual(['i1']);
    // The single rated item must not be its own worst entry.
    expect(stats.flopItems).toEqual([]);
  });

  it('still hides the flop list just below the threshold', async () => {
    vi.mocked(prisma.tastingNote.findMany).mockResolvedValue(notes(9) as never);

    const stats = await tastingsService.analytics();

    expect(stats.topItems).toHaveLength(5);
    expect(stats.flopItems).toEqual([]);
  });

  it('returns disjoint top and flop lists once there are enough rated items', async () => {
    vi.mocked(prisma.tastingNote.findMany).mockResolvedValue(notes(12) as never);

    const stats = await tastingsService.analytics();

    const topIds = stats.topItems.map((i) => i.id);
    const flopIds = stats.flopItems.map((i) => i.id);
    expect(topIds).toEqual(['i1', 'i2', 'i3', 'i4', 'i5']);
    // Worst first, and never overlapping the top slice.
    expect(flopIds).toEqual(['i12', 'i11', 'i10', 'i9', 'i8']);
    expect(topIds.filter((id) => flopIds.includes(id))).toEqual([]);
  });

  it('ignores unrated notes and notes without a wine', async () => {
    vi.mocked(prisma.tastingNote.findMany).mockResolvedValue([
      ...notes(2),
      { rating: null, readiness: 'PEAK', product: { id: 'i3', name: 'C', producer: 'P' } },
      { rating: 4, readiness: 'PAST', product: null },
    ] as never);

    const stats = await tastingsService.analytics();

    expect(stats.topItems.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(stats.producerRankings).toHaveLength(2);
    expect(stats.readinessDistribution).toEqual({ TOO_YOUNG: 0, PERFECT: 0, PEAK: 1, PAST: 1 });
  });
});

// #471 (F1 review): a tasting belongs to the family of the bottle tasted, so
// the family's sheet finds it by `productId`.
describe('tastingsService — the family of the tasted bottle', () => {
  it('records the family on a new tasting of a bottle', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ id: 'b1', productId: 'p1' } as never);

    await tastingsService.create('u1', { itemId: 'b1', rating: 4 });

    expect(vi.mocked(prisma.tastingNote.create).mock.calls[0]?.[0]).toMatchObject({
      data: { userId: 'u1', itemId: 'b1', productId: 'p1', rating: 4 },
    });
  });

  it('records no family on a tasting without a bottle', async () => {
    await tastingsService.create('u1', { rating: 4 });

    const data = vi.mocked(prisma.tastingNote.create).mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.productId).toBeUndefined();
    expect(prisma.inventoryItem.findFirst).not.toHaveBeenCalled();
  });

  it('follows the bottle when a tasting is moved to another one', async () => {
    vi.mocked(prisma.tastingNote.findFirst).mockResolvedValue({ id: 't1' } as never);
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ id: 'b2', productId: 'p2' } as never);

    await tastingsService.update('t1', { itemId: 'b2' });

    expect(vi.mocked(prisma.tastingNote.update).mock.calls[0]?.[0]).toMatchObject({ data: { itemId: 'b2', productId: 'p2' } });
  });

  it('leaves the family alone when the bottle does not change', async () => {
    vi.mocked(prisma.tastingNote.findFirst).mockResolvedValue({ id: 't1' } as never);

    await tastingsService.update('t1', { rating: 3 });

    const data = vi.mocked(prisma.tastingNote.update).mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data).not.toHaveProperty('productId');
  });
});

// #471 (FEAT-107): tastings gathered on the wine (the family).
describe('tastingsService — tastings of the wine (FEAT-107)', () => {
  const P1 = '11111111-1111-4111-8111-111111111111';
  const created = () => vi.mocked(prisma.tastingNote.create).mock.calls[0]?.[0]?.data as Record<string, unknown>;

  // c2: "sans bouteille" on a wine in stock: the wine only, the stock untouched.
  it('notes a tasting on a known wine without any bottle of the cellar', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue({ id: P1 } as never);

    await tastingsService.create('u1', { productId: P1, rating: 5 });

    expect(created()).toMatchObject({ productId: P1, rating: 5 });
    expect(created().itemId).toBeUndefined();
    // Only a listed wine (not in the trash) is offered.
    expect(vi.mocked(prisma.product.findFirst).mock.calls[0]?.[0]?.where).toMatchObject({ id: P1, deletedAt: null });
    expect(prisma.inventoryItem.findFirst).not.toHaveBeenCalled();
  });

  it('refuses a wine that is not listed (in the trash, or unknown)', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null as never);

    await expect(tastingsService.create('u1', { productId: P1 })).rejects.toMatchObject({ status: 404, code: 'PRODUCT_NOT_FOUND' });
    expect(prisma.tastingNote.create).not.toHaveBeenCalled();
  });

  it('refuses a bottle that is not of the wine given', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ productId: 'p2' } as never);

    await expect(tastingsService.create('u1', { itemId: 'b1', productId: P1 })).rejects.toMatchObject({ status: 400, code: 'ITEM_NOT_IN_PRODUCT' });
  });

  it('answers 404 for a bottle in the trash or unknown', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null as never);

    await expect(tastingsService.create('u1', { itemId: 'b1' })).rejects.toMatchObject({ status: 404, code: 'ITEM_NOT_FOUND' });
  });

  // c4: a wine named that Glou never had → a wine without any bottle.
  it('creates a wine without any bottle for a wine named that Glou does not know', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 'other', category: 'wine', producer: 'Domaine X', name: 'Cuvée A', vintage: 2019, format: null },
    ] as never);
    vi.mocked(prisma.product.create).mockResolvedValue({ id: 'new' } as never);

    await tastingsService.create('u1', {
      wine: { category: 'wine', producer: 'Domaine X', name: 'Cuvée A', vintage: 2020 }, rating: 4,
    });

    expect(vi.mocked(prisma.product.create).mock.calls[0]?.[0]).toMatchObject({
      data: { userId: 'u1', category: 'wine', producer: 'Domaine X', name: 'Cuvée A', vintage: 2020 },
    });
    // Never a bottle: no unit is written with it.
    expect(vi.mocked(prisma.product.create).mock.calls[0]?.[0]?.data).not.toHaveProperty('items');
    expect(created()).toMatchObject({ productId: 'new', rating: 4 });
    expect(created()).not.toHaveProperty('wine');
    // Serialised per wine, in the same transaction as the tasting.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.$executeRaw).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(prisma.product.findMany).mock.invocationCallOrder[0]);
  });

  it('puts a wine named on the identical wine Glou knows (case, spaces), the oldest one', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 'oldest', category: 'wine', producer: 'Domaine X ', name: 'cuvée a', vintage: 2020, format: null },
      { id: 'newer', category: 'wine', producer: 'Domaine X', name: 'Cuvée A', vintage: 2020, format: null },
    ] as never);

    await tastingsService.create('u1', { wine: { category: 'wine', producer: 'domaine x', name: 'Cuvée A', vintage: 2020 } });

    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(created()).toMatchObject({ productId: 'oldest' });
  });

  it("a cigar's wine is told apart by its vitola, never by a vintage", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 'robusto', category: 'cigar', producer: 'Cohiba', name: 'Siglo', vintage: null, format: 'Robusto' },
    ] as never);
    vi.mocked(prisma.product.create).mockResolvedValue({ id: 'new' } as never);

    await tastingsService.create('u1', { wine: { category: 'cigar', producer: 'Cohiba', name: 'Siglo', vintage: 2020, format: 'Corona' } });

    expect(vi.mocked(prisma.product.create).mock.calls[0]?.[0]?.data).toMatchObject({ format: 'Corona' });
    expect(vi.mocked(prisma.product.create).mock.calls[0]?.[0]?.data).not.toHaveProperty('vintage');
  });

  // Review #818: the edit form resends the tasting's own bottle, which may be
  // in the trash by now (or its wine): no lookup, no 404.
  it('edits a tasting whose bottle is in the trash, its bottle resent unchanged', async () => {
    vi.mocked(prisma.tastingNote.findFirst).mockResolvedValue({ id: 't1', productId: 'p1', itemId: 'b1' } as never);
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null as never);

    await tastingsService.update('t1', { itemId: 'b1', rating: 2 });

    expect(prisma.inventoryItem.findFirst).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.tastingNote.update).mock.calls[0]?.[0]?.data).toMatchObject({ rating: 2 });
    expect(vi.mocked(prisma.tastingNote.update).mock.calls[0]?.[0]?.data).not.toHaveProperty('productId');
  });

  it('answers 404 when a tasting is moved to a bottle in the trash', async () => {
    vi.mocked(prisma.tastingNote.findFirst).mockResolvedValue({ id: 't1', productId: 'p1', itemId: 'b1' } as never);
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null as never);

    await expect(tastingsService.update('t1', { itemId: 'b2' })).rejects.toMatchObject({ status: 404, code: 'ITEM_NOT_FOUND' });
  });

  // Review #818: `productKey` keeps a spirit's vintage — named twice, one wine.
  it("keeps a named spirit's vintage, so naming it again finds it", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 'whisky-2010', category: 'spirit', producer: 'Distillerie', name: 'Single Malt', vintage: 2010, format: null },
    ] as never);

    await tastingsService.create('u1', { wine: { category: 'spirit', producer: 'Distillerie', name: 'Single Malt', vintage: 2010 } });

    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(created()).toMatchObject({ productId: 'whisky-2010' });
  });

  it('refuses to move a tasting to a bottle of another wine', async () => {
    vi.mocked(prisma.tastingNote.findFirst).mockResolvedValue({ id: 't1', productId: 'p1' } as never);
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ productId: 'p2' } as never);

    await expect(tastingsService.update('t1', { itemId: 'b9' })).rejects.toMatchObject({ code: 'ITEM_NOT_IN_PRODUCT' });
    expect(prisma.tastingNote.update).not.toHaveBeenCalled();
  });

  it('a tasting elsewhere can be put on a bottle of its own wine', async () => {
    vi.mocked(prisma.tastingNote.findFirst).mockResolvedValue({ id: 't1', productId: 'p1', itemId: null } as never);
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ productId: 'p1' } as never);

    await tastingsService.update('t1', { itemId: 'b1' });

    expect(vi.mocked(prisma.tastingNote.update).mock.calls[0]?.[0]).toMatchObject({ data: { itemId: 'b1', productId: 'p1' } });
  });

  // FEAT-80: the journal and its search count the tastings without a bottle too.
  it('finds a tasting elsewhere by its wine name, and filters by wine', async () => {
    vi.mocked(prisma.tastingNote.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.tastingNote.count).mockResolvedValue(0 as never);

    await tastingsService.list(1, 20, undefined, ' Talbot ', P1);

    const args = vi.mocked(prisma.tastingNote.findMany).mock.calls[0]?.[0];
    expect(args?.where).toMatchObject({ productId: P1 });
    expect((args?.where as { OR: unknown[] }).OR).toEqual(expect.arrayContaining([
      { product: { is: { name: { contains: 'Talbot', mode: 'insensitive' } } } },
      { product: { is: { producer: { contains: 'Talbot', mode: 'insensitive' } } } },
    ]));
    expect(args?.include).toMatchObject({ product: expect.anything(), item: expect.anything() });
  });

  // c1 / FEAT-79: the summary of a bottle is that of its wine, every bottle's tastings.
  it("sums up every tasting of the bottle's wine", async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ productId: 'p1' } as never);
    vi.mocked(prisma.tastingNote.findMany).mockResolvedValue([
      { rating: 4, readiness: 'PEAK', tastedAt: new Date('2026-10-02') },
      { rating: 2, readiness: null, tastedAt: new Date('2026-09-01') },
    ] as never);

    const stats = await tastingsService.itemStats('b1');

    expect(vi.mocked(prisma.tastingNote.findMany).mock.calls[0]?.[0]?.where).toEqual({ productId: 'p1' });
    expect(stats).toMatchObject({ count: 2, avgRating: 3, lastRating: 4 });
  });

  // FEAT-80: analytics by wine, a tasting elsewhere counted.
  it('ranks wines over every tasting of the wine', async () => {
    vi.mocked(prisma.tastingNote.findMany).mockResolvedValue([
      { rating: 5, readiness: null, product: { id: 'p1', name: 'A', producer: 'X' } },
      { rating: 3, readiness: null, product: { id: 'p1', name: 'A', producer: 'X' } },
    ] as never);

    const stats = await tastingsService.analytics();

    expect(vi.mocked(prisma.tastingNote.findMany).mock.calls[0]?.[0]?.where).toEqual({ productId: { not: null } });
    expect(stats.topItems).toEqual([{ id: 'p1', name: 'A', producer: 'X', avgRating: 4, count: 2 }]);
  });
});

// #837: a tasting keeps which bottle it was of, as the bottle was when tasted —
// its cellar (id and name) and its purchase day — not as it is now.
describe('tastingsService — the bottle tasted, as it was (#837)', () => {
  const BOUGHT = new Date('2025-03-12T00:00:00.000Z');
  const created = () => vi.mocked(prisma.tastingNote.create).mock.calls[0]?.[0]?.data as Record<string, unknown>;

  it('writes the cellar and the purchase day of the bottle tasted', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(
      { productId: 'p1', cellarId: 'garage', purchasedAt: BOUGHT, cellar: { name: 'Garage' } } as never,
    );

    await tastingsService.create('u1', { itemId: 'b1', rating: 4 });

    expect(created()).toMatchObject({ itemId: 'b1', cellarId: 'garage', cellarName: 'Garage', purchasedAt: BOUGHT, snapshotAt: expect.any(Date) });
    const select = vi.mocked(prisma.inventoryItem.findFirst).mock.calls[0]?.[0]?.select;
    expect(select).toMatchObject({ cellarId: true, purchasedAt: true, cellar: { select: { name: true } } });
  });

  it('writes a bottle without a cellar nor a purchase day as such', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(
      { productId: 'p1', cellarId: null, purchasedAt: null, cellar: null } as never,
    );

    await tastingsService.create('u1', { itemId: 'b1' });

    // Marked as kept, so it never reads as a tasting noted before #837 (shown from the bottle as it is now).
    expect(created()).toMatchObject({ cellarId: null, cellarName: null, purchasedAt: null, snapshotAt: expect.any(Date) });
  });

  it('writes nothing of a bottle for a wine tasted elsewhere', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue({ id: 'p1' } as never);

    await tastingsService.create('u1', { productId: 'p1' });

    expect(created()).not.toHaveProperty('cellarId');
    expect(created()).not.toHaveProperty('cellarName');
    expect(created()).not.toHaveProperty('purchasedAt');
    expect(created()).not.toHaveProperty('snapshotAt');
  });

  it('takes the new bottle\'s when a tasting is moved to another bottle', async () => {
    vi.mocked(prisma.tastingNote.findFirst).mockResolvedValue({ id: 't1', itemId: 'b1', productId: 'p1' } as never);
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(
      { productId: 'p1', cellarId: 'cuisine', purchasedAt: BOUGHT, cellar: { name: 'Cuisine' } } as never,
    );

    await tastingsService.update('t1', { itemId: 'b2' });

    expect(vi.mocked(prisma.tastingNote.update).mock.calls[0]?.[0]).toMatchObject({
      data: { itemId: 'b2', cellarId: 'cuisine', cellarName: 'Cuisine', purchasedAt: BOUGHT, snapshotAt: expect.any(Date) },
    });
  });

  it('keeps what it wrote on any other edit, its own bottle resent included', async () => {
    vi.mocked(prisma.tastingNote.findFirst).mockResolvedValue({ id: 't1', itemId: 'b1', productId: 'p1' } as never);

    await tastingsService.update('t1', { itemId: 'b1', rating: 3 });

    const data = vi.mocked(prisma.tastingNote.update).mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data).not.toHaveProperty('cellarId');
    expect(data).not.toHaveProperty('cellarName');
    expect(data).not.toHaveProperty('purchasedAt');
    expect(data).not.toHaveProperty('snapshotAt');
  });
});
