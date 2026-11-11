import { describe, it, expect, beforeEach, vi } from 'vitest';

// #603: turning 2FA on and asking for the account's deletion took an open
// session alone. Both now ask for the password; the last active admin cannot
// ask for their own deletion; the owner is told about a deletion request.
// #601: the events that change who can get in (failed sign-ins, password,
// e-mail and 2FA changes, an admin password reset) are in the audit log,
// never with a password, a code or a secret.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    session: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    trustedDevice: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed'), compare: vi.fn() },
}));

vi.mock('jsonwebtoken', () => ({
  default: { sign: vi.fn(() => 'signed-token') },
}));

vi.mock('../../src/lib/totp', () => ({ newTotpSecret: vi.fn(), totpUri: vi.fn(), isCurrentTotp: vi.fn(() => true) }));

const { send } = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/services/notification.service', () => ({ notificationService: { send } }));

vi.mock('../../src/services/system-config.service', () => ({
  systemConfigService: { getEffectivePublicUrl: vi.fn().mockResolvedValue('https://glou.example') },
}));

vi.mock('../../src/services/audit.service', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

import bcrypt from 'bcryptjs';
import { prisma } from '../../src/lib/prisma';
import { authService } from '../../src/services/auth.service';
import { auditLog } from '../../src/services/audit.service';
import { encrypt } from '../../src/lib/crypto';

const deviceInfo = { userAgent: 'test-agent', ip: '203.0.113.9' };

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    username: 'tester',
    email: 'tester@example.com',
    passwordHash: 'stored-hash',
    avatarUrl: null,
    appName: null,
    appSlogan: null,
    theme: 'LIGHT',
    language: 'FR',
    tempUnit: 'CELSIUS',
    accentColor: '#6366f1',
    dateFormat: 'SYSTEM',
    expertMode: false,
    isAdmin: false,
    isActive: true,
    createdAt: new Date(),
    deletionRequestedAt: null,
    pinHash: null,
    autoLockDelayMin: null,
    onboardingCompletedAt: null,
    mustChangePassword: false,
    isTwoFactorEnabled: false,
    twoFactorSecret: null,
    backupCodes: [],
    twoFactorFailedAttempts: 0,
    twoFactorLockedUntil: null,
    notifLanguage: null,
    ...overrides,
  };
}

/** Every audit entry written so far. */
const audits = () => vi.mocked(auditLog).mock.calls.map(([entry]) => entry);

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
  process.env.CONFIG_ENCRYPTION_KEY = 'cd'.repeat(32);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ language: 'EN', notifLanguage: null } as never);
  vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.user.update).mockResolvedValue(userRow() as never);
  vi.mocked(prisma.session.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.session.create).mockResolvedValue({ id: 's1' } as never);
  vi.mocked(prisma.trustedDevice.updateMany).mockResolvedValue({ count: 0 } as never);
});

// ─── #603 ────────────────────────────────────────────────────────────────────

describe('turning 2FA on asks for the password (#603)', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(
      userRow({ twoFactorSecret: encrypt('JBSWY3DPEHPK3PXP') }) as never,
    );
  });

  it('refuses a wrong password, without turning anything on', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(authService.turnOnTwoFactorAuthentication('u1', 'not-it', '123456', deviceInfo)).rejects.toThrow('INVALID_CREDENTIALS');

    expect(bcrypt.compare).toHaveBeenCalledWith('not-it', 'stored-hash');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses an empty password', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    await expect(authService.turnOnTwoFactorAuthentication('u1', '', '123456', deviceInfo)).rejects.toThrow('INVALID_CREDENTIALS');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('turns 2FA on with the password and a code, and audits it (#601)', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const { backupCodes } = await authService.turnOnTwoFactorAuthentication('u1', 'right', '123456', deviceInfo);

    expect(backupCodes).toHaveLength(10);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isTwoFactorEnabled: true }) }));
    expect(audits()).toContainEqual({ userId: 'u1', action: 'TWO_FACTOR_ON', status: 'success', ip: deviceInfo.ip });
  });
});

describe('asking for the account\'s deletion (#603)', () => {
  it('refuses a wrong password, scheduling nothing', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(userRow() as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(authService.requestAccountDeletion('u1', 'not-it', deviceInfo)).rejects.toThrow('INVALID_CREDENTIALS');

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('refuses the last active admin', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(userRow({ isAdmin: true }) as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.user.count).mockResolvedValue(0 as never);

    await expect(authService.requestAccountDeletion('u1', 'right', deviceInfo)).rejects.toThrow('CANNOT_DELETE_LAST_ADMIN');

    // The other admins counted are active ones not leaving themselves.
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { isAdmin: true, isActive: true, deletionRequestedAt: null, id: { not: 'u1' } },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('lets an admin leave when another active admin stays', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(userRow({ isAdmin: true }) as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.user.count).mockResolvedValue(1 as never);

    await authService.requestAccountDeletion('u1', 'right', deviceInfo);

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1' }, data: { deletionRequestedAt: expect.any(Date) },
    }));
  });

  it('tells the owner, as a security alert', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(userRow() as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    await authService.requestAccountDeletion('u1', 'right', deviceInfo);
    await flush();

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1', category: 'security', bypassQuietHours: true, subject: 'Glou — Account deletion requested',
    }));
  });
});

