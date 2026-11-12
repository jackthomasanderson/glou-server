import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { authService } from '../services/auth.service';
import type { ExportCategory } from '../../../shared/auth';
import { notificationCategoriesFor } from '../../../shared/notifications';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { routeParam } from '../lib/http';
import { avatarUpload } from '../middleware/upload.middleware';
import { AVATAR_PATH_PREFIX, updateProfileSchema, updatePreferencesSchema, updateEmailSchema, updateUsernameSchema, updatePasswordSchema, completeOnboardingSchema, updateNotificationPrefsSchema, deleteAccountSchema } from '../schemas/user.schema';
import { accountRequestLimit, passwordCheckLimiter } from '../lib/rate-limit';
import { prisma } from '../lib/prisma';
import { channelPolicy, notificationService } from '../services/notification.service';
import { systemConfigService } from '../services/system-config.service';
import { auditLog } from '../services/audit.service';
import { onboardingService } from '../services/onboarding.service';

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
 * GET /api/user/backup-codes
 * #638: how many 2FA backup codes are left — a count, never the codes. Kept
 * out of /api/auth/2fa so a profile visit does not spend the sign-in rate limit.
 */
router.get('/backup-codes', authMiddleware, async (req: Request, res: Response) => {
  res.json({ data: { remaining: await authService.countBackupCodes(req.userId) } });
});

/**
 * PATCH /api/user/profile
 * Update display name, app name, app slogan (the username: PATCH /api/user/username)
 */
router.patch('/profile', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateProfileSchema.parse(req.body);
    const user = await authService.updateProfile(req.userId, data);
    res.json({ data: user });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.format() });
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

  // #668: a relative path, like product photos — the web app's /uploads
  // rewrite serves it on whatever address the instance is reached at.
  const avatarUrl = `${AVATAR_PATH_PREFIX}${req.file.filename}`;

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
router.patch('/email', authMiddleware, passwordCheckLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, currentPassword } = updateEmailSchema.parse(req.body);
    const deviceInfo = { userAgent: req.headers['user-agent'], ip: getClientIp(req) };
    const user = await authService.updateEmail(req.userId, email, currentPassword, deviceInfo);
    res.json({ data: user });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.format() });
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
 * PATCH /api/user/username
 * #911: the username is a sign-in identifier: changing it asks for the
 * password, with the same per-account limit as the e-mail change.
 */
router.patch('/username', authMiddleware, passwordCheckLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, currentPassword } = updateUsernameSchema.parse(req.body);
    const deviceInfo = { userAgent: req.headers['user-agent'], ip: getClientIp(req) };
    const user = await authService.updateUsername(req.userId, username, currentPassword, deviceInfo);
    res.json({ data: user });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.format() });
      return;
    }
    if (err instanceof Error && err.message === 'REAUTH_REQUIRED') {
      res.status(403).json({ error: 'REAUTH_REQUIRED' });
      return;
    }
    if (err instanceof Error && err.message === 'INVALID_CREDENTIALS') {
      res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      return;
    }
    if (err instanceof Error && err.message === 'USERNAME_ALREADY_TAKEN') {
      res.status(409).json({ error: 'USERNAME_ALREADY_TAKEN' });
      return;
    }
    next(err);
  }
});

/**
 * PATCH /api/user/password
 * Update user password
 */
router.patch('/password', authMiddleware, passwordCheckLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = updatePasswordSchema.parse(req.body);
    const deviceInfo = { userAgent: req.headers['user-agent'], ip: getClientIp(req) };
    await authService.updatePassword(req.userId, currentPassword, newPassword, deviceInfo, req.sessionId);
    res.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.format() });
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
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.format() });
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
 * RGPD: schedule account for deletion with 30-day grace period (FEAT-38).
 * #603: asks for the password; the last active admin cannot leave.
 */
router.post('/delete-account', authMiddleware, passwordCheckLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password } = deleteAccountSchema.parse(req.body ?? {});
    await authService.requestAccountDeletion(req.userId, password, { userAgent: req.headers['user-agent'], ip: getClientIp(req) });
    res.json({ data: { ok: true } });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR' });
      return;
    }
    if (err instanceof Error && err.message === 'INVALID_CREDENTIALS') {
      res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      return;
    }
    if (err instanceof Error && err.message === 'CANNOT_DELETE_LAST_ADMIN') {
      res.status(409).json({ error: 'CANNOT_DELETE_LAST_ADMIN' });
      return;
    }
    next(err);
  }
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
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.format() });
      return;
    }
    next(err);
  }
});

