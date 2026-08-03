import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { scanJobIdParamSchema } from '../schemas/scan.schema';
import { scanUpload } from '../middleware/upload.middleware';
import { scanService } from '../services/scan.service';
import { auditLog } from '../services/audit.service';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Each scan invokes the OCR/vision service and writes a 10MB-max file to
// disk — throttle per user (not per IP, since the household typically shares
// one) to bound both cost and disk usage. Mirrors the `passwordResetLimiter`
// pattern in auth.router.ts. Runs after authMiddleware, so req.userId is
// always set here.
const scanLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.userId || getClientIp(req),
});

// ─── POST /api/scan ───────────────────────────────────────────────────────────
// Uploads a label photo, creates a ScanJob and returns immediately (202) —
// the actual vision/OCR call runs in the background (see scan.service.ts).
// The client is expected to poll GET /api/scan/jobs/:id until 'done'/'failed'.

router.post('/', scanLimiter, scanUpload.single('photo'), async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    if (!req.file) {
      res.status(400).json({ error: 'NO_FILE_UPLOADED' });
      return;
    }
    const job = await scanService.createJob(req.userId, req.file.path);
    void auditLog({ userId: req.userId, action: 'SCAN', status: 'success', ip, details: { jobId: job.id, stage: 'created' } });
    res.status(202).json({ data: { jobId: job.id } });
  } catch (error) {
    void auditLog({ userId: req.userId, action: 'SCAN', status: 'error', ip, details: { message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── GET /api/scan/jobs/:id ──────────────────────────────────────────────────

router.get('/jobs/:id', async (req: Request, res: Response): Promise<void> => {
  const parsed = scanJobIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR' });
    return;
  }
  try {
    const job = await scanService.getJob(req.userId, parsed.data.id);
    if (!job) {
      res.status(404).json({ error: 'SCAN_JOB_NOT_FOUND' });
      return;
    }
    res.json({ data: job });
  } catch (error) {
    console.error('[scan.router] GET /jobs/:id failed:', error);
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

export { router as scanRouter };
