import { Router, Request, Response } from 'express';
import { collectionsService } from '../services/collections.service';
import {
  collectionCreateSchema,
  collectionPatchSchema,
  collectionItemsSchema,
  collectionProductsSchema,
} from '../schemas/collections.schema';
import { authMiddleware } from '../middleware/auth.middleware';
import { routeParam } from '../lib/http';
import { auditLog } from '../services/audit.service';

const router = Router();
router.use(authMiddleware);

// #476: collections are shared by the household; `userId` only records who
// created one or wrote the audit entry.
router.get('/', async (_req: Request, res: Response) => {
  const collections = await collectionsService.list();
  res.json({ data: collections });
});

router.post('/', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const validation = collectionCreateSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
  }
  const collection = await collectionsService.create(userId, validation.data);
  void auditLog({ userId, ip: req.ip || '0.0.0.0', action: 'COLLECTION_CREATE', status: 'success', details: { id: collection.id } });
  res.status(201).json({ data: collection });
});

router.patch('/:id', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const id = routeParam(req.params.id);
  const validation = collectionPatchSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
  }
  const collection = await collectionsService.update(id, validation.data);
  if (!collection) return res.status(404).json({ error: 'COLLECTION_NOT_FOUND' });
  void auditLog({ userId, ip: req.ip || '0.0.0.0', action: 'COLLECTION_UPDATE', status: 'success', details: { id } });
  res.json({ data: collection });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const id = routeParam(req.params.id);
  const deleted = await collectionsService.delete(id);
  if (!deleted) return res.status(404).json({ error: 'COLLECTION_NOT_FOUND' });
  void auditLog({ userId, ip: req.ip || '0.0.0.0', action: 'COLLECTION_DELETE', status: 'success', details: { id } });
  res.status(204).send();
});

router.post('/:id/items', async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const validation = collectionItemsSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
  }
  // #471: compatibility route — the families of these units join the collection.
  const collection = await collectionsService.addProducts(id, { itemIds: validation.data.itemIds });
  if (!collection) return res.status(404).json({ error: 'COLLECTION_NOT_FOUND' });
  res.json({ data: collection });
});

router.post('/:id/products', async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const validation = collectionProductsSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
  }
  const collection = await collectionsService.addProducts(id, { productIds: validation.data.productIds });
  if (!collection) return res.status(404).json({ error: 'COLLECTION_NOT_FOUND' });
  res.json({ data: collection });
});

router.delete('/:id/products/:productId', async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const productId = routeParam(req.params.productId);
  const collection = await collectionsService.removeProduct(id, productId);
  if (!collection) return res.status(404).json({ error: 'COLLECTION_NOT_FOUND' });
  res.json({ data: collection });
});

router.delete('/:id/items/:itemId', async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const itemId = routeParam(req.params.itemId);
  const collection = await collectionsService.removeItem(id, itemId);
  if (!collection) return res.status(404).json({ error: 'COLLECTION_NOT_FOUND' });
  res.json({ data: collection });
});

export default router;
