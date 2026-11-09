import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authenticator } from 'otplib';

// #613: the TOTP secret (the seed of every 6-digit code) was stored in the
// clear, so any copy of the database — the nightly backup, a downloaded dump —
// gave every member's codes. It is now encrypted with CONFIG_ENCRYPTION_KEY,
// like the SMTP password; a secret stored before keeps working and is
// encrypted after its next successful check. Real otplib and crypto here.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    session: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    trustedDevice: { updateMany: vi.fn() },
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(async (value: string) => `hash(${value})`),
    compare: vi.fn(async (value: string, hash: string) => hash === `hash(${value})`),
  },
}));

vi.mock('../../src/services/notification.service', () => ({
  notificationService: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../src/services/system-config.service', () => ({
  systemConfigService: { getEffectivePublicUrl: vi.fn().mockResolvedValue('https://glou.example') },
}));

vi.mock('../../src/services/audit.service', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../../src/lib/prisma';
import { decrypt, encrypt } from '../../src/lib/crypto';
import { authService } from '../../src/services/auth.service';

const deviceInfo = { userAgent: 'test-agent', ip: '127.0.0.1' };
const SECRET = authenticator.generateSecret();

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    username: 'mum',
    email: 'mum@example.com',
    passwordHash: 'hash(pw)',
    isAdmin: true,
    isActive: true,
    isTwoFactorEnabled: true,
    twoFactorSecret: encrypt(SECRET),
    backupCodes: [],
    twoFactorFailedAttempts: 0,
    twoFactorLockedUntil: null,
    ...overrides,
  };
}

type UpdateManyArgs = { where: Record<string, unknown>; data: { twoFactorSecret?: string } };
const secretWrites = () => (vi.mocked(prisma.user.updateMany).mock.calls as unknown as Array<[UpdateManyArgs]>)
  .map(([args]) => args)
  .filter((args) => args.data.twoFactorSecret !== undefined);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
  process.env.CONFIG_ENCRYPTION_KEY = 'cd'.repeat(32);
  vi.mocked(prisma.user.update).mockResolvedValue(userRow() as never);
  vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ language: 'FR', notifLanguage: null } as never);
  vi.mocked(prisma.session.create).mockResolvedValue({ id: 's1' } as never);
  vi.mocked(prisma.session.findMany).mockResolvedValue([] as never);
});

describe('a newly generated 2FA secret (#613)', () => {
  it('reaches the database encrypted, never in the clear', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(userRow({ isTwoFactorEnabled: false, twoFactorSecret: null }) as never);

    const { secret } = await authService.generateTwoFactorSecret('u1');

    const stored = (vi.mocked(prisma.user.update).mock.calls[0][0] as { data: { twoFactorSecret: string } }).data.twoFactorSecret;
    expect(stored).not.toContain(secret);
    expect(decrypt(stored)).toBe(secret);
  });

  it('turns 2FA on with a code from the app', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(userRow({ isTwoFactorEnabled: false }) as never);

    const { backupCodes } = await authService.turnOnTwoFactorAuthentication('u1', 'pw', authenticator.generate(SECRET), deviceInfo);

    expect(backupCodes).toHaveLength(10);
    expect(secretWrites()).toHaveLength(0);
  });

  it('signs in with a current code, and leaves the encrypted secret alone', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(userRow() as never);

    const { token } = await authService.verifyTwoFactorLogin('u1', authenticator.generate(SECRET), false, deviceInfo);

    expect(token).toBeTruthy();
    expect(secretWrites()).toHaveLength(0);
  });
});

describe('a secret stored in the clear before #613', () => {
  it('still signs in, then is stored encrypted', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(userRow({ twoFactorSecret: SECRET }) as never);

    const { token } = await authService.verifyTwoFactorLogin('u1', authenticator.generate(SECRET), false, deviceInfo);

    expect(token).toBeTruthy();
    const writes = secretWrites();
    expect(writes).toHaveLength(1);
    // Only if it was not changed in between (2FA turned off, a new secret).
    expect(writes[0].where).toEqual({ id: 'u1', twoFactorSecret: SECRET });
    expect(writes[0].data.twoFactorSecret).not.toContain(SECRET);
    expect(decrypt(writes[0].data.twoFactorSecret!)).toBe(SECRET);
  });

  it('passes the admin step-up, then is stored encrypted', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(userRow({ twoFactorSecret: SECRET }) as never);

    await authService.reauthenticateAdmin('u1', { password: 'pw', code: authenticator.generate(SECRET) }, deviceInfo, { action: 'CONFIG_UPDATE', details: {} });

    expect(secretWrites()).toHaveLength(1);
    expect(decrypt(secretWrites()[0].data.twoFactorSecret!)).toBe(SECRET);
  });

  it('turns 2FA on (secret generated before the update), then is stored encrypted', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(userRow({ isTwoFactorEnabled: false, twoFactorSecret: SECRET }) as never);

    await authService.turnOnTwoFactorAuthentication('u1', 'pw', authenticator.generate(SECRET), deviceInfo);

    expect(secretWrites()).toHaveLength(1);
  });

  it('is not rewritten after a wrong code', async () => {
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(userRow({ twoFactorSecret: SECRET }) as never);
    vi.mocked(prisma.user.update).mockResolvedValue({ twoFactorFailedAttempts: 1 } as never);
    const current = authenticator.generate(SECRET);

    await expect(authService.verifyTwoFactorLogin('u1', current === '000000' ? '111111' : '000000', false, deviceInfo))
      .rejects.toThrow('INVALID_TOTP_CODE');

    expect(secretWrites()).toHaveLength(0);
  });
});
