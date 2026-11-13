import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// #914: wrong passwords at sign-in had only a per-address limit. With
// `trust proxy 1` and no proxy in front, the client picks its own address
// through X-Forwarded-For, so each forged address got 20 fresh guesses.
// Every request below comes from a new forged address: only the per-account
// budget can stop them. Through the real app; only the database is stubbed.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn(), create: vi.fn() },
    session: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    trustedDevice: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
  connectWithRetry: vi.fn(),
}));

// #980: one address that geolocates abroad, for the trusted-device country rule.
const ABROAD_IP = '198.51.100.77';
vi.mock('../../src/lib/device', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/device')>();
  return { ...actual, countryOfIp: (ip: string | undefined) => (ip === ABROAD_IP ? 'DE' : actual.countryOfIp(ip)) };
});

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
const KNOWN = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'gina', 'hank', 'ivan', 'jade', 'kim', 'liam', 'mona', 'ned', 'olga', 'pia', 'quinn', 'rex',
  'sam', 'tina', 'uma', 'vic', 'walt', 'xena', 'yann', 'zoe', 'abel', 'beth', 'cleo', 'dora', 'newbie'];
// #980: these accounts have two-factor authentication on. A trusted device
// only exists on such an account (trusting needs 2FA, turning it off revokes them).
const WITH_2FA = new Set(['jade', 'kim', 'liam', 'mona', 'olga', 'pia']);
// #988: per-test changes to an account (a new password, 2FA turned on, deactivated).
type AccountChange = Partial<Omit<ReturnType<typeof userRow>, 'twoFactorSecret' | 'backupCodes'>> & { twoFactorSecret?: string | null; backupCodes?: string[] };
const changed = new Map<string, AccountChange>();
const accountRow = (name: string) => ({ ...userRow(name), isTwoFactorEnabled: WITH_2FA.has(name), ...changed.get(name) });

// #980: trusted devices, by the raw token their cookie carries.
interface DeviceRow { id: string; userId: string; tokenHash: string; revokedAt: Date | null; expiresAt: Date; country: string | null }
const devices = new Map<string, DeviceRow>();
const hashOf = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');
function trustDevice(owner: string, overrides: Partial<DeviceRow> = {}): string {
  const raw = `device-of-${owner}-${devices.size}`;
  devices.set(hashOf(raw), { id: `device-${devices.size}`, userId: `id-${owner}`, tokenHash: hashOf(raw), revokedAt: null, expiresAt: new Date(Date.now() + 86_400_000), country: null, ...overrides });
  return jwt.sign({ tdt: raw }, JWT_SECRET, { expiresIn: '30d' });
}
const signInFromDevice = (identifier: string, password: string, cookie: string, ip = nextIp()) =>
  request(app).post('/api/auth/login').set('Sec-Fetch-Site', 'same-origin').set('X-Forwarded-For', ip)
    .set('Cookie', `glou_trusted_device=${cookie}`).send({ identifier, password });
