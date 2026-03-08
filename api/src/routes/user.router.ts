import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { authService } from '../services/auth.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { updateProfileSchema, updatePreferencesSchema } from '../schemas/user.schema';

const router = Router();

/**
 * GET /api/user/me
 * Return current user full profile & preferences
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await authService.me(req.userId);
    res.json({ data: user });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * PATCH /api/user/profile
 * Update display name or slogan
 */
router.patch('/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = updateProfileSchema.parse(req.body);
    const user = await authService.updateProfile(req.userId, data);
    res.json({ data: user });
  } catch (err: any) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * PATCH /api/user/preferences
 * Update theme, language, etc.
 */
router.patch('/preferences', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = updatePreferencesSchema.parse(req.body);
    const user = await authService.updatePreferences(req.userId, data);
    res.json({ data: user });
  } catch (err: any) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

export default router;
