import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import { suggestQuerySchema } from '../schemas/maturity-reference.schema';
import { maturityReferenceService } from '../services/maturity-reference.service';

const router = Router();

router.use(authMiddleware);

// ─── GET /api/maturity-references/suggest ─────────────────────────────────────

router.get('/suggest', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = suggestQuerySchema.parse(req.query);
    const suggestion = await maturityReferenceService.suggest(params);
    res.json({ data: suggestion });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

export { router as maturityReferencesRouter };
