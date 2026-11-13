import { Router, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError, badRequest, conflict, isRecordNotFound, notFound } from '../lib/errors';
import { routeParam } from '../lib/http';
import { assertUrlAllowed } from '../lib/ssrf';
import { authMiddleware, adminMiddleware, getClientIp } from '../middleware/auth.middleware';
import { isDatabaseUnavailable } from '../middleware/error.middleware';
import { MaintenanceService } from '../services/maintenance.service';
import { paginationQuerySchema } from '../schemas/pagination.schema';
import { maturityReferenceSchema, maturityReferencePatchSchema, maturityReferenceReorderSchema } from '../schemas/maturity-reference.schema';
import { retentionConfigSchema, maintenanceRunsQuerySchema } from '../schemas/retention.schema';
import { networkConfigSchema } from '../schemas/network-config.schema';
import { registrationConfigSchema } from '../schemas/registration-config.schema';
import { smtpConfigSchema, smtpTestSchema, gotifyConfigSchema } from '../schemas/system-config.schema';
import { memberRoleSchema, memberStatusSchema, memberDeletionSchema } from '../schemas/admin-user.schema';
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
import { deleteMemberForGood } from '../services/account-deletion.service';
import { scanService } from '../services/scan.service';
import { countOtherAdmins, countOtherAdminsLocked } from '../lib/last-admin';
import { RELEASE_NOTES, releaseNotesView, seenStateNow } from '../lib/release-notes';
import { APP_VERSION } from '../lib/app-version';
import type { ReleaseNotesView } from '../../../shared/release-notes';

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

// #467: the error middleware answers every failure (a ZodError: 400
// VALIDATION_ERROR; a database outage: 503). A catch below only maps a
// business refusal to its code, then rethrows anything else.

/**
 * @route   GET /api/admin/users
 * @desc    Get all users listing
 * @access  Admin Private
 */
adminRouter.get('/users', async (req: Request, res: Response): Promise<void> => {
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
            // #661: a deletion asked by the member or scheduled by an admin.
            deletionRequestedAt: true,
            createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
    });
    res.json({ data: users });
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
        // Checked again in the transaction below; here so a refusal spends no backup code.
        if (!isAdmin && (await countOtherAdmins(prisma, userId)) === 0) {
            res.status(409).json({ error: 'CANNOT_REMOVE_LAST_ADMIN' });
            return;
        }
        // #638: granting the role hands the session holder a second admin
        // account. #603: removing it is gated too — a stolen session could
        // otherwise demote the other admins and stay the only one.
        const audit: StepUpAudit = { action: 'ADMIN_ROLE_CHANGE', details: { targetUserId: userId, isAdmin } };
        if (!(await stepUp(req, res, audit))) return;
        const user = await prisma.$transaction(async (tx) => {
            // Review of #975: two admins demoting each other at once would leave none.
            if (!isAdmin && (await countOtherAdminsLocked(tx, userId)) === 0) throw new Error('CANNOT_REMOVE_LAST_ADMIN');
            return tx.user.update({
                where: { id: userId },
                // FEAT-115 (#990): a new administrator starts with the installed
                // release notes seen, not the whole history in the What's New? window.
                data: isAdmin ? { isAdmin, ...seenStateNow(RELEASE_NOTES, APP_VERSION) } : { isAdmin },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    isAdmin: true,
                    isActive: true,
                },
            });
        });
        auditSuccess(req, audit);
        res.json({ data: user });
    } catch (error: unknown) {
        if (error instanceof Error && error.message === 'CANNOT_REMOVE_LAST_ADMIN') {
            res.status(409).json({ error: 'CANNOT_REMOVE_LAST_ADMIN' });
            return;
        }
        if (isRecordNotFound(error)) {
            res.status(404).json({ error: 'USER_NOT_FOUND' });
            return;
        }
        throw error;
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
        // Prevent deactivating the last active admin (admins already leaving
        // do not count, as in the transaction below).
        if (!isActive && target.isAdmin && (await countOtherAdmins(prisma, userId)) === 0) {
            res.status(400).json({ error: 'CANNOT_DEACTIVATE_LAST_ADMIN' });
            return;
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
            // Review of #975: counted again with the admin rows locked, so two
            // admins deactivating each other at once cannot both pass.
            if (!isActive && target.isAdmin && (await countOtherAdminsLocked(tx, userId)) === 0) {
                throw new Error('CANNOT_DEACTIVATE_LAST_ADMIN');
            }
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
        if (error instanceof Error && error.message === 'CANNOT_DEACTIVATE_LAST_ADMIN') {
            res.status(400).json({ error: 'CANNOT_DEACTIVATE_LAST_ADMIN' });
            return;
        }
        if (isRecordNotFound(error)) {
            res.status(404).json({ error: 'USER_NOT_FOUND' });
            return;
        }
        throw error;
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
        throw error;
    }
});

