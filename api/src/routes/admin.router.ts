import { Router, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { routeParam } from '../lib/http';
import { assertUrlAllowed } from '../lib/ssrf';
import { authMiddleware, adminMiddleware, getClientIp } from '../middleware/auth.middleware';
import { MaintenanceService } from '../services/maintenance.service';
import { paginationQuerySchema } from '../schemas/pagination.schema';
import { maturityReferenceSchema, maturityReferencePatchSchema, maturityReferenceReorderSchema } from '../schemas/maturity-reference.schema';
import { retentionConfigSchema, maintenanceRunsQuerySchema } from '../schemas/retention.schema';
import { networkConfigSchema } from '../schemas/network-config.schema';
import { registrationConfigSchema } from '../schemas/registration-config.schema';
import { smtpConfigSchema, smtpTestSchema, gotifyConfigSchema, notificationPolicySchema } from '../schemas/system-config.schema';
import { memberRoleSchema, memberStatusSchema } from '../schemas/admin-user.schema';
import { backupConfigSchema, backupRunsQuerySchema, backupRestoreSchema, purgeSchema } from '../schemas/backup.schema';
import { maturityReferenceService } from '../services/maturity-reference.service';
import { systemConfigService } from '../services/system-config.service';
import { authService } from '../services/auth.service';
import { emailService } from '../services/email.service';
import { gotifyService } from '../services/gotify.service';
import { backupService } from '../services/backup.service';
import { auditLog, type AuditAction } from '../services/audit.service';
import { adminReauthSchema } from '../schemas/auth.schema';
import { authRateLimit, accountRateLimit } from '../lib/rate-limit';
import type { BackupHealth, PurgeResponse } from '../../../shared/maintenance';
import { AUDIT_ACTIONS, AUDIT_STATUSES } from '../../../shared/audit';
import { lowersRetention, opensRegistration, weakensBackups } from '../../../shared/admin-config';
import { sharesService } from '../services/shares.service';

const adminRouter = Router();

/** Refusals of the admin's own re-authentication (#638). */
const REAUTH_ERRORS = new Set(['REAUTH_REQUIRED', 'INVALID_PASSWORD', 'INVALID_TOTP_CODE']);

// #890: one limiter for every other step-up route, counting refusals only — a
// password or code guess spends it whatever the route, an admin saving their
// settings does not.
// #606 (review): and one per admin account, counting wrong passwords and
// codes only — the per-IP limits alone let a stolen session guess the
// admin's password from rotating addresses. Shared by every step-up route.
const STEP_UP_ACCOUNT_MAX = 20;
const stepUpAccountLimiter = accountRateLimit(STEP_UP_ACCOUNT_MAX, 'admin-step-up');
const stepUpLimiter = [authRateLimit(20, { skipSuccessfulRequests: true }), ...stepUpAccountLimiter];
// #638, #603: a reset and a role change ask for the admin's password and 2FA
// code — throttled like the other password and 2FA checks.
const resetPasswordLimiter = [authRateLimit(20), ...stepUpAccountLimiter];
const roleLimiter = [authRateLimit(20), ...stepUpAccountLimiter];

type StepUpAudit = { action: AuditAction; details: Record<string, unknown> };

/**
 * #890: the settings that decide where reset links, mail and security alerts
 * go, and the backup routes (a dump holds every password hash and 2FA
 * secret), ask for the same step-up as a password reset (#638): the admin's
 * `password` in the body, plus their `code` when they have 2FA. A refusal is
 * answered (403 with its code) and audited, and false is returned.
 */
async function stepUp(req: Request, res: Response, audit: StepUpAudit): Promise<boolean> {
    const reauth = adminReauthSchema.safeParse({ password: req.body?.password, code: req.body?.code });
    if (!reauth.success) {
        res.status(400).json({ error: 'VALIDATION_ERROR' });
        return false;
    }
    try {
        await authService.reauthenticateAdmin(req.userId, reauth.data, { ip: getClientIp(req), userAgent: req.headers['user-agent'] }, audit);
        return true;
    } catch (error) {
        if (error instanceof Error && REAUTH_ERRORS.has(error.message)) {
            res.status(403).json({ error: error.message });
            return false;
        }
        throw error;
    }
}

/** #890: what a gated settings change or test is audited as. */
const configAudit = (action: 'CONFIG_UPDATE' | 'CONFIG_TEST', section: string): StepUpAudit => ({ action, details: { section } });

const auditSuccess = (req: Request, audit: StepUpAudit): void => {
    void auditLog({ userId: req.userId, action: audit.action, status: 'success', ip: getClientIp(req), details: audit.details });
};

/**
 * #893: a settings change that erases data or weakens the instance (shared/
 * admin-config.ts) asks for the step-up; the safe direction of the same
 * setting does not. Compared with the stored values, read here. Returns
 * whether the change may go on, and audits it once it went through.
 */
async function stepUpIfWeakening(
    req: Request,
    res: Response,
    section: string,
    weakens: (current: Awaited<ReturnType<typeof systemConfigService.getPublic>>) => boolean,
): Promise<{ allowed: boolean; audit: StepUpAudit | null }> {
    if (!weakens(await systemConfigService.getPublic())) return { allowed: true, audit: null };
    const audit = configAudit('CONFIG_UPDATE', section);
    return { allowed: await stepUp(req, res, audit), audit };
}

// Audit log pages are bigger than the member-facing lists.
const auditLogsQuerySchema = paginationQuerySchema({ defaultLimit: 50, maxLimit: 100 }).extend({
    // Free text over member, IP and action; status is exact; from/to bound createdAt (inclusive days).
    q: z.string().trim().max(100).optional(),
    status: z.enum(AUDIT_STATUSES).optional(),
    // #698: comma-separated action types, any of which matches.
    actions: z.string().optional()
        .transform((v) => (v ? v.split(',').filter(Boolean) : []))
        .pipe(z.array(z.enum(AUDIT_ACTIONS)).max(AUDIT_ACTIONS.length)),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
});

adminRouter.use(authMiddleware);
adminRouter.use(adminMiddleware);

/**
 * @route   GET /api/admin/users
 * @desc    Get all users listing
 * @access  Admin Private
 */
adminRouter.get('/users', async (req: Request, res: Response): Promise<void> => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                email: true,
                displayName: true,
                isAdmin: true,
                isActive: true,
                // #638: the reset dialog asks for the admin's password when on.
                isTwoFactorEnabled: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ data: users });
    } catch (error) {
        console.error('[Admin] Error fetching users:', error);
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

/**
 * @route   POST /api/admin/users/:userId/role
 * @desc    Update a user's role
 * @access  Admin Private
 */
adminRouter.post('/users/:userId/role', roleLimiter, async (req: Request, res: Response): Promise<void> => {
    const userId = routeParam(req.params.userId);
    const parsed = memberRoleSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'INVALID_INPUT' });
        return;
    }
    const { isAdmin } = parsed.data;

    // Prevent admin from removing their own admin privileges
    if (req.userId === userId && !isAdmin) {
        res.status(400).json({ error: 'CANNOT_REMOVE_OWN_ADMIN' });
        return;
    }

    try {
        // Checked first, so a request that would change nothing does not
        // spend one of the admin's backup codes.
        const target = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
        if (!target) {
            res.status(404).json({ error: 'USER_NOT_FOUND' });
            return;
        }
        if (target.isAdmin === isAdmin) {
            res.status(409).json({ error: isAdmin ? 'ALREADY_ADMIN' : 'NOT_ADMIN' });
            return;
        }
        // #638: granting the role hands the session holder a second admin
        // account. #603: removing it is gated too — a stolen session could
        // otherwise demote the other admins and stay the only one.
        const audit: StepUpAudit = { action: 'ADMIN_ROLE_CHANGE', details: { targetUserId: userId, isAdmin } };
        if (!(await stepUp(req, res, audit))) return;
        const user = await prisma.user.update({
            where: { id: userId },
            data: { isAdmin },
            select: {
                id: true,
                username: true,
                email: true,
                isAdmin: true,
                isActive: true,
            },
        });
        auditSuccess(req, audit);
        res.json({ data: user });
    } catch (error: unknown) {
        console.error('[Admin] Error updating user role:', error);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            res.status(404).json({ error: 'USER_NOT_FOUND' });
            return;
        }
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

