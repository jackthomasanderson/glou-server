import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/middleware/guest.middleware', () => ({
  guestMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.guestShare = {
      id: 's1', userId: 'owner', inviteeName: 'Marie', hideNotes: (global as { __hideNotes?: boolean }).__hideNotes,
      cellarIds: ['c1', 'c2'], writeCellarIds: ['c1'], collectionIds: [],
    } as never;
    next();
  },
}));
vi.mock('../../src/services/shares.service', () => ({
  sharesService: {
    getItemForShare: vi.fn(),
    canWriteCellar: vi.fn(),
    getCellarsForShare: vi.fn(),
    findLatestGuestMove: vi.fn(),
  },
}));
vi.mock('../../src/services/inventory.service', () => ({
  inventoryService: { updateItem: vi.fn() },
}));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));
vi.mock('../../src/services/guest-tasting.service', () => ({ createGuestTasting: vi.fn() }));

import guestRouter from '../../src/routes/guest.router';
import { sharesService } from '../../src/services/shares.service';
import { inventoryService } from '../../src/services/inventory.service';
import { createGuestTasting } from '../../src/services/guest-tasting.service';
import { auditLog } from '../../src/services/audit.service';

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
    expect(inventoryService.updateItem).toHaveBeenCalledWith('owner', 'i1', { isOpened: true, fillLevel: 50 }, { guard: expect.any(Function) });
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


  // #471 (FEAT-109 c2): the guard the route hands to updateItem is the guest's
  // rule, judged on the unit as read under the lock (here: finished meanwhile).
  it('refuses, through the guard, to bring back a bottle finished meanwhile', async () => {
    const { auditLog } = await import('../../src/services/audit.service');
    vi.mocked(inventoryService.updateItem).mockImplementation((async (_user: string, _id: string, _patch: unknown, options?: { guard?: (unit: unknown, planned: () => string) => void }) => {
      options?.guard?.({ cellarId: 'c1', quantity: 1, isOpened: true, fillLevel: 0, cigarsLeft: null, writtenOffAt: null }, () => 'reattached');
      return { item: { id: 'i1' }, changes: [], changed: [], removedIds: [] };
    }) as never);

    const res = await request(app).patch('/api/guest/tok/inventory/i1').send({ isOpened: false, fillLevel: 100 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('GUEST_ITEM_FINISHED');
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'GUEST_UPDATE', status: 'error', details: expect.objectContaining({ reason: 'GUEST_ITEM_FINISHED' }),
    }));
  });

  it('refuses smoking one in a cellar shared read-only, as seen under the lock (c4)', async () => {
    vi.mocked(inventoryService.updateItem).mockImplementation((async (_user: string, _id: string, _patch: unknown, options?: { guard?: (unit: unknown, planned: () => string) => void }) => {
      options?.guard?.({ cellarId: 'c2', quantity: 3, isOpened: false, fillLevel: null, cigarsLeft: null, writtenOffAt: null }, () => 'detached');
      return { item: { id: 'i1' }, changes: [], changed: [], removedIds: [] };
    }) as never);

    const res = await request(app).patch('/api/guest/tok/inventory/i1').send({ smokeOne: true });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('READ_ONLY_ACCESS');
  });

  it('answers 403 READ_ONLY_ACCESS before anything when the cellar is shared read-only (c4)', async () => {
    vi.mocked(sharesService.canWriteCellar).mockReturnValue(false);

    const res = await request(app).patch('/api/guest/tok/inventory/i1').send({ isOpened: true, fillLevel: 0 });

    expect(res.status).toBe(403);
    expect(inventoryService.updateItem).not.toHaveBeenCalled();
  });
});

describe('GET /api/guest/:token', () => {
  it('names the cellars of the share, for the guest\'s lines (FEAT-109)', async () => {
    vi.mocked(sharesService.getCellarsForShare).mockResolvedValue([{ id: 'c1', name: 'Garage' }, { id: 'c2', name: 'Cuisine' }] as never);

    const res = await request(app).get('/api/guest/tok');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ writeCellarIds: ['c1'], cellars: [{ id: 'c1', name: 'Garage' }, { id: 'c2', name: 'Cuisine' }] });
    expect(sharesService.getCellarsForShare).toHaveBeenCalledWith(expect.objectContaining({ cellarIds: ['c1', 'c2'] }));
  });
});

