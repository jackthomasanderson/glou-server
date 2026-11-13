import { Router, Request, Response } from 'express';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { routeParam } from '../lib/http';
import { getAlerts, toggleAlertPause } from '../services/alert.service';
import { auditLog } from '../services/audit.service';
import { notFound } from '../lib/errors';

const router = Router();

router.use(authMiddleware);

// ─── GET /api/alerts ──────────────────────────────────────────────────────────

// ISSUE_087: a plain read used to write an audit-log row on every request —
// no traceability value for "someone listed the alerts".
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const alerts = await getAlerts();
  res.json({ data: alerts });
});

// ─── PATCH /api/alerts/:id/pause ─────────────────────────────────────────────

router.patch('/:id/pause', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const success = await toggleAlertPause(id);
  if (!success) throw notFound('BOTTLE_NOT_FOUND');
  void auditLog({ userId: req.userId, action: 'UPDATE', status: 'success', ip: getClientIp(req), bottleId: id, details: { scope: 'alert-pause' } });
  res.json({ data: { ok: true } });
});

export { router as alertsRouter };
