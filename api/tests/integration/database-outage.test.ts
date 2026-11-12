import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { Prisma } from '@prisma/client';

// #467: PostgreSQL is down. Every Prisma call fails with P1001 ("can't reach
// database server") except the ones a test sets up. Routers must let that
// error reach the central error middleware, which answers 503
// DATABASE_UNAVAILABLE ("retry in a moment"), instead of a 500 of their own
// ("could not load…"), a 400 carrying the error message, or a 401 (signed out).
function databaseUnreachable(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Can't reach database server at `db:5432`", {
    code: 'P1001',
    clientVersion: '7.0.0',
  });
}

vi.mock('../../src/lib/prisma', () => {
  const unreachable = () => Promise.reject(databaseUnreachable());
  const models = new Map<string, Record<string, unknown>>();
  const model = (name: string) => {
    if (!models.has(name)) {
      const methods: Record<string, unknown> = {};
      models.set(name, new Proxy(methods, {
        get: (target, method) => {
          if (typeof method !== 'string') return undefined;
          target[method] ??= vi.fn(unreachable);
          return target[method];
        },
      }));
    }
    return models.get(name);
  };
  const prisma = new Proxy({}, {
    get: (_target, key) => {
      if (typeof key !== 'string' || key === 'then') return undefined;
      if (key.startsWith('$')) return model('$client')![key];
      return model(key);
    },
  });
  return { prisma, connectWithRetry: vi.fn() };
});

import { prisma } from '../../src/lib/prisma';
import { createApp } from '../../src/app';

const JWT_SECRET = 'database-outage-test-secret';
const app = createApp();
const SCAN_JOB_ID = '7d0f6c1e-4b7a-4c55-9a3e-2f1d8b6a9c10';

function authToken(): string {
  return jwt.sign(
    { userId: 'u1', email: 'u1@example.com', scope: 'full', sessionId: 's1' },
    JWT_SECRET,
    { algorithm: 'HS256' },
  );
}

/** The sign-in check itself still works: only the route's own work hits the outage. */
function signedIn(): void {
  vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ isActive: true } as never);
  vi.mocked(prisma.session.findUnique).mockResolvedValueOnce({ revokedAt: null, expiresAt: new Date(Date.now() + 3_600_000) } as never);
  vi.mocked(prisma.session.update).mockResolvedValue({} as never);
}

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  for (const fn of [prisma.user.findUnique, prisma.session.findUnique, prisma.session.update]) {
    vi.mocked(fn).mockReset().mockImplementation((() => Promise.reject(databaseUnreachable())) as never);
  }
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function send(method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, body?: object) {
  const req = request(app)[method](path)
    .set('Authorization', `Bearer ${authToken()}`)
    .set('Sec-Fetch-Site', 'same-origin');
  return body ? req.send(body) : req;
}

describe('database outage on a signed-in route (#467)', () => {
  it('GET /api/cellars answers 503 DATABASE_UNAVAILABLE, not "could not load cellars"', async () => {
    signedIn();
    const res = await send('get', '/api/cellars');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'DATABASE_UNAVAILABLE' });
  });

  it('is never a sign-out (401) when the session check itself hits the outage', async () => {
    const res = await send('get', '/api/cellars');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'DATABASE_UNAVAILABLE' });
  });

  it.each([
    ['get', '/api/cellars/c1'],
    ['get', '/api/cellars/c1/grid'],
    ['post', '/api/cellars', { name: 'Cave' }],
    ['patch', '/api/cellars/c1', { name: 'Cave' }],
    ['delete', '/api/cellars/c1'],
    ['get', '/api/alerts'],
    ['patch', '/api/alerts/i1/pause'],
    ['get', '/api/analytics'],
    ['get', '/api/maturity-references/suggest?category=wine'],
    ['get', '/api/bulk-presets'],
    ['delete', '/api/bulk-presets/p1'],
    ['get', '/api/humidor/cellars/c1/readings'],
    ['get', '/api/shares'],
    ['delete', '/api/shares/s1'],
    ['get', '/api/consumption-plan/suggestions'],
    ['get', '/api/consumption-plan/goal'],
    ['patch', '/api/consumption-plan/items/i1/postpone', { days: 30 }],
    ['get', '/api/inventory-count/sessions/active'],
    ['post', '/api/inventory-count/sessions', { scopeLabel: 'Cave' }],
    ['patch', '/api/inventory-count/sessions/x1/pause'],
    ['patch', '/api/inventory-count/sessions/x1/resume'],
    ['get', '/api/inventory-count/sessions/x1/report'],
    ['post', '/api/inventory-count/sessions/x1/complete', {}],
    ['get', `/api/scan/jobs/${SCAN_JOB_ID}`],
    ['post', '/api/auth/2fa/generate'],
    ['post', '/api/auth/2fa/turn-on', { password: 'pw', code: '123456' }],
    ['post', '/api/auth/2fa/turn-off', { password: 'pw' }],
    ['post', '/api/auth/trust-device', { password: 'pw' }],
  ] as const)('%s %s answers 503 DATABASE_UNAVAILABLE', async (method, path, body?: object) => {
    signedIn();
    const res = await send(method, path, body);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'DATABASE_UNAVAILABLE' });
  });

  it('logs the outage once, with its stack, through the error middleware', async () => {
    signedIn();
    await send('get', '/api/cellars');
    const lines = consoleError.mock.calls.filter((call: unknown[]) => String(call[0]).startsWith('[error]'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(503);
  });
});

describe('database outage behind the admin and guest gates (#467)', () => {
  it('the admin check answers 503, not 500 INTERNAL_SERVER_ERROR', async () => {
    // Sign-in check passes; the admin lookup is the call that fails.
    signedIn();
    const res = await send('get', '/api/admin/users');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'DATABASE_UNAVAILABLE' });
  });

  it('a guest link answers 503, not 500 INTERNAL_SERVER_ERROR', async () => {
    const res = await request(app).get('/api/guest/some-guest-token');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'DATABASE_UNAVAILABLE' });
  });
});

// #467: the 2FA and trusted-device handlers used to answer 400 with the
// exception's own message, so an outage became a 400 carrying Prisma's text.
describe('sign-in and 2FA during an outage (#467)', () => {
  it('signing in answers 503, not 401 "wrong password"', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ identifier: 'u1@example.com', password: 'pw' });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'DATABASE_UNAVAILABLE' });
  });

  it('a business refusal keeps its own code', async () => {
    signedIn();
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValueOnce({ isTwoFactorEnabled: true } as never);
    const res = await send('post', '/api/auth/2fa/generate');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: '2FA_ALREADY_ENABLED' });
  });

  it('an unexpected failure never reaches the client with its message', async () => {
    signedIn();
    vi.mocked(prisma.user.findUniqueOrThrow).mockRejectedValueOnce(new Error('No User found: model internals'));
    const res = await send('post', '/api/auth/2fa/generate');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'UNEXPECTED_ERROR' });
  });
});
