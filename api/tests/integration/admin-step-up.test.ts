import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// #890: after #638, a stolen admin session (the cookie, no password, no phone)
// could still take over accounts through the settings that decide where reset
// links, mail and security alerts go, and through the backup routes (every
// password hash and 2FA secret). Each of them now asks for the same step-up as
// a password reset: the admin's password, plus their own code when they have
// 2FA. The real check runs here (bcrypt, otplib, the encrypted 2FA secret);
// only the database and the side effects are stubbed.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
    session: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    backupRun: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  },
  connectWithRetry: vi.fn(),
}));

import { prisma } from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import { encrypt } from '../../src/lib/crypto';
import { systemConfigService } from '../../src/services/system-config.service';
import { emailService } from '../../src/services/email.service';
import { backupService } from '../../src/services/backup.service';
import { MaintenanceService } from '../../src/services/maintenance.service';

const JWT_SECRET = 'integration-test-secret';
const KEY = 'ab'.repeat(32);
const ADMIN_PASSWORD = 'admin-pw';
const TOTP_SECRET = authenticator.generateSecret();
const DUMP = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'glou-890-')), 'glou-backup.sql.gz');
fs.writeFileSync(DUMP, 'dump');
let passwordHash = '';
let adminHasTwoFactor = true;

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

const publicConfig = { gotifyEnabled: false, gotifyUrl: null } as never;

beforeEach(() => {
  vi.clearAllMocks();
  // #608: every token carries a live session.
  vi.mocked(prisma.session.findUnique).mockResolvedValue({ revokedAt: null, expiresAt: new Date(Date.now() + 3_600_000) } as never);
  vi.mocked(prisma.session.update).mockResolvedValue({} as never);
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.CONFIG_ENCRYPTION_KEY = KEY;
  adminHasTwoFactor = true;
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as never);
  // The auth and admin middlewares: an active admin.
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', isActive: true, isAdmin: true } as never);
  // The step-up reads the admin's own account.
  vi.mocked(prisma.user.findUniqueOrThrow).mockImplementation((async () => ({
    id: 'u1',
    passwordHash,
    isTwoFactorEnabled: adminHasTwoFactor,
    twoFactorSecret: adminHasTwoFactor ? encrypt(TOTP_SECRET) : null,
    backupCodes: [],
  })) as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.backupRun.findUnique).mockResolvedValue({ id: 'b1', success: true, filePath: '/app/backups/b1.sql.gz' } as never);

  keep(vi.spyOn(systemConfigService, 'updateSmtp').mockResolvedValue(publicConfig));
  keep(vi.spyOn(systemConfigService, 'updateGotify').mockResolvedValue(publicConfig));
  keep(vi.spyOn(systemConfigService, 'updateNotificationPolicy').mockResolvedValue(publicConfig));
  keep(vi.spyOn(systemConfigService, 'updateNetworkConfig').mockResolvedValue(publicConfig));
  keep(vi.spyOn(systemConfigService, 'getPublic').mockResolvedValue(publicConfig));
  keep(vi.spyOn(systemConfigService, 'getGotify').mockResolvedValue({ gotifyEnabled: false, gotifyUrl: null, gotifyToken: null }));
  keep(vi.spyOn(emailService, 'testConnection').mockResolvedValue({ success: true }));
  keep(vi.spyOn(emailService, 'sendTestEmail').mockResolvedValue({ success: true }));
  keep(vi.spyOn(backupService, 'getDownloadTarget').mockResolvedValue({ path: DUMP, filename: 'glou-backup.sql.gz' }));
  keep(vi.spyOn(backupService, 'restoreBackup').mockResolvedValue({ safetyBackupRunId: 'safety' }));
  keep(vi.spyOn(backupService, 'runBackup').mockResolvedValue({ id: 'pre-purge', success: true } as never));
  keep(vi.spyOn(MaintenanceService, 'purgeAllData').mockResolvedValue({ counts: { items: 0, cellars: 0, auditLogs: 0 } } as never));
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
  /** The write or side effect the step-up guards. */
  effect: () => unknown;
  /** What the route answers once past the step-up (with the stubs above). */
  passed: number;
}