/**
 * #695, #661: why a member's account may not be deleted, checked before the
 * step-up so a refusal spends no backup code: the admin's own account (their
 * profile has its own path), an unknown one, or the last admin — admins
 * already leaving do not count, as for a member's own request (#603).
 */
async function refuseMemberDeletion(req: Request, res: Response, userId: string) {
    if (userId === req.userId) {
        res.status(400).json({ error: 'CANNOT_DELETE_SELF' });
        return null;
    }
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true, deletionRequestedAt: true } });
    if (!target) {
        res.status(404).json({ error: 'USER_NOT_FOUND' });
        return null;
    }
    if (target.isAdmin && (await countOtherAdmins(prisma, userId)) === 0) {
        res.status(409).json({ error: 'CANNOT_DELETE_LAST_ADMIN' });
        return null;
    }
    return target;
}

/**
 * @route   POST /api/admin/users/:userId/delete
 * @desc    #695 — deletes a member's account for good, after the admin's
 *          password (and code). What they created in the shared inventory
 *          is attributed to the admin, their history stays under their name,
 *          their personal data goes (account-deletion.service). Audited.
 * @access  Admin Private
 */
adminRouter.post('/users/:userId/delete', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
    const userId = routeParam(req.params.userId);
    try {
        if (!(await refuseMemberDeletion(req, res, userId))) return;
        const audit: StepUpAudit = { action: 'ADMIN_MEMBER_DELETE', details: { targetUserId: userId } };
        if (!(await stepUp(req, res, audit))) return;
        const deleted = await deleteMemberForGood(userId, req.userId);
        // The rows are committed: now the files they pointed at can go.
        await scanService.deleteScanFiles(deleted.scanImagePaths);
        await authService.deleteAvatarFiles(deleted.avatarPaths);
        // The account is gone: its name is kept in the entry.
        auditSuccess(req, { action: audit.action, details: { ...audit.details, username: deleted.username } });
        res.json({ data: { id: userId } });
    } catch (error) {
        if (error instanceof Error && error.message === 'CANNOT_DELETE_LAST_ADMIN') {
            res.status(409).json({ error: 'CANNOT_DELETE_LAST_ADMIN' });
            return;
        }
        if (isRecordNotFound(error)) {
            res.status(404).json({ error: 'USER_NOT_FOUND' });
            return;
        }
        throw error;
    }
});

/**
 * @route   PUT /api/admin/users/:userId/deletion
 * @desc    #661 — schedules a member's account deletion (`scheduled: true`),
 *          carried out after the same 30 days as their own request, or
 *          cancels it. For a member who left and can no longer sign in.
 *          Asks for the admin's password (and code). Audited.
 * @access  Admin Private
 */
adminRouter.put('/users/:userId/deletion', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
    const userId = routeParam(req.params.userId);
    const parsed = memberDeletionSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'INVALID_INPUT' });
        return;
    }
    const { scheduled } = parsed.data;
    try {
        const target = await refuseMemberDeletion(req, res, userId);
        if (!target) return;
        if (scheduled && target.deletionRequestedAt) {
            // Asking again must not push the date back.
            res.status(409).json({ error: 'DELETION_ALREADY_SCHEDULED' });
            return;
        }
        const audit: StepUpAudit = { action: 'ADMIN_DELETION_SCHEDULE', details: { targetUserId: userId, scheduled } };
        if (!(await stepUp(req, res, audit))) return;
        const user = await prisma.$transaction(async (tx) => {
            // Counted again, admin rows locked: two admins scheduling each
            // other's deletion at once cannot both be marked as leaving.
            if (scheduled && target.isAdmin && (await countOtherAdminsLocked(tx, userId)) === 0) {
                throw new Error('CANNOT_DELETE_LAST_ADMIN');
            }
            return tx.user.update({
                where: { id: userId },
                data: { deletionRequestedAt: scheduled ? new Date() : null },
                select: { id: true, deletionRequestedAt: true },
            });
        });
        auditSuccess(req, audit);
        res.json({ data: user });
    } catch (error) {
        if (error instanceof Error && error.message === 'CANNOT_DELETE_LAST_ADMIN') {
            res.status(409).json({ error: 'CANNOT_DELETE_LAST_ADMIN' });
            return;
        }
        if (isRecordNotFound(error)) {
            res.status(404).json({ error: 'USER_NOT_FOUND' });
            return;
        }
        throw error;
    }
});

