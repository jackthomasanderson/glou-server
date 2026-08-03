import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import { MaintenanceService } from '../services/maintenance.service';
import { maturityReferenceSchema, maturityReferencePatchSchema } from '../schemas/maturity-reference.schema';
import { retentionConfigSchema, maintenanceRunsQuerySchema } from '../schemas/retention.schema';
import { maturityReferenceService } from '../services/maturity-reference.service';
import { systemConfigService } from '../services/system-config.service';
import { emailService } from '../services/email.service';

const adminRouter = Router();

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
    const { userId } = req.params;
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
    const { userId } = req.params;
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
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
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
  try {
    const refs = await maturityReferenceService.list();
    res.json({ data: refs });
  } catch {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

adminRouter.post('/maturity-references', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = maturityReferenceSchema.parse(req.body);
    const ref = await maturityReferenceService.create(data);
    res.status(201).json({ data: ref });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

adminRouter.patch('/maturity-references/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const patch = maturityReferencePatchSchema.parse(req.body);
    const ref = await maturityReferenceService.update(id, patch);
    if (!ref) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
    res.json({ data: ref });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

adminRouter.delete('/maturity-references/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const ok = await maturityReferenceService.delete(id);
    if (!ok) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
    res.json({ data: { deleted: true } });
  } catch {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

// ─── System Configuration (FEAT-34/53) ───────────────────────────────────────

adminRouter.get('/config', async (_req: Request, res: Response): Promise<void> => {
  try {
    const config = await systemConfigService.getPublic();
    res.json({ data: config });
  } catch {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

adminRouter.put('/config/smtp', async (req: Request, res: Response): Promise<void> => {
  try {
    const { smtpEnabled, smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpSecure } = req.body;
    const config = await systemConfigService.updateSmtp(
      { smtpEnabled, smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpSecure },
      req.userId,
    );
    res.json({ data: config });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'INTERNAL_SERVER_ERROR';
    res.status(500).json({ error: msg });
  }
});

adminRouter.put('/config/gotify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { gotifyEnabled, gotifyUrl, gotifyToken } = req.body;
    const config = await systemConfigService.updateGotify(
      { gotifyEnabled, gotifyUrl, gotifyToken },
      req.userId,
    );
    res.json({ data: config });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'INTERNAL_SERVER_ERROR';
    res.status(500).json({ error: msg });
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
    const msg = err instanceof Error ? err.message : 'INTERNAL_SERVER_ERROR';
    res.status(500).json({ error: msg });
  }
});

adminRouter.put('/config/integrations', async (req: Request, res: Response): Promise<void> => {
  try {
    const { vivinoKey, whiskybaseKey, ocrUrl } = req.body;
    const config = await systemConfigService.updateIntegrations({ vivinoKey, whiskybaseKey, ocrUrl }, req.userId);
    res.json({ data: config });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'INTERNAL_SERVER_ERROR';
    res.status(500).json({ error: msg });
  }
});

adminRouter.put('/config/retention', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = retentionConfigSchema.parse(req.body);
    const config = await systemConfigService.updateRetention(parsed, req.userId);
    res.json({ data: config });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    const msg = err instanceof Error ? err.message : 'INTERNAL_SERVER_ERROR';
    res.status(500).json({ error: msg });
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
    const msg = err instanceof Error ? err.message : 'INTERNAL_SERVER_ERROR';
    res.status(500).json({ error: msg });
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
    const url = gotifyFull.gotifyUrl!;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (gotifyFull.gotifyToken) headers['X-Gotify-Key'] = gotifyFull.gotifyToken;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: 'Glou — Test', message: 'Notification de test depuis le panneau admin.' }),
      signal: AbortSignal.timeout(5000),
    });
    res.json({ data: { success: response.ok, status: response.status } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'FETCH_ERROR';
    res.json({ data: { success: false, error: msg } });
  }
});

adminRouter.get('/config/history', async (_req: Request, res: Response): Promise<void> => {
  try {
    const history = await systemConfigService.getHistory(100);
    res.json({ data: history });
  } catch {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

export default adminRouter;
