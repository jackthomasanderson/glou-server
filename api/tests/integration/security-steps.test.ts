import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';

// The "attacker holding only the session cookie" pass, through the real app
// (routes, middlewares, limiters, bcrypt, otplib); only the database is stubbed.
// #603: turning 2FA on, asking for the account's deletion, and changing a
//       member's role or status need a password, not just the session.
// #606: password checks of a signed-in account share a per-account limit.
// #601: guest links created and revoked are in the audit log.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      update: vi.fn(), updateMany: vi.fn(), count: vi.fn(),
    },
    session: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    trustedDevice: { create: vi.fn(), updateMany: vi.fn() },
    guestShare: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    cellar: { count: vi.fn() },
    collection: { count: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
  connectWithRetry: vi.fn(),
}));

import { prisma } from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import { encrypt } from '../../src/lib/crypto';
import { notificationService } from '../../src/services/notification.service';
import { systemConfigService } from '../../src/services/system-config.service';

const JWT_SECRET = 'integration-test-secret';
const PASSWORD = 'the-right-password';
const TOTP_SECRET = authenticator.generateSecret();
let passwordHash = '';

type Row = { id: string; isAdmin: boolean; isActive: boolean; isTwoFactorEnabled: boolean; twoFactorSecret: string | null };
let accounts: Record<string, Row> = {};
const account = (id: string, extra: Partial<Row> = {}): Row =>
  ({ id, isAdmin: false, isActive: true, isTwoFactorEnabled: false, twoFactorSecret: null, ...extra });

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

const app = createApp();
const as = (userId: string) => `Bearer ${jwt.sign({ userId, email: `${userId}@example.com`, scope: 'full' }, JWT_SECRET, { algorithm: 'HS256' })}`;
const call = (method: 'post' | 'patch' | 'delete', path: string, userId: string, body: Record<string, unknown> = {}) =>
  request(app)[method](path).set('Authorization', as(userId)).set('Sec-Fetch-Site', 'same-origin').send(body);

