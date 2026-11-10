import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    cellar: { findMany: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    guestShare: { findMany: vi.fn(), update: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../../src/lib/prisma';
import { CellarService } from '../../src/services/cellar.service';

beforeEach(() => {
  vi.clearAllMocks();
  // Interactive form of $transaction: the callback runs against the client.
  vi.mocked(prisma.$transaction).mockImplementation(((callback: (tx: unknown) => unknown) => callback(prisma)) as never);
});

// ISSUE_239 + #573: a cellar counts and values what it still holds. A
// finished bottle (opened, nothing left) stays in the inventory for its
// history, but is neither counted in `bottles`/`cigars`, nor valued,
// nor drawn on the map.
describe('CellarService — finished bottles are not in stock (ISSUE_239, #573)', () => {
  /** The in-stock scope, spelled out to pin the SQL shape (lib/finished-item.ts). */
  const IN_STOCK_SCOPE = {
    deletedAt: null,
    writtenOffAt: null,
    // `not: null` keeps an opened bottle with no recorded level in stock.
    NOT: { isOpened: true, fillLevel: { equals: 0, not: null } },
  };

  /** A unit row as the stock query returns it, with its family nested (#471). */
  const unit = (overrides: Record<string, unknown> = {}) => ({
    quantity: 1, isOpened: false, fillLevel: null, cigarsPerBox: null, cigarsLeft: null, writtenOffAt: null,
    purchasePrice: null, estimatedValue: null, cellarId: 'c1', productId: 'p1',
    product: { category: 'wine', reminderDate: null }, ...overrides,
  });

  it('listCellars reads the units in stock of every cellar in one query', async () => {
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([
      { id: 'c1', name: 'Cave A', type: 'VINTAGE' },
      { id: 'c2', name: 'Cave B', type: 'VINTAGE' },
    ] as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      unit({ quantity: 5, estimatedValue: 60 }),
    ] as never);

    const [caveA, caveB] = await CellarService.listCellars();

    expect(caveA.stats).toEqual({ bottles: 5, cigars: 0, totalItems: 5, estimatedValue: 300, alertCount: 0 });
    // A cellar left with only finished bottles has no unit in stock: it reads
    // as empty, not as missing.
    expect(caveB.stats).toEqual({ bottles: 0, cigars: 0, totalItems: 0, estimatedValue: null, alertCount: 0 });

    expect(prisma.inventoryItem.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
      where: { cellarId: { in: ['c1', 'c2'] }, ...IN_STOCK_SCOPE },
      select: expect.objectContaining({
        quantity: true, cigarsPerBox: true, cigarsLeft: true, purchasePrice: true, estimatedValue: true,
        product: { select: { category: true, reminderDate: true } },
      }),
    });
    expect(prisma.inventoryItem.groupBy).not.toHaveBeenCalled();
  });

  it('getCellar applies the same in-stock scope to the single-cellar figures', async () => {
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue({ id: 'c1', name: 'Cave A' } as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([unit({ estimatedValue: 12 })] as never);

    const cellar = await CellarService.getCellar('c1');

    expect(cellar?.stats).toEqual({ bottles: 1, cigars: 0, totalItems: 1, estimatedValue: 12, alertCount: 0 });
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
      where: { cellarId: 'c1', ...IN_STOCK_SCOPE },
      select: expect.any(Object),
    });
  });

  it('getGridData only places the bottles still in stock on the map, each copy in its cell (FEAT-93)', async () => {
    const cave = { id: 'c1', name: 'Cave A' };
    const state = { fillLevel: null, cigarsPerBox: null, cigarsLeft: null, writtenOffAt: null, purchasePrice: null, purchasedAt: null };
    const cell = (id: string, column: number) => ({ id, column, row: 1 });
    const placed = [
      { id: 'a', productId: 'p1', product: { name: 'Chambertin' }, slots: [cell('s1', 1), cell('s4', 4)], quantity: 4, isOpened: false, ...state },
      { id: 'b', productId: 'p2', product: { name: 'Musigny' }, slots: [cell('s2', 2)], quantity: null, isOpened: false, ...state },
      { id: 'c', productId: 'p3', product: { name: 'Opened' }, slots: [cell('s3', 3)], quantity: 1, isOpened: true, ...state, fillLevel: 60 },
    ];
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue(cave as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue(placed as never);

    const grid = await CellarService.getGridData('c1');

    // A group x4 in 2 cells has 2 copies unplaced; an empty quantity is one bottle.
    // #471 (lot Z): the description is read on the family, served flat as before.
    const line = { cigarsPerBox: null, cigarsLeft: null, purchasePrice: null, purchasedAt: null };
    expect(grid).toEqual({
      cellar: cave,
      items: [
        { id: 'a', productId: 'p1', name: 'Chambertin', slots: [cell('s1', 1), cell('s4', 4)], unplaced: 2, quantity: 4, units: 4, isOpened: false, ...line },
        { id: 'b', productId: 'p2', name: 'Musigny', slots: [cell('s2', 2)], unplaced: 0, quantity: 1, units: 1, isOpened: false, ...line },
        { id: 'c', productId: 'p3', name: 'Opened', slots: [cell('s3', 3)], unplaced: 0, quantity: 1, units: 1, isOpened: true, ...line },
      ],
    });
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
      where: { cellarId: 'c1', ...IN_STOCK_SCOPE },
      select: expect.objectContaining({
        product: { select: { name: true, producer: true, category: true, color: true, vintage: true } },
        // Live cells only, by row then column.
        slots: { where: { deletedAt: null }, select: { id: true, column: true, row: true }, orderBy: [{ row: 'asc' }, { column: 'asc' }] },
      }),
      orderBy: { createdAt: 'asc' },
    });
  });

  // Recette #471 (KO 13.2): a box of 25 on a slot says its cigars, and a closed box reads apart from an opened one.
  it('getGridData tells the cigars of a box and what tells two lines of the same cigar apart', async () => {
    const state = { fillLevel: null, cigarsLeft: null, writtenOffAt: null, purchasePrice: 200, purchasedAt: new Date('2026-11-03T00:00:00Z') };
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue({ id: 'c1' } as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      { id: 'closed', product: { name: 'Robusto', category: 'cigar' }, slots: [{ id: 's1', column: 1, row: 1 }], quantity: 1, isOpened: false, cigarsPerBox: 25, ...state },
      { id: 'opened', product: { name: 'Robusto', category: 'cigar' }, slots: [], quantity: 1, isOpened: true, cigarsPerBox: 25, ...state, cigarsLeft: 23 },
      { id: 'singles', product: { name: 'Robusto', category: 'cigar' }, slots: [], quantity: 6, isOpened: false, cigarsPerBox: null, ...state },
    ] as never);

    const grid = await CellarService.getGridData('c1');

    expect(grid?.items).toEqual([
      expect.objectContaining({ id: 'closed', quantity: 1, units: 25, isOpened: false, cigarsPerBox: 25, cigarsLeft: null, purchasePrice: 200, purchasedAt: '2026-11-03' }),
      expect.objectContaining({ id: 'opened', quantity: 1, units: 23, isOpened: true, cigarsPerBox: 25, cigarsLeft: 23, unplaced: 1 }),
      // FEAT-93: a group of single cigars takes one cell for the group.
      expect.objectContaining({ id: 'singles', quantity: 6, units: 6, unplaced: 1 }),
    ]);
  });
});

