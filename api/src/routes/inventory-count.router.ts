import { Router, Request, Response } from 'express';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { routeParam } from '../lib/http';
import { AppError, conflict, notFound } from '../lib/errors';
import { auditLog } from '../services/audit.service';
import {
  getActiveSession,
  startSession,
  pauseSession,
  resumeSession,
  recordScan,
  recordUnlistedFind,
  getSessionReport,
  completeSession,
} from '../services/inventory-count.service';
import {
  startSessionSchema,
  scanSchema,
  completeSessionSchema,
  recordFoundItemSchema,
} from '../schemas/inventory-count.schema';

const router = Router();

router.use(authMiddleware);

// #467: the error middleware answers every failure: a ZodError is a 400
// VALIDATION_ERROR, an AppError its own status, a database outage a 503.
// Business outcomes (not found, wrong state) stay mapped here.

// ─── GET /api/inventory-count/sessions/active ────────────────────────────────
// Shared, non-userId-filtered — see inventory-count.service.ts header
// (single active/paused session instance-wide).
// #635: a read is not audited (#160) — the log keeps sign-ins and changes only.

router.get('/sessions/active', async (_req: Request, res: Response): Promise<void> => {
  const session = await getActiveSession();
  res.json({ data: session });
});

// ─── POST /api/inventory-count/sessions ──────────────────────────────────────

router.post('/sessions', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  const input = startSessionSchema.parse(req.body ?? {});
  const result = await startSession(req.userId, input);

  if (result.status === 'cellar_not_found') throw notFound('CELLAR_NOT_FOUND');
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
});

// ─── PATCH /api/inventory-count/sessions/:id/pause ───────────────────────────

router.patch('/sessions/:id/pause', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const ip = getClientIp(req);
  const result = await pauseSession(id);
  if (result.status === 'not_found') throw notFound('SESSION_NOT_FOUND');
  if (result.status === 'invalid_state') throw conflict('SESSION_NOT_ACTIVE');
  void auditLog({
    userId: req.userId,
    action: 'UPDATE',
    status: 'success',
    ip,
    details: { scope: 'inventory-count-pause', sessionId: id },
  });
  res.json({ data: result.session });
});

// ─── PATCH /api/inventory-count/sessions/:id/resume ──────────────────────────

router.patch('/sessions/:id/resume', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const ip = getClientIp(req);
  const result = await resumeSession(id);
  if (result.status === 'not_found') throw notFound('SESSION_NOT_FOUND');
  if (result.status === 'invalid_state') throw conflict('SESSION_NOT_PAUSED');
  void auditLog({
    userId: req.userId,
    action: 'UPDATE',
    status: 'success',
    ip,
    details: { scope: 'inventory-count-resume', sessionId: id },
  });
  res.json({ data: result.session });
});

// ─── POST /api/inventory-count/sessions/:id/scan ─────────────────────────────

router.post('/sessions/:id/scan', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const ip = getClientIp(req);
  const { itemId, foundQuantity } = scanSchema.parse(req.body ?? {});
  const result = await recordScan(id, itemId, foundQuantity);

  if (result.status === 'session_not_found') throw notFound('SESSION_NOT_FOUND');
  if (result.status === 'session_not_active') throw conflict('SESSION_NOT_ACTIVE');
  if (result.status === 'item_not_found') throw notFound('ITEM_NOT_FOUND');

  void auditLog({
    userId: req.userId,
    action: 'UPDATE',
    status: 'success',
    ip,
    bottleId: itemId,
    details: { scope: 'inventory-count-scan', sessionId: id, entryStatus: result.entry.entryStatus, foundQuantity: foundQuantity ?? null },
  });
  res.json({ data: result.entry });
});

// ─── POST /api/inventory-count/sessions/:id/found ────────────────────────────
// Records a physical find with no match in the system yet — the "ajouter au
// stock" corrective action (FEAT-12 gap-fix). Confirmed into a real
// InventoryItem only later, at closure (see /complete below).

router.post('/sessions/:id/found', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const ip = getClientIp(req);
  const input = recordFoundItemSchema.parse(req.body ?? {});
  const result = await recordUnlistedFind(id, input);

  if (result.status === 'session_not_found') throw notFound('SESSION_NOT_FOUND');
  if (result.status === 'session_not_active') throw conflict('SESSION_NOT_ACTIVE');

  void auditLog({
    userId: req.userId,
    action: 'UPDATE',
    status: 'success',
    ip,
    details: { scope: 'inventory-count-found', sessionId: id, entryId: result.entryId },
  });
  res.status(201).json({ data: result });
});

// ─── GET /api/inventory-count/sessions/:id/report ────────────────────────────

router.get('/sessions/:id/report', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const report = await getSessionReport(id);
  if (!report) throw notFound('SESSION_NOT_FOUND');
  res.json({ data: report });
});

// ─── POST /api/inventory-count/sessions/:id/complete ─────────────────────────

router.post('/sessions/:id/complete', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
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
    // #471 (FEAT-100): each group's history — its number before and after
    // the correction (−k drunk or corrected, +k found), each finished copy.
    for (const entry of result.history) {
      void auditLog({ userId: req.userId, action: entry.action, status: 'success', ip, bottleId: entry.itemId, productId: entry.productId, details: entry.details });
    }
    const { history: _history, ...data } = result;
    res.json({ data });
  } catch (error) {
    if (error instanceof AppError) {
      // #471: a correction the stock rules refuse (QUANTITY_TOO_LARGE,
      // PRODUCT_IN_TRASH…) — nothing was applied, the session stays open.
      void auditLog({ userId: req.userId, action: 'UPDATE', status: 'error', ip, details: { scope: 'inventory-count-complete', sessionId: id, reason: error.code } });
    }
    throw error;
  }
});

export { router as inventoryCountRouter };
