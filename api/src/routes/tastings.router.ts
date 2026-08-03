import { Router, Request, Response } from 'express';
import { tastingsService } from '../services/tastings.service';
import { tastingCreateSchema, tastingPatchSchema } from '../schemas/tastings.schema';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
  const itemId = req.query.itemId ? String(req.query.itemId) : undefined;
  const search = req.query.search ? String(req.query.search) : undefined;
  try {
    const result = await tastingsService.list(userId, page, limit, itemId, search);
    res.json({ data: result });
  } catch {
    res.status(500).json({ error: 'FAILED_TO_FETCH_TASTINGS' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const validation = tastingCreateSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
  }
  try {
    const note = await tastingsService.create(userId, validation.data);
    if (!note) return res.status(404).json({ error: 'ITEM_NOT_FOUND' });
    res.status(201).json({ data: note });
  } catch {
    res.status(500).json({ error: 'FAILED_TO_CREATE_TASTING' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;
  const validation = tastingPatchSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
  }
  try {
    const note = await tastingsService.update(id, userId, validation.data);
    if (!note) return res.status(404).json({ error: 'TASTING_NOT_FOUND' });
    res.json({ data: note });
  } catch {
    res.status(500).json({ error: 'FAILED_TO_UPDATE_TASTING' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;
  try {
    const deleted = await tastingsService.delete(id, userId);
    if (!deleted) return res.status(404).json({ error: 'TASTING_NOT_FOUND' });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'FAILED_TO_DELETE_TASTING' });
  }
});

router.get('/stats/:itemId', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { itemId } = req.params;
  try {
    const stats = await tastingsService.itemStats(userId, itemId);
    res.json({ data: stats });
  } catch {
    res.status(500).json({ error: 'FAILED_TO_FETCH_TASTING_STATS' });
  }
});

router.get('/analytics', async (req: Request, res: Response) => {
  const userId = req.userId!;
  try {
    const result = await tastingsService.analytics(userId);
    res.json({ data: result });
  } catch {
    res.status(500).json({ error: 'FAILED_TO_FETCH_TASTING_ANALYTICS' });
  }
});

export default router;