// #471 (FEAT-96): a cellar counts bottles and cigars, not rows, and values them
// with the analytics' rule (#594: estimated value, else purchase price).
describe('CellarService — bottles, cigars and value (#471, FEAT-96, #594)', () => {
  const unit = (overrides: Record<string, unknown> = {}) => ({
    quantity: 1, isOpened: false, fillLevel: null, cigarsPerBox: null, cigarsLeft: null, writtenOffAt: null,
    purchasePrice: null, estimatedValue: null, cellarId: 'c1', productId: 'p1',
    product: { category: 'wine', reminderDate: null }, ...overrides,
  });

  it('shows 9 bottles worth 215 € for a ×6 at 20 €, a ×2 bought 30 € estimated 40 €, and an opened bottle at 15 € (FEAT-96 c1)', async () => {
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue({ id: 'c1', name: 'Garage' } as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      unit({ quantity: 6, purchasePrice: 20 }),
      unit({ quantity: 2, purchasePrice: 30, estimatedValue: 40 }),
      unit({ isOpened: true, fillLevel: 60, purchasePrice: 15 }),
    ] as never);

    const cellar = await CellarService.getCellar('c1');

    expect(cellar?.stats).toMatchObject({ bottles: 9, totalItems: 9, estimatedValue: 215 });
  });

  it('counts bottles and cigars apart (24 bottles · 50 cigars)', async () => {
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue({ id: 'c1', name: 'Cave' } as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      unit({ quantity: 24 }),
      unit({ quantity: 2, cigarsPerBox: 25, product: { category: 'cigar', reminderDate: null } }),
    ] as never);

    const cellar = await CellarService.getCellar('c1');

    expect(cellar?.stats).toMatchObject({ bottles: 24, cigars: 50, totalItems: 74 });
  });

  it('counts one reminder per wine (family) due by today, not one per unit', async () => {
    const due = new Date(Date.now() - 86_400_000);
    const later = new Date(Date.now() + 30 * 86_400_000);
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue({ id: 'c1', name: 'Cave' } as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      // One wine in three groups, its reminder due: one reminder.
      unit({ productId: 'p1', quantity: 4, product: { category: 'wine', reminderDate: due } }),
      unit({ productId: 'p1', quantity: 2, product: { category: 'wine', reminderDate: due } }),
      unit({ productId: 'p1', isOpened: true, product: { category: 'wine', reminderDate: due } }),
      // Another wine, reminder later this month: none.
      unit({ productId: 'p2', product: { category: 'wine', reminderDate: later } }),
    ] as never);

    const cellar = await CellarService.getCellar('c1');

    expect(cellar?.stats.alertCount).toBe(1);
  });
});

