import { describe, it, expect, beforeEach, vi } from 'vitest';

// #695: an administrator deletes a member for good. What they created in the
// shared inventory goes to the admin, their history stays under their name,
// their personal data goes — the same as an executed deletion request (#661).
// The real foreign keys are exercised by e2e/tests/delete-member.spec.ts.

const SHARED = ['cellar', 'product', 'inventoryItem', 'tastingNote', 'inventoryCountSession', 'humidorReading', 'budgetEnvelope'] as const;
const HISTORY = ['auditLog', 'configChangeLog'] as const;
const PERSONAL = ['scanJob', 'wishlistItem', 'consumptionGoal', 'bulkPreset', 'passwordResetToken', 'session', 'trustedDevice', 'guestShare'] as const;

vi.mock('../../src/lib/prisma', () => {
  const table = () => ({ updateMany: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() });
  const tx: Record<string, unknown> = {
    user: { findUniqueOrThrow: vi.fn(), delete: vi.fn() },
  };
  for (const name of ['cellar', 'product', 'inventoryItem', 'tastingNote', 'inventoryCountSession', 'humidorReading', 'budgetEnvelope',
    'auditLog', 'configChangeLog', 'scanJob', 'wishlistItem', 'consumptionGoal', 'bulkPreset', 'passwordResetToken', 'session',
    'trustedDevice', 'guestShare', 'collection']) tx[name] = table();
  return { prisma: { ...tx, $transaction: vi.fn((fn: (client: unknown) => unknown) => fn(tx)) } };
});

import { prisma } from '../../src/lib/prisma';
import { deleteMemberForGood } from '../../src/services/account-deletion.service';

type Table = { updateMany: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
const db = prisma as unknown as Record<string, Table> & { user: { findUniqueOrThrow: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> } };

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUniqueOrThrow.mockResolvedValue({ username: 'marie', displayName: 'Marie D.', avatarUrl: '/uploads/avatars/m.png' });
  db.scanJob.findMany.mockResolvedValue([{ imagePath: '/app/uploads/scans/s.jpg' }]);
});

describe('deleteMemberForGood (#695)', () => {
  it('attributes what the member created in the shared inventory to the deleting admin', async () => {
    await deleteMemberForGood('m1', 'a1');

    for (const name of SHARED) {
      expect(db[name].updateMany, name).toHaveBeenCalledWith({ where: { userId: 'm1' }, data: { userId: 'a1' } });
    }
  });

  it('keeps their history under the name it was shown under', async () => {
    await deleteMemberForGood('m1', 'a1');

    for (const name of HISTORY) {
      expect(db[name].updateMany, name).toHaveBeenCalledWith({ where: { userId: 'm1' }, data: { actorName: 'Marie D.' } });
      expect(db[name].deleteMany, name).not.toHaveBeenCalled();
    }
  });

  it('deletes their personal data, keeps the shared collections, then the account', async () => {
    const result = await deleteMemberForGood('m1', 'a1');

    for (const name of PERSONAL) {
      expect(db[name].deleteMany, name).toHaveBeenCalledWith({ where: { userId: { in: ['m1'] } } });
    }
    expect(db.collection.deleteMany).not.toHaveBeenCalled();
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    // Everything re-attributed before the row goes (Restrict would refuse it).
    const lastWrite = Math.max(...SHARED.map((name) => db[name].updateMany.mock.invocationCallOrder[0]));
    expect(db.user.delete.mock.invocationCallOrder[0]).toBeGreaterThan(lastWrite);
    expect(result).toEqual({ username: 'marie', avatarPaths: ['/uploads/avatars/m.png'], scanImagePaths: ['/app/uploads/scans/s.jpg'] });
  });

  it('falls back on the username when the member had no display name', async () => {
    db.user.findUniqueOrThrow.mockResolvedValue({ username: 'marie', displayName: null, avatarUrl: null });

    const result = await deleteMemberForGood('m1', 'a1');

    expect(db.auditLog.updateMany).toHaveBeenCalledWith({ where: { userId: 'm1' }, data: { actorName: 'marie' } });
    expect(result.avatarPaths).toEqual([]);
  });
});
