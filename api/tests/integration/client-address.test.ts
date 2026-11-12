import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';

// #979: the web container overwrites X-Forwarded-For with the one client
// address it trusts (web/lib/client-address.mjs). The API's half of that
// contract: it counts the per-address sign-in budget on that value, so one
// client spending it does not lock the others out.

vi.mock('../../src/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn(), findFirst: vi.fn() }, $queryRaw: vi.fn() },
  connectWithRetry: vi.fn(),
}));

import { createApp } from '../../src/app';

// Refused by validation before any database work: the limiter counts it all the same.
const signIn = (app: ReturnType<typeof createApp>, forwardedFor: string) =>
  request(app).post('/api/auth/login').set('Sec-Fetch-Site', 'same-origin').set('X-Forwarded-For', forwardedFor).send({});

beforeAll(() => {
  process.env.JWT_SECRET = 'client-address-test-secret';
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterAll(() => vi.restoreAllMocks());

describe('per-address sign-in budget follows the address web forwards (#979)', () => {
  it('one client spending it does not block another one', async () => {
    const app = createApp();
    for (let i = 0; i < 20; i++) {
      expect((await signIn(app, '198.51.100.7')).status, `attempt ${i + 1}`).not.toBe(429);
    }
    expect((await signIn(app, '198.51.100.7')).status).toBe(429);
    expect((await signIn(app, '198.51.100.8')).status).not.toBe(429);
  });

  it('only the entry web wrote (the last one) counts', async () => {
    const app = createApp();
    for (let i = 0; i < 20; i++) {
      await signIn(app, `203.0.113.${i}, 198.51.100.9`);
    }
    expect((await signIn(app, '203.0.113.200, 198.51.100.9')).status).toBe(429);
  });
});
