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
  vi.mocked(inventoryService.updateItem).mockResolvedValue({ item: { id: 'i1' }, changes: [], changed: [], removedIds: [] } as never);
});

// #471 (FEAT-109): the notes belong to the family — a guest can never write them.
describe('PATCH /api/guest/:token/inventory/:itemId', () => {
  it.each([true, false])('refuses notes, whether the share hides them (%s) or not', async (hideNotes) => {
    (global as { __hideNotes?: boolean }).__hideNotes = hideNotes;
    const res = await request(app)
      .patch('/api/guest/tok/inventory/i1')
      .send({ fillLevel: 50, notes: null });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(inventoryService.updateItem).not.toHaveBeenCalled();
  });

  it('writes the state of the bottle', async () => {
    const res = await request(app).patch('/api/guest/tok/inventory/i1').send({ isOpened: true, fillLevel: 50 });
    expect(res.status).toBe(200);
    expect(inventoryService.updateItem).toHaveBeenCalledWith('owner', 'i1', { isOpened: true, fillLevel: 50 });
  });

  it('answers with the share-redacted item, not the full updated row (#483)', async () => {
    (global as { __hideNotes?: boolean }).__hideNotes = true;
    vi.mocked(inventoryService.updateItem).mockResolvedValue({
      item: { id: 'i1', purchasePrice: 120, estimatedValue: 300, notes: 'secret' },
      changes: [],
      changed: [],
      removedIds: [],
    } as never);
    const res = await request(app).patch('/api/guest/tok/inventory/i1').send({ fillLevel: 40 });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'i1', cellarId: 'c1' });
    expect(sharesService.getItemForShare).toHaveBeenCalledTimes(2);
  });

  // #471 (D8): opening one bottle of a group detaches it — the answer is the
  // sub-record, with the group it came from, both seen through the share.
  it('answers with the detached sub-record and the group it came from, share-redacted', async () => {
    vi.mocked(inventoryService.updateItem).mockResolvedValue({
      item: { id: 'sub', purchasePrice: 120 }, changes: [], changed: [{ id: 'i1', purchasePrice: 120 }], removedIds: [], outcome: 'detached',
    } as never);
    vi.mocked(sharesService.getItemForShare).mockImplementation((async (_share: unknown, id: string) => ({ id, cellarId: 'c1' })) as never);

    const res = await request(app).patch('/api/guest/tok/inventory/i1').send({ isOpened: true, fillLevel: 60 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { id: 'sub', cellarId: 'c1' }, changed: [{ id: 'i1', cellarId: 'c1' }], removedIds: [] });
  });

  it('answers 409 TASTINGS_ON_ITEM when a reattach would drop a tasting', async () => {
    const { AppError } = await import('../../src/lib/errors');
    vi.mocked(inventoryService.updateItem).mockRejectedValue(new AppError(409, 'TASTINGS_ON_ITEM', { details: { count: 1 } }));

    const res = await request(app).patch('/api/guest/tok/inventory/i1').send({ isOpened: false, fillLevel: 100 });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'TASTINGS_ON_ITEM', details: { count: 1 } });
  });

});