/**
 * @route   PATCH /api/admin/users/:userId/status
 * @desc    Activate or deactivate a user account
 * @access  Admin Private
 */
adminRouter.patch('/users/:userId/status', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
    const userId = routeParam(req.params.userId);
    const parsed = memberStatusSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'INVALID_INPUT' });
        return;
    }
    const { isActive } = parsed.data;

    // Prevent self-deactivation
    if (req.userId === userId && !isActive) {
        res.status(400).json({ error: 'CANNOT_DEACTIVATE_SELF' });
        return;
    }

    try {
        const target = await prisma.user.findUnique({
            where: { id: userId },
            select: { isAdmin: true },
        });
        if (!target) {
            res.status(404).json({ error: 'USER_NOT_FOUND' });
            return;
        }
        // Prevent deactivating the last active admin
        if (!isActive && target.isAdmin) {
            const activeAdminCount = await prisma.user.count({
                where: { isAdmin: true, isActive: true },
            });
            if (activeAdminCount <= 1) {
                res.status(400).json({ error: 'CANNOT_DEACTIVATE_LAST_ADMIN' });
                return;
            }
        }

        // #603: checked after the refusals above, so they spend no backup
        // code. A stolen admin session could otherwise lock the other admins
        // out, or wake up an account it knows the password of.
        const audit: StepUpAudit = { action: 'ADMIN_STATUS_CHANGE', details: { targetUserId: userId, isActive } };
        if (!(await stepUp(req, res, audit))) return;

        // #605: deactivating cuts the member's accesses for good, so that
        // reactivating the account never wakes up a stolen session, a trusted
        // device or a guest link (same revocation as adminResetPassword).
        const user = await prisma.$transaction(async (tx) => {
            const updated = await tx.user.update({
                where: { id: userId },
                data: { isActive },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    isAdmin: true,
                    isActive: true,
                },
            });
            if (!isActive) {
                const now = new Date();
                await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
                await tx.trustedDevice.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
                await tx.guestShare.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
            }
            return updated;
        });
        auditSuccess(req, audit);
        res.json({ data: user });
    } catch (error) {
        console.error('[Admin] Error updating user status:', error);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            res.status(404).json({ error: 'USER_NOT_FOUND' });
            return;
        }
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

