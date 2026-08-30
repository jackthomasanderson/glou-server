import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    collection: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    inventoryItem: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { collectionsService } from '../../src/services/collections.service';

beforeEach(() => vi.clearAllMocks());

describe('collectionsService ownership guards', () => {
  it('every mutating method returns null when the collection is not owned by the caller', async () => {
    vi.mocked(prisma.collection.findFirst).mockResolvedValue(null);

    expect(await collectionsService.update('c1', 'u1', { name: 'x' })).toBeNull();
    expect(await collectionsService.delete('c1', 'u1')).toBeNull();
    expect(await collectionsService.addItems('c1', 'u1', ['i1'])).toBeNull();
    expect(await collectionsService.removeItem('c1', 'u1', 'i1')).toBeNull();

    expect(prisma.collection.update).not.toHaveBeenCalled();
    expect(prisma.collection.delete).not.toHaveBeenCalled();
  });
});

describe('collectionsService.addItems', () => {
  it('only connects items that actually exist and are not soft-deleted', async () => {
    vi.mocked(prisma.collection.findFirst).mockResolvedValue({ id: 'c1', userId: 'u1' } as never);
    // Client asked for 3 ids; DB only returns the 2 live ones.
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([{ id: 'i1' }, { id: 'i3' }] as never);
    vi.mocked(prisma.collection.update).mockResolvedValue({ id: 'c1', items: [] } as never);

    await collectionsService.addItems('c1', 'u1', ['i1', 'i2', 'i3']);

    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['i1', 'i2', 'i3'] }, deletedAt: null },
      select: { id: true },
    });
    const updateArg = vi.mocked(prisma.collection.update).mock.calls[0][0] as unknown as {
      data: { items: { connect: { id: string }[] } };
    };
    expect(updateArg.data.items.connect).toEqual([{ id: 'i1' }, { id: 'i3' }]);
  });
});

describe('collectionsService.delete', () => {
  it('detaches items before deleting the row', async () => {
    vi.mocked(prisma.collection.findFirst).mockResolvedValue({ id: 'c1', userId: 'u1' } as never);
    vi.mocked(prisma.collection.update).mockResolvedValue({ id: 'c1' } as never);
    vi.mocked(prisma.collection.delete).mockResolvedValue({ id: 'c1' } as never);

    await collectionsService.delete('c1', 'u1');

    expect(prisma.collection.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { items: { set: [] } },
    });
    expect(prisma.collection.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });
});
