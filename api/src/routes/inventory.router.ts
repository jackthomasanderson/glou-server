import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { inventoryInputSchema, inventoryPatchSchema, bulkUpdateSchema, rollbackFieldSchema, emptyTrashSchema } from '../schemas/inventory.schema';
import { scanJobIdHintSchema } from '../schemas/scan.schema';
import { distinctFromSchema } from '../schemas/product.schema';
import { inventoryService, type BulkEditEntry } from '../services/inventory.service';
import { inventoryExportService } from '../services/inventory-export.service';
import { scanService } from '../services/scan.service';
import { auditLog } from '../services/audit.service';
import { adminMiddleware, authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { idempotent } from '../middleware/idempotency.middleware';
import { logTrashDeletion } from '../lib/trash-audit';
import { routeParam } from '../lib/http';
import { AppError, notFound } from '../lib/errors';
import type { FieldChange, UnitWriteResult } from '../../../shared/product';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// #467: the error middleware answers every failure: an AppError its own
// status, a ZodError 400 VALIDATION_ERROR, a database outage 503. The catch
// blocks below only write the refusal to the audit log, then rethrow.

/** A refused body, as one line for the audit log (never sent to the client). */
function zodIssues(error: ZodError): string {
  return error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
}

// ─── GET /api/inventory ──────────────────────────────────────────────────────

// ISSUE_087: a plain read used to write an audit-log row on every request —
// the browser refetches the list at most every 30s, so a tab left open
// accumulated thousands of rows a week for an event with zero traceability
// value. Only actions that actually change data are logged now.
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const { items, truncated } = await inventoryService.listInventory();
  res.json({ data: items, truncated });
});

// ─── GET /api/inventory/export.csv ───────────────────────────────────────────
// #471 (FEAT-99): the cellar as a CSV the import reads back. Members only
// (authMiddleware above); guests never reach it. Read-only, so no audit row.

router.get('/export.csv', async (req: Request, res: Response): Promise<void> => {
  const lang = req.query.lang === 'fr' ? 'fr' : 'en';
  const { csv, rows } = await inventoryExportService.exportCsv(lang);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="glou-cellar-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  // The screen warns when the file is longer than one import takes.
  res.setHeader('X-Glou-Rows', String(rows));
  res.setHeader('Access-Control-Expose-Headers', 'X-Glou-Rows');
  res.send(csv);
});

// ─── GET /api/inventory/trash ────────────────────────────────────────────────

router.get('/trash', async (_req: Request, res: Response): Promise<void> => {
  const items = await inventoryService.listTrash();
  res.json({ data: items });
});

// ─── DELETE /api/inventory/trash/:id ─────────────────────────────────────────
// #962: one line of the trash, for good. Administrators only (owner decision);
// errors bubble to the error middleware.

router.delete('/trash/:id', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const deleted = await inventoryService.deleteTrashedItem(id);
  logTrashDeletion(req, 'item', deleted, deleted ? {} : { itemId: id });
  if (!deleted) throw notFound('ITEM_NOT_IN_TRASH');
  res.json({ data: { itemIds: deleted.itemIds, productIds: deleted.productIds } });
});

// ─── POST /api/inventory/trash/empty ─────────────────────────────────────────
// #962: everything in the trash of a page (its categories), for good. Administrators only.

router.post('/trash/empty', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { categories } = emptyTrashSchema.parse(req.body);
  const deleted = await inventoryService.emptyTrash(categories);
  logTrashDeletion(req, 'empty', deleted, { categories });
  res.json({ data: { itemIds: deleted.itemIds, productIds: deleted.productIds } });
});

// ─── GET /api/inventory/:id ──────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const result = await inventoryService.getItemWithTraceability(id);
  if (!result) throw notFound('ITEM_NOT_FOUND');
  res.json({ data: { ...result.item, _creator: result.creator, _lastEditor: result.lastEditor } });
});

// ─── GET /api/inventory/:id/history ─────────────────────────────────────────

router.get('/:id/history', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const item = await inventoryService.getItem(id);
  if (!item) throw notFound('ITEM_NOT_FOUND');
  const history = await inventoryService.getItemHistory(id);
  res.json({ data: history });
});

// ─── POST /api/inventory/bulk ────────────────────────────────────────────────

router.post('/bulk', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const { ids, patch: validatedPatch } = bulkUpdateSchema.parse(req.body);
    const history: BulkEditEntry[] = [];
    const count = await inventoryService.bulkUpdate(req.userId, ids, validatedPatch, history);
    void auditLog({ userId: req.userId, action: 'UPDATE', status: 'success', ip, details: { count, bulk: true } });
    // #588: each line changed, and each wine whose description changed, in its own history.
    for (const entry of history) void auditLog({ userId: req.userId, status: 'success', ip, ...entry });
    res.json({ data: { updatedCount: count } });
  } catch (error) {
    if (error instanceof AppError) {
      void auditLog({ userId: req.userId, action: 'UPDATE', status: 'error', ip, details: { reason: error.code, bulk: true } });
    } else if (error instanceof ZodError) {
      void auditLog({ userId: req.userId, action: 'UPDATE', status: 'validation_error', ip, details: { issues: zodIssues(error), bulk: true } });
    }
    throw error;
  }
});