/**
 * @route   POST /api/admin/users/:userId/reset-password
 * @desc    #336 — recover a member's account with no SMTP configured:
 *          generates a one-time temporary password (shown to the admin
 *          exactly once, never stored in the clear), revokes the member's
 *          sessions/trusted devices, and forces a real password choice on
 *          their next successful login.
 * @access  Admin Private
 */
adminRouter.post('/users/:userId/reset-password', resetPasswordLimiter, async (req: Request, res: Response): Promise<void> => {
    const userId = routeParam(req.params.userId);
    const reauth = adminReauthSchema.safeParse(req.body ?? {});
    if (!reauth.success) {
        res.status(400).json({ error: 'VALIDATION_ERROR' });
        return;
    }
    try {
        const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!target) {
            res.status(404).json({ error: 'USER_NOT_FOUND' });
            return;
        }
        const tempPassword = await authService.adminResetPassword(userId, req.userId, { ip: getClientIp(req), userAgent: req.headers['user-agent'] }, reauth.data);
        res.json({ data: { tempPassword } });
    } catch (error) {
        if (error instanceof Error && REAUTH_ERRORS.has(error.message)) {
            res.status(403).json({ error: error.message });
            return;
        }
        if (error instanceof Error && error.message === 'TARGET_CHANGED') {
            res.status(409).json({ error: 'TARGET_CHANGED' });
            return;
        }
        console.error('[Admin] Error resetting user password:', error);
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

/**
 * @route   GET /api/admin/shares
 * @desc    #486: every member's guest links still in force — who made each,
 *          for whom, what it opens and until when. Never the link itself.
 * @access  Admin Private
 */
adminRouter.get('/shares', async (_req: Request, res: Response): Promise<void> => {
    try {
        res.json({ data: await sharesService.listActiveForAdmin() });
    } catch (error) {
        console.error('[Admin] Error listing guest links:', error);
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

/**
 * @route   DELETE /api/admin/shares/:id
 * @desc    #486: revoke any member's guest link (a leaked link, a guest who
 *          should no longer see the cellar). Audited.
 * @access  Admin Private
 */
adminRouter.delete('/shares/:id', async (req: Request, res: Response): Promise<void> => {
    const id = routeParam(req.params.id);
    try {
        const result = await sharesService.revokeAsAdmin(id);
        if (!result) {
            res.status(404).json({ error: 'SHARE_NOT_FOUND' });
            return;
        }
        if (result.revoked) {
            void auditLog({
                userId: req.userId,
                action: 'ADMIN_SHARE_REVOKE',
                status: 'success',
                ip: getClientIp(req),
                details: { shareId: id, ownerId: result.ownerId },
            });
        }
        res.json({ data: { id, revokedAt: result.revokedAt } });
    } catch (error) {
        console.error('[Admin] Error revoking guest link:', error);
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

/**
 * @route   GET /api/admin/audit-logs
 * @desc    Get paginated audit log for the instance
 * @access  Admin Private
 */
adminRouter.get('/audit-logs', async (req: Request, res: Response): Promise<void> => {
    const query = auditLogsQuerySchema.safeParse(req.query);
    if (!query.success) {
        res.status(400).json({ error: 'VALIDATION_ERROR', details: query.error.format() });
        return;
    }
    const { page, limit, q, status, actions, from, to } = query.data;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};
    if (q) {
        where.OR = [
            { action: { contains: q, mode: 'insensitive' } },
            { ip: { contains: q } },
            { user: { username: { contains: q, mode: 'insensitive' } } },
            { user: { displayName: { contains: q, mode: 'insensitive' } } },
        ];
    }
    if (status) where.status = status;
    if (actions.length > 0) where.action = { in: actions };
    if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = from;
        if (to) {
            // `to` is a day: include all of it.
            const end = new Date(to);
            end.setUTCHours(23, 59, 59, 999);
            where.createdAt.lte = end;
        }
    }

    try {
        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: { username: true, displayName: true },
                    },
                },
            }),
            prisma.auditLog.count({ where }),
        ]);

        res.json({
            data: {
                items: logs,
                meta: { page, limit, total, pages: Math.ceil(total / limit) },
            },
        });
    } catch (error) {
        console.error('[Admin] Error fetching audit logs:', error);
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

/**
 * @route   POST /api/admin/maintenance/purge
 * @desc    Purge all business data (inventory items, cellars, logs)
 * @access  Admin Private
 */
adminRouter.post('/maintenance/purge', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
    const parsed = purgeSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'INVALID_CONFIRMATION' });
        return;
    }
    const ip = getClientIp(req);

    try {
        // #489: re-authenticate (#890: with the admin's code too), take a
        // backup first (abort if it fails), and leave a trace of who purged,
        // written after the purge since the purge wipes the audit log itself.
        if (!(await stepUp(req, res, { action: 'PURGE', details: {} }))) return;
        const backup = await backupService.runBackup('manual', req.userId);
        if (!backup.success) {
            res.status(500).json({ error: 'BACKUP_BEFORE_PURGE_FAILED' });
            return;
        }
        const result = await MaintenanceService.purgeAllData();
        await auditLog({
            userId: req.userId,
            action: 'PURGE',
            status: 'success',
            ip,
            details: { counts: result.counts, backupRunId: backup.id },
        });
        const body: PurgeResponse = { ...result, backupRunId: backup.id };
        res.json({ data: body });
    } catch (error) {
        console.error('[Admin] Maintenance purge error:', error);
        res.status(500).json({ error: 'PURGE_FAILED' });
    }
});

