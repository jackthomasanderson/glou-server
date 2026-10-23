import { describe, it, expect, expectTypeOf, beforeEach, vi } from 'vitest';

// #576: the web shows whether 2FA is on, offers the "Disable" button and asks
// for a code before trusting a device, all from the user object the API sends
// back. That object never carried the 2FA flag: the `select` feeding it was
// copied by hand at every call site and none of the copies listed the column.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    session: {
      create: vi.fn(),
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

import bcrypt from 'bcryptjs';
import { prisma } from '../../src/lib/prisma';
import { authService } from '../../src/services/auth.service';
import type { PublicUser } from '../../../shared/auth';

const deviceInfo = { userAgent: 'test-agent', ip: '127.0.0.1' };

/**
 * A User row as the database stores it, secrets included. The mocked Prisma
 * client ignores `select`, so anything that reaches the result got there
 * through the service's own whitelist.
 */
function storedUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    username: 'tester',
    email: 'tester@example.com',
    passwordHash: 'stored-password-hash',
    avatarUrl: null,
    appName: null,
    appSlogan: null,
    displayName: 'Tester',
    theme: 'LIGHT',
    language: 'FR',
    tempUnit: 'CELSIUS',
    accentColor: '#6366f1',
    dateFormat: 'SYSTEM',
    expertMode: false,
    isAdmin: false,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    deletionRequestedAt: null,
    pinHash: 'stored-pin-hash',
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

/** The columns of an account with two-factor authentication turned on. */
const twoFactorOn = {
  isTwoFactorEnabled: true,
  twoFactorSecret: 'TOTP-SECRET',
  backupCodes: ['hashed-backup-code'],
};

/** Every field the web may read from the user — and nothing else. */
const PUBLIC_USER_FIELDS = [
  'accentColor', 'appName', 'appSlogan', 'autoLockDelayMin', 'avatarUrl',
  'createdAt', 'dateFormat', 'deletionRequestedAt', 'displayName', 'email',
  'expertMode', 'hasPin', 'id', 'isAdmin', 'isTwoFactorEnabled', 'language',
  'mustChangePassword', 'onboardingCompletedAt', 'tempUnit', 'theme', 'username',
] as const;

// #466: the list is the shared contract's keys, no more, no less — a field
// added to shared/auth.ts fails typecheck here until the list names it.
expectTypeOf<(typeof PUBLIC_USER_FIELDS)[number]>().toEqualTypeOf<keyof PublicUser>();

/** Columns that must never leave the server. */
const SECRET_COLUMNS = ['passwordHash', 'pinHash', 'twoFactorSecret', 'backupCodes'];

/**
 * The `select` passed on the first call to a mocked Prisma method. Loosely
 * typed on purpose: Prisma's generic signatures make `mock.calls` awkward to
 * read with their real types.
 */
function selectSentTo(method: unknown): unknown {
  const calls = (method as { mock: { calls: Array<[{ select?: unknown }]> } }).mock.calls;
  return calls[0][0].select;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
});

describe('authService.me — the user the web loads on every page (#576)', () => {
  it('reports two-factor authentication as enabled for an account that has it on', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(storedUser(twoFactorOn) as never);

    const user = await authService.me('u1');

    expect(user?.isTwoFactorEnabled).toBe(true);
  });

  it('reports two-factor authentication as disabled for an account without it', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(storedUser() as never);

    const user = await authService.me('u1');

    expect(user?.isTwoFactorEnabled).toBe(false);
  });

  it('reads the 2FA flag from the database, but no password, TOTP secret or backup code', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(storedUser() as never);

    await authService.me('u1');

    const select = selectSentTo(prisma.user.findFirst);
    expect(select).toMatchObject({ isTwoFactorEnabled: true });
    expect(select).not.toHaveProperty('passwordHash');
    expect(select).not.toHaveProperty('twoFactorSecret');
    expect(select).not.toHaveProperty('backupCodes');
  });

  it('answers with exactly the public fields the web relies on', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(storedUser(twoFactorOn) as never);

    const user = await authService.me('u1');

    expect(Object.keys(user ?? {}).sort()).toEqual([...PUBLIC_USER_FIELDS].sort());
  });

  it('never hands back a password hash, PIN hash, TOTP secret or backup code', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(storedUser(twoFactorOn) as never);

    const user = await authService.me('u1');

    for (const column of SECRET_COLUMNS) {
      expect(user, column).not.toHaveProperty(column);
    }
    // The PIN only surfaces as a yes/no.
    expect(user?.hasPin).toBe(true);
  });
});

describe('every other call that answers with the user matches me() (#576)', () => {
  /** The `select` me() sends: the reference every other read must match. */
  async function selectUsedByMe(): Promise<unknown> {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(storedUser() as never);
    await authService.me('u1');
    return selectSentTo(prisma.user.findFirst);
  }

  const callsThatAnswerWithTheUser: Array<{
    name: string;
    arrange: () => void;
    run: () => Promise<PublicUser>;
    sentSelect: () => unknown;
  }> = [
    {
      name: 'register',
      arrange: () => {
        vi.mocked(prisma.user.count).mockResolvedValue(0);
        vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
        vi.mocked(bcrypt.hash).mockResolvedValue('new-password-hash' as never);
        vi.mocked(prisma.user.create).mockResolvedValue(storedUser({ isAdmin: true }) as never);
        vi.mocked(prisma.session.create).mockResolvedValue({ id: 'session-1' } as never);
      },
      run: async () => (await authService.register(
        { username: 'tester', email: 'tester@example.com', password: 'a-long-enough-password' },
        deviceInfo,
      )).user,
      sentSelect: () => selectSentTo(prisma.user.create),
    },
    {
      name: 'updateProfile',
      arrange: () => {
        vi.mocked(prisma.user.update).mockResolvedValue(storedUser(twoFactorOn) as never);
      },
      run: () => authService.updateProfile('u1', { displayName: 'New name' }),
      sentSelect: () => selectSentTo(prisma.user.update),
    },
    {
      name: 'updateEmail',
      arrange: () => {
        vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(
          { passwordHash: 'stored-password-hash', email: 'tester@example.com' } as never,
        );
        vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
        vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
        vi.mocked(prisma.user.update).mockResolvedValue(storedUser(twoFactorOn) as never);
      },
      // Same address as before, so no "email changed" notification goes out.
      run: () => authService.updateEmail('u1', 'tester@example.com', 'current-password', deviceInfo),
      sentSelect: () => selectSentTo(prisma.user.update),
    },
    {
      name: 'updatePreferences',
      arrange: () => {
        vi.mocked(prisma.user.update).mockResolvedValue(storedUser(twoFactorOn) as never);
      },
      run: () => authService.updatePreferences('u1', { theme: 'DARK' }),
      sentSelect: () => selectSentTo(prisma.user.update),
    },
    {
      name: 'completeOnboarding',
      arrange: () => {
        vi.mocked(prisma.user.update).mockResolvedValue(storedUser(twoFactorOn) as never);
      },
      run: () => authService.completeOnboarding('u1'),
      sentSelect: () => selectSentTo(prisma.user.update),
    },
  ];

  it.each(callsThatAnswerWithTheUser)(
    '$name reads the same columns as me() and answers with the same fields',
    async ({ arrange, run, sentSelect }) => {
      const selectOfMe = await selectUsedByMe();
      arrange();

      const user = await run();

      expect(sentSelect()).toEqual(selectOfMe);
      expect(Object.keys(user).sort()).toEqual([...PUBLIC_USER_FIELDS].sort());
    },
  );
});
