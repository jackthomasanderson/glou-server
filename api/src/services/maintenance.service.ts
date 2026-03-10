import { prisma } from '../lib/prisma';

export interface PurgeResult {
    success: boolean;
    counts: {
        bottles: number;
        cellars: number;
        auditLogs: number;
    };
}

export class MaintenanceService {
    /**
     * Purge all business data from the database.
     * Keeps user accounts but deletes bottles, cellars, and audit logs.
     */
    static async purgeAllData(): Promise<PurgeResult> {
        return await prisma.$transaction(async (tx) => {
            // Get counts before deletion for reporting
            const bottleCount = await tx.bottle.count();
            const cellarCount = await tx.cellar.count();
            const auditLogCount = await tx.auditLog.count();

            // Delete in order to respect constraints (though Cascade is set in schema)
            // AuditLog has bottleId and userId.
            // Bottle has cellarId and userId.
            // Cellar has userId.

            // We use deleteMany() for bulk deletion
            await tx.auditLog.deleteMany({});
            await tx.bottle.deleteMany({});
            await tx.cellar.deleteMany({});

            return {
                success: true,
                counts: {
                    bottles: bottleCount,
                    cellars: cellarCount,
                    auditLogs: auditLogCount,
                },
            };
        });
    }
}