/**
 * @route   GET /api/admin/maintenance/runs
 * @desc    Paginated history of retention cleanup runs (FEAT-39)
 * @access  Admin Private
 */
adminRouter.get('/maintenance/runs', async (req: Request, res: Response): Promise<void> => {
    try {
        const { limit } = maintenanceRunsQuerySchema.parse(req.query);
        const runs = await prisma.maintenanceRun.findMany({
            take: limit ?? 50,
            orderBy: { runAt: 'desc' },
        });
        res.json({ data: runs });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ error: 'VALIDATION_ERROR', details: error.issues });
            return;
        }
        console.error('[Admin] Error fetching maintenance runs:', error);
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

/**
 * @route   POST /api/admin/maintenance/run
 * @desc    Trigger an immediate data retention cleanup (FEAT-39)
 * @access  Admin Private
 */
adminRouter.post('/maintenance/run', async (req: Request, res: Response): Promise<void> => {
    try {
        const run = await MaintenanceService.runRetentionCleanup('manual', req.userId);
        res.json({ data: run });
    } catch (error) {
        console.error('[Admin] Manual retention cleanup error:', error);
        res.status(500).json({ error: 'RETENTION_CLEANUP_FAILED' });
    }
});

// ─── Maturity References ──────────────────────────────────────────────────────

adminRouter.get('/maturity-references', async (_req: Request, res: Response): Promise<void> => {
  const refs = await maturityReferenceService.list();
  res.json({ data: refs });
});

