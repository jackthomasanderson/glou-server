import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import { MaintenanceService } from '../services/maintenance.service';

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

    // Prevent admin from removing their own admin privileges by accident
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
            },
        });
        res.json({ data: user });
    } catch (error: any) {
        console.error('[Admin] Error updating user role:', error);
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'USER_NOT_FOUND' });
            return;
        }
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});


/**
 * @route   POST /api/admin/maintenance/purge
 * @desc    Purge all business data (bottles, cellars, logs)
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

export default adminRouter;
