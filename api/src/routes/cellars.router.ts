import { Router, Request, Response } from 'express';
import { CellarService } from '../services/cellar.service';
import { createCellarSchema, updateCellarSchema, swapSlotsSchema } from '../schemas/cellar.schema';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { routeParam } from '../lib/http';
import { auditLog } from '../services/audit.service';
import { slotService } from '../services/slot.service';
import { notFound } from '../lib/errors';

const router = Router();

// Fully protected route
router.use(authMiddleware);

// #467: no catch-all here. Express 5 forwards any failure to the error
// middleware, which answers 503 during a database outage, 500 otherwise.

/**
 * GET /api/cellars
 * List every cellar of the instance (the inventory is shared by the family)
 */
router.get('/', async (_req: Request, res: Response) => {
  const cellars = await CellarService.listCellars();
  res.json({ data: cellars });
});

/**
 * GET /api/cellars/:id
 * Get a specific cellar
 */
router.get('/:id', async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const cellar = await CellarService.getCellar(id);
  if (!cellar) throw notFound('CELLAR_NOT_FOUND');
  res.json({ data: cellar });
});

/**
 * POST /api/cellars
 * Create a new cellar
 */
router.post('/', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const validation = createCellarSchema.safeParse(req.body);

  if (!validation.success) {
    await auditLog({
      userId,
      ip: getClientIp(req),
      action: 'CELLAR_CREATE',
      status: 'validation_error',
      details: { errors: validation.error.format() }
    });
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
  }

  const cellar = await CellarService.createCellar(userId, validation.data);
  await auditLog({
    userId,
    ip: getClientIp(req),
    action: 'CELLAR_CREATE',
    status: 'success',
    details: { cellarId: cellar.id }
  });
  res.status(201).json({ data: cellar });
});

/**
 * PATCH /api/cellars/:id
 * Update a cellar
 */
router.patch('/:id', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const id = routeParam(req.params.id);
  const validation = updateCellarSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
  }

  const cellar = await CellarService.updateCellar(id, validation.data);
  if (!cellar) throw notFound('CELLAR_NOT_FOUND');
  await auditLog({
    userId,
    ip: getClientIp(req),
    action: 'CELLAR_UPDATE',
    status: 'success',
    details: { cellarId: id }
  });
  res.json({ data: cellar });
});

/**
 * GET /api/cellars/:id/grid
 * Get cellar grid data: cellar config + all items with slot assignments
 */
router.get('/:id/grid', async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const data = await CellarService.getGridData(id);
  if (!data) throw notFound('CELLAR_NOT_FOUND');
  res.json({ data });
});

/**
 * POST /api/cellars/:id/swap-slots
 * ISSUE_037: atomically swap two copies' grid positions, so a dropped
 * connection mid-swap can no longer leave the database half-updated.
 * FEAT-93: named by slot (a line may hold several cells); recorded in the
 * history of each unit (`field: 'slot'`). Errors go to the error middleware.
 */
router.post('/:id/swap-slots', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const id = routeParam(req.params.id);
  const { slotAId, slotBId } = swapSlotsSchema.parse(req.body);
  const writes = await slotService.swap(id, slotAId, slotBId);
  const ip = getClientIp(req);
  await auditLog({
    userId, ip, action: 'CELLAR_SWAP_SLOTS', status: 'success', details: { cellarId: id, slotAId, slotBId },
  });
  for (const write of writes) {
    void auditLog({
      userId, ip, action: 'UPDATE', status: 'success', bottleId: write.itemId, productId: write.productId,
      details: { changes: [write.change] },
    });
  }
  res.json({ data: writes.map(({ itemId, slot }) => ({ itemId, slot })) });
});

/**
 * DELETE /api/cellars/:id
 * Delete a cellar
 */
router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const id = routeParam(req.params.id);

  const deleted = await CellarService.deleteCellar(id);
  if (!deleted) throw notFound('CELLAR_NOT_FOUND');
  // #597: the guest shares the cellar was taken out of, and those revoked
  // because nothing was left in their scope.
  const { sharesCleaned, sharesRevoked } = deleted;
  await auditLog({
    userId,
    ip: getClientIp(req),
    action: 'CELLAR_DELETE',
    status: 'success',
    details: {
      cellarId: id,
      ...(sharesCleaned.length > 0 ? { sharesCleaned } : {}),
      ...(sharesRevoked.length > 0 ? { sharesRevoked } : {}),
    },
  });
  res.status(204).send();
});

export default router;
