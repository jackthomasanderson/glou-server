import { describe, it, expect, beforeEach, vi } from 'vitest';

// ISSUE_044 non-regression: a password reset by email is the path taken by
// someone who believes their account is compromised. It must cut every other
// way in — sessions AND trusted devices (which skip the 2FA challenge for 30
// days) — and warn the owner, exactly like the in-profile password change.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: {
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    session: { updateMany: vi.fn() },
    trustedDevice: { updateMany: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('new-hash'), compare: vi.fn() },
}));

vi.mock('../../src/services/email.service', () => ({
  emailService: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../src/services/system-config.service', () => ({
  systemConfigService: {
    getEffectivePublicUrl: vi.fn().mockResolvedValue('https://glou.example'),
  },
}));

vi.mock('../../src/services/audit.service', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/auth.service', () => ({
  authService: { notifyAccountSecurityEvent: vi.fn() },
}));

import { prisma } from '../../src/lib/prisma';
import { passwordResetService } from '../../src/services/password-reset.service';
import { authService } from '../../src/services/auth.service';
import { auditLog } from '../../src/services/audit.service';

const deviceInfo = { userAgent: 'reset-agent', ip: '203.0.113.7' };

// Operations handed to the (mocked) $transaction call, captured so a test can
// assert that every write really travelled together. Typed loosely on purpose:
// Prisma's `$transaction` is overloaded, which makes `mock.calls` awkward to
// type at the call site.
let transactionOps: unknown[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  transactionOps = [];
  vi.mocked(prisma.$transaction).mockImplementation(((ops: unknown[]) => {
    transactionOps = ops;
    return Promise.resolve([]);
  }) as never);
});

describe('passwordResetService.resetPassword (ISSUE_044)', () => {
  const validRecord = {
    userId: 'u1',
    tokenHash: 'hash',
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
  };

  it('revokes every session and every trusted device in the same transaction', async () => {
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue(validRecord as never);

    await passwordResetService.resetPassword('raw-token', 'brand-new-password', deviceInfo);

    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.trustedDevice.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });

    // All four writes (password, token consumption, sessions, trusted
    // devices) must be atomic: a partial reset would leave the intruder in.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionOps).toHaveLength(4);
  });

  it('notifies the owner that the password changed', async () => {
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue(validRecord as never);

    await passwordResetService.resetPassword('raw-token', 'brand-new-password', deviceInfo);

    expect(authService.notifyAccountSecurityEvent).toHaveBeenCalledWith('u1', 'passwordChanged', deviceInfo);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        action: 'SESSION_REVOKE',
        details: { reason: 'password_reset', trustedDevicesRevoked: true },
      }),
    );
  });

  it.each([
    ['an unknown token', null],
    ['an already-used token', { ...validRecord, usedAt: new Date() }],
    ['an expired token', { ...validRecord, expiresAt: new Date(Date.now() - 60_000) }],
  ])('rejects %s without revoking anything', async (_label, record) => {
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue(record as never);

    await expect(
      passwordResetService.resetPassword('raw-token', 'brand-new-password', deviceInfo),
    ).rejects.toThrow('INVALID_OR_EXPIRED_TOKEN');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
    expect(prisma.trustedDevice.updateMany).not.toHaveBeenCalled();
    expect(authService.notifyAccountSecurityEvent).not.toHaveBeenCalled();
  });
});
