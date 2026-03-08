import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BottleService } from '../src/services/bottle.service';

// Mock Prisma pour tests unitaires sans DB
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    bottle: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from '../src/lib/prisma';

describe('BottleService', () => {
  let service: BottleService;

  beforeEach(() => {
    service = new BottleService();
    vi.clearAllMocks();
  });

  it('daysUntilPermanentDelete - returns 7 for a just-deleted bottle', () => {
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

  it('listBottles - calls prisma with userId and deletedAt null filter', async () => {
    const mockBottles = [{ id: 'b1', userId: 'u1', name: 'Pétrus', deletedAt: null }];
    vi.mocked(prisma.bottle.findMany).mockResolvedValue(mockBottles as never);

    const result = await service.listBottles('u1');

    expect(prisma.bottle.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual(mockBottles);
  });

  it('softDelete - returns null when bottle not found', async () => {
    vi.mocked(prisma.bottle.findFirst).mockResolvedValue(null);

    const result = await service.softDelete('u1', 'unknown-id');
    expect(result).toBeNull();
  });

  it('restore - returns null when bottle is past retention window', async () => {
    // findFirst returns null because the cutoff filter excludes it
    vi.mocked(prisma.bottle.findFirst).mockResolvedValue(null);

    const result = await service.restore('u1', 'old-id');
    expect(result).toBeNull();
  });

  it('updateBottle - respects lockedFields', async () => {
    const existingBottle = {
      id: 'b1',
      userId: 'u1',
      lockedFields: ['name', 'vintage'],
      deletedAt: null,
    };
    vi.mocked(prisma.bottle.findFirst).mockResolvedValue(existingBottle as never);
    vi.mocked(prisma.bottle.update).mockResolvedValue({ ...existingBottle, producer: 'New Producer' } as never);

    await service.updateBottle('u1', 'b1', {
      category: 'wine',
      name: 'Should Not Change',  // locked
      producer: 'New Producer',    // not locked → allowed
    });

    // Verify update was called without the locked 'name' field
    const updateCall = vi.mocked(prisma.bottle.update).mock.calls[0];
    expect(updateCall).toBeDefined();
    const updateData = updateCall?.[0] as { data: Record<string, unknown> };
    expect(updateData.data.name).toBeUndefined();
    expect(updateData.data.producer).toBe('New Producer');
  });
});
