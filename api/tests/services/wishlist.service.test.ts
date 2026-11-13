import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    wishlistItem: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../../src/services/inventory.service', () => ({ inventoryService: { createItem: vi.fn() } }));
vi.mock('../../src/services/notification.service', () => ({ notificationService: { send: vi.fn() } }));
vi.mock('../../src/services/stock.service', () => ({ addUnitsIn: vi.fn(), lockedListedFamily: vi.fn() }));
vi.mock('../../src/services/review.service', () => ({ rememberDistinct: vi.fn() }));

import { prisma } from '../../src/lib/prisma';
import { inventoryService } from '../../src/services/inventory.service';
import { convertToInventory, recordPriceSeen } from '../../src/services/wishlist.service';
import { notificationService } from '../../src/services/notification.service';
import { addUnitsIn, lockedListedFamily } from '../../src/services/stock.service';
import { rememberDistinct } from '../../src/services/review.service';

/** The family « Talbot 2015 » of Château Talbot, as Prisma returns it (the key fields only). */
const talbot = (fields: Record<string, unknown> = {}) => ({
  id: 'p1', category: 'wine', name: 'Talbot', producer: 'Château Talbot', vintage: 2015, format: null, ...fields,
});

const wish = (fields: Record<string, unknown> = {}) => ({
  id: 'w1', userId: 'u1', name: 'Talbot', producer: 'Château Talbot', category: 'wine', vintage: 2015,
  targetQuantity: 6, maxPrice: null, lastSeenPrice: 20, status: 'active', ...fields,
});

// #468: the observed price is typed by the member themselves (no price feed
// exists), so a price under the ceiling is shown in the list, never sent back
// to them as an e-mail or Gotify alert.
describe('recordPriceSeen', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records a price under the ceiling without sending any notification', async () => {
    vi.mocked(prisma.wishlistItem.findFirst).mockResolvedValue(wish({ maxPrice: 50, lastSeenPrice: null }) as never);
    vi.mocked(prisma.wishlistItem.update).mockResolvedValue(wish({ maxPrice: 50, lastSeenPrice: 42 }) as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ language: 'EN', notifLanguage: null } as never);
    const item = await recordPriceSeen('u1', 'w1', 42);
    await new Promise((resolve) => setImmediate(resolve));
    expect(item).toMatchObject({ lastSeenPrice: 42 });
    expect(prisma.wishlistItem.update).toHaveBeenCalledWith({ where: { id: 'w1' }, data: { lastSeenPrice: 42, lastSeenAt: expect.any(Date) } });
    expect(notificationService.send).not.toHaveBeenCalled();
  });
});

