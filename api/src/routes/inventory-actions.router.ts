import { Router, Request, Response } from 'express';
import {
  addUnitsSchema, bulkDrinkSchema, bulkMoveSchema, bulkTrashSchema, correctQuantitySchema, moveUnitsSchema, repriceUnitsSchema,
} from '../schemas/stock.schema';
import { stockService } from '../services/stock.service';
import { stockSplitService, type SplitOutcome } from '../services/stock-split.service';
import { bulkStockService, type BulkOutcome } from '../services/bulk-stock.service';
import { inventoryService } from '../services/inventory.service';
import { auditLog } from '../services/audit.service';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { routeParam } from '../lib/http';
import { notFound } from '../lib/errors';

/**
 * #471 (FEAT-92/95/98/101): the stock actions that change a number of copies —
 * add bottles to a known wine, correct a group's number, move or reprice part
 * of a group. Mounted under /api
 * next to /api/inventory and /api/products, with the authentication on each
 * route (never on the whole /api prefix). Errors, validation included,
 * bubble to the global error middleware.
 */
const router = Router();

// POST /api/products/:id/items — "Ajouter des bouteilles": completes the identical group, or adds a line.
router.post('/products/:id/items', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const productId = routeParam(req.params.id);
  const input = addUnitsSchema.parse(req.body);
  const { result, merged, from, to } = await stockService.addUnits(req.userId, productId, input);
  void auditLog({
    userId: req.userId, action: 'ADD_UNITS', status: 'success', ip: getClientIp(req),
    bottleId: result.data.id, productId, details: { merged, changes: [{ field: 'quantity', from, to }] },
  });
  res.status(merged ? 200 : 201).json(result);
});

// POST /api/inventory/:id/correct — "Corriger le nombre" of a group, with its reason (point 34).
router.post('/inventory/:id/correct', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const ip = getClientIp(req);
  const input = correctQuantitySchema.parse(req.body);
  const outcome = await stockService.correctQuantity(req.userId, id, input);
  if (!outcome) throw notFound('ITEM_NOT_FOUND');
  if ('conflict' in outcome) {
    // FEAT-16/23: changed since the client (or its offline queue) read it —
    // the group as it is now goes back for the conflict dialog.
    void auditLog({ userId: req.userId, action: 'CORRECT_QUANTITY', status: 'error', ip, bottleId: id, productId: outcome.item.productId, details: { reason: 'CONFLICT' } });
    res.status(409).json({ error: 'CONFLICT', data: outcome.item });
    return;
  }
  void auditLog({
    userId: req.userId, action: 'CORRECT_QUANTITY', status: 'success', ip, bottleId: id, productId: outcome.productId,
    details: { reason: input.reason, changes: outcome.changes, writtenOffItemId: outcome.writtenOffItemId },
  });
  res.json(outcome.result);
});

/**
 * FEAT-98: answers a move or a new price of part of a group, and records it
 * on every group it changed (decision point 57: "prix de 2 bouteilles 20 € →
 * 25 €"), each entry with the number of copies and the cellar or price
 * before and after.
 */
function answerSplit(req: Request, res: Response, action: 'MOVE_UNITS' | 'REPRICE_UNITS', id: string, outcome: SplitOutcome | null): void {
  const ip = getClientIp(req);
  if (!outcome) throw notFound('ITEM_NOT_FOUND');
  if ('conflict' in outcome) {
    void auditLog({ userId: req.userId, action, status: 'error', ip, bottleId: id, productId: outcome.item.productId, details: { reason: 'CONFLICT' } });
    res.status(409).json({ error: 'CONFLICT', data: outcome.item });
    return;
  }
  for (const entry of outcome.entries) {
    const { itemId, ...details } = entry;
    void auditLog({
      userId: req.userId, action, status: 'success', ip, bottleId: itemId, productId: outcome.productId,
      details: { count: outcome.count, [outcome.change.field]: { from: outcome.change.from, to: outcome.change.to }, ...details },
    });
  }
  res.json(outcome.result);
}

// POST /api/inventory/:id/move — "Déplacer": part of a group, or all of it, to another cellar (point 12).
router.post('/inventory/:id/move', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const input = moveUnitsSchema.parse(req.body);
  answerSplit(req, res, 'MOVE_UNITS', id, await stockSplitService.moveUnits(req.userId, id, input));
});

// POST /api/inventory/:id/reprice — "Changer le prix": of part of a group, or of all of it (point 53).
router.post('/inventory/:id/reprice', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const input = repriceUnitsSchema.parse(req.body);
  answerSplit(req, res, 'REPRICE_UNITS', id, await stockSplitService.repriceUnits(req.userId, id, input));
});

/**
 * #471 (FEAT-111, D18): answers a bulk action on wines and records each unit
 * it changed in that unit's history, once the transaction went through.
 */
function answerBulk(req: Request, res: Response, outcome: BulkOutcome, meta?: Record<string, unknown>): void {
  const ip = getClientIp(req);
  for (const entry of outcome.entries) void auditLog({ userId: req.userId, status: 'success', ip, ...entry });
  res.json({ data: outcome.result, ...(meta ? { meta } : {}) });
}

// POST /api/products/bulk-move — "Déplacer" the wines selected: every bottle of them in the cellar (point 54).
router.post('/products/bulk-move', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  answerBulk(req, res, await bulkStockService.move(req.userId, bulkMoveSchema.parse(req.body)));
});

// POST /api/products/bulk-trash — "Mettre à la corbeille" every bottle in the cellar of the wines selected (point 54).
router.post('/products/bulk-trash', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { deletedAt, ...outcome } = await bulkStockService.trash(req.userId, bulkTrashSchema.parse(req.body));
  answerBulk(req, res, outcome, { daysUntilPermanentDelete: inventoryService.daysUntilPermanentDelete(deletedAt) });
});

// POST /api/products/bulk-drink — "Marquer comme bus": how many of each wine selected (point 42).
router.post('/products/bulk-drink', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  answerBulk(req, res, await bulkStockService.drink(req.userId, bulkDrinkSchema.parse(req.body)));
});

export { router as inventoryActionsRouter };