const lockAudits = () => vi.mocked(prisma.auditLog.create).mock.calls
  .map(([args]) => (args as { data: { userId: string; action: string; details: { reason?: string } } }).data)
  .filter((row) => row.action === 'LOGIN_FAILED' && row.details.reason === 'sign_in_locked');

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
    return name ? accountRow(name) : null;
  }) as never);
  changed.clear();
  vi.mocked(prisma.user.findUnique).mockImplementation((async (args: { where: { id: string } }) => {
    const name = args.where.id.replace(/^id-/, '');
    return KNOWN.includes(name) ? accountRow(name) : null;
  }) as never);
  vi.mocked(prisma.user.findUniqueOrThrow).mockImplementation((async (args: { where: { id: string } }) => accountRow(args.where.id.replace(/^id-/, ''))) as never);
  vi.mocked(prisma.user.update).mockImplementation((async (args: { where: { id: string }; data?: { passwordHash?: string } }) => {
    const name = args.where.id.replace(/^id-/, '');
    // #988: a new password is kept, so cookies bound to the old one stop working.
    if (args.data?.passwordHash) changed.set(name, { ...changed.get(name), passwordHash: args.data.passwordHash });
    return accountRow(name);
  }) as never);
  vi.mocked(prisma.user.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.user.create).mockImplementation((async (args: { data: { username: string; passwordHash: string } }) => {
    changed.set(args.data.username, { passwordHash: args.data.passwordHash });
    return accountRow(args.data.username);
  }) as never);
  vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.trustedDevice.updateMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.session.findUnique).mockResolvedValue({ revokedAt: null, expiresAt: new Date(Date.now() + 3_600_000) } as never);
  vi.mocked(prisma.session.update).mockResolvedValue({} as never);
  vi.mocked(prisma.session.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.session.create).mockResolvedValue({ id: 'new-session' } as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.trustedDevice.findUnique).mockImplementation((async (args: { where: { tokenHash: string }; select?: { user?: unknown } }) => {
    const row = devices.get(args.where.tokenHash);
    if (!row) return null;
    const owner = accountRow(row.userId.replace(/^id-/, ''));
    return { ...row, user: owner };
  }) as never);
  vi.mocked(prisma.trustedDevice.update).mockResolvedValue({} as never);
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

describe('POST /api/auth/login from a trusted device (#980)', () => {
  it('lets the member sign in from their trusted device while a stranger keeps their identifier locked', async () => {
    const cookie = trustDevice('jade');
    await wrongGuesses('jade', SIGN_IN_FAILURES_MAX);
    expect((await signIn('jade', PASSWORD)).status).toBe(429);

    const res = await signInFromDevice('jade', PASSWORD, cookie);
    expect(res.status).toBe(200);
    expect(sessionsCreated()).toBe(1);
    // Still locked for anyone without the cookie.
    expect((await signIn('jade', PASSWORD)).status).toBe(429);
  });

  it('works with the e-mail too, and skips the two-factor code like the trusted device does', async () => {
    const cookie = trustDevice('mona');
    await wrongGuesses('mona@example.com', SIGN_IN_FAILURES_MAX);
    const res = await signInFromDevice('mona@example.com', PASSWORD, cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.requires2fa).toBeUndefined();
    expect(sessionsCreated()).toBe(1);
  });

  it('still checks the password', async () => {
    const cookie = trustDevice('kim');
    await wrongGuesses('kim', SIGN_IN_FAILURES_MAX);
    const res = await signInFromDevice('kim', 'not-the-password', cookie);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'INVALID_CREDENTIALS' });
    expect(sessionsCreated()).toBe(0);
  });

  it('does not open the lock with the cookie of another account', async () => {
    const someoneElses = trustDevice('liam');
    await wrongGuesses('ned', SIGN_IN_FAILURES_MAX);
    expect((await signInFromDevice('ned', PASSWORD, someoneElses)).status).toBe(429);
    expect(sessionsCreated()).toBe(0);
  });

  it('does not open the lock with a revoked, expired or forged cookie', async () => {
    const revoked = trustDevice('olga', { revokedAt: new Date() });
    const expired = trustDevice('olga', { expiresAt: new Date(Date.now() - 1000) });
    const forged = jwt.sign({ tdt: 'device-of-olga-made-up' }, 'another-secret');
    await wrongGuesses('olga', SIGN_IN_FAILURES_MAX);
    expect((await signInFromDevice('olga', PASSWORD, revoked)).status).toBe(429);
    expect((await signInFromDevice('olga', PASSWORD, expired)).status).toBe(429);
    expect((await signInFromDevice('olga', PASSWORD, forged)).status).toBe(429);
    expect(sessionsCreated()).toBe(0);
  });

  it('does not open the lock when the cookie is used from another country than the device', async () => {
    const cookie = trustDevice('mona', { country: 'FR' });
    await wrongGuesses('mona', SIGN_IN_FAILURES_MAX);
    expect((await signInFromDevice('mona', PASSWORD, cookie, ABROAD_IP)).status).toBe(429);
    expect(sessionsCreated()).toBe(0);
  });

  it('counts wrong passwords sent with the cookie against the device, so a stolen cookie is no free pass', async () => {
    const cookie = trustDevice('pia');
    for (let i = 0; i < SIGN_IN_FAILURES_MAX; i++) {
      expect((await signInFromDevice('pia', `guess-${i}`, cookie)).status).toBe(401);
    }
    const res = await signInFromDevice('pia', PASSWORD, cookie);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'TOO_MANY_REQUESTS', retryAfter: expect.any(Number) });
    expect(sessionsCreated()).toBe(0);
  });
});

