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

  it('keeps the business history of bottles and wines, whatever the retention (#588)', async () => {
    vi.mocked(prisma.auditLog.deleteMany).mockResolvedValue({ count: 0 } as never);

    await purgeOldAuditLogs(1);

    const { where } = vi.mocked(prisma.auditLog.deleteMany).mock.calls[0]![0] as {
      where: { createdAt: unknown; NOT: { status: string; action: { in: string[] }; OR: unknown[] } };
    };
    expect(where.NOT.status).toBe('success');
    expect(where.NOT.OR).toEqual([{ bottleId: { not: null } }, { productId: { not: null } }]);
    // Decision of 2026-11-12: field edits, restores and guest moves, and the
    // per-line entries of bulk actions (moves, trash) — every action the
    // drawer's history reads.
    expect(where.NOT.action.in).toEqual(expect.arrayContaining([
      'CREATE', 'UPDATE', 'RESTORE', 'RESTORE_FIELD', 'GUEST_UPDATE', 'MOVE_UNITS', 'DELETE',
    ]));
    // A sign-in or an admin action is a security trace: still purged.
    expect(where.NOT.action.in).not.toContain('LOGIN');
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
      // The opening itself is one entry (its group's "6 → 5" folded into it, recette #847).
      expect(await read(openedThenPutBack(600))).toEqual([4, 3, 1]);
      expect(await read(openedThenPutBack(5, 'u2'))).toEqual([4, 3, 1]);
      expect(await read(openedThenPutBack(5, 'u1', { deletedTastings: 1 }))).toEqual([4, 3, 1]);
    });

    // Review of #830: an entry of someone else on that bottle meanwhile (a
    // member, or a guest — logged with the owner's userId) is never hidden.
    it('another member or a guest wrote on that bottle meanwhile: everything is told', async () => {
      const levelBy = (userId: string, action = 'UPDATE', details: Record<string, unknown> = {}) => ({
        ...log(7, 3, 's', { changes: [{ field: 'fillLevel', from: 100, to: 80 }], ...details }, userId), action,
      });
      const [back4, back3, open2, open1] = openedThenPutBack(5);
      expect(await read([back4, back3, levelBy('u2'), open2, open1])).toEqual([4, 3, 7, 1]);
      expect(await read([back4, back3, levelBy('u1', 'GUEST_UPDATE', { via: 'guest_share', shareId: 'sh1' }), open2, open1]))
        .toEqual([4, 3, 7, 1]);
    });

    it('a guest\'s own opening taken back at once leaves nothing', async () => {
      const guest = { via: 'guest_share', shareId: 'sh1' };
      const asGuest = (row: ReturnType<typeof log>) => ({ ...row, action: 'GUEST_UPDATE', details: { ...(row.details as object), ...guest } });
      expect(await read(openedThenPutBack(5).map(asGuest))).toEqual([]);
    });

    // Recette #847, KO 8.2: each entry is written on its own once the request
    // is done, so the group's lands a few milliseconds after the bottle's —
    // "Quantité : 2 → 3" was told after "Annuler" of a bottle opened from its cell.
    describe('the group\'s own entries, written a few milliseconds apart (recette #847, KO 8.2)', () => {
      const ms = (seconds: number, millis: number) => new Date(at(seconds).getTime() + millis);
      const cell = { column: 2, row: 1 };
      const late = (row: ReturnType<typeof log>, millis: number) => ({ ...row, createdAt: ms(row.createdAt.getUTCSeconds(), millis) });
      // Opened from C2·R1 out of g ×3 (3 → 2), then put back (2 → 3).
      const fromCell = (extra: Record<string, unknown> = {}, opening = opened) => [
        log(4, 5, 'g', { changes: [{ field: 'quantity', from: 2, to: 3 }], outcome: 'reattached', subItemId: 's', ...extra }),
        log(3, 5, 'g', { changes: [{ field: 'isOpened', from: true, to: false }], outcome: 'reattached', targetItemId: 's', ...extra }),
        log(2, 0, 'g', { changes: [{ field: 'quantity', from: 3, to: 2 }, { field: 'slot', from: cell, to: null }], outcome: 'detached', subItemId: 's', ...extra }),
        log(1, 0, 'g', { changes: [...opening, { field: 'slot', from: null, to: cell }], outcome: 'detached', targetItemId: 'g', absorbedFrom: 's', ...extra }),
      ];
      const opened = [{ field: 'isOpened', from: false, to: true }, { field: 'fillLevel', from: null, to: 100 }];
      const drunk = [{ field: 'isOpened', from: false, to: true }, { field: 'fillLevel', from: null, to: 0 }];
      const smoked = [{ field: 'isOpened', from: false, to: true }, { field: 'cigarsLeft', from: null, to: 24 }];
      const spread = ([back4, back3, open2, open1]: ReturnType<typeof log>[]) => [late(back4, 4), back3, late(open2, 3), open1];

      it('opened from a cell, "Annuler": nothing told, its group\'s "2 → 3" written after included', async () => {
        expect(await read(spread(fromCell()))).toEqual([]);
      });

      it('the same, the group\'s entries written just before the bottle\'s', async () => {
        const [back4, back3, open2, open1] = fromCell();
        expect(await read([back3, { ...back4, createdAt: ms(4, 998) }, open1, { ...open2, createdAt: ms(-1, 999) }])).toEqual([]);
      });

      it('"J\'en bois une" and "J\'en fume un" from a cell, "Annuler": nothing told', async () => {
        expect(await read(spread(fromCell({}, drunk)))).toEqual([]);
        expect(await read(spread(fromCell({ smokeOne: true }, smoked)))).toEqual([]);
      });

      it('a guest\'s, whose group entries name no bottle (written before the fix): nothing told', async () => {
        const guest = { via: 'guest_share', shareId: 'sh1' };
        const asGuest = (row: ReturnType<typeof log>) => {
          const { subItemId: _named, ...details } = row.details as Record<string, unknown>;
          return { ...row, action: 'GUEST_UPDATE', details: { ...details, ...guest } };
        };
        expect(await read(spread(fromCell()).map(asGuest))).toEqual([]);
        // Another guest's link opening the same line meanwhile: its group entry is never taken for this one.
        const other = { ...asGuest(log(8, 1, 'g', { changes: [{ field: 'quantity', from: 2, to: 1 }], outcome: 'detached' })), details: { changes: [{ field: 'quantity', from: 2, to: 1 }], outcome: 'detached', via: 'guest_share', shareId: 'sh2' } };
        const rows = spread(fromCell()).map(asGuest);
        expect(await read([...rows.slice(0, 2), other, ...rows.slice(2)])).toEqual([8]);
      });

      it('put back past the minute: the opening and the putting back are both told', async () => {
        const rows = spread(fromCell()).map((row, index) => (index < 2 ? { ...row, createdAt: new Date(row.createdAt.getTime() + 120_000) } : row));
        expect(await read(rows)).toEqual([4, 3, 1]);
      });
    });

    // An in-place write is logged without `outcome` (only a detach or a reattach carries one).
    it('a lone bottle drunk in place then taken back: both entries go, its slot given back included', async () => {
      expect(await read([
        log(2, 4, 'b', { changes: [{ field: 'isOpened', from: true, to: false }, { field: 'fillLevel', from: 0, to: 100 }, { field: 'slotColumn', from: null, to: 2 }], outcome: 'regrouped', targetItemId: 'b' }),
        log(1, 0, 'b', { changes: [{ field: 'isOpened', from: false, to: true }, { field: 'fillLevel', from: null, to: 0 }, { field: 'slotColumn', from: 2, to: null }] }),
      ])).toEqual([]);
    });

    // Recette #847 (KO 4.4): closing again clears the opening date without
    // recording it, and "Annuler" of a box writes its size as cigars left.
    it('a lone box smoked, or a lone bottle opened, then taken back: both entries go', async () => {
      const openedAt = '2026-11-04T10:00:00.000Z';
      expect(await read([
        log(2, 4, 'x', { changes: [{ field: 'isOpened', from: true, to: false }, { field: 'cigarsLeft', from: 24, to: 25 }], outcome: 'regrouped', targetItemId: 'x' }),
        log(1, 0, 'x', { changes: [{ field: 'isOpened', from: false, to: true }, { field: 'openedAt', from: null, to: openedAt }, { field: 'cigarsLeft', from: null, to: 24 }], smokeOne: true }),
      ])).toEqual([]);
      expect(await read([
        log(2, 4, 'b', { changes: [{ field: 'isOpened', from: true, to: false }], outcome: 'regrouped', targetItemId: 'b' }),
        log(1, 0, 'b', { changes: [{ field: 'isOpened', from: false, to: true }, { field: 'fillLevel', from: null, to: 100 }, { field: 'openedAt', from: null, to: openedAt }] }),
      ])).toEqual([]);
      // A guest's, through the same link (its "Annuler" puts the opening date back too); never another link's.
      const guest = (row: ReturnType<typeof log>, shareId: string) =>
        ({ ...row, action: 'GUEST_UPDATE', details: { ...(row.details as object), via: 'guest_share', shareId } });
      const guestSmoke = guest(log(1, 0, 'x', { changes: [{ field: 'isOpened', from: false, to: true }, { field: 'openedAt', from: null, to: openedAt }, { field: 'cigarsLeft', from: null, to: 24 }], smokeOne: true }), 'sh1');
      const guestBack = (shareId: string) => guest(log(2, 4, 'x', {
        changes: [{ field: 'isOpened', from: true, to: false }, { field: 'openedAt', from: openedAt, to: null }, { field: 'cigarsLeft', from: 24, to: 25 }], outcome: 'regrouped', targetItemId: 'x',
      }), shareId);
      expect(await read([guestBack('sh1'), guestSmoke])).toEqual([]);
      expect(await read([guestBack('sh2'), guestSmoke])).toEqual([2, 1]);
    });

    it('a box smoked then smoked again, or still opened, is told', async () => {
      const smoked = log(1, 0, 'x', { changes: [{ field: 'isOpened', from: false, to: true }, { field: 'cigarsLeft', from: null, to: 24 }], smokeOne: true });
      expect(await read([log(2, 4, 'x', { changes: [{ field: 'cigarsLeft', from: 24, to: 23 }], smokeOne: true }), smoked])).toEqual([2, 1]);
      expect(await read([log(2, 4, 'x', { changes: [{ field: 'cigarsLeft', from: 24, to: 25 }] }), smoked])).toEqual([2, 1]);
    });

    it('two writes that do not cancel out are both told', async () => {
      expect(await read([
        log(2, 4, 'b', { changes: [{ field: 'fillLevel', from: 50, to: 30 }] }),
        log(1, 0, 'b', { changes: [{ field: 'fillLevel', from: 100, to: 50 }] }),
      ])).toEqual([2, 1]);
    });
  });

  // Recette #847: "1 bouteille ouverte", "1 bouteille bue · Case C2·R1 libérée",
  // "1 bouteille déplacée vers Cuisine · Case C2·R2 libérée" — one entry per gesture.
  describe('one gesture, one entry (recette #847)', () => {
    const at = (seconds: number) => new Date(Date.UTC(2026, 10, 5, 10, 0, seconds));
    const log = (id: number, seconds: number, bottleId: string, details: Record<string, unknown>, action = 'UPDATE') => ({
      id, action, status: 'success', userId: 'u1', bottleId, productId: 'p1', details, createdAt: at(seconds),
    });
    const cell = (column: number, row: number) => ({ column, row });
    const read = async (rows: unknown[]) => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue(rows as never);
      vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', displayName: 'Marie', username: 'marie' }] as never);
      return readFieldHistory({ productId: 'p1' });
    };
    const opened = [{ field: 'isOpened', from: false, to: true }, { field: 'fillLevel', from: null, to: 100 }];
    const drunk = [{ field: 'isOpened', from: false, to: true }, { field: 'fillLevel', from: null, to: 0 }];

    it('a bottle opened out of a placed line: one entry, "opened", and no cell freed (it keeps its cell)', async () => {
      const history = await read([
        log(2, 0, 'g', { changes: [{ field: 'quantity', from: 6, to: 5 }, { field: 'slot', from: cell(4, 1), to: null }], outcome: 'detached', subItemId: 's' }),
        log(1, 0, 's', { changes: [...opened, { field: 'slot', from: null, to: cell(4, 1) }], outcome: 'detached', targetItemId: 'g' }),
      ]);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ id: 1, itemId: 's', gesture: 'opened', changes: opened });
    });

    it('a bottle drunk out of a placed line: one entry, "finished", with the cell its line freed', async () => {
      const history = await read([
        log(1, 0, 's', { changes: drunk, outcome: 'detached', targetItemId: 'g' }),
        log(2, 1, 'g', { changes: [{ field: 'quantity', from: 4, to: 3 }, { field: 'slot', from: cell(2, 1), to: null }], outcome: 'detached', subItemId: 's' }),
      ]);
      expect(history).toEqual([expect.objectContaining({
        id: 1, gesture: 'finished', changes: [...drunk, { field: 'slot', from: cell(2, 1), to: null }],
      })]);
    });

    it('a guest\'s drink (its line\'s entry names no copy) is folded the same way', async () => {
      const guest = { via: 'guest_share', shareId: 'sh1', inviteeName: 'Paul' };
      const history = await read([
        log(2, 0, 'g', { ...guest, changes: [{ field: 'quantity', from: 4, to: 3 }, { field: 'slot', from: cell(2, 1), to: null }], outcome: 'detached' }, 'GUEST_UPDATE'),
        log(1, 0, 's', { ...guest, changes: drunk, outcome: 'detached', targetItemId: 'g' }, 'GUEST_UPDATE'),
      ]);
      expect(history).toEqual([expect.objectContaining({ id: 1, gesture: 'finished', viaGuest: true, actorName: 'Paul' })]);
      expect(history[0].changes).toContainEqual({ field: 'slot', from: cell(2, 1), to: null });
    });

    it('entries written far apart, or of another copy, are never folded', async () => {
      expect((await read([
        log(2, 30, 'g', { changes: [{ field: 'quantity', from: 4, to: 3 }], outcome: 'detached', subItemId: 's' }),
        log(1, 0, 's', { changes: drunk, outcome: 'detached', targetItemId: 'g' }),
      ])).map((entry) => entry.id)).toEqual([2, 1]);
      expect((await read([
        log(2, 0, 'g', { changes: [{ field: 'quantity', from: 4, to: 3 }], outcome: 'detached', subItemId: 'other' }),
        log(1, 0, 's', { changes: drunk, outcome: 'detached', targetItemId: 'g' }),
      ])).map((entry) => entry.id)).toEqual([2, 1]);
    });

    it('a lone bottle drunk, a cigar smoked, a level adjusted', async () => {
      const [drink, smoke, smokedOld, level, edit] = await read([
        log(5, 0, 'b', { changes: [...drunk, { field: 'slot', from: cell(1, 1), to: null }] }),
        // The first cigar of a box only opens it in its changes: `smokeOne` says it.
        log(4, 20, 'x', { changes: [{ field: 'isOpened', from: false, to: true }, { field: 'cigarsLeft', from: null, to: 24 }], smokeOne: true }),
        // Recorded before the mark: one cigar fewer in an opened box.
        log(3, 40, 'y', { changes: [{ field: 'cigarsLeft', from: 10, to: 9 }] }),
        log(2, 60, 'z', { changes: [{ field: 'fillLevel', from: 100, to: 40 }] }),
        log(1, 80, 'w', { changes: [{ field: 'purchasePrice', from: 20, to: 25 }] }),
      ]);
      expect(drink).toMatchObject({ gesture: 'finished' });
      expect(smoke).toMatchObject({ gesture: 'smoked' });
      expect(smokedOld).toMatchObject({ gesture: 'smoked' });
      expect(level).not.toHaveProperty('gesture');
      expect(edit).not.toHaveProperty('gesture');
    });

    it('a number of cigars left corrected by hand is no smoke', async () => {
      const [corrected] = await read([log(1, 0, 'x', { changes: [{ field: 'cigarsLeft', from: 20, to: 15 }] })]);
      expect(corrected).not.toHaveProperty('gesture');
    });

    it('1 of 3 moved, then the 2 left within seconds: only the first move tells the cell its line freed', async () => {
      const move = { cellarId: { from: 'c1', to: 'c2' } };
      const history = await read([
        // The 2 left join the line of the first one: the group is gone, its entry names no cell.
        log(3, 5, 'l', { ...move, count: 2, fromItemId: 'g', changes: [{ field: 'quantity', from: 1, to: 3 }, { field: 'cellarId', from: 'c1', to: 'c2' }] }, 'MOVE_UNITS'),
        log(2, 0, 'g', { ...move, count: 1, toItemId: 'l', changes: [{ field: 'quantity', from: 3, to: 2 }, { field: 'slot', from: cell(1, 1), to: null }] }, 'MOVE_UNITS'),
        log(1, 0, 'l', { ...move, count: 1, fromItemId: 'g', changes: [{ field: 'quantity', from: null, to: 1 }, { field: 'cellarId', from: 'c1', to: 'c2' }] }, 'MOVE_UNITS'),
      ]);
      const [second, , first] = history;
      expect(second.changes).not.toContainEqual(expect.objectContaining({ field: 'slot' }));
      expect(first.changes).toContainEqual({ field: 'slot', from: cell(1, 1), to: null });
    });

    it('part of a line moved to another cellar: the line it went to tells the cells its line freed, both entries stay', async () => {
      const history = await read([
        log(2, 0, 'g', { count: 1, cellarId: { from: 'c1', to: 'c2' }, toItemId: 'l', changes: [{ field: 'quantity', from: 3, to: 2 }, { field: 'slot', from: cell(2, 2), to: null }] }, 'MOVE_UNITS'),
        log(1, 0, 'l', { count: 1, cellarId: { from: 'c1', to: 'c2' }, fromItemId: 'g', changes: [{ field: 'quantity', from: null, to: 1 }, { field: 'cellarId', from: 'c1', to: 'c2' }] }, 'MOVE_UNITS'),
      ]);
      expect(history).toEqual([
        expect.objectContaining({ id: 2, itemId: 'g', changes: [{ field: 'quantity', from: 3, to: 2 }, { field: 'slot', from: cell(2, 2), to: null }] }),
        expect.objectContaining({
          id: 1, itemId: 'l', count: 1, changes: [
            { field: 'quantity', from: null, to: 1 }, { field: 'cellarId', from: 'c1', to: 'c2' }, { field: 'slot', from: cell(2, 2), to: null },
          ],
        }),
      ]);
      expect(history[1]).not.toHaveProperty('gesture');
    });
  });
});
