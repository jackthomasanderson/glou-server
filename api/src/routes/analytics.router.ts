import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getAnalytics } from '../services/analytics.service';
import { analyticsQuerySchema } from '../schemas/analytics.schema';

const router = Router();

router.use(authMiddleware);

// ISSUE_087: a plain read used to write an audit-log row on every request —
// no traceability value, and the stats page itself runs a group-by over
// that same table, which only made things slower.
router.get('/', async (req: Request, res: Response): Promise<void> => {
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
    res.json({ data: stats });
  } catch (error) {
    console.error('[analytics] GET / error:', error);
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

export { router as analyticsRouter };
