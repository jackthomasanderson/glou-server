// #962: deleting an entry of the trash for good, or emptying the trash of a
// page. Administrators only (owner decision on the issue): the real
// adminMiddleware runs here, against a mocked user row.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock('../../src/middleware/auth.middleware', async (importActual) => ({
  ...(await importActual<typeof import('../../src/middleware/auth.middleware')>()),
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.userId = 'u1';
    next();
  },
  getClientIp: () => '127.0.0.1',
}));
vi.mock('../../src/services/inventory.service', () => ({
  inventoryService: { deleteTrashedItem: vi.fn(), deleteTrashedProduct: vi.fn(), emptyTrash: vi.fn() },
}));
vi.mock('../../src/services/product.service', () => ({ productService: {} }));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));

import { prisma } from '../../src/lib/prisma';
import { inventoryRouter } from '../../src/routes/inventory.router';
import { productsRouter } from '../../src/routes/products.router';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { inventoryService } from '../../src/services/inventory.service';
import { auditLog } from '../../src/services/audit.service';

const app = express();
app.use(express.json());
app.use('/api/inventory', inventoryRouter);
app.use('/api/products', productsRouter);
app.use(errorMiddleware);

const asAdmin = (isAdmin: boolean) =>
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ isAdmin } as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('DELETE /api/inventory/trash/:id (#962)', () => {
  it('deletes a trashed line for good and logs who, what and how many', async () => {
    asAdmin(true);
    vi.mocked(inventoryService.deleteTrashedItem).mockResolvedValue({ itemIds: ['b1'], productIds: [], label: 'Domaine A — Cuvée B (2015)' });

    const res = await request(app).delete('/api/inventory/trash/b1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { itemIds: ['b1'], productIds: [] } });
    expect(inventoryService.deleteTrashedItem).toHaveBeenCalledWith('b1');
    // The rows are gone: no bottleId / productId (their foreign keys), the ids in the details.
    expect(auditLog).toHaveBeenCalledWith({
      userId: 'u1', action: 'TRASH_DELETE', status: 'success', ip: '127.0.0.1',
      details: { scope: 'item', label: 'Domaine A — Cuvée B (2015)', itemIds: ['b1'], productIds: [], lines: 1, wines: 0 },
    });
  });

  it('answers 404 for a line that is not in the trash', async () => {
    asAdmin(true);
    vi.mocked(inventoryService.deleteTrashedItem).mockResolvedValue(null);

    const res = await request(app).delete('/api/inventory/trash/b1');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('ITEM_NOT_IN_TRASH');
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'TRASH_DELETE', status: 'not_found' }));
  });

  it('refuses a member who is not an administrator (403), whatever the client sends', async () => {
    asAdmin(false);

    const res = await request(app).delete('/api/inventory/trash/b1').set('X-Is-Admin', 'true').send({ isAdmin: true });

    expect(res.status).toBe(403);
    expect(inventoryService.deleteTrashedItem).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/products/trash/:id (#962)', () => {
  it('deletes a trashed wine with its bottles for good', async () => {
    asAdmin(true);
    vi.mocked(inventoryService.deleteTrashedProduct).mockResolvedValue({ itemIds: ['a', 'b'], productIds: ['p1'], label: 'Cuvée B' });

    const res = await request(app).delete('/api/products/trash/p1');

    expect(res.status).toBe(200);
    expect(inventoryService.deleteTrashedProduct).toHaveBeenCalledWith('p1');
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'TRASH_DELETE', status: 'success',
      details: { scope: 'product', label: 'Cuvée B', itemIds: ['a', 'b'], productIds: ['p1'], lines: 2, wines: 1 },
    }));
  });

  it('answers 404 for a wine that is not in the trash', async () => {
    asAdmin(true);
    vi.mocked(inventoryService.deleteTrashedProduct).mockResolvedValue(null);

    const res = await request(app).delete('/api/products/trash/p1');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('PRODUCT_NOT_IN_TRASH');
  });

  it('refuses a member who is not an administrator (403)', async () => {
    asAdmin(false);

    const res = await request(app).delete('/api/products/trash/p1');

    expect(res.status).toBe(403);
    expect(inventoryService.deleteTrashedProduct).not.toHaveBeenCalled();
  });
});

describe('POST /api/inventory/trash/empty (#962)', () => {
  it("empties the trash of the page's categories and logs how many", async () => {
    asAdmin(true);
    vi.mocked(inventoryService.emptyTrash).mockResolvedValue({ itemIds: ['c1', 'c2'], productIds: ['pc'] });

    const res = await request(app).post('/api/inventory/trash/empty').send({ categories: ['cigar'] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { itemIds: ['c1', 'c2'], productIds: ['pc'] } });
    expect(inventoryService.emptyTrash).toHaveBeenCalledWith(['cigar']);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'TRASH_DELETE', status: 'success',
      details: { scope: 'empty', categories: ['cigar'], itemIds: ['c1', 'c2'], productIds: ['pc'], lines: 2, wines: 1 },
    }));
  });

  it('an emptied trash of many rows logs the counts and categories, not every id', async () => {
    asAdmin(true);
    const itemIds = Array.from({ length: 30 }, (_, i) => `i${i}`);
    vi.mocked(inventoryService.emptyTrash).mockResolvedValue({ itemIds, productIds: ['p1', 'p2'] });

    const res = await request(app).post('/api/inventory/trash/empty').send({ categories: ['wine', 'spirit'] });

    expect(res.status).toBe(200);
    expect(vi.mocked(auditLog).mock.calls[0][0].details).toEqual({ scope: 'empty', categories: ['wine', 'spirit'], lines: 30, wines: 2 });
  });

  it('refuses a request without a valid category', async () => {
    asAdmin(true);

    const res = await request(app).post('/api/inventory/trash/empty').send({ categories: ['beer'] });

    expect(res.status).toBe(400);
    expect(inventoryService.emptyTrash).not.toHaveBeenCalled();
  });

  it('refuses a member who is not an administrator (403)', async () => {
    asAdmin(false);

    const res = await request(app).post('/api/inventory/trash/empty').send({ categories: ['wine'] });

    expect(res.status).toBe(403);
    expect(inventoryService.emptyTrash).not.toHaveBeenCalled();
  });
});
