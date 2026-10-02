import { describe, it, expect, beforeEach, vi } from 'vitest';

// Non-regression tests for the three account-security findings of AUDIT_002:
//   ISSUE_042 — changing the account email required no password and warned nobody.
//   ISSUE_043 — the `2fa_pending` token lived 30 days and the 6-digit code had
//               no per-account failure counter.
//   ISSUE_044 — a password reset by email revoked neither sessions nor trusted
//               devices (covered in password-reset.service.test.ts).

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    trustedDevice: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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

// Kept deterministic: these cases are about the throttling bookkeeping around
// the code check, not about TOTP arithmetic.
vi.mock('speakeasy', () => ({
  default: {
    totp: { verify: vi.fn(() => false) },
    generateSecret: vi.fn(),
    otpauthURL: vi.fn(),
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
import jwt from 'jsonwebtoken';
import { prisma } from '../../src/lib/prisma';
import { authService } from '../../src/services/auth.service';
import { notificationService } from '../../src/services/notification.service';

const deviceInfo = { userAgent: 'test-agent', ip: '127.0.0.1' };

/** Minimal User row shape for the paths exercised below. */
function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    username: 'tester',
    email: 'new@example.com',
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
    isTwoFactorEnabled: true,
    twoFactorSecret: 'SECRET',
    backupCodes: [],
    twoFactorFailedAttempts: 0,
    twoFactorLockedUntil: null,
    notifLanguage: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
});

// ─── ISSUE_042 ───────────────────────────────────────────────────────────────

describe('authService.updateEmail (ISSUE_042)', () => {
  it('rejects the change when the current password is wrong, without touching the row', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(
      { passwordHash: 'stored-hash', email: 'old@example.com' } as never,
    );
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      authService.updateEmail('u1', 'attacker@example.com', 'wrong-password', deviceInfo),
    ).rejects.toThrow('INVALID_CREDENTIALS');

    expect(bcrypt.compare).toHaveBeenCalledWith('wrong-password', 'stored-hash');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('warns the PREVIOUS address once the change went through', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(
      { passwordHash: 'stored-hash', email: 'old@example.com' } as never,
    );
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.update).mockResolvedValue(userRow({ email: 'new@example.com' }) as never);
    // Read back by the fire-and-forget notification pipeline.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ language: 'FR', notifLanguage: null } as never);

    const result = await authService.updateEmail('u1', 'new@example.com', 'good-password', deviceInfo);

    expect(result.email).toBe('new@example.com');
    // The alert must land on the old address — the only one the legitimate
    // owner still controls after the change.
    await vi.waitFor(() => {
      expect(notificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'security', emailOverride: 'old@example.com' }),
      );
    });
  });
});

// ─── ISSUE_043 ───────────────────────────────────────────────────────────────

describe('2FA pending token lifetime (ISSUE_043)', () => {
  it('signs the 2fa_pending token with a short expiry instead of the 30-day session one', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(userRow({ isTwoFactorEnabled: true }) as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const result = await authService.login(
      { identifier: 'tester', password: 'pw', rememberMe: false },
      deviceInfo,
    );

    expect(result.requires2fa).toBe(true);
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ scope: '2fa_pending' }),
      'test-secret',
      { expiresIn: '10m' },
    );
  });
});

describe('authService.verifyTwoFactorLogin lockout (ISSUE_043)', () => {
  it('refuses to even check the code while the account is locked', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(
      userRow({ twoFactorLockedUntil: new Date(Date.now() + 60_000) }) as never,
    );

    await expect(
      authService.verifyTwoFactorLogin('u1', '123456', false, deviceInfo),
    ).rejects.toThrow('2FA_TEMPORARILY_LOCKED');

    expect(prisma.session.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('counts a wrong code against the account with an atomic increment', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(userRow() as never);
    // Still below the threshold → no lock, single write.
    vi.mocked(prisma.user.update).mockResolvedValue({ twoFactorFailedAttempts: 2 } as never);

    await expect(
      authService.verifyTwoFactorLogin('u1', '000000', false, deviceInfo),
    ).rejects.toThrow('INVALID_TOTP_CODE');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { twoFactorFailedAttempts: { increment: 1 } },
      select: { twoFactorFailedAttempts: true },
    });
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('locks the challenge and notifies the owner once the failure budget is spent', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(userRow() as never);
    // The increment returns the 5th consecutive failure.
    vi.mocked(prisma.user.update).mockResolvedValue({ twoFactorFailedAttempts: 5 } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ language: 'FR', notifLanguage: null } as never);

    await expect(
      authService.verifyTwoFactorLogin('u1', '000000', false, deviceInfo),
    ).rejects.toThrow('INVALID_TOTP_CODE');

    // Loosely typed on purpose: Prisma's generic `update` makes `mock.calls`
    // awkward to destructure with its real signature.
    const updateCalls = vi.mocked(prisma.user.update).mock.calls as unknown as Array<
      [{ data: Record<string, unknown> }]
    >;
    const lockWrites = updateCalls
      .map(([args]) => args.data)
      .filter((data): data is { twoFactorFailedAttempts: number; twoFactorLockedUntil: Date } =>
        data.twoFactorLockedUntil instanceof Date,
      );

    expect(lockWrites).toHaveLength(1);
    // 15-minute cooling-off period, counter reset for the next window.
    expect(lockWrites[0].twoFactorFailedAttempts).toBe(0);
    expect(lockWrites[0].twoFactorLockedUntil.getTime()).toBeGreaterThan(Date.now());

    await vi.waitFor(() => {
      expect(notificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'security' }),
      );
    });
  });
});

// ─── ISSUE_044 ───────────────────────────────────────────────────────────────

describe('trusted devices follow credential rotations (ISSUE_044)', () => {
  it('revokes every trusted device when the password changes from the profile', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(userRow() as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(bcrypt.hash).mockResolvedValue('new-hash' as never);
    vi.mocked(prisma.user.update).mockResolvedValue(userRow() as never);
    vi.mocked(prisma.session.findMany).mockResolvedValue([]);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ language: 'FR', notifLanguage: null } as never);
    vi.mocked(prisma.trustedDevice.updateMany).mockResolvedValue({ count: 2 } as never);

    await authService.updatePassword('u1', 'old-pw', 'new-pw', deviceInfo, 'session-current');

    expect(prisma.trustedDevice.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('revokes every trusted device when 2FA is turned off', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(
      userRow({ backupCodes: ['hashed-backup'] }) as never,
    );
    // Password check passes; the 8-char branch matches the stored backup code.
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.user.update).mockResolvedValue(userRow() as never);
    vi.mocked(prisma.session.findMany).mockResolvedValue([]);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ language: 'FR', notifLanguage: null } as never);
    vi.mocked(prisma.trustedDevice.updateMany).mockResolvedValue({ count: 1 } as never);

    await authService.turnOffTwoFactorAuthentication('u1', 'pw', deviceInfo, 'session-current', 'abcd1234');

    expect(prisma.trustedDevice.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