describe('audit of a locked sign-in identifier (#980)', () => {
  it('files one refusal under the account per window, without what was typed', async () => {
    await wrongGuesses('quinn', SIGN_IN_FAILURES_MAX);
    for (let i = 0; i < 5; i++) expect((await signIn('quinn', `more-${i}`)).status).toBe(429);

    await vi.waitFor(() => expect(lockAudits()).toHaveLength(1));
    const [row] = lockAudits();
    expect(row).toMatchObject({ userId: 'id-quinn', action: 'LOGIN_FAILED', status: 'error', details: { reason: 'sign_in_locked' } });
    expect(JSON.stringify(row.details)).not.toContain('quinn');
  });

  it('files a new one when the lock is renewed in the next window', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    await wrongGuesses('rex', SIGN_IN_FAILURES_MAX);
    expect((await signIn('rex', 'again')).status).toBe(429);
    await vi.waitFor(() => expect(lockAudits()).toHaveLength(1));

    vi.setSystemTime(Date.now() + 15 * 60 * 1000 + 1000);
    await wrongGuesses('rex', SIGN_IN_FAILURES_MAX);
    expect((await signIn('rex', 'again')).status).toBe(429);
    expect((await signIn('rex', 'again')).status).toBe(429);
    await vi.waitFor(() => expect(lockAudits()).toHaveLength(2));
    expect(lockAudits().every((row) => row.userId === 'id-rex')).toBe(true);
  });

  it('files nothing for an unknown identifier', async () => {
    await wrongGuesses('no-such-member', SIGN_IN_FAILURES_MAX);
    expect((await signIn('no-such-member', 'x')).status).toBe(429);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lockAudits()).toHaveLength(0);
  });
});

// #988: a member without 2FA had no trusted device, so a stranger renewing
// the lock kept them out for good. A successful sign-in now leaves a signed
// "known browser" cookie, bound to the account and to its current password.
const KNOWN_BROWSER = 'glou_known_browser';
const setCookies = (res: request.Response): string[] => {
  const raw = res.headers['set-cookie'] as unknown;
  return Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
};
const knownBrowserSetCookie = (res: request.Response) => setCookies(res).find((c) => c.startsWith(`${KNOWN_BROWSER}=`));
const knownBrowserOf = (res: request.Response): string => {
  const header = knownBrowserSetCookie(res);
  if (!header) throw new Error('no known-browser cookie set');
  return header.slice(KNOWN_BROWSER.length + 1).split(';')[0];
};
/** Signs in for real (2FA off) and returns the known-browser cookie the answer sets. */
async function signedInBefore(identifier: string): Promise<string> {
  const res = await signIn(identifier, PASSWORD);
  expect(res.status).toBe(200);
  return knownBrowserOf(res);
}
const signInFromBrowser = (identifier: string, password: string, cookie: string, ip = nextIp()) =>
  request(app).post('/api/auth/login').set('Sec-Fetch-Site', 'same-origin').set('X-Forwarded-For', ip)
    .set('Cookie', `${KNOWN_BROWSER}=${cookie}`).send({ identifier, password });

