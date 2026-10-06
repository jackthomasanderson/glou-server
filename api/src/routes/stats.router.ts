import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { statsService } from '../services/stats.service';

const router = Router();

router.use(authMiddleware);

/**
 * GET /api/stats/counts
 * The numbers shown on the sidebar badges, as COUNT queries (#212).
 */
router.get('/counts', async (req: Request, res: Response): Promise<void> => {
  res.json({ data: await statsService.getSidebarCounts(req.userId!) });
});

export default router;
