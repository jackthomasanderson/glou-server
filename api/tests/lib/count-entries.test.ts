import { describe, it, expect, vi, beforeEach } from 'vitest';
import { followDetach } from '../../src/lib/count-entries';
import type { PrismaClientOrTx } from '../../src/lib/prisma';

// #471 (FEAT-100, final review of I1/I2): a copy taken off a group while a
// rotating inventory is open. Opened, it is still on the shelf: it was one
// of the copies found on the group, so the group's number found loses one
// and the opened bottle is counted on its own line — 4 found out of 6 stays
// 4 found (3 + the opened one), the missing two stay missing. Drunk, it has
// left the shelf: the number found is only capped to what the group holds.

const tx = {
  inventoryCountEntry: { updateMany: vi.fn(), create: vi.fn() },
  inventoryCountSession: { findFirst: vi.fn() },
};
const db = tx as unknown as PrismaClientOrTx;
const OPEN_SESSION = { status: { in: ['active', 'paused'] } };

beforeEach(() => {
  vi.clearAllMocks();
  tx.inventoryCountSession.findFirst.mockResolvedValue({ id: 'session-1' });
});

describe('followDetach', () => {
  it('an opened copy: the group\'s number found loses one, the opened bottle is confirmed on its own line', async () => {
    await followDetach(db, 'group', 5, { id: 'sub', cellarId: 'garage', finished: false });

    expect(tx.inventoryCountEntry.updateMany).toHaveBeenCalledWith({
      where: { itemId: 'group', sessionId: 'session-1', foundQuantity: { gt: 0 } },
      data: { foundQuantity: { decrement: 1 } },
    });
    expect(tx.inventoryCountEntry.create).toHaveBeenCalledWith({ data: { sessionId: 'session-1', itemId: 'sub', status: 'confirmed' } });
  });

  it('an opened copy: the number found still never exceeds what the group holds', async () => {
    await followDetach(db, 'group', 5, { id: 'sub', cellarId: 'garage', finished: false });

    const calls = tx.inventoryCountEntry.updateMany.mock.calls.map(([args]) => args);
    expect(calls).toContainEqual({
      where: { itemId: 'group', foundQuantity: { gt: 5 }, session: OPEN_SESSION },
      data: { foundQuantity: 5 },
    });
    // Decrement first, then the cap: a number found of 6 out of 6 becomes 5.
    expect(calls.findIndex((args) => 'decrement' in (args.data.foundQuantity as object)))
      .toBeLessThan(calls.findIndex((args) => args.data.foundQuantity === 5));
  });

  it('a drunk copy has left the shelf: only the cap, nothing counted on its own line', async () => {
    await followDetach(db, 'group', 5, { id: 'sub', cellarId: 'garage', finished: true });

    expect(tx.inventoryCountEntry.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.inventoryCountEntry.updateMany).toHaveBeenCalledWith({
      where: { itemId: 'group', foundQuantity: { gt: 5 }, session: OPEN_SESSION },
      data: { foundQuantity: 5 },
    });
    expect(tx.inventoryCountEntry.create).not.toHaveBeenCalled();
  });

  it('no count open in the bottle\'s cellar: the number found is only capped', async () => {
    tx.inventoryCountSession.findFirst.mockResolvedValue(null);
    await followDetach(db, 'group', 5, { id: 'sub', cellarId: 'garage', finished: false });

    expect(tx.inventoryCountEntry.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.inventoryCountEntry.create).not.toHaveBeenCalled();
  });
});
