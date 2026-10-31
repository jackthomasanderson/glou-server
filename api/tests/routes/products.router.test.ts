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
vi.mock('../../src/services/product.service', () => ({
  productService: {
    list: vi.fn(), listTrash: vi.fn(), get: vi.fn(), updateDescription: vi.fn(), trash: vi.fn(), restore: vi.fn(),
  },
}));
vi.mock('../../src/services/inventory.service', () => ({
  inventoryService: { daysUntilPermanentDelete: vi.fn(() => 7) },
}));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));

import { productsRouter } from '../../src/routes/products.router';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { productService } from '../../src/services/product.service';
import { auditLog } from '../../src/services/audit.service';

const app = express();
app.use(express.json());
app.use('/api/products', productsRouter);
app.use(errorMiddleware);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('GET /api/products (D9)', () => {
  it('answers the families and whether the list is complete', async () => {
    vi.mocked(productService.list).mockResolvedValue({ data: [{ id: 'p1', items: [] }], truncated: false } as never);

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [{ id: 'p1', items: [] }], truncated: false });
  });

  it('answers a family in the trash list', async () => {
    vi.mocked(productService.listTrash).mockResolvedValue([{ id: 'p1' }] as never);

    const res = await request(app).get('/api/products/trash');

    expect(res.body).toEqual({ data: [{ id: 'p1' }] });
    expect(productService.get).not.toHaveBeenCalled();
  });
});

describe('GET /api/products/:id', () => {
  it('answers the detail', async () => {
    vi.mocked(productService.get).mockResolvedValue({ id: 'p1', items: [], tastings: [], history: [] } as never);

    const res = await request(app).get('/api/products/p1');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'p1', tastings: [], history: [] });
  });

  it('answers 404 for an unknown family', async () => {
    vi.mocked(productService.get).mockResolvedValue(null);

    const res = await request(app).get('/api/products/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'PRODUCT_NOT_FOUND' });
  });
});

describe('PATCH /api/products/:id (FEAT-92 c4)', () => {
  it('writes the description and logs the change on the family', async () => {
    vi.mocked(productService.updateDescription).mockResolvedValue({
      product: { id: 'p1', region: 'Médoc' }, changes: [{ field: 'region', from: null, to: 'Médoc' }],
    } as never);

    const res = await request(app).patch('/api/products/p1').send({ region: 'Médoc' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'p1', region: 'Médoc' });
    expect(productService.updateDescription).toHaveBeenCalledWith('u1', 'p1', { region: 'Médoc' });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE', status: 'success', productId: 'p1', details: { changes: [{ field: 'region', from: null, to: 'Médoc' }] },
    }));
    expect(vi.mocked(auditLog).mock.calls[0][0]).not.toHaveProperty('bottleId');
  });

  it.each([
    ['a field of the bottles (cellar)', { cellarId: 'c2' }],
    ['a field of the bottles (state)', { isOpened: true }],
    ['the derived alert status', { alertStatus: 'peak' }],
    ['a reversed drinking window', { peakMaturityFrom: 2030, peakMaturityTo: 2025 }],
  ])('refuses %s with 400', async (_label, body) => {
    const res = await request(app).patch('/api/products/p1').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(productService.updateDescription).not.toHaveBeenCalled();
  });

  it('answers 409 with the current family when it changed meanwhile', async () => {
    vi.mocked(productService.updateDescription).mockResolvedValue({ conflict: true, product: { id: 'p1', region: 'Graves' } } as never);

    const res = await request(app).patch('/api/products/p1')
      .send({ region: 'Médoc', expectedUpdatedAt: '2026-10-01T10:00:00.000Z' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'CONFLICT', data: { id: 'p1', region: 'Graves' } });
  });

  it('answers 404 for an unknown or trashed family', async () => {
    vi.mocked(productService.updateDescription).mockResolvedValue(null);

    const res = await request(app).patch('/api/products/p1').send({ region: 'Médoc' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/products/:id and POST /api/products/:id/restore (D10)', () => {
  it('puts the family in the trash with its bottles', async () => {
    const deletedAt = new Date('2026-10-31T10:00:00.000Z');
    vi.mocked(productService.trash).mockResolvedValue({ deletedAt, itemIds: ['b1', 'b2'] });

    const res = await request(app).delete('/api/products/p1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { id: 'p1', deletedAt: deletedAt.toISOString(), itemIds: ['b1', 'b2'] },
      meta: { daysUntilPermanentDelete: 7 },
    });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE', productId: 'p1' }));
  });

  it('answers 404 for a family already in the trash', async () => {
    vi.mocked(productService.trash).mockResolvedValue(null);

    expect((await request(app).delete('/api/products/p1')).status).toBe(404);
  });

  it('restores the family', async () => {
    vi.mocked(productService.restore).mockResolvedValue({ id: 'p1' } as never);

    const res = await request(app).post('/api/products/p1/restore');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'p1' });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'RESTORE', productId: 'p1' }));
  });

  it('answers 404 once past the retention period', async () => {
    vi.mocked(productService.restore).mockResolvedValue(null);

    const res = await request(app).post('/api/products/p1/restore');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'PRODUCT_NOT_FOUND_OR_EXPIRED' });
  });
});
