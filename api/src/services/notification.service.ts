import { AlertRepository } from '../repositories/alert.repository.js';
import { logger } from '../utils/logger.js';
import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma.js';

export interface NotificationData {
    userId: string;
    type: 'peak_maturity' | 'opened_reminder' | 'consumption_plan';
    title: string;
    message?: string;
    data?: any;
}

/**
 * Service for handling notifications (in-app and email)
 */
export class NotificationService {
    private repo: AlertRepository;

    constructor() {
        this.repo = new AlertRepository();
    }

    /**
     * Create an in-app notification
     */
    async createInAppNotification(notification: NotificationData) {
        try {
            const result = await this.repo.createNotification(notification);
            logger.info(
                { userId: notification.userId, type: notification.type },
                'Created in-app notification'
            );
            return result;
        } catch (error) {
            logger.error({ error, notification }, 'Failed to create in-app notification');
            throw error;
        }
    }

    /**
     * Send email notification using SMTP settings
     */
    async sendEmailNotification(
        userId: string,
        subject: string,
        body: string
    ): Promise<boolean> {
        try {
            // Get SMTP settings from app_settings
            const settings = await prisma.app_settings.findUnique({
                where: { id: true },
            });

            if (
                !settings?.smtp_host ||
                !settings?.smtp_port ||
                !settings?.smtp_user ||
                !settings?.smtp_pass
            ) {
                logger.warn('SMTP not configured, skipping email notification');
                return false;
            }

            // Get user email
            const user = await prisma.users.findUnique({
                where: { id: userId },
                select: { email: true, username: true },
            });

            if (!user) {
                logger.error({ userId }, 'User not found for email notification');
                return false;
            }

            // Create transporter
            const transporter = nodemailer.createTransport({
                host: settings.smtp_host,
                port: settings.smtp_port,
                secure: settings.smtp_secure ?? false,
                auth: {
                    user: settings.smtp_user,
                    pass: settings.smtp_pass,
                },
            });

            // Send email
            await transporter.sendMail({
                from: settings.smtp_from ?? settings.smtp_user,
                to: user.email,
                subject,
                text: body,
                html: `<html><body>${body.replace(/\n/g, '<br>')}</body></html>`,
            });

            logger.info({ userId, email: user.email }, 'Sent email notification');
            return true;
        } catch (error) {
            logger.error({ error, userId }, 'Failed to send email notification');
            return false;
        }
    }

    /**
     * Notify user about peak maturity alerts
     */
    async notifyPeakMaturityAlert(
        userId: string,
        bottles: Array<{ id: string; label: string; alertStatus: string }>
    ) {
        // Get user preferences
        const preferences = await this.repo.getAlertPreferences(userId);

        const enableInApp = preferences?.enableInApp ?? true;
        const enableEmail = preferences?.enableEmail ?? true;

        if (!enableInApp && !enableEmail) {
            logger.debug({ userId }, 'User has disabled all alert notifications');
            return;
        }

        const criticalBottles = bottles.filter((b) => b.alertStatus === 'critical');
        const approachingBottles = bottles.filter(
            (b) => b.alertStatus === 'approaching'
        );

        // Create in-app notifications
        if (enableInApp) {
            if (criticalBottles.length > 0) {
                const count = criticalBottles.length;
                const title = count === 1
                    ? '1 bouteille a dépassé son apogée'
                    : `${count} bouteilles ont dépassé leur apogée`;
                const message = count === 1
                    ? `La bouteille suivante nécessite une attention urgente : ${criticalBottles[0].label}`
                    : `Les bouteilles suivantes nécessitent une attention urgente : ${criticalBottles.map((b) => b.label).join(', ')}`;

                await this.createInAppNotification({
                    userId,
                    type: 'peak_maturity',
                    title,
                    message,
                    data: { bottles: criticalBottles },
                });
            }

            if (approachingBottles.length > 0) {
                const count = approachingBottles.length;
                const title = count === 1
                    ? "1 bouteille approche de sa fenêtre d'apogée"
                    : `${count} bouteilles approchent de leur fenêtre d'apogée`;
                const message = count === 1
                    ? `La bouteille suivante entre dans sa fenêtre optimale : ${approachingBottles[0].label}`
                    : `Les bouteilles suivantes entrent dans leur fenêtre optimale : ${approachingBottles.map((b) => b.label).join(', ')}`;

                await this.createInAppNotification({
                    userId,
                    type: 'peak_maturity',
                    title,
                    message,
                    data: { bottles: approachingBottles },
                });
            }
        }

        // Send email notification
        if (enableEmail) {
            const totalCount = criticalBottles.length + approachingBottles.length;
            if (totalCount > 0) {
                let emailBody = `Bonjour,\n\nVoici votre rapport d'alertes d'apogée :\n\n`;

                if (criticalBottles.length > 0) {
                    const count = criticalBottles.length;
                    emailBody += count === 1
                        ? `⚠️ Bouteille critique (1) :\n`
                        : `⚠️ Bouteilles critiques (${count}) :\n`;
                    criticalBottles.forEach((b) => {
                        emailBody += `  - ${b.label}\n`;
                    });
                    emailBody += '\n';
                }

                if (approachingBottles.length > 0) {
                    const count = approachingBottles.length;
                    emailBody += count === 1
                        ? `📅 Bouteille approchant l'apogée (1) :\n`
                        : `📅 Bouteilles approchant l'apogée (${count}) :\n`;
                    approachingBottles.forEach((b) => {
                        emailBody += `  - ${b.label}\n`;
                    });
                    emailBody += '\n';
                }

                emailBody += `Consultez votre centre d'alertes pour plus de détails.\n\nCordialement,\nGlou`;

                const subject = totalCount === 1
                    ? `🍷 Alerte d'apogée : 1 bouteille`
                    : `🍷 Alertes d'apogée : ${totalCount} bouteilles`;

                await this.sendEmailNotification(
                    userId,
                    subject,
                    emailBody
                );
            }
        }
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
    ) {
        return this.repo.getNotifications(userId, options);
    }

    /**
     * Mark notification as read
     */
    async markNotificationRead(notificationId: string) {
        return this.repo.markNotificationRead(notificationId);
    }

    /**
     * Delete notification
     */
    async deleteNotification(notificationId: string) {
        return this.repo.deleteNotification(notificationId);
    }

    /**
     * Get count of unread notifications
     */
    async getUnreadCount(userId: string) {
        return this.repo.getUnreadCount(userId);
    }
}
