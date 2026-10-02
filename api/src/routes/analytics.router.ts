import { Router, Request, Response } from 'express';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { getAnalytics } from '../services/analytics.service';
import { analyticsQuerySchema } from '../schemas/analytics.schema';
import { auditLog } from '../services/audit.service';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    // The range narrows the movement counters only; the response echoes its
    // scope back (see ANALYTICS_PERIOD_SCOPE in the analytics service).
    const parsed = analyticsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_DATE_RANGE' });
      return;
    }
    const { from, to } = parsed.data;
    const stats = await getAnalytics(from, to);
    void auditLog({ userId: req.userId, action: 'LIST', status: 'success', ip, details: { scope: 'analytics' } });
    res.json({ data: stats });
  } catch (error) {
    void auditLog({ userId: req.userId, action: 'LIST', status: 'error', ip, details: { scope: 'analytics', message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

export { router as analyticsRouter };
