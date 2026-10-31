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
vi.mock('../../src/services/inventory.service', () => ({
  inventoryService: { updateItem: vi.fn(), rollbackField: vi.fn() },
}));
vi.mock('../../src/services/scan.service', () => ({ scanService: {} }));
vi.mock('../../src/services/system-config.service', () => ({ systemConfigService: {} }));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));

import { inventoryRouter } from '../../src/routes/inventory.router';
import { inventoryService } from '../../src/services/inventory.service';
import { auditLog } from '../../src/services/audit.service';
import { AppError } from '../../src/lib/errors';

const app = express();
app.use(express.json());
app.use('/api/inventory', inventoryRouter);

beforeEach(() => vi.clearAllMocks());

// #471 (D8, FEAT-103/106): what the PATCH answers and logs when the detach /
// reattach rule applies.
describe('PATCH /api/inventory/:id', () => {
  it('answers { data, changed, removedIds } and logs the group losing a copy in its own history', async () => {
    vi.mocked(inventoryService.updateItem).mockResolvedValue({
      item: { id: 'sub', productId: 'p1' }, changes: [{ field: 'isOpened', from: false, to: true }],
      changed: [{ id: 'g', quantity: 5 }], removedIds: [], outcome: 'detached', groupChange: { itemId: 'g', from: 6, to: 5 },
    } as never);

    const res = await request(app).patch('/api/inventory/g').send({ isOpened: true, fillLevel: 60 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { id: 'sub', productId: 'p1' }, changed: [{ id: 'g', quantity: 5 }], removedIds: [] });
    const logged = vi.mocked(auditLog).mock.calls.map(([entry]) => entry);
    expect(logged).toEqual([
      expect.objectContaining({ bottleId: 'sub', details: expect.objectContaining({ outcome: 'detached', targetItemId: 'g' }) }),
      expect.objectContaining({ bottleId: 'g', details: expect.objectContaining({ changes: [{ field: 'quantity', from: 6, to: 5 }] }) }),
    ]);
  });

  it('logs the tastings a reattach deleted', async () => {
    vi.mocked(inventoryService.updateItem).mockResolvedValue({
      item: { id: 'g', productId: 'p1' }, changes: [], changed: [], removedIds: ['sub'],
      outcome: 'reattached', groupChange: { itemId: 'g', from: 5, to: 6 }, deletedTastings: 2,
    } as never);

    await request(app).patch('/api/inventory/sub').send({ isOpened: false, fillLevel: 100, keepTastings: false });

    expect(vi.mocked(auditLog).mock.calls[0]?.[0]).toMatchObject({ bottleId: 'g', details: { deletedTastings: 2 } });
  });

  it('answers a refusal of the rule with its own status and code', async () => {
    vi.mocked(inventoryService.updateItem).mockRejectedValue(new AppError(409, 'TASTINGS_ON_ITEM', { details: { count: 1 } }));

    const res = await request(app).patch('/api/inventory/sub').send({ isOpened: false, fillLevel: 100 });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'TASTINGS_ON_ITEM', details: { count: 1 } });
  });
});

describe('POST /api/inventory/:id/rollback', () => {
  it('answers a refusal of the rule with its own status, not 500', async () => {
    vi.mocked(inventoryService.rollbackField).mockRejectedValue(new AppError(400, 'BOX_NOT_COMPLETE'));

    const res = await request(app).post('/api/inventory/sub/rollback').send({ field: 'isOpened', toValue: false });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BOX_NOT_COMPLETE');
  });
});
