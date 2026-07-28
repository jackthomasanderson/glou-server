import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { authService } from '../services/auth.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { avatarUpload } from '../middleware/upload.middleware';
import { updateProfileSchema, updatePreferencesSchema, updateEmailSchema, updatePasswordSchema } from '../schemas/user.schema';

const router = Router();

function isErrorWithMessage(err: unknown): err is { message: string } {
  return typeof err === 'object' && err !== null && 'message' in err;
}

/**
 * GET /api/user/me
 * Return current user full profile & preferences
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await authService.me(req.userId);
    res.json({ data: user });
  } catch {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * PATCH /api/user/profile
 * Update display name, avatar, app name, app slogan
 */
router.patch('/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = updateProfileSchema.parse(req.body);
    const user = await authService.updateProfile(req.userId, data);
    res.json({ data: user });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * POST /api/user/avatar
 * Upload a new avatar image
 */
router.post('/avatar', authMiddleware, avatarUpload.single('avatar'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'NO_FILE_UPLOADED' });
      return;
    }

    // Construct the avatar URL path to reach the image
    const avatarUrl = `${process.env.API_URL || 'http://localhost:3001'}/uploads/avatars/${req.file.filename}`;

    const user = await authService.updateProfile(req.userId, { avatarUrl });
    res.json({ data: user });
  } catch {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * DELETE /api/user/avatar
 * Remove current user avatar
 */
router.delete('/avatar', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await authService.deleteAvatar(req.userId);
    res.json({ data: user });
  } catch {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * PATCH /api/user/email
 * Update user email
 */
router.patch('/email', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { email } = updateEmailSchema.parse(req.body);
    const user = await authService.updateEmail(req.userId, email);
    res.json({ data: user });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    if (isErrorWithMessage(err) && err.message === 'EMAIL_ALREADY_TAKEN') {
      res.status(409).json({ error: 'EMAIL_ALREADY_TAKEN' });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * PATCH /api/user/password
 * Update user password
 */
router.patch('/password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = updatePasswordSchema.parse(req.body);
    await authService.updatePassword(req.userId, currentPassword, newPassword);
    res.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    if (isErrorWithMessage(err) && err.message === 'INVALID_CREDENTIALS') {
      res.status(401).json({ error: 'INVALID_CREDENTIALS' });
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
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * GET /api/user/export
 * RGPD: export all personal data as JSON (FEAT-38)
 */
router.get('/export', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await authService.exportUserData(req.userId);
    res.setHeader('Content-Disposition', 'attachment; filename="glou-export.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(data, null, 2));
  } catch {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * POST /api/user/delete-account
 * RGPD: schedule account for deletion with 30-day grace period (FEAT-38)
 */
router.post('/delete-account', authMiddleware, async (req: Request, res: Response) => {
  try {
    await authService.requestAccountDeletion(req.userId);
    res.json({ data: { ok: true } });
  } catch {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * POST /api/user/cancel-delete
 * RGPD: cancel a pending account deletion (FEAT-38)
 */
router.post('/cancel-delete', authMiddleware, async (req: Request, res: Response) => {
  try {
    await authService.cancelAccountDeletion(req.userId);
    res.json({ data: { ok: true } });
  } catch {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

export default router;
