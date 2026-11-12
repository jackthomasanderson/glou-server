import { describe, it, expect, beforeEach, vi } from 'vitest';

// #509: deletion is automatic after the grace period; admins used to learn
// about it only from "deleted-…" names in the history.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    // The request is written in a transaction (the last-admin check, review of #975).
    $transaction: vi.fn(),
  },
}));

// #603: the password is checked first.
vi.mock('bcryptjs', () => ({ default: { compare: vi.fn().mockResolvedValue(true), hash: vi.fn() } }));
vi.mock('../../src/services/system-config.service', () => ({
  systemConfigService: { getEffectivePublicUrl: vi.fn().mockResolvedValue('https://glou.example') },
}));

const { send } = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/services/notification.service', () => ({ notificationService: { send } }));

import { prisma } from '../../src/lib/prisma';
import { authService } from '../../src/services/auth.service';

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(((fn: (tx: unknown) => unknown) => fn(prisma)) as never);
  vi.mocked(prisma.user.findMany).mockResolvedValue([
    { id: 'admin1', language: 'EN', notifLanguage: null },
  ] as never);
});

describe('admins are told about account deletions (#509)', () => {
  it('notifies the other admins when a member requests deletion', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({ username: '<b>marie</b>', passwordHash: 'h', isAdmin: false } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ language: 'EN', notifLanguage: null } as never);
    await authService.requestAccountDeletion('u1', 'pw', {});
    await flush();

    const where = vi.mocked(prisma.user.findMany).mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ isAdmin: true, id: { not: 'u1' } });
    // #981: about a member's account, not the admin's own: not a mandatory security alert.
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ userId: 'admin1', category: 'members' }));
    const toAdmin = send.mock.calls.find(([arg]) => arg.userId === 'admin1')?.[0];
    expect(toAdmin.htmlBody).toContain('&lt;b&gt;marie&lt;/b&gt;');
  });

  it('notifies admins when deletions were carried out, and stays quiet otherwise', async () => {
    await authService.notifyAdminsOfExecutedDeletions(0);
    expect(send).not.toHaveBeenCalled();
    await authService.notifyAdminsOfExecutedDeletions(2);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ subject: '2 accounts deleted', category: 'members' }));
  });
});
