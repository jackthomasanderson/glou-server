import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { routeParam } from '../lib/http';
import { normalizeGotifyUrl } from '../lib/gotify-url';
import { assertUrlAllowed } from '../lib/ssrf';
import { authMiddleware, adminMiddleware, getClientIp } from '../middleware/auth.middleware';
import { MaintenanceService } from '../services/maintenance.service';
import { paginationQuerySchema } from '../schemas/pagination.schema';
import { maturityReferenceSchema, maturityReferencePatchSchema, maturityReferenceReorderSchema } from '../schemas/maturity-reference.schema';
import { retentionConfigSchema, maintenanceRunsQuerySchema } from '../schemas/retention.schema';
import { networkConfigSchema } from '../schemas/network-config.schema';
import { smtpConfigSchema, gotifyConfigSchema, integrationsConfigSchema } from '../schemas/system-config.schema';
import { backupConfigSchema, backupRunsQuerySchema, backupRestoreSchema } from '../schemas/backup.schema';
import { maturityReferenceService } from '../services/maturity-reference.service';
import { systemConfigService } from '../services/system-config.service';
import { emailService } from '../services/email.service';
import { backupService } from '../services/backup.service';

const adminRouter = Router();

// Audit log pages are bigger than the member-facing lists.
const auditLogsQuerySchema = paginationQuerySchema({ defaultLimit: 50, maxLimit: 100 });

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
adminRouter.post('/users/:userId/role', async (req: Request, res: Response): Promise<void> => {
    const userId = routeParam(req.params.userId);
    const { isAdmin } = req.body;

    if (typeof isAdmin !== 'boolean') {
        res.status(400).json({ error: 'INVALID_INPUT' });
        return;
    }

    // Prevent admin from removing their own admin privileges
    if (req.userId === userId && !isAdmin) {
        res.status(400).json({ error: 'CANNOT_REMOVE_OWN_ADMIN' });
        return;
    }

    try {
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
adminRouter.patch('/users/:userId/status', async (req: Request, res: Response): Promise<void> => {
    const userId = routeParam(req.params.userId);
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
        res.status(400).json({ error: 'INVALID_INPUT' });
        return;
    }

    // Prevent self-deactivation
    if (req.userId === userId && !isActive) {
        res.status(400).json({ error: 'CANNOT_DEACTIVATE_SELF' });
        return;
    }

    try {
        // Prevent deactivating the last active admin
        if (!isActive) {
            const target = await prisma.user.findUnique({
                where: { id: userId },
                select: { isAdmin: true },
            });
            if (target?.isAdmin) {
                const activeAdminCount = await prisma.user.count({
                    where: { isAdmin: true, isActive: true },
                });
                if (activeAdminCount <= 1) {
                    res.status(400).json({ error: 'CANNOT_DEACTIVATE_LAST_ADMIN' });
                    return;
                }
            }
        }

        const user = await prisma.user.update({
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
    const { page, limit } = query.data;
    const skip = (page - 1) * limit;

    try {
        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: { username: true, displayName: true },
                    },
                },
            }),
            prisma.auditLog.count(),
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
adminRouter.post('/maintenance/purge', async (req: Request, res: Response): Promise<void> => {
    const { confirmation } = req.body;

    if (confirmation !== 'SUPPRIMER') {
        res.status(400).json({ error: 'INVALID_CONFIRMATION' });
        return;
    }

    try {
        const result = await MaintenanceService.purgeAllData();
        res.json({ data: result });
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
            res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
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

adminRouter.put('/config/smtp', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = smtpConfigSchema.parse(req.body);
    const config = await systemConfigService.updateSmtp(parsed, req.userId);
    res.json({ data: config });
  } catch (err) {
    console.error('[admin] PUT /config/smtp error:', err);
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

adminRouter.put('/config/gotify', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = gotifyConfigSchema.parse(req.body);
    // ISSUE_048: this address is fetched server-side on every test and every
    // delivery — same guard as the per-member webhook, applied at save time.
    if (parsed.gotifyUrl) {
      try {
        await assertUrlAllowed(parsed.gotifyUrl);
      } catch (err) {
        console.error('[admin] PUT /config/gotify error:', err);
        res.status(400).json({ error: 'INVALID_URL' });
        return;
      }
    }
    const config = await systemConfigService.updateGotify(parsed, req.userId);
    res.json({ data: config });
  } catch (err) {
    console.error('[admin] PUT /config/gotify error:', err);
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

adminRouter.put('/config/notifications', async (req: Request, res: Response): Promise<void> => {
  try {
    const { smtpEnabled, gotifyEnabled, inAppEnabled } = req.body;
    if (typeof smtpEnabled !== 'boolean' || typeof gotifyEnabled !== 'boolean' || typeof inAppEnabled !== 'boolean') {
      res.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    const config = await systemConfigService.updateNotificationPolicy({ smtpEnabled, gotifyEnabled, inAppEnabled }, req.userId);
    res.json({ data: config });
  } catch (err) {
    console.error('[admin] PUT /config/notifications error:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

adminRouter.put('/config/integrations', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = integrationsConfigSchema.parse(req.body);
    // ISSUE_048: defense in depth, even though nothing reads this field today.
    if (parsed.ocrUrl) {
      try {
        await assertUrlAllowed(parsed.ocrUrl);
      } catch (err) {
        console.error('[admin] PUT /config/integrations error:', err);
        res.status(400).json({ error: 'INVALID_URL' });
        return;
      }
    }
    const config = await systemConfigService.updateIntegrations(parsed, req.userId);
    res.json({ data: config });
  } catch (err) {
    console.error('[admin] PUT /config/integrations error:', err);
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

adminRouter.put('/config/retention', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = retentionConfigSchema.parse(req.body);
    const config = await systemConfigService.updateRetention(parsed, req.userId);
    res.json({ data: config });
  } catch (err) {
    console.error('[admin] PUT /config/retention error:', err);
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

adminRouter.put('/config/backup', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = backupConfigSchema.parse(req.body);
    const config = await systemConfigService.updateBackupConfig(parsed, req.userId);
    res.json({ data: config });
  } catch (err) {
    console.error('[admin] PUT /config/backup error:', err);
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

adminRouter.post('/config/test/smtp', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    let result: { success: boolean; error?: string };
    if (email) {
      result = await emailService.sendTestEmail(email as string);
    } else {
      result = await emailService.testConnection();
    }
    res.json({ data: result });
  } catch (err) {
    console.error('[admin] POST /config/test/smtp error:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

adminRouter.post('/config/test/gotify', async (req: Request, res: Response): Promise<void> => {
  try {
    const cfg = await systemConfigService.getPublic();
    if (!cfg.gotifyEnabled || !cfg.gotifyUrl) {
      res.status(400).json({ error: 'GOTIFY_NOT_CONFIGURED' });
      return;
    }
    const gotifyFull = await systemConfigService.getGotify();
    const url = normalizeGotifyUrl(gotifyFull.gotifyUrl!);

    // ISSUE_048: re-validated here too (the save-time check at PUT
    // /config/gotify can't cover a URL set before this guard existed).
    try {
      await assertUrlAllowed(url);
    } catch (err) {
      console.error('[admin] POST /config/test/gotify error:', err);
      res.status(400).json({ error: 'INVALID_URL' });
      return;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (gotifyFull.gotifyToken) headers['X-Gotify-Key'] = gotifyFull.gotifyToken;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: 'Glou — Test',
          message: 'Notification de test depuis le panneau admin. / Test notification from the admin panel.',
        }),
        signal: AbortSignal.timeout(5000),
      });
      // The raw HTTP status / network error message is a reconnaissance
      // instrument for mapping what the server container can reach
      // internally — a stable, generic code is returned instead.
      res.json({ data: response.ok ? { success: true } : { success: false, error: 'DELIVERY_FAILED' } });
    } catch (err) {
      console.error('[admin] POST /config/test/gotify error:', err);
      res.json({ data: { success: false, error: 'DELIVERY_FAILED' } });
    }
  } catch (err) {
    console.error('[admin] POST /config/test/gotify error:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

// ─── Network Configuration & External Access (FEAT-54) ──────────────────────

adminRouter.put('/config/network', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = networkConfigSchema.parse(req.body);
    const config = await systemConfigService.updateNetworkConfig(parsed, req.userId);
    res.json({ data: config });
  } catch (err) {
    console.error('[admin] PUT /config/network error:', err);
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
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
      res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
      return;
    }
    console.error('[Admin] Error fetching backup runs:', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
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
 * @desc    DESTRUCTIVE — restores the database from a previous backup run.
 *          Requires an explicit `confirm: true` in the body on top of admin
 *          auth, so a scripted/direct API call can never trigger it by
 *          accident (the frontend additionally requires a typed keyword).
 * @access  Admin Private
 */
adminRouter.post('/backups/:id/restore', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  try {
    backupRestoreSchema.parse(req.body);
    const run = await prisma.backupRun.findUnique({ where: { id } });
    if (!run || !run.success || !run.filePath) {
      res.status(404).json({ error: 'BACKUP_NOT_FOUND' });
      return;
    }
    await backupService.restoreBackup(run.filePath, req.userId, getClientIp(req));
    res.json({ data: { ok: true } });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'CONFIRMATION_REQUIRED', details: error.errors });
      return;
    }
    console.error('[Admin] Backup restore error:', error);
    const msg = error instanceof Error ? error.message : 'RESTORE_FAILED';
    res.status(500).json({ error: msg });
  }
});

/**
 * @route   GET /api/admin/backups/:id/download
 * @desc    Downloads a previous backup dump file
 * @access  Admin Private
 */
adminRouter.get('/backups/:id/download', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  try {
    const { path: filePath, filename } = await backupService.getDownloadTarget(id);
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