/**
 * GET /api/user/onboarding
 * FEAT-89/FEAT-90: what the setup wizard needs when it opens — postponed for
 * this sign-in, joining an instance filled by others, the cellar it created.
 */
router.get('/onboarding', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ data: await onboardingService.getState(req.userId, req.sessionId) });
  } catch (err: unknown) {
    next(err);
  }
});

/**
 * POST /api/user/onboarding/postpone
 * FEAT-90 "Later": the wizard stays closed for the current sign-in only. Not
 * written to the audit log: it is a display preference, not a security event.
 */
router.post('/onboarding/postpone', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!(await onboardingService.postpone(req.userId, req.sessionId))) {
      res.status(409).json({ error: 'NO_SESSION' });
      return;
    }
    res.json({ data: { postponed: true } });
  } catch (err: unknown) {
    next(err);
  }
});

// ─── Notification Preferences (FEAT-32) ──────────────────────────────────────

/**
 * GET /api/user/notifications
 * Return current user's notification preferences + active channels from system policy
 */
router.get('/notifications', authMiddleware, async (req: Request, res: Response) => {
  const [user, config] = await Promise.all([
    prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        isAdmin: true,
        notifEmail: true,
        notifWebhook: true,
        notifCategories: true,
        notifQuietStart: true,
        notifQuietEnd: true,
        notifLanguage: true,
      },
    }),
    systemConfigService.getPublic(),
  ]);
  if (!user) { res.status(404).json({ error: 'USER_NOT_FOUND' }); return; }

  const { isAdmin, ...prefs } = user;
  res.json({
    data: {
      ...prefs,
      policy: channelPolicy(config, isAdmin),
      // #780: what this member can receive; backup failures go to admins only.
      categories: notificationCategoriesFor(isAdmin),
      // #780: without automatic backups, only a manual or pre-restore backup can fail.
      ...(isAdmin ? { automaticBackups: config.backupEnabled } : {}),
      // #772: quiet hours are read in this zone; the page names it.
      timeZone: config.timeZone,
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
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.format() });
      return;
    }
    throw err;
  }
  const {
    notifEmail, notifWebhook,
    notifCategories, notifQuietStart, notifQuietEnd,
    notifLanguage,
  } = parsed;

  const data: Record<string, unknown> = {};
  if (notifEmail !== undefined) data.notifEmail = notifEmail;
  if (notifWebhook !== undefined) data.notifWebhook = notifWebhook;
  if (notifCategories !== undefined) {
    // #780: only categories this member can receive are kept (backup failures
    // reach admins only). A list left empty would read as "every category".
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
    const allowed: readonly string[] = notificationCategoriesFor(!!user?.isAdmin);
    const kept = notifCategories.filter((c) => allowed.includes(c));
    if (notifCategories.length > 0 && kept.length === 0) {
      res.status(400).json({ error: 'VALIDATION_ERROR' });
      return;
    }
    data.notifCategories = kept;
  }
  if (notifQuietStart !== undefined) data.notifQuietStart = notifQuietStart;
  if (notifQuietEnd !== undefined) data.notifQuietEnd = notifQuietEnd;
  if (notifLanguage !== undefined) data.notifLanguage = notifLanguage;

  await prisma.user.update({ where: { id: req.userId }, data });
  res.json({ data: { ok: true } });
});

/** Tests a member may send per auth window: each one reaches the instance's shared Gotify app or a mailbox (#767). */
const NOTIFICATION_TESTS_PER_WINDOW = 5;
const notificationTestLimiter = accountRequestLimit(NOTIFICATION_TESTS_PER_WINDOW, 'notification-test');

/**
 * POST /api/user/notifications/test/:channel
 * Test a notification channel (email or webhook)
 */
router.post('/notifications/test/:channel', authMiddleware, notificationTestLimiter, async (req: Request, res: Response, next: NextFunction) => {
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
