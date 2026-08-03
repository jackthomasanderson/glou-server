import { Router, Request, Response } from 'express';
import { recordHumidorReadingSchema } from '../schemas/humidor.schema';
import { humidorService } from '../services/humidor.service';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { auditLog } from '../services/audit.service';

const router = Router();

// Fully protected route — same as every other router in this app (see
// cellars.router.ts). No separate device/API-key auth was built for a
// future physical sensor bridge in this pass (see humidor.service.ts note).
router.use(authMiddleware);

/**
 * POST /api/humidor/readings
 * Record a humidity/temperature reading for a cellar (Task 4 — humidor
 * monitoring). Accepts a manual entry from the UI today; `source: 'sensor'`
 * is reserved for a future physical bridge/integration (not built here) that
 * would POST to this same generic endpoint.
 */
router.post('/readings', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const validation = recordHumidorReadingSchema.safeParse(req.body);

  if (!validation.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR', details: validation.error.format() });
    return;
  }

  try {
    const result = await humidorService.recordReading(userId, validation.data);
    if (!result) {
      res.status(404).json({ error: 'CELLAR_NOT_FOUND' });
      return;
    }
    await auditLog({
      userId,
      ip: getClientIp(req),
      action: 'HUMIDOR_READING_CREATE',
      status: 'success',
      details: { cellarId: validation.data.cellarId, drift: result.drift },
    });
    res.status(201).json({ data: result });
  } catch (err: unknown) {
    res.status(500).json({ error: 'FAILED_TO_RECORD_READING' });
  }
});

/**
 * GET /api/humidor/cellars/:cellarId/readings
 * History (most recent first, capped at 100) + latest drift status for a
 * cellar's humidor readings.
 */
router.get('/cellars/:cellarId/readings', async (req: Request, res: Response) => {
  const { cellarId } = req.params;
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 30;

  try {
    const data = await humidorService.getHistory(cellarId, limit);
    if (!data) {
      res.status(404).json({ error: 'CELLAR_NOT_FOUND' });
      return;
    }
    res.json({ data });
  } catch (err: unknown) {
    res.status(500).json({ error: 'FAILED_TO_FETCH_HISTORY' });
  }
});

export default router;
