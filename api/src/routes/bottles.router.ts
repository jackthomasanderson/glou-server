import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { bottleInputSchema, bottlePatchSchema } from '../schemas/bottle.schema';
import { bottleService } from '../services/bottle.service';
import { auditLog } from '../services/audit.service';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ─── GET /api/bottles ────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const bottles = await bottleService.listBottles(req.userId);
    void auditLog({ userId: req.userId, action: 'LIST', status: 'success', ip, details: { count: bottles.length } });
    res.json({ data: bottles });
  } catch (error) {
    void auditLog({ userId: req.userId, action: 'LIST', status: 'error', ip, details: { message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── GET /api/bottles/trash ──────────────────────────────────────────────────

router.get('/trash', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const bottles = await bottleService.listTrash(req.userId);
    void auditLog({ userId: req.userId, action: 'LIST', status: 'success', ip, details: { scope: 'trash', count: bottles.length } });
    res.json({ data: bottles });
  } catch (error) {
    void auditLog({ userId: req.userId, action: 'LIST', status: 'error', ip, details: { scope: 'trash', message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── GET /api/bottles/:id ────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const ip = getClientIp(req);
  try {
    const result = await bottleService.getBottleWithTraceability(req.userId, id);
    if (!result) {
      void auditLog({ userId: req.userId, action: 'READ', status: 'not_found', ip, bottleId: id });
      res.status(404).json({ error: 'BOTTLE_NOT_FOUND' });
      return;
    }
    void auditLog({ userId: req.userId, action: 'READ', status: 'success', ip, bottleId: id });
    res.json({ data: { ...result.bottle, _creator: result.creator, _lastEditor: result.lastEditor } });
  } catch (error) {
    void auditLog({ userId: req.userId, action: 'READ', status: 'error', ip, bottleId: id, details: { message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── GET /api/bottles/:id/history ────────────────────────────────────────────

router.get('/:id/history', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const ip = getClientIp(req);
  try {
    const bottle = await bottleService.getBottle(req.userId, id);
    if (!bottle) {
      res.status(404).json({ error: 'BOTTLE_NOT_FOUND' });
      return;
    }
    const history = await bottleService.getBottleHistory(id);
    void auditLog({ userId: req.userId, action: 'READ', status: 'success', ip, bottleId: id, details: { scope: 'history' } });
    res.json({ data: history });
  } catch (error) {
    void auditLog({ userId: req.userId, action: 'READ', status: 'error', ip, bottleId: id, details: { message: String(error), scope: 'history' } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── POST /api/bottles/bulk ────────────────────────────────────────────────────

router.post('/bulk', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const { ids, patch } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: 'ids array is required' });
      return;
    }
    const validatedPatch = bottlePatchSchema.parse(patch);
    const count = await bottleService.bulkUpdate(req.userId, ids as string[], validatedPatch);
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

// ─── POST /api/bottles ───────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const data = bottleInputSchema.parse(req.body);
    const bottle = await bottleService.createBottle(req.userId, data);
    void auditLog({ userId: req.userId, action: 'CREATE', status: 'success', ip, bottleId: bottle.id, details: { category: data.category } });
    res.status(201).json({ data: bottle });
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

// ─── PATCH /api/bottles/:id ──────────────────────────────────────────────────

router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const ip = getClientIp(req);
  try {
    const patch = bottlePatchSchema.parse(req.body);
    const result = await bottleService.updateBottle(req.userId, id, patch);
    if (!result) {
      void auditLog({ userId: req.userId, action: 'UPDATE', status: 'not_found', ip, bottleId: id });
      res.status(404).json({ error: 'BOTTLE_NOT_FOUND' });
      return;
    }
    void auditLog({ userId: req.userId, action: 'UPDATE', status: 'success', ip, bottleId: id, details: { changes: result.changes } });
    res.json({ data: result.bottle });
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

// ─── DELETE /api/bottles/:id ─────────────────────────────────────────────────

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const ip = getClientIp(req);
  try {
    const bottle = await bottleService.softDelete(req.userId, id);
    if (!bottle) {
      void auditLog({ userId: req.userId, action: 'DELETE', status: 'not_found', ip, bottleId: id });
      res.status(404).json({ error: 'BOTTLE_NOT_FOUND' });
      return;
    }
    const daysLeft = bottleService.daysUntilPermanentDelete(bottle.deletedAt!);
    void auditLog({ userId: req.userId, action: 'DELETE', status: 'success', ip, bottleId: id, details: { daysLeft } });
    res.json({ data: bottle, meta: { daysUntilPermanentDelete: daysLeft } });
  } catch (error) {
    void auditLog({ userId: req.userId, action: 'DELETE', status: 'error', ip, bottleId: id, details: { message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── POST /api/bottles/:id/restore ───────────────────────────────────────────

router.post('/:id/restore', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const ip = getClientIp(req);
  try {
    const bottle = await bottleService.restore(req.userId, id);
    if (!bottle) {
      void auditLog({ userId: req.userId, action: 'RESTORE', status: 'not_found', ip, bottleId: id });
      res.status(404).json({ error: 'BOTTLE_NOT_FOUND_OR_EXPIRED' });
      return;
    }
    void auditLog({ userId: req.userId, action: 'RESTORE', status: 'success', ip, bottleId: id });
    res.json({ data: bottle });
  } catch (error) {
    void auditLog({ userId: req.userId, action: 'RESTORE', status: 'error', ip, bottleId: id, details: { message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

export { router as bottlesRouter };
