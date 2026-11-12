import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { generateSync } from 'otplib';
import { newTotpSecret } from '../../src/lib/totp';

// The "attacker holding only the session cookie" pass, through the real app
// (routes, middlewares, limiters, bcrypt, otplib); only the database is stubbed.
// #603: turning 2FA on, asking for the account's deletion, and changing a
//       member's role or status need a password, not just the session.
// #606: password checks of a signed-in account share a per-account limit.
// #601: guest links created and revoked are in the audit log.
// #911: changing the username and creating a read/write guest link need the password.
// #766: a trusted device only makes sense with 2FA on; the page reads its real state.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      update: vi.fn(), updateMany: vi.fn(), count: vi.fn(),
    },
    session: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    trustedDevice: { create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
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
const TOTP_SECRET = newTotpSecret();
let passwordHash = '';

type Row = { id: string; isAdmin: boolean; isActive: boolean; isTwoFactorEnabled: boolean; twoFactorSecret: string | null };
let accounts: Record<string, Row> = {};
const account = (id: string, extra: Partial<Row> = {}): Row =>
  ({ id, isAdmin: false, isActive: true, isTwoFactorEnabled: false, twoFactorSecret: null, ...extra });

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

const app = createApp();
const as = (userId: string) => `Bearer ${jwt.sign({ userId, email: `${userId}@example.com`, scope: 'full', sessionId: 's1' }, JWT_SECRET, { algorithm: 'HS256' })}`;
const call = (method: 'post' | 'patch' | 'put' | 'delete', path: string, userId: string, body: Record<string, unknown> = {}, ip = '198.51.100.1') =>
  request(app)[method](path).set('Authorization', as(userId)).set('Sec-Fetch-Site', 'same-origin').set('X-Forwarded-For', ip).send(body);

const auditCalls = () => vi.mocked(prisma.auditLog.create).mock.calls.map(([arg]) => (arg as { data: Record<string, unknown> }).data);

beforeEach(() => {
  vi.clearAllMocks();
  // #608: every token carries a live session.
  vi.mocked(prisma.session.findUnique).mockResolvedValue({ revokedAt: null, expiresAt: new Date(Date.now() + 3_600_000) } as never);
  vi.mocked(prisma.session.update).mockResolvedValue({} as never);
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
    const res = await turnOn({ code: generateSync({ secret: TOTP_SECRET }) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(turnedOn()).toBe(false);
  });

  it('refuses a wrong password', async () => {
    const res = await turnOn({ password: 'not-it', code: generateSync({ secret: TOTP_SECRET }) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
    expect(turnedOn()).toBe(false);
  });

  it('turns 2FA on with the password and a current code', async () => {
    const res = await turnOn({ password: PASSWORD, code: generateSync({ secret: TOTP_SECRET }) });
    expect(res.status).toBe(200);
    expect(res.body.data.backupCodes).toHaveLength(10);
    expect(turnedOn()).toBe(true);
  }, 30_000); // ten backup codes hashed at the real bcrypt cost
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
    const res = await call('patch', '/api/admin/users/member/status', 'admin1', { isActive: false, password: PASSWORD, code: generateSync({ secret: TOTP_SECRET }) });
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
  // Each wrong password goes to a different route, from a different address:
  // the budget is the account's, whatever the route (10 per 15 minutes).
  const wrong: Array<[string, 'post' | 'patch' | 'delete', string, Record<string, unknown>]> = [
    ['password change', 'patch', '/api/user/password', { currentPassword: 'guess', newPassword: 'a-new-password-1234' }],
    ['e-mail change', 'patch', '/api/user/email', { email: 'x@example.com', currentPassword: 'guess' }],
    ['PIN set', 'post', '/api/auth/pin', { password: 'guess', pin: '1234' }],
    ['PIN removal', 'delete', '/api/auth/pin', { password: 'guess' }],
    ['username change', 'patch', '/api/user/username', { username: 'new_name', currentPassword: 'guess' }],
    ['2FA turn-on', 'post', '/api/auth/2fa/turn-on', { password: 'guess', code: '123456' }],
    ['account deletion', 'post', '/api/user/delete-account', { password: 'guess' }],
    ['read/write guest link', 'post', '/api/shares', { cellarIds: ['c1'], writeCellarIds: ['c1'], password: 'guess' }],
    ['password change', 'patch', '/api/user/password', { currentPassword: 'guess', newPassword: 'a-new-password-1234' }],
    ['e-mail change', 'patch', '/api/user/email', { email: 'x@example.com', currentPassword: 'guess' }],
  ];

  it('answers 429 once the account has spent 10 wrong passwords, on any of the routes', async () => {
    accounts.lim1 = account('lim1', { twoFactorSecret: encrypt(TOTP_SECRET) });
    for (const [i, [label, method, path, body]] of wrong.entries()) {
      const res = await call(method, path, 'lim1', body, `203.0.113.${i + 1}`);
      expect(res.status, label).toBeGreaterThanOrEqual(400);
      expect(res.status, label).not.toBe(429);
    }

    for (const [label, method, path, body] of [
      ['PIN set', 'post', '/api/auth/pin', { password: 'guess', pin: '1234' }],
      ['trusted device', 'post', '/api/auth/trust-device', { password: PASSWORD, code: '000000' }],
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

  it('only a wrong password or code counts: an e-mail already used, a missing field do not', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'someone-else' } as never);
    for (let i = 0; i < 12; i++) {
      expect((await call('patch', '/api/user/email', 'lim4', { email: 'taken@example.com', currentPassword: PASSWORD })).status).toBe(409);
      expect((await call('post', '/api/user/delete-account', 'lim4', {})).status).toBe(400);
    }
    expect((await call('patch', '/api/user/password', 'lim4', { currentPassword: 'guess', newPassword: 'a-new-password-1234' })).status).toBe(401);
  });

  it('unlocking the app has its own budget: a spent shared one does not lock the owner out', async () => {
    for (let i = 0; i < 10; i++) await call('post', '/api/auth/pin', 'lim5', { password: 'guess', pin: '1234' });
    expect((await call('post', '/api/auth/pin', 'lim5', { password: 'guess', pin: '1234' })).status).toBe(429);
    expect((await call('post', '/api/auth/unlock', 'lim5', { password: PASSWORD })).status).toBe(200);
  });

  it('successful checks do not count', async () => {
    // Unlock: the same check without hashing anything new, so the loop stays fast.
    for (let i = 0; i < 12; i++) {
      const res = await call('post', '/api/auth/unlock', 'lim3', { password: PASSWORD });
      expect(res.status, `unlock ${i + 1}`).toBe(200);
    }
  });
});

describe('the admin step-up has a per-account budget too (#606, review)', () => {
  beforeEach(() => {
    accounts.admin2 = account('admin2', { isAdmin: true });
    accounts.member = account('member');
    vi.mocked(prisma.user.count).mockResolvedValue(2 as never);
  });

  it('20 wrong passwords from 20 addresses, over several step-up routes, then 429 even with the right one', async () => {
    const routes: Array<['post' | 'patch' | 'put', string, Record<string, unknown>]> = [
      ['patch', '/api/admin/users/member/status', { isActive: false }],
      ['post', '/api/admin/users/member/role', { isAdmin: true }],
      ['post', '/api/admin/users/member/reset-password', {}],
      ['put', '/api/admin/config/network', { publicUrl: 'https://attacker.example' }],
    ];
    for (let i = 0; i < 20; i++) {
      const [method, path, body] = routes[i % routes.length];
      const res = await call(method, path, 'admin2', { ...body, password: `guess-${i}` }, `192.0.2.${i + 1}`);
      expect(res.status, `guess ${i + 1} on ${path}`).toBe(403);
      expect(res.body.error).toBe('INVALID_PASSWORD');
    }
    const blocked = await call('patch', '/api/admin/users/member/status', 'admin2', { isActive: false, password: PASSWORD }, '192.0.2.200');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('TOO_MANY_REQUESTS');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('a step-up asked without any password is not a guess', async () => {
    accounts.admin3 = account('admin3', { isAdmin: true });
    for (let i = 0; i < 25; i++) {
      const res = await call('patch', '/api/admin/users/member/status', 'admin3', { isActive: false }, `192.0.2.${i + 1}`);
      expect(res.body.error).toBe('REAUTH_REQUIRED');
    }
    expect((await call('patch', '/api/admin/users/member/status', 'admin3', { isActive: false, password: PASSWORD }, '192.0.2.99')).status).toBe(200);
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

// ─── #911 ────────────────────────────────────────────────────────────────────

describe('changing the username asks for the password (#911)', () => {
  const renamed = () => vi.mocked(prisma.user.update).mock.calls.some(([args]) => 'username' in (args.data as object));

  it('the session alone is refused with REAUTH_REQUIRED, nothing changed', async () => {
    const res = await call('patch', '/api/user/username', 'u1', { username: 'new_name' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('REAUTH_REQUIRED');
    expect(renamed()).toBe(false);
  });

  it('a wrong password is refused', async () => {
    const res = await call('patch', '/api/user/username', 'u1', { username: 'new_name', currentPassword: 'not-it' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
    expect(renamed()).toBe(false);
  });

  it('a name already taken is refused after the password', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'someone-else' } as never);
    const res = await call('patch', '/api/user/username', 'u1', { username: 'taken', currentPassword: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('USERNAME_ALREADY_TAKEN');
    expect(renamed()).toBe(false);
  });

  it('a malformed name is a validation error', async () => {
    const res = await call('patch', '/api/user/username', 'u1', { username: 'a b', currentPassword: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('goes through with the password, and is audited with both names', async () => {
    const res = await call('patch', '/api/user/username', 'u1', { username: 'new_name', currentPassword: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('new_name');
    await vi.waitFor(() => expect(auditCalls()).toContainEqual(expect.objectContaining({
      userId: 'u1', action: 'USERNAME_CHANGE', status: 'success', details: { previousUsername: 'u1', newUsername: 'new_name' },
    })));
    expect(JSON.stringify(auditCalls())).not.toContain(PASSWORD);
  });

  it('tells the owner, like the e-mail change (review of #911)', async () => {
    const res = await call('patch', '/api/user/username', 'u1', { username: 'new_name', currentPassword: PASSWORD });
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(notificationService.send).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1', category: 'security', subject: 'Glou — Your username was changed',
    })));
  });

  it('the profile route no longer changes it: the key is dropped', async () => {
    const res = await call('patch', '/api/user/profile', 'u1', { username: 'new_name', displayName: 'Alex' });
    expect(res.status).toBe(200);
    expect(renamed()).toBe(false);
  });
});

describe('a guest link with write access asks for the password (#911)', () => {
  beforeEach(() => {
    vi.mocked(prisma.cellar.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.guestShare.create).mockImplementation((async (args: { data: Record<string, unknown> }) => ({
      id: 'sh2', createdAt: new Date(), revokedAt: null, ...args.data,
    })) as never);
  });
  const writeLink = { label: 'Pierre', cellarIds: ['c1'], writeCellarIds: ['c1'] };

  it('the session alone is refused with REAUTH_REQUIRED, no link created', async () => {
    const res = await call('post', '/api/shares', 's1', writeLink);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('REAUTH_REQUIRED');
    expect(prisma.guestShare.create).not.toHaveBeenCalled();
  });

  it('a wrong password is refused, no link created', async () => {
    const res = await call('post', '/api/shares', 's1', { ...writeLink, password: 'not-it' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
    expect(prisma.guestShare.create).not.toHaveBeenCalled();
  });

  it('goes through with the password, which is neither stored nor audited', async () => {
    const res = await call('post', '/api/shares', 's1', { ...writeLink, password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.data.writeCellarIds).toEqual(['c1']);
    expect(JSON.stringify(vi.mocked(prisma.guestShare.create).mock.calls)).not.toContain(PASSWORD);
    await vi.waitFor(() => expect(auditCalls()).toContainEqual(expect.objectContaining({ userId: 's1', action: 'SHARE_CREATE', status: 'success' })));
    expect(JSON.stringify(auditCalls())).not.toContain(PASSWORD);
  });

  it('a read-only link stays one click', async () => {
    const res = await call('post', '/api/shares', 's1', { label: 'Pierre', cellarIds: ['c1'], writeCellarIds: [] });
    expect(res.status).toBe(201);
  });

  it('a spent password budget blocks read/write links only, not read-only ones (review of #911)', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await call('post', '/api/shares', 'sb1', { ...writeLink, password: 'guess' }, `203.0.113.${i + 1}`)).status).toBe(401);
    }
    const blocked = await call('post', '/api/shares', 'sb1', { ...writeLink, password: PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('TOO_MANY_REQUESTS');
    expect((await call('post', '/api/shares', 'sb1', { label: 'Pierre', cellarIds: ['c1'], writeCellarIds: [] })).status).toBe(201);
  });
});

// ─── #766 ────────────────────────────────────────────────────────────────────

describe('trusted device (#766)', () => {
  const RAW = 'a'.repeat(64);
  const cookie = (expiresIn: string | number = '30d') =>
    `glou_trusted_device=${jwt.sign({ tdt: RAW }, JWT_SECRET, { expiresIn } as jwt.SignOptions)}`;
  const state = (userId: string, withCookie?: string) => {
    const req = request(app).get('/api/auth/trust-device').set('Authorization', as(userId));
    return withCookie ? req.set('Cookie', withCookie) : req;
  };

  it('POST is refused when 2FA is off, even with the right password, and mints nothing', async () => {
    const res = await call('post', '/api/auth/trust-device', 'td1', { password: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TWO_FACTOR_DISABLED');
    expect(prisma.trustedDevice.create).not.toHaveBeenCalled();
    expect(res.headers['set-cookie'] ?? []).not.toEqual(expect.arrayContaining([expect.stringContaining('glou_trusted_device=')]));
  });

  it('POST still trusts the device with 2FA on, the password and a code', async () => {
    accounts.td2 = account('td2', { isTwoFactorEnabled: true, twoFactorSecret: encrypt(TOTP_SECRET) });
    vi.mocked(prisma.trustedDevice.create).mockResolvedValue({} as never);
    const res = await call('post', '/api/auth/trust-device', 'td2', { password: PASSWORD, code: generateSync({ secret: TOTP_SECRET }) });
    expect(res.status).toBe(200);
    expect(prisma.trustedDevice.create).toHaveBeenCalled();
  });

  it('GET says not trusted without the cookie', async () => {
    const res = await state('td3');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ trustedUntil: null });
  });

  it('GET gives the end of trust for a live device of this account', async () => {
    const expiresAt = new Date(Date.now() + 10 * 86_400_000);
    vi.mocked(prisma.trustedDevice.findUnique).mockResolvedValue({ id: 'dev1', userId: 'td3', revokedAt: null, expiresAt } as never);
    const res = await state('td3', cookie());
    expect(res.body.data.trustedUntil).toBe(expiresAt.toISOString());
  });

  it('GET gives the cookie\'s own end when it comes first', async () => {
    vi.mocked(prisma.trustedDevice.findUnique).mockResolvedValue({ id: 'dev1', userId: 'td3', revokedAt: null, expiresAt: new Date(Date.now() + 30 * 86_400_000) } as never);
    const res = await state('td3', cookie('2d'));
    const until = new Date(res.body.data.trustedUntil).getTime();
    expect(until).toBeGreaterThan(Date.now() + 86_400_000);
    expect(until).toBeLessThanOrEqual(Date.now() + 2 * 86_400_000 + 1000);
  });

  it.each([
    ['revoked', { userId: 'td3', revokedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) }],
    ['expired', { userId: 'td3', revokedAt: null, expiresAt: new Date(Date.now() - 1000) }],
    ['another account\'s', { userId: 'someone-else', revokedAt: null, expiresAt: new Date(Date.now() + 86_400_000) }],
  ])('GET says not trusted for a %s device', async (_label, device) => {
    vi.mocked(prisma.trustedDevice.findUnique).mockResolvedValue({ id: 'dev1', ...device } as never);
    const res = await state('td3', cookie());
    expect(res.body.data).toEqual({ trustedUntil: null });
  });

  it('GET says not trusted for a forged cookie', async () => {
    vi.mocked(prisma.trustedDevice.findUnique).mockResolvedValue({ id: 'dev1', userId: 'td3', revokedAt: null, expiresAt: new Date(Date.now() + 86_400_000) } as never);
    const forged = `glou_trusted_device=${jwt.sign({ tdt: RAW }, 'not-the-secret')}`;
    const res = await state('td3', forged);
    expect(res.body.data).toEqual({ trustedUntil: null });
  });
});

describe('trusted devices and 2FA changes (review of #766)', () => {
  it('turning 2FA on revokes the devices trusted before (minted while it was off)', async () => {
    accounts.on1 = account('on1', { twoFactorSecret: encrypt(TOTP_SECRET) });
    const res = await call('post', '/api/auth/2fa/turn-on', 'on1', { password: PASSWORD, code: generateSync({ secret: TOTP_SECRET }) });
    expect(res.status).toBe(200);
    expect(prisma.trustedDevice.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'on1', revokedAt: null }, data: { revokedAt: expect.any(Date) },
    }));
  }, 30_000);

  it.each([
    ['no cookie', undefined, null],
    ['another account\'s device', 'cookie', { id: 'dev1', userId: 'someone-else', revokedAt: null, expiresAt: new Date(Date.now() + 86_400_000) }],
    ['a device deleted meanwhile', 'cookie', null],
  ])('DELETE with %s answers 200 and clears the cookie, never 500', async (_label, withCookie, device) => {
    vi.mocked(prisma.trustedDevice.findUnique).mockResolvedValue(device as never);
    let req = request(app).delete('/api/auth/trust-device').set('Authorization', as('td9')).set('Sec-Fetch-Site', 'same-origin');
    if (withCookie) req = req.set('Cookie', `glou_trusted_device=${jwt.sign({ tdt: 'b'.repeat(64) }, JWT_SECRET)}`);
    const res = await req;
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ok: true });
    expect(String(res.headers['set-cookie'] ?? '')).toContain('glou_trusted_device=;');
  });
});
