import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// ISSUE_472: a share that hides notes must never let a guest write them.
vi.mock('../../src/middleware/guest.middleware', () => ({
  guestMiddleware: (req: { guestShare?: unknown }, _res: unknown, next: () => void) => {
    req.guestShare = (globalThis as { __share?: unknown }).__share;
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

import express from 'express';
import guestRouter from '../../src/routes/guest.router';
import { sharesService } from '../../src/services/shares.service';
import { inventoryService } from '../../src/services/inventory.service';

const app = express();
app.use(express.json());
app.use('/api/guest/:token', guestRouter);

function setShare(hideNotes: boolean) {
  (globalThis as { __share?: unknown }).__share = { id: 's1', userId: 'u1', hideNotes, hidePrices: false };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sharesService.getItemForShare).mockResolvedValue({ id: 'i1', cellarId: 'c1' } as never);
  vi.mocked(sharesService.canWriteCellar).mockReturnValue(true);
  vi.mocked(inventoryService.updateItem).mockResolvedValue({ item: { id: 'i1' }, changes: {} } as never);
});

describe('PATCH /api/guest/:token/inventory/:itemId', () => {
  it('drops notes when the share hides them', async () => {
    setShare(true);
    const res = await request(app)
      .patch('/api/guest/tok/inventory/i1')
      .send({ fillLevel: 50, notes: null });
    expect(res.status).toBe(200);
    expect(inventoryService.updateItem).toHaveBeenCalledWith('u1', 'i1', { fillLevel: 50 });
  });

  it('keeps notes when the share exposes them', async () => {
    setShare(false);
    await request(app).patch('/api/guest/tok/inventory/i1').send({ notes: 'x' });
    expect(inventoryService.updateItem).toHaveBeenCalledWith('u1', 'i1', { notes: 'x' });
  });
});
