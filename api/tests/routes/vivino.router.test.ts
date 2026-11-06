import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/middleware/auth.middleware', () => ({
  // The lookup quota is kept per member for the whole file: a test that counts
  // against it uses its own member.
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.userId = req.header('x-test-user') ?? 'u1';
    next();
  },
  getClientIp: () => '127.0.0.1',
}));
vi.mock('../../src/services/vivino.service', () => ({
  isVivinoEnabled: vi.fn(),
  vivinoService: { lookup: vi.fn() },
}));

import { vivinoRouter } from '../../src/routes/vivino.router';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { isVivinoEnabled, vivinoService } from '../../src/services/vivino.service';
import { AppError } from '../../src/lib/errors';
import type { VivinoLookupResult } from '../../../shared/vivino';

const app = express();
app.use('/api/vivino', vivinoRouter);
app.use(errorMiddleware);

const RESULT: VivinoLookupResult = {
  match: {
    vivinoId: 1127795,
    url: 'https://www.vivino.com/w/1127795?year=2015',
    name: 'Château Margaux 2015',
    winery: 'Château Margaux',
    vintage: 2015,
    type: 'red',
    rating: 4.7,
    ratingsCount: 320,
    region: 'Margaux',
    country: 'France',
    price: { amount: 1200, currency: 'EUR' },
    imageUrl: null,
  },
  suggestions: { color: 'red', peakMaturityFrom: 2020, peakMaturityTo: 2035 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.mocked(isVivinoEnabled).mockReturnValue(true);
  vi.mocked(vivinoService.lookup).mockResolvedValue(RESULT);
});

describe('GET /api/vivino/status', () => {
  it('says whether the instance opted in', async () => {
    expect((await request(app).get('/api/vivino/status')).body).toEqual({ data: { enabled: true } });
    vi.mocked(isVivinoEnabled).mockReturnValue(false);
    expect((await request(app).get('/api/vivino/status')).body).toEqual({ data: { enabled: false } });
  });
});

describe('GET /api/vivino/lookup', () => {
  it('refuses before looking anything up when the instance has not opted in', async () => {
    vi.mocked(isVivinoEnabled).mockReturnValue(false);
    const res = await request(app).get('/api/vivino/lookup').query({ producer: 'Château Margaux' });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'VIVINO_DISABLED' });
    expect(vivinoService.lookup).not.toHaveBeenCalled();
  });

  it('passes the item fields to the service and answers its result', async () => {
    const res = await request(app)
      .get('/api/vivino/lookup')
      .query({ producer: ' Château Margaux ', name: '', vintage: '2015', color: 'red', appellation: 'Margaux' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: RESULT });
    expect(vivinoService.lookup).toHaveBeenCalledWith({
      category: 'wine',
      producer: 'Château Margaux',
      name: '',
      vintage: 2015,
      color: 'red',
      region: null,
      appellation: 'Margaux',
      sugarLevel: null,
    });
  });

  it.each([
    ['without a producer', { name: 'Margaux' }],
    ['for a spirit', { producer: 'Ardbeg', category: 'spirit' }],
    ['with a vintage that is not a year', { producer: 'Château Margaux', vintage: 'abc' }],
    ['with an unknown colour', { producer: 'Château Margaux', color: 'blue' }],
  ])('answers 400 %s', async (_label, query) => {
    const res = await request(app).get('/api/vivino/lookup').query(query);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(vivinoService.lookup).not.toHaveBeenCalled();
  });

  it('passes the service error codes through', async () => {
    vi.mocked(vivinoService.lookup).mockRejectedValue(
      new AppError(404, 'VIVINO_NO_MATCH', { details: { reason: 'COLOR_MISMATCH' } }),
    );
    const res = await request(app).get('/api/vivino/lookup').query({ producer: 'Château Montgravier' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'VIVINO_NO_MATCH', details: { reason: 'COLOR_MISMATCH' } });
  });

  it('does not count refused lookups against the quota, and answers the quota with a JSON code', async () => {
    const asQuotaMember = () =>
      request(app).get('/api/vivino/lookup').query({ producer: 'Château Margaux' }).set('x-test-user', 'quota-member');
    vi.mocked(isVivinoEnabled).mockReturnValue(false);
    for (let i = 0; i < 5; i++) await asQuotaMember();

    vi.mocked(isVivinoEnabled).mockReturnValue(true);
    for (let i = 0; i < 30; i++) {
      expect((await asQuotaMember()).status).toBe(200);
    }
    const res = await asQuotaMember();
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'VIVINO_RATE_LIMITED' });
  });
});
