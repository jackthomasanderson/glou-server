import { Router, Request, Response } from 'express';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { getAlerts, toggleAlertPause } from '../services/alert.service';
import { auditLog } from '../services/audit.service';

const router = Router();

router.use(authMiddleware);

// ─── GET /api/alerts ──────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const alerts = await getAlerts();
    void auditLog({ userId: req.userId, action: 'LIST', status: 'success', ip, details: { scope: 'alerts', count: alerts.length } });
    res.json({ data: alerts });
  } catch (error) {
    void auditLog({ userId: req.userId, action: 'LIST', status: 'error', ip, details: { scope: 'alerts', message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── PATCH /api/alerts/:id/pause ─────────────────────────────────────────────

router.patch('/:id/pause', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
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
    void auditLog({ userId: req.userId, action: 'UPDATE', status: 'error', ip, bottleId: id, details: { message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

export { router as alertsRouter };