const ROUTES: GatedRoute[] = [
  { label: 'SMTP settings', method: 'put', path: '/api/admin/config/smtp', body: { smtpHost: 'mail.attacker.example' }, effect: () => systemConfigService.updateSmtp, passed: 200 },
  { label: 'SMTP test', method: 'post', path: '/api/admin/config/test/smtp', body: { email: 'me@attacker.example' }, effect: () => emailService.sendTestEmail, passed: 200 },
  { label: 'Gotify settings', method: 'put', path: '/api/admin/config/gotify', body: { gotifyEnabled: false }, effect: () => systemConfigService.updateGotify, passed: 200 },
  { label: 'Gotify test', method: 'post', path: '/api/admin/config/test/gotify', body: {}, effect: () => systemConfigService.getGotify, passed: 400 },
  { label: 'notification channels', method: 'put', path: '/api/admin/config/notifications', body: { smtpEnabled: false, gotifyEnabled: false }, effect: () => systemConfigService.updateNotificationPolicy, passed: 200 },
  { label: 'public URL', method: 'put', path: '/api/admin/config/network', body: { publicUrl: 'https://attacker.example' }, effect: () => systemConfigService.updateNetworkConfig, passed: 200 },
  { label: 'backup download', method: 'post', path: '/api/admin/backups/b1/download', body: {}, effect: () => auditSuccessFor('BACKUP_DOWNLOAD'), passed: 200 },
  { label: 'backup restore', method: 'post', path: '/api/admin/backups/b1/restore', body: { confirm: true }, effect: () => backupService.restoreBackup, passed: 200 },
  { label: 'full purge', method: 'post', path: '/api/admin/maintenance/purge', body: { confirmation: 'SUPPRIMER' }, effect: () => MaintenanceService.purgeAllData, passed: 200 },
];

const send = (route: GatedRoute, extra: Record<string, unknown> = {}) =>
  request(app)[route.method](route.path)
    .set('Authorization', `Bearer ${token()}`)
    .set('Sec-Fetch-Site', 'same-origin')
    .send({ ...route.body, ...extra });

/** A stand-in "effect" for the download: its success audit entry (the file is read after the step-up). */
const auditSuccessFor = (action: string) => {
  const fn = vi.fn();
  for (const d of auditCalls()) if (d.action === action && d.status === 'success') fn();
  return fn;
};

const auditCalls = () => vi.mocked(prisma.auditLog.create).mock.calls.map(([arg]) => (arg as { data: Record<string, unknown> }).data);

describe('admin routes that can lead to an account takeover ask for the step-up (#890)', () => {
  it.each(ROUTES.map((r) => [r.label, r] as const))('%s: refused with the session alone', async (_label, route) => {
    const res = await send(route);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('REAUTH_REQUIRED');
    expect(route.effect()).not.toHaveBeenCalled();
    expect(auditCalls()).toContainEqual(expect.objectContaining({ userId: 'u1', status: 'error', details: expect.objectContaining({ error: 'REAUTH_REQUIRED' }) }));
  });

  it.each(ROUTES.map((r) => [r.label, r] as const))('%s: accepted with the password and a current code', async (_label, route) => {
    const res = await send(route, { password: ADMIN_PASSWORD, code: authenticator.generate(TOTP_SECRET) });

    expect(res.status).toBe(route.passed);
    expect(route.effect()).toHaveBeenCalled();
  });

  it('refuses the password without the code when the admin has 2FA', async () => {
    const res = await send(ROUTES[0], { password: ADMIN_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('INVALID_TOTP_CODE');
    expect(systemConfigService.updateSmtp).not.toHaveBeenCalled();
  });

  it('refuses a wrong code', async () => {
    const current = authenticator.generate(TOTP_SECRET);
    const wrong = current === '000000' ? '111111' : '000000';
    const res = await send(ROUTES[5], { password: ADMIN_PASSWORD, code: wrong });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('INVALID_TOTP_CODE');
    expect(systemConfigService.updateNetworkConfig).not.toHaveBeenCalled();
  });

  it('refuses a wrong password, as before', async () => {
    const res = await send(ROUTES[6], { password: 'not-it', code: authenticator.generate(TOTP_SECRET) });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('INVALID_PASSWORD');
    expect(auditCalls()).not.toContainEqual(expect.objectContaining({ action: 'BACKUP_DOWNLOAD', status: 'success' }));
  });

  it('answers a stale backup id before the step-up, so it spends no backup code', async () => {
    vi.mocked(backupService.getDownloadTarget).mockRejectedValueOnce(new Error('BACKUP_NOT_FOUND'));
    const res = await send(ROUTES[6], { password: ADMIN_PASSWORD, code: authenticator.generate(TOTP_SECRET) });

    expect(res.status).toBe(404);
    expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('asks the password only when the admin has no 2FA', async () => {
    adminHasTwoFactor = false;
    const res = await send(ROUTES[0], { password: ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(systemConfigService.updateSmtp).toHaveBeenCalledWith({ smtpHost: 'mail.attacker.example' }, 'u1');
  });

  it('audits a settings change once it went through', async () => {
    await send(ROUTES[0], { password: ADMIN_PASSWORD, code: authenticator.generate(TOTP_SECRET) });

    await vi.waitFor(() => expect(auditCalls()).toContainEqual(expect.objectContaining({
      userId: 'u1', action: 'CONFIG_UPDATE', status: 'success', details: { section: 'smtp' },
    })));
  });

  it('checks the settings before the step-up, so a typo spends no backup code', async () => {
    const res = await send(ROUTES[5], { publicUrl: 'not a url', password: ADMIN_PASSWORD });

    expect(res.status).toBe(400);
    expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