describe('POST /api/auth/login from a known browser (#988)', () => {
  it('sets a signed, HttpOnly, SameSite cookie on a successful sign-in, and none on a refusal', async () => {
    const ok = await signIn('sam', PASSWORD);
    expect(ok.status).toBe(200);
    const header = knownBrowserSetCookie(ok);
    expect(header).toBeDefined();
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Strict/i);
    expect(header).toMatch(/Path=\/api\/auth/);
    expect(header).toMatch(/Max-Age=2592000/);

    const refused = await signIn('sam', 'not-it');
    expect(refused.status).toBe(401);
    expect(knownBrowserSetCookie(refused)).toBeUndefined();
  });

  it('lets a member without 2FA sign in from a browser they used before while a stranger keeps the lock', async () => {
    const cookie = await signedInBefore('tina');
    await wrongGuesses('tina', SIGN_IN_FAILURES_MAX);
    expect((await signIn('tina', PASSWORD)).status).toBe(429);

    const before = sessionsCreated();
    const res = await signInFromBrowser('tina', PASSWORD, cookie);
    expect(res.status).toBe(200);
    expect(sessionsCreated()).toBe(before + 1);
    // Still locked for anyone without the cookie.
    expect((await signIn('tina', PASSWORD)).status).toBe(429);
  });

  it('works with the e-mail too, whichever identifier the earlier sign-in used', async () => {
    const cookie = await signedInBefore('uma');
    await wrongGuesses('uma@example.com', SIGN_IN_FAILURES_MAX);
    expect((await signInFromBrowser('uma@example.com', PASSWORD, cookie)).status).toBe(200);
  });

  it('still checks the password, and counts wrong ones against that browser', async () => {
    const cookie = await signedInBefore('vic');
    await wrongGuesses('vic', SIGN_IN_FAILURES_MAX);
    const before = sessionsCreated();
    for (let i = 0; i < SIGN_IN_FAILURES_MAX; i++) {
      const res = await signInFromBrowser('vic', `guess-${i}`, cookie);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'INVALID_CREDENTIALS' });
    }
    const res = await signInFromBrowser('vic', PASSWORD, cookie);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'TOO_MANY_REQUESTS', retryAfter: expect.any(Number) });
    expect(sessionsCreated()).toBe(before);
  });

  it('does not open the lock with the cookie of another account', async () => {
    const someoneElses = await signedInBefore('walt');
    await wrongGuesses('xena', SIGN_IN_FAILURES_MAX);
    expect((await signInFromBrowser('xena', PASSWORD, someoneElses)).status).toBe(429);
  });

  it('does not open the lock with a cookie from before a password change (self-service or admin reset)', async () => {
    const cookie = await signedInBefore('yann');
    // Both flows write a new password hash; the cookie was bound to the old one.
    changed.set('yann', { passwordHash: await bcrypt.hash(PASSWORD, 4) });
    await wrongGuesses('yann', SIGN_IN_FAILURES_MAX);
    expect((await signInFromBrowser('yann', PASSWORD, cookie)).status).toBe(429);
  });

  it('does not open the lock with a forged cookie, a session token or a trusted-device token', async () => {
    const real = await signedInBefore('abel');
    const forged = jwt.sign(jwt.decode(real) as object, 'another-secret');
    const session = jwt.sign({ userId: 'id-abel', email: 'abel@example.com', username: 'abel', scope: 'full', sessionId: 's1' }, JWT_SECRET);
    const device = trustDevice('abel');
    await wrongGuesses('abel', SIGN_IN_FAILURES_MAX);
    for (const cookie of [forged, session, device, 'not-a-jwt']) {
      expect((await signInFromBrowser('abel', PASSWORD, cookie)).status).toBe(429);
    }
  });

  it('does not open the lock once the cookie has expired, or for a deactivated account', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    const cookie = await signedInBefore('beth');
    vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60 * 1000);
    await wrongGuesses('beth', SIGN_IN_FAILURES_MAX);
    expect((await signInFromBrowser('beth', PASSWORD, cookie)).status).toBe(429);

    const fresh = await signedInBefore('sam');
    changed.set('sam', { isActive: false });
    await wrongGuesses('sam', SIGN_IN_FAILURES_MAX);
    expect((await signInFromBrowser('sam', PASSWORD, fresh)).status).toBe(429);
  });

  it('never skips the two-factor code', async () => {
    const cookie = await signedInBefore('zoe');
    changed.set('zoe', { isTwoFactorEnabled: true, twoFactorSecret: 'JBSWY3DPEHPK3PXP' });
    await wrongGuesses('zoe', SIGN_IN_FAILURES_MAX);
    const before = sessionsCreated();
    const res = await signInFromBrowser('zoe', PASSWORD, cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.requires2fa).toBe(true);
    expect(sessionsCreated()).toBe(before);
  });

  it('is set once the two-factor code is checked, not at the password step', async () => {
    const backupCode = 'ABCDEFGHIJ0123456789';
    changed.set('walt', { isTwoFactorEnabled: true, backupCodes: [await bcrypt.hash(backupCode, 4)] });
    const pending = await signIn('walt', PASSWORD);
    expect(pending.body.data.requires2fa).toBe(true);
    expect(knownBrowserSetCookie(pending)).toBeUndefined();

    const pendingToken = setCookies(pending).find((c) => c.startsWith('glou_token='))!.split(';')[0];
    const verified = await request(app).post('/api/auth/2fa/verify-login').set('Sec-Fetch-Site', 'same-origin')
      .set('X-Forwarded-For', nextIp()).set('Cookie', pendingToken).send({ code: backupCode });
    expect(verified.status).toBe(200);
    const cookie = knownBrowserOf(verified);

    await wrongGuesses('walt', SIGN_IN_FAILURES_MAX);
    const res = await signInFromBrowser('walt', PASSWORD, cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.requires2fa).toBe(true);
  });

  it('keeps the per-address limit', async () => {
    const cookie = await signedInBefore('cleo');
    const ip = nextIp();
    const answers = [];
    for (let i = 0; i < 21; i++) answers.push((await signInFromBrowser('cleo', PASSWORD, cookie, ip)).status);
    expect(answers.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(answers[20]).toBe(429);
  });
});