/**
 * @route   POST /api/admin/users/:userId/export
 * @desc    #661 — a member's full data export (the one they get from their
 *          profile), for a member who left and can no longer sign in. Asks
 *          for the admin's password (and code). Audited.
 * @access  Admin Private
 */
adminRouter.post('/users/:userId/export', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
    const userId = routeParam(req.params.userId);
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) {
        res.status(404).json({ error: 'USER_NOT_FOUND' });
        return;
    }
    const audit: StepUpAudit = { action: 'ADMIN_MEMBER_EXPORT', details: { targetUserId: userId } };
    if (!(await stepUp(req, res, audit))) return;
    const data = await authService.exportUserData(userId);
    auditSuccess(req, audit);
    res.json({ data });
});

/**
 * @route   GET /api/admin/release-notes
 * @desc    FEAT-115 (#990): the release notes of the installed version and the
 *          older ones (plus the upcoming ones on a beta image), each marked
 *          seen or not by this administrator. The What's New? window opens by
 *          itself when one is unseen, and reopens on demand with all of them.
 * @access  Admin Private
 */
adminRouter.get('/release-notes', async (req: Request, res: Response): Promise<void> => {
    const seen = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { lastSeenReleaseVersion: true, seenReleaseNoteIds: true },
    });
    const view: ReleaseNotesView = releaseNotesView(RELEASE_NOTES, APP_VERSION, seen ?? { lastSeenReleaseVersion: null, seenReleaseNoteIds: [] });
    res.json({ data: view });
});

/**
 * @route   POST /api/admin/release-notes/seen
 * @desc    FEAT-115 (#990): the What's New? window was closed, whichever way:
 *          everything installed counts as seen by this administrator, on every
 *          device. Personal state, like the onboarding: not audited.
 * @access  Admin Private
 */
adminRouter.post('/release-notes/seen', async (req: Request, res: Response): Promise<void> => {
    await prisma.user.update({
        where: { id: req.userId },
        data: seenStateNow(RELEASE_NOTES, APP_VERSION),
        select: { id: true },
    });
    res.status(204).end();
});

/**
 * @route   GET /api/admin/shares
 * @desc    #486: every member's guest links still in force — who made each,
 *          for whom, what it opens and until when. Never the link itself.
 * @access  Admin Private
 */
adminRouter.get('/shares', async (_req: Request, res: Response): Promise<void> => {
    res.json({ data: await sharesService.listActiveForAdmin() });
});

/**
 * @route   DELETE /api/admin/shares/:id
 * @desc    #486: revoke any member's guest link (a leaked link, a guest who
 *          should no longer see the cellar). Audited.
 * @access  Admin Private
 */
adminRouter.delete('/shares/:id', async (req: Request, res: Response): Promise<void> => {
    const id = routeParam(req.params.id);
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
            // #695: a member deleted for good, under the name kept on the row.
            { actorName: { contains: q, mode: 'insensitive' } },
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

    // #489: re-authenticate (#890: with the admin's code too), take a
    // backup first (abort if it fails), and leave a trace of who purged,
    // written after the purge since the purge wipes the audit log itself.
    if (!(await stepUp(req, res, { action: 'PURGE', details: {} }))) return;
    const backup = await backupService.runBackup('manual', req.userId);
    // The run's own failure is in the backup history (#467: a stable code here).
    if (!backup.success) throw new AppError(500, 'BACKUP_BEFORE_PURGE_FAILED');
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
});

/**
 * @route   GET /api/admin/maintenance/runs
 * @desc    Paginated history of retention cleanup runs (FEAT-39)
 * @access  Admin Private
 */
adminRouter.get('/maintenance/runs', async (req: Request, res: Response): Promise<void> => {
    const { limit } = maintenanceRunsQuerySchema.parse(req.query);
    const runs = await prisma.maintenanceRun.findMany({
        take: limit ?? 50,
        orderBy: { runAt: 'desc' },
    });
    res.json({ data: runs });
});

/**
 * @route   POST /api/admin/maintenance/run
 * @desc    Trigger an immediate data retention cleanup (FEAT-39)
 * @access  Admin Private
 */
adminRouter.post('/maintenance/run', async (req: Request, res: Response): Promise<void> => {
    const run = await MaintenanceService.runRetentionCleanup('manual', req.userId);
    res.json({ data: run });
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
  const parsed = smtpConfigSchema.parse(req.body);
  const audit = configAudit('CONFIG_UPDATE', 'smtp');
  if (!(await stepUp(req, res, audit))) return;
  const config = await systemConfigService.updateSmtp(parsed, req.userId);
  auditSuccess(req, audit);
  res.json({ data: config });
});