// #471 (FEAT-109 c3, D16): a guest notes a tasting on a wine of a cellar shared with write access.
describe('POST /api/guest/:token/tastings', () => {
  const P1 = '11111111-1111-4111-8111-111111111111';

  it('creates it for the share and logs GUEST_TASTING', async () => {
    vi.mocked(createGuestTasting).mockResolvedValue({ id: 't1', productId: P1, guestName: 'Marie' } as never);

    const res = await request(app).post('/api/guest/tok/tastings').send({ productId: P1, rating: 4 });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: 't1', productId: P1, guestName: 'Marie' });
    expect(createGuestTasting).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', writeCellarIds: ['c1'] }), { productId: P1, rating: 4 });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'GUEST_TASTING', status: 'success', productId: P1, details: expect.objectContaining({ inviteeName: 'Marie', tastingId: 't1' }),
    }));
  });

  it('refuses a field outside the guest schema (400), before anything', async () => {
    const res = await request(app).post('/api/guest/tok/tastings').send({ productId: P1, photoUrl: 'https://evil.example/x.png' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(createGuestTasting).not.toHaveBeenCalled();
  });

  it('answers the refusal of a wine out of the write scope (c4)', async () => {
    const { AppError } = await import('../../src/lib/errors');
    vi.mocked(createGuestTasting).mockRejectedValue(new AppError(403, 'READ_ONLY_ACCESS'));

    const res = await request(app).post('/api/guest/tok/tastings').send({ productId: P1 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('READ_ONLY_ACCESS');
  });
});

// Decision #471 point 68: "Annuler" of the guest's own move, just made through this share.
describe('PATCH /api/guest/:token/inventory/:itemId — "Annuler"', () => {
  type Guard = (unit: unknown, planned: () => string) => void;
  const STAMP = '2026-11-04T10:00:00.000Z';
  const group = { id: 'i1', cellarId: 'c1', quantity: 6, isOpened: false, fillLevel: null, cigarsLeft: null, writtenOffAt: null, openedAt: null, slotColumn: null, slotRow: null, category: 'wine', updatedAt: new Date('2026-11-01T00:00:00.000Z') };

  it('a move records what it found and the version it left, before answering', async () => {
    vi.mocked(inventoryService.updateItem).mockImplementation((async (_u: string, _id: string, _p: unknown, options?: { guard?: Guard }) => {
      options?.guard?.(group, () => 'detached');
      return { item: { id: 'sub', productId: 'p1', updatedAt: new Date(STAMP), slotColumn: null }, changes: [], changed: [], removedIds: [], outcome: 'detached' };
    }) as never);

    const res = await request(app).patch('/api/guest/tok/inventory/i1').send({ isOpened: true, fillLevel: 0 });

    expect(res.status).toBe(200);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      bottleId: 'sub',
      details: expect.objectContaining({
        shareId: 's1',
        undo: { before: { isOpened: false, fillLevel: null, openedAt: null, cigarsLeft: null }, stampedAt: STAMP },
      }),
    }));
  });

  it('a level set records no "Annuler"', async () => {
    const sub = { ...group, id: 'sub', quantity: 1, isOpened: true, fillLevel: 60 };
    vi.mocked(inventoryService.updateItem).mockImplementation((async (_u: string, _id: string, _p: unknown, options?: { guard?: Guard }) => {
      options?.guard?.(sub, () => 'updated');
      return { item: { id: 'sub', productId: 'p1', updatedAt: new Date(STAMP) }, changes: [], changed: [], removedIds: [] };
    }) as never);

    await request(app).patch('/api/guest/tok/inventory/sub').send({ fillLevel: 30 });

    const details = (vi.mocked(auditLog).mock.calls[0]?.[0] as { details: Record<string, unknown> }).details;
    expect(details).not.toHaveProperty('undo');
  });

  it('puts the bottle back when the latest move on it was this share\'s, just made, and nothing changed since', async () => {
    vi.mocked(sharesService.findLatestGuestMove).mockResolvedValue({
      shareId: 's1', createdAt: new Date(),
      undo: { before: { isOpened: false, fillLevel: null, openedAt: null, cigarsLeft: null }, stampedAt: STAMP },
    } as never);
    vi.mocked(inventoryService.updateItem).mockImplementation((async (_u: string, _id: string, _p: unknown, options?: { guard?: Guard }) => {
      options?.guard?.({ cellarId: 'c1', updatedAt: new Date(STAMP) }, () => 'reattached');
      return { item: { id: 'i1', productId: 'p1', updatedAt: new Date() }, changes: [], changed: [], removedIds: ['sub'], outcome: 'reattached' };
    }) as never);

    const res = await request(app).patch('/api/guest/tok/inventory/sub').send({ undo: true });

    expect(res.status).toBe(200);
    expect(inventoryService.updateItem).toHaveBeenCalledWith('owner', 'sub', { isOpened: false, fillLevel: null, openedAt: null, cigarsLeft: null }, { guard: expect.any(Function) });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ undoOf: STAMP }) }));
  });

  it('refuses it when nothing undoable was recorded (later than the window, or never)', async () => {
    vi.mocked(sharesService.findLatestGuestMove).mockResolvedValue(null);

    const res = await request(app).patch('/api/guest/tok/inventory/sub').send({ undo: true });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('GUEST_UNDO_REFUSED');
    expect(inventoryService.updateItem).not.toHaveBeenCalled();
  });

  it('refuses it from another share, and on a unit changed since', async () => {
    const run = async (entryShare: string, updatedAt: string) => {
      vi.mocked(sharesService.findLatestGuestMove).mockResolvedValue({
        shareId: entryShare, createdAt: new Date(),
        undo: { before: { isOpened: false, fillLevel: null, openedAt: null, cigarsLeft: null }, stampedAt: STAMP },
      } as never);
      vi.mocked(inventoryService.updateItem).mockImplementation((async (_u: string, _id: string, _p: unknown, options?: { guard?: Guard }) => {
        options?.guard?.({ cellarId: 'c1', updatedAt: new Date(updatedAt) }, () => 'reattached');
        return { item: { id: 'i1' }, changes: [], changed: [], removedIds: [] };
      }) as never);
      return request(app).patch('/api/guest/tok/inventory/sub').send({ undo: true });
    };
    expect((await run('s2', STAMP)).body.error).toBe('GUEST_UNDO_REFUSED');
    expect((await run('s1', '2026-11-04T10:00:05.000Z')).body.error).toBe('GUEST_UNDO_REFUSED');
  });
});

