import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    wishlistItem: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../../src/services/inventory.service', () => ({ inventoryService: { createItem: vi.fn() } }));
vi.mock('../../src/services/notification.service', () => ({ notificationService: { send: vi.fn() } }));

import { prisma } from '../../src/lib/prisma';
import { inventoryService } from '../../src/services/inventory.service';
import { convertToInventory } from '../../src/services/wishlist.service';

const wish = (fields: Record<string, unknown> = {}) => ({
  id: 'w1', userId: 'u1', name: 'Talbot', producer: 'Château Talbot', category: 'wine', vintage: 2015,
  targetQuantity: 6, maxPrice: null, lastSeenPrice: 20, status: 'active', ...fields,
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
