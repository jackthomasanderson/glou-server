import { Router, Request, Response } from 'express';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { routeParam } from '../lib/http';
import { getAlerts, toggleAlertPause } from '../services/alert.service';
import { auditLog } from '../services/audit.service';

const router = Router();

router.use(authMiddleware);

// ─── GET /api/alerts ──────────────────────────────────────────────────────────

// ISSUE_087: a plain read used to write an audit-log row on every request —
// no traceability value for "someone listed the alerts".
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const alerts = await getAlerts();
    res.json({ data: alerts });
  } catch (error) {
    console.error('[alerts] GET / error:', error);
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── PATCH /api/alerts/:id/pause ─────────────────────────────────────────────

router.patch('/:id/pause', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const ip = getClientIp(req);
  try {
    const success = await toggleAlertPause(id);
    if (!success) {
      res.status(404).json({ error: 'BOTTLE_NOT_FOUND' });
      return;
    }
    void auditLog({ userId: req.userId, action: 'UPDATE', status: 'success', ip, bottleId: id, details: { scope: 'alert-pause' } });
    res.json({ data: { ok: true } });
  } catch (error) {
    console.error('[alerts] PATCH /:id/pause error:', error);
    void auditLog({ userId: req.userId, action: 'UPDATE', status: 'error', ip, bottleId: id, details: { message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

export { router as alertsRouter };
