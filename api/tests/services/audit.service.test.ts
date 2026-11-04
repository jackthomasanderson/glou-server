import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    user: { findMany: vi.fn() },
    inventoryItem: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { auditLog, purgeOldAuditLogs, readFieldHistory } from '../../src/services/audit.service';

beforeEach(() => vi.clearAllMocks());

describe('auditLog', () => {
  it('writes the entry, defaulting bottleId and details', async () => {
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    await auditLog({ userId: 'u1', action: 'LOGIN', status: 'success', ip: '1.2.3.4' });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        action: 'LOGIN',
        status: 'success',
        ip: '1.2.3.4',
        bottleId: null,
        productId: null,
        details: {},
      },
    });
  });

  it('passes through bottleId and details when given, with the family of the unit (#471)', async () => {
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.inventoryItem.findUnique).mockResolvedValue({ productId: 'p1' } as never);

    await auditLog({
      userId: 'u1',
      action: 'DELETE',
      status: 'success',
      ip: '1.2.3.4',
      bottleId: 'b1',
      details: { reason: 'manual' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        action: 'DELETE',
        status: 'success',
        ip: '1.2.3.4',
        bottleId: 'b1',
        productId: 'p1',
        details: { reason: 'manual' },
      },
    });
  });

  it('takes the family given by the caller without looking it up (#471)', async () => {
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    await auditLog({ userId: 'u1', action: 'UPDATE', status: 'success', ip: '1.2.3.4', bottleId: 'b1', productId: 'p9' });

    expect(prisma.inventoryItem.findUnique).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.auditLog.create).mock.calls[0]?.[0]).toMatchObject({ data: { bottleId: 'b1', productId: 'p9' } });
  });

  it('leaves the family empty for a unit that no longer exists', async () => {
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.inventoryItem.findUnique).mockResolvedValue(null);

    await auditLog({ userId: 'u1', action: 'UPDATE', status: 'not_found', ip: '1.2.3.4', bottleId: 'gone' });

    expect(vi.mocked(prisma.auditLog.create).mock.calls[0]?.[0]).toMatchObject({ data: { bottleId: 'gone', productId: null } });
  });

  it('never throws when the write fails — must not block the request lifecycle', async () => {
    vi.mocked(prisma.auditLog.create).mockRejectedValue(new Error('db down'));

    await expect(
      auditLog({ userId: 'u1', action: 'LOGIN', status: 'error', ip: '1.2.3.4' }),
    ).resolves.toBeUndefined();
  });
});

describe('purgeOldAuditLogs', () => {
  it('deletes rows older than the default 90-day cutoff', async () => {
    vi.mocked(prisma.auditLog.deleteMany).mockResolvedValue({ count: 3 } as never);
    const before = Date.now();

    const count = await purgeOldAuditLogs();

    expect(count).toBe(3);
    const call = vi.mocked(prisma.auditLog.deleteMany).mock.calls[0]?.[0] as {
      where: { createdAt: { lt: Date } };
    };
    const cutoffMs = call.where.createdAt.lt.getTime();
    // Cutoff is ~90 days before "now" — assert it lands within a tight window
    // of the expected value instead of a brittle exact-millisecond match.
    const expected = before - 90 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoffMs - expected)).toBeLessThan(5000);
  });

  it('honours a custom retention window and transaction client', async () => {
    const txClient = { auditLog: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) } } as never;

    const count = await purgeOldAuditLogs(30, txClient as never);

    expect(count).toBe(1);
    expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
  });
});

