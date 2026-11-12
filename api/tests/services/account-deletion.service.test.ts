import { describe, it, expect, beforeEach, vi } from 'vitest';

// #222: a requested account deletion (`deletionRequestedAt`) was never
// actually carried out — this covers `authService.purgeDueAccountDeletions`,
// the step `MaintenanceService.runRetentionCleanup` now calls nightly.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn(), update: vi.fn() },
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    trustedDevice: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    guestShare: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    // #661: the member's personal data.
    wishlistItem: { deleteMany: vi.fn() },
    budgetEnvelope: { deleteMany: vi.fn() },
    consumptionGoal: { deleteMany: vi.fn() },
    bulkPreset: { deleteMany: vi.fn() },
    scanJob: { findMany: vi.fn(), deleteMany: vi.fn() },
    passwordResetToken: { deleteMany: vi.fn() },
    collection: { deleteMany: vi.fn() },
  },
}));

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('$2a$12$unusable'), compare: vi.fn() },
}));

import { prisma } from '../../src/lib/prisma';
import { authService } from '../../src/services/auth.service';

const CUTOFF = new Date('2030-01-01T00:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.trustedDevice.deleteMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.guestShare.deleteMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.scanJob.findMany).mockResolvedValue([] as never);
});

/** The personal-data tables #661 empties for the deleted members (budget envelopes are household-wide: kept). */
const PERSONAL_TABLES = ['wishlistItem', 'consumptionGoal', 'bulkPreset', 'scanJob', 'passwordResetToken', 'session', 'trustedDevice', 'guestShare'] as const;
const deleteManyOf = (table: (typeof PERSONAL_TABLES)[number]) =>
  (prisma as unknown as Record<string, { deleteMany: ReturnType<typeof vi.fn> }>)[table].deleteMany;

describe('authService.purgeDueAccountDeletions', () => {
  it('does nothing when no account is due', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);

    const result = await authService.purgeDueAccountDeletions(CUTOFF);

    expect(result).toEqual({ count: 0, avatarPaths: [], scanImagePaths: [] });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  // #661: a member who asked for deletion and was then deactivated by an
  // admin used to be skipped for good.
  it('selects every account whose grace period has elapsed, deactivated ones included', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);

    await authService.purgeDueAccountDeletions(CUTOFF);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { deletionRequestedAt: { not: null, lt: CUTOFF } },
      select: { id: true, avatarUrl: true },
    });
  });

  it('deletes the personal data of a deactivated member, keeps the shared collections, and hands back the scan photos', async () => {
    // Deactivated by an admin after asking for deletion: still due.
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u3', avatarUrl: null }] as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);
    vi.mocked(prisma.scanJob.findMany).mockResolvedValue([{ imagePath: '/app/uploads/scans/a.jpg' }] as never);

    const result = await authService.purgeDueAccountDeletions(CUTOFF);

    for (const table of PERSONAL_TABLES) {
      expect(deleteManyOf(table), table).toHaveBeenCalledWith({ where: { userId: { in: ['u3'] } } });
    }
    // #476: collections are shared by the household and outlive their author;
    // so are budget envelopes (ISSUE_142).
    expect(prisma.collection.deleteMany).not.toHaveBeenCalled();
    expect(prisma.budgetEnvelope.deleteMany).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data).toMatchObject({ appName: null, appSlogan: null });
    expect(result).toEqual({ count: 1, avatarPaths: [], scanImagePaths: ['/app/uploads/scans/a.jpg'] });
  });

  it('anonymizes PII, deactivates the account, and removes its sessions/devices/shares', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1', avatarUrl: '/uploads/avatars/u1.png' },
    ] as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const result = await authService.purgeDueAccountDeletions(CUTOFF);

    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: { in: ['u1'] } } });
    expect(prisma.trustedDevice.deleteMany).toHaveBeenCalledWith({ where: { userId: { in: ['u1'] } } });
    expect(prisma.guestShare.deleteMany).toHaveBeenCalledWith({ where: { userId: { in: ['u1'] } } });

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const [{ where, data }] = vi.mocked(prisma.user.update).mock.calls[0];
    expect(where).toEqual({ id: 'u1' });
    expect(data).toMatchObject({
      username: 'deleted-u1',
      email: 'deleted-u1@deleted.invalid',
      displayName: null,
      avatarUrl: null,
      isTwoFactorEnabled: false,
      twoFactorSecret: null,
      backupCodes: [],
      pinHash: null,
      isActive: false,
      deletionRequestedAt: null,
    });
    // Never left empty/predictable — always a freshly bcrypt-hashed random value.
    expect(typeof data.passwordHash).toBe('string');
    expect(data.passwordHash).not.toBe('');

    expect(result).toEqual({ count: 1, avatarPaths: ['/uploads/avatars/u1.png'], scanImagePaths: [] });
  });

  it('leaves accounts with no avatar out of the returned avatarPaths', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u2', avatarUrl: null }] as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const result = await authService.purgeDueAccountDeletions(CUTOFF);

    expect(result).toEqual({ count: 1, avatarPaths: [], scanImagePaths: [] });
  });
});