adminRouter.put('/config/gotify', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
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
});

// #893: shortening a retention window erases rows at the next cleanup (the
// audit log, the refused step-ups included), turning the scheduled backups
// off or shortening their retention leaves the instance without a recovery
// point, and opening sign-up lets anyone in: those directions ask for the
// step-up. "Run cleanup now" and "Run now" (backup) do not: the first only
// applies a retention that is itself gated, the second only adds a file.
adminRouter.put('/config/retention', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = retentionConfigSchema.parse(req.body);
  const { allowed, audit } = await stepUpIfWeakening(req, res, 'retention', (current) => lowersRetention(current, parsed));
  if (!allowed) return;
  const config = await systemConfigService.updateRetention(parsed, req.userId);
  if (audit) auditSuccess(req, audit);
  res.json({ data: config });
});

adminRouter.put('/config/backup', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = backupConfigSchema.parse(req.body);
  const { allowed, audit } = await stepUpIfWeakening(req, res, 'backup', (current) => weakensBackups(current, parsed));
  if (!allowed) return;
  const config = await systemConfigService.updateBackupConfig(parsed, req.userId);
  if (audit) auditSuccess(req, audit);
  res.json({ data: config });
});

adminRouter.post('/config/test/smtp', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
  // Checked before the step-up, so a typo in the address spends no backup code.
  const parsed = smtpTestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR' });
    return;
  }
  const { email } = parsed.data;
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
});

adminRouter.post('/config/test/gotify', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
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
});

// ─── Network Configuration & External Access (FEAT-54) ──────────────────────

adminRouter.put('/config/network', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = networkConfigSchema.parse(req.body);
  const audit = configAudit('CONFIG_UPDATE', 'network');
  if (!(await stepUp(req, res, audit))) return;
  const config = await systemConfigService.updateNetworkConfig(parsed, req.userId);
  auditSuccess(req, audit);
  res.json({ data: config });
});

adminRouter.post('/config/network/check', async (_req: Request, res: Response): Promise<void> => {
  const result = await systemConfigService.checkNetworkConsistency();
  res.json({ data: result });
});

// #893: opening sign-up asks for the step-up (see /config/retention), closing it does not.
adminRouter.put('/config/registration', stepUpLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = registrationConfigSchema.parse(req.body);
  const { allowed, audit } = await stepUpIfWeakening(req, res, 'registration', (current) => opensRegistration(current, parsed));
  if (!allowed) return;
  const config = await systemConfigService.updateRegistrationConfig(parsed, req.userId);
  if (audit) auditSuccess(req, audit);
  res.json({ data: config });
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
  const { limit } = backupRunsQuerySchema.parse(req.query);
  const runs = await prisma.backupRun.findMany({
    take: limit ?? 50,
    orderBy: { runAt: 'desc' },
  });
  res.json({ data: runs });
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
  const run = await backupService.runBackup('manual', req.userId);
  res.json({ data: run });
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
    if (error instanceof ZodError) throw badRequest('CONFIRMATION_REQUIRED');
    const msg = error instanceof Error ? error.message : '';
    // #471 (lot Z): a backup of another version of Glou is refused, nothing restored.
    if (msg === 'BACKUP_FROM_OLDER_VERSION') throw conflict('BACKUP_FROM_OLDER_VERSION');
    if (msg === 'BACKUP_FROM_NEWER_VERSION') throw conflict('BACKUP_FROM_NEWER_VERSION');
    // #748: the file was deleted from the backups folder; same code as a download.
    if (msg === 'BACKUP_FILE_NOT_FOUND') throw notFound('BACKUP_FILE_MISSING');
    // A database outage stays a 503: retry once it is back.
    if (isDatabaseUnavailable(error)) throw error;
    // #748, #467: stable codes only. Any other failure (psql's stderr, a
    // corrupt dump, psql missing or too slow, an unreadable file) is the
    // cause, written to the log by the error middleware, never sent.
    if (msg === 'BACKUP_BEFORE_RESTORE_FAILED') throw new AppError(500, msg, { cause: error });
    throw new AppError(500, 'RESTORE_FAILED', { cause: error });
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
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'BACKUP_NOT_FOUND') throw notFound('BACKUP_NOT_FOUND');
    if (msg === 'BACKUP_FILE_MISSING') throw notFound('BACKUP_FILE_MISSING');
    throw error;
  }
});

export default adminRouter;
