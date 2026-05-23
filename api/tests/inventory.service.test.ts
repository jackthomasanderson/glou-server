import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InventoryService } from '../src/services/inventory.service';

// Mock Prisma pour tests unitaires sans DB
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from '../src/lib/prisma';

describe('InventoryService', () => {
  let service: InventoryService;

  beforeEach(() => {
    service = new InventoryService();
    vi.clearAllMocks();
  });

  it('daysUntilPermanentDelete - returns 7 for a just-deleted item', () => {
    const deletedAt = new Date();
    const days = service.daysUntilPermanentDelete(deletedAt);
    expect(days).toBe(7);
  });

  it('daysUntilPermanentDelete - returns 0 for an expired deletion', () => {
    const deletedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
    const days = service.daysUntilPermanentDelete(deletedAt);
    expect(days).toBe(0);
  });

  it('daysUntilPermanentDelete - returns ~4 for half-way expired', () => {
    const deletedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    const days = service.daysUntilPermanentDelete(deletedAt);
    expect(days).toBe(4);
  });

  it('listInventory - calls prisma with deletedAt null filter', async () => {
    const mockItems = [{ id: 'b1', userId: 'u1', name: 'Pétrus', deletedAt: null }];
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue(mockItems as never);

    const result = await service.listInventory('u1');

    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual(mockItems);
  });

  it('softDelete - returns null when item not found', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null);

    const result = await service.softDelete('u1', 'unknown-id');
    expect(result).toBeNull();
  });

  it('restore - returns null when item is past retention window', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null);

    const result = await service.restore('u1', 'old-id');
    expect(result).toBeNull();
  });

  it('updateItem - respects lockedFields', async () => {
    const existingItem = {
      id: 'b1',
      userId: 'u1',
      lockedFields: ['name', 'vintage'],
      deletedAt: null,
    };
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(existingItem as never);
    vi.mocked(prisma.inventoryItem.update).mockResolvedValue({ ...existingItem, producer: 'New Producer' } as never);

    await service.updateItem('u1', 'b1', {
      category: 'wine',
      name: 'Should Not Change',  // locked
      producer: 'New Producer',    // not locked → allowed
    });

    const updateCall = vi.mocked(prisma.inventoryItem.update).mock.calls[0];
    expect(updateCall).toBeDefined();
    const updateData = updateCall?.[0] as { data: Record<string, unknown> };
    expect(updateData.data.name).toBeUndefined();
    expect(updateData.data.producer).toBe('New Producer');
  });
});
