import { Router, Request, Response } from 'express';
import { tastingsService } from '../services/tastings.service';
import { tastingCreateSchema, tastingPatchSchema } from '../schemas/tastings.schema';
import { paginationQuerySchema } from '../schemas/pagination.schema';
import { authMiddleware } from '../middleware/auth.middleware';
import { firstStr, routeParam } from '../lib/http';

const router = Router();
router.use(authMiddleware);

// Error handling contract for this router (and the template for the others):
// no handler builds a 500 response of its own. A rejected promise is forwarded
// by Express 5 to `errorMiddleware`, which logs the real error and maps it to a
// status — so a failure is never silently swallowed (ISSUE_063) and a client
// mistake never reads as a server fault (ISSUE_105).

const listQuerySchema = paginationQuerySchema({ defaultLimit: 20, maxLimit: 50 });

router.get('/', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const query = listQuerySchema.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: query.error.format() });
  }
  const itemId = firstStr(req.query.itemId);
  const search = firstStr(req.query.search);
  const result = await tastingsService.list(userId, query.data.page, query.data.limit, itemId, search);
  res.json({ data: result });
});

router.post('/', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const validation = tastingCreateSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
  }
  const note = await tastingsService.create(userId, validation.data);
  if (!note) return res.status(404).json({ error: 'ITEM_NOT_FOUND' });
  res.status(201).json({ data: note });
});

router.patch('/:id', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const id = routeParam(req.params.id);
  const validation = tastingPatchSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
  }
  const note = await tastingsService.update(id, userId, validation.data);
  if (!note) return res.status(404).json({ error: 'TASTING_NOT_FOUND' });
  res.json({ data: note });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const id = routeParam(req.params.id);
  const deleted = await tastingsService.delete(id, userId);
  if (!deleted) return res.status(404).json({ error: 'TASTING_NOT_FOUND' });
  res.status(204).send();
});

router.get('/stats/:itemId', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const itemId = routeParam(req.params.itemId);
  const stats = await tastingsService.itemStats(userId, itemId);
  res.json({ data: stats });
});

router.get('/analytics', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const result = await tastingsService.analytics(userId);
  res.json({ data: result });
});

export default router;
