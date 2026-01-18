import { Router } from 'express';
import { AlertService } from '../services/alert.service.js';
import { NotificationService } from '../services/notification.service.js';
import { logger } from '../utils/logger.js';
import { z } from 'zod';
import { authenticateJWT } from '../middleware/jwt.middleware.js';

const router = Router();
router.use(authenticateJWT);

const alertService = new AlertService();
const notificationService = new NotificationService();

/**
 * GET /api/alerts - Get notifications for current user
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { read, type, limit } = req.query;

        const notifications = await notificationService.getNotifications(userId, {
            read: read === 'true' ? true : read === 'false' ? false : undefined,
            type: type as string | undefined,
            limit: limit ? parseInt(limit as string, 10) : undefined,
        });

        res.json({ data: notifications });
    } catch (error) {
        logger.error({ error }, 'Failed to get notifications');
        res.status(500).json({ error: 'Failed to get notifications' });
    }
});

/**
 * POST /api/alerts - Create a new notification
 */
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { title, message, type = 'info', data } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const notification = await notificationService.createInAppNotification({
            userId,
            type,
            title,
            message,
            data
        });

        res.status(201).json({ data: notification });
    } catch (error) {
        logger.error({ error }, 'Failed to create notification');
        res.status(500).json({ error: 'Failed to create notification' });
    }
});

/**
 * GET /api/alerts/unread-count - Get count of unread notifications
 */
router.get('/unread-count', async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const count = await notificationService.getUnreadCount(userId);
        logger.info({ userId, count }, 'Fetched unread notification count');
        res.json({ data: { count } });
    } catch (error) {
        logger.error({ error }, 'Failed to get unread count');
        res.status(500).json({ error: 'Failed to get unread count' });
    }
});

/**
 * PUT /api/alerts/:id/read - Mark notification as read
 */
router.put('/:id/read', async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;

        // Verify notification belongs to user
        const notifications = await notificationService.getNotifications(userId);
        const notification = notifications.find((n) => n.id === id);

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        await notificationService.markNotificationRead(id);
        res.json({ data: { success: true } });
    } catch (error) {
        logger.error({ error }, 'Failed to mark notification as read');
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

/**
 * DELETE /api/alerts/:id - Delete notification
 */
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;

        // Verify notification belongs to user
        const notifications = await notificationService.getNotifications(userId);
        const notification = notifications.find((n) => n.id === id);

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        await notificationService.deleteNotification(id);
        res.json({ data: { success: true } });
    } catch (error) {
        logger.error({ error }, 'Failed to delete notification');
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

/**
 * GET /api/alerts/preferences - Get user alert preferences
 */
router.get('/preferences', async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const preferences = await alertService.getAlertPreferences(userId);
        res.json({ data: preferences });
    } catch (error) {
        logger.error({ error }, 'Failed to get alert preferences');
        res.status(500).json({ error: 'Failed to get alert preferences' });
    }
});

/**
 * PUT /api/alerts/preferences - Update user alert preferences
 */
const updatePreferencesSchema = z.object({
    daysBeforePeak: z.number().int().min(1).max(365).optional(),
    enableEmail: z.boolean().optional(),
    enableInApp: z.boolean().optional(),
    quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

router.put('/preferences', async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const validation = updatePreferencesSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Invalid preferences',
                details: validation.error.issues,
            });
        }

        const preferences = await alertService.updateAlertPreferences(
            userId,
            validation.data
        );

        res.json({ data: preferences });
    } catch (error) {
        logger.error({ error }, 'Failed to update alert preferences');
        res.status(500).json({ error: 'Failed to update alert preferences' });
    }
});

/**
 * POST /api/alerts/refresh - Manually refresh alert statuses for user
 */
router.post('/refresh', async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const result = await alertService.updateBottleAlertStatuses(userId);
        res.json({ data: result });
    } catch (error) {
        logger.error({ error }, 'Failed to refresh alert statuses');
        res.status(500).json({ error: 'Failed to refresh alert statuses' });
    }
});

export default router;
