import { Router, Request, Response } from 'express';
import { isWritableDescriptionField, productPatchSchema, productRollbackSchema } from '../schemas/product.schema';
import { productService } from '../services/product.service';
import { inventoryService } from '../services/inventory.service';
import { auditLog } from '../services/audit.service';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { routeParam } from '../lib/http';
import { badRequest, notFound } from '../lib/errors';

/**
 * #471 (FEAT-92/101, D9/D10): the families — one card per wine. The flat
 * /api/inventory* routes keep serving the readers not migrated yet. Errors
 * (validation included) bubble to the global error middleware.
 */
const router = Router();
router.use(authMiddleware);

// GET /api/products — families with their units in stock, wines known without bottle included.
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  res.json(await productService.list());
});

// GET /api/products/trash — families in the trash, with the units trashed together with them.
router.get('/trash', async (_req: Request, res: Response): Promise<void> => {
  res.json({ data: await productService.listTrash() });
});

// GET /api/products/:id — every unit out of the trash, the tastings and the history.
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const product = await productService.get(routeParam(req.params.id));
  if (!product) throw notFound('PRODUCT_NOT_FOUND');
  res.json({ data: product });
});

// PATCH /api/products/:id — the description, once for every bottle of the wine (FEAT-92 c4).
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const ip = getClientIp(req);
  const patch = productPatchSchema.parse(req.body);
  const result = await productService.updateDescription(req.userId, id, patch);
  if (!result) throw notFound('PRODUCT_NOT_FOUND');
  if ('conflict' in result) {
    // Someone changed the description since the client read it: the current
    // state goes back so the client can offer a resolution (FEAT-16/23).
    void auditLog({ userId: req.userId, action: 'UPDATE', status: 'error', ip, productId: id, details: { reason: 'CONFLICT' } });
    res.status(409).json({ error: 'CONFLICT', data: result.product });
    return;
  }
  void auditLog({ userId: req.userId, action: 'UPDATE', status: 'success', ip, productId: id, details: { changes: result.changes } });
  res.json({ data: result.product });
});

// POST /api/products/:id/rollback — FEAT-05: one description field back to a
// value of the wine's history, for every bottle of it. Logged under
// RESTORE_FIELD, like the restore of a bottle's field.
router.post('/:id/rollback', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const ip = getClientIp(req);
  const { field, toValue, expectedUpdatedAt } = productRollbackSchema.parse(req.body);
  if (!isWritableDescriptionField(field)) {
    // A field of the bottles is restored from the bottle's own change.
    void auditLog({ userId: req.userId, action: 'RESTORE_FIELD', status: 'validation_error', ip, productId: id, details: { field, reason: 'FIELD_NOT_RESTORABLE' } });
    throw badRequest('FIELD_NOT_RESTORABLE');
  }
  // The value as the description edit takes it: a date read back from the
  // history as a string becomes a date again (a ZodError answers 400).
  const patch = productPatchSchema.parse({ [field]: toValue });
  const result = await productService.rollbackField(req.userId, id, { field, toValue, patch }, expectedUpdatedAt);
  if (!result) throw notFound('PRODUCT_NOT_FOUND');
  if ('conflict' in result) {
    void auditLog({ userId: req.userId, action: 'RESTORE_FIELD', status: 'error', ip, productId: id, details: { field, reason: 'CONFLICT' } });
    res.status(409).json({ error: 'CONFLICT', data: result.product });
    return;
  }
  if (result.status === 'invalid_value') {
    void auditLog({ userId: req.userId, action: 'RESTORE_FIELD', status: 'validation_error', ip, productId: id, details: { field, reason: 'VALUE_NOT_IN_HISTORY' } });
    throw badRequest('VALUE_NOT_IN_HISTORY');
  }
  void auditLog({ userId: req.userId, action: 'RESTORE_FIELD', status: 'success', ip, productId: id, details: { changes: result.changes } });
  res.json({ data: result.product });
});

// DELETE /api/products/:id — the wine and all its bottles to the trash (D10).
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const trashed = await productService.trash(id);
  if (!trashed) throw notFound('PRODUCT_NOT_FOUND');
  const daysLeft = inventoryService.daysUntilPermanentDelete(trashed.deletedAt);
  void auditLog({ userId: req.userId, action: 'DELETE', status: 'success', ip: getClientIp(req), productId: id, details: { daysLeft, itemIds: trashed.itemIds } });
  res.json({ data: { id, ...trashed }, meta: { daysUntilPermanentDelete: daysLeft } });
});

// POST /api/products/:id/restore — the wine and the bottles trashed together with it.
router.post('/:id/restore', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const product = await productService.restore(id);
  if (!product) throw notFound('PRODUCT_NOT_FOUND_OR_EXPIRED');
  void auditLog({ userId: req.userId, action: 'RESTORE', status: 'success', ip: getClientIp(req), productId: id });
  res.json({ data: product });
});

export { router as productsRouter };
