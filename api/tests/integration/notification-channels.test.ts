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
    session: { findUnique: vi.fn(), update: vi.fn() },
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
const token = () => jwt.sign({ userId: 'u1', email: 'u1@example.com', scope: 'full', sessionId: 's1' }, JWT_SECRET, { algorithm: 'HS256' });

const saved: PublicSystemConfig = {
  smtpEnabled: true, smtpHost: 'mail.example.com', smtpPort: 587, smtpUser: null, smtpPassMasked: null, smtpFrom: null, smtpSecure: false,
  gotifyEnabled: false, gotifyUrl: 'https://1.2.3.4', gotifyTokenMasked: null,
  logRetentionDays: 90, sessionRetentionDays: 30, guestShareRetentionDays: 30,
  publicUrl: null, effectivePublicUrl: 'http://localhost:3000',
  registrationOpen: false, backupEnabled: true, backupRetentionDays: 7, backupHour: 3, timeZone: 'UTC',
  updatedAt: null, updatedBy: null,
};

let isAdmin = true;
const prefs = {
  notifEmail: false, notifWebhook: true, notifCategories: [],
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
  // #608: every token carries a live session.
  vi.mocked(prisma.session.findUnique).mockResolvedValue({ revokedAt: null, expiresAt: new Date(Date.now() + 3_600_000) } as never);
  vi.mocked(prisma.session.update).mockResolvedValue({} as never);
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
    vi.mocked(systemConfigService.getPublic).mockResolvedValue({ ...saved, smtpHost: null, gotifyUrl: 'https://1.2.3.4', gotifyTokenMasked: '••••••••', gotifyEnabled: false });

    const { policy } = (await get()).body.data;

    expect(policy.smtpEnabled).toBe(false);
    expect(policy.offReasons).toEqual({ email: 'notConfigured', gotify: 'off' });
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

// #780: backup failures only ever reach admins; #772: the quiet hours are
// read in the instance's time zone, which the page has to name.
describe('GET /user/notifications — categories and time zone (#772, #780)', () => {
  const get = () => request(app).get('/api/user/notifications').set('Authorization', `Bearer ${token()}`);

  it('names the instance time zone', async () => {
    vi.mocked(systemConfigService.getPublic).mockResolvedValue({ ...saved, timeZone: 'Europe/Paris' });

    expect((await get()).body.data.timeZone).toBe('Europe/Paris');
  });

  it('offers backup failures to an admin, with whether automatic backups run', async () => {
    vi.mocked(systemConfigService.getPublic).mockResolvedValue({ ...saved, backupEnabled: false });

    const { data } = (await get()).body;

    expect(data.categories).toEqual(['peak', 'temperature', 'security', 'wishlist', 'backup', 'members']);
    expect(data.automaticBackups).toBe(false);
  });

  it('does not offer backup failures to a member', async () => {
    isAdmin = false;

    const { data } = (await get()).body;

    expect(data.categories).toEqual(['peak', 'temperature', 'security', 'wishlist']);
    expect(data).not.toHaveProperty('automaticBackups');
  });
});

describe('PATCH /user/notifications — categories (#780)', () => {
  const patch = (notifCategories: string[]) => request(app).patch('/api/user/notifications')
    .set('Authorization', `Bearer ${token()}`)
    .set('Sec-Fetch-Site', 'same-origin')
    .send({ notifCategories });

  it('does not store backup failures for a member', async () => {
    isAdmin = false;

    const res = await patch(['peak', 'backup']);

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { notifCategories: ['peak', 'security'] } });
  });

  it('refuses a member list holding only backup failures, which would read as "all"', async () => {
    isAdmin = false;

    const res = await patch(['backup']);

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does not store member account notices for a member (#981)', async () => {
    isAdmin = false;

    const res = await patch(['peak', 'members']);

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { notifCategories: ['peak', 'security'] } });
  });

  it('lets an admin turn member account notices off (#981)', async () => {
    const res = await patch(['peak', 'backup']);

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { notifCategories: ['peak', 'backup', 'security'] } });
  });

  it('stores backup failures for an admin', async () => {
    const res = await patch(['backup', 'security']);

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { notifCategories: ['backup', 'security'] } });
  });
});

// #981: a stolen session cookie must not be able to silence the alerts that
// would tell the owner about it. The category stays on whatever is sent.
describe('PATCH /user/notifications — security alerts cannot be turned off (#981)', () => {
  const withCookieOnly = (body: Record<string, unknown>) => request(app).patch('/api/user/notifications')
    .set('Cookie', `glou_token=${token()}`)
    .set('Sec-Fetch-Site', 'same-origin')
    .send(body);

  it('keeps security alerts when a session cookie sends a list without them', async () => {
    isAdmin = false;

    const res = await withCookieOnly({ notifCategories: ['peak', 'wishlist'] });

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { notifCategories: ['peak', 'wishlist', 'security'] } });
  });

  it('keeps security alerts for an admin too', async () => {
    const res = await withCookieOnly({ notifCategories: ['backup'] });

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { notifCategories: ['backup', 'security'] } });
  });

  it('still stores an empty list as "every category"', async () => {
    const res = await withCookieOnly({ notifCategories: [] });

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { notifCategories: [] } });
  });
});

// Review of #767: every member's test now lands in the administrator's
// shared Gotify app; the global per-IP limiter allowed ~1000 per 15 min.
describe('POST /user/notifications/test/:channel is limited per account', () => {
  it('refuses the test after a few tries, without calling Gotify', async () => {
    keep(vi.spyOn(systemConfigService, 'getGotify').mockResolvedValue({ gotifyEnabled: true, gotifyUrl: 'https://1.2.3.4', gotifyToken: 'APP-TOKEN' }));
    const test = () => request(app).post('/api/user/notifications/test/webhook')
      .set('Authorization', `Bearer ${token()}`)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({});

    for (let i = 0; i < 5; i++) expect((await test()).status).toBe(200);
    const refused = await test();

    expect(refused.status).toBe(429);
    expect(refused.body.error).toBe('TOO_MANY_REQUESTS');
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
