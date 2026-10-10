import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { auditLog, purgeOldAuditLogs } from '../../src/services/audit.service';

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
        details: {},
      },
    });
  });

  it('passes through bottleId and details when given', async () => {
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

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
        details: { reason: 'manual' },
      },
    });
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
