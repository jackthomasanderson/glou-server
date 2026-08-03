import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { csvUpload } from '../middleware/upload.middleware';
import { confirmCsvImportSchema } from '../schemas/import.schema';
import { importService } from '../services/import.service';
import { auditLog } from '../services/audit.service';
import { prisma } from '../lib/prisma';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ─── POST /api/import/csv/preview ────────────────────────────────────────────
// Parses + validates the uploaded CSV, returns valid/invalid rows. Never
// writes to the database.

router.post('/csv/preview', csvUpload.single('file'), async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    if (!req.file) {
      res.status(400).json({ error: 'NO_FILE_UPLOADED' });
      return;
    }
    const result = importService.previewCsv(req.file.buffer);
    void auditLog({
      userId: req.userId,
      ip,
      action: 'IMPORT_CSV',
      status: 'success',
      details: { stage: 'preview', validCount: result.valid.length, errorCount: result.errors.length },
    });
    res.json({ data: result });
  } catch (error) {
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
    const { rows, cellarId } = confirmCsvImportSchema.parse(req.body);

    if (cellarId) {
      const cellar = await prisma.cellar.findUnique({ where: { id: cellarId }, select: { id: true } });
      if (!cellar) {
        res.status(400).json({ error: 'CELLAR_NOT_FOUND' });
        return;
      }
    }

    const created = await importService.confirmImport(req.userId, rows, cellarId ?? null);
    void auditLog({ userId: req.userId, ip, action: 'IMPORT_CSV', status: 'success', details: { stage: 'confirm', created } });
    res.status(201).json({ data: { created } });
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      void auditLog({ userId: req.userId, ip, action: 'IMPORT_CSV', status: 'validation_error', details: { stage: 'confirm', issues } });
      res.status(400).json({ error: 'VALIDATION_ERROR', details: issues });
      return;
    }
    void auditLog({ userId: req.userId, ip, action: 'IMPORT_CSV', status: 'error', details: { stage: 'confirm', message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

export { router as importRouter };
