import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import bcrypt from 'bcryptjs';

// #914: wrong passwords at sign-in had only a per-address limit. With
// `trust proxy 1` and no proxy in front, the client picks its own address
// through X-Forwarded-For, so each forged address got 20 fresh guesses.
// Every request below comes from a new forged address: only the per-account
// budget can stop them. Through the real app; only the database is stubbed.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    session: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
  },
  connectWithRetry: vi.fn(),
}));

import { prisma } from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import { SIGN_IN_FAILURES_MAX } from '../../src/lib/rate-limit';

const JWT_SECRET = 'signin-limit-test-secret';
const PASSWORD = 'the-right-password';
let passwordHash = '';

const app = createApp();
let lastOctet = 0;
// A new forged client address for every request, so the per-address limiter
// (20 per window) never trips.
const nextIp = () => {
  lastOctet += 1;
  return `203.0.${Math.floor(lastOctet / 250) % 250}.${(lastOctet % 250) + 1}`;
};
const signIn = (identifier: string, password: string) =>
  request(app).post('/api/auth/login').set('Sec-Fetch-Site', 'same-origin').set('X-Forwarded-For', nextIp()).send({ identifier, password });

const userRow = (name: string) => ({
  id: `id-${name}`, username: name, email: `${name}@example.com`, passwordHash, isActive: true, isAdmin: false,
  isTwoFactorEnabled: false, twoFactorSecret: null, avatarUrl: null, appName: null, appSlogan: null, displayName: null,
  theme: 'SYSTEM', language: 'EN', tempUnit: 'CELSIUS', accentColor: '#000000', dateFormat: 'DD_MM_YYYY', expertMode: false,
  createdAt: new Date(), deletionRequestedAt: null, pinHash: null, autoLockDelayMin: null, onboardingCompletedAt: new Date(),
  mustChangePassword: false, backupCodes: [], twoFactorFailedAttempts: 0, twoFactorLockedUntil: null, notifLanguage: null,
});
const KNOWN = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'gina', 'hank', 'ivan'];

const sessionsCreated = () => vi.mocked(prisma.session.create).mock.calls.length;

