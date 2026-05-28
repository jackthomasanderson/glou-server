import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export type AuditAction = 'LIST' | 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'LOGIN' | 'LOGIN_2FA' | 'LOGOUT' | 'REGISTER' | 'CELLAR_CREATE' | 'CELLAR_READ' | 'CELLAR_UPDATE' | 'CELLAR_DELETE' | 'COLLECTION_CREATE' | 'COLLECTION_UPDATE' | 'COLLECTION_DELETE';

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
 * Called on startup or scheduled maintenance.
 */
export async function purgeOldAuditLogs(days = 90): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
