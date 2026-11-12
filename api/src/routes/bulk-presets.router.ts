import { Router, Request, Response } from 'express';
import { bulkPresetService } from '../services/bulk-preset.service';
import { bulkPresetCreateSchema } from '../schemas/bulk-preset.schema';
import { authMiddleware } from '../middleware/auth.middleware';
import { routeParam } from '../lib/http';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// #467: errors (a ZodError included: 400 VALIDATION_ERROR) go to the error middleware.

// GET /api/bulk-presets
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const presets = await bulkPresetService.listPresets(req.userId);
  res.json({ data: presets });
});

// POST /api/bulk-presets
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const data = bulkPresetCreateSchema.parse(req.body);
  const preset = await bulkPresetService.createPreset(req.userId, data);
  res.status(201).json({ data: preset });
});

// DELETE /api/bulk-presets/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  await bulkPresetService.deletePreset(req.userId, routeParam(req.params.id));
  res.status(204).end();
});

export default router;
