import { Router, Request, Response } from 'express';
import { bulkPresetService } from '../services/bulk-preset.service';
import { bulkPresetCreateSchema } from '../schemas/bulk-preset.schema';
import { authMiddleware } from '../middleware/auth.middleware';
import { ZodError } from 'zod';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// GET /api/bulk-presets
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const presets = await bulkPresetService.listPresets(req.userId);
    res.json({ data: presets });
  } catch (error) {
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// POST /api/bulk-presets
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = bulkPresetCreateSchema.parse(req.body);
    const preset = await bulkPresetService.createPreset(req.userId, data);
    res.status(201).json({ data: preset });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// DELETE /api/bulk-presets/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await bulkPresetService.deletePreset(req.userId, req.params.id);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

export default router;