// #471 (FEAT-92, decision point 15, lot E1): a wish turned into stock is one
// group of the number of bottles wished for.
describe('convertToInventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(((callback: (tx: unknown) => unknown) => callback(prisma)) as never);
    vi.mocked(prisma.wishlistItem.findFirst).mockResolvedValue(wish() as never);
    vi.mocked(prisma.wishlistItem.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.wishlistItem.update).mockResolvedValue(wish({ status: 'acquired' }) as never);
    vi.mocked(inventoryService.createItem).mockResolvedValue({ id: 'i1', productId: 'p1' } as never);
  });

  it.each(['wine', 'sparkling', 'spirit'])('creates one %s group of the number of bottles wished for', async (category) => {
    vi.mocked(prisma.wishlistItem.findFirst).mockResolvedValue(wish({ category }) as never);

    await convertToInventory('u1', 'w1', {});

    expect(inventoryService.createItem).toHaveBeenCalledWith(
      'u1', expect.objectContaining({ category, quantity: 6, name: 'Talbot', purchasePrice: 20 }), prisma,
    );
  });

  // #587: a wish records no ABV — the spirit's stays unknown, never an invented 0 %.
  it('converts a spirit without inventing its ABV', async () => {
    vi.mocked(prisma.wishlistItem.findFirst).mockResolvedValue(wish({ category: 'spirit', vintage: null }) as never);

    await convertToInventory('u1', 'w1', {});

    const input = vi.mocked(inventoryService.createItem).mock.calls[0][1];
    expect(input).toMatchObject({ category: 'spirit' });
    expect(input).not.toHaveProperty('alcoholDegree');
  });

  it('stores the ABV typed at the conversion of a spirit (#587)', async () => {
    vi.mocked(prisma.wishlistItem.findFirst).mockResolvedValue(wish({ category: 'spirit', vintage: null }) as never);

    await convertToInventory('u1', 'w1', { alcoholDegree: 46.3 });

    expect(inventoryService.createItem).toHaveBeenCalledWith('u1', expect.objectContaining({ category: 'spirit', alcoholDegree: 46.3 }), prisma);
  });

  it('never gives an ABV to a wine converted (#587)', async () => {
    await convertToInventory('u1', 'w1', { alcoholDegree: 13 });

    expect(vi.mocked(inventoryService.createItem).mock.calls[0][1]).not.toHaveProperty('alcoholDegree');
  });

  it('takes the number given at the conversion over the one wished for', async () => {
    await convertToInventory('u1', 'w1', { quantity: 4 });

    expect(inventoryService.createItem).toHaveBeenCalledWith('u1', expect.objectContaining({ quantity: 4 }), prisma);
  });

  it('claims the wish in the transaction before creating the bottles, and links them to it', async () => {
    const result = await convertToInventory('u1', 'w1', {});

    expect(prisma.wishlistItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'w1', userId: 'u1', status: 'active' }, data: { status: 'acquired' },
    });
    expect(vi.mocked(prisma.wishlistItem.updateMany).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(inventoryService.createItem).mock.invocationCallOrder[0]);
    expect(prisma.wishlistItem.update).toHaveBeenCalledWith({ where: { id: 'w1' }, data: { acquiredItemId: 'i1' } });
    expect(result?.inventoryItem).toEqual({ id: 'i1', productId: 'p1' });
  });

  it('creates nothing when another conversion of the same wish got there first (double tap)', async () => {
    vi.mocked(prisma.wishlistItem.updateMany).mockResolvedValue({ count: 0 } as never);

    const result = await convertToInventory('u1', 'w1', {});

    expect(result).toBeNull();
    expect(inventoryService.createItem).not.toHaveBeenCalled();
  });

  it('converts nothing for a wish already acquired or unknown', async () => {
    vi.mocked(prisma.wishlistItem.findFirst).mockResolvedValue(wish({ status: 'acquired' }) as never);
    expect(await convertToInventory('u1', 'w1', {})).toBeNull();
    vi.mocked(prisma.wishlistItem.findFirst).mockResolvedValue(null);
    expect(await convertToInventory('u1', 'w1', {})).toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// #471 (FEAT-97 c4): the conversion of a wish answers "Vous avez déjà ce vin" too.
describe('convertToInventory — a wine already known (FEAT-97)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(((callback: (tx: unknown) => unknown) => callback(prisma)) as never);
    vi.mocked(prisma.wishlistItem.findFirst).mockResolvedValue(wish() as never);
    vi.mocked(prisma.wishlistItem.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.wishlistItem.update).mockResolvedValue(wish({ status: 'acquired' }) as never);
    vi.mocked(inventoryService.createItem).mockResolvedValue({ id: 'i2', productId: 'p2' } as never);
    vi.mocked(addUnitsIn).mockResolvedValue({ result: { data: { id: 'g1', productId: 'p1' }, changed: [], removedIds: [] } } as never);
    vi.mocked(lockedListedFamily).mockResolvedValue(talbot() as never);
  });

  it('adds the bottles bought to the known wine, bought today, once the wish is claimed', async () => {
    const result = await convertToInventory('u1', 'w1', { productId: 'p1', quantity: 2, cellarId: 'c1', purchasePrice: 25, bottleSize: '75cl' });

    expect(addUnitsIn).toHaveBeenCalledWith(prisma, 'u1', 'p1', {
      quantity: 2, cellarId: 'c1', purchasePrice: 25, bottleSize: '75cl',
    });
    expect(inventoryService.createItem).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.wishlistItem.updateMany).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(addUnitsIn).mock.invocationCallOrder[0]);
    expect(prisma.wishlistItem.update).toHaveBeenCalledWith({ where: { id: 'w1' }, data: { acquiredItemId: 'g1' } });
    expect(result?.inventoryItem).toEqual({ id: 'g1', productId: 'p1' });
  });

  it('refuses a known wine that is not the wine wished for, before writing anything (review #817)', async () => {
    vi.mocked(lockedListedFamily).mockResolvedValue(talbot({ category: 'cigar', name: 'No. 2', producer: 'Montecristo', vintage: null }) as never);

    await expect(convertToInventory('u1', 'w1', { productId: 'p9' })).rejects.toMatchObject({ status: 400, code: 'NOT_SAME_WINE' });
    expect(addUnitsIn).not.toHaveBeenCalled();
    expect(lockedListedFamily).toHaveBeenCalledWith(prisma, 'p9');
  });

  it('joins a cigar reference whatever its vitola (a wish has none), in boxes of the size given', async () => {
    vi.mocked(prisma.wishlistItem.findFirst).mockResolvedValue(wish({ category: 'cigar', name: 'No. 2', producer: 'Montecristo', vintage: null }) as never);
    vi.mocked(lockedListedFamily).mockResolvedValue(talbot({ category: 'cigar', name: 'no. 2', producer: 'Montecristo', vintage: null, format: 'Robusto' }) as never);

    await convertToInventory('u1', 'w1', { productId: 'p1', quantity: 2, cigarsPerBox: 25, bottleSize: '75cl' });

    expect(addUnitsIn).toHaveBeenCalledWith(prisma, 'u1', 'p1', expect.objectContaining({ quantity: 2, cigarsPerBox: 25 }));
    // A cigar never carries a bottle size.
    expect(vi.mocked(addUnitsIn).mock.calls[0][3]).not.toHaveProperty('bottleSize');
  });

  it('refuses a box size for bottles', async () => {
    await expect(convertToInventory('u1', 'w1', { productId: 'p1', cigarsPerBox: 25 })).rejects.toMatchObject({ status: 400, code: 'CIGARS_PER_BOX_FOR_CIGARS_ONLY' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('takes the number wished for and the price last seen when none is given', async () => {
    await convertToInventory('u1', 'w1', { productId: 'p1' });

    expect(addUnitsIn).toHaveBeenCalledWith(prisma, 'u1', 'p1', expect.objectContaining({ quantity: 6, purchasePrice: 20 }));
  });

  it('"C\'est un autre vin": creates a new wine, remembered apart from the ones named', async () => {
    await convertToInventory('u1', 'w1', { distinctFrom: ['p1'] });

    expect(inventoryService.createItem).toHaveBeenCalled();
    expect(rememberDistinct).toHaveBeenCalledWith(prisma, 'p2', ['p1']);
    expect(addUnitsIn).not.toHaveBeenCalled();
  });
});

describe('convertToInventorySchema (review #803)', () => {
  it('keeps the price of one bottle in cents, as "Ajouter des bouteilles"', async () => {
    const { convertToInventorySchema } = await import('../../src/schemas/wishlist.schema');
    expect(convertToInventorySchema.safeParse({ purchasePrice: 12.35 }).success).toBe(true);
    expect(convertToInventorySchema.safeParse({ purchasePrice: 12.345 }).success).toBe(false);
    expect(convertToInventorySchema.safeParse({ purchasePrice: 10_000_000_000 }).success).toBe(false);
  });

  // FEAT-97: joining a known wine takes only what tells its bottles apart.
  it('refuses a place of purchase or wines told apart with a known wine to join', async () => {
    const { convertToInventorySchema } = await import('../../src/schemas/wishlist.schema');
    expect(convertToInventorySchema.safeParse({ productId: 'p1', quantity: 2 }).success).toBe(true);
    expect(convertToInventorySchema.safeParse({ productId: 'p1', purchasePlace: 'Caviste' }).success).toBe(false);
    expect(convertToInventorySchema.safeParse({ productId: 'p1', distinctFrom: ['p2'] }).success).toBe(false);
    expect(convertToInventorySchema.safeParse({ distinctFrom: ['p2'], purchasePlace: 'Caviste' }).success).toBe(true);
  });

  // #587: a spirit's ABV, optional (empty stays unknown), as the add form bounds it.
  it('takes an optional ABV from 0 to 100, never with a known wine to join', async () => {
    const { convertToInventorySchema } = await import('../../src/schemas/wishlist.schema');
    expect(convertToInventorySchema.safeParse({ alcoholDegree: 46.3 }).success).toBe(true);
    expect(convertToInventorySchema.safeParse({ alcoholDegree: null }).success).toBe(true);
    expect(convertToInventorySchema.safeParse({ alcoholDegree: -1 }).success).toBe(false);
    expect(convertToInventorySchema.safeParse({ alcoholDegree: 101 }).success).toBe(false);
    expect(convertToInventorySchema.safeParse({ productId: 'p1', alcoholDegree: 40 }).success).toBe(false);
  });
});
