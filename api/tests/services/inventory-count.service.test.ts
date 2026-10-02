import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    inventoryCountSession: { findUnique: vi.fn() },
    inventoryItem: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../../src/lib/prisma';
import { applyCorrections } from '../../src/services/inventory-count.service';

/**
 * Runs `$transaction` callbacks against a fake transaction client so the
 * correction loop can be exercised without a database.
 */
function mockTransactionClient(itemRow: Record<string, unknown> | null) {
  const findFirst = vi.fn().mockResolvedValue(itemRow as never);
  const update = vi.fn().mockResolvedValue({} as never);
  vi.mocked(prisma.$transaction).mockImplementation(
    ((callback: (tx: unknown) => unknown) =>
      callback({ inventoryItem: { findFirst, update } })) as never,
  );
  return { findFirst, update };
}

beforeEach(() => vi.clearAllMocks());

describe('applyCorrections', () => {
  it('returns not_found for an unknown session', async () => {
    vi.mocked(prisma.inventoryCountSession.findUnique).mockResolvedValue(null);

    const result = await applyCorrections('missing', [], 'u1');

    expect(result).toEqual({ status: 'not_found' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ISSUE_034: `mark_consumed` used to be skipped with reason 'fields_locked'
  // whenever fillLevel/isOpened had once been set by hand — the very fields a
  // previous slider tweak locks. The bottle then came back as "missing" at
  // every subsequent count, forever and without any visible error.
  it('marks a bottle as consumed even when fillLevel/isOpened are locked', async () => {
    vi.mocked(prisma.inventoryCountSession.findUnique).mockResolvedValue({
      id: 's1',
      cellarId: 'c1',
    } as never);
    const tx = mockTransactionClient({
      id: 'b1',
      deletedAt: null,
      lockedFields: ['fillLevel', 'isOpened'],
    });

    const result = await applyCorrections('s1', [{ itemId: 'b1', action: 'mark_consumed' }], 'u1');

    expect(result).toEqual({ status: 'success', appliedCount: 1, skipped: [] });
    expect(tx.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: expect.objectContaining({ isOpened: true, fillLevel: 0, updatedBy: 'u1' }),
    });
  });

  it('moves a bottle into the session scope even when cellarId is locked', async () => {
    vi.mocked(prisma.inventoryCountSession.findUnique).mockResolvedValue({
      id: 's1',
      cellarId: 'c1',
    } as never);
    const tx = mockTransactionClient({ id: 'b1', deletedAt: null, lockedFields: ['cellarId'] });

    const result = await applyCorrections('s1', [{ itemId: 'b1', action: 'move_to_scope' }], 'u1');

    expect(result).toEqual({ status: 'success', appliedCount: 1, skipped: [] });
    expect(tx.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: expect.objectContaining({ cellarId: 'c1', updatedBy: 'u1' }),
    });
  });

  it('still skips a correction whose item no longer exists', async () => {
    vi.mocked(prisma.inventoryCountSession.findUnique).mockResolvedValue({
      id: 's1',
      cellarId: 'c1',
    } as never);
    const tx = mockTransactionClient(null);

    const result = await applyCorrections('s1', [{ itemId: 'gone', action: 'mark_consumed' }], 'u1');

    expect(result).toEqual({
      status: 'success',
      appliedCount: 0,
      skipped: [{ targetId: 'gone', action: 'mark_consumed', reason: 'item_not_found' }],
    });
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('still skips move_to_scope when the session has no cellar', async () => {
    vi.mocked(prisma.inventoryCountSession.findUnique).mockResolvedValue({
      id: 's1',
      cellarId: null,
    } as never);
    const tx = mockTransactionClient({ id: 'b1', deletedAt: null, lockedFields: [] });

    const result = await applyCorrections('s1', [{ itemId: 'b1', action: 'move_to_scope' }], 'u1');

    expect(result).toEqual({
      status: 'success',
      appliedCount: 0,
      skipped: [{ targetId: 'b1', action: 'move_to_scope', reason: 'session_has_no_cellar' }],
    });
    expect(tx.update).not.toHaveBeenCalled();
  });
});
