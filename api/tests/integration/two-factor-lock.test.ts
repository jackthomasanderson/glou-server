import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { generateSync } from 'otplib';
import { newTotpSecret } from '../../src/lib/totp';

// #889: wrong 2FA codes counted toward the per-account lock only at sign-in.
// Turning 2FA off, regenerating backup codes, trusting a device and the admin
// step-up now share that counter and lock. Through the real app (routes,
// limiters, bcrypt, otplib); only the database is stubbed, with one stateful
// row per account so the counter really moves.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      update: vi.fn(), updateMany: vi.fn(), count: vi.fn(),
    },
    session: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    trustedDevice: { create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
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

type Row = Record<string, unknown> & { id: string; twoFactorFailedAttempts: number; twoFactorLockedUntil: Date | null };
let rows: Record<string, Row> = {};

function seed(id: string, extra: Partial<Row> = {}): Row {
  rows[id] = {
    id, username: id, email: `${id}@example.com`, passwordHash, isAdmin: false, isActive: true,
    isTwoFactorEnabled: true, twoFactorSecret: encrypt(TOTP_SECRET), backupCodes: [],
    twoFactorFailedAttempts: 0, twoFactorLockedUntil: null, language: 'EN', notifLanguage: null,
    ...extra,
  };
  return rows[id];
}

/** Applies a Prisma `data` object to the stored row, `{ increment }` included. */
function apply(row: Row, data: Record<string, unknown>): Row {
  for (const [key, value] of Object.entries(data)) {
    const inc = (value as { increment?: number } | null)?.increment;
    row[key] = typeof inc === 'number' ? (row[key] as number) + inc : value;
  }
  return row;
}

const currentCode = () => generateSync({ secret: TOTP_SECRET });
/** A six-digit code that is not the current one. */
const wrongCode = () => (currentCode() === '000000' ? '111111' : '000000');

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

const app = createApp();
const as = (userId: string) => `Bearer ${jwt.sign({ userId, email: `${userId}@example.com`, scope: 'full', sessionId: 's1' }, JWT_SECRET, { algorithm: 'HS256' })}`;
const call = (method: 'post' | 'patch', path: string, userId: string, body: Record<string, unknown>, ip: string) =>
  request(app)[method](path).set('Authorization', as(userId)).set('Sec-Fetch-Site', 'same-origin').set('X-Forwarded-For', ip).send(body);

beforeEach(() => {
  vi.clearAllMocks();
  rows = {};
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.CONFIG_ENCRYPTION_KEY = 'ab'.repeat(32);
  vi.mocked(prisma.session.findUnique).mockResolvedValue({ revokedAt: null, expiresAt: new Date(Date.now() + 3_600_000) } as never);
  vi.mocked(prisma.session.update).mockResolvedValue({} as never);
  vi.mocked(prisma.session.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.trustedDevice.updateMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.trustedDevice.create).mockResolvedValue({} as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as never);
  vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)) as never);
  const read = async (args: { where: { id: string } }) => {
    const row = rows[args.where.id];
    if (!row) throw new Error('not found');
    return { ...row };
  };
  vi.mocked(prisma.user.findUnique).mockImplementation(read as never);
  vi.mocked(prisma.user.findUniqueOrThrow).mockImplementation(read as never);
  vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.user.count).mockResolvedValue(2 as never);
  vi.mocked(prisma.user.update).mockImplementation((async (args: { where: { id: string }; data: Record<string, unknown> }) =>
    ({ ...apply(rows[args.where.id], args.data) })) as never);
  vi.mocked(prisma.user.updateMany).mockImplementation((async (args: { where: { id: string }; data: Record<string, unknown> }) => {
    const row = rows[args.where.id];
    if (row) apply(row, args.data);
    return { count: row ? 1 : 0 };
  }) as never);
  vi.spyOn(notificationService, 'send').mockResolvedValue(undefined as never);
  vi.spyOn(systemConfigService, 'getEffectivePublicUrl').mockResolvedValue('https://glou.example');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const TURN_OFF = '/api/auth/2fa/turn-off';
const BACKUP_CODES = '/api/auth/2fa/backup-codes';

