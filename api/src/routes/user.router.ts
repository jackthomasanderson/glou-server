import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { authService, ExportCategory } from '../services/auth.service';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { routeParam } from '../lib/http';
import { avatarUpload } from '../middleware/upload.middleware';
import { updateProfileSchema, updatePreferencesSchema, updateEmailSchema, updatePasswordSchema, completeOnboardingSchema, updateNotificationPrefsSchema } from '../schemas/user.schema';
import { prisma } from '../lib/prisma';
import { assertUrlAllowed } from '../lib/ssrf';
import { notificationService } from '../services/notification.service';
import { systemConfigService } from '../services/system-config.service';
import { auditLog } from '../services/audit.service';

const router = Router();

/**
 * GET /api/user/me
 * Return current user full profile & preferences
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  const user = await authService.me(req.userId);
  res.json({ data: user });
});

/**
 * PATCH /api/user/profile
 * Update display name, avatar, app name, app slogan
 */
router.patch('/profile', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateProfileSchema.parse(req.body);
    const user = await authService.updateProfile(req.userId, data);
    res.json({ data: user });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    next(err);
  }
});

/**
 * POST /api/user/avatar
 * Upload a new avatar image
 */
router.post('/avatar', authMiddleware, avatarUpload.single('avatar'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'NO_FILE_UPLOADED' });
    return;
  }

  // Construct the avatar URL path to reach the image
  const avatarUrl = `${process.env.API_URL || 'http://localhost:3001'}/uploads/avatars/${req.file.filename}`;

  const user = await authService.updateProfile(req.userId, { avatarUrl });
  res.json({ data: user });
});

/**
 * DELETE /api/user/avatar
 * Remove current user avatar
 */
router.delete('/avatar', authMiddleware, async (req: Request, res: Response) => {
  const user = await authService.deleteAvatar(req.userId);
  res.json({ data: user });
});

/**
 * PATCH /api/user/email
 * Update user email
 */
router.patch('/email', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, currentPassword } = updateEmailSchema.parse(req.body);
    const deviceInfo = { userAgent: req.headers['user-agent'], ip: getClientIp(req) };
    const user = await authService.updateEmail(req.userId, email, currentPassword, deviceInfo);
    res.json({ data: user });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    if (err instanceof Error && err.message === 'INVALID_CREDENTIALS') {
      res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      return;
    }
    if (err instanceof Error && err.message === 'EMAIL_ALREADY_TAKEN') {
      res.status(409).json({ error: 'EMAIL_ALREADY_TAKEN' });
      return;
    }
    next(err);
  }
});

/**
 * PATCH /api/user/password
 * Update user password
 */
router.patch('/password', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
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
    next(err);
  }
});

/**
 * PATCH /api/user/preferences
 * Update theme, language, etc.
 */
router.patch('/preferences', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updatePreferencesSchema.parse(req.body);
    const user = await authService.updatePreferences(req.userId, data);
    res.json({ data: user });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    next(err);
  }
});

/**
 * GET /api/user/export
 * RGPD: export personal data as JSON — full by default, or filtered via
 * `?categories=inventory,tastings` (FEAT-38 full export, FEAT-18 category filter)
 */
router.get('/export', authMiddleware, async (req: Request, res: Response) => {
  const raw = typeof req.query.categories === 'string' ? req.query.categories : undefined;
  const categories = raw
    ? (raw.split(',').map((c) => c.trim()).filter(Boolean) as ExportCategory[])
    : undefined;
  const data = await authService.exportUserData(req.userId, categories);
  res.setHeader('Content-Disposition', 'attachment; filename="glou-export.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(data, null, 2));
});

/**
 * POST /api/user/delete-account
 * RGPD: schedule account for deletion with 30-day grace period (FEAT-38)
 */
router.post('/delete-account', authMiddleware, async (req: Request, res: Response) => {
  await authService.requestAccountDeletion(req.userId);
  res.json({ data: { ok: true } });
});

/**
 * POST /api/user/cancel-delete
 * RGPD: cancel a pending account deletion (FEAT-38)
 */
router.post('/cancel-delete', authMiddleware, async (req: Request, res: Response) => {
  await authService.cancelAccountDeletion(req.userId);
  res.json({ data: { ok: true } });
});

// ─── Onboarding (FEAT-56) ─────────────────────────────────────────────────────

/**
 * POST /api/user/onboarding/complete
 * Mark the setup wizard as finished or explicitly skipped — either way the
 * wizard stops auto-displaying at next login (see AuthGuard on the frontend).
 * It remains reachable manually afterwards from the profile page.
 */
router.post('/onboarding/complete', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
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
    next(err);
  }
});

// ─── Notification Preferences (FEAT-32) ──────────────────────────────────────

/**
 * GET /api/user/notifications
 * Return current user's notification preferences + active channels from system policy
 */
router.get('/notifications', authMiddleware, async (req: Request, res: Response) => {
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
});

/**
 * PATCH /api/user/notifications
 * Update notification preferences
 */
router.patch('/notifications', authMiddleware, async (req: Request, res: Response) => {
  let parsed;
  try {
    parsed = updateNotificationPrefsSchema.parse(req.body);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    throw err;
  }
  const {
    notifInApp, notifEmail, notifWebhook,
    notifCategories, notifQuietStart, notifQuietEnd,
    notifLanguage, webhookUrl,
  } = parsed;

  // ISSUE_048: a webhook URL is called server-side on every notification —
  // reject anything that isn't a public HTTPS address at save time, the same
  // guard already applied to it just before each actual delivery.
  if (webhookUrl) {
    try {
      await assertUrlAllowed(webhookUrl);
    } catch (err) {
      console.error('[user] PATCH /notifications error:', err);
      res.status(400).json({ error: 'INVALID_URL' });
      return;
    }
  }

  const data: Record<string, unknown> = {};
  if (notifInApp !== undefined) data.notifInApp = notifInApp;
  if (notifEmail !== undefined) data.notifEmail = notifEmail;
  if (notifWebhook !== undefined) data.notifWebhook = notifWebhook;
  if (notifCategories !== undefined) data.notifCategories = notifCategories;
  if (notifQuietStart !== undefined) data.notifQuietStart = notifQuietStart;
  if (notifQuietEnd !== undefined) data.notifQuietEnd = notifQuietEnd;
  if (notifLanguage !== undefined) data.notifLanguage = notifLanguage;
  if (webhookUrl !== undefined) data.webhookUrl = webhookUrl || null;

  await prisma.user.update({ where: { id: req.userId }, data });
  res.json({ data: { ok: true } });
});

/**
 * POST /api/user/notifications/test/:channel
 * Test a notification channel (email or webhook)
 */
router.post('/notifications/test/:channel', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  const channel = routeParam(req.params.channel);
  if (channel !== 'email' && channel !== 'webhook') {
    res.status(400).json({ error: 'UNKNOWN_CHANNEL' });
    return;
  }
  try {
    const result = await notificationService.testChannel(req.userId, channel);
    res.json({ data: result });
  } catch (err) {
    // ISSUE_063: let the central handler classify and log it instead of
    // echoing the raw error message back to the client.
    next(err);
  }
});

export default router;
