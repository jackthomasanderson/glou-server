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
    $transaction: vi.fn(),
  },
}));

const fsUnlink = vi.fn();
const fsReaddir = vi.fn();
vi.mock('fs/promises', () => ({
  default: { unlink: (...a: unknown[]) => fsUnlink(...a), readdir: (...a: unknown[]) => fsReaddir(...a) },
  unlink: (...a: unknown[]) => fsUnlink(...a),
  readdir: (...a: unknown[]) => fsReaddir(...a),
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
      take: 2001,
    });
    // FEAT-86: every row is decorated with a computed `readiness` (null here —
    // the mock items carry no peak-maturity window).
    expect(result.items).toEqual(mockItems.map((i) => ({ ...i, readiness: null })));
    expect(result.truncated).toBe(false);
  });

  // ISSUE_083: a ceiling with a `truncated` flag, not a silent cutoff.
  it('listInventory - flags truncated when more than 2000 items exist', async () => {
    const mockItems = Array.from({ length: 2001 }, (_, i) => ({ id: `b${i}`, userId: 'u1', name: 'X', deletedAt: null }));
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue(mockItems as never);

    const result = await service.listInventory('u1');

    expect(result.items).toHaveLength(2000);
    expect(result.truncated).toBe(true);
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

  describe('restore - grid slot (#174)', () => {
    const trashed = { id: 'b1', cellarId: 'c1', slotColumn: 2, slotRow: 3, deletedAt: new Date() };

    it('restores unplaced when another bottle took the slot meanwhile', async () => {
      vi.mocked(prisma.inventoryItem.findFirst)
        .mockResolvedValueOnce(trashed as never)
        .mockResolvedValueOnce({ id: 'other' } as never);
      vi.mocked(prisma.inventoryItem.update).mockResolvedValue({} as never);

      await service.restore('u1', 'b1');

      expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { deletedAt: null, slotColumn: null, slotRow: null },
      });
    });

    it('keeps the slot when it is still free', async () => {
      vi.mocked(prisma.inventoryItem.findFirst)
        .mockResolvedValueOnce(trashed as never)
        .mockResolvedValueOnce(null);
      vi.mocked(prisma.inventoryItem.update).mockResolvedValue({} as never);

      await service.restore('u1', 'b1');

      expect(prisma.inventoryItem.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { deletedAt: null } });
    });
  });

  it('updateItem - a manual edit overrides lockedFields (manual entry has priority)', async () => {
    const existingItem = {
      id: 'b1',
      userId: 'u1',
      lockedFields: ['name', 'vintage'],
      deletedAt: null,
    };
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(existingItem as never);
    vi.mocked(prisma.inventoryItem.update).mockResolvedValue({ ...existingItem, name: 'New Name', producer: 'New Producer' } as never);

    // Default options → isManualEdit: true, matching the regular PATCH /:id
    // and guest write routes: a locked field must still accept a fresh
    // manual edit (e.g. re-editing quantity, or resetting fillLevel/isOpened
    // back to "full" after it was previously set to "empty").
    await service.updateItem('u1', 'b1', {
      category: 'wine',
      name: 'New Name',
      producer: 'New Producer',
    });

    const updateCall = vi.mocked(prisma.inventoryItem.update).mock.calls[0];
    expect(updateCall).toBeDefined();
    const updateData = updateCall?.[0] as { data: Record<string, unknown> };
    expect(updateData.data.name).toBe('New Name');
    expect(updateData.data.producer).toBe('New Producer');
  });

  it('updateItem - a non-manual (automated) update still respects lockedFields', async () => {
    const existingItem = {
      id: 'b1',
      userId: 'u1',
      lockedFields: ['name', 'vintage'],
      deletedAt: null,
    };
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(existingItem as never);
    vi.mocked(prisma.inventoryItem.update).mockResolvedValue({ ...existingItem, producer: 'New Producer' } as never);

    await service.updateItem(
      'u1',
      'b1',
      {
        category: 'wine',
        name: 'Should Not Change', // locked, and this call isn't manual → stripped
        producer: 'New Producer',   // not locked → allowed
      },
      { isManualEdit: false }
    );

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

  // ─── ISSUE_034: bulk actions must not be neutralised by lockedFields ──────

  /**
   * Wires the mocked `$transaction` to run its callback against a fake
   * transaction client and returns that client's `update` spy.
   */
  function mockTransactionClient() {
    const update = vi.fn().mockResolvedValue({} as never);
    vi.mocked(prisma.$transaction).mockImplementation(
      ((callback: (tx: unknown) => unknown) => callback({ inventoryItem: { update } })) as never,
    );
    return update;
  }

  it('bulkUpdate - applies the patch to locked fields (a bulk action is a user action)', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      {
        id: 'b1',
        lockedFields: ['fillLevel', 'isOpened'],
        isOpened: false,
        fillLevel: 100,
        deletedAt: null,
      },
    ] as never);
    const txUpdate = mockTransactionClient();

    const count = await service.bulkUpdate('u1', ['b1'], { isOpened: true, fillLevel: 0 } as never);

    expect(count).toBe(1);
    expect(txUpdate).toHaveBeenCalledTimes(1);
    const data = (txUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(data.isOpened).toBe(true);
    expect(data.fillLevel).toBe(0);
  });

  it('bulkUpdate - only counts the items it really changed', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      // Already opened and empty → the patch is a no-op for this one.
      { id: 'noop', lockedFields: [], isOpened: true, fillLevel: 0, deletedAt: null },
      { id: 'changed', lockedFields: [], isOpened: false, fillLevel: 80, deletedAt: null },
    ] as never);
    const txUpdate = mockTransactionClient();

    const count = await service.bulkUpdate('u1', ['noop', 'changed'], {
      isOpened: true,
      fillLevel: 0,
    } as never);

    expect(count).toBe(1);
    expect(txUpdate).toHaveBeenCalledTimes(1);
    expect(txUpdate.mock.calls[0]?.[0]).toMatchObject({ where: { id: 'changed' } });
  });

  it('bulkUpdate - returns 0 and writes nothing when no item matches', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    const count = await service.bulkUpdate('u1', ['unknown'], { isOpened: true } as never);

    expect(count).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ISSUE_141/ISSUE_068: port of web/lib/inventory/duplicate.ts's isDuplicateOf,
  // applied server-side — the one check that previously existed only in the browser.
  describe('findDuplicateCandidate', () => {
    it('matches case-insensitively on producer + name + vintage for wine', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        { id: 'existing', producer: 'Château Pétrus', name: 'pétrus', vintage: 2015, bottleSize: '75cl' },
      ] as never);

      const result = await service.findDuplicateCandidate({
        category: 'wine', producer: 'château pétrus', name: 'PÉTRUS', vintage: 2015, bottleSize: '75cl',
      } as never);

      expect(result).toMatchObject({ id: 'existing' });
    });

    it('does not match a different vintage', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        { id: 'existing', producer: 'Château Pétrus', name: 'Pétrus', vintage: 2010, bottleSize: '75cl' },
      ] as never);

      const result = await service.findDuplicateCandidate({
        category: 'wine', producer: 'Château Pétrus', name: 'Pétrus', vintage: 2015, bottleSize: '75cl',
      } as never);

      expect(result).toBeNull();
    });

    it('treats a missing vintage on either side as a potential match', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        { id: 'existing', producer: 'Château Pétrus', name: 'Pétrus', vintage: null, bottleSize: '75cl' },
      ] as never);

      const result = await service.findDuplicateCandidate({
        category: 'wine', producer: 'Château Pétrus', name: 'Pétrus', vintage: 2015, bottleSize: '75cl',
      } as never);

      expect(result).toMatchObject({ id: 'existing' });
    });

    it('compares format (not vintage) for cigars', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        { id: 'existing', producer: 'Romeo y Julieta', name: 'Churchill', format: 'Churchill' },
      ] as never);

      const matching = await service.findDuplicateCandidate({
        category: 'cigar', producer: 'Romeo y Julieta', name: 'Churchill', format: 'Churchill',
      } as never);
      const nonMatching = await service.findDuplicateCandidate({
        category: 'cigar', producer: 'Romeo y Julieta', name: 'Churchill', format: 'Robusto',
      } as never);

      expect(matching).toMatchObject({ id: 'existing' });
      expect(nonMatching).toBeNull();
    });

    it('returns null without querying when producer or name is missing', async () => {
      const result = await service.findDuplicateCandidate({ category: 'wine' } as never);
      expect(result).toBeNull();
      expect(prisma.inventoryItem.findMany).not.toHaveBeenCalled();
    });
  });

  // ISSUE_096: a purged item's local photo must be deleted from disk too —
  // only when it's actually local (uploads/products/*), never an external URL.
  describe('purgeTrashed', () => {
    it('only returns the local photo paths among the purged items', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        { id: 'a', photoUrl: '/uploads/products/a.jpg' },
        { id: 'b', photoUrl: 'https://example.com/b.jpg' },
        { id: 'c', photoUrl: null },
      ] as never);
      vi.mocked(prisma.inventoryItem.deleteMany).mockResolvedValue({ count: 3 } as never);

      const result = await service.purgeTrashed();

      expect(result).toEqual({ count: 3, photoPaths: ['/uploads/products/a.jpg'] });
      expect(prisma.inventoryItem.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b', 'c'] } } });
    });

    it('does nothing when nothing is past the retention window', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

      const result = await service.purgeTrashed();

      expect(result).toEqual({ count: 0, photoPaths: [] });
      expect(prisma.inventoryItem.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('deletePhotoFiles', () => {
    beforeEach(() => fsUnlink.mockReset());

    it('deletes every given path and ignores a file already gone', async () => {
      fsUnlink.mockResolvedValueOnce(undefined).mockRejectedValueOnce(
        Object.assign(new Error('gone'), { code: 'ENOENT' }),
      );

      await service.deletePhotoFiles(['/uploads/products/a.jpg', '/uploads/products/b.jpg']);

      expect(fsUnlink).toHaveBeenCalledTimes(2);
    });
  });

  describe('sweepOrphanProductPhotos', () => {
    beforeEach(() => {
      fsReaddir.mockReset();
      fsUnlink.mockReset().mockResolvedValue(undefined);
    });

    it('deletes a file on disk that no item references any more', async () => {
      fsReaddir.mockResolvedValue(['referenced.jpg', 'orphan.jpg']);
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        { photoUrl: '/uploads/products/referenced.jpg' },
      ] as never);

      const count = await service.sweepOrphanProductPhotos();

      expect(count).toBe(1);
      expect(fsUnlink).toHaveBeenCalledTimes(1);
      expect(fsUnlink.mock.calls[0][0]).toContain('orphan.jpg');
    });

    it('returns 0 without touching the database when the upload dir does not exist', async () => {
      fsReaddir.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

      const count = await service.sweepOrphanProductPhotos();

      expect(count).toBe(0);
      expect(prisma.inventoryItem.findMany).not.toHaveBeenCalled();
    });
  });
});
