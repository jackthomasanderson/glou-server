import { Router, Request, Response } from 'express';
import { collectionsService } from '../services/collections.service';
import {
  collectionCreateSchema,
  collectionPatchSchema,
  collectionItemsSchema,
} from '../schemas/collections.schema';
import { authMiddleware } from '../middleware/auth.middleware';
import { auditLog } from '../services/audit.service';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req: Request, res: Response) => {
  const userId = req.userId!;
  try {
    const collections = await collectionsService.list(userId);
    res.json({ data: collections });
  } catch {
    res.status(500).json({ error: 'FAILED_TO_FETCH_COLLECTIONS' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const validation = collectionCreateSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
  }
  try {
    const collection = await collectionsService.create(userId, validation.data);
    void auditLog({ userId, ip: req.ip || '0.0.0.0', action: 'COLLECTION_CREATE', status: 'success', details: { id: collection.id } });
    res.status(201).json({ data: collection });
  } catch {
    res.status(500).json({ error: 'FAILED_TO_CREATE_COLLECTION' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;
  const validation = collectionPatchSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
  }
  try {
    const collection = await collectionsService.update(id, userId, validation.data);
    if (!collection) return res.status(404).json({ error: 'COLLECTION_NOT_FOUND' });
    void auditLog({ userId, ip: req.ip || '0.0.0.0', action: 'COLLECTION_UPDATE', status: 'success', details: { id } });
    res.json({ data: collection });
  } catch {
    res.status(500).json({ error: 'FAILED_TO_UPDATE_COLLECTION' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;
  try {
    const deleted = await collectionsService.delete(id, userId);
    if (!deleted) return res.status(404).json({ error: 'COLLECTION_NOT_FOUND' });
    void auditLog({ userId, ip: req.ip || '0.0.0.0', action: 'COLLECTION_DELETE', status: 'success', details: { id } });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'FAILED_TO_DELETE_COLLECTION' });
  }
});

router.post('/:id/items', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;
  const validation = collectionItemsSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
  }
  try {
    const collection = await collectionsService.addItems(id, userId, validation.data.itemIds);
    if (!collection) return res.status(404).json({ error: 'COLLECTION_NOT_FOUND' });
    res.json({ data: collection });
  } catch {
    res.status(500).json({ error: 'FAILED_TO_ADD_ITEMS' });
  }
});

router.delete('/:id/items/:itemId', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { id, itemId } = req.params;
  try {
    const collection = await collectionsService.removeItem(id, userId, itemId);
    if (!collection) return res.status(404).json({ error: 'COLLECTION_NOT_FOUND' });
    res.json({ data: collection });
  } catch {
    res.status(500).json({ error: 'FAILED_TO_REMOVE_ITEM' });
  }
});

export default router;
