import { prisma } from '../lib/prisma';
import { Prisma, PrismaClient } from '@prisma/client';

export type AuditAction = 'LIST' | 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'RESTORE_FIELD' | 'LOGIN' | 'LOGIN_2FA' | 'LOGOUT' | 'REGISTER' | 'CELLAR_CREATE' | 'CELLAR_READ' | 'CELLAR_UPDATE' | 'CELLAR_DELETE' | 'COLLECTION_CREATE' | 'COLLECTION_UPDATE' | 'COLLECTION_DELETE' | 'SESSION_REVOKE' | 'TRUST_DEVICE' | 'UNTRUST_DEVICE' | 'PIN_SET' | 'PIN_REMOVE' | 'GUEST_UPDATE' | 'ONBOARDING_COMPLETE' | 'IMPORT_CSV' | 'BACKUP_RESTORE' | 'SCAN';

export type AuditStatus = 'success' | 'error' | 'validation_error' | 'not_found';

export interface AuditEntry {
  userId: string;
  action: AuditAction;
  status: AuditStatus;
  ip: string;
  bottleId?: string;
  details?: Record<string, unknown>;
}

/**
 * Fire-and-forget audit log insert.
 * Never throws — audit must not block the request lifecycle.
 */
export async function auditLog(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        status: entry.status,
        ip: entry.ip,
        bottleId: entry.bottleId ?? null,
        details: (entry.details ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // Non-blocking: log to stderr but do not propagate
    console.error('[audit] Failed to write audit log:', err);
  }
}

/**
 * Purge audit logs older than N days (default: 90).
 * Called on startup and by the scheduled/manual retention cleanup (FEAT-39).
 * Accepts an optional Prisma transaction client so it can participate in a
 * larger `$transaction` (see MaintenanceService.runRetentionCleanup).
 */
export async function purgeOldAuditLogs(
  days = 90,
  client: Prisma.TransactionClient | PrismaClient = prisma,
): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await client.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
