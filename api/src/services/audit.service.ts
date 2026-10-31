import { prisma, PrismaClientOrTx } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import type { FieldChange, ProductHistoryEntry } from '../../../shared/product';

export type AuditAction = 'LIST' | 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'RESTORE_FIELD' | 'LOGIN' | 'LOGIN_2FA' | 'LOGOUT' | 'REGISTER' | 'CELLAR_CREATE' | 'CELLAR_READ' | 'CELLAR_UPDATE' | 'CELLAR_DELETE' | 'CELLAR_SWAP_SLOTS' | 'COLLECTION_CREATE' | 'COLLECTION_UPDATE' | 'COLLECTION_DELETE' | 'SESSION_REVOKE' | 'TRUST_DEVICE' | 'UNTRUST_DEVICE' | 'PIN_SET' | 'PIN_REMOVE' | 'GUEST_UPDATE' | 'ONBOARDING_COMPLETE' | 'IMPORT_CSV' | 'BACKUP_RESTORE' | 'PURGE' | 'BACKUP_DOWNLOAD' | 'SCAN' | 'HUMIDOR_READING_CREATE' | 'ADD_UNITS' | 'CORRECT_QUANTITY' | 'MERGE_PRODUCTS' | 'DISTINGUISH_PRODUCTS' | 'REVIEW_OK' | 'MOVE_UNITS' | 'REPRICE_UNITS';

export type AuditStatus = 'success' | 'error' | 'validation_error' | 'not_found';

export interface AuditEntry {
  userId: string;
  action: AuditAction;
  status: AuditStatus;
  ip: string;
  bottleId?: string;
  /**
   * #471: the family the change belongs to (design.md "Historique des
   * champs"). Looked up from `bottleId` when not given, so every unit change
   * is also found from its family.
   */
  productId?: string;
  details?: Record<string, unknown>;
}

/**
 * Fire-and-forget audit log insert.
 * Never throws — audit must not block the request lifecycle.
 */
export async function auditLog(entry: AuditEntry): Promise<void> {
  try {
    const productId = entry.productId ?? (entry.bottleId
      ? (await prisma.inventoryItem.findUnique({ where: { id: entry.bottleId }, select: { productId: true } }))?.productId
      : undefined);
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        status: entry.status,
        ip: entry.ip,
        bottleId: entry.bottleId ?? null,
        productId: productId ?? null,
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
  client: PrismaClientOrTx = prisma,
): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await client.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

/**
 * The actions that make up the field history of a unit or a family (FEAT-05),
 * #471: copies added and numbers corrected included (FEAT-92 c3), merges
 * and guessed numbers confirmed too (FEAT-102), part of a group moved or
 * repriced as well (FEAT-98, point 57).
 */
const FIELD_HISTORY_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'RESTORE_FIELD', 'GUEST_UPDATE', 'ADD_UNITS', 'CORRECT_QUANTITY', 'MERGE_PRODUCTS', 'REVIEW_OK', 'MOVE_UNITS', 'REPRICE_UNITS'];

/**
 * The successful field-history entries matching `where`, most recent first,
 * with the actor's display name. #471: read for one unit
 * (`{ bottleId }`) or for a whole family (`{ productId }`: its description
 * changes and every change of its units).
 */
export async function readFieldHistory(where: Prisma.AuditLogWhereInput): Promise<ProductHistoryEntry[]> {
  const logs = await prisma.auditLog.findMany({
    where: { ...where, action: { in: FIELD_HISTORY_ACTIONS }, status: 'success' },
    orderBy: { createdAt: 'desc' },
  });

  const uniqueUserIds = [...new Set(logs.map((l) => l.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: uniqueUserIds } },
    select: { id: true, displayName: true, username: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u.displayName ?? u.username]));

  return logs.map((log) => {
    const details = log.details as Record<string, unknown> | null;
    // ISSUE_483: a guest edit is logged under the share creator's id; show
    // the guest's name instead so the history does not blame the member.
    const viaGuest = log.action === 'GUEST_UPDATE';
    const guestName = viaGuest && typeof details?.['inviteeName'] === 'string' ? details['inviteeName'] : null;
    return {
      id: log.id,
      action: log.action,
      status: log.status,
      actorId: log.userId,
      actorName: guestName ?? userMap.get(log.userId) ?? log.userId,
      ...(viaGuest ? { viaGuest: true } : {}),
      itemId: log.bottleId,
      changes: details?.['changes'] as FieldChange[] | null ?? null,
      createdAt: log.createdAt,
    };
  });
}