// ─── POST /api/inventory ─────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const data = inventoryInputSchema.parse(req.body);

    // FEAT-04: optional hint that this creation originated from a completed
    // scan job — used only to tag the actually-extracted fields as 'ocr'
    // (FEAT-05 provenance). The client never supplies the field-source map
    // itself, only the job id, so it can't spoof provenance; see
    // scanService.computeOcrFieldSources.
    const scanJobIdResult = scanJobIdHintSchema.safeParse((req.body as Record<string, unknown>).scanJobId);
    const fieldSources = scanJobIdResult.success && scanJobIdResult.data
      ? await scanService.computeOcrFieldSources(req.userId, scanJobIdResult.data, data.category)
      : undefined;

    // #471 (FEAT-97): no duplicate refusal any more — "Vous avez déjà ce vin"
    // is asked while typing (GET /api/products/match). `distinctFrom` is the
    // answer "C'est un autre vin": the new wine is remembered apart from those.
    const distinctFrom = distinctFromSchema.optional().parse((req.body as Record<string, unknown>).distinctFrom) ?? [];

    const item = distinctFrom.length > 0
      ? await inventoryService.createApart(req.userId, data, distinctFrom, fieldSources)
      : await inventoryService.createItem(req.userId, data, undefined, fieldSources);
    const apart = distinctFrom.length > 0 ? { distinctFrom } : {};
    void auditLog({ userId: req.userId, action: 'CREATE', status: 'success', ip, bottleId: item.id, productId: item.productId, details: { category: data.category, ...apart } });
    res.status(201).json({ data: item });
  } catch (error) {
    if (error instanceof AppError) {
      // A creation the stock rules refuse (QUANTITY_TOO_LARGE…): nothing was created.
      void auditLog({ userId: req.userId, action: 'CREATE', status: 'error', ip, details: { reason: error.code } });
    } else if (error instanceof ZodError) {
      void auditLog({ userId: req.userId, action: 'CREATE', status: 'validation_error', ip, details: { issues: zodIssues(error) } });
    }
    throw error;
  }
});

// ─── PATCH /api/inventory/:id ────────────────────────────────────────────────

// #824: replayed by the offline queue with an Idempotency-Key.
router.patch('/:id', idempotent, async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const ip = getClientIp(req);
  try {
    const patch = inventoryPatchSchema.parse(req.body);
    const result = await inventoryService.updateItem(req.userId, id, patch);
    if (!result) {
      void auditLog({ userId: req.userId, action: 'UPDATE', status: 'not_found', ip, bottleId: id });
      res.status(404).json({ error: 'ITEM_NOT_FOUND' });
      return;
    }
    if ('conflict' in result) {
      // FEAT-16/23, #572: the offline sync queue or the edit form sent
      // `expectedUpdatedAt` and it no longer matches — someone else modified this item in the meantime.
      // Return the current server state so the client can offer conflict
      // resolution instead of silently overwriting it.
      void auditLog({ userId: req.userId, action: 'UPDATE', status: 'error', ip, bottleId: id, productId: result.serverItem.productId, details: { reason: 'CONFLICT' } });
      res.status(409).json({ error: 'CONFLICT', data: result.serverItem });
      return;
    }
    // #471 (D8): a detach or a reattach is logged on the unit that now
    // carries the state — the sub-record created, or the group that absorbed
    // the sub-record (which no longer exists).
    const outcome = result.outcome ? { outcome: result.outcome, targetItemId: id } : {};
    const deleted = result.deletedTastings ? { deletedTastings: result.deletedTastings } : {};
    // #471 (W3): an edited group that joined an identical one is gone — its
    // edit is told on the group that took its copies, as a number change
    // (never a field to restore there, the survivor's own values did not move).
    const details = result.joined
      ? { changes: [{ field: 'quantity', from: result.joined.from, to: result.joined.to }], joinedItemId: id, joinedChanges: result.changes }
      // Recette #847: told "1 cigare fumé" (the first of a box only opens it in its changes).
      : { changes: result.changes, ...outcome, ...deleted, ...(patch.smokeOne ? { smokeOne: true } : {}) };
    void auditLog({ userId: req.userId, action: 'UPDATE', status: 'success', ip, bottleId: result.item.id, productId: result.item.productId, details });
    // The group's own history: one copy fewer (detached) or one more (reattached).
    if (result.groupChange) {
      const { itemId, from, to, slotChanges = [] } = result.groupChange;
      void auditLog({ userId: req.userId, action: 'UPDATE', status: 'success', ip, bottleId: itemId, productId: result.item.productId, details: { changes: [{ field: 'quantity', from, to }, ...slotChanges], outcome: result.outcome, subItemId: result.outcome === 'detached' ? result.item.id : id } });
    }
    for (const unit of result.unitSlotChanges ?? []) {
      void auditLog({ userId: req.userId, action: 'UPDATE', status: 'success', ip, bottleId: unit.itemId, productId: result.item.productId, details: { changes: unit.changes } });
    }
    const response: UnitWriteResult<typeof result.item> = { data: result.item, changed: result.changed, removedIds: result.removedIds };
    res.json(response);
  } catch (error) {
    if (error instanceof AppError) {
      // #471: a write the detach / reattach rule refuses (TASTINGS_ON_ITEM, NOT_A_CIGAR…).
      void auditLog({ userId: req.userId, action: 'UPDATE', status: 'error', ip, bottleId: id, details: { reason: error.code } });
    } else if (error instanceof ZodError) {
      void auditLog({ userId: req.userId, action: 'UPDATE', status: 'validation_error', ip, bottleId: id, details: { issues: zodIssues(error) } });
    }
    throw error;
  }
});

