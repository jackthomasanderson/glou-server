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
      include: {
        collections: { select: { id: true, name: true, color: true, icon: true } },
      },
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

  // ─── FEAT-16/23: offline sync optimistic concurrency ──────────────────────

  it('updateItem - returns a conflict when expectedUpdatedAt no longer matches the server value', async () => {
    const serverUpdatedAt = new Date('2026-08-01T10:00:00.000Z');
    const existingItem = {
      id: 'b1',
      userId: 'u1',
      lockedFields: [],
      deletedAt: null,
      updatedAt: serverUpdatedAt,
    };
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(existingItem as never);

    const result = await service.updateItem('u1', 'b1', {
      isOpened: true,
      // Stale timestamp: the item was modified server-side after this
      // mutation was queued offline.
      expectedUpdatedAt: '2026-08-01T09:00:00.000Z',
    } as never);

    expect(result).toEqual({ conflict: true, serverItem: existingItem });
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('updateItem - applies the patch when expectedUpdatedAt matches the server value', async () => {
    const serverUpdatedAt = new Date('2026-08-01T10:00:00.000Z');
    const existingItem = {
      id: 'b1',
      userId: 'u1',
      lockedFields: [],
      deletedAt: null,
      updatedAt: serverUpdatedAt,
    };
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(existingItem as never);
    vi.mocked(prisma.inventoryItem.update).mockResolvedValue({ ...existingItem, isOpened: true } as never);

    const result = await service.updateItem('u1', 'b1', {
      isOpened: true,
      expectedUpdatedAt: serverUpdatedAt.toISOString(),
    } as never);

    expect(result && 'conflict' in result).toBe(false);
    const updateCall = vi.mocked(prisma.inventoryItem.update).mock.calls[0];
    const updateData = updateCall?.[0] as { data: Record<string, unknown> };
    // `expectedUpdatedAt` must never leak into the Prisma write payload.
    expect(updateData.data.expectedUpdatedAt).toBeUndefined();
    expect(updateData.data.isOpened).toBe(true);
  });
});