const auditCalls = () => vi.mocked(prisma.auditLog.create).mock.calls.map(([arg]) => (arg as { data: Record<string, unknown> }).data);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.CONFIG_ENCRYPTION_KEY = 'ab'.repeat(32);
  accounts = {};
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as never);
  const read = async (args: { where: { id: string } }) => {
    const row = accounts[args.where.id] ?? account(args.where.id);
    return {
      ...row, username: row.id, email: `${row.id}@example.com`, passwordHash, backupCodes: [],
      twoFactorFailedAttempts: 0, twoFactorLockedUntil: null, language: 'EN', notifLanguage: null,
    };
  };
  vi.mocked(prisma.user.findUnique).mockImplementation(read as never);
  vi.mocked(prisma.user.findUniqueOrThrow).mockImplementation(read as never);
  vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.user.update).mockImplementation((async (args: { where: { id: string }; data: Record<string, unknown> }) =>
    ({ ...(await read(args)), ...args.data })) as never);
  vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.session.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.trustedDevice.updateMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.guestShare.updateMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)) as never);
  vi.spyOn(notificationService, 'send').mockResolvedValue(undefined as never);
  vi.spyOn(systemConfigService, 'getEffectivePublicUrl').mockResolvedValue('https://glou.example');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ─── #603 ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/2fa/turn-on (#603)', () => {
  beforeEach(() => {
    accounts.t1 = account('t1', { twoFactorSecret: encrypt(TOTP_SECRET) });
  });
  const turnOn = (body: Record<string, unknown>) => call('post', '/api/auth/2fa/turn-on', 't1', body);
  const turnedOn = () => vi.mocked(prisma.user.update).mock.calls.some(([args]) => (args.data as { isTwoFactorEnabled?: boolean }).isTwoFactorEnabled === true);

  it('refuses a code without the password', async () => {
    const res = await turnOn({ code: authenticator.generate(TOTP_SECRET) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(turnedOn()).toBe(false);
  });

  it('refuses a wrong password', async () => {
    const res = await turnOn({ password: 'not-it', code: authenticator.generate(TOTP_SECRET) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
    expect(turnedOn()).toBe(false);
  });

  it('turns 2FA on with the password and a current code', async () => {
    const res = await turnOn({ password: PASSWORD, code: authenticator.generate(TOTP_SECRET) });
    expect(res.status).toBe(200);
    expect(res.body.data.backupCodes).toHaveLength(10);
    expect(turnedOn()).toBe(true);
  });
});

describe('POST /api/user/delete-account (#603)', () => {
  const scheduled = () => vi.mocked(prisma.user.update).mock.calls.some(([args]) => 'deletionRequestedAt' in (args.data as object));

  it('refuses a request without the password', async () => {
    const res = await call('post', '/api/user/delete-account', 'd1');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(scheduled()).toBe(false);
  });

  it('refuses a wrong password', async () => {
    const res = await call('post', '/api/user/delete-account', 'd1', { password: 'not-it' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
    expect(scheduled()).toBe(false);
  });

  it('refuses the last active admin', async () => {
    accounts.d2 = account('d2', { isAdmin: true });
    vi.mocked(prisma.user.count).mockResolvedValue(0 as never);
    const res = await call('post', '/api/user/delete-account', 'd2', { password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CANNOT_DELETE_LAST_ADMIN');
    expect(scheduled()).toBe(false);
  });

  it('schedules the deletion with the password, and tells the owner', async () => {
    const res = await call('post', '/api/user/delete-account', 'd3', { password: PASSWORD });
    expect(res.status).toBe(200);
    expect(scheduled()).toBe(true);
    await vi.waitFor(() => expect(notificationService.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 'd3', category: 'security' })));
  });
});

describe('member role and status changes need the admin\'s step-up (#603)', () => {
  beforeEach(() => {
    accounts.admin1 = account('admin1', { isAdmin: true });
    accounts.other = account('other', { isAdmin: true });
    accounts.member = account('member');
    accounts.gone = account('gone', { isActive: false });
    vi.mocked(prisma.user.count).mockResolvedValue(2 as never);
  });
  const changed = () => vi.mocked(prisma.user.update).mock.calls.length > 0;

  it.each([
    ['deactivating a member', 'patch', '/api/admin/users/member/status', { isActive: false }],
    ['reactivating a member', 'patch', '/api/admin/users/gone/status', { isActive: true }],
    ['removing an admin\'s role', 'post', '/api/admin/users/other/role', { isAdmin: false }],
  ] as const)('%s: refused with the session alone, nothing changed, refusal audited', async (_label, method, path, body) => {
    const res = await call(method, path, 'admin1', body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('REAUTH_REQUIRED');
    expect(changed()).toBe(false);
    expect(auditCalls()).toContainEqual(expect.objectContaining({ userId: 'admin1', status: 'error', details: expect.objectContaining({ error: 'REAUTH_REQUIRED' }) }));
  });

  it.each([
    ['deactivating a member', 'patch', '/api/admin/users/member/status', { isActive: false }],
    ['removing an admin\'s role', 'post', '/api/admin/users/other/role', { isAdmin: false }],
  ] as const)('%s: refused with a wrong password', async (_label, method, path, body) => {
    const res = await call(method, path, 'admin1', { ...body, password: 'not-it' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('INVALID_PASSWORD');
    expect(changed()).toBe(false);
  });

  it.each([
    ['deactivating a member', 'patch', '/api/admin/users/member/status', { isActive: false }, 'ADMIN_STATUS_CHANGE'],
    ['reactivating a member', 'patch', '/api/admin/users/gone/status', { isActive: true }, 'ADMIN_STATUS_CHANGE'],
    ['removing an admin\'s role', 'post', '/api/admin/users/other/role', { isAdmin: false }, 'ADMIN_ROLE_CHANGE'],
  ] as const)('%s: goes through with the admin\'s password, and is audited', async (_label, method, path, body, action) => {
    const res = await call(method, path, 'admin1', { ...body, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(changed()).toBe(true);
    await vi.waitFor(() => expect(auditCalls()).toContainEqual(expect.objectContaining({ userId: 'admin1', action, status: 'success' })));
    expect(JSON.stringify(auditCalls())).not.toContain(PASSWORD);
  });

  it('asks for the code too when the admin has 2FA', async () => {
    accounts.admin1 = account('admin1', { isAdmin: true, isTwoFactorEnabled: true, twoFactorSecret: encrypt(TOTP_SECRET) });
    expect((await call('patch', '/api/admin/users/member/status', 'admin1', { isActive: false, password: PASSWORD })).body.error).toBe('INVALID_TOTP_CODE');
    const res = await call('patch', '/api/admin/users/member/status', 'admin1', { isActive: false, password: PASSWORD, code: authenticator.generate(TOTP_SECRET) });
    expect(res.status).toBe(200);
  });

  it('answers a change that would change nothing before the step-up', async () => {
    const res = await call('post', '/api/admin/users/member/role', 'admin1', { isAdmin: false });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('NOT_ADMIN');
  });

  it('still refuses deactivating the last active admin before the step-up', async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(1 as never);
    const res = await call('patch', '/api/admin/users/other/status', 'admin1', { isActive: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CANNOT_DEACTIVATE_LAST_ADMIN');
  });
});

// ─── #606 ────────────────────────────────────────────────────────────────────

describe('password checks of a signed-in account share one limit (#606)', () => {
  // Each wrong password goes to a different route: the budget is the account's,
  // whatever the route (10 refusals per 15 minutes).
  const wrong: Array<[string, 'post' | 'patch' | 'delete', string, Record<string, unknown>]> = [
    ['password change', 'patch', '/api/user/password', { currentPassword: 'guess', newPassword: 'a-new-password-1234' }],
    ['e-mail change', 'patch', '/api/user/email', { email: 'x@example.com', currentPassword: 'guess' }],
    ['PIN set', 'post', '/api/auth/pin', { password: 'guess', pin: '1234' }],
    ['PIN removal', 'delete', '/api/auth/pin', { password: 'guess' }],
    ['trusted device', 'post', '/api/auth/trust-device', { password: 'guess' }],
    ['2FA turn-on', 'post', '/api/auth/2fa/turn-on', { password: 'guess', code: '123456' }],
    ['account deletion', 'post', '/api/user/delete-account', { password: 'guess' }],
    ['unlock', 'post', '/api/auth/unlock', { password: 'guess' }],
    ['password change', 'patch', '/api/user/password', { currentPassword: 'guess', newPassword: 'a-new-password-1234' }],
    ['e-mail change', 'patch', '/api/user/email', { email: 'x@example.com', currentPassword: 'guess' }],
  ];

  it('answers 429 once the account has spent 10 wrong passwords, on any of the routes', async () => {
    accounts.lim1 = account('lim1', { twoFactorSecret: encrypt(TOTP_SECRET) });
    for (const [label, method, path, body] of wrong) {
      const res = await call(method, path, 'lim1', body);
      expect(res.status, label).toBeGreaterThanOrEqual(400);
      expect(res.status, label).not.toBe(429);
    }

    for (const [label, method, path, body] of [
      ['PIN set', 'post', '/api/auth/pin', { password: 'guess', pin: '1234' }],
      ['trusted device (2FA code check)', 'post', '/api/auth/trust-device', { password: PASSWORD, code: '000000' }],
      ['password change, right password', 'patch', '/api/user/password', { currentPassword: PASSWORD, newPassword: 'a-new-password-1234' }],
    ] as const) {
      const res = await call(method, path, 'lim1', body);
      expect(res.status, label).toBe(429);
      expect(res.body.error, label).toBe('TOO_MANY_REQUESTS');
    }
    // Nothing was checked once blocked.
    expect(vi.mocked(prisma.user.update).mock.calls.some(([a]) => 'passwordHash' in (a.data as object))).toBe(false);
  });

  it('another account is not blocked by it', async () => {
    const res = await call('patch', '/api/user/password', 'lim2', { currentPassword: 'guess', newPassword: 'a-new-password-1234' });
    expect(res.status).toBe(401);
  });

  it('successful checks do not count', async () => {
    for (let i = 0; i < 12; i++) {
      const res = await call('post', '/api/auth/pin', 'lim3', { password: PASSWORD, pin: '1234' });
      expect(res.status, `PIN set ${i + 1}`).toBe(200);
    }
  });
});

// ─── #601 ────────────────────────────────────────────────────────────────────

describe('guest links in the audit log (#601)', () => {
  it('creating a link is a SHARE_CREATE entry, without the token', async () => {
    vi.mocked(prisma.collection.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.guestShare.create).mockImplementation((async (args: { data: Record<string, unknown> }) => ({
      id: 'sh1', createdAt: new Date(), revokedAt: null, ...args.data,
    })) as never);

    const res = await call('post', '/api/shares', 's1', { label: 'Pierre', collectionIds: ['c1'], cellarIds: [], writeCellarIds: [] });

    expect(res.status).toBe(201);
    const token = res.body.data.token as string;
    await vi.waitFor(() => expect(auditCalls()).toContainEqual(expect.objectContaining({
      userId: 's1', action: 'SHARE_CREATE', status: 'success',
      details: expect.objectContaining({ shareId: 'sh1', cellarIds: [], writeCellarIds: [], collectionIds: ['c1'] }),
    })));
    expect(JSON.stringify(auditCalls())).not.toContain(token);
    expect(JSON.stringify(auditCalls())).not.toContain('tokenHash');
  });

  it('revoking a link is a SHARE_REVOKE entry; someone else\'s link writes none', async () => {
    vi.mocked(prisma.guestShare.findUnique).mockResolvedValue({ id: 'sh1', userId: 's1' } as never);
    vi.mocked(prisma.guestShare.update).mockResolvedValue({ id: 'sh1', userId: 's1', revokedAt: new Date(), createdAt: new Date(), cellarIds: [], writeCellarIds: [], collectionIds: [] } as never);

    expect((await call('delete', '/api/shares/sh1', 's2')).status).toBe(404);
    expect((await call('delete', '/api/shares/sh1', 's1')).status).toBe(200);

    await vi.waitFor(() => expect(auditCalls()).toContainEqual({ userId: 's1', action: 'SHARE_REVOKE', status: 'success', ip: expect.any(String), bottleId: null, productId: null, details: { shareId: 'sh1' } }));
    expect(auditCalls().filter((d) => d.action === 'SHARE_REVOKE')).toHaveLength(1);
  });
});
