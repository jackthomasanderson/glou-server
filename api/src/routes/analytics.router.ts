import { Router, Request, Response } from 'express';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { getAnalytics } from '../services/analytics.service';
import { auditLog } from '../services/audit.service';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const fromStr = req.query.from as string | undefined;
    const toStr = req.query.to as string | undefined;
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = toStr ? new Date(toStr) : undefined;
    if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) {
      res.status(400).json({ error: 'INVALID_DATE_RANGE' });
      return;
    }
    const stats = await getAnalytics(from, to);
    void auditLog({ userId: req.userId, action: 'LIST', status: 'success', ip, details: { scope: 'analytics' } });
    res.json({ data: stats });
  } catch (error) {
    void auditLog({ userId: req.userId, action: 'LIST', status: 'error', ip, details: { scope: 'analytics', message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

export { router as analyticsRouter };
