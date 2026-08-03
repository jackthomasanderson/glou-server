import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { auditLog } from '../services/audit.service';
import {
  getActiveSession,
  startSession,
  pauseSession,
  resumeSession,
  recordScan,
  getSessionReport,
  completeSession,
} from '../services/inventory-count.service';
import { startSessionSchema, scanSchema, completeSessionSchema } from '../schemas/inventory-count.schema';

const router = Router();

router.use(authMiddleware);

// ─── GET /api/inventory-count/sessions/active ────────────────────────────────
// Shared, non-userId-filtered — see inventory-count.service.ts header
// (single active/paused session instance-wide).

router.get('/sessions/active', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const session = await getActiveSession();
    void auditLog({
      userId: req.userId,
      action: 'LIST',
      status: 'success',
      ip,
      details: { scope: 'inventory-count-active', found: !!session },
    });
    res.json({ data: session });
  } catch (error) {
    void auditLog({
      userId: req.userId,
      action: 'LIST',
      status: 'error',
      ip,
      details: { scope: 'inventory-count-active', message: String(error) },
    });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── POST /api/inventory-count/sessions ──────────────────────────────────────

router.post('/sessions', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const input = startSessionSchema.parse(req.body ?? {});
    const result = await startSession(req.userId, input);

    if (result.status === 'cellar_not_found') {
      res.status(404).json({ error: 'CELLAR_NOT_FOUND' });
      return;
    }
    if (result.status === 'conflict') {
      void auditLog({
        userId: req.userId,
        action: 'CREATE',
        status: 'error',
        ip,
        details: { scope: 'inventory-count-session', reason: 'conflict', existingSessionId: result.session.id },
      });
      res.status(409).json({ error: 'SESSION_ALREADY_IN_PROGRESS', data: result.session });
      return;
    }

    void auditLog({
      userId: req.userId,
      action: 'CREATE',
      status: 'success',
      ip,
      details: { scope: 'inventory-count-session', sessionId: result.session.id },
    });
    res.status(201).json({ data: result.session });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
      return;
    }
    void auditLog({
      userId: req.userId,
      action: 'CREATE',
      status: 'error',
      ip,
      details: { scope: 'inventory-count-session', message: String(error) },
    });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── PATCH /api/inventory-count/sessions/:id/pause ───────────────────────────

router.patch('/sessions/:id/pause', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const ip = getClientIp(req);
  try {
    const result = await pauseSession(id);
    if (result.status === 'not_found') {
      res.status(404).json({ error: 'SESSION_NOT_FOUND' });
      return;
    }
    if (result.status === 'invalid_state') {
      res.status(409).json({ error: 'SESSION_NOT_ACTIVE' });
      return;
    }
    void auditLog({
      userId: req.userId,
      action: 'UPDATE',
      status: 'success',
      ip,
      details: { scope: 'inventory-count-pause', sessionId: id },
    });
    res.json({ data: result.session });
  } catch (error) {
    void auditLog({
      userId: req.userId,
      action: 'UPDATE',
      status: 'error',
      ip,
      details: { scope: 'inventory-count-pause', sessionId: id, message: String(error) },
    });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── PATCH /api/inventory-count/sessions/:id/resume ──────────────────────────

router.patch('/sessions/:id/resume', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const ip = getClientIp(req);
  try {
    const result = await resumeSession(id);
    if (result.status === 'not_found') {
      res.status(404).json({ error: 'SESSION_NOT_FOUND' });
      return;
    }
    if (result.status === 'invalid_state') {
      res.status(409).json({ error: 'SESSION_NOT_PAUSED' });
      return;
    }
    void auditLog({
      userId: req.userId,
      action: 'UPDATE',
      status: 'success',
      ip,
      details: { scope: 'inventory-count-resume', sessionId: id },
    });
    res.json({ data: result.session });
  } catch (error) {
    void auditLog({
      userId: req.userId,
      action: 'UPDATE',
      status: 'error',
      ip,
      details: { scope: 'inventory-count-resume', sessionId: id, message: String(error) },
    });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── POST /api/inventory-count/sessions/:id/scan ─────────────────────────────

router.post('/sessions/:id/scan', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const ip = getClientIp(req);
  try {
    const { itemId } = scanSchema.parse(req.body ?? {});
    const result = await recordScan(id, itemId);

    if (result.status === 'session_not_found') {
      res.status(404).json({ error: 'SESSION_NOT_FOUND' });
      return;
    }
    if (result.status === 'session_not_active') {
      res.status(409).json({ error: 'SESSION_NOT_ACTIVE' });
      return;
    }
    if (result.status === 'item_not_found') {
      res.status(404).json({ error: 'ITEM_NOT_FOUND' });
      return;
    }

    void auditLog({
      userId: req.userId,
      action: 'UPDATE',
      status: 'success',
      ip,
      bottleId: itemId,
      details: { scope: 'inventory-count-scan', sessionId: id, entryStatus: result.entry.entryStatus },
    });
    res.json({ data: result.entry });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
      return;
    }
    void auditLog({
      userId: req.userId,
      action: 'UPDATE',
      status: 'error',
      ip,
      details: { scope: 'inventory-count-scan', sessionId: id, message: String(error) },
    });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── GET /api/inventory-count/sessions/:id/report ────────────────────────────

router.get('/sessions/:id/report', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const ip = getClientIp(req);
  try {
    const report = await getSessionReport(id);
    if (!report) {
      res.status(404).json({ error: 'SESSION_NOT_FOUND' });
      return;
    }
    void auditLog({
      userId: req.userId,
      action: 'LIST',
      status: 'success',
      ip,
      details: { scope: 'inventory-count-report', sessionId: id },
    });
    res.json({ data: report });
  } catch (error) {
    void auditLog({
      userId: req.userId,
      action: 'LIST',
      status: 'error',
      ip,
      details: { scope: 'inventory-count-report', sessionId: id, message: String(error) },
    });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── POST /api/inventory-count/sessions/:id/complete ─────────────────────────

router.post('/sessions/:id/complete', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const ip = getClientIp(req);
  try {
    const { corrections } = completeSessionSchema.parse(req.body ?? {});
    const result = await completeSession(id, corrections, req.userId);

    if (result.status === 'not_found') {
      res.status(404).json({ error: 'SESSION_NOT_FOUND' });
      return;
    }
    if (result.status === 'already_completed') {
      res.status(409).json({ error: 'SESSION_ALREADY_COMPLETED' });
      return;
    }

    void auditLog({
      userId: req.userId,
      action: 'UPDATE',
      status: 'success',
      ip,
      details: {
        scope: 'inventory-count-complete',
        sessionId: id,
        appliedCount: result.appliedCount,
        skippedCount: result.skipped.length,
      },
    });
    res.json({ data: result });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
      return;
    }
    void auditLog({
      userId: req.userId,
      action: 'UPDATE',
      status: 'error',
      ip,
      details: { scope: 'inventory-count-complete', sessionId: id, message: String(error) },
    });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

export { router as inventoryCountRouter };