describe('the known-browser cookie follows the member (#988, review)', () => {
  it('is renewed by a password change, so the member\'s own browser stays known while older cookies stop working', async () => {
    const older = await signedInBefore('dora');
    const token = jwt.sign({ userId: 'id-dora', email: 'dora@example.com', username: 'dora', scope: 'full', sessionId: 's1' }, JWT_SECRET, { algorithm: 'HS256' });
    const NEW_PASSWORD = 'a-brand-new-password';
    const changedRes = await request(app).patch('/api/user/password').set('Authorization', `Bearer ${token}`)
      .set('Sec-Fetch-Site', 'same-origin').set('X-Forwarded-For', nextIp())
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(changedRes.status).toBe(200);
    const header = knownBrowserSetCookie(changedRes);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/Path=\/api\/auth/);
    const renewed = knownBrowserOf(changedRes);

    await wrongGuesses('dora', SIGN_IN_FAILURES_MAX);
    expect((await signInFromBrowser('dora', NEW_PASSWORD, older)).status).toBe(429);
    expect((await signInFromBrowser('dora', NEW_PASSWORD, renewed)).status).toBe(200);
  }, 30_000); // the new password is hashed at the real cost (12), and checked a dozen times

  it('is set by the automatic sign-in after registration', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null as never); // the name is free
    const res = await request(app).post('/api/auth/register').set('Sec-Fetch-Site', 'same-origin').set('X-Forwarded-For', nextIp())
      .send({ username: 'newbie', email: 'newbie@example.com', password: PASSWORD });
    expect(res.status).toBe(201);
    const cookie = knownBrowserOf(res);

    await wrongGuesses('newbie', SIGN_IN_FAILURES_MAX);
    expect((await signIn('newbie', PASSWORD)).status).toBe(429);
    expect((await signInFromBrowser('newbie', PASSWORD, cookie)).status).toBe(200);
  }, 30_000); // registration hashes at the real cost (12), checked a dozen times
});
