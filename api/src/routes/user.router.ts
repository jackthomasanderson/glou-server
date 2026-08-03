import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { authService, ExportCategory } from '../services/auth.service';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { avatarUpload } from '../middleware/upload.middleware';
import { updateProfileSchema, updatePreferencesSchema, updateEmailSchema, updatePasswordSchema, completeOnboardingSchema } from '../schemas/user.schema';
import { prisma } from '../lib/prisma';
import { notificationService } from '../services/notification.service';
import { systemConfigService } from '../services/system-config.service';
import { auditLog } from '../services/audit.service';

const router = Router();

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
    if (err instanceof Error && err.message === 'EMAIL_ALREADY_TAKEN') {
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
    const deviceInfo = { userAgent: req.headers['user-agent'], ip: getClientIp(req) };
    await authService.updatePassword(req.userId, currentPassword, newPassword, deviceInfo, req.sessionId);
    res.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    if (err instanceof Error && err.message === 'INVALID_CREDENTIALS') {
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
 * RGPD: export personal data as JSON — full by default, or filtered via
 * `?categories=inventory,tastings` (FEAT-38 full export, FEAT-18 category filter)
 */
router.get('/export', authMiddleware, async (req: Request, res: Response) => {
  try {
    const raw = typeof req.query.categories === 'string' ? req.query.categories : undefined;
    const categories = raw
      ? (raw.split(',').map((c) => c.trim()).filter(Boolean) as ExportCategory[])
      : undefined;
    const data = await authService.exportUserData(req.userId, categories);
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

// ─── Onboarding (FEAT-56) ─────────────────────────────────────────────────────

/**
 * POST /api/user/onboarding/complete
 * Mark the setup wizard as finished or explicitly skipped — either way the
 * wizard stops auto-displaying at next login (see AuthGuard on the frontend).
 * It remains reachable manually afterwards from the profile page.
 */
router.post('/onboarding/complete', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { skipped } = completeOnboardingSchema.parse(req.body ?? {});
    const user = await authService.completeOnboarding(req.userId);
    await auditLog({
      userId: req.userId,
      ip: getClientIp(req),
      action: 'ONBOARDING_COMPLETE',
      status: 'success',
      details: { skipped },
    });
    res.json({ data: user });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

// ─── Notification Preferences (FEAT-32) ──────────────────────────────────────

/**
 * GET /api/user/notifications
 * Return current user's notification preferences + active channels from system policy
 */
router.get('/notifications', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [user, policy] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.userId },
        select: {
          notifInApp: true,
          notifEmail: true,
          notifWebhook: true,
          notifCategories: true,
          notifQuietStart: true,
          notifQuietEnd: true,
          notifLanguage: true,
          webhookUrl: true,
        },
      }),
      systemConfigService.getPublic(),
    ]);
    if (!user) { res.status(404).json({ error: 'USER_NOT_FOUND' }); return; }

    res.json({
      data: {
        ...user,
        policy: {
          smtpEnabled: policy.smtpEnabled,
          gotifyEnabled: policy.gotifyEnabled,
          inAppEnabled: policy.inAppEnabled,
        },
      },
    });
  } catch {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * PATCH /api/user/notifications
 * Update notification preferences
 */
router.patch('/notifications', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      notifInApp, notifEmail, notifWebhook,
      notifCategories, notifQuietStart, notifQuietEnd,
      notifLanguage, webhookUrl,
    } = req.body;

    const data: Record<string, unknown> = {};
    if (notifInApp !== undefined) data.notifInApp = Boolean(notifInApp);
    if (notifEmail !== undefined) data.notifEmail = Boolean(notifEmail);
    if (notifWebhook !== undefined) data.notifWebhook = Boolean(notifWebhook);
    if (Array.isArray(notifCategories)) data.notifCategories = notifCategories;
    if (notifQuietStart !== undefined) data.notifQuietStart = notifQuietStart === null ? null : Number(notifQuietStart);
    if (notifQuietEnd !== undefined) data.notifQuietEnd = notifQuietEnd === null ? null : Number(notifQuietEnd);
    if (notifLanguage !== undefined) data.notifLanguage = notifLanguage;
    if (webhookUrl !== undefined) data.webhookUrl = webhookUrl || null;

    await prisma.user.update({ where: { id: req.userId }, data });
    res.json({ data: { ok: true } });
  } catch {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * POST /api/user/notifications/test/:channel
 * Test a notification channel (email or webhook)
 */
router.post('/notifications/test/:channel', authMiddleware, async (req: Request, res: Response) => {
  const { channel } = req.params;
  if (channel !== 'email' && channel !== 'webhook') {
    res.status(400).json({ error: 'UNKNOWN_CHANNEL' });
    return;
  }
  try {
    const result = await notificationService.testChannel(req.userId, channel);
    res.json({ data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'INTERNAL_SERVER_ERROR';
    res.status(500).json({ error: msg });
  }
});

export default router;
