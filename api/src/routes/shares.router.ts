import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { auditLog } from '../services/audit.service';
import { routeParam } from '../lib/http';
import { sharesService } from '../services/shares.service';
import { shareCreateSchema } from '../schemas/shares.schema';
import { authService } from '../services/auth.service';
import { passwordCheckLimiter } from '../lib/rate-limit';

const router = Router();
router.use(authMiddleware);

// ─── POST /api/shares ───────────────────────────────────────────────────────
// Create a new guest share link

// #911: a link with write access keeps working after the session is revoked,
// so a stolen session alone must not open one: it asks for the password, with
// the per-account limit of the other password checks. Read-only stays one click.
// The limiter only fronts read/write links: a spent password budget must not
// block a read-only link, which asks for nothing.
function writeLinkLimiter(req: Request, res: Response, next: NextFunction): void {
  const writeCellarIds = (req.body as { writeCellarIds?: unknown } | undefined)?.writeCellarIds;
  if (!Array.isArray(writeCellarIds) || writeCellarIds.length === 0) { next(); return; }
  const run = (i: number): void => {
    if (i === passwordCheckLimiter.length) { next(); return; }
    void passwordCheckLimiter[i](req, res, (err?: unknown) => (err ? next(err) : run(i + 1)));
  };
  run(0);
}

router.post('/', writeLinkLimiter, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const validation = shareCreateSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
    return;
  }
  const { password, ...input } = validation.data;
  try {
    if (input.writeCellarIds.length > 0) await authService.confirmPassword(userId, password);
  } catch (error) {
    if (error instanceof Error && error.message === 'REAUTH_REQUIRED') {
      res.status(403).json({ error: 'REAUTH_REQUIRED' });
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_CREDENTIALS') {
      res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      return;
    }
    throw error;
  }
  try {
    const share = await sharesService.create(userId, input);
    // #601: a link opens part of the cellar to whoever holds it, so its
    // creation is a security event. What it opens, never its token.
    void auditLog({
      userId,
      action: 'SHARE_CREATE',
      status: 'success',
      ip: getClientIp(req),
      details: {
        shareId: share.id,
        cellarIds: share.cellarIds,
        writeCellarIds: share.writeCellarIds,
        collectionIds: share.collectionIds,
        expiresAt: share.expiresAt,
      },
    });
    res.status(201).json({ data: share });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_CELLAR_IDS') {
      res.status(400).json({ error: 'INVALID_CELLAR_IDS' });
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_COLLECTION_IDS') {
      res.status(400).json({ error: 'INVALID_COLLECTION_IDS' });
      return;
    }
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
  const id = routeParam(req.params.id);
  try {
    const share = await sharesService.revoke(id, userId);
    if (!share) {
      res.status(404).json({ error: 'SHARE_NOT_FOUND' });
      return;
    }
    void auditLog({ userId, action: 'SHARE_REVOKE', status: 'success', ip: getClientIp(req), details: { shareId: share.id } });
    res.json({ data: share });
  } catch (error) {
    console.error('[shares] revoke error:', error);
    res.status(500).json({ error: 'FAILED_TO_REVOKE_SHARE' });
  }
});

export default router;