async function wrongGuesses(identifier: string, count: number) {
  for (let i = 0; i < count; i++) {
    const res = await signIn(identifier, `guess-${i}`);
    expect(res.status, `guess ${i + 1} on ${identifier}`).toBe(401);
    expect(res.body).toEqual({ error: 'INVALID_CREDENTIALS' });
  }
}

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = JWT_SECRET;
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as never);
  vi.mocked(prisma.user.findFirst).mockImplementation((async (args: { where: { OR?: Array<{ username?: string; email?: string }>; id?: string } }) => {
    const wanted = args.where.OR?.flatMap((c) => [c.username, c.email]) ?? [];
    const name = KNOWN.find((n) => wanted.includes(n) || wanted.includes(`${n}@example.com`) || args.where.id === `id-${n}`);
    return name ? userRow(name) : null;
  }) as never);
  vi.mocked(prisma.user.findUnique).mockImplementation((async (args: { where: { id: string } }) => userRow(args.where.id.replace(/^id-/, ''))) as never);
  vi.mocked(prisma.user.findUniqueOrThrow).mockImplementation((async (args: { where: { id: string } }) => userRow(args.where.id.replace(/^id-/, ''))) as never);
  vi.mocked(prisma.user.update).mockImplementation((async (args: { where: { id: string } }) => userRow(args.where.id.replace(/^id-/, ''))) as never);
  vi.mocked(prisma.session.findUnique).mockResolvedValue({ revokedAt: null, expiresAt: new Date(Date.now() + 3_600_000) } as never);
  vi.mocked(prisma.session.update).mockResolvedValue({} as never);
  vi.mocked(prisma.session.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.session.create).mockResolvedValue({ id: 'new-session' } as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/auth/login per-account limit (#914)', () => {
  it('refuses the next guess once the budget is spent, from whatever address, even with the right password', async () => {
    await wrongGuesses('alice', SIGN_IN_FAILURES_MAX);

    const res = await signIn('alice', PASSWORD);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'TOO_MANY_REQUESTS', retryAfter: expect.any(Number) });
    expect(sessionsCreated()).toBe(0);
  });

  it('answers an unknown identifier exactly like an existing account (#607)', async () => {
    await wrongGuesses('nobody-here', SIGN_IN_FAILURES_MAX);

    const res = await signIn('nobody-here', 'whatever');
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'TOO_MANY_REQUESTS', retryAfter: expect.any(Number) });
  });

  it('does not give a second budget to the same identifier with extra spaces or another case', async () => {
    // The lookup is exact: these variants find no account, so guessing on
    // them is guessing nothing. They must not reach the account either.
    await wrongGuesses('bob', SIGN_IN_FAILURES_MAX);
    expect((await signIn('bob', PASSWORD)).status).toBe(429);
    expect((await signIn(' bob', PASSWORD)).status).toBe(401);
    expect((await signIn('BOB', PASSWORD)).status).toBe(401);
    expect(sessionsCreated()).toBe(0);
  });

  it('holds against guesses sent all at once', async () => {
    const answers = await Promise.all(Array.from({ length: 3 * SIGN_IN_FAILURES_MAX }, (_, i) => signIn('hank', `burst-${i}`)));
    expect(answers.filter((r) => r.status === 401)).toHaveLength(SIGN_IN_FAILURES_MAX);
    expect(answers.filter((r) => r.status === 429)).toHaveLength(2 * SIGN_IN_FAILURES_MAX);
  });

  it('does not tell, through rate-limit headers, how many recent failures an identifier has', async () => {
    await wrongGuesses('ivan', 1);
    const probe = await signIn('ivan', 'another-guess');
    const fresh = await signIn('nobody-ever-tried', 'a-guess');
    // Whatever the per-address limiter says, both answers carry the same headers.
    expect(probe.headers['ratelimit-remaining']).toBe(fresh.headers['ratelimit-remaining']);
    expect(probe.headers['ratelimit']).toBe(fresh.headers['ratelimit']);
  });

  it('leaves other accounts alone', async () => {
    await wrongGuesses('carol', SIGN_IN_FAILURES_MAX);
    expect((await signIn('carol', PASSWORD)).status).toBe(429);

    const res = await signIn('dave', PASSWORD);
    expect(res.status).toBe(200);
    expect(sessionsCreated()).toBe(1);
  });

  it('does not reset the count on a successful sign-in', async () => {
    await wrongGuesses('erin', SIGN_IN_FAILURES_MAX - 1);
    expect((await signIn('erin', PASSWORD)).status).toBe(200);
    // The success is not counted, and the earlier failures still are.
    await wrongGuesses('erin', 1);
    expect((await signIn('erin', 'guess-again')).status).toBe(429);
  });

  it('is time-boxed: the account can sign in again once the window is over', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    await wrongGuesses('frank', SIGN_IN_FAILURES_MAX);
    expect((await signIn('frank', PASSWORD)).status).toBe(429);

    vi.setSystemTime(Date.now() + 15 * 60 * 1000 + 1000);
    const res = await signIn('frank', PASSWORD);
    expect(res.status).toBe(200);
  });

  it('keeps a budget apart from the signed-in step-up checks, so a stranger cannot lock the member out of them', async () => {
    // A stranger spends gina's sign-in budget from the outside; her own
    // session can still check her password.
    await wrongGuesses('gina', SIGN_IN_FAILURES_MAX);
    expect((await signIn('gina', PASSWORD)).status).toBe(429);
    const token = jwt.sign({ userId: 'id-gina', email: 'gina@example.com', scope: 'full', sessionId: 's1' }, JWT_SECRET, { algorithm: 'HS256' });
    const res = await request(app)
      .patch('/api/user/password')
      .set('Authorization', `Bearer ${token}`)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('X-Forwarded-For', nextIp())
      .send({ currentPassword: 'not-it', newPassword: 'another-long-password' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });
});
