import type { Request } from 'express';
import { auditLog } from '../services/audit.service';
import { getClientIp } from '../middleware/auth.middleware';
import type { TrashDeletion } from '../services/inventory.service';

/**
 * #962: one audit row per permanent deletion from the trash — who (the
 * row's user), what (the wine's name, the ids) and how many (lines, wines).
 * The rows are gone, so their ids live in the details: `bottleId` and
 * `productId` are foreign keys and would refuse the insert.
 */
export function logTrashDeletion(
  req: Request,
  scope: 'item' | 'product' | 'empty',
  deletion: TrashDeletion | null,
  extra: Record<string, unknown> = {},
): void {
  const ip = getClientIp(req);
  if (!deletion) {
    void auditLog({ userId: req.userId, action: 'TRASH_DELETE', status: 'not_found', ip, details: { scope, ...extra } });
    return;
  }
  const { itemIds, productIds, label } = deletion;
  void auditLog({
    userId: req.userId, action: 'TRASH_DELETE', status: 'success', ip,
    details: { scope, ...(label ? { label } : {}), ...extra, itemIds, productIds, lines: itemIds.length, wines: productIds.length },
  });
}
