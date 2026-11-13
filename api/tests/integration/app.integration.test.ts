import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

// Every router imported by createApp() ultimately imports this module; the
// mock replaces it wholesale so nothing tries to reach a real database.
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    session: { findUnique: vi.fn(), update: vi.fn() },
    inventoryItem: { findMany: vi.fn() },
    tastingNote: { findMany: vi.fn(), count: vi.fn() },
    auditLog: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    backupRun: { findUnique: vi.fn(), findFirst: vi.fn() },
    systemConfig: { findUnique: vi.fn() },
    guestShare: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    cellar: { findMany: vi.fn() },
    collection: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
  connectWithRetry: vi.fn(),
}));

import { prisma } from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import { backupService } from '../../src/services/backup.service';
import { authService } from '../../src/services/auth.service';
import pkg from '../../package.json';

const JWT_SECRET = 'integration-test-secret';
const app = createApp();

function authToken(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    { userId: 'u1', email: 'u1@example.com', scope: 'full', sessionId: 's1', ...overrides },
    JWT_SECRET,
    { algorithm: 'HS256' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = JWT_SECRET;
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ isActive: true } as never);
  vi.mocked(prisma.session.findUnique).mockResolvedValue({ revokedAt: null, expiresAt: new Date(Date.now() + 3_600_000) } as never);
  vi.mocked(prisma.session.update).mockResolvedValue({} as never);
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as never);
});

describe('unauthenticated access', () => {
  it('GET /health is open', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe(pkg.version);
  });

  // ISSUE_169: the bug report template and SECURITY.md ask reporters for a
  // version — this is what the UI reads to show one they can actually copy.
  it('GET /api/version is open and returns the package version', async () => {
    const res = await request(app).get('/api/version');
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(pkg.version);
  });

  // #625: the browser builds bottle QR codes; it reads the address to encode here.
  describe('GET /api/version publicUrl (#625)', () => {
    const appUrl = process.env.APP_URL;
    afterEach(() => {
      if (appUrl === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = appUrl;
    });

    it('gives the public address set by the admin', async () => {
      process.env.APP_URL = 'http://localhost:3000';
      vi.mocked(prisma.systemConfig.findUnique).mockResolvedValue({ publicUrl: 'https://cave.example.org' } as never);
      const res = await request(app).get('/api/version');
      expect(res.body.data.publicUrl).toBe('https://cave.example.org');
    });

    it('falls back to APP_URL when it is a real address', async () => {
      process.env.APP_URL = 'http://192.168.1.20:3000';
      vi.mocked(prisma.systemConfig.findUnique).mockResolvedValue({ publicUrl: null } as never);
      const res = await request(app).get('/api/version');
      expect(res.body.data.publicUrl).toBe('http://192.168.1.20:3000');
    });

    it.each([['http://localhost:3000'], ['http://127.0.0.1:3000'], ['http://[::1]:3000'], [undefined]])(
      'is null when only a loopback address is configured (APP_URL=%s)',
      async (value) => {
        if (value === undefined) delete process.env.APP_URL;
        else process.env.APP_URL = value;
        vi.mocked(prisma.systemConfig.findUnique).mockResolvedValue({ publicUrl: null } as never);
        const res = await request(app).get('/api/version');
        expect(res.status).toBe(200);
        expect(res.body.data.publicUrl).toBeNull();
      },
    );

    it('still answers the version when the configuration cannot be read', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(prisma.systemConfig.findUnique).mockRejectedValue(new Error('db down'));
      const res = await request(app).get('/api/version');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ version: pkg.version, publicUrl: null });
    });
  });

  // ISSUE_019: it used to answer 'ok' unconditionally — now it actually
  // queries the database, so a probe stops going green through an outage.
  it('GET /health returns 503 when the database is unreachable', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('connection refused'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
  });

  it('rejects a protected GET with 401 and a stable error code', async () => {
    for (const path of ['/api/tastings', '/api/inventory', '/api/collections']) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(401);
      expect(res.body.error, path).toBe('UNAUTHORIZED');
    }
  });

  it('rejects a garbage bearer token with 401', async () => {
    const res = await request(app).get('/api/tastings').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TOKEN_INVALID_OR_EXPIRED');
  });

  it('rejects a 2fa_pending-scoped token with 403', async () => {
    const res = await request(app)
      .get('/api/tastings')
      .set('Authorization', `Bearer ${authToken({ scope: '2fa_pending' })}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('2FA_REQUIRED');
  });
});

describe('CSRF guard (Fetch Metadata / Origin)', () => {
  it('blocks a cross-site state-changing request before auth even runs', async () => {
    const res = await request(app)
      .post('/api/tastings')
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ rating: 4 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CSRF_CROSS_SITE_REJECTED');
  });

  it('lets same-origin requests through to the auth layer', async () => {
    const res = await request(app)
      .post('/api/tastings')
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ rating: 4 });
    expect(res.status).toBe(401); // passed CSRF, failed auth (no token)
  });

  it('blocks another app of the same domain whose Origin is not trusted (#600)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const res = await request(app)
        .post('/api/user/delete-account')
        .set('Host', 'glou.home.example')
        .set('Sec-Fetch-Site', 'same-site')
        .set('Origin', 'https://photos.home.example');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('CSRF_ORIGIN_REJECTED');
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps the guest share token out of the CSRF and error log lines (#612)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const token = 'gst_SuperSecretToken123';
      const rejected = await request(app)
        .patch(`/api/guest/${token}/inventory/7`)
        .set('Origin', 'https://evil.example')
        .send({ quantity: 1 });
      const malformed = await request(app)
        .patch(`/api/guest/${token}/inventory/7`)
        .set('Sec-Fetch-Site', 'same-origin')
        .set('Content-Type', 'application/json')
        .send('{"quantity": 1,');
      expect(rejected.status).toBe(403);
      expect(malformed.status).toBe(400);
      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).toContain('/api/guest/***/inventory/7');
      expect(logged).not.toContain(token);
    } finally {
      warn.mockRestore();
    }
  });

  it('does not gate safe methods', async () => {
    const res = await request(app).get('/api/tastings').set('Sec-Fetch-Site', 'cross-site');
    expect(res.status).toBe(401); // CSRF-exempt, still needs auth
  });
});

describe('authenticated request plumbing', () => {
  it('returns 400 VALIDATION_ERROR for a bad body on POST /api/tastings', async () => {
    const res = await request(app)
      .post('/api/tastings')
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ rating: 99 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('401s when the backing account has been deactivated', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ isActive: false } as never);
    const res = await request(app)
      .get('/api/tastings')
      .set('Authorization', `Bearer ${authToken()}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('ACCOUNT_DEACTIVATED');
  });
});