// #597: a deleted cellar leaves the guest shares that listed it. A share left
// with nothing in scope would show the whole inventory (an empty scope means
// "no filter"), so it is revoked instead.
describe('CellarService.deleteCellar — guest shares (#597)', () => {
  beforeEach(() => {
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue({ id: 'c1', name: 'Garage' } as never);
    vi.mocked(prisma.cellar.delete).mockResolvedValue({ id: 'c1', name: 'Garage' } as never);
  });

  it('removes the cellar from the read and write lists of every share that holds it', async () => {
    vi.mocked(prisma.guestShare.findMany).mockResolvedValue([
      { id: 's1', cellarIds: ['c1', 'c2'], writeCellarIds: ['c1'], collectionIds: [], revokedAt: null },
    ] as never);

    await CellarService.deleteCellar('c1');

    expect(prisma.guestShare.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ cellarIds: { has: 'c1' } }, { writeCellarIds: { has: 'c1' } }] },
    }));
    expect(prisma.guestShare.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { cellarIds: ['c2'], writeCellarIds: [] },
    });
    expect(prisma.cellar.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('revokes a share that had nothing else in scope, and keeps one that still has a collection', async () => {
    vi.mocked(prisma.guestShare.findMany).mockResolvedValue([
      { id: 'only', cellarIds: ['c1'], writeCellarIds: ['c1'], collectionIds: [], revokedAt: null },
      { id: 'withCollection', cellarIds: ['c1'], writeCellarIds: [], collectionIds: ['col1'], revokedAt: null },
    ] as never);

    await CellarService.deleteCellar('c1');

    expect(prisma.guestShare.update).toHaveBeenCalledWith({
      where: { id: 'only' },
      data: { cellarIds: [], writeCellarIds: [], revokedAt: expect.any(Date) },
    });
    expect(prisma.guestShare.update).toHaveBeenCalledWith({
      where: { id: 'withCollection' },
      data: { cellarIds: [], writeCellarIds: [] },
    });
  });

  it('keeps the first revocation date of a share already revoked', async () => {
    vi.mocked(prisma.guestShare.findMany).mockResolvedValue([
      { id: 'old', cellarIds: ['c1'], writeCellarIds: [], collectionIds: [], revokedAt: new Date('2026-01-01') },
    ] as never);

    await CellarService.deleteCellar('c1');

    expect(prisma.guestShare.update).toHaveBeenCalledWith({
      where: { id: 'old' },
      data: { cellarIds: [], writeCellarIds: [] },
    });
  });

  it('touches no share and deletes nothing for an unknown cellar', async () => {
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue(null);

    expect(await CellarService.deleteCellar('nope')).toBeNull();
    expect(prisma.guestShare.update).not.toHaveBeenCalled();
    expect(prisma.cellar.delete).not.toHaveBeenCalled();
  });
});
