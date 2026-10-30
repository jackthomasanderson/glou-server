import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';

// #640: the sign-in, password-reset and unlock limiters answered a plain-text
// 429 the web could not read, so members saw "unexpected error, try again"
// and kept trying. They now answer a stable JSON code with the wait.

vi.mock('../../src/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn(), findFirst: vi.fn() }, $queryRaw: vi.fn() },
  connectWithRetry: vi.fn(),
}));

import { createApp } from '../../src/app';

const WINDOW_SECONDS = 15 * 60;

// Every attempt below is refused before any database work (bad body, no
// session): the limiters count them all the same.
const post = (app: ReturnType<typeof createApp>, path: string) =>
  request(app).post(path).set('Sec-Fetch-Site', 'same-origin').send({});

async function exhaust(path: string, allowed: number) {
  const app = createApp();
  for (let i = 0; i < allowed; i++) {
    expect((await post(app, path)).status, `attempt ${i + 1}`).not.toBe(429);
  }
  return post(app, path);
}

function expectTooManyRequests(res: Awaited<ReturnType<typeof post>>) {
  expect(res.status).toBe(429);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toEqual({ error: 'TOO_MANY_REQUESTS', retryAfter: expect.any(Number) });
  expect(res.body.retryAfter).toBeGreaterThan(0);
  expect(res.body.retryAfter).toBeLessThanOrEqual(WINDOW_SECONDS);
  expect(Number(res.headers['retry-after'])).toBe(res.body.retryAfter);
}

beforeAll(() => {
  process.env.JWT_SECRET = 'rate-limit-test-secret';
  // The refused sign-in attempts are logged by the router.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterAll(() => vi.restoreAllMocks());

describe('auth rate limiters answer JSON (#640)', () => {
  it('authLimiter: the 21st sign-in attempt gets TOO_MANY_REQUESTS', async () => {
    expectTooManyRequests(await exhaust('/api/auth/login', 20));
  });

  it('authLimiter also covers 2FA verification', async () => {
    expectTooManyRequests(await exhaust('/api/auth/2fa/verify-login', 20));
  });

  it('passwordResetLimiter: the 6th reset request gets TOO_MANY_REQUESTS', async () => {
    expectTooManyRequests(await exhaust('/api/auth/forgot-password', 5));
  });

  it('unlockLimiter: the 11th unlock attempt gets TOO_MANY_REQUESTS', async () => {
    expectTooManyRequests(await exhaust('/api/auth/unlock', 10));
  });
});
