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
      findFirst: vi.fn(),
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
import { emailService } from '../../src/services/email.service';

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
    // #601: and the change itself is in the log, without the new password.
    expect(auditLog).toHaveBeenCalledWith({
      userId: 'u1', action: 'PASSWORD_CHANGE', status: 'success', ip: deviceInfo.ip, details: { via: 'reset_link' },
    });
    expect(JSON.stringify(vi.mocked(auditLog).mock.calls)).not.toContain('brand-new-password');
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

// #606: each request used to void the previous link and send a new e-mail, so
// a mailbox could be flooded and the legitimate link made useless.
describe('passwordResetService.requestReset (#606)', () => {
  const member = { id: 'u1', email: 'u1@example.com', username: 'u1', isActive: true, language: 'EN', notifLanguage: null };

  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(member as never);
  });

  it('keeps a link sent less than 2 minutes ago, and sends nothing new', async () => {
    vi.mocked(prisma.passwordResetToken.findFirst).mockResolvedValue({ id: 't1' } as never);

    await passwordResetService.requestReset('u1@example.com');

    const where = vi.mocked(prisma.passwordResetToken.findFirst).mock.calls[0][0]?.where as Record<string, unknown>;
    expect(where).toMatchObject({ userId: 'u1', usedAt: null, expiresAt: { gt: expect.any(Date) }, createdAt: { gt: expect.any(Date) } });
    const since = (where.createdAt as { gt: Date }).gt.getTime();
    expect(Date.now() - since).toBeGreaterThanOrEqual(2 * 60 * 1000 - 1000);
    expect(Date.now() - since).toBeLessThanOrEqual(2 * 60 * 1000 + 1000);
    expect(prisma.passwordResetToken.deleteMany).not.toHaveBeenCalled();
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('replaces an older link with a new one', async () => {
    vi.mocked(prisma.passwordResetToken.findFirst).mockResolvedValue(null);

    await passwordResetService.requestReset('u1@example.com');

    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'u1@example.com' }));
  });
});