describe('wrong codes on the step-up routes lock the account like at sign-in (#889)', () => {
  it.each([
    ['turning 2FA off', TURN_OFF],
    ['regenerating backup codes', BACKUP_CODES],
  ])('5 wrong codes when %s, from 5 addresses, lock the right code out too', async (_label, path) => {
    // One account per case: the per-account limiter of #606 is in memory.
    const id = path === TURN_OFF ? 'm1' : 'm1b';
    const row = seed(id);
    for (let i = 0; i < 5; i++) {
      const res = await call('post', path, id, { password: PASSWORD, code: wrongCode() }, `203.0.113.${i + 1}`);
      expect(res.status, `guess ${i + 1}`).toBe(400);
      expect(res.body.error).toBe('INVALID_TOTP_CODE');
    }
    expect(row.twoFactorLockedUntil).toBeInstanceOf(Date);

    const locked = await call('post', path, id, { password: PASSWORD, code: currentCode() }, '203.0.113.99');
    expect(locked.status).toBe(429);
    expect(locked.body.error).toBe('2FA_TEMPORARILY_LOCKED');
    expect(row.isTwoFactorEnabled).toBe(true);
    expect(row.backupCodes).toEqual([]);
    // The owner is told, as for a lock at sign-in.
    await vi.waitFor(() => expect(JSON.stringify(vi.mocked(notificationService.send).mock.calls)).toContain('temporarily locked'));
  });

  it('the lock is the one sign-in reads: a member locked here cannot finish signing in', async () => {
    const row = seed('m2');
    for (let i = 0; i < 3; i++) await call('post', TURN_OFF, 'm2', { password: PASSWORD, code: wrongCode() }, `198.51.100.${i + 1}`);
    for (let i = 0; i < 2; i++) await call('post', BACKUP_CODES, 'm2', { password: PASSWORD, code: wrongCode() }, `198.51.100.${i + 10}`);
    expect(row.twoFactorLockedUntil).toBeInstanceOf(Date);

    const pending = jwt.sign({ userId: 'm2', email: 'm2@example.com', scope: '2fa_pending' }, JWT_SECRET, { algorithm: 'HS256' });
    const res = await request(app).post('/api/auth/2fa/verify-login').set('Authorization', `Bearer ${pending}`)
      .set('Sec-Fetch-Site', 'same-origin').set('X-Forwarded-For', '198.51.100.50').send({ code: currentCode() });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('2FA_TEMPORARILY_LOCKED');
  });

  it('wrong codes left by sign-in count here too', async () => {
    seed('m3', { twoFactorFailedAttempts: 4 });
    await call('post', TURN_OFF, 'm3', { password: PASSWORD, code: wrongCode() }, '192.0.2.1');
    const res = await call('post', TURN_OFF, 'm3', { password: PASSWORD, code: currentCode() }, '192.0.2.2');
    expect(res.status).toBe(429);
    expect(rows.m3.isTwoFactorEnabled).toBe(true);
  });

  it('a right code resets the counter, as at sign-in', async () => {
    const row = seed('m4', { twoFactorFailedAttempts: 4 });
    const res = await call('post', TURN_OFF, 'm4', { password: PASSWORD, code: currentCode() }, '192.0.2.3');
    expect(res.status).toBe(200);
    expect(row.twoFactorFailedAttempts).toBe(0);
    expect(row.twoFactorLockedUntil).toBeNull();
  });

  it('a right code on regenerate resets the counter too', async () => {
    const row = seed('m5', { twoFactorFailedAttempts: 3 });
    const res = await call('post', BACKUP_CODES, 'm5', { password: PASSWORD, code: currentCode() }, '192.0.2.4');
    expect(res.status).toBe(200);
    expect(res.body.data.backupCodes).toHaveLength(10);
    expect(row.twoFactorFailedAttempts).toBe(0);
  }, 30_000); // ten backup codes hashed at the real bcrypt cost

  it('a wrong password is not a code guess: the counter does not move', async () => {
    const row = seed('m6');
    const res = await call('post', TURN_OFF, 'm6', { password: 'not-it', code: wrongCode() }, '192.0.2.5');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
    expect(row.twoFactorFailedAttempts).toBe(0);
  });

  it('trusting a device shares the lock as well', async () => {
    seed('m7', { twoFactorLockedUntil: new Date(Date.now() + 60_000) });
    const res = await call('post', '/api/auth/trust-device', 'm7', { password: PASSWORD, code: currentCode() }, '192.0.2.6');
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('2FA_TEMPORARILY_LOCKED');
  });

  it('the admin step-up (password reset confirmation) shares the lock', async () => {
    const admin = seed('adm', { isAdmin: true });
    seed('member', { isTwoFactorEnabled: false, twoFactorSecret: null });
    for (let i = 0; i < 5; i++) {
      const res = await call('post', '/api/admin/users/member/reset-password', 'adm', { password: PASSWORD, code: wrongCode() }, `192.0.2.${i + 20}`);
      expect(res.status, `guess ${i + 1}`).toBe(403);
      expect(res.body.error).toBe('INVALID_TOTP_CODE');
    }
    expect(admin.twoFactorLockedUntil).toBeInstanceOf(Date);
    const res = await call('post', '/api/admin/users/member/reset-password', 'adm', { password: PASSWORD, code: currentCode() }, '192.0.2.40');
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('2FA_TEMPORARILY_LOCKED');
    expect(rows.member.mustChangePassword).toBeUndefined();
  });

  it('a step-up sent without any code is not a guess', async () => {
    const admin = seed('adm2', { isAdmin: true });
    seed('member2', { isTwoFactorEnabled: false, twoFactorSecret: null });
    for (let i = 0; i < 6; i++) {
      const res = await call('post', '/api/admin/users/member2/reset-password', 'adm2', { password: PASSWORD }, `192.0.2.${i + 60}`);
      expect(res.body.error).toBe('INVALID_TOTP_CODE');
    }
    expect(admin.twoFactorFailedAttempts).toBe(0);
    expect(admin.twoFactorLockedUntil).toBeNull();
  });

  // Review R5: wrong step-up codes leave a trace in the audit log, as at sign-in.
  it.each([
    ['turning 2FA off', TURN_OFF, 'TWO_FACTOR_OFF'],
    ['regenerating backup codes', BACKUP_CODES, 'BACKUP_CODES_REGENERATE'],
  ])('a wrong code when %s is written to the audit log, without the code', async (_label, path, action) => {
    const id = path === TURN_OFF ? 'm8' : 'm8b';
    seed(id, { twoFactorFailedAttempts: 4 });
    const code = wrongCode();
    await call('post', path, id, { password: PASSWORD, code }, '192.0.2.80');
    await call('post', path, id, { password: PASSWORD, code: currentCode() }, '192.0.2.81');
    const entries = vi.mocked(prisma.auditLog.create).mock.calls.map(([a]) => (a as { data: Record<string, unknown> }).data)
      .filter((d) => d.action === action && d.status === 'error');
    expect(entries.map((d) => (d.details as { reason?: string }).reason)).toEqual(['wrong_2fa_code', '2fa_locked']);
    expect(entries.every((d) => d.userId === id)).toBe(true);
    expect(JSON.stringify(entries)).not.toContain(code);
  });
});
