import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';

// Own file: each refusal spends the step-up limiter of the admin router (20 per
// IP), already well used by admin-step-up.test.ts. Same setup as that file:
// the real step-up check runs (bcrypt, otplib, the encrypted 2FA secret), only
// the database and the settings writes are stubbed.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
    session: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
  },
  connectWithRetry: vi.fn(),
}));

import { prisma } from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import { encrypt } from '../../src/lib/crypto';
import { systemConfigService } from '../../src/services/system-config.service';

const JWT_SECRET = 'integration-test-secret';
const KEY = 'ab'.repeat(32);
const ADMIN_PASSWORD = 'admin-pw';
const TOTP_SECRET = authenticator.generateSecret();
let passwordHash = '';

beforeAll(async () => {
  passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 4);
});

const app = createApp();
const token = () => jwt.sign({ userId: 'u1', email: 'u1@example.com', scope: 'full', sessionId: 's1' }, JWT_SECRET, { algorithm: 'HS256' });

const spies: Array<{ mockRestore: () => void }> = [];
const keep = <T extends { mockRestore: () => void }>(s: T): T => {
  spies.push(s);
  return s;
};

const publicConfig = { registrationOpen: false } as never;

beforeEach(() => {
  vi.clearAllMocks();
  // #608: every token carries a live session.
  vi.mocked(prisma.session.findUnique).mockResolvedValue({ revokedAt: null, expiresAt: new Date(Date.now() + 3_600_000) } as never);
  vi.mocked(prisma.session.update).mockResolvedValue({} as never);
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.CONFIG_ENCRYPTION_KEY = KEY;
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', isActive: true, isAdmin: true } as never);
  vi.mocked(prisma.user.findUniqueOrThrow).mockImplementation((async () => ({
    id: 'u1',
    passwordHash,
    isTwoFactorEnabled: true,
    twoFactorSecret: encrypt(TOTP_SECRET),
    backupCodes: [],
  })) as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  keep(vi.spyOn(systemConfigService, 'getPublic').mockResolvedValue(publicConfig));
  keep(vi.spyOn(console, 'error').mockImplementation(() => {}));
});

afterEach(() => {
  spies.splice(0).forEach((s) => s.mockRestore());
});

interface GatedRoute {
  label: string;
  method: 'put' | 'post';
  path: string;
  body: Record<string, unknown>;
  /** The write the step-up guards. */
  effect: () => unknown;
  /** What the route answers once past the step-up. */
  passed: number;
}

const send = (route: GatedRoute, extra: Record<string, unknown> = {}) =>
  request(app)[route.method](route.path)
    .set('Authorization', `Bearer ${token()}`)
    .set('Sec-Fetch-Site', 'same-origin')
    .send({ ...route.body, ...extra });

const auditCalls = () => vi.mocked(prisma.auditLog.create).mock.calls.map(([arg]) => (arg as { data: Record<string, unknown> }).data);

// #893: a stolen session could still erase the audit trail (retention lowered,
// then "run cleanup now"), turn the scheduled backups off, or open sign-up.
// Those changes ask for the same step-up; the safe direction of the same
// settings (keeping data longer, backups on, sign-up closed) does not.
describe('settings that erase data or weaken the instance ask for the step-up (#893)', () => {
  const current = {
    logRetentionDays: 90, sessionRetentionDays: 30, guestShareRetentionDays: 30,
    backupEnabled: true, backupRetentionDays: 7, backupHour: 3,
    registrationOpen: false,
  };

  beforeEach(() => {
    vi.mocked(systemConfigService.getPublic).mockResolvedValue(current as never);
    keep(vi.spyOn(systemConfigService, 'updateRetention').mockResolvedValue(publicConfig));
    keep(vi.spyOn(systemConfigService, 'updateBackupConfig').mockResolvedValue(publicConfig));
    keep(vi.spyOn(systemConfigService, 'updateRegistrationConfig').mockResolvedValue(publicConfig));
  });

  const UNSAFE: GatedRoute[] = [
    { label: 'audit log retention lowered', method: 'put', path: '/api/admin/config/retention', body: { logRetentionDays: 1, sessionRetentionDays: 30, guestShareRetentionDays: 30 }, effect: () => systemConfigService.updateRetention, passed: 200 },
    { label: 'session retention lowered', method: 'put', path: '/api/admin/config/retention', body: { logRetentionDays: 90, sessionRetentionDays: 29, guestShareRetentionDays: 30 }, effect: () => systemConfigService.updateRetention, passed: 200 },
    { label: 'guest share retention lowered', method: 'put', path: '/api/admin/config/retention', body: { logRetentionDays: 365, sessionRetentionDays: 30, guestShareRetentionDays: 1 }, effect: () => systemConfigService.updateRetention, passed: 200 },
    { label: 'scheduled backups turned off', method: 'put', path: '/api/admin/config/backup', body: { backupEnabled: false, backupRetentionDays: 7, backupHour: 3 }, effect: () => systemConfigService.updateBackupConfig, passed: 200 },
    { label: 'backup retention lowered', method: 'put', path: '/api/admin/config/backup', body: { backupEnabled: true, backupRetentionDays: 2, backupHour: 3 }, effect: () => systemConfigService.updateBackupConfig, passed: 200 },
    { label: 'sign-up opened', method: 'put', path: '/api/admin/config/registration', body: { registrationOpen: true }, effect: () => systemConfigService.updateRegistrationConfig, passed: 200 },
  ];

  const SAFE: GatedRoute[] = [
    { label: 'retention raised', method: 'put', path: '/api/admin/config/retention', body: { logRetentionDays: 365, sessionRetentionDays: 30, guestShareRetentionDays: 60 }, effect: () => systemConfigService.updateRetention, passed: 200 },
    { label: 'backup hour changed, backups kept on and longer', method: 'put', path: '/api/admin/config/backup', body: { backupEnabled: true, backupRetentionDays: 14, backupHour: 5 }, effect: () => systemConfigService.updateBackupConfig, passed: 200 },
    { label: 'sign-up kept closed', method: 'put', path: '/api/admin/config/registration', body: { registrationOpen: false }, effect: () => systemConfigService.updateRegistrationConfig, passed: 200 },
  ];

  it.each(UNSAFE.map((r) => [r.label, r] as const))('%s: refused with the session alone', async (_label, route) => {
    const res = await send(route);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('REAUTH_REQUIRED');
    expect(route.effect()).not.toHaveBeenCalled();
    expect(auditCalls()).toContainEqual(expect.objectContaining({ userId: 'u1', action: 'CONFIG_UPDATE', status: 'error', details: expect.objectContaining({ error: 'REAUTH_REQUIRED' }) }));
  });

  it.each(UNSAFE.map((r) => [r.label, r] as const))('%s: accepted with the password and a current code, and audited', async (_label, route) => {
    const res = await send(route, { password: ADMIN_PASSWORD, code: authenticator.generate(TOTP_SECRET) });

    expect(res.status).toBe(route.passed);
    expect(route.effect()).toHaveBeenCalledWith(route.body, 'u1');
    await vi.waitFor(() => expect(auditCalls()).toContainEqual(expect.objectContaining({ action: 'CONFIG_UPDATE', status: 'success' })));
  });

  it('refuses a wrong password', async () => {
    const res = await send(UNSAFE[0], { password: 'not-it', code: authenticator.generate(TOTP_SECRET) });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('INVALID_PASSWORD');
    expect(systemConfigService.updateRetention).not.toHaveBeenCalled();
  });

  it.each(SAFE.map((r) => [r.label, r] as const))('%s: needs the session only', async (_label, route) => {
    const res = await send(route);

    expect(res.status).toBe(200);
    expect(route.effect()).toHaveBeenCalledWith(route.body, 'u1');
    expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('checks the values before the step-up, so a typo spends no backup code', async () => {
    const res = await send(UNSAFE[0], { logRetentionDays: 0, password: ADMIN_PASSWORD });

    expect(res.status).toBe(400);
    expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
