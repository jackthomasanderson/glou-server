import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import bcrypt from 'bcryptjs';

// #767: Gotify delivers through the instance's server only (admin URL + app
// token), so the channel cannot be on without both. #775: an admin is told
// why a channel is unavailable, a member is not. The admin's switch for one
// channel no longer has to carry the other two (a stale copy of a switch
// overwrote another card's save). Only the database and fetch are stubbed.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    session: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
  },
  connectWithRetry: vi.fn(),
}));

import { prisma } from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import { systemConfigService, type PublicSystemConfig } from '../../src/services/system-config.service';

const JWT_SECRET = 'integration-test-secret';
const ADMIN_PASSWORD = 'admin-pw';
let passwordHash = '';

beforeAll(async () => {
  passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 4);
});

const app = createApp();
const token = () => jwt.sign({ userId: 'u1', email: 'u1@example.com', scope: 'full' }, JWT_SECRET, { algorithm: 'HS256' });

const saved: PublicSystemConfig = {
  smtpEnabled: true, smtpHost: 'mail.example.com', smtpPort: 587, smtpUser: null, smtpPassMasked: null, smtpFrom: null, smtpSecure: false,
  gotifyEnabled: false, gotifyUrl: 'https://1.2.3.4', gotifyTokenMasked: null, inAppEnabled: true,
  logRetentionDays: 90, sessionRetentionDays: 30, guestShareRetentionDays: 30,
  publicUrl: null, accessMode: 'direct', effectivePublicUrl: 'http://localhost:3000',
  registrationOpen: false, backupEnabled: true, backupRetentionDays: 7, backupHourUtc: 3,
  updatedAt: null, updatedBy: null,
};

let isAdmin = true;
const prefs = {
  notifInApp: true, notifEmail: false, notifWebhook: true, notifCategories: [],
  notifQuietStart: null, notifQuietEnd: null, notifLanguage: null,
};

const spies: Array<{ mockRestore: () => void }> = [];
const keep = <T extends { mockRestore: () => void }>(s: T): T => {
  spies.push(s);
  return s;
};
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.CONFIG_ENCRYPTION_KEY = 'ab'.repeat(32);
  isAdmin = true;
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as never);
  // The auth middleware reads the account; the preferences route its settings.
  vi.mocked(prisma.user.findUnique).mockImplementation((async () => ({ id: 'u1', isActive: true, isAdmin, ...prefs })) as never);
  vi.mocked(prisma.user.findUniqueOrThrow).mockImplementation((async () => ({
    id: 'u1', passwordHash, isTwoFactorEnabled: false, twoFactorSecret: null, backupCodes: [],
  })) as never);
  vi.mocked(prisma.user.update).mockResolvedValue({} as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  keep(vi.spyOn(systemConfigService, 'getPublic').mockResolvedValue({ ...saved }));
  keep(vi.spyOn(systemConfigService, 'updateGotify').mockResolvedValue({ ...saved }));
  keep(vi.spyOn(systemConfigService, 'updateNotificationPolicy').mockResolvedValue({ ...saved }));
  keep(vi.spyOn(console, 'error').mockImplementation(() => {}));
});

afterEach(() => {
  spies.splice(0).forEach((s) => s.mockRestore());
  vi.unstubAllGlobals();
});

const asAdmin = (method: 'put' | 'post', path: string, body: Record<string, unknown>) =>
  request(app)[method](path)
    .set('Authorization', `Bearer ${token()}`)
    .set('Sec-Fetch-Site', 'same-origin')
    .send({ ...body, password: ADMIN_PASSWORD });

