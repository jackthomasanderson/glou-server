import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { suggestQuerySchema } from '../schemas/maturity-reference.schema';
import { maturityReferenceService } from '../services/maturity-reference.service';

const router = Router();

router.use(authMiddleware);

// ─── GET /api/maturity-references/suggest ─────────────────────────────────────

router.get('/suggest', async (req: Request, res: Response): Promise<void> => {
  // A ZodError reaches the error middleware: 400 VALIDATION_ERROR (#467).
  const params = suggestQuerySchema.parse(req.query);
  const suggestion = await maturityReferenceService.suggest(params);
  res.json({ data: suggestion });
});

export { router as maturityReferencesRouter };