// Review of #820: an « Annuler » whose grid slot was taken meanwhile still
// brings the bottle back (without a slot); a write that wrote nothing is
// never logged as a success.
describe('PATCH /api/guest/:token/inventory/:itemId — a grid slot taken meanwhile', () => {
  type Guard = (unit: unknown, planned: () => string) => void;
  const STAMP = '2026-11-04T10:00:00.000Z';
  const placedMove = {
    shareId: 's1', createdAt: new Date(),
    undo: { before: { isOpened: false, fillLevel: null, openedAt: null, cigarsLeft: null, slotColumn: 1, slotRow: 1 }, stampedAt: STAMP },
  };
  const successes = () => vi.mocked(auditLog).mock.calls.filter(([entry]) => (entry as { status: string }).status === 'success');

  it('« Annuler » brings the bottle back without its slot when someone took it', async () => {
    vi.mocked(sharesService.findLatestGuestMove).mockResolvedValue(placedMove as never);
    vi.mocked(inventoryService.updateItem)
      .mockResolvedValueOnce({ item: { id: 'b1' }, changes: [], changed: [], removedIds: [], slotConflict: true } as never)
      .mockImplementationOnce((async (_u: string, _id: string, _p: unknown, options?: { guard?: Guard }) => {
        options?.guard?.({ cellarId: 'c1', updatedAt: new Date(STAMP) }, () => 'regrouped');
        return { item: { id: 'b1', productId: 'p1', updatedAt: new Date() }, changes: [], changed: [], removedIds: [], outcome: 'regrouped' };
      }) as never);

    const res = await request(app).patch('/api/guest/tok/inventory/b1').send({ undo: true });

    expect(res.status).toBe(200);
    const calls = vi.mocked(inventoryService.updateItem).mock.calls;
    expect(calls[0][2]).toMatchObject({ isOpened: false, slotColumn: 1, slotRow: 1 });
    expect(calls[1][2]).toEqual({ isOpened: false, fillLevel: null, openedAt: null, cigarsLeft: null });
    expect(successes()).toHaveLength(1);
  });

  it('answers 409 SLOT_OCCUPIED, never a success, when a write wrote nothing', async () => {
    vi.mocked(inventoryService.updateItem).mockResolvedValue({ item: { id: 'i1' }, changes: [], changed: [], removedIds: [], slotConflict: true } as never);

    const res = await request(app).patch('/api/guest/tok/inventory/i1').send({ isOpened: true, fillLevel: 0 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('SLOT_OCCUPIED');
    expect(successes()).toHaveLength(0);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', details: expect.objectContaining({ reason: 'SLOT_OCCUPIED' }) }));
  });

  it('an « Annuler » refused twice by the slot rule is a 409 too, not a success', async () => {
    vi.mocked(sharesService.findLatestGuestMove).mockResolvedValue(placedMove as never);
    vi.mocked(inventoryService.updateItem).mockResolvedValue({ item: { id: 'b1' }, changes: [], changed: [], removedIds: [], slotConflict: true } as never);

    const res = await request(app).patch('/api/guest/tok/inventory/b1').send({ undo: true });

    expect(res.status).toBe(409);
    expect(successes()).toHaveLength(0);
  });
});
