import { Router, Request, Response } from 'express';
import { CellarService } from '../services/cellar.service';
import { createCellarSchema, updateCellarSchema, swapSlotsSchema } from '../schemas/cellar.schema';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { routeParam } from '../lib/http';
import { auditLog } from '../services/audit.service';
import { slotService } from '../services/slot.service';

const router = Router();

// Fully protected route
router.use(authMiddleware);

/**
 * GET /api/cellars
 * List every cellar of the instance (the inventory is shared by the family)
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const cellars = await CellarService.listCellars();
    res.json({ data: cellars });
  } catch (err: unknown) {
    console.error('[cellars] GET / error:', err);
    res.status(500).json({ error: 'FAILED_TO_FETCH_CELLARS' });
  }
});

/**
 * GET /api/cellars/:id
 * Get a specific cellar
 */
router.get('/:id', async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  try {
    const cellar = await CellarService.getCellar(id);
    if (!cellar) {
      return res.status(404).json({ error: 'CELLAR_NOT_FOUND' });
    }
    res.json({ data: cellar });
  } catch (err: unknown) {
    console.error('[cellars] GET /:id error:', err);
    res.status(500).json({ error: 'FAILED_TO_FETCH_CELLAR' });
  }
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

  try {
    const cellar = await CellarService.createCellar(userId, validation.data);
    await auditLog({
      userId,
      ip: getClientIp(req),
      action: 'CELLAR_CREATE',
      status: 'success',
      details: { cellarId: cellar.id }
    });
    res.status(201).json({ data: cellar });
  } catch (err: unknown) {
    console.error('[cellars] POST / error:', err);
    await auditLog({
      userId,
      ip: getClientIp(req),
      action: 'CELLAR_CREATE',
      status: 'error',
      details: { error: err instanceof Error ? err.message : 'UNEXPECTED_ERROR' }
    });
    res.status(500).json({ error: 'FAILED_TO_CREATE_CELLAR' });
  }
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

  try {
    const cellar = await CellarService.updateCellar(id, validation.data);
    if (!cellar) {
      return res.status(404).json({ error: 'CELLAR_NOT_FOUND' });
    }
    await auditLog({
      userId,
      ip: getClientIp(req),
      action: 'CELLAR_UPDATE',
      status: 'success',
      details: { cellarId: id }
    });
    res.json({ data: cellar });
  } catch (err: unknown) {
    console.error('[cellars] PATCH /:id error:', err);
    res.status(500).json({ error: 'FAILED_TO_UPDATE_CELLAR' });
  }
});

/**
 * GET /api/cellars/:id/grid
 * Get cellar grid data: cellar config + all items with slot assignments
 */
router.get('/:id/grid', async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  try {
    const data = await CellarService.getGridData(id);
    if (!data) {
      return res.status(404).json({ error: 'CELLAR_NOT_FOUND' });
    }
    res.json({ data });
  } catch (err: unknown) {
    console.error('[cellars] GET /:id/grid error:', err);
    res.status(500).json({ error: 'FAILED_TO_FETCH_GRID' });
  }
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

  try {
    const cellar = await CellarService.deleteCellar(id);
    if (!cellar) {
      return res.status(404).json({ error: 'CELLAR_NOT_FOUND' });
    }
    await auditLog({
      userId,
      ip: getClientIp(req),
      action: 'CELLAR_DELETE',
      status: 'success',
      details: { cellarId: id }
    });
    res.status(204).send();
  } catch (err: unknown) {
    console.error('[cellars] DELETE /:id error:', err);
    res.status(500).json({ error: 'FAILED_TO_DELETE_CELLAR' });
  }
});

export default router;