describe('readFieldHistory', () => {
  const row = (details: Record<string, unknown>) => ({
    id: 1, action: 'UPDATE', status: 'success', userId: 'u1', bottleId: 'b1', productId: 'p1', details, createdAt: new Date('2026-10-30T10:00:00Z'),
  });

  it('tells an entry moved from a line since absorbed (#471), and only that one', async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      row({ changes: [{ field: 'purchasePrice', from: 20, to: 25 }], absorbedFrom: 'b2' }),
      row({ changes: [{ field: 'purchasePrice', from: 18, to: 20 }] }),
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', displayName: 'Marie', username: 'marie' }] as never);

    const [moved, own] = await readFieldHistory({ productId: 'p1' });

    expect(moved).toMatchObject({ itemId: 'b1', absorbed: true, actorName: 'Marie' });
    expect(own).not.toHaveProperty('absorbed');
  });

  // Recette #471: "1 bouteille ouverte · Annuler" leaves nothing in the drawer's history.
  describe('an action taken back at once leaves nothing (recette #471)', () => {
    const at = (seconds: number) => new Date(Date.UTC(2026, 10, 4, 10, 0, seconds));
    const log = (id: number, seconds: number, bottleId: string, details: Record<string, unknown>, userId = 'u1') => ({
      id, action: 'UPDATE', status: 'success', userId, bottleId, productId: 'p1', details, createdAt: at(seconds),
    });
    // Opened out of the group g (6 → 5) as the sub-record s, then put back (5 → 6): most recent first,
    // the opening's own entry moved onto g when s was absorbed.
    const openedThenPutBack = (backAfter: number, backBy = 'u1', extra: Record<string, unknown> = {}) => [
      log(4, backAfter, 'g', { changes: [{ field: 'quantity', from: 5, to: 6 }], outcome: 'reattached', subItemId: 's' }, backBy),
      log(3, backAfter, 'g', { changes: [{ field: 'isOpened', from: true, to: false }], outcome: 'reattached', targetItemId: 's', ...extra }, backBy),
      log(2, 0, 'g', { changes: [{ field: 'quantity', from: 6, to: 5 }], outcome: 'detached', subItemId: 's' }),
      log(1, 0, 'g', {
        changes: [{ field: 'isOpened', from: false, to: true }, { field: 'fillLevel', from: null, to: 100 }],
        outcome: 'detached', targetItemId: 'g', absorbedFrom: 's',
      }),
    ];
    const read = async (rows: unknown[]) => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue(rows as never);
      vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', displayName: 'Marie', username: 'marie' }] as never);
      return (await readFieldHistory({ productId: 'p1' })).map((entry) => entry.id);
    };

    it('an opening put back within the minute: none of its four entries', async () => {
      expect(await read([log(9, 120, 'g', { changes: [{ field: 'location', from: null, to: 'Haut' }] }), ...openedThenPutBack(5)])).toEqual([9]);
    });

    it('a bottle put back later, by someone else, or with its tasting deleted is told', async () => {
      expect(await read(openedThenPutBack(600))).toEqual([4, 3, 2, 1]);
      expect(await read(openedThenPutBack(5, 'u2'))).toEqual([4, 3, 2, 1]);
      expect(await read(openedThenPutBack(5, 'u1', { deletedTastings: 1 }))).toEqual([4, 3, 2, 1]);
    });

    // An in-place write is logged without `outcome` (only a detach or a reattach carries one).
    it('a lone bottle drunk in place then taken back: both entries go, its slot given back included', async () => {
      expect(await read([
        log(2, 4, 'b', { changes: [{ field: 'isOpened', from: true, to: false }, { field: 'fillLevel', from: 0, to: 100 }, { field: 'slotColumn', from: null, to: 2 }], outcome: 'regrouped', targetItemId: 'b' }),
        log(1, 0, 'b', { changes: [{ field: 'isOpened', from: false, to: true }, { field: 'fillLevel', from: null, to: 0 }, { field: 'slotColumn', from: 2, to: null }] }),
      ])).toEqual([]);
    });

    it('two writes that do not cancel out are both told', async () => {
      expect(await read([
        log(2, 4, 'b', { changes: [{ field: 'fillLevel', from: 50, to: 30 }] }),
        log(1, 0, 'b', { changes: [{ field: 'fillLevel', from: 100, to: 50 }] }),
      ])).toEqual([2, 1]);
    });
  });
});
