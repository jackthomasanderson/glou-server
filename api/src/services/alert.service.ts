import { AlertRepository } from '../repositories/alert.repository.js';
import { BottleService } from './bottles.js';
import { logger } from '../utils/logger.js';
import type { Bottle } from '../schemas/bottles.js';

import { NotificationService } from './notification.service.js';

export type AlertStatus = 'none' | 'approaching' | 'critical';

export interface AlertCalculationResult {
    bottleId: string;
    alertStatus: AlertStatus;
    reasons: string[];
}

/**
 * Service for calculating and managing peak maturity alerts
 */
export class AlertService {
    private repo: AlertRepository;
    private bottleService: BottleService;
    private notificationService: NotificationService;

    constructor() {
        this.repo = new AlertRepository();
        this.bottleService = new BottleService();
        this.notificationService = new NotificationService();
    }

    /**
     * Calculate alert status for a single bottle based on peak maturity window
     */
    calculateAlertStatus(
        bottle: Bottle,
        daysBeforePeak: number = 30
    ): AlertCalculationResult {
        const reasons: string[] = [];
        let alertStatus: AlertStatus = 'none';

        // Skip if no peak maturity data
        if (!bottle.peakMaturity?.from || !bottle.peakMaturity?.to) {
            return { bottleId: bottle.id, alertStatus, reasons };
        }

        const currentYear = new Date().getFullYear();
        const peakStart = bottle.peakMaturity.from;
        const peakEnd = bottle.peakMaturity.to;

        // Calculate days threshold (approximate as years for simplicity)
        const yearThreshold = Math.floor(daysBeforePeak / 365);

        // Check if past peak maturity
        if (currentYear > peakEnd) {
            alertStatus = 'critical';
            reasons.push('alerts.peakMaturity.pastPeak');
        }
        // Check if in peak window but approaching end
        else if (currentYear >= peakStart && currentYear <= peakEnd) {
            const yearsUntilEnd = peakEnd - currentYear;
            if (yearsUntilEnd <= yearThreshold) {
                alertStatus = 'critical';
                reasons.push('alerts.peakMaturity.approachingEnd');
            } else {
                alertStatus = 'approaching';
                reasons.push('alerts.peakMaturity.inWindow');
            }
        }
        // Check if approaching peak window
        else if (currentYear < peakStart) {
            const yearsUntilStart = peakStart - currentYear;
            if (yearsUntilStart <= yearThreshold) {
                alertStatus = 'approaching';
                reasons.push('alerts.peakMaturity.approachingStart');
            }
        }

        return { bottleId: bottle.id, alertStatus, reasons };
    }

    /**
     * Update alert statuses for all bottles (or specific user's bottles)
     */
    async updateBottleAlertStatuses(userId?: string): Promise<{
        updated: number;
        errors: number;
    }> {
        try {
            let bottles: Bottle[];

            if (userId) {
                bottles = await this.bottleService.getBottlesByUserId(userId);
            } else {
                // Get all bottles for all users (for cron job)
                // This is less efficient but works for now
                // TODO: Optimize to query directly from DB
                bottles = [];
                logger.warn(
                    'updateBottleAlertStatuses called without userId - not implemented for all users yet'
                );
                return { updated: 0, errors: 0 };
            }

            // Get user's alert preferences (or use defaults)
            const preferences = await this.repo.getAlertPreferences(userId);
            const daysBeforePeak = preferences?.daysBeforePeak ?? 30;

            const updates: Array<{ bottleId: string; alertStatus: string }> = [];
            const bottlesToNotify: Array<{ id: string; label: string; alertStatus: string }> = [];
            let errors = 0;

            for (const bottle of bottles) {
                try {
                    const result = this.calculateAlertStatus(bottle, daysBeforePeak);

                    // Only update if status has changed
                    if (result.alertStatus !== bottle.alertStatus) {
                        updates.push({
                            bottleId: result.bottleId,
                            alertStatus: result.alertStatus,
                        });

                        if (result.alertStatus === 'approaching' || result.alertStatus === 'critical') {
                            bottlesToNotify.push({
                                id: bottle.id,
                                label: bottle.label,
                                alertStatus: result.alertStatus
                            });
                        }
                    }
                } catch (error) {
                    logger.error({ error, bottleId: bottle.id }, 'Error calculating alert status');
                    errors++;
                }
            }

            if (updates.length > 0) {
                await this.repo.batchUpdateAlertStatuses(updates);

                // Send batch notification
                if (bottlesToNotify.length > 0 && userId) {
                    await this.notificationService.notifyPeakMaturityAlert(userId, bottlesToNotify);
                }

                logger.info(
                    { userId, count: updates.length },
                    'Updated bottle alert statuses'
                );
            }

            return { updated: updates.length, errors };
        } catch (error) {
            logger.error({ error, userId }, 'Failed to update bottle alert statuses');
            throw error;
        }
    }

    /**
     * Get bottles with active alerts for a user
     */
    async getActiveAlerts(
        userId: string,
        options?: {
            includeApproaching?: boolean;
        }
    ): Promise<Bottle[]> {
        const alertStatuses = ['critical'];
        if (options?.includeApproaching) {
            alertStatuses.push('approaching');
        }

        const bottles = await this.repo.getBottlesByAlertStatus(
            userId,
            alertStatuses
        );

        return bottles.map((b) => this.bottleService.mapToBottle(b));
    }

    /**
     * Get or create user alert preferences
     */
    async getAlertPreferences(userId: string) {
        let prefs = await this.repo.getAlertPreferences(userId);

        // Create default preferences if none exist
        if (!prefs) {
            prefs = await this.repo.upsertAlertPreferences({
                userId,
                daysBeforePeak: 30,
                enableEmail: true,
                enableInApp: true,
            });
        }

        return prefs;
    }

    /**
     * Update user alert preferences
     */
    async updateAlertPreferences(
        userId: string,
        preferences: Partial<{
            daysBeforePeak: number;
            enableEmail: boolean;
            enableInApp: boolean;
            quietHoursStart: string;
            quietHoursEnd: string;
        }>
    ) {
        const current = await this.getAlertPreferences(userId);

        return this.repo.upsertAlertPreferences({
            userId,
            daysBeforePeak: preferences.daysBeforePeak ?? current.daysBeforePeak,
            enableEmail: preferences.enableEmail ?? current.enableEmail,
            enableInApp: preferences.enableInApp ?? current.enableInApp,
            quietHoursStart: preferences.quietHoursStart ?? current.quietHoursStart,
            quietHoursEnd: preferences.quietHoursEnd ?? current.quietHoursEnd,
        });
    }

    /**
     * Check if a bottle's alert status needs updating and update if needed
     * Used when creating/updating bottles
     */
    async checkAndUpdateBottleAlert(bottle: Bottle): Promise<void> {
        const preferences = await this.repo.getAlertPreferences(bottle.userId);
        const daysBeforePeak = preferences?.daysBeforePeak ?? 30;

        const result = this.calculateAlertStatus(bottle, daysBeforePeak);

        if (result.alertStatus !== bottle.alertStatus) {
            await this.repo.updateBottleAlertStatus(
                bottle.id,
                result.alertStatus
            );

            // Notify user if status changed to something important
            if (result.alertStatus === 'approaching' || result.alertStatus === 'critical') {
                await this.notificationService.notifyPeakMaturityAlert(
                    bottle.userId,
                    [{
                        id: bottle.id,
                        label: bottle.label,
                        alertStatus: result.alertStatus
                    }]
                );
            }

            logger.info(
                { bottleId: bottle.id, newStatus: result.alertStatus },
                'Updated bottle alert status'
            );
        }
    }
}
