import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/middleware/guest.middleware', () => ({
  guestMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.guestShare = { id: 's1', userId: 'owner', hideNotes: (global as { __hideNotes?: boolean }).__hideNotes } as never;
    next();
  },
}));
vi.mock('../../src/services/shares.service', () => ({
  sharesService: {
    getItemForShare: vi.fn(),
    canWriteCellar: vi.fn(),
  },
}));
vi.mock('../../src/services/inventory.service', () => ({
  inventoryService: { updateItem: vi.fn() },
}));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));

import guestRouter from '../../src/routes/guest.router';
import { sharesService } from '../../src/services/shares.service';
import { inventoryService } from '../../src/services/inventory.service';

const app = express();
app.use(express.json());
app.use('/api/guest/:token', guestRouter);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sharesService.getItemForShare).mockResolvedValue({ id: 'i1', cellarId: 'c1' } as never);
  vi.mocked(sharesService.canWriteCellar).mockReturnValue(true);
  vi.mocked(inventoryService.updateItem).mockResolvedValue({ item: { id: 'i1' }, changes: [] } as never);
});

// A4-009: a guest who cannot see the notes must never overwrite them.
describe('PATCH /api/guest/:token/inventory/:itemId', () => {
  it('drops notes when the share hides them', async () => {
    (global as { __hideNotes?: boolean }).__hideNotes = true;
    const res = await request(app)
      .patch('/api/guest/tok/inventory/i1')
      .send({ fillLevel: 50, notes: null });
    expect(res.status).toBe(200);
    expect(inventoryService.updateItem).toHaveBeenCalledWith('owner', 'i1', { fillLevel: 50 });
  });

  it('answers with the share-redacted item, not the full updated row (#483)', async () => {
    (global as { __hideNotes?: boolean }).__hideNotes = true;
    vi.mocked(inventoryService.updateItem).mockResolvedValue({
      item: { id: 'i1', purchasePrice: 120, estimatedValue: 300, notes: 'secret' },
      changes: [],
    } as never);
    const res = await request(app).patch('/api/guest/tok/inventory/i1').send({ fillLevel: 40 });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'i1', cellarId: 'c1' });
    expect(sharesService.getItemForShare).toHaveBeenCalledTimes(2);
  });

  it('keeps notes when the share shows them', async () => {
    (global as { __hideNotes?: boolean }).__hideNotes = false;
    await request(app).patch('/api/guest/tok/inventory/i1').send({ notes: 'hi' });
    expect(inventoryService.updateItem).toHaveBeenCalledWith('owner', 'i1', { notes: 'hi' });
  });
});
