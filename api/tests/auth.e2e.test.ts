import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authService } from '../src/services/auth.service';
import { prisma } from '../src/lib/prisma';
import speakeasy from 'speakeasy';
import { Theme, Language, TempUnit, DateFormat } from '@prisma/client';

// ─── GitHub issue #7 ────────────────────────────────────────────────────────
// End-to-end smoke test of the auth module's most security-critical path:
// register → login → enable 2FA → log back in with a TOTP code.
// Only Prisma is mocked (as a tiny in-memory store below); bcrypt, jsonwebtoken
// and speakeasy run for real, so this actually exercises password hashing,
// token signing and TOTP verification instead of asserting against stubs.

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    trustedDevice: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    // login()/verifyTwoFactorLogin() fire-and-forget a "new device" security
    // notification, which reads this model via systemConfigService — without
    // it, `prisma.systemConfig` is undefined and the notification pipeline
    // throws (caught internally, but it pollutes CI logs with a misleading
    // stack trace and is worth mocking cleanly).
    systemConfig: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const deviceInfo = { userAgent: 'smoke-test-agent', ip: '127.0.0.1' };

function baseUserRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    username: 'smoketest',
    email: 'smoke@example.com',
    passwordHash: '',
    displayName: 'Smoke Test',
    avatarUrl: null,
    appName: null,
    appSlogan: null,
    theme: Theme.LIGHT,
    language: Language.FR,
    tempUnit: TempUnit.CELSIUS,
    accentColor: '#6366f1',
    dateFormat: DateFormat.SYSTEM,
    expertMode: false,
    isAdmin: false,
    isActive: true,
    isTwoFactorEnabled: false,
    twoFactorSecret: null as string | null,
    backupCodes: [] as string[],
    deletionRequestedAt: null,
    pinHash: null,
    autoLockDelayMin: null,
    onboardingCompletedAt: null,
    notifLanguage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Auth e2e smoke test (register -> login -> 2FA)', () => {
  // In-memory "database" backing the mocked Prisma client, mutated as the
  // flow below progresses — mirrors what real rows would look like.
  let store: ReturnType<typeof baseUserRecord> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    store = null;
    process.env.JWT_SECRET = 'smoke-test-secret';

    vi.mocked(prisma.user.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findFirst).mockImplementation(async () => store as never);
    vi.mocked(prisma.user.findUnique).mockImplementation(async () => store as never);
    vi.mocked(prisma.user.findUniqueOrThrow).mockImplementation(async () => {
      if (!store) throw new Error('NOT_FOUND');
      return store as never;
    });
    vi.mocked(prisma.user.create).mockImplementation(async ({ data }: any) => {
      store = baseUserRecord({ ...data });
      return store as never;
    });
    vi.mocked(prisma.user.update).mockImplementation(async ({ data }: any) => {
      if (!store) throw new Error('NOT_FOUND');
      store = { ...store, ...data };
      return store as never;
    });
    vi.mocked(prisma.session.create).mockResolvedValue({ id: 'session-1' } as never);
    vi.mocked(prisma.session.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.trustedDevice.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.systemConfig.findUnique).mockResolvedValue({ id: 'singleton', publicUrl: null } as never);
    vi.mocked(prisma.systemConfig.create).mockResolvedValue({ id: 'singleton', publicUrl: null } as never);
  });

  // This test runs real bcrypt (cost 12) several times over — one hash on
  // register, a handful of compares across the two logins, and 10 concurrent
  // hashes for the 2FA backup codes. That's deliberate (see the file header),
  // but it's real CPU work, not a mock — comfortably over Vitest's 5s default
  // on a slower/shared CI runner, hence the explicit timeout below.
  it('registers, logs in, enables 2FA, and logs back in with a TOTP code', async () => {
    // 1. Register
    const { user: registeredUser, token: registerToken } = await authService.register(
      {
        username: 'smoketest',
        email: 'smoke@example.com',
        password: 'correct-horse-battery-staple',
        displayName: 'Smoke Test',
      } as never,
      deviceInfo,
    );
    expect(registeredUser.username).toBe('smoketest');
    expect(registerToken).toEqual(expect.any(String));
    expect(store).not.toBeNull();
    expect(store!.passwordHash).not.toBe('correct-horse-battery-staple'); // actually hashed

    // 2. Login with the just-registered credentials (no 2FA yet)
    const loginResult = await authService.login(
      { identifier: 'smoketest', password: 'correct-horse-battery-staple' } as never,
      deviceInfo,
    );
    expect(loginResult.requires2fa).toBeUndefined();
    expect(loginResult.token).toEqual(expect.any(String));

    // A wrong password must still be rejected at this stage.
    await expect(
      authService.login({ identifier: 'smoketest', password: 'wrong-password' } as never, deviceInfo),
    ).rejects.toThrow('INVALID_CREDENTIALS');

    // 3. Generate a 2FA secret and turn it on with a real TOTP code
    const { secret } = await authService.generateTwoFactorSecret(store!.id);
    expect(store!.twoFactorSecret).toBe(secret);

    const firstCode = speakeasy.totp({ secret, encoding: 'base32' });
    const { backupCodes } = await authService.turnOnTwoFactorAuthentication(store!.id, firstCode, deviceInfo);
    expect(store!.isTwoFactorEnabled).toBe(true);
    expect(backupCodes).toHaveLength(10);

    // Generating a second secret once 2FA is already enabled must be rejected.
    await expect(authService.generateTwoFactorSecret(store!.id)).rejects.toThrow('2FA_ALREADY_ENABLED');

    // 4. Log back in: the password alone is no longer enough.
    const secondLogin = await authService.login(
      { identifier: 'smoketest', password: 'correct-horse-battery-staple' } as never,
      deviceInfo,
    );
    expect(secondLogin.requires2fa).toBe(true);

    // 5. Complete the 2FA challenge with a fresh TOTP code.
    const secondCode = speakeasy.totp({ secret, encoding: 'base32' });
    const finalResult = await authService.verifyTwoFactorLogin(store!.id, secondCode, false, deviceInfo);
    expect(finalResult.token).toEqual(expect.any(String));
    expect(finalResult.user.username).toBe('smoketest');

    // An incorrect TOTP code must be rejected, not silently accepted.
    await expect(
      authService.verifyTwoFactorLogin(store!.id, '000000', false, deviceInfo),
    ).rejects.toThrow('INVALID_TOTP_CODE');
  }, 20000);
});
