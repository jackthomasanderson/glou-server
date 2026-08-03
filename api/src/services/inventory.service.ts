import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { InventoryPatch, InventoryInput } from '../schemas/inventory.schema';
import { computeAlertStatus } from './alert.service';
import { v4 as uuidv4 } from 'uuid';

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

/**
 * Origin of a field's current value (FEAT-05). Stored per-field in
 * `InventoryItem.fieldSources` — a field with no entry in that map is
 * implicitly 'manual' (the honest default: no external enrichment source is
 * actually wired up yet, see design.md "APIs Tierces" roadmap). 'ocr' is
 * reserved for the future FEAT-04 scan pipeline and 'enrichment' for a
 * future third-party lookup (Vivino/Whiskybase) — neither is populated by
 * any code today.
 */
export type FieldSource = 'manual' | 'ocr' | 'import_csv' | 'enrichment';

export type RollbackFieldResult =
  | { status: 'not_found' }
  | { status: 'invalid_value' }
  | { status: 'slot_conflict' }
  | { status: 'success'; item: InventoryItem; changes: FieldChange[] };

/**
 * Result of `InventoryService.updateItem` (FEAT-16/23 offline sync).
 * The `conflict` branch is only reachable when the caller supplies
 * `expectedUpdatedAt` in the patch (opt-in optimistic concurrency check —
 * see `updateItem`) AND that value no longer matches the item's current
 * `updatedAt` in the database, meaning another actor modified the item in
 * the meantime. `serverItem` carries the current server-side state so the
 * caller (offline sync queue) can present a conflict-resolution choice
 * instead of silently overwriting it.
 */
export type UpdateItemResult =
  | { item: InventoryItem; changes: FieldChange[]; slotConflict?: boolean }
  | { conflict: true; serverItem: InventoryItem };

export interface InventoryHistoryEntry {
  id: number;
  action: string;
  status: string;
  actorId: string;
  actorName: string;
  changes: FieldChange[] | null;
  createdAt: Date;
}

export interface InventoryWithTraceability {
  item: Record<string, unknown>;
  creator: { id: string; name: string } | null;
  lastEditor: { id: string; name: string } | null;
}

// InventoryItem type inferred from Prisma client
type InventoryItem = Awaited<ReturnType<typeof prisma.inventoryItem.findFirst>> extends infer T | null ? NonNullable<T> : never;


/** Corbeille : 7 jours avant purge définitive */
const TRASH_RETENTION_DAYS = 7;