adminRouter.post('/maturity-references', async (req: Request, res: Response): Promise<void> => {
  const data = maturityReferenceSchema.parse(req.body);
  const ref = await maturityReferenceService.create(data);
  res.status(201).json({ data: ref });
});

// FEAT-86: rewrite the cascade priority order. Registered BEFORE the
// `/:id` PATCH so Express doesn't match `:id = "reorder"`.
adminRouter.patch('/maturity-references/reorder', async (req: Request, res: Response): Promise<void> => {
  const { ids } = maturityReferenceReorderSchema.parse(req.body);
  await maturityReferenceService.reorder(ids);
  res.json({ data: { reordered: true } });
});

adminRouter.patch('/maturity-references/:id', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const patch = maturityReferencePatchSchema.parse(req.body);
  const ref = await maturityReferenceService.update(id, patch);
  if (!ref) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
  res.json({ data: ref });
});

adminRouter.delete('/maturity-references/:id', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const ok = await maturityReferenceService.delete(id);
  if (!ok) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
  res.json({ data: { deleted: true } });
});

// ─── System Configuration (FEAT-34/53) ───────────────────────────────────────

adminRouter.get('/config', async (_req: Request, res: Response): Promise<void> => {
  const config = await systemConfigService.getPublic();
  res.json({ data: config });
});

// #890: the SMTP server, the Gotify server and the notification channels
// decide where reset links and security alerts go, and the public URL is the
// host of every reset link: each asks for the step-up (stepUp above).
adminRouter.put('/config/smtp', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = smtpConfigSchema.parse(req.body);
    const audit = configAudit('CONFIG_UPDATE', 'smtp');
    if (!(await stepUp(req, res, audit))) return;
    const config = await systemConfigService.updateSmtp(parsed, req.userId);
    auditSuccess(req, audit);
    res.json({ data: config });
  } catch (err) {
    console.error('[admin] PUT /config/smtp error:', err);
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.issues });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

adminRouter.put('/config/gotify', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = gotifyConfigSchema.parse(req.body);
    // #767: every member's Gotify notification goes to this server: it
    // cannot be on without its URL and app token.
    if (await gotifyService.wouldBeOnWithoutServer(parsed)) {
      res.status(400).json({ error: 'GOTIFY_INCOMPLETE' });
      return;
    }
    // ISSUE_048: this address is fetched server-side on every test and every
    // delivery: only a public HTTPS address, checked at save time and again
    // before each call.
    if (parsed.gotifyUrl) {
      try {
        await assertUrlAllowed(parsed.gotifyUrl);
      } catch (err) {
        console.error('[admin] PUT /config/gotify error:', err);
        res.status(400).json({ error: 'INVALID_URL' });
        return;
      }
    }
    const audit = configAudit('CONFIG_UPDATE', 'gotify');
    if (!(await stepUp(req, res, audit))) return;
    const config = await systemConfigService.updateGotify(parsed, req.userId);
    auditSuccess(req, audit);
    res.json({ data: config });
  } catch (err) {
    console.error('[admin] PUT /config/gotify error:', err);
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.issues });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

adminRouter.put('/config/notifications', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = notificationPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    // Only the switches sent are written (a card sends its own): the parsed
    // object holds those keys and nothing else.
    const policy = parsed.data;
    // Another switch is saved whatever the state of Gotify; switching Gotify
    // on needs its URL and app token (#767).
    if (policy.gotifyEnabled && await gotifyService.wouldBeOnWithoutServer({ gotifyEnabled: true })) {
      res.status(400).json({ error: 'GOTIFY_INCOMPLETE' });
      return;
    }
    const audit = configAudit('CONFIG_UPDATE', 'notifications');
    if (!(await stepUp(req, res, audit))) return;
    const config = await systemConfigService.updateNotificationPolicy(policy, req.userId);
    auditSuccess(req, audit);
    res.json({ data: config });
  } catch (err) {
    console.error('[admin] PUT /config/notifications error:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

// #893: shortening a retention window erases rows at the next cleanup (the
// audit log, the refused step-ups included), turning the scheduled backups
// off or shortening their retention leaves the instance without a recovery
// point, and opening sign-up lets anyone in: those directions ask for the
// step-up. "Run cleanup now" and "Run now" (backup) do not: the first only
// applies a retention that is itself gated, the second only adds a file.
adminRouter.put('/config/retention', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = retentionConfigSchema.parse(req.body);
    const { allowed, audit } = await stepUpIfWeakening(req, res, 'retention', (current) => lowersRetention(current, parsed));
    if (!allowed) return;
    const config = await systemConfigService.updateRetention(parsed, req.userId);
    if (audit) auditSuccess(req, audit);
    res.json({ data: config });
  } catch (err) {
    console.error('[admin] PUT /config/retention error:', err);
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.issues });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

adminRouter.put('/config/backup', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = backupConfigSchema.parse(req.body);
    const { allowed, audit } = await stepUpIfWeakening(req, res, 'backup', (current) => weakensBackups(current, parsed));
    if (!allowed) return;
    const config = await systemConfigService.updateBackupConfig(parsed, req.userId);
    if (audit) auditSuccess(req, audit);
    res.json({ data: config });
  } catch (err) {
    console.error('[admin] PUT /config/backup error:', err);
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.issues });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

