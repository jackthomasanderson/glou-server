import { prisma } from '../lib/prisma';

export interface PurgeResult {
    success: boolean;
    counts: {
        items: number;
        cellars: number;
        auditLogs: number;
    };
}

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
}
