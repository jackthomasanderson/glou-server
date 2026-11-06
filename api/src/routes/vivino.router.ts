import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { vivinoLookupQuerySchema } from '../schemas/vivino.schema';
import { isVivinoEnabled, vivinoService } from '../services/vivino.service';
import { VIVINO_ERROR_CODES, type VivinoLookupResult, type VivinoStatus } from '../../../shared/vivino';

const router = Router();

router.use(authMiddleware);

// Each lookup sends up to six spaced-out requests to vivino.com. Throttled per
// member (the household shares one IP), like the label scan, so one client
// cannot get the whole instance blocked by Vivino.
const lookupLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.userId || getClientIp(req),
  message: { error: VIVINO_ERROR_CODES.rateLimited },
});

/** Refuses before the quota counts the request, when the instance has not opted in. */
function requireVivinoEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (isVivinoEnabled()) {
    next();
    return;
  }
  res.status(503).json({ error: VIVINO_ERROR_CODES.disabled });
}

// ─── GET /api/vivino/status ───────────────────────────────────────────────────
// Whether the Vivino entry points should be shown at all.

router.get('/status', (_req: Request, res: Response): void => {
  const status: VivinoStatus = { enabled: isVivinoEnabled() };
  res.json({ data: status });
});

// ─── GET /api/vivino/lookup ───────────────────────────────────────────────────
// Finds the wine on Vivino and proposes values for the item's fields. Writes
// nothing: the client decides what to apply, and never touches `lockedFields`.
// 404 VIVINO_NO_MATCH and 503 VIVINO_UNAVAILABLE come from the service.

router.get('/lookup', requireVivinoEnabled, lookupLimiter, async (req: Request, res: Response): Promise<void> => {
  const query = vivinoLookupQuerySchema.parse(req.query);
  const result: VivinoLookupResult = await vivinoService.lookup({
    category: query.category ?? 'wine',
    producer: query.producer,
    name: query.name ?? '',
    vintage: query.vintage ?? null,
    color: query.color ?? null,
    region: query.region ?? null,
    appellation: query.appellation ?? null,
    sugarLevel: query.sugarLevel ?? null,
  });
  res.json({ data: result });
});

export { router as vivinoRouter };
