import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { csvUpload } from '../middleware/upload.middleware';
import { confirmCsvImportSchema } from '../schemas/import.schema';
import { importService } from '../services/import.service';
import { auditLog } from '../services/audit.service';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ─── POST /api/import/csv/preview ────────────────────────────────────────────
// Parses + validates the uploaded CSV, returns valid/invalid rows and the
// lines they make, read against the cellar (#471, FEAT-99). Never writes.

router.post('/csv/preview', csvUpload.single('file'), async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    if (!req.file) {
      res.status(400).json({ error: 'NO_FILE_UPLOADED' });
      return;
    }
    const result = await importService.preview(req.file.buffer);
    void auditLog({
      userId: req.userId,
      ip,
      action: 'IMPORT_CSV',
      status: 'success',
      details: { stage: 'preview', validCount: result.valid.length, errorCount: result.errors.length, lineCount: result.lines.length },
    });
    res.json({ data: result });
  } catch (error) {
    console.error('[import] POST /csv/preview error:', error);
    void auditLog({ userId: req.userId, ip, action: 'IMPORT_CSV', status: 'error', details: { stage: 'preview', message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── POST /api/import/csv/confirm ────────────────────────────────────────────
// Persists rows previously returned as `valid` by /preview. Re-validates
// server-side rather than trusting the client-held array.

router.post('/csv/confirm', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const { rows, cellarId, choices } = confirmCsvImportSchema.parse(req.body);

    if (cellarId) {
      const cellar = await prisma.cellar.findUnique({ where: { id: cellarId }, select: { id: true } });
      if (!cellar) {
        res.status(400).json({ error: 'CELLAR_NOT_FOUND' });
        return;
      }
    }

    const result = await importService.confirmImport(req.userId, rows, cellarId ?? null, choices);
    void auditLog({ userId: req.userId, ip, action: 'IMPORT_CSV', status: 'success', details: { stage: 'confirm', ...result } });
    res.status(201).json({ data: result });
  } catch (error) {
    console.error('[import] POST /csv/confirm error:', error);
    if (error instanceof ZodError) {
      // Identical rows adding up past one group's bound: a code the screen explains.
      if (error.issues.some((issue) => issue.message === 'LINE_TOO_LARGE')) {
        void auditLog({ userId: req.userId, ip, action: 'IMPORT_CSV', status: 'validation_error', details: { stage: 'confirm', issues: 'LINE_TOO_LARGE' } });
        res.status(400).json({ error: 'LINE_TOO_LARGE' });
        return;
      }
      const issues = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      void auditLog({ userId: req.userId, ip, action: 'IMPORT_CSV', status: 'validation_error', details: { stage: 'confirm', issues } });
      res.status(400).json({ error: 'VALIDATION_ERROR', details: issues });
      return;
    }
    // A group the import would push past its bound (QUANTITY_TOO_LARGE).
    if (error instanceof AppError) {
      void auditLog({ userId: req.userId, ip, action: 'IMPORT_CSV', status: 'validation_error', details: { stage: 'confirm', issues: error.code } });
      res.status(error.status).json({ error: error.code });
      return;
    }
    void auditLog({ userId: req.userId, ip, action: 'IMPORT_CSV', status: 'error', details: { stage: 'confirm', message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

export { router as importRouter };
