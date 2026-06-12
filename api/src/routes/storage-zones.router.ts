import { Router, Request, Response } from 'express';
import { StorageZoneService } from '../services/storage-zone.service';
import { createStorageZoneSchema, updateStorageZoneSchema } from '../schemas/storage-zone.schema';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

/**
 * GET /api/cellars/:cellarId/zones
 * List all zones for a cellar (flat list — client builds the tree)
 */
router.get('/cellars/:cellarId/zones', async (req: Request, res: Response) => {
  const { cellarId } = req.params;
  try {
    const zones = await StorageZoneService.listByCellar(cellarId);
    res.json({ data: zones });
  } catch {
    res.status(500).json({ error: 'FAILED_TO_FETCH_ZONES' });
  }
});

/**
 * GET /api/zones/:id
 * Get a single zone with children and item count
 */
router.get('/zones/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const zone = await StorageZoneService.getById(id);
    if (!zone) return res.status(404).json({ error: 'ZONE_NOT_FOUND' });
    res.json({ data: zone });
  } catch {
    res.status(500).json({ error: 'FAILED_TO_FETCH_ZONE' });
  }
});

/**
 * POST /api/cellars/:cellarId/zones
 * Create a new zone in a cellar
 */
router.post('/cellars/:cellarId/zones', async (req: Request, res: Response) => {
  const { cellarId } = req.params;
  const validation = createStorageZoneSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
  }

  try {
    const zone = await StorageZoneService.createZone(cellarId, validation.data);
    res.status(201).json({ data: zone });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'PARENT_ZONE_NOT_FOUND') {
      return res.status(404).json({ error: 'PARENT_ZONE_NOT_FOUND' });
    }
    res.status(500).json({ error: 'FAILED_TO_CREATE_ZONE' });
  }
});

/**
 * PATCH /api/zones/:id
 * Update a zone
 */
router.patch('/zones/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const validation = updateStorageZoneSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
  }

  try {
    const zone = await StorageZoneService.updateZone(id, validation.data);
    if (!zone) return res.status(404).json({ error: 'ZONE_NOT_FOUND' });
    res.json({ data: zone });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'CIRCULAR_REFERENCE') {
      return res.status(400).json({ error: 'CIRCULAR_REFERENCE' });
    }
    if (err instanceof Error && err.message === 'PARENT_ZONE_NOT_FOUND') {
      return res.status(404).json({ error: 'PARENT_ZONE_NOT_FOUND' });
    }
    res.status(500).json({ error: 'FAILED_TO_UPDATE_ZONE' });
  }
});

/**
 * DELETE /api/zones/:id
 * Delete a zone (redirects its items to unclassified)
 */
router.delete('/zones/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const zone = await StorageZoneService.deleteZone(id);
    if (!zone) return res.status(404).json({ error: 'ZONE_NOT_FOUND' });
    res.status(204).send();
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'ZONE_HAS_CHILDREN') {
      return res.status(409).json({ error: 'ZONE_HAS_CHILDREN' });
    }
    res.status(500).json({ error: 'FAILED_TO_DELETE_ZONE' });
  }
});

/**
 * GET /api/zones/:id/items
 * List all items in a zone and all its sub-zones recursively
 */
router.get('/zones/:id/items', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const items = await StorageZoneService.listItemsByZone(id);
    res.json({ data: items });
  } catch {
    res.status(500).json({ error: 'FAILED_TO_FETCH_ZONE_ITEMS' });
  }
});

export default router;
