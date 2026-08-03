import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import QRCode from 'qrcode';
import { inventoryInputSchema, inventoryPatchSchema, rollbackFieldSchema } from '../schemas/inventory.schema';
import { scanJobIdHintSchema } from '../schemas/scan.schema';
import { inventoryService } from '../services/inventory.service';
import { scanService } from '../services/scan.service';
import { auditLog } from '../services/audit.service';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { systemConfigService } from '../services/system-config.service';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ─── GET /api/inventory ──────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const items = await inventoryService.listInventory(req.userId);
    void auditLog({ userId: req.userId, action: 'LIST', status: 'success', ip, details: { count: items.length } });
    res.json({ data: items });
  } catch (error) {
    void auditLog({ userId: req.userId, action: 'LIST', status: 'error', ip, details: { message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── GET /api/inventory/trash ────────────────────────────────────────────────

router.get('/trash', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const items = await inventoryService.listTrash(req.userId);
    void auditLog({ userId: req.userId, action: 'LIST', status: 'success', ip, details: { scope: 'trash', count: items.length } });
    res.json({ data: items });
  } catch (error) {
    void auditLog({ userId: req.userId, action: 'LIST', status: 'error', ip, details: { scope: 'trash', message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── GET /api/inventory/:id/qr ──────────────────────────────────────────────

router.get('/:id/qr', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    // Verify the item belongs to this user before issuing a QR
    const result = await inventoryService.getItemWithTraceability(req.userId, id);
    if (!result) {
      res.status(404).json({ error: 'ITEM_NOT_FOUND' });
      return;
    }

    const appUrl = await systemConfigService.getEffectivePublicUrl();
    const targetUrl = `${appUrl}/bottles?scan=${id}`;

    const pngBuffer = await QRCode.toBuffer(targetUrl, {
      type: 'png',
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'M',
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="qr-${id}.png"`);
    res.send(pngBuffer);
  } catch (error) {
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── GET /api/inventory/:id ──────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const ip = getClientIp(req);
  try {
    const result = await inventoryService.getItemWithTraceability(req.userId, id);
    if (!result) {
      void auditLog({ userId: req.userId, action: 'READ', status: 'not_found', ip, bottleId: id });
      res.status(404).json({ error: 'ITEM_NOT_FOUND' });
      return;
    }
    void auditLog({ userId: req.userId, action: 'READ', status: 'success', ip, bottleId: id });
    res.json({ data: { ...result.item, _creator: result.creator, _lastEditor: result.lastEditor } });
  } catch (error) {
    void auditLog({ userId: req.userId, action: 'READ', status: 'error', ip, bottleId: id, details: { message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── GET /api/inventory/:id/history ─────────────────────────────────────────

router.get('/:id/history', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const ip = getClientIp(req);
  try {
    const item = await inventoryService.getItem(req.userId, id);
    if (!item) {
      res.status(404).json({ error: 'ITEM_NOT_FOUND' });
      return;
    }
    const history = await inventoryService.getItemHistory(id);
    void auditLog({ userId: req.userId, action: 'READ', status: 'success', ip, bottleId: id, details: { scope: 'history' } });
    res.json({ data: history });
  } catch (error) {
    void auditLog({ userId: req.userId, action: 'READ', status: 'error', ip, bottleId: id, details: { message: String(error), scope: 'history' } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── POST /api/inventory/bulk ────────────────────────────────────────────────

router.post('/bulk', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const { ids, patch } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: 'ids array is required' });
      return;
    }
    const validatedPatch = inventoryPatchSchema.parse(patch);
    const count = await inventoryService.bulkUpdate(req.userId, ids as string[], validatedPatch);
    void auditLog({ userId: req.userId, action: 'UPDATE', status: 'success', ip, details: { count, bulk: true } });
    res.json({ data: { updatedCount: count } });
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      void auditLog({ userId: req.userId, action: 'UPDATE', status: 'validation_error', ip, details: { issues, bulk: true } });
      res.status(400).json({ error: 'VALIDATION_ERROR', details: issues });
      return;
    }
    void auditLog({ userId: req.userId, action: 'UPDATE', status: 'error', ip, details: { message: String(error), bulk: true } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
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

    const item = await inventoryService.createItem(req.userId, data, undefined, fieldSources);
    void auditLog({ userId: req.userId, action: 'CREATE', status: 'success', ip, bottleId: item.id, details: { category: data.category } });
    res.status(201).json({ data: item });
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      void auditLog({ userId: req.userId, action: 'CREATE', status: 'validation_error', ip, details: { issues } });
      res.status(400).json({ error: 'VALIDATION_ERROR', details: issues });
      return;
    }
    void auditLog({ userId: req.userId, action: 'CREATE', status: 'error', ip, details: { message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── PATCH /api/inventory/:id ────────────────────────────────────────────────

router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
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
      // FEAT-16/23: the offline sync queue sent `expectedUpdatedAt` and it no
      // longer matches — someone else modified this item in the meantime.
      // Return the current server state so the client can offer conflict
      // resolution instead of silently overwriting it.
      void auditLog({ userId: req.userId, action: 'UPDATE', status: 'error', ip, bottleId: id, details: { reason: 'CONFLICT' } });
      res.status(409).json({ error: 'CONFLICT', data: result.serverItem });
      return;
    }
    if (result.slotConflict) {
      void auditLog({ userId: req.userId, action: 'UPDATE', status: 'error', ip, bottleId: id, details: { reason: 'SLOT_OCCUPIED' } });
      res.status(409).json({ error: 'SLOT_OCCUPIED' });
      return;
    }
    void auditLog({ userId: req.userId, action: 'UPDATE', status: 'success', ip, bottleId: id, details: { changes: result.changes } });
    res.json({ data: result.item });
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      void auditLog({ userId: req.userId, action: 'UPDATE', status: 'validation_error', ip, bottleId: id, details: { issues } });
      res.status(400).json({ error: 'VALIDATION_ERROR', details: issues });
      return;
    }
    void auditLog({ userId: req.userId, action: 'UPDATE', status: 'error', ip, bottleId: id, details: { message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── DELETE /api/inventory/:id ───────────────────────────────────────────────

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const ip = getClientIp(req);
  try {
    const item = await inventoryService.softDelete(req.userId, id);
    if (!item) {
      void auditLog({ userId: req.userId, action: 'DELETE', status: 'not_found', ip, bottleId: id });
      res.status(404).json({ error: 'ITEM_NOT_FOUND' });
      return;
    }
    const daysLeft = inventoryService.daysUntilPermanentDelete(item.deletedAt!);
    void auditLog({ userId: req.userId, action: 'DELETE', status: 'success', ip, bottleId: id, details: { daysLeft } });
    res.json({ data: item, meta: { daysUntilPermanentDelete: daysLeft } });
  } catch (error) {
    void auditLog({ userId: req.userId, action: 'DELETE', status: 'error', ip, bottleId: id, details: { message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── POST /api/inventory/:id/restore ────────────────────────────────────────

router.post('/:id/restore', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const ip = getClientIp(req);
  try {
    const item = await inventoryService.restore(req.userId, id);
    if (!item) {
      void auditLog({ userId: req.userId, action: 'RESTORE', status: 'not_found', ip, bottleId: id });
      res.status(404).json({ error: 'ITEM_NOT_FOUND_OR_EXPIRED' });
      return;
    }
    void auditLog({ userId: req.userId, action: 'RESTORE', status: 'success', ip, bottleId: id });
    res.json({ data: item });
  } catch (error) {
    void auditLog({ userId: req.userId, action: 'RESTORE', status: 'error', ip, bottleId: id, details: { message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── POST /api/inventory/:id/rollback ───────────────────────────────────────
// FEAT-05: restores a single field to a value found in the item's real
// change history. Logged under the dedicated RESTORE_FIELD action so the
// history UI can distinguish "value restored" from a regular edit.

router.post('/:id/rollback', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
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
    if (result.status === 'slot_conflict') {
      void auditLog({ userId: req.userId, action: 'RESTORE_FIELD', status: 'error', ip, bottleId: id, details: { field, reason: 'SLOT_OCCUPIED' } });
      res.status(409).json({ error: 'SLOT_OCCUPIED' });
      return;
    }

    void auditLog({ userId: req.userId, action: 'RESTORE_FIELD', status: 'success', ip, bottleId: id, details: { changes: result.changes } });
    res.json({ data: result.item });
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      void auditLog({ userId: req.userId, action: 'RESTORE_FIELD', status: 'validation_error', ip, bottleId: id, details: { issues } });
      res.status(400).json({ error: 'VALIDATION_ERROR', details: issues });
      return;
    }
    void auditLog({ userId: req.userId, action: 'RESTORE_FIELD', status: 'error', ip, bottleId: id, details: { message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

export { router as inventoryRouter };
