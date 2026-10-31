import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.userId = 'u1';
    next();
  },
  getClientIp: () => '127.0.0.1',
}));
vi.mock('../../src/services/review.service', () => ({
  reviewService: { list: vi.fn(), merge: vi.fn(), distinguish: vi.fn(), confirmCount: vi.fn() },
}));
vi.mock('../../src/services/product.service', () => ({ productService: { view: vi.fn() } }));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));

import { reviewRouter } from '../../src/routes/review.router';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { reviewService } from '../../src/services/review.service';
import { productService } from '../../src/services/product.service';
import { auditLog } from '../../src/services/audit.service';
import { conflict } from '../../src/lib/errors';

const app = express();
app.use(express.json());
app.use('/api', reviewRouter);
app.use(errorMiddleware);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/products/review (FEAT-102 c1, c4, c5)', () => {
  it('answers what is left to review', async () => {
    vi.mocked(reviewService.list).mockResolvedValue({ merges: [], counts: [] });

    const res = await request(app).get('/api/products/review');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { merges: [], counts: [] } });
  });
});

describe('POST /api/products/merge (FEAT-102 c2)', () => {
  it('answers the surviving family and what was removed, and records the merge on it', async () => {
    vi.mocked(reviewService.merge).mockResolvedValue({
      productId: 'p1', removedProductIds: ['p2'], removedItemIds: ['b2'], changes: [{ field: 'region', from: 'Bordeaux', to: 'Graves' }],
    });
    vi.mocked(productService.view).mockResolvedValue({ id: 'p1', region: 'Graves' } as never);

    const res = await request(app).post('/api/products/merge').send({ productIds: ['p1', 'p2'], choices: { region: 'p2' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { id: 'p1', region: 'Graves' }, removedProductIds: ['p2'], removedItemIds: ['b2'] });
    expect(reviewService.merge).toHaveBeenCalledWith('u1', { productIds: ['p1', 'p2'], choices: { region: 'p2' } });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'MERGE_PRODUCTS', status: 'success', productId: 'p1',
      details: { mergedProductIds: ['p2'], fusedItemIds: ['b2'], changes: [{ field: 'region', from: 'Bordeaux', to: 'Graves' }] },
    }));
  });

  it.each([
    ['one family', { productIds: ['p1'] }],
    ['the same family twice', { productIds: ['p1', 'p1'] }],
    ['a field that is not compared', { productIds: ['p1', 'p2'], choices: { name: 'p2' } }],
    ['a value instead of a family', { productIds: ['p1', 'p2'], choices: { region: 42 } }],
    ['anything else', { productIds: ['p1', 'p2'], region: 'Graves' }],
  ])('refuses %s with 400', async (_label, body) => {
    const res = await request(app).post('/api/products/merge').send(body);

    expect(res.status).toBe(400);
    expect(reviewService.merge).not.toHaveBeenCalled();
  });

  it('passes on the service refusals', async () => {
    vi.mocked(reviewService.merge).mockRejectedValue(conflict('DISTINCT_WINES'));

    const res = await request(app).post('/api/products/merge').send({ productIds: ['p1', 'p2'] });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('DISTINCT_WINES');
    expect(auditLog).not.toHaveBeenCalled();
  });
});

describe('POST /api/products/distinctions (FEAT-102 c3)', () => {
  it('answers 201 with the pairs remembered', async () => {
    vi.mocked(reviewService.distinguish).mockResolvedValue([['p1', 'p2']]);

    const res = await request(app).post('/api/products/distinctions').send({ productIds: ['p2', 'p1'] });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { pairs: [['p1', 'p2']] } });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'DISTINGUISH_PRODUCTS', details: { productIds: ['p2', 'p1'] } }));
  });

  it('refuses a single family with 400', async () => {
    const res = await request(app).post('/api/products/distinctions').send({ productIds: ['p1'] });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/inventory/:id/review-ok (FEAT-102 c4)', () => {
  it('answers the unit, its mark lifted, and records it', async () => {
    vi.mocked(reviewService.confirmCount).mockResolvedValue({ item: { id: 'g1', productId: 'p1', needsReview: false } as never, changed: true });

    const res = await request(app).post('/api/inventory/g1/review-ok');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { id: 'g1', productId: 'p1', needsReview: false } });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'REVIEW_OK', bottleId: 'g1', productId: 'p1', details: { changes: [{ field: 'needsReview', from: true, to: false }] },
    }));
  });

  it('records nothing when it was already settled', async () => {
    vi.mocked(reviewService.confirmCount).mockResolvedValue({ item: { id: 'g1', productId: 'p1', needsReview: false } as never, changed: false });

    expect((await request(app).post('/api/inventory/g1/review-ok')).status).toBe(200);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('answers 404 for a unit unknown or in the trash', async () => {
    vi.mocked(reviewService.confirmCount).mockResolvedValue(null);

    expect((await request(app).post('/api/inventory/gone/review-ok')).status).toBe(404);
  });
});
