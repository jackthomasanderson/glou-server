import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { authService } from '../src/services/auth.service';
import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Prisma, Theme, Language, TempUnit, DateFormat } from '@prisma/client';
import { RELEASE_NOTES, seenStateNow } from '../src/lib/release-notes';
import { APP_VERSION } from '../src/lib/app-version';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    trustedDevice: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    // login() fire-and-forgets a "new device" security notification, which
    // reads prisma.user.findUnique + prisma.systemConfig (via
    // systemConfigService.getEffectivePublicUrl). Without these, that
    // pipeline throws internally — harmless (caught) but it was printing a
    // misleading stack trace on every test run.
    systemConfig: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// A neutral device fingerprint reused across register/login test cases (FEAT-25).
const deviceInfo = { userAgent: 'test-agent', ip: '127.0.0.1' };

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(),
  },
}));

describe('AuthService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, JWT_SECRET: 'test-secret' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('register', () => {
    const validData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123456',
      displayName: 'Test User',
    };

    it('should create a user and return a token when data is valid', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.user.count).mockResolvedValue(0);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashedPassword' as never);
      const mockCreatedUser = {
        id: '1',
        username: validData.username,
        email: validData.email,
        displayName: validData.displayName,
        avatarUrl: null,
        appName: null,
        appSlogan: null,
        theme: Theme.LIGHT,
        language: Language.FR,
        tempUnit: TempUnit.CELSIUS,
        accentColor: '#6366f1',
        dateFormat: DateFormat.SYSTEM,
        isTwoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: [],
        // ISSUE_043: per-account 2FA brute-force counters.
        twoFactorFailedAttempts: 0,
        twoFactorLockedUntil: null,
        isAdmin: false,
        isActive: true,
        passwordHash: 'hashedPassword',
        deletionRequestedAt: null,
        expertMode: false,
        pinHash: null,
        autoLockDelayMin: null,
        onboardingCompletedAt: null,
        lastSeenReleaseVersion: null,
        seenReleaseNoteIds: [],
        mustChangePassword: false,
        notifEmail: false,
        notifWebhook: false,
        notifCategories: [],
        notifQuietStart: null,
        notifQuietEnd: null,
        notifLanguage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.user.create).mockResolvedValue(mockCreatedUser);
      vi.mocked(prisma.session.create).mockResolvedValue({ id: 'session-1' } as any);
      vi.mocked(jwt.sign).mockReturnValue('mock-jwt-token' as never);

      const result = await authService.register(validData, deviceInfo);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ username: validData.username }, { email: validData.email }] },
        select: { id: true },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(validData.password, 12);
      // ISSUE_085: accepted by the schema, must actually reach the DB write.
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ displayName: validData.displayName }) }),
      );
      expect(result.token).toBe('mock-jwt-token');
      expect(result.user.username).toBe(validData.username);
    });

    it('throws a single REGISTRATION_CONFLICT code for either a taken username or email (ISSUE_015: no enumeration)', async () => {
      vi.mocked(prisma.user.count).mockResolvedValue(1);
      vi.mocked(prisma.systemConfig.findUnique).mockResolvedValue({ registrationOpen: true } as any);
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'u1' } as any);

      await expect(authService.register(validData, deviceInfo)).rejects.toThrow('REGISTRATION_CONFLICT');
    });

    // #467 review: two sign-ups with the same username or e-mail at once both
    // pass the check above; the database's unique index refuses the second.
    it('throws REGISTRATION_CONFLICT when the unique index refuses a concurrent sign-up', async () => {
      vi.mocked(prisma.user.count).mockResolvedValue(1);
      vi.mocked(prisma.systemConfig.findUnique).mockResolvedValue({ registrationOpen: true } as any);
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
      );

      await expect(authService.register(validData, deviceInfo)).rejects.toThrow('REGISTRATION_CONFLICT');
    });

    it('throws REGISTRATION_CLOSED for a non-admin signup once registration is closed (#73)', async () => {
      vi.mocked(prisma.user.count).mockResolvedValue(1);
      vi.mocked(prisma.systemConfig.findUnique).mockResolvedValue({ registrationOpen: false } as any);

      await expect(authService.register(validData, deviceInfo)).rejects.toThrow('REGISTRATION_CLOSED');
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('lets the first account through even though registration is closed by default (#73)', async () => {
      vi.mocked(prisma.user.count).mockResolvedValue(0);
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashedPassword' as never);
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: '1',
        username: validData.username,
        email: validData.email,
        displayName: validData.displayName,
        avatarUrl: null,
        appName: null,
        appSlogan: null,
        theme: Theme.LIGHT,
        language: Language.FR,
        tempUnit: TempUnit.CELSIUS,
        accentColor: '#6366f1',
        dateFormat: DateFormat.SYSTEM,
        isTwoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: [],
        twoFactorFailedAttempts: 0,
        twoFactorLockedUntil: null,
        isAdmin: true,
        isActive: true,
        passwordHash: 'hashedPassword',
        deletionRequestedAt: null,
        expertMode: false,
        pinHash: null,
        autoLockDelayMin: null,
        onboardingCompletedAt: null,
        lastSeenReleaseVersion: null,
        seenReleaseNoteIds: [],
        mustChangePassword: false,
        notifEmail: false,
        notifWebhook: false,
        notifCategories: [],
        notifQuietStart: null,
        notifQuietEnd: null,
        notifLanguage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      vi.mocked(prisma.session.create).mockResolvedValue({ id: 'session-1' } as any);
      vi.mocked(jwt.sign).mockReturnValue('mock-jwt-token' as never);

      const result = await authService.register(validData, deviceInfo);

      expect(prisma.systemConfig.findUnique).not.toHaveBeenCalled();
      expect(result.user.isAdmin).toBe(true);
      // FEAT-115 (#990): on a new install the installed version counts as
      // seen — the What's New? window first opens at the next update.
      const created = vi.mocked(prisma.user.create).mock.calls[0][0] as { data: Record<string, unknown> };
      expect(created.data).toMatchObject({ lastSeenReleaseVersion: seenStateNow(RELEASE_NOTES, APP_VERSION).lastSeenReleaseVersion });
      expect(created.data.seenReleaseNoteIds).toEqual(seenStateNow(RELEASE_NOTES, APP_VERSION).seenReleaseNoteIds);
    });

    it('records no release notes seen for a member, who never sees them (#990)', async () => {
      vi.mocked(prisma.user.count).mockResolvedValue(1);
      vi.mocked(prisma.systemConfig.findUnique).mockResolvedValue({ registrationOpen: true } as any);
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue({ id: '2', isAdmin: false, createdAt: new Date() } as any);
      vi.mocked(prisma.session.create).mockResolvedValue({ id: 'session-2' } as any);
      vi.mocked(jwt.sign).mockReturnValue('mock-jwt-token' as never);

      await authService.register(validData, deviceInfo);

      const created = vi.mocked(prisma.user.create).mock.calls[0][0] as { data: Record<string, unknown> };
      expect(created.data).not.toHaveProperty('lastSeenReleaseVersion');
    });
  });

  describe('login', () => {
    const loginData = {
      identifier: 'testuser',
      password: 'password123456',
      rememberMe: false,
    };

    const mockUser = {
      id: '1',
      username: 'testuser',
      email: 'test@example.com',
      displayName: 'Test User',
      passwordHash: 'hashedPassword',
      avatarUrl: null,
      appName: null,
      appSlogan: null,
      theme: Theme.LIGHT,
      language: Language.FR,
      tempUnit: TempUnit.CELSIUS,
      accentColor: '#6366f1',
      dateFormat: DateFormat.SYSTEM,
      isTwoFactorEnabled: false,
      twoFactorSecret: null,
      backupCodes: [],
      // ISSUE_043: per-account 2FA brute-force counters.
      twoFactorFailedAttempts: 0,
      twoFactorLockedUntil: null,
      isAdmin: false,
      isActive: true,
      deletionRequestedAt: null,
      expertMode: false,
      pinHash: null,
      autoLockDelayMin: null,
      onboardingCompletedAt: null,
      lastSeenReleaseVersion: null,
      seenReleaseNoteIds: [],
      mustChangePassword: false,
      notifEmail: false,
      notifWebhook: false,
      notifCategories: [],
      notifQuietStart: null,
      notifQuietEnd: null,
      notifLanguage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return user and token for valid credentials', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(prisma.session.create).mockResolvedValue({ id: 'session-1' } as any);
      // login() now calls isKnownDeviceLocation() (FEAT-29, new-device
      // notification), which reads prisma.session.findMany — added to the
      // service after this mock was written. Empty array = no known
      // sessions yet, matching a fresh test user.
      vi.mocked(prisma.session.findMany).mockResolvedValue([]);
      // Fire-and-forget "new device" notification path (not asserted on
      // directly here, just needs to resolve instead of throwing).
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ language: mockUser.language, notifLanguage: null } as never);
      vi.mocked(prisma.systemConfig.findUnique).mockResolvedValue({ id: 'singleton', publicUrl: null } as never);
      vi.mocked(jwt.sign).mockReturnValue('mock-jwt-token' as never);

      const result = await authService.login(loginData, deviceInfo);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ username: loginData.identifier }, { email: loginData.identifier }] },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(loginData.password, mockUser.passwordHash);
      expect(result.token).toBe('mock-jwt-token');
      expect(result.user.username).toBe(mockUser.username);
    });

    it('should throw INVALID_CREDENTIALS if user not found', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      await expect(authService.login(loginData, deviceInfo)).rejects.toThrow('INVALID_CREDENTIALS');
    });

    it('should throw INVALID_CREDENTIALS if password does not match', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(authService.login(loginData, deviceInfo)).rejects.toThrow('INVALID_CREDENTIALS');
    });

    // #607: an unknown identifier used to be refused at once, an existing
    // one only after a ~0.2 s bcrypt comparison — the delay told who has an
    // account. Every refusal now costs one comparison.
    it('runs one bcrypt comparison for an unknown identifier too (#607)', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await expect(authService.login(loginData, deviceInfo)).rejects.toThrow('INVALID_CREDENTIALS');
      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
      expect(vi.mocked(bcrypt.compare).mock.calls[0][0]).toBe(loginData.password);
    });

    it('runs one bcrypt comparison for a deactivated account, and still refuses the right password (#607)', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...mockUser, isActive: false });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await expect(authService.login(loginData, deviceInfo)).rejects.toThrow('ACCOUNT_DEACTIVATED');
      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
    });
  });

  // ISSUE_045: minting a trusted device (a lasting 2FA bypass) previously
  // required no re-confirmation of identity at all.
  describe('trustCurrentDevice', () => {
    const mockUserNo2fa = {
      id: 'u1',
      passwordHash: 'hashed',
      isTwoFactorEnabled: false,
      twoFactorSecret: null,
      backupCodes: [] as string[],
    };

    const mockUser2fa = { ...mockUserNo2fa, isTwoFactorEnabled: true, twoFactorSecret: 'SECRET' };

    it('rejects a wrong password without creating a trusted device', async () => {
      vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(mockUser2fa as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(
        authService.trustCurrentDevice('u1', deviceInfo, 'wrong-password'),
      ).rejects.toThrow('INVALID_CREDENTIALS');
      expect(prisma.trustedDevice.create).not.toHaveBeenCalled();
    });

    // #766: with 2FA off there is no code to skip.
    it('refuses when 2FA is off, even with the right password', async () => {
      vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(mockUserNo2fa as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await expect(
        authService.trustCurrentDevice('u1', deviceInfo, 'correct-password'),
      ).rejects.toThrow('TWO_FACTOR_DISABLED');
      expect(prisma.trustedDevice.create).not.toHaveBeenCalled();
    });

    it('requires a valid TOTP code when 2FA is enabled, even with the right password', async () => {
      vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({
        ...mockUserNo2fa, isTwoFactorEnabled: true, twoFactorSecret: 'SECRET',
      } as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await expect(
        authService.trustCurrentDevice('u1', deviceInfo, 'correct-password'),
      ).rejects.toThrow('INVALID_CODE');
      expect(prisma.trustedDevice.create).not.toHaveBeenCalled();
    });
  });
});
