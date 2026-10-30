import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';

// Every router imported by createApp() ultimately imports this module; the
// mock replaces it wholesale so nothing tries to reach a real database.
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    session: { findUnique: vi.fn() },
    inventoryItem: { findMany: vi.fn() },
    tastingNote: { findMany: vi.fn(), count: vi.fn() },
    auditLog: { findMany: vi.fn(), count: vi.fn() },
    $queryRaw: vi.fn(),
  },
  connectWithRetry: vi.fn(),
}));

import { prisma } from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import { backupService } from '../../src/services/backup.service';
import pkg from '../../package.json';

const JWT_SECRET = 'integration-test-secret';
const app = createApp();

function authToken(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    { userId: 'u1', email: 'u1@example.com', scope: 'full', ...overrides },
    JWT_SECRET,
    { algorithm: 'HS256' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = JWT_SECRET;
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ isActive: true } as never);
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
    const res = await request(app)
      .post('/api/user/delete-account')
      .set('Host', 'glou.home.example')
      .set('Sec-Fetch-Site', 'same-site')
      .set('Origin', 'https://photos.home.example');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CSRF_ORIGIN_REJECTED');
    warn.mockRestore();
  });

  it('keeps the guest share token out of the CSRF and error log lines (#612)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
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
    warn.mockRestore();
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
    expect(where.OR).toHaveLength(4);
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
    expect(res.body).toEqual({ data: { directoryWritable: writable } });
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
