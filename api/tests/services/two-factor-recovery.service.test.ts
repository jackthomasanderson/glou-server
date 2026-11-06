import { describe, it, expect, beforeEach, vi } from 'vitest';

// #638: losing the phone with 2FA on meant losing the account. An admin
// password reset left 2FA in place (sign-in still stopped at the code step),
// and backup codes could be neither regenerated nor counted.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    trustedDevice: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: { sign: vi.fn(() => 'signed-token') },
}));

vi.mock('otplib', () => ({
  authenticator: {
    options: {},
    verify: vi.fn(() => false),
    generateSecret: vi.fn(),
    keyuri: vi.fn(),
  },
}));

vi.mock('../../src/services/notification.service', () => ({
  notificationService: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../src/services/system-config.service', () => ({
  systemConfigService: {
    getEffectivePublicUrl: vi.fn().mockResolvedValue('https://glou.example'),
  },
}));

vi.mock('../../src/services/audit.service', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { prisma } from '../../src/lib/prisma';
import { authService } from '../../src/services/auth.service';
import { auditLog } from '../../src/services/audit.service';
import { notificationService } from '../../src/services/notification.service';

const deviceInfo = { userAgent: 'test-agent', ip: '127.0.0.1' };
const BACKUP_CODE = 'abcd1234abcd1234abcd';

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'member',
    username: 'mum',
    email: 'mum@example.com',
    passwordHash: 'stored-hash',
    avatarUrl: null,
    appName: null,
    appSlogan: null,
    displayName: null,
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
    isTwoFactorEnabled: true,
    twoFactorSecret: 'SECRET',
    backupCodes: ['old-hash-1', 'old-hash-2', 'old-hash-3'],
    twoFactorFailedAttempts: 2,
    twoFactorLockedUntil: null,
    notifLanguage: null,
    ...overrides,
  };
}

type UpdateArgs = { where: { id: string }; data: Record<string, unknown> };
const userUpdates = () => vi.mocked(prisma.user.update).mock.calls.map((c) => c[0] as unknown as UpdateArgs);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
  vi.mocked(bcrypt.hash).mockImplementation(async (value: string) => `hash(${value})`);
  vi.mocked(prisma.user.update).mockResolvedValue(userRow() as never);
  vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.trustedDevice.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ language: 'FR', notifLanguage: null } as never);
});

/** Rows by id: the member being reset and the admin doing it. */
function accounts(rows: Record<string, ReturnType<typeof userRow>>) {
  vi.mocked(prisma.user.findUniqueOrThrow).mockImplementation((async (args: { where: { id: string } }) => {
    const row = rows[args.where.id];
    if (!row) throw new Error('not found');
    return row;
  }) as never);
}

const ADMIN_PASSWORD = 'admin-pw';
const ADMIN_BACKUP = 'ffff0000ffff0000ffff';
/** bcrypt.compare stand-in: the admin's password and backup code, nothing else. */
function adminSecrets() {
  vi.mocked(bcrypt.compare).mockImplementation(async (value: string, hash: string) =>
    (value === ADMIN_PASSWORD && hash === 'admin-hash') || (value === ADMIN_BACKUP && hash === 'admin-code-2'));
}
const adminRow = (overrides: Record<string, unknown> = {}) => userRow({
  id: 'admin', isAdmin: true, passwordHash: 'admin-hash', twoFactorSecret: 'ADMIN-SECRET',
  backupCodes: ['admin-code-1', 'admin-code-2'], ...overrides,
});

const memberUpdate = () => userUpdates().find((u) => u.where.id === 'member');

