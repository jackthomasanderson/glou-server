import { Router, Request, Response } from 'express';
import { CellarService } from '../services/cellar.service';
import { createCellarSchema, updateCellarSchema } from '../schemas/cellar.schema';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { auditLog } from '../services/audit.service';

const router = Router();

// Fully protected route
router.use(authMiddleware);

/**
 * GET /api/cellars
 * List all cellars for the authenticated user
 */
router.get('/', async (req: Request, res: Response) => {
  const userId = req.userId!;
  try {
    const cellars = await CellarService.listCellars(userId);
    res.json({ data: cellars });
  } catch (err: unknown) {
    res.status(500).json({ error: 'FAILED_TO_FETCH_CELLARS' });
  }
});

/**
 * GET /api/cellars/:id
 * Get a specific cellar
 */
router.get('/:id', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;
  try {
    const cellar = await CellarService.getCellar(userId, id);
    if (!cellar) {
      return res.status(404).json({ error: 'CELLAR_NOT_FOUND' });
    }
    res.json({ data: cellar });
  } catch (err: unknown) {
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
  const { id } = req.params;
  const validation = updateCellarSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
  }

  try {
    const cellar = await CellarService.updateCellar(userId, id, validation.data);
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
    res.status(500).json({ error: 'FAILED_TO_UPDATE_CELLAR' });
  }
});

/**
 * GET /api/cellars/:id/grid
 * Get cellar grid data: cellar config + all items with slot assignments
 */
router.get('/:id/grid', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;
  try {
    const data = await CellarService.getGridData(userId, id);
    if (!data) {
      return res.status(404).json({ error: 'CELLAR_NOT_FOUND' });
    }
    res.json({ data });
  } catch (err: unknown) {
    res.status(500).json({ error: 'FAILED_TO_FETCH_GRID' });
  }
});

/**
 * DELETE /api/cellars/:id
 * Delete a cellar
 */
router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;

  try {
    const cellar = await CellarService.deleteCellar(userId, id);
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
    res.status(500).json({ error: 'FAILED_TO_DELETE_CELLAR' });
  }
});

export default router;
