import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';

// Every router imported by createApp() ultimately imports this module; the
// mock replaces it wholesale so nothing tries to reach a real database.
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    session: { findUnique: vi.fn() },
    inventoryItem: { findMany: vi.fn() },
    tastingNote: { findMany: vi.fn(), count: vi.fn() },
  },
  connectWithRetry: vi.fn(),
}));

import { prisma } from '../../src/lib/prisma';
import { createApp } from '../../src/app';

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
});

describe('unauthenticated access', () => {
  it('GET /health is open', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
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

describe('unknown routes', () => {
  it('returns the JSON 404 shape', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NOT_FOUND' });
  });
});