describe('adminResetPassword turns two-factor authentication off (#638)', () => {
  beforeEach(() => {
    accounts({ member: userRow(), admin: adminRow() });
    adminSecrets();
    vi.mocked(authenticator.verify).mockImplementation((({ token, secret }: { token: string; secret: string }) =>
      token === '654321' && secret === 'ADMIN-SECRET') as never);
  });

  it('with the admin\'s password and code, erases the member\'s 2FA secret, backup codes and failure counter', async () => {
    await authService.adminResetPassword('member', 'admin', deviceInfo, { password: ADMIN_PASSWORD, code: '654321' });

    expect(memberUpdate()?.data).toMatchObject({
      mustChangePassword: true,
      isTwoFactorEnabled: false,
      twoFactorSecret: null,
      backupCodes: [],
      twoFactorFailedAttempts: 0,
      twoFactorLockedUntil: null,
    });
  });

  it('still revokes every session and trusted device of the member', async () => {
    await authService.adminResetPassword('member', 'admin', deviceInfo, { password: ADMIN_PASSWORD, code: '654321' });

    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'member', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.trustedDevice.updateMany).toHaveBeenCalledWith({
      where: { userId: 'member', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('records the 2FA reset in the audit log, with no secret in it', async () => {
    const tempPassword = await authService.adminResetPassword('member', 'admin', deviceInfo, { password: ADMIN_PASSWORD, code: '654321' });

    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'admin',
      status: 'success',
      details: { reason: 'admin_password_reset', targetUserId: 'member', twoFactorDisabled: true },
    }));
    const logged = JSON.stringify(vi.mocked(auditLog).mock.calls);
    expect(logged).not.toContain(tempPassword);
    expect(logged).not.toContain('SECRET');
    expect(logged).not.toContain(ADMIN_PASSWORD);
  });

  it.each([
    ['no password', {}, 'REAUTH_REQUIRED'],
    ['a wrong password', { password: 'guess', code: '654321' }, 'INVALID_PASSWORD'],
    ['no code', { password: ADMIN_PASSWORD }, 'INVALID_TOTP_CODE'],
    ['a wrong code', { password: ADMIN_PASSWORD, code: '000000' }, 'INVALID_TOTP_CODE'],
    ['an unknown backup code', { password: ADMIN_PASSWORD, code: 'abcdabcdabcdabcdabcd' }, 'INVALID_TOTP_CODE'],
  ])('with %s, refuses and leaves the member\'s password and 2FA untouched', async (_label, reauth, error) => {
    await expect(authService.adminResetPassword('member', 'admin', deviceInfo, reauth)).rejects.toThrow(error);

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'admin',
      status: 'error',
      details: { reason: 'admin_password_reset', targetUserId: 'member', error },
    }));
    expect(JSON.stringify(vi.mocked(auditLog).mock.calls)).not.toContain(ADMIN_PASSWORD);
  });

  it('accepts one of the admin\'s backup codes and consumes it', async () => {
    await authService.adminResetPassword('member', 'admin', deviceInfo, { password: ADMIN_PASSWORD, code: ADMIN_BACKUP });

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'admin', backupCodes: { has: 'admin-code-2' } },
      data: { backupCodes: ['admin-code-1'] },
    });
    expect(memberUpdate()?.data).toMatchObject({ isTwoFactorEnabled: false });
  });

  it('refuses a backup code a concurrent request already used', async () => {
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 } as never);
    await expect(authService.adminResetPassword('member', 'admin', deviceInfo, { password: ADMIN_PASSWORD, code: ADMIN_BACKUP }))
      .rejects.toThrow('INVALID_TOTP_CODE');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('asks the password only, when the admin has no 2FA', async () => {
    accounts({ member: userRow(), admin: adminRow({ isTwoFactorEnabled: false, twoFactorSecret: null, backupCodes: [] }) });
    await authService.adminResetPassword('member', 'admin', deviceInfo, { password: ADMIN_PASSWORD });
    expect(memberUpdate()?.data).toMatchObject({ isTwoFactorEnabled: false });
  });

  it('asks nothing more when the member has no 2FA (today\'s behaviour)', async () => {
    accounts({ member: userRow({ isTwoFactorEnabled: false, twoFactorSecret: null, backupCodes: [] }), admin: adminRow() });
    await authService.adminResetPassword('member', 'admin', deviceInfo);

    expect(memberUpdate()?.data).toMatchObject({ mustChangePassword: true });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      details: { reason: 'admin_password_reset', targetUserId: 'member', twoFactorDisabled: false },
    }));
  });

  it('leaves an admin\'s own 2FA in place: an open session alone must not strip it', async () => {
    await authService.adminResetPassword('admin', 'admin', deviceInfo);

    const update = userUpdates().find((u) => u.where.id === 'admin');
    expect(update?.data).toMatchObject({ mustChangePassword: true });
    expect(update?.data).not.toHaveProperty('isTwoFactorEnabled');
    expect(update?.data).not.toHaveProperty('twoFactorSecret');
    expect(update?.data).not.toHaveProperty('backupCodes');
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      details: { reason: 'admin_password_reset', targetUserId: 'admin', twoFactorDisabled: false },
    }));
  });
});

