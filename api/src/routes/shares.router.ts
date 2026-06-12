import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { sharesService } from '../services/shares.service';
import { shareCreateSchema } from '../schemas/shares.schema';

const router = Router();
router.use(authMiddleware);

// ─── POST /api/shares ───────────────────────────────────────────────────────
// Create a new guest share link

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const validation = shareCreateSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
    return;
  }
  try {
    const share = await sharesService.create(userId, validation.data);
    res.status(201).json({ data: share });
  } catch (error) {
    console.error('[shares] create error:', error);
    res.status(500).json({ error: 'FAILED_TO_CREATE_SHARE' });
  }
});

// ─── GET /api/shares ────────────────────────────────────────────────────────
// List all shares for the authenticated user (active, expired, revoked)

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  try {
    const shares = await sharesService.listByUser(userId);
    res.json({ data: shares });
  } catch (error) {
    console.error('[shares] list error:', error);
    res.status(500).json({ error: 'FAILED_TO_FETCH_SHARES' });
  }
});

// ─── DELETE /api/shares/:id ─────────────────────────────────────────────────
// Revoke a share (soft-revoke via revokedAt)

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { id } = req.params;
  try {
    const share = await sharesService.revoke(id, userId);
    if (!share) {
      res.status(404).json({ error: 'SHARE_NOT_FOUND' });
      return;
    }
    res.json({ data: share });
  } catch (error) {
    console.error('[shares] revoke error:', error);
    res.status(500).json({ error: 'FAILED_TO_REVOKE_SHARE' });
  }
});

export default router;
