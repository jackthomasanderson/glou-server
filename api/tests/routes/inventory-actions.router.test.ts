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
vi.mock('../../src/services/stock.service', () => ({
  stockService: { addUnits: vi.fn(), correctQuantity: vi.fn() },
}));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));

import { inventoryActionsRouter } from '../../src/routes/inventory-actions.router';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { stockService } from '../../src/services/stock.service';
import { auditLog } from '../../src/services/audit.service';
import { conflict } from '../../src/lib/errors';

const app = express();
app.use(express.json());
app.use('/api', inventoryActionsRouter);
app.use(errorMiddleware);

const written = (data: Record<string, unknown>, changed: Record<string, unknown>[] = []) =>
  ({ data, changed, removedIds: [] }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/products/:id/items (FEAT-92 c1-c2)', () => {
  it('answers 200 with the completed group, and records the copies added on the family', async () => {
    vi.mocked(stockService.addUnits).mockResolvedValue({ result: written({ id: 'b1', quantity: 8 }), merged: true, from: 6, to: 8 });

    const res = await request(app).post('/api/products/p1/items').send({ quantity: 2, cellarId: 'c1', purchasePrice: 20, purchasedAt: '2026-01-15' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { id: 'b1', quantity: 8 }, changed: [], removedIds: [] });
    expect(stockService.addUnits).toHaveBeenCalledWith('u1', 'p1', { quantity: 2, cellarId: 'c1', purchasePrice: 20, purchasedAt: '2026-01-15' });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ADD_UNITS', status: 'success', bottleId: 'b1', productId: 'p1',
      details: { merged: true, changes: [{ field: 'quantity', from: 6, to: 8 }] },
    }));
  });

  it('takes a price in cents', async () => {
    vi.mocked(stockService.addUnits).mockResolvedValue({ result: written({ id: 'b2' }), merged: false, from: null, to: 1 });

    const res = await request(app).post('/api/products/p1/items').send({ quantity: 1, purchasePrice: 19.99 });

    expect(res.status).toBe(201);
  });

  it('answers 201 for a new line', async () => {
    vi.mocked(stockService.addUnits).mockResolvedValue({ result: written({ id: 'b2', quantity: 1 }), merged: false, from: null, to: 1 });

    const res = await request(app).post('/api/products/p1/items').send({ quantity: 1 });

    expect(res.status).toBe(201);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ details: { merged: false, changes: [{ field: 'quantity', from: null, to: 1 }] } }));
  });

  it.each([
    ['no number', {}],
    ['0 bottles (no "0 bottle" add, point 46)', { quantity: 0 }],
    ['a description field', { quantity: 1, region: 'Médoc' }],
    ['a purchase day that is not a day', { quantity: 1, purchasedAt: '2026-01-15T10:00:00Z' }],
    ['a negative price', { quantity: 1, purchasePrice: -1 }],
    ['a price below the cent (stored rounded, it would never find its group)', { quantity: 1, purchasePrice: 12.345 }],
    ['a price beyond the column', { quantity: 1, purchasePrice: 10_000_000_000 }],
    ['more than 1000 copies at once', { quantity: 1001 }],
  ])('refuses %s with 400', async (_label, body) => {
    const res = await request(app).post('/api/products/p1/items').send(body);

    expect(res.status).toBe(400);
    expect(stockService.addUnits).not.toHaveBeenCalled();
  });

  it('passes the service refusal through (a family in the trash)', async () => {
    vi.mocked(stockService.addUnits).mockRejectedValue(conflict('PRODUCT_IN_TRASH'));

    const res = await request(app).post('/api/products/p1/items').send({ quantity: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PRODUCT_IN_TRASH');
    expect(auditLog).not.toHaveBeenCalled();
  });
});

describe('POST /api/inventory/:id/correct (FEAT-92 c3)', () => {
  it('answers the write-off and the corrected group, and records the correction', async () => {
    vi.mocked(stockService.correctQuantity).mockResolvedValue({
      result: written({ id: 'w1', quantity: 2 }, [{ id: 'b1', quantity: 5 }]),
      productId: 'p1', changes: [{ field: 'quantity', from: 7, to: 5 }], writtenOffItemId: 'w1',
    });

    const res = await request(app).post('/api/inventory/b1/correct').send({ quantity: 5, reason: 'written_off' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { id: 'w1', quantity: 2 }, changed: [{ id: 'b1', quantity: 5 }], removedIds: [] });
    expect(stockService.correctQuantity).toHaveBeenCalledWith('u1', 'b1', { quantity: 5, reason: 'written_off' });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CORRECT_QUANTITY', status: 'success', bottleId: 'b1', productId: 'p1',
      details: { reason: 'written_off', changes: [{ field: 'quantity', from: 7, to: 5 }], writtenOffItemId: 'w1' },
    }));
  });

  it('answers 404 for an unknown or trashed unit', async () => {
    vi.mocked(stockService.correctQuantity).mockResolvedValue(null);

    const res = await request(app).post('/api/inventory/nope/correct').send({ quantity: 1, reason: 'input_error' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('ITEM_NOT_FOUND');
  });

  it('answers 409 with the group as it is now on a stale correction', async () => {
    vi.mocked(stockService.correctQuantity).mockResolvedValue({ conflict: true, item: { id: 'b1', productId: 'p1', quantity: 6 } as never });

    const res = await request(app).post('/api/inventory/b1/correct')
      .send({ quantity: 5, reason: 'input_error', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'CONFLICT', data: { id: 'b1', productId: 'p1', quantity: 6 } });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'CORRECT_QUANTITY', status: 'error', productId: 'p1' }));
  });

  it.each([
    ['no reason (asked every time, point 34)', { quantity: 5 }],
    ['an unknown reason', { quantity: 5, reason: 'drunk' }],
    ['a negative number', { quantity: -1, reason: 'written_off' }],
  ])('refuses %s with 400', async (_label, body) => {
    const res = await request(app).post('/api/inventory/b1/correct').send(body);

    expect(res.status).toBe(400);
    expect(stockService.correctQuantity).not.toHaveBeenCalled();
  });
});