describe('regenerateBackupCodes (#638)', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(userRow() as never);
  });

  it('refuses a wrong password, whatever the code', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    vi.mocked(authenticator.verify).mockReturnValue(true);

    await expect(authService.regenerateBackupCodes('member', 'wrong', '123456')).rejects.toThrow('INVALID_CREDENTIALS');
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a wrong authenticator code', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never); // password only
    vi.mocked(authenticator.verify).mockReturnValue(false);

    await expect(authService.regenerateBackupCodes('member', 'pw', '000000')).rejects.toThrow('INVALID_TOTP_CODE');
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a backup code that matches none of the stored ones', async () => {
    vi.mocked(bcrypt.compare).mockImplementation(async (value: string) => value === 'pw');

    await expect(authService.regenerateBackupCodes('member', 'pw', BACKUP_CODE)).rejects.toThrow('INVALID_TOTP_CODE');
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('refuses when 2FA is off', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(
      userRow({ isTwoFactorEnabled: false, twoFactorSecret: null, backupCodes: [] }) as never,
    );
    await expect(authService.regenerateBackupCodes('member', 'pw', '123456')).rejects.toThrow('2FA_NOT_ENABLED');
  });

  it('with the password and an authenticator code, replaces every old code by ten new hashed ones', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(authenticator.verify).mockReturnValue(true);

    const { backupCodes } = await authService.regenerateBackupCodes('member', 'pw', '123456');

    expect(backupCodes).toHaveLength(10);
    expect(new Set(backupCodes).size).toBe(10);
    for (const code of backupCodes) expect(code).toMatch(/^[0-9a-f]{20}$/);

    const [args] = vi.mocked(prisma.user.updateMany).mock.calls[0] as unknown as [{ where: unknown; data: { backupCodes: string[] } }];
    // Only if the old codes are still the current ones (remark: concurrent requests).
    expect(args.where).toEqual({ id: 'member', backupCodes: { equals: ['old-hash-1', 'old-hash-2', 'old-hash-3'] } });
    const stored = args.data.backupCodes;
    // Stored hashed, never in the clear; none of the old hashes survives.
    expect(stored).toEqual(backupCodes.map((c) => `hash(${c})`));
    for (const old of ['old-hash-1', 'old-hash-2', 'old-hash-3']) expect(stored).not.toContain(old);
  });

  it('is audited and notified, with no code in the audit entry', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(authenticator.verify).mockReturnValue(true);

    const { backupCodes } = await authService.regenerateBackupCodes('member', 'pw', '123456', deviceInfo);

    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ userId: 'member', action: 'BACKUP_CODES_REGENERATE', status: 'success' }));
    const logged = JSON.stringify(vi.mocked(auditLog).mock.calls);
    for (const code of backupCodes) expect(logged).not.toContain(code);
    await vi.waitFor(() => expect(notificationService.send).toHaveBeenCalled());
    expect(JSON.stringify(vi.mocked(notificationService.send).mock.calls)).toContain('Nouveaux codes de secours');
  });

  it('refuses when a concurrent request replaced the codes first', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(authenticator.verify).mockReturnValue(true);
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 } as never);

    await expect(authService.regenerateBackupCodes('member', 'pw', '123456')).rejects.toThrow('INVALID_TOTP_CODE');
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('also accepts a backup code as the second factor', async () => {
    vi.mocked(bcrypt.compare).mockImplementation(async (value: string, hash: string) =>
      value === 'pw' || (value === BACKUP_CODE && hash === 'old-hash-2'));

    const { backupCodes } = await authService.regenerateBackupCodes('member', 'pw', BACKUP_CODE);
    expect(backupCodes).toHaveLength(10);
  });
});

describe('countBackupCodes (#638)', () => {
  it('counts the unused backup codes, reading nothing else', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({ backupCodes: ['h1', 'h2', 'h3'] } as never);

    expect(await authService.countBackupCodes('member')).toBe(3);
    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'member' }, select: { backupCodes: true } });
  });

  it('is 0 once 2FA is off', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({ backupCodes: [] } as never);
    expect(await authService.countBackupCodes('member')).toBe(0);
  });
});