adminRouter.post('/config/test/smtp', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
  // Checked before the step-up, so a typo in the address spends no backup code.
  const parsed = smtpTestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR' });
    return;
  }
  const { email } = parsed.data;
  try {
    const audit = configAudit('CONFIG_TEST', 'smtp');
    if (!(await stepUp(req, res, audit))) return;
    auditSuccess(req, audit);
    let result: { success: boolean; error?: string };
    if (email) {
      result = await emailService.sendTestEmail(email);
    } else {
      result = await emailService.testConnection();
    }
    res.json({ data: result });
  } catch (err) {
    console.error('[admin] POST /config/test/smtp error:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

adminRouter.post('/config/test/gotify', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const audit = configAudit('CONFIG_TEST', 'gotify');
    if (!(await stepUp(req, res, audit))) return;
    auditSuccess(req, audit);
    // #767: the same delivery as members' notifications (instance URL, app
    // token as X-Gotify-Key, SSRF check, no redirect followed).
    const result = await gotifyService.post(
      'Glou — Test',
      'Notification de test depuis le panneau admin. / Test notification from the admin panel.',
    );
    if (!result.success && result.error !== 'DELIVERY_FAILED') {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ data: result });
  } catch (err) {
    console.error('[admin] POST /config/test/gotify error:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

// ─── Network Configuration & External Access (FEAT-54) ──────────────────────

adminRouter.put('/config/network', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = networkConfigSchema.parse(req.body);
    const audit = configAudit('CONFIG_UPDATE', 'network');
    if (!(await stepUp(req, res, audit))) return;
    const config = await systemConfigService.updateNetworkConfig(parsed, req.userId);
    auditSuccess(req, audit);
    res.json({ data: config });
  } catch (err) {
    console.error('[admin] PUT /config/network error:', err);
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.issues });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

adminRouter.post('/config/network/check', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await systemConfigService.checkNetworkConsistency();
    res.json({ data: result });
  } catch (err) {
    console.error('[admin] POST /config/network/check error:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

// #893: opening sign-up asks for the step-up (see /config/retention), closing it does not.
adminRouter.put('/config/registration', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = registrationConfigSchema.parse(req.body);
    const { allowed, audit } = await stepUpIfWeakening(req, res, 'registration', (current) => opensRegistration(current, parsed));
    if (!allowed) return;
    const config = await systemConfigService.updateRegistrationConfig(parsed, req.userId);
    if (audit) auditSuccess(req, audit);
    res.json({ data: config });
  } catch (err) {
    console.error('[admin] PUT /config/registration error:', err);
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.issues });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

adminRouter.get('/config/history', async (_req: Request, res: Response): Promise<void> => {
  const history = await systemConfigService.getHistory(100);
  res.json({ data: history });
});

// ─── Scheduled Backups (FEAT-18) ─────────────────────────────────────────────

/**
 * @route   GET /api/admin/backups/runs
 * @desc    Paginated history of backup runs
 * @access  Admin Private
 */
adminRouter.get('/backups/runs', async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit } = backupRunsQuerySchema.parse(req.query);
    const runs = await prisma.backupRun.findMany({
      take: limit ?? 50,
      orderBy: { runAt: 'desc' },
    });
    res.json({ data: runs });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: error.issues });
      return;
    }
    console.error('[Admin] Error fetching backup runs:', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * @route   GET /api/admin/backups/health
 * @desc    Whether the API can write to its backups folder (#537)
 * @access  Admin
 */
adminRouter.get('/backups/health', async (_req: Request, res: Response): Promise<void> => {
  const data: BackupHealth = { directoryWritable: backupService.isBackupsDirWritable() };
  try {
    // #756: also whether automatic backups run and when one last succeeded,
    // so the admin page can warn when the instance has no recovery point.
    Object.assign(data, await backupService.getStatus());
  } catch (error) {
    // The folder check (#537) still answers when the database read fails.
    console.error('[Admin] Error reading backup status:', error);
  }
  res.json({ data });
});

/**
 * @route   POST /api/admin/backups/run
 * @desc    Trigger an immediate manual backup
 * @access  Admin Private
 */
adminRouter.post('/backups/run', async (req: Request, res: Response): Promise<void> => {
  try {
    const run = await backupService.runBackup('manual', req.userId);
    res.json({ data: run });
  } catch (error) {
    console.error('[Admin] Manual backup error:', error);
    res.status(500).json({ error: 'BACKUP_FAILED' });
  }
});

/**
 * @route   POST /api/admin/backups/:id/restore
 * @desc    DESTRUCTIVE — restores the database from a previous backup run,
 *          after a safety backup of the current state.
 *          Requires an explicit `confirm: true` in the body on top of admin
 *          auth, so a scripted/direct API call can never trigger it by
 *          accident (the frontend additionally requires a typed keyword).
 * @access  Admin Private
 */
adminRouter.post('/backups/:id/restore', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  try {
    backupRestoreSchema.parse(req.body);
    const run = await prisma.backupRun.findUnique({ where: { id } });
    if (!run || !run.success || !run.filePath) {
      res.status(404).json({ error: 'BACKUP_NOT_FOUND' });
      return;
    }
    // #489 / #890: the step-up, checked once the backup is known to exist so
    // a wrong id spends no backup code. The restore audits its own outcome.
    if (!(await stepUp(req, res, { action: 'BACKUP_RESTORE', details: { backupRunId: id } }))) return;
    // Takes a safety backup first and refuses the restore if it fails (#666).
    const { safetyBackupRunId } = await backupService.restoreBackup(run.filePath, req.userId, getClientIp(req));
    res.json({ data: { ok: true, safetyBackupRunId } });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'CONFIRMATION_REQUIRED', details: error.issues });
      return;
    }
    const msg = error instanceof Error ? error.message : '';
    // #471 (lot Z): a backup of another version of Glou is refused, nothing restored.
    if (msg === 'BACKUP_FROM_OLDER_VERSION' || msg === 'BACKUP_FROM_NEWER_VERSION') {
      res.status(409).json({ error: msg });
      return;
    }
    // #748: the file was deleted from the backups folder; same code as a download.
    if (msg === 'BACKUP_FILE_NOT_FOUND') {
      res.status(404).json({ error: 'BACKUP_FILE_MISSING' });
      return;
    }
    // #748: stable codes only; the raw failure (psql's stderr) stays in the log.
    console.error('[Admin] Backup restore error:', error);
    res.status(500).json({ error: msg === 'BACKUP_BEFORE_RESTORE_FAILED' ? msg : 'RESTORE_FAILED' });
  }
});

/**
 * @route   POST /api/admin/backups/:id/download
 * @desc    Downloads a previous backup dump file. POST, not GET: the admin's
 *          password and code travel in the body (#489, #890) — a dump holds
 *          every password hash of the instance (2FA secrets are encrypted
 *          with CONFIG_ENCRYPTION_KEY since #613).
 * @access  Admin Private
 */
adminRouter.post('/backups/:id/download', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  try {
    // Found first, so a stale id spends no backup code (as for a restore).
    const { path: filePath, filename } = await backupService.getDownloadTarget(id);
    const audit: StepUpAudit = { action: 'BACKUP_DOWNLOAD', details: { backupRunId: id } };
    if (!(await stepUp(req, res, audit))) return;
    auditSuccess(req, audit);
    res.download(filePath, filename, (err) => {
      if (err) console.error('[Admin] Backup download stream error:', err);
    });
  } catch (error) {
    console.error('[Admin] Backup download error:', error);
    const msg = error instanceof Error ? error.message : 'DOWNLOAD_FAILED';
    if (msg === 'BACKUP_NOT_FOUND' || msg === 'BACKUP_FILE_MISSING') {
      res.status(404).json({ error: msg });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

export default adminRouter;
