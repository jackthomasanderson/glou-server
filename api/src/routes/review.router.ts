import { Router, Request, Response } from 'express';
import { distinctionsSchema, mergeSchema } from '../schemas/review.schema';
import { reviewService } from '../services/review.service';
import { productService } from '../services/product.service';
import { auditLog } from '../services/audit.service';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { routeParam } from '../lib/http';
import { notFound } from '../lib/errors';
import type { MergeResult } from '../../../shared/review';

/**
 * #471 (FEAT-102): "À vérifier après la mise à jour" — the families of one
 * wine left apart and the numbers guessed by the transformation. Mounted
 * under /api before /api/products (whose `/:id` would catch `/review`), with
 * the authentication on each route. A guest share never reaches it. Errors,
 * validation included, bubble to the global error middleware.
 */
const router = Router();

// GET /api/products/review — what is left to review, for every member (c1, c4, c5).
router.get('/products/review', authMiddleware, async (_req: Request, res: Response): Promise<void> => {
  res.json({ data: await reviewService.list() });
});

// POST /api/products/merge — "Regrouper", field by field (c2).
router.post('/products/merge', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const input = mergeSchema.parse(req.body);
  const outcome = await reviewService.merge(req.userId, input);
  void auditLog({
    userId: req.userId, action: 'MERGE_PRODUCTS', status: 'success', ip: getClientIp(req), productId: outcome.productId,
    details: { mergedProductIds: outcome.removedProductIds, fusedItemIds: outcome.removedItemIds, changes: outcome.changes },
  });
  const product = await productService.view(outcome.productId);
  if (!product) throw notFound('PRODUCT_NOT_FOUND');
  const body: MergeResult = { data: product, removedProductIds: outcome.removedProductIds, removedItemIds: outcome.removedItemIds };
  res.json(body);
});

// POST /api/products/distinctions — "Garder séparées" / "C'est un autre vin" (c3).
router.post('/products/distinctions', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const input = distinctionsSchema.parse(req.body);
  const pairs = await reviewService.distinguish(input);
  void auditLog({
    userId: req.userId, action: 'DISTINGUISH_PRODUCTS', status: 'success', ip: getClientIp(req),
    details: { productIds: input.productIds },
  });
  res.status(201).json({ data: { pairs } });
});

// POST /api/inventory/:id/review-ok — "C'est bon" on a guessed number (c4).
router.post('/inventory/:id/review-ok', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const outcome = await reviewService.confirmCount(req.userId, id);
  if (!outcome) throw notFound('ITEM_NOT_FOUND');
  if (outcome.changed) {
    void auditLog({
      userId: req.userId, action: 'REVIEW_OK', status: 'success', ip: getClientIp(req), bottleId: id, productId: outcome.item.productId,
      details: { changes: [{ field: 'needsReview', from: true, to: false }] },
    });
  }
  res.json({ data: outcome.item });
});

export { router as reviewRouter };
