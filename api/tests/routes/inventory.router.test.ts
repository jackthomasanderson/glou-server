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
  inventoryService: { updateItem: vi.fn(), rollbackField: vi.fn(), createItem: vi.fn(), createApart: vi.fn() },
}));
vi.mock('../../src/services/inventory-export.service', () => ({ inventoryExportService: { exportCsv: vi.fn() } }));
vi.mock('../../src/services/scan.service', () => ({ scanService: {} }));
vi.mock('../../src/services/system-config.service', () => ({ systemConfigService: {} }));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));

import { inventoryRouter } from '../../src/routes/inventory.router';
import { inventoryService } from '../../src/services/inventory.service';
import { inventoryExportService } from '../../src/services/inventory-export.service';
import { auditLog } from '../../src/services/audit.service';
import { AppError } from '../../src/lib/errors';

const app = express();
app.use(express.json());
app.use('/api/inventory', inventoryRouter);

beforeEach(() => vi.clearAllMocks());

const wine = { category: 'wine', name: 'Cuvée X', producer: 'Domaine Y', vintage: 2020 };

// #471 (FEAT-97): the duplicate refusal (409 DUPLICATE_CANDIDATE) is gone —
// "Vous avez déjà ce vin" is asked while typing; a creation creates a wine.
describe('POST /api/inventory (FEAT-97)', () => {
  it('creates the wine even when one of the same name exists, without looking for it', async () => {
    vi.mocked(inventoryService.createItem).mockResolvedValue({ id: 'b2', productId: 'p2' } as never);

    const res = await request(app).post('/api/inventory').send({ ...wine, confirmDuplicate: true });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { id: 'b2', productId: 'p2' } });
    expect(inventoryService.createApart).not.toHaveBeenCalled();
  });

  it('c5: "C\'est un autre vin" creates the wine apart from the ones named', async () => {
    vi.mocked(inventoryService.createApart).mockResolvedValue({ id: 'b2', productId: 'p2' } as never);

    const res = await request(app).post('/api/inventory').send({ ...wine, distinctFrom: ['p1'] });

    expect(res.status).toBe(201);
    expect(inventoryService.createApart).toHaveBeenCalledWith('u1', expect.objectContaining({ name: 'Cuvée X' }), ['p1'], undefined);
    expect(inventoryService.createItem).not.toHaveBeenCalled();
    expect(vi.mocked(auditLog).mock.calls[0]?.[0]).toMatchObject({ action: 'CREATE', status: 'success', productId: 'p2', details: { distinctFrom: ['p1'] } });
  });

  it.each([
    ['not a list', 'p1'],
    ['too many', Array.from({ length: 51 }, (_, i) => `p${i}`)],
  ])('answers 400 when the wines told apart are %s', async (_label, distinctFrom) => {
    const res = await request(app).post('/api/inventory').send({ ...wine, distinctFrom });

    expect(res.status).toBe(400);
    expect(inventoryService.createItem).not.toHaveBeenCalled();
    expect(inventoryService.createApart).not.toHaveBeenCalled();
  });
});

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

// #471 (FEAT-99): the CSV export is a member-only, read-only download.
describe('GET /api/inventory/export.csv (FEAT-99)', () => {
  it('serves the CSV as an attachment, headers in English by default', async () => {
    vi.mocked(inventoryExportService.exportCsv).mockResolvedValue({ csv: '\ufeffName\r\n', rows: 0 });

    const res = await request(app).get('/api/inventory/export.csv');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="glou-cellar-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-glou-rows']).toBe('0');
    expect(inventoryExportService.exportCsv).toHaveBeenCalledWith('en');
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('writes the French headers on ?lang=fr and falls back to English otherwise', async () => {
    vi.mocked(inventoryExportService.exportCsv).mockResolvedValue({ csv: '', rows: 0 });
    await request(app).get('/api/inventory/export.csv?lang=fr');
    await request(app).get('/api/inventory/export.csv?lang=de');
    expect(vi.mocked(inventoryExportService.exportCsv).mock.calls.map(([lang]) => lang)).toEqual(['fr', 'en']);
  });

  it('answers 500 UNEXPECTED_ERROR when the read fails', async () => {
    vi.mocked(inventoryExportService.exportCsv).mockRejectedValue(new Error('db down'));
    const res = await request(app).get('/api/inventory/export.csv');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'UNEXPECTED_ERROR' });
  });
});