describe('Gotify cannot be switched on without its URL and app token (#767)', () => {
  it('refuses to switch it on when no token is saved nor given', async () => {
    const res = await asAdmin('put', '/api/admin/config/gotify', { gotifyEnabled: true, gotifyUrl: 'https://1.2.3.4' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('GOTIFY_INCOMPLETE');
    expect(systemConfigService.updateGotify).not.toHaveBeenCalled();
  });

  it('refuses to switch it on without a URL', async () => {
    vi.mocked(systemConfigService.getPublic).mockResolvedValue({ ...saved, gotifyUrl: null, gotifyTokenMasked: '••••••••' });

    const res = await asAdmin('put', '/api/admin/config/gotify', { gotifyEnabled: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('GOTIFY_INCOMPLETE');
  });

  it('refuses to clear the URL while it is on', async () => {
    vi.mocked(systemConfigService.getPublic).mockResolvedValue({ ...saved, gotifyEnabled: true, gotifyTokenMasked: '••••••••' });

    const res = await asAdmin('put', '/api/admin/config/gotify', { gotifyUrl: null });

    expect(res.status).toBe(400);
    expect(systemConfigService.updateGotify).not.toHaveBeenCalled();
  });

  it('switches it on with the URL and the token given together', async () => {
    const res = await asAdmin('put', '/api/admin/config/gotify', { gotifyEnabled: true, gotifyUrl: 'https://1.2.3.4', gotifyToken: 'APP-TOKEN' });

    expect(res.status).toBe(200);
    expect(systemConfigService.updateGotify).toHaveBeenCalled();
  });

  it('switches it on with the token already saved', async () => {
    vi.mocked(systemConfigService.getPublic).mockResolvedValue({ ...saved, gotifyTokenMasked: '••••••••' });

    const res = await asAdmin('put', '/api/admin/config/gotify', { gotifyEnabled: true });

    expect(res.status).toBe(200);
  });

  it('always lets it be switched off', async () => {
    const res = await asAdmin('put', '/api/admin/config/gotify', { gotifyEnabled: false, gotifyUrl: null });

    expect(res.status).toBe(200);
  });

  it('refuses it from the channel switches route too', async () => {
    const res = await asAdmin('put', '/api/admin/config/notifications', { gotifyEnabled: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('GOTIFY_INCOMPLETE');
    expect(systemConfigService.updateNotificationPolicy).not.toHaveBeenCalled();
  });
});

describe('PUT /admin/config/notifications saves only the switches it is sent', () => {
  it('writes one switch without touching the other two', async () => {
    const res = await asAdmin('put', '/api/admin/config/notifications', { inAppEnabled: false });

    expect(res.status).toBe(200);
    expect(systemConfigService.updateNotificationPolicy).toHaveBeenCalledWith({ inAppEnabled: false }, 'u1');
  });

  it.each([
    ['no switch at all', {}],
    ['a switch that is not a boolean', { smtpEnabled: 'yes' }],
  ])('refuses %s', async (_label, body) => {
    const res = await asAdmin('put', '/api/admin/config/notifications', body);

    expect(res.status).toBe(400);
    expect(systemConfigService.updateNotificationPolicy).not.toHaveBeenCalled();
  });
});

describe('the admin Gotify test (#767)', () => {
  it('posts to the saved server with its app token', async () => {
    keep(vi.spyOn(systemConfigService, 'getGotify').mockResolvedValue({ gotifyEnabled: true, gotifyUrl: 'https://1.2.3.4', gotifyToken: 'APP-TOKEN' }));

    const res = await asAdmin('post', '/api/admin/config/test/gotify', {});

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ success: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://1.2.3.4/message');
    expect(init.headers).toMatchObject({ 'X-Gotify-Key': 'APP-TOKEN' });
  });

  it('sends nothing without a token', async () => {
    keep(vi.spyOn(systemConfigService, 'getGotify').mockResolvedValue({ gotifyEnabled: true, gotifyUrl: 'https://1.2.3.4', gotifyToken: null }));

    const res = await asAdmin('post', '/api/admin/config/test/gotify', {});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('GOTIFY_NOT_CONFIGURED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /user/notifications — the channels a member can use (#767, #775)', () => {
  const get = () => request(app).get('/api/user/notifications').set('Authorization', `Bearer ${token()}`);

  it('has no per-member Gotify address any more', async () => {
    const res = await get();

    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('webhookUrl');
    expect(res.body.data).not.toHaveProperty('isAdmin');
  });

  it('offers Gotify only when it is on with a URL and a token', async () => {
    vi.mocked(systemConfigService.getPublic).mockResolvedValue({ ...saved, gotifyEnabled: true, gotifyTokenMasked: null });
    expect((await get()).body.data.policy.gotifyEnabled).toBe(false);

    vi.mocked(systemConfigService.getPublic).mockResolvedValue({ ...saved, gotifyEnabled: true, gotifyTokenMasked: '••••••••' });
    expect((await get()).body.data.policy.gotifyEnabled).toBe(true);
  });

  it('tells an admin why each channel is unavailable', async () => {
    vi.mocked(systemConfigService.getPublic).mockResolvedValue({ ...saved, smtpHost: null, gotifyUrl: 'https://1.2.3.4', gotifyTokenMasked: '••••••••', gotifyEnabled: false, inAppEnabled: false });

    const { policy } = (await get()).body.data;

    expect(policy.smtpEnabled).toBe(false);
    expect(policy.offReasons).toEqual({ email: 'notConfigured', gotify: 'off', inApp: 'off' });
  });

  it('does not tell a member', async () => {
    isAdmin = false;
    vi.mocked(systemConfigService.getPublic).mockResolvedValue({ ...saved, smtpHost: null });

    const { policy } = (await get()).body.data;

    expect(policy.smtpEnabled).toBe(false);
    expect(policy).not.toHaveProperty('offReasons');
  });
});

describe('PATCH /user/notifications (#767)', () => {
  it('no longer stores a Gotify address sent by an old page', async () => {
    const res = await request(app).patch('/api/user/notifications')
      .set('Authorization', `Bearer ${token()}`)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ notifWebhook: true, webhookUrl: 'https://5.6.7.8/hook' });

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { notifWebhook: true } });
  });
});

describe('a channel switch is not blocked by an older Gotify state', () => {
  it('saves the in-app switch while Gotify was left on without a token', async () => {
    vi.mocked(systemConfigService.getPublic).mockResolvedValue({ ...saved, gotifyEnabled: true, gotifyTokenMasked: null });

    const res = await asAdmin('put', '/api/admin/config/notifications', { inAppEnabled: false });

    expect(res.status).toBe(200);
  });
});
