import { describe, it, expect, beforeEach, vi } from 'vitest';

// #509: deletion is automatic after the grace period; admins used to learn
// about it only from "deleted-…" names in the history.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn(), update: vi.fn() },
  },
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
  vi.mocked(prisma.user.findMany).mockResolvedValue([
    { id: 'admin1', language: 'EN', notifLanguage: null },
  ] as never);
});

describe('admins are told about account deletions (#509)', () => {
  it('notifies the other admins when a member requests deletion', async () => {
    vi.mocked(prisma.user.update).mockResolvedValue({ username: '<b>marie</b>' } as never);
    await authService.requestAccountDeletion('u1');
    await flush();

    const where = vi.mocked(prisma.user.findMany).mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ isAdmin: true, id: { not: 'u1' } });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ userId: 'admin1', category: 'security' }));
    expect(send.mock.calls[0][0].htmlBody).toContain('&lt;b&gt;marie&lt;/b&gt;');
  });

  it('notifies admins when deletions were carried out, and stays quiet otherwise', async () => {
    await authService.notifyAdminsOfExecutedDeletions(0);
    expect(send).not.toHaveBeenCalled();
    await authService.notifyAdminsOfExecutedDeletions(2);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ subject: '2 accounts deleted' }));
  });
});
