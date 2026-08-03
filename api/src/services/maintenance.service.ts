import { prisma } from '../lib/prisma';
import { MaintenanceRun, Prisma } from '@prisma/client';
import { purgeOldAuditLogs } from './audit.service';
import { scanService } from './scan.service';

export interface PurgeResult {
    success: boolean;
    counts: {
        items: number;
        cellars: number;
        auditLogs: number;
    };
}

export type MaintenanceTrigger = 'scheduled' | 'manual';

export interface RetentionCounts {
    auditLogs: number;
    sessions: number;
    trustedDevices: number;
    guestShares: number;
    scanFiles: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Scan label photos (uploads/scans/*, 10MB max each — see scanUpload) are
// purged after a fixed 24h window. Not exposed via SystemConfig (unlike the
// other retention windows below) because that would require a schema.prisma
// change, out of scope here.
const SCAN_FILE_RETENTION_HOURS = 24;

export class MaintenanceService {
    /**
     * Purge all business data from the database.
     * Keeps user accounts but deletes inventory items, cellars, and audit logs.
     */
    static async purgeAllData(): Promise<PurgeResult> {
        return await prisma.$transaction(async (tx) => {
            const itemCount = await tx.inventoryItem.count();
            const cellarCount = await tx.cellar.count();
            const auditLogCount = await tx.auditLog.count();

            await tx.auditLog.deleteMany({});
            await tx.inventoryItem.deleteMany({});
            await tx.cellar.deleteMany({});

            return {
                success: true,
                counts: {
                    items: itemCount,
                    cellars: cellarCount,
                    auditLogs: auditLogCount,
                },
            };
        });
    }

    /**
     * Run the configured data retention cleanup (FEAT-39):
     * - Audit logs older than `logRetentionDays` are purged.
     * - Sessions / TrustedDevices that are expired or revoked for longer
     *   than `sessionRetentionDays` are permanently deleted.
     * - GuestShares (also used as pending invitations since FEAT-37) that
     *   are expired or revoked for longer than `guestShareRetentionDays`
     *   are permanently deleted.
     *
     * All deletions + the resulting MaintenanceRun record are written in a
     * single `$transaction` (design.md: "usage systématique des transactions
     * pour toutes les écritures multi-tables"). Never throws to the caller:
     * on failure, the transaction is rolled back and a separate MaintenanceRun
     * row is written outside of it with `success: false` and the error message,
     * so a scheduled run failing never crashes the process.
     */
    static async runRetentionCleanup(trigger: MaintenanceTrigger, userId?: string): Promise<MaintenanceRun> {
        const startedAt = Date.now();

        try {
            return await prisma.$transaction(async (tx) => {
                const config = await tx.systemConfig.findUnique({ where: { id: 'singleton' } });
                const logRetentionDays = config?.logRetentionDays ?? 90;
                const sessionRetentionDays = config?.sessionRetentionDays ?? 30;
                const guestShareRetentionDays = config?.guestShareRetentionDays ?? 30;

                const now = new Date();
                const sessionCutoff = new Date(now.getTime() - sessionRetentionDays * DAY_MS);
                const guestShareCutoff = new Date(now.getTime() - guestShareRetentionDays * DAY_MS);

                const auditLogsCount = await purgeOldAuditLogs(logRetentionDays, tx);

                // Expired/revoked longer than the retention window, based on the
                // effective date (revokedAt if set, otherwise expiresAt).
                const sessionsResult = await tx.session.deleteMany({
                    where: {
                        OR: [
                            { revokedAt: { not: null, lt: sessionCutoff } },
                            { revokedAt: null, expiresAt: { lt: sessionCutoff } },
                        ],
                    },
                });

                const trustedDevicesResult = await tx.trustedDevice.deleteMany({
                    where: {
                        OR: [
                            { revokedAt: { not: null, lt: sessionCutoff } },
                            { revokedAt: null, expiresAt: { lt: sessionCutoff } },
                        ],
                    },
                });

                // GuestShare.expiresAt is nullable (a share/invitation may never
                // expire) — only revocation makes it eligible in that case.
                const guestSharesResult = await tx.guestShare.deleteMany({
                    where: {
                        OR: [
                            { revokedAt: { not: null, lt: guestShareCutoff } },
                            { revokedAt: null, expiresAt: { not: null, lt: guestShareCutoff } },
                        ],
                    },
                });

                const scanFilesCount = await scanService.purgeExpiredScanFiles(SCAN_FILE_RETENTION_HOURS, tx);

                const counts: RetentionCounts = {
                    auditLogs: auditLogsCount,
                    sessions: sessionsResult.count,
                    trustedDevices: trustedDevicesResult.count,
                    guestShares: guestSharesResult.count,
                    scanFiles: scanFilesCount,
                };

                return tx.maintenanceRun.create({
                    data: {
                        trigger,
                        userId: userId ?? null,
                        success: true,
                        counts: counts as unknown as Prisma.InputJsonValue,
                        durationMs: Date.now() - startedAt,
                    },
                });
            });
        } catch (error) {
            console.error('[maintenance] Retention cleanup failed:', error);
            const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
            return prisma.maintenanceRun.create({
                data: {
                    trigger,
                    userId: userId ?? null,
                    success: false,
                    error: message,
                    durationMs: Date.now() - startedAt,
                },
            });
        }
    }
}