// #581: a database restart used to answer 401 "token invalid or expired",
// which the web app rightly reads as "signed out".
describe('database outage during authentication (#581)', () => {
  function databaseUnreachable(): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError("Can't reach database server", {
      code: 'P1001',
      clientVersion: '7.0.0',
    });
  }

  it('answers 503, not 401, when the account lookup fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(prisma.user.findUnique).mockRejectedValue(databaseUnreachable());
    for (const path of ['/api/user/me', '/api/tastings', '/api/inventory']) {
      const res = await request(app).get(path).set('Authorization', `Bearer ${authToken()}`);
      expect(res.status, path).toBe(503);
      expect(res.body.error, path).toBe('DATABASE_UNAVAILABLE');
    }
    consoleError.mockRestore();
  });

  it('answers 503, not 401, when the session lookup fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(prisma.session.findUnique).mockRejectedValueOnce(databaseUnreachable());
    const res = await request(app)
      .get('/api/tastings')
      .set('Authorization', `Bearer ${authToken({ sessionId: 's1' })}`);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('DATABASE_UNAVAILABLE');
    consoleError.mockRestore();
  });

  it('still answers 401 TOKEN_INVALID_OR_EXPIRED for an expired token', async () => {
    const expired = jwt.sign(
      { userId: 'u1', email: 'u1@example.com', scope: 'full', exp: Math.floor(Date.now() / 1000) - 60 },
      JWT_SECRET,
      { algorithm: 'HS256' },
    );
    const res = await request(app).get('/api/tastings').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TOKEN_INVALID_OR_EXPIRED');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('answers 401, not 500, for a validly signed token that is not a session token', async () => {
    // The trusted-device cookie is signed with the same secret: { tdt }.
    const trustedDevice = jwt.sign({ tdt: 'x' }, JWT_SECRET, { algorithm: 'HS256' });
    const res = await request(app).get('/api/tastings').set('Authorization', `Bearer ${trustedDevice}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TOKEN_INVALID_OR_EXPIRED');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  // #608: every token the API issues carries a session; one without it (only
  // a forged one) would never be checked against the sessions table, so no
  // "sign out everywhere" could cut it off.
  it('answers 401 for a full token without a session id, before any database read', async () => {
    for (const sessionId of [undefined, '']) {
      const res = await request(app)
        .get('/api/tastings')
        .set('Authorization', `Bearer ${authToken({ sessionId })}`);
      expect(res.status, String(sessionId)).toBe(401);
      expect(res.body.error).toBe('TOKEN_INVALID_OR_EXPIRED');
    }
    const legacy = jwt.sign({ userId: 'u1', email: 'u1@example.com' }, JWT_SECRET, { algorithm: 'HS256' });
    const res = await request(app).get('/api/tastings').set('Authorization', `Bearer ${legacy}`);
    expect(res.status).toBe(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  it('still answers 401 TOKEN_INVALID_OR_EXPIRED for a token signed with another secret', async () => {
    const forged = jwt.sign({ userId: 'u1', email: 'u1@example.com', scope: 'full' }, 'another-secret', { algorithm: 'HS256' });
    const res = await request(app).get('/api/tastings').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TOKEN_INVALID_OR_EXPIRED');
  });
});

describe('error handling contract', () => {
  it('reports a malformed JSON body as 400, not 500', async () => {
    const res = await request(app)
      .post('/api/tastings')
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('Content-Type', 'application/json')
      .send('{"rating": 4,');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MALFORMED_JSON');
  });

  it('reports an oversized JSON body as 413, not 500', async () => {
    const res = await request(app)
      .post('/api/tastings')
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ notes: 'x'.repeat(3 * 1024 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects a non-numeric pagination parameter with 400 instead of failing deep down', async () => {
    // ISSUE_108: `parseInt('abc')` produced NaN, which reached Prisma as `skip`.
    const res = await request(app)
      .get('/api/tastings?page=abc')
      .set('Authorization', `Bearer ${authToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(prisma.tastingNote.findMany).not.toHaveBeenCalled();
  });

  it('serves the first page for a blank pagination parameter', async () => {
    vi.mocked(prisma.tastingNote.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.tastingNote.count).mockResolvedValue(0 as never);
    const res = await request(app)
      .get('/api/tastings?page=')
      .set('Authorization', `Bearer ${authToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.page).toBe(1);
  });

  it('reports an oversized avatar as 413, the headline ISSUE_105 scenario', async () => {
    // A phone photo over the 5MB multer limit used to answer 500 "unexpected
    // error", so neither the member nor the operator could tell what went wrong.
    const res = await request(app)
      .post('/api/user/avatar')
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Sec-Fetch-Site', 'same-origin')
      .attach('avatar', Buffer.alloc(6 * 1024 * 1024), { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('FILE_TOO_LARGE');
  });

  it('rejects a disallowed upload type as 400, not 500', async () => {
    const res = await request(app)
      .post('/api/user/avatar')
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Sec-Fetch-Site', 'same-origin')
      .attach('avatar', Buffer.from('<svg/>'), { filename: 'x.svg', contentType: 'image/svg+xml' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('SVG_NOT_ALLOWED');
  });

  it('turns an unexpected service failure into a logged, opaque 500', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(prisma.tastingNote.findMany).mockRejectedValue(
      new Error('relation "TastingNote" does not exist'),
    );
    vi.mocked(prisma.tastingNote.count).mockResolvedValue(0 as never);

    const res = await request(app)
      .get('/api/tastings')
      .set('Authorization', `Bearer ${authToken()}`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'UNEXPECTED_ERROR' });
    // ISSUE_063: the real cause must reach the logs; ISSUE_051: never the client.
    expect(consoleError).toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('relation');
    consoleError.mockRestore();
  });
});

describe('unknown routes', () => {
  it('returns the JSON 404 shape', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NOT_FOUND' });
  });
});

describe('GET /api/user/me', () => {
  // #576: the security settings read the 2FA state from this response.
  it('tells the client whether two-factor authentication is on, without any secret', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
      id: 'u1',
      username: 'u1',
      email: 'u1@example.com',
      passwordHash: 'stored-password-hash',
      pinHash: 'stored-pin-hash',
      isTwoFactorEnabled: true,
      twoFactorSecret: 'TOTP-SECRET',
      backupCodes: ['hashed-backup-code'],
      mustChangePassword: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    } as never);

    const res = await request(app)
      .get('/api/user/me')
      .set('Authorization', `Bearer ${authToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isTwoFactorEnabled).toBe(true);
    for (const secret of ['passwordHash', 'pinHash', 'twoFactorSecret', 'backupCodes']) {
      expect(res.body.data, secret).not.toHaveProperty(secret);
    }
  });
});

describe('POST /api/auth/login refusals', () => {
  it('reports a deactivated account as INVALID_CREDENTIALS, not UNEXPECTED_ERROR', async () => {
    const { authService } = await import('../../src/services/auth.service');
    vi.spyOn(authService, 'login').mockRejectedValueOnce(new Error('ACCOUNT_DEACTIVATED'));
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'u1@example.com', password: 'whatever-password' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });
});

// #638: the profile shows how many backup codes are left.
describe('GET /api/user/backup-codes', () => {
  it('answers a count, never the codes', async () => {
    const spy = vi.spyOn(authService, 'countBackupCodes').mockResolvedValueOnce(7);
    const res = await request(app).get('/api/user/backup-codes').set('Authorization', `Bearer ${authToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { remaining: 7 } });
    expect(spy).toHaveBeenCalledWith('u1');
    spy.mockRestore();
  });

  it('requires a session', async () => {
    expect((await request(app).get('/api/user/backup-codes')).status).toBe(401);
  });
});

// #638: regenerating the backup codes from the profile.
describe('POST /api/auth/2fa/backup-codes', () => {
  const post = (body: Record<string, unknown>) => request(app)
    .post('/api/auth/2fa/backup-codes')
    .set('Authorization', `Bearer ${authToken()}`)
    .set('Sec-Fetch-Site', 'same-origin')
    .send(body);

  it('requires a session', async () => {
    const res = await request(app).post('/api/auth/2fa/backup-codes').set('Sec-Fetch-Site', 'same-origin').send({});
    expect(res.status).toBe(401);
  });

  it('requires both the password and a code', async () => {
    const spy = vi.spyOn(authService, 'regenerateBackupCodes');
    expect((await post({ password: 'pw' })).body.error).toBe('VALIDATION_ERROR');
    expect((await post({ code: '123456' })).body.error).toBe('VALIDATION_ERROR');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it.each(['INVALID_CREDENTIALS', 'INVALID_TOTP_CODE', '2FA_NOT_ENABLED'])('answers %s as is', async (code) => {
    const spy = vi.spyOn(authService, 'regenerateBackupCodes').mockRejectedValueOnce(new Error(code));
    const res = await post({ password: 'pw', code: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(code);
    spy.mockRestore();
  });

  it('returns the new codes once', async () => {
    const backupCodes = Array.from({ length: 10 }, (_, i) => `${i}`.padStart(20, 'a'));
    const spy = vi.spyOn(authService, 'regenerateBackupCodes').mockResolvedValueOnce({ backupCodes });
    const res = await post({ password: 'pw', code: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.data.backupCodes).toEqual(backupCodes);
    expect(spy).toHaveBeenCalledWith('u1', 'pw', '123456', expect.objectContaining({ ip: expect.any(String) }));
    spy.mockRestore();
  });
});

describe('GET /api/auth/registration-status', () => {
  it('reports closed once an account exists and registrations are closed', async () => {
    const { systemConfigService } = await import('../../src/services/system-config.service');
    vi.spyOn(systemConfigService, 'isRegistrationOpen').mockResolvedValueOnce(false);
    (prisma.user as unknown as { count: ReturnType<typeof vi.fn> }).count = vi.fn().mockResolvedValue(3);
    const res = await request(app).get('/api/auth/registration-status');
    expect(res.status).toBe(200);
    expect(res.body.data.registrationOpen).toBe(false);
  });

  it('reports open on an empty instance, where the first account always gets through', async () => {
    const { systemConfigService } = await import('../../src/services/system-config.service');
    vi.spyOn(systemConfigService, 'isRegistrationOpen').mockResolvedValueOnce(false);
    (prisma.user as unknown as { count: ReturnType<typeof vi.fn> }).count = vi.fn().mockResolvedValue(0);
    const res = await request(app).get('/api/auth/registration-status');
    expect(res.body.data.registrationOpen).toBe(true);
  });
});

// #638: a reset that turns a member's 2FA off asks the admin to re-authenticate.
describe('POST /api/admin/users/:id/reset-password', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'm1', isActive: true, isAdmin: true } as never);
  });
  const post = (body?: Record<string, unknown>) => request(app)
    .post('/api/admin/users/m1/reset-password')
    .set('Authorization', `Bearer ${authToken()}`)
    .set('Sec-Fetch-Site', 'same-origin')
    .send(body ?? {});

  it.each(['REAUTH_REQUIRED', 'INVALID_PASSWORD', 'INVALID_TOTP_CODE'])('answers %s with 403', async (code) => {
    const spy = vi.spyOn(authService, 'adminResetPassword').mockRejectedValueOnce(new Error(code));
    const res = await post({ password: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(code);
    spy.mockRestore();
  });

  it('passes the admin\'s password and code to the service, and returns the temporary password', async () => {
    const spy = vi.spyOn(authService, 'adminResetPassword').mockResolvedValueOnce('temp-pass-123');
    const res = await post({ password: 'admin-pw', code: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.data.tempPassword).toBe('temp-pass-123');
    expect(spy).toHaveBeenCalledWith('m1', 'u1', expect.objectContaining({ ip: expect.any(String) }), { password: 'admin-pw', code: '123456' });
    spy.mockRestore();
  });

  it('an empty body is valid, the service then asks for the password', async () => {
    const spy = vi.spyOn(authService, 'adminResetPassword').mockResolvedValueOnce('temp-pass-123');
    const res = await request(app)
      .post('/api/admin/users/m1/reset-password')
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Sec-Fetch-Site', 'same-origin');
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith('m1', 'u1', expect.anything(), {});
    spy.mockRestore();
  });

  it('rejects an oversized code', async () => {
    expect((await post({ password: 'x', code: 'a'.repeat(21) })).body.error).toBe('VALIDATION_ERROR');
  });

  // Last in the block: it spends the route's limiter (20 per window).
  it('is rate-limited like the other password and 2FA checks', async () => {
    const spy = vi.spyOn(authService, 'adminResetPassword').mockRejectedValue(new Error('INVALID_PASSWORD'));
    let status = 0;
    for (let i = 0; i < 21 && status !== 429; i++) status = (await post({ password: 'guess' })).status;
    expect(status).toBe(429);
    spy.mockRestore();
  });
});

// #638 (review): granting the admin role hands the session holder a second
// admin account, so it asks for the same step-up as a password reset.
describe('POST /api/admin/users/:id/role', () => {
  beforeEach(() => {
    // The caller is an active admin (auth + admin middleware); the target m1 is a member.
    vi.mocked(prisma.user.findUnique).mockImplementation((async (args: { where: { id: string } }) =>
      args.where.id === 'm1' ? { id: 'm1', isActive: true, isAdmin: false } : { id: args.where.id, isActive: true, isAdmin: true }) as never);
    (prisma.user as unknown as { update: ReturnType<typeof vi.fn> }).update = vi.fn().mockResolvedValue({ id: 'm1', isAdmin: true });
    (prisma as unknown as { $transaction: unknown }).$transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
    // Another active admin stays (the last-admin checks, review of #975).
    (prisma.user as unknown as { count: unknown }).count = vi.fn().mockResolvedValue(1);
  });
  const post = (body: Record<string, unknown>) => request(app)
    .post('/api/admin/users/m1/role')
    .set('Authorization', `Bearer ${authToken()}`)
    .set('Sec-Fetch-Site', 'same-origin')
    .send(body);

  it.each(['REAUTH_REQUIRED', 'INVALID_PASSWORD', 'INVALID_TOTP_CODE'])('refuses a grant with %s (403), changing nothing', async (code) => {
    const spy = vi.spyOn(authService, 'reauthenticateAdmin').mockRejectedValueOnce(new Error(code));
    const res = await post({ isAdmin: true, password: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(code);
    expect(prisma.user.update).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('grants with the admin\'s password and code, and audits it', async () => {
    const spy = vi.spyOn(authService, 'reauthenticateAdmin').mockResolvedValueOnce();
    const res = await post({ isAdmin: true, password: 'admin-pw', code: '123456' });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith('u1', { password: 'admin-pw', code: '123456' }, expect.anything(),
      { action: 'ADMIN_ROLE_CHANGE', details: { targetUserId: 'm1', isAdmin: true } });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isAdmin: true }) }));
    spy.mockRestore();
  });

  it.each([
    ['an unknown account', 'nobody', 404, 'USER_NOT_FOUND'],
    ['an account already admin', 'a2', 409, 'ALREADY_ADMIN'],
  ])('refuses a grant to %s before the step-up (no backup code spent)', async (_label, id, status, error) => {
    vi.mocked(prisma.user.findUnique).mockImplementation((async (args: { where: { id: string } }) =>
      args.where.id === 'nobody' ? null : { id: args.where.id, isActive: true, isAdmin: true }) as never);
    // The middlewares look the caller (u1) up first; then the target.
    const spy = vi.spyOn(authService, 'reauthenticateAdmin');
    const res = await request(app)
      .post(`/api/admin/users/${id}/role`)
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ isAdmin: true, password: 'admin-pw', code: 'ffff0000ffff0000ffff' });
    expect(res.status).toBe(status);
    expect(res.body.error).toBe(error);
    expect(spy).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('removing the role asks for the step-up too (#603)', async () => {
    vi.mocked(prisma.user.findUnique).mockImplementation((async (args: { where: { id: string } }) =>
      ({ id: args.where.id, isActive: true, isAdmin: true })) as never);
    const spy = vi.spyOn(authService, 'reauthenticateAdmin').mockRejectedValueOnce(new Error('REAUTH_REQUIRED'));
    const res = await post({ isAdmin: false });
    expect(res.status).toBe(403);
    expect(spy).toHaveBeenCalledWith('u1', {}, expect.anything(), { action: 'ADMIN_ROLE_CHANGE', details: { targetUserId: 'm1', isAdmin: false } });
    expect(prisma.user.update).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // Review of #975: two admins removing each other's role at the same moment
  // left none. The count is made again in the transaction, admin rows locked.
  it('refuses to remove the role of the last other admin, counted after locking the admin rows', async () => {
    vi.mocked(prisma.user.findUnique).mockImplementation((async (args: { where: { id: string } }) =>
      ({ id: args.where.id, isActive: true, isAdmin: true })) as never);
    const p = prisma as unknown as Record<string, unknown> & { user: Record<string, ReturnType<typeof vi.fn>> };
    // One other admin before the step-up; none once the admin rows are locked.
    p.user.count = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    vi.mocked(prisma.$queryRaw).mockClear();
    const spy = vi.spyOn(authService, 'reauthenticateAdmin').mockResolvedValueOnce();

    const res = await post({ isAdmin: false, password: 'admin-pw' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CANNOT_REMOVE_LAST_ADMIN');
    expect(vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0]).toBeLessThan(p.user.count.mock.invocationCallOrder[1]);
    expect(prisma.user.update).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('GET /api/admin/audit-logs filters', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ isActive: true, isAdmin: true } as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.auditLog.count).mockResolvedValue(0 as never);
  });

  it('turns q, status and the day range into a where clause shared by the page and the count', async () => {
    const res = await request(app)
      .get('/api/admin/audit-logs?q=login&status=error&from=2026-10-01&to=2026-10-02')
      .set('Authorization', `Bearer ${authToken()}`);
    expect(res.status).toBe(200);
    const where = vi.mocked(prisma.auditLog.findMany).mock.calls[0][0]?.where as Record<string, any>;
    expect(where.status).toBe('error');
    // #695: a member deleted for good is found by the name kept on the row.
    expect(where.OR).toHaveLength(5);
    expect(where.OR).toContainEqual({ actorName: { contains: 'login', mode: 'insensitive' } });
    expect(where.createdAt.gte).toEqual(new Date('2026-10-01'));
    expect(where.createdAt.lte).toEqual(new Date('2026-10-02T23:59:59.999Z'));
    expect(vi.mocked(prisma.auditLog.count).mock.calls[0][0]).toEqual({ where });
  });

  it('applies no filter when none is given', async () => {
    await request(app).get('/api/admin/audit-logs').set('Authorization', `Bearer ${authToken()}`);
    expect(vi.mocked(prisma.auditLog.findMany).mock.calls[0][0]?.where).toEqual({});
  });

  it('rejects an unknown status', async () => {
    const res = await request(app)
      .get('/api/admin/audit-logs?status=bogus')
      .set('Authorization', `Bearer ${authToken()}`);
    expect(res.status).toBe(400);
  });

  // #698: the action filter, combined with the member search.
  it('filters on one or more action types, alongside the free-text search', async () => {
    const res = await request(app)
      .get('/api/admin/audit-logs?q=alice&actions=LOGIN,LOGIN_2FA')
      .set('Authorization', `Bearer ${authToken()}`);
    expect(res.status).toBe(200);
    const where = vi.mocked(prisma.auditLog.findMany).mock.calls[0][0]?.where as Record<string, any>;
    expect(where.action).toEqual({ in: ['LOGIN', 'LOGIN_2FA'] });
    expect(where.OR).toHaveLength(5);
  });

  it('rejects an unknown action type', async () => {
    const res = await request(app)
      .get('/api/admin/audit-logs?actions=LOGIN,DROP_TABLE')
      .set('Authorization', `Bearer ${authToken()}`);
    expect(res.status).toBe(400);
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });
});

// #669: the route answered `{ directoryWritable }` without the `data` envelope
// every web call unwraps, so the "backups folder not writable" banner never showed.
describe('GET /api/admin/backups/health', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ isActive: true, isAdmin: true } as never);
  });
  let writableSpy: ReturnType<typeof vi.spyOn> | undefined;
  afterEach(() => {
    writableSpy?.mockRestore();
  });

  it.each([false, true])('answers { data: { directoryWritable: %s } }', async (writable) => {
    writableSpy = vi.spyOn(backupService, 'isBackupsDirWritable').mockReturnValue(writable);
    const res = await request(app).get('/api/admin/backups/health').set('Authorization', `Bearer ${authToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.directoryWritable).toBe(writable);
  });

  // #756: the admin page warns when automatic backups are off or none ever succeeded.
  it('says whether automatic backups are on and when the last successful one ran', async () => {
    writableSpy = vi.spyOn(backupService, 'isBackupsDirWritable').mockReturnValue(true);
    vi.mocked(prisma.systemConfig.findUnique).mockResolvedValue({ backupEnabled: false } as never);
    // The last success, then the last run of any outcome (#671).
    vi.mocked(prisma.backupRun.findFirst)
      .mockResolvedValueOnce({ runAt: new Date('2026-11-01T03:00:00Z') } as never)
      .mockResolvedValueOnce({ success: true } as never);
    const res = await request(app).get('/api/admin/backups/health').set('Authorization', `Bearer ${authToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { directoryWritable: true, backupEnabled: false, lastSuccessAt: '2026-11-01T03:00:00.000Z', lastRunFailed: false, overdue: false } });
    expect(vi.mocked(prisma.backupRun.findFirst).mock.calls[0][0]?.where).toEqual({ success: true });
  });

  it('still answers the folder check when the backup status cannot be read', async () => {
    writableSpy = vi.spyOn(backupService, 'isBackupsDirWritable').mockReturnValue(false);
    vi.mocked(prisma.systemConfig.findUnique).mockRejectedValue(new Error('db down'));
    vi.mocked(prisma.backupRun.findFirst).mockResolvedValue(null as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(app).get('/api/admin/backups/health').set('Authorization', `Bearer ${authToken()}`);
    error.mockRestore();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { directoryWritable: false } });
  });

  it('reports no successful backup, and backups on by default before the settings exist', async () => {
    writableSpy = vi.spyOn(backupService, 'isBackupsDirWritable').mockReturnValue(true);
    vi.mocked(prisma.systemConfig.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.backupRun.findFirst).mockResolvedValue(null as never);
    const res = await request(app).get('/api/admin/backups/health').set('Authorization', `Bearer ${authToken()}`);
    expect(res.body).toEqual({ data: { directoryWritable: true, backupEnabled: true, lastSuccessAt: null, lastRunFailed: false, overdue: false } });
  });
});

// #486: the admin sees every member's live guest links (never their token) and can revoke one.
describe('admin guest links (#486)', () => {
  const share = {
    id: 's1', tokenHash: 'secret-hash', label: 'For Paul', inviteeName: 'Paul',
    expiresAt: null, revokedAt: null, hidePrices: true, hideNotes: false,
    cellarIds: ['c1', 'c2'], writeCellarIds: ['c1'], collectionIds: [],
    userId: 'u2', createdAt: new Date('2026-10-01T10:00:00Z'), updatedAt: new Date('2026-10-01T10:00:00Z'),
  };

  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ isActive: true, isAdmin: true } as never);
  });

  it('lists only the links still in force, with their owner and no token', async () => {
    vi.mocked(prisma.guestShare.findMany).mockResolvedValue([share] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u2', username: 'bob', displayName: 'Bob', isActive: false }] as never);
    // c2 is gone since the link was made: only the cellars still there are named.
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([{ id: 'c1', name: 'Cellar A' }] as never);
    vi.mocked(prisma.collection.findMany).mockResolvedValue([] as never);
    const res = await request(app).get('/api/admin/shares').set('Authorization', `Bearer ${authToken()}`);
    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.cellar.findMany).mock.calls[0][0]).toEqual({ where: { id: { in: ['c1', 'c2'] } }, select: { id: true, name: true } });
    const args = vi.mocked(prisma.guestShare.findMany).mock.calls[0][0] as Record<string, any>;
    expect(args.where.revokedAt).toBeNull();
    expect(args.where.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }]);
    expect(args.select.tokenHash).toBeUndefined();
    expect(res.body.data).toEqual([{
      id: 's1', label: 'For Paul', inviteeName: 'Paul', expiresAt: null,
      hidePrices: true, hideNotes: false, cellarCount: 2, writeCellarCount: 1, collectionCount: 0,
      cellars: [{ id: 'c1', name: 'Cellar A' }], collections: [],
      createdAt: '2026-10-01T10:00:00.000Z', owner: { id: 'u2', username: 'bob', displayName: 'Bob', isActive: false },
    }]);
    expect(JSON.stringify(res.body)).not.toContain('secret-hash');
  });

  // Recette v2026.11.3 (6.3): « 1 cave » named no cellar; the CHANGELOG promises which ones.
  it('names the cellars and collections each link opens, and nothing else of them', async () => {
    const other = { ...share, id: 's2', cellarIds: [], writeCellarIds: [], collectionIds: ['k1'] };
    vi.mocked(prisma.guestShare.findMany).mockResolvedValue([share, other] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([{ id: 'c2', name: 'Cellar B' }, { id: 'c1', name: 'Cellar A' }] as never);
    vi.mocked(prisma.collection.findMany).mockResolvedValue([{ id: 'k1', name: 'Collection K' }] as never);
    const res = await request(app).get('/api/admin/shares').set('Authorization', `Bearer ${authToken()}`);
    expect(vi.mocked(prisma.collection.findMany).mock.calls[0][0]).toEqual({ where: { id: { in: ['k1'] } }, select: { id: true, name: true } });
    expect(res.body.data.map((s: { cellars: unknown; collections: unknown }) => [s.cellars, s.collections])).toEqual([
      [[{ id: 'c1', name: 'Cellar A' }, { id: 'c2', name: 'Cellar B' }], []],
      [[], [{ id: 'k1', name: 'Collection K' }]],
    ]);
  });

  it('is refused to a member who is not an admin', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ isActive: true, isAdmin: false } as never);
    const res = await request(app).get('/api/admin/shares').set('Authorization', `Bearer ${authToken()}`);
    expect(res.status).toBe(403);
    expect(prisma.guestShare.findMany).not.toHaveBeenCalled();
  });

  it('revokes any member\'s link and audits it', async () => {
    vi.mocked(prisma.guestShare.findUnique).mockResolvedValue(share as never);
    vi.mocked(prisma.guestShare.updateMany).mockResolvedValue({ count: 1 } as never);
    const res = await request(app)
      .delete('/api/admin/shares/s1')
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Sec-Fetch-Site', 'same-origin');
    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.guestShare.updateMany).mock.calls[0][0]).toEqual({ where: { id: 's1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(res.body.data).toEqual({ id: 's1', revokedAt: expect.any(String) });
    await vi.waitFor(() => expect(prisma.auditLog.create).toHaveBeenCalled());
    const audit = vi.mocked(prisma.auditLog.create).mock.calls[0][0].data as Record<string, any>;
    expect(audit).toMatchObject({ userId: 'u1', action: 'ADMIN_SHARE_REVOKE', status: 'success', details: { shareId: 's1', ownerId: 'u2' } });
    expect(JSON.stringify(res.body)).not.toContain('secret-hash');
  });

  it('answers 404 for an unknown link', async () => {
    vi.mocked(prisma.guestShare.findUnique).mockResolvedValue(null as never);
    const res = await request(app)
      .delete('/api/admin/shares/nope')
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Sec-Fetch-Site', 'same-origin');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('SHARE_NOT_FOUND');
    expect(prisma.guestShare.updateMany).not.toHaveBeenCalled();
  });

  it('leaves an already revoked link as it is, and audits nothing — also when two revocations race', async () => {
    // The link looked in force when read, but another revocation got there first.
    vi.mocked(prisma.guestShare.findUnique)
      .mockResolvedValueOnce(share as never)
      .mockResolvedValueOnce({ revokedAt: new Date('2026-10-02') } as never);
    vi.mocked(prisma.guestShare.updateMany).mockResolvedValue({ count: 0 } as never);
    const res = await request(app)
      .delete('/api/admin/shares/s1')
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Sec-Fetch-Site', 'same-origin');
    expect(res.status).toBe(200);
    expect(res.body.data.revokedAt).toBe('2026-10-02T00:00:00.000Z');
    await new Promise((r) => setTimeout(r, 10));
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('baseline rate limit (API_RATE_LIMIT_MAX)', () => {
  afterEach(() => {
    delete process.env.API_RATE_LIMIT_MAX;
  });

  it('allows 1000 requests per window by default', async () => {
    const res = await request(app).get('/api/version');
    expect(res.headers['ratelimit-limit']).toBe('1000');
  });

  it('applies the override to /api and /uploads', async () => {
    process.env.API_RATE_LIMIT_MAX = '2';
    const limited = createApp();
    expect((await request(limited).get('/api/version')).status).toBe(200);
    expect((await request(limited).get('/api/version')).status).toBe(200);
    expect((await request(limited).get('/api/version')).status).toBe(429);

    const upload = await request(limited).get('/uploads/missing.jpg');
    expect(upload.headers['ratelimit-limit']).toBe('2');
  });
});

// #666: a restore from the interface takes a safety backup first and is refused,
// with a code the dialog translates, when that backup fails.
describe('POST /api/admin/backups/:id/restore', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ isActive: true, isAdmin: true } as never);
    vi.mocked(prisma.backupRun.findUnique).mockResolvedValue(
      { id: 'b1', success: true, filePath: '/app/backups/glou-backup-2026-10-27T03-00-00-000Z.sql.gz' } as never,
    );
  });
  const spies: Array<{ mockRestore: () => void }> = [];
  afterEach(() => {
    spies.splice(0).forEach((s) => s.mockRestore());
  });

  const restore = () => request(app)
    .post('/api/admin/backups/b1/restore')
    .set('Authorization', `Bearer ${authToken()}`)
    .set('Sec-Fetch-Site', 'same-origin')
    .send({ confirm: true, password: 'pw' });

  it('answers with the safety backup taken before the restore', async () => {
    spies.push(vi.spyOn(authService, 'reauthenticateAdmin').mockResolvedValue());
    const restoreSpy = vi.spyOn(backupService, 'restoreBackup').mockResolvedValue({ safetyBackupRunId: 'safety-1' });
    spies.push(restoreSpy);

    const res = await restore();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { ok: true, safetyBackupRunId: 'safety-1' } });
    expect(restoreSpy).toHaveBeenCalledWith('/app/backups/glou-backup-2026-10-27T03-00-00-000Z.sql.gz', 'u1', expect.any(String));
  });

  it('answers BACKUP_BEFORE_RESTORE_FAILED when the safety backup fails', async () => {
    spies.push(vi.spyOn(authService, 'reauthenticateAdmin').mockResolvedValue());
    spies.push(vi.spyOn(backupService, 'restoreBackup').mockRejectedValue(new Error('BACKUP_BEFORE_RESTORE_FAILED')));
    spies.push(vi.spyOn(console, 'error').mockImplementation(() => {}));

    const res = await restore();

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('BACKUP_BEFORE_RESTORE_FAILED');
  });

  // #471 (lot Z): a backup of another version is refused with a code the dialog translates.
  it.each(['BACKUP_FROM_OLDER_VERSION', 'BACKUP_FROM_NEWER_VERSION'])('answers 409 %s', async (code) => {
    spies.push(vi.spyOn(authService, 'reauthenticateAdmin').mockResolvedValue());
    spies.push(vi.spyOn(backupService, 'restoreBackup').mockRejectedValue(new Error(code)));

    const res = await restore();

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: code });
  });

  // #748: a backup file gone from the folder answered 500, and any other
  // failure sent its raw text (psql's stderr) to the browser.
  it('answers 404 BACKUP_FILE_MISSING when the file is no longer in the backups folder', async () => {
    spies.push(vi.spyOn(authService, 'reauthenticateAdmin').mockResolvedValue());
    spies.push(vi.spyOn(backupService, 'restoreBackup').mockRejectedValue(new Error('BACKUP_FILE_NOT_FOUND')));

    const res = await restore();

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'BACKUP_FILE_MISSING' });
  });

  it('answers a stable RESTORE_FAILED code, and keeps the raw failure in the server log', async () => {
    const raw = 'PSQL_RESTORE_FAILED (exit 3): ERROR:  relation "User" does not exist at /var/lib/postgresql';
    spies.push(vi.spyOn(authService, 'reauthenticateAdmin').mockResolvedValue());
    spies.push(vi.spyOn(backupService, 'restoreBackup').mockRejectedValue(new Error(raw)));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    spies.push(log);

    const res = await restore();

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'RESTORE_FAILED' });
    // #467: written once by the error middleware, the raw failure as the cause.
    expect(log).toHaveBeenCalledWith(
      '[error] %s -> %d %s', expect.any(String), 500, 'RESTORE_FAILED',
      expect.objectContaining({ cause: expect.objectContaining({ message: raw }) }),
    );
  });

  // #467 review: whatever else stops the restore (a corrupt or truncated
  // dump, psql missing or too slow, an unreadable file), the dialog gets the
  // #748 code; the detail goes to the server log only.
  it.each([
    'GUNZIP_FAILED: incorrect header check',
    'PSQL_RESTORE_TIMEOUT after 600000 ms',
    'spawn psql ENOENT',
    'EACCES: permission denied, open \'/app/backups/x.sql.gz\'',
    'INVALID_PATH',
  ])('answers RESTORE_FAILED, never the raw text, when the restore fails with "%s"', async (raw) => {
    spies.push(vi.spyOn(authService, 'reauthenticateAdmin').mockResolvedValue());
    spies.push(vi.spyOn(backupService, 'restoreBackup').mockRejectedValue(new Error(raw)));
    spies.push(vi.spyOn(console, 'error').mockImplementation(() => {}));

    const res = await restore();

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'RESTORE_FAILED' });
  });

  it('answers 503 DATABASE_UNAVAILABLE when the database goes away during the restore', async () => {
    spies.push(vi.spyOn(authService, 'reauthenticateAdmin').mockResolvedValue());
    spies.push(vi.spyOn(backupService, 'restoreBackup').mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Can't reach database server", { code: 'P1001', clientVersion: '7.0.0' }),
    ));
    spies.push(vi.spyOn(console, 'error').mockImplementation(() => {}));

    const res = await restore();

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'DATABASE_UNAVAILABLE' });
  });

  it('takes no backup at all on a wrong password', async () => {
    spies.push(vi.spyOn(authService, 'reauthenticateAdmin').mockRejectedValue(new Error('INVALID_PASSWORD')));
    const runSpy = vi.spyOn(backupService, 'runBackup');
    const restoreSpy = vi.spyOn(backupService, 'restoreBackup');
    spies.push(runSpy, restoreSpy);

    const res = await restore();

    expect(res.status).toBe(403);
    expect(runSpy).not.toHaveBeenCalled();
    expect(restoreSpy).not.toHaveBeenCalled();
  });
});

// #668: the avatar was saved as `${API_URL || 'http://localhost:3001'}/uploads/avatars/…`,
// an address the production stack never publishes. Saved relative, like
// product photos, it is served by the web app's /uploads rewrite.
describe('POST /api/user/avatar', () => {
  const savedApiUrl = process.env.API_URL;
  const written: string[] = [];

  afterEach(() => {
    if (savedApiUrl === undefined) delete process.env.API_URL;
    else process.env.API_URL = savedApiUrl;
    for (const file of written.splice(0)) fs.rmSync(file, { force: true });
  });

  it('stores a relative /uploads/avatars/<file> path, whatever API_URL says', async () => {
    process.env.API_URL = 'http://api.internal:3001';
    const updateSpy = vi.spyOn(authService, 'updateProfile')
      .mockImplementation(async (_userId, data) => ({ avatarUrl: data.avatarUrl } as never));

    const res = await request(app)
      .post('/api/user/avatar')
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Sec-Fetch-Site', 'same-origin')
      .attach('avatar', Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: 'me.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    const avatarUrl = updateSpy.mock.calls[0][1].avatarUrl as string;
    written.push(path.join(process.cwd(), avatarUrl));
    expect(avatarUrl).toMatch(/^\/uploads\/avatars\/[0-9a-f-]{36}\.png$/);
    expect(res.body.data.avatarUrl).toBe(avatarUrl);
    updateSpy.mockRestore();
  });
});

// #468: the Vivino/Whiskybase keys were stored and read by nothing; the route
// that saved them is gone, so a session can no longer write secrets nobody uses.
describe('PUT /api/admin/config/integrations', () => {
  it('no longer exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', isActive: true, isAdmin: true } as never);
    const { systemConfigService } = await import('../../src/services/system-config.service');
    expect('updateIntegrations' in systemConfigService).toBe(false);
    const res = await request(app)
      .put('/api/admin/config/integrations')
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ vivinoKey: 'key' });
    expect(res.status).toBe(404);
  });
});

// #599: the admin Gotify test followed redirects, so a public server could
// bounce the POST (and the Gotify key) into the home network.
describe('POST /api/admin/config/test/gotify', () => {
  it('does not follow a redirect and reports it as DELIVERY_FAILED', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', isActive: true, isAdmin: true } as never);
    const { systemConfigService } = await import('../../src/services/system-config.service');
    const gotifySpy = vi.spyOn(systemConfigService, 'getGotify').mockResolvedValueOnce({ gotifyEnabled: true, gotifyUrl: 'https://1.2.3.4', gotifyToken: 'key' });
    // #890: the test asks for the admin's step-up, passed here.
    const reauthSpy = vi.spyOn(authService, 'reauthenticateAdmin').mockResolvedValueOnce();
    // Like the real fetch: the redirect is followed unless `redirect: 'manual'`.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) =>
      (init?.redirect === 'manual'
        ? new Response(null, { status: 307, headers: { location: 'http://192.168.1.1/message' } })
        : new Response('{}', { status: 200 })));
    try {
      const res = await request(app)
        .post('/api/admin/config/test/gotify')
        .set('Authorization', `Bearer ${authToken()}`)
        .set('Sec-Fetch-Site', 'same-origin')
        .send({ password: 'admin-pw' });
      expect(res.status).toBe(200);
      expect(reauthSpy).toHaveBeenCalled();
      expect(res.body.data).toEqual({ success: false, error: 'DELIVERY_FAILED' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: 'manual' }));
    } finally {
      fetchSpy.mockRestore();
      gotifySpy.mockRestore();
      reauthSpy.mockRestore();
    }
  });
});

// #605: deactivating a member only put their sessions, trusted devices and
// guest links to sleep; reactivating the account woke them all up again.
describe('PATCH /api/admin/users/:id/status', () => {
  const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>> & { $transaction: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    // The caller u1 is an active admin; the target m1 is an active member.
    vi.mocked(prisma.user.findUnique).mockImplementation((async (args: { where: { id: string } }) =>
      args.where.id === 'm1' ? { id: 'm1', isActive: true, isAdmin: false } : { id: args.where.id, isActive: true, isAdmin: true }) as never);
    p.user.update = vi.fn().mockImplementation(async (args: { data: { isActive: boolean } }) => ({ id: 'm1', isAdmin: false, ...args.data }));
    p.session.updateMany = vi.fn().mockResolvedValue({ count: 2 });
    p.trustedDevice = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) };
    p.guestShare = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) };
    p.auditLog.create = vi.fn().mockResolvedValue({});
    p.$transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
    // #603: the admin's step-up passes (covered in security-steps.test.ts).
    reauth = vi.spyOn(authService, 'reauthenticateAdmin').mockResolvedValue();
  });
  let reauth: ReturnType<typeof vi.spyOn>;
  afterEach(() => reauth.mockRestore());
  const patch = (isActive: boolean) => request(app)
    .patch('/api/admin/users/m1/status')
    .set('Authorization', `Bearer ${authToken()}`)
    .set('Sec-Fetch-Site', 'same-origin')
    .send({ isActive, password: 'admin-pw' });

  it('deactivating revokes the member\'s sessions, trusted devices and guest links in the same transaction', async () => {
    const res = await patch(false);

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
    expect(p.$transaction).toHaveBeenCalledTimes(1);
    const now = expect.any(Date);
    expect(p.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'm1' }, data: { isActive: false } }));
    expect(p.session.updateMany).toHaveBeenCalledWith({ where: { userId: 'm1', revokedAt: null }, data: { revokedAt: now } });
    expect(p.trustedDevice.updateMany).toHaveBeenCalledWith({ where: { userId: 'm1', revokedAt: null }, data: { revokedAt: now } });
    expect(p.guestShare.updateMany).toHaveBeenCalledWith({ where: { userId: 'm1', revokedAt: null }, data: { revokedAt: now } });
  });

  // Review of #975: two admins deactivating each other at the same moment
  // both passed the count made before the step-up.
  it('re-counts the other active admins in the transaction, after locking the admin rows', async () => {
    vi.mocked(prisma.user.findUnique).mockImplementation((async (args: { where: { id: string } }) =>
      ({ id: args.where.id, isActive: true, isAdmin: true })) as never);
    // Two active admins before the step-up; none left besides the target once locked.
    p.user.count = vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    vi.mocked(prisma.$queryRaw).mockClear();

    const res = await patch(false);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CANNOT_DEACTIVATE_LAST_ADMIN');
    expect(vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0]).toBeLessThan(p.user.count.mock.invocationCallOrder[1]);
    expect(p.user.update).not.toHaveBeenCalled();
  });

  it('deactivate then reactivate: what was revoked stays revoked, and both changes are audited', async () => {
    await patch(false);
    vi.mocked(p.session.updateMany).mockClear();
    vi.mocked(p.trustedDevice.updateMany).mockClear();
    vi.mocked(p.guestShare.updateMany).mockClear();

    const res = await patch(true);

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);
    expect(p.user.update).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'm1' }, data: { isActive: true } }));
    // Nothing is handed back on reactivation.
    expect(p.session.updateMany).not.toHaveBeenCalled();
    expect(p.trustedDevice.updateMany).not.toHaveBeenCalled();
    expect(p.guestShare.updateMany).not.toHaveBeenCalled();

    expect(p.auditLog.create.mock.calls.map(([args]) => args.data)).toEqual([
      expect.objectContaining({ userId: 'u1', action: 'ADMIN_STATUS_CHANGE', status: 'success', details: { targetUserId: 'm1', isActive: false } }),
      expect.objectContaining({ userId: 'u1', action: 'ADMIN_STATUS_CHANGE', status: 'success', details: { targetUserId: 'm1', isActive: true } }),
    ]);
  });
});
