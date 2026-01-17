import { prisma } from '../lib/prisma.js';
import type { Bottle } from '../schemas/bottles.js';

export interface AlertPreferences {
    userId: string;
    daysBeforePeak: number;
    enableEmail: boolean;
    enableInApp: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
}

export interface Notification {
    id: string;
    userId: string;
    type: string;
    title: string;
    message?: string;
    data?: any;
    read: boolean;
    createdAt: Date;
}

/**
 * Repository for alert and notification data access
 */
export class AlertRepository {
    /**
     * Get bottles by alert status
     */
    async getBottlesByAlertStatus(
        userId: string,
        alertStatuses: string[]
    ): Promise<any[]> {
        return prisma.bottles.findMany({
            where: {
                user_id: userId,
                alert_status: { in: alertStatuses },
            },
            orderBy: [
                { alert_status: 'desc' }, // critical first
                { peak_maturity_to: 'asc' }, // closest to end date
            ],
        });
    }

    /**
     * Update alert status for a bottle
     */
    async updateBottleAlertStatus(
        bottleId: string,
        alertStatus: string
    ): Promise<void> {
        await prisma.bottles.update({
            where: { id: bottleId },
            data: { alert_status: alertStatus },
        });
    }

    /**
     * Batch update alert statuses
     */
    async batchUpdateAlertStatuses(
        updates: Array<{ bottleId: string; alertStatus: string }>
    ): Promise<void> {
        await prisma.$transaction(
            updates.map(({ bottleId, alertStatus }) =>
                prisma.bottles.update({
                    where: { id: bottleId },
                    data: { alert_status: alertStatus },
                })
            )
        );
    }

    /**
     * Get user alert preferences
     */
    async getAlertPreferences(userId: string): Promise<AlertPreferences | null> {
        const prefs = await prisma.alert_preferences.findUnique({
            where: { user_id: userId },
        });

        if (!prefs) return null;

        return {
            userId: prefs.user_id,
            daysBeforePeak: prefs.days_before_peak,
            enableEmail: prefs.enable_email,
            enableInApp: prefs.enable_in_app,
            quietHoursStart: prefs.quiet_hours_start ?? undefined,
            quietHoursEnd: prefs.quiet_hours_end ?? undefined,
        };
    }

    /**
     * Update or create user alert preferences
     */
    async upsertAlertPreferences(
        preferences: AlertPreferences
    ): Promise<AlertPreferences> {
        const result = await prisma.alert_preferences.upsert({
            where: { user_id: preferences.userId },
            update: {
                days_before_peak: preferences.daysBeforePeak,
                enable_email: preferences.enableEmail,
                enable_in_app: preferences.enableInApp,
                quiet_hours_start: preferences.quietHoursStart ?? null,
                quiet_hours_end: preferences.quietHoursEnd ?? null,
                updated_at: new Date(),
            },
            create: {
                user_id: preferences.userId,
                days_before_peak: preferences.daysBeforePeak,
                enable_email: preferences.enableEmail,
                enable_in_app: preferences.enableInApp,
                quiet_hours_start: preferences.quietHoursStart ?? null,
                quiet_hours_end: preferences.quietHoursEnd ?? null,
            },
        });

        return {
            userId: result.user_id,
            daysBeforePeak: result.days_before_peak,
            enableEmail: result.enable_email,
            enableInApp: result.enable_in_app,
            quietHoursStart: result.quiet_hours_start ?? undefined,
            quietHoursEnd: result.quiet_hours_end ?? undefined,
        };
    }

    /**
     * Create a notification
     */
    async createNotification(notification: {
        userId: string;
        type: string;
        title: string;
        message?: string;
        data?: any;
    }): Promise<Notification> {
        const result = await prisma.notifications.create({
            data: {
                user_id: notification.userId,
                type: notification.type,
                title: notification.title,
                message: notification.message,
                data: notification.data,
            },
        });

        return {
            id: result.id,
            userId: result.user_id,
            type: result.type,
            title: result.title,
            message: result.message ?? undefined,
            data: result.data,
            read: result.read,
            createdAt: result.created_at,
        };
    }

    /**
     * Get notifications for a user
     */
    async getNotifications(
        userId: string,
        options?: {
            read?: boolean;
            type?: string;
            limit?: number;
        }
    ): Promise<Notification[]> {
        const where: any = { user_id: userId };
        if (options?.read !== undefined) {
            where.read = options.read;
        }
        if (options?.type) {
            where.type = options.type;
        }

        const results = await prisma.notifications.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take: options?.limit ?? 50,
        });

        return results.map((r) => ({
            id: r.id,
            userId: r.user_id,
            type: r.type,
            title: r.title,
            message: r.message ?? undefined,
            data: r.data,
            read: r.read,
            createdAt: r.created_at,
        }));
    }

    /**
     * Mark notification as read
     */
    async markNotificationRead(notificationId: string): Promise<void> {
        await prisma.notifications.update({
            where: { id: notificationId },
            data: { read: true },
        });
    }

    /**
     * Delete notification
     */
    async deleteNotification(notificationId: string): Promise<void> {
        await prisma.notifications.delete({
            where: { id: notificationId },
        });
    }

    /**
     * Get count of unread notifications
     */
    async getUnreadCount(userId: string): Promise<number> {
        return prisma.notifications.count({
            where: {
                user_id: userId,
                read: false,
            },
        });
    }
}