export class InventoryService {
  async listInventory(_userId: string): Promise<InventoryItem[]> {
    return prisma.inventoryItem.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        collections: { select: { id: true, name: true, color: true, icon: true } },
      },
    }) as unknown as InventoryItem[];
  }

  async listTrash(_userId: string): Promise<InventoryItem[]> {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    return prisma.inventoryItem.findMany({
      where: {
        deletedAt: { not: null, gte: cutoff },
      },
      orderBy: { deletedAt: 'desc' },
    });
  }

  async getItem(_userId: string, id: string): Promise<InventoryItem | null> {
    return prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null },
      include: {
        collections: { select: { id: true, name: true, color: true, icon: true } },
      },
    }) as unknown as InventoryItem | null;
  }

  async getItemWithTraceability(_userId: string, id: string): Promise<InventoryWithTraceability | null> {
    const item = await prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null },
      include: { collections: { select: { id: true, name: true, color: true, icon: true } } },
    });
    if (!item) return null;

    const uniqueIds = [...new Set([item.userId, (item as unknown as Record<string, unknown>)['updatedBy'] as string | undefined].filter(Boolean))] as string[];
    const users = await prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, displayName: true, username: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.displayName ?? u.username]));

    const creator = item.userId ? { id: item.userId, name: userMap.get(item.userId) ?? item.userId } : null;
    const updatedById = (item as unknown as Record<string, unknown>)['updatedBy'] as string | undefined;
    const lastEditor = updatedById ? { id: updatedById, name: userMap.get(updatedById) ?? updatedById } : null;

    return { item: item as unknown as Record<string, unknown>, creator, lastEditor };
  }

  async getItemHistory(id: string): Promise<InventoryHistoryEntry[]> {
    const logs = await prisma.auditLog.findMany({
      where: {
        bottleId: id,
        action: { in: ['CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'RESTORE_FIELD'] },
        status: 'success',
      },
      orderBy: { createdAt: 'desc' },
    });

    const uniqueUserIds = [...new Set(logs.map((l) => l.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: { id: true, displayName: true, username: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.displayName ?? u.username]));

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      status: log.status,
      actorId: log.userId,
      actorName: userMap.get(log.userId) ?? log.userId,
      changes: (log.details as Record<string, unknown> | null)?.['changes'] as FieldChange[] | null ?? null,
      createdAt: log.createdAt,
    }));
  }

  /**
   * `client` defaults to the global `prisma` singleton but accepts a
   * `Prisma.TransactionClient` so callers (e.g. the CSV import confirm step,
   * FEAT-56) can create several items atomically inside `prisma.$transaction`
   * — mirrors the same optional-client pattern already used by
   * `purgeOldAuditLogs` (audit.service.ts).
   *
   * `fieldSources` is a partial map — pass only the fields whose value did
   * NOT come from manual entry (e.g. `{ name: 'import_csv' }`). Leaving a
   * field out of the map keeps it implicitly 'manual', which stays honest
   * for the overwhelming majority of records created via the add form.
   */
  async createItem(
    userId: string,
    data: InventoryInput,
    client: Prisma.TransactionClient | PrismaClient = prisma,
    fieldSources?: Partial<Record<string, FieldSource>>,
  ): Promise<InventoryItem> {
    const patch = data as unknown as InventoryPatch;
    const dbData = this.mapInputToDb(patch);
    const alertStatus = computeAlertStatus(
      (patch as Record<string, unknown>)['peakMaturityFrom'] as number | undefined,
      (patch as Record<string, unknown>)['peakMaturityTo'] as number | undefined,
    );
    const extra: Record<string, unknown> = {};
    if (fieldSources && Object.keys(fieldSources).length > 0) {
      extra.fieldSources = fieldSources;
    }
    return client.inventoryItem.create({
      data: { id: uuidv4(), userId, ...dbData, ...extra, alertStatus } as never,
    });
  }

  /**
   * `options.fieldSources` tags the (non-manual) origin of specific fields
   * in this patch — used by future automated pipelines (OCR, enrichment).
   * `options.isManualEdit` (default `true`) governs the FEAT-05 "manual
   * entry has absolute priority" guarantee:
   *  - `true` (the regular user-facing PATCH /:id and the guest write-access
   *    route, both driven by an explicit form/detail-sheet edit): every
   *    touched field is added to `lockedFields` so a later automated update
   *    can never silently overwrite it again, and any stale non-manual
   *    `fieldSources` tag on that field is cleared back to the implicit
   *    'manual' default.
   *  - `false` (reserved for a future OCR/enrichment pipeline calling this
   *    same method): fields are populated without being locked, so the user
   *    can still let a later automated pass complete them.
   */
  async updateItem(
    userId: string,
    id: string,
    rawPatch: InventoryPatch,
    options?: {
      fieldSources?: Partial<Record<string, FieldSource>>;
      isManualEdit?: boolean;
      /**
       * Internal escape hatch used only by `rollbackField`: a rollback must
       * be able to restore a field even if that very field is currently in
       * `lockedFields` (e.g. it was locked by an earlier manual edit) —
       * otherwise the standard lock filter below would silently drop it and
       * the rollback would be a no-op. Never set this from a route handler.
       */
      bypassFieldLock?: boolean;
    },
  ): Promise<UpdateItemResult | null> {
    const { fieldSources, isManualEdit = true, bypassFieldLock = false } = options ?? {};
    // `expectedUpdatedAt` (FEAT-16/23) is a sync-protocol field, not a real
    // InventoryItem column — strip it before it reaches `mapInputToDb`/Prisma.
    const { expectedUpdatedAt, ...patch } = rawPatch;
    const existing = await prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return null;

    // ─── Optimistic concurrency check (FEAT-16/23) ───────────────────────────
    // Opt-in: only the offline sync queue sends `expectedUpdatedAt` (the
    // item's `updatedAt` as known when the mutation was queued, possibly
    // while offline). Every other caller omits it and keeps today's
    // unconditional last-write-wins behavior. Compared in milliseconds since
    // the wire format is an ISO string round-tripped through JSON.
    if (
      expectedUpdatedAt !== undefined &&
      new Date(expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()
    ) {
      return { conflict: true, serverItem: existing as unknown as InventoryItem };
    }

    // Slot uniqueness: if assigning a grid slot, verify it is not occupied by another item
    const targetCellarId = 'cellarId' in patch ? patch.cellarId : existing.cellarId;
    const targetSlotColumn = 'slotColumn' in patch ? patch.slotColumn : existing.slotColumn;
    const targetSlotRow = 'slotRow' in patch ? patch.slotRow : existing.slotRow;

    if (targetCellarId && targetSlotColumn != null && targetSlotRow != null) {
      const conflict = await prisma.inventoryItem.findFirst({
        where: {
          cellarId: targetCellarId,
          slotColumn: targetSlotColumn,
          slotRow: targetSlotRow,
          id: { not: id },
          deletedAt: null,
        },
      });
      if (conflict) return { item: existing as unknown as InventoryItem, changes: [], slotConflict: true };
    }

    const safePatch = bypassFieldLock
      ? patch
      : (Object.fromEntries(
          Object.entries(patch).filter(([key]) => !existing.lockedFields.includes(key))
        ) as InventoryPatch);

    const changes: FieldChange[] = Object.entries(safePatch)
      .filter(([key, val]) => {
        const existingVal = (existing as unknown as Record<string, unknown>)[key];
        return JSON.stringify(existingVal) !== JSON.stringify(val);
      })
      .map(([key, val]) => ({
        field: key,
        from: (existing as unknown as Record<string, unknown>)[key],
        to: val,
      }));

    const dbData = this.mapInputToDb(safePatch);

    // ─── FEAT-05: auto-lock manually-edited fields + reconcile fieldSources ──
    const extra: Record<string, unknown> = {};

    // `lockedFields` can already be set explicitly in the patch (a future
    // "unlock this field" UI action) — that explicit intent always wins over
    // the automatic append below.
    const patchHasExplicitLock = Object.prototype.hasOwnProperty.call(safePatch, 'lockedFields');
    if (!patchHasExplicitLock && isManualEdit) {
      const fieldsToLock = Object.keys(safePatch).filter(
        (key) => key !== 'lockedFields' && !existing.lockedFields.includes(key)
      );
      if (fieldsToLock.length > 0) {
        extra.lockedFields = [...existing.lockedFields, ...fieldsToLock];
      }
    }

    const existingFieldSources = ((existing as unknown as Record<string, unknown>)['fieldSources'] as Record<string, string> | null) ?? {};
    const nextFieldSources: Record<string, string> = { ...existingFieldSources };
    if (fieldSources) {
      for (const [key, source] of Object.entries(fieldSources)) {
        if (source) nextFieldSources[key] = source;
      }
    }
    if (isManualEdit) {
      // A field the user just edited by hand reclaims 'manual' status — any
      // stale non-manual tag is cleared unless this very call re-tags it
      // (e.g. a future OCR confirmation step calling updateItem with both
      // isManualEdit: true and an explicit fieldSources entry).
      for (const key of Object.keys(safePatch)) {
        if (key === 'lockedFields') continue;
        if (!fieldSources || !(key in fieldSources)) {
          delete nextFieldSources[key];
        }
      }
    }
    if (JSON.stringify(nextFieldSources) !== JSON.stringify(existingFieldSources)) {
      extra.fieldSources = nextFieldSources;
    }

    const from = ('peakMaturityFrom' in safePatch ? safePatch.peakMaturityFrom : existing.peakMaturityFrom) as number | null | undefined;
    const to = ('peakMaturityTo' in safePatch ? safePatch.peakMaturityTo : existing.peakMaturityTo) as number | null | undefined;
    const alertStatus = computeAlertStatus(from, to);

    const item = await prisma.inventoryItem.update({
      where: { id },
      data: { ...dbData, ...extra, alertStatus, updatedAt: new Date(), updatedBy: userId } as never,
    });

    return { item, changes };
  }

  /**
   * Restores a single field to a value already present in the item's real
   * change history (either side — `from` or `to` — of any recorded
   * `FieldChange` for that field). Rejects any `toValue` that never actually
   * appeared in the tracked history, which prevents an arbitrary/untracked
   * value from being injected through the rollback endpoint.
   *
   * A rollback IS a manual action (the user is explicitly choosing which
   * historical value should win), so it goes through the same `updateItem`
   * path with `isManualEdit: true` — the field gets locked and its
   * `fieldSources` tag (if any) reverts to implicit 'manual', exactly like
   * any other hand edit. The caller (the router) logs this under the
   * dedicated `RESTORE_FIELD` audit action instead of `UPDATE`, so the
   * history UI can render "value restored" rather than "modified".
   */
  async rollbackField(userId: string, itemId: string, field: string, toValue: unknown): Promise<RollbackFieldResult> {
    const existing = await prisma.inventoryItem.findFirst({
      where: { id: itemId, deletedAt: null },
    });
    if (!existing) return { status: 'not_found' };

    const history = await this.getItemHistory(itemId);
    const seenValues = new Set<string>();
    for (const entry of history) {
      for (const change of entry.changes ?? []) {
        if (change.field === field) {
          seenValues.add(JSON.stringify(change.from));
          seenValues.add(JSON.stringify(change.to));
        }
      }
    }
    if (!seenValues.has(JSON.stringify(toValue))) {
      return { status: 'invalid_value' };
    }

    const patch = { [field]: toValue } as unknown as InventoryPatch;
    const result = await this.updateItem(userId, itemId, patch, { isManualEdit: true, bypassFieldLock: true });
    if (!result) return { status: 'not_found' };
    if ('conflict' in result) {
      // Defensive narrowing only: rollbackField never sets `expectedUpdatedAt`
      // on the patch above, so the conflict branch of `updateItem` cannot
      // actually trigger here. Kept exhaustive for type-safety.
      return { status: 'invalid_value' };
    }
    if (result.slotConflict) return { status: 'slot_conflict' };

    return { status: 'success', item: result.item, changes: result.changes };
  }

  async bulkUpdate(
    userId: string,
    ids: string[],
    patch: InventoryPatch
  ): Promise<number> {
    const existing = await prisma.inventoryItem.findMany({
      where: { id: { in: ids }, deletedAt: null },
    });

    if (existing.length === 0) return 0;

    let updatedCount = 0;
    await prisma.$transaction(async (tx) => {
      for (const item of existing) {
        const safePatch = Object.fromEntries(
          Object.entries(patch).filter(([key]) => !item.lockedFields.includes(key))
        );
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: {
            ...this.mapInputToDb(safePatch as InventoryPatch),
            updatedAt: new Date(),
            updatedBy: userId,
          } as never,
        });
        updatedCount++;
      }
    });

    return updatedCount;
  }

  async softDelete(_userId: string, id: string): Promise<InventoryItem | null> {
    const existing = await prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return null;

    return prisma.inventoryItem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async restore(_userId: string, id: string): Promise<InventoryItem | null> {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const existing = await prisma.inventoryItem.findFirst({
      where: {
        id,
        deletedAt: { not: null, gte: cutoff },
      },
    });
    if (!existing) return null;

    return prisma.inventoryItem.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  async purgeTrashed(): Promise<number> {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await prisma.inventoryItem.deleteMany({
      where: { deletedAt: { lt: cutoff } },
    });
    return result.count;
  }

  daysUntilPermanentDelete(deletedAt: Date): number {
    const expiresAt = new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const remaining = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    return Math.max(0, remaining);
  }

  private mapInputToDb(data: Partial<InventoryPatch>): Partial<InventoryPatch> {
    return Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    ) as Partial<InventoryPatch>;
  }
}

export const inventoryService = new InventoryService();