// ─── DELETE /api/inventory/:id ───────────────────────────────────────────────

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const ip = getClientIp(req);
  const item = await inventoryService.softDelete(id, req.userId);
  if (!item) {
    void auditLog({ userId: req.userId, action: 'DELETE', status: 'not_found', ip, bottleId: id });
    res.status(404).json({ error: 'ITEM_NOT_FOUND' });
    return;
  }
  const daysLeft = inventoryService.daysUntilPermanentDelete(item.deletedAt!);
  void auditLog({ userId: req.userId, action: 'DELETE', status: 'success', ip, bottleId: id, productId: item.productId, details: { daysLeft } });
  res.json({ data: item, meta: { daysUntilPermanentDelete: daysLeft } });
});

// ─── POST /api/inventory/:id/restore ────────────────────────────────────────

router.post('/:id/restore', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const ip = getClientIp(req);
  const slotChanges: FieldChange[] = [];
  const item = await inventoryService.restore(id, req.userId, slotChanges);
  if (!item) {
    void auditLog({ userId: req.userId, action: 'RESTORE', status: 'not_found', ip, bottleId: id });
    res.status(404).json({ error: 'ITEM_NOT_FOUND_OR_EXPIRED' });
    return;
  }
  // FEAT-93: the cells it could not take back are told in its history.
  const details = slotChanges.length > 0 ? { details: { changes: slotChanges } } : {};
  void auditLog({ userId: req.userId, action: 'RESTORE', status: 'success', ip, bottleId: id, productId: item.productId, ...details });
  res.json({ data: item });
});

// ─── POST /api/inventory/:id/rollback ───────────────────────────────────────
// FEAT-05: restores a single field to a value found in the item's real
// change history. Logged under the dedicated RESTORE_FIELD action so the
// history UI can distinguish "value restored" from a regular edit.

router.post('/:id/rollback', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const ip = getClientIp(req);
  try {
    const { field, toValue } = rollbackFieldSchema.parse(req.body);
    const result = await inventoryService.rollbackField(req.userId, id, field, toValue);

    if (result.status === 'not_found') {
      void auditLog({ userId: req.userId, action: 'RESTORE_FIELD', status: 'not_found', ip, bottleId: id, details: { field } });
      res.status(404).json({ error: 'ITEM_NOT_FOUND' });
      return;
    }
    if (result.status === 'invalid_value') {
      void auditLog({ userId: req.userId, action: 'RESTORE_FIELD', status: 'validation_error', ip, bottleId: id, details: { field } });
      res.status(400).json({ error: 'VALUE_NOT_IN_HISTORY' });
      return;
    }

    // #471 (W3): restored identical to another group, the line joined it (see PATCH).
    void auditLog({
      userId: req.userId, action: 'RESTORE_FIELD', status: 'success', ip, bottleId: result.item.id, productId: result.item.productId,
      details: result.joined
        ? { changes: [{ field: 'quantity', from: result.joined.from, to: result.joined.to }], joinedItemId: id, joinedChanges: result.changes }
        : { changes: result.changes },
    });
    res.json({ data: result.item });
  } catch (error) {
    if (error instanceof AppError) {
      // #471: a restored state the detach / reattach rule refuses (409 TASTINGS_ON_ITEM, 400…).
      void auditLog({ userId: req.userId, action: 'RESTORE_FIELD', status: 'error', ip, bottleId: id, details: { reason: error.code } });
    } else if (error instanceof ZodError) {
      void auditLog({ userId: req.userId, action: 'RESTORE_FIELD', status: 'validation_error', ip, bottleId: id, details: { issues: zodIssues(error) } });
    }
    throw error;
  }
});

export { router as inventoryRouter };