// ─── #601 ────────────────────────────────────────────────────────────────────

describe('security events in the audit log (#601)', () => {
  it('a wrong password on an existing account is a LOGIN_FAILED entry, without what was typed', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(userRow() as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(authService.login({ identifier: 'tester', password: 'hunter2-guess' } as never, deviceInfo)).rejects.toThrow('INVALID_CREDENTIALS');

    expect(audits()).toEqual([{ userId: 'u1', action: 'LOGIN_FAILED', status: 'error', ip: deviceInfo.ip, details: { reason: 'wrong_password' } }]);
    expect(JSON.stringify(audits())).not.toContain('hunter2-guess');
  });

  it('a sign-in on a deactivated account is a LOGIN_FAILED entry too', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(userRow({ isActive: false }) as never);

    await expect(authService.login({ identifier: 'tester', password: 'whatever' } as never, deviceInfo)).rejects.toThrow('ACCOUNT_DEACTIVATED');

    expect(audits()).toEqual([expect.objectContaining({ userId: 'u1', action: 'LOGIN_FAILED', details: { reason: 'account_deactivated' } })]);
  });

  it('an unknown identifier writes nothing (no account to file it under, nothing typed is kept)', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    await expect(authService.login({ identifier: 'my-password-typed-here', password: 'x' } as never, deviceInfo)).rejects.toThrow('INVALID_CREDENTIALS');

    expect(auditLog).not.toHaveBeenCalled();
  });

  it('a wrong 2FA code at sign-in is a LOGIN_FAILED entry', async () => {
    const { isCurrentTotp } = await import('../../src/lib/totp');
    vi.mocked(isCurrentTotp).mockReturnValueOnce(false);
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(
      userRow({ isTwoFactorEnabled: true, twoFactorSecret: encrypt('JBSWY3DPEHPK3PXP') }) as never,
    );
    vi.mocked(prisma.user.update).mockResolvedValue({ twoFactorFailedAttempts: 1 } as never);

    await expect(authService.verifyTwoFactorLogin('u1', '000000', false, deviceInfo)).rejects.toThrow('INVALID_TOTP_CODE');

    expect(audits()).toContainEqual({ userId: 'u1', action: 'LOGIN_FAILED', status: 'error', ip: deviceInfo.ip, details: { reason: 'wrong_2fa_code' } });
    expect(JSON.stringify(audits())).not.toContain('000000');
  });

  it('a password change from the profile is a PASSWORD_CHANGE entry', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(userRow() as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    await authService.updatePassword('u1', 'old-secret-pw', 'new-secret-pw', deviceInfo, 's1');

    expect(audits()).toContainEqual({ userId: 'u1', action: 'PASSWORD_CHANGE', status: 'success', ip: deviceInfo.ip });
    expect(JSON.stringify(audits())).not.toMatch(/secret-pw|hashed/);
  });

  it('an e-mail change is an EMAIL_CHANGE entry, with the previous and the new address', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({ passwordHash: 'stored-hash', email: 'old@example.com' } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.update).mockResolvedValue(userRow({ email: 'new@example.com' }) as never);

    await authService.updateEmail('u1', 'new@example.com', 'the-password', deviceInfo);

    expect(audits()).toContainEqual({
      userId: 'u1', action: 'EMAIL_CHANGE', status: 'success', ip: deviceInfo.ip,
      details: { previousEmail: 'old@example.com', newEmail: 'new@example.com' },
    });
    expect(JSON.stringify(audits())).not.toContain('the-password');
  });

  it('turning 2FA off is a TWO_FACTOR_OFF entry', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(
      userRow({ isTwoFactorEnabled: true, twoFactorSecret: encrypt('JBSWY3DPEHPK3PXP') }) as never,
    );
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    await authService.turnOffTwoFactorAuthentication('u1', 'pw', deviceInfo, 's1', '123456');

    expect(audits()).toContainEqual({ userId: 'u1', action: 'TWO_FACTOR_OFF', status: 'success', ip: deviceInfo.ip });
  });

  it('an admin password reset is its own ADMIN_PASSWORD_RESET entry, filed under the admin', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockImplementation((async (args: { where: { id: string } }) =>
      args.where.id === 'admin'
        ? userRow({ id: 'admin', isAdmin: true })
        : userRow({ id: 'member', isTwoFactorEnabled: true })) as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)) as never);
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 0 } as never);

    const temp = await authService.adminResetPassword('member', 'admin', deviceInfo, { password: 'admin-pw' });

    expect(audits()).toContainEqual({
      userId: 'admin', action: 'ADMIN_PASSWORD_RESET', status: 'success', ip: deviceInfo.ip,
      details: { targetUserId: 'member', twoFactorDisabled: true },
    });
    expect(JSON.stringify(audits())).not.toMatch(new RegExp(`${temp}|admin-pw`));
  });
});
