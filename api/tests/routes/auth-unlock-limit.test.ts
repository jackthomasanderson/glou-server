import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// #582 review: the unlock limiter counted successful unlocks too, so a family
// tablet unlocked ten times in a quarter of an hour was blocked. Only wrong
// codes count now; sign-in stays strict (see tests/integration/auth-rate-limit).

vi.mock('../../src/lib/prisma', () => ({ prisma: {}, connectWithRetry: vi.fn() }));
vi.mock('../../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.userId = 'u1';
    next();
  },
  getClientIp: () => '127.0.0.1',
}));
vi.mock('../../src/services/auth.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/auth.service')>();
  return { ...actual, authService: { ...actual.authService, verifyUnlock: vi.fn() } };
});

import { authRouter } from '../../src/routes/auth.router';
import { authService } from '../../src/services/auth.service';

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

const unlock = () => request(app).post('/api/auth/unlock').send({ pin: '1234' });

describe('POST /api/auth/unlock limiter (#582)', () => {
  it('does not count successful unlocks, and still stops the 11th wrong code', async () => {
    vi.mocked(authService.verifyUnlock).mockResolvedValue(true);
    for (let i = 0; i < 15; i++) {
      expect((await unlock()).status, `unlock ${i + 1}`).toBe(200);
    }

    vi.mocked(authService.verifyUnlock).mockResolvedValue(false);
    for (let i = 0; i < 10; i++) {
      expect((await unlock()).status, `wrong code ${i + 1}`).toBe(401);
    }
    const blocked = await unlock();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('TOO_MANY_REQUESTS');
  });
});
