import { Prisma } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { prisma, PrismaClientOrTx } from '../lib/prisma';
import { InventoryPatch, InventoryInput, peakWindowSchema } from '../schemas/inventory.schema';
import { computeAlertStatus, computeReadiness } from './alert.service';
import { isFinishedItem, NO_SLOT } from '../lib/finished-item';
import { v4 as uuidv4 } from 'uuid';
import { TRASH_RETENTION_DAYS, type FieldSource } from '../../../shared/inventory';
import {
  fieldSourcesOf, isProductField, pickProductFields, todayAsPurchaseDate, toItemView, writeProductFields,
  type FlatItemView, type ProductWrite,
} from '../lib/product-fields';

// ISSUE_096: only a photoUrl saved by search.router.ts's product-image
// endpoints (uploads/products/*) is ever safe to delete from disk — an
// item whose photoUrl is some other external address must never be touched.
const LOCAL_PRODUCT_PHOTO_PREFIX = '/uploads/products/';

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

/**
 * Origin of a field's current value (FEAT-05), stored per field in
 * `InventoryItem.fieldSources`; declared in shared/inventory.ts (#466) and
 * re-exported for import.service.ts and scan.service.ts. 'ocr' is populated by
 * the FEAT-04 scan pipeline (see scan.service.ts computeOcrFieldSources).
 *
 * #102: a fourth value, 'enrichment', used to be reserved here for a
 * third-party lookup pipeline (Vivino/Whiskybase) that was never built
 * (#74) and never wrote it — removed rather than kept as protective
 * machinery for a pipeline that doesn't exist.
 */
export type { FieldSource };

export type RollbackFieldResult =
  | { status: 'not_found' }
  | { status: 'invalid_value' }
  | { status: 'slot_conflict' }
  | { status: 'success'; item: InventoryItemView; changes: FieldChange[] };

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
  | { item: InventoryItemView; changes: FieldChange[]; slotConflict?: boolean }
  | { conflict: true; serverItem: InventoryItemView };

export interface InventoryHistoryEntry {
  id: number;
  action: string;
  status: string;
  actorId: string;
  actorName: string;
  /** ISSUE_483: set when the change came through a guest share link. */
  viaGuest?: boolean;
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

// #471: every read of /api/inventory* joins the unit's family, which holds
// the description and the collections (see `toItemView`). Using Prisma's
// GetPayload helper keeps this in sync with the schema automatically.
const INVENTORY_ITEM_INCLUDE = {
  product: { include: { collections: { select: { id: true, name: true, color: true, icon: true } } } },
} satisfies Prisma.InventoryItemInclude;

// ISSUE_172: the schema-level GetPayload type doesn't know about the
// money-fields-as-number result extension in lib/prisma.ts, so it still
// reports purchasePrice/estimatedValue as Decimal — override them to match
// what the extended client actually returns, same as the InventoryItem
// alias above.
type InventoryItemRow = Omit<
  Prisma.InventoryItemGetPayload<{ include: typeof INVENTORY_ITEM_INCLUDE }>,
  'purchasePrice' | 'estimatedValue'
> & Pick<InventoryItem, 'purchasePrice' | 'estimatedValue'>;

/** #471: the flat record served by /api/inventory* — a unit with its family's description and collections. */
export type InventoryItemView = FlatItemView<InventoryItemRow>;

// FEAT-86: list/detail payloads carry a computed `readiness` percentage
// (null when the curve model has no window to work with). Computed on read
// rather than stored — it is time-dependent (it shifts every new year), so
// denormalising it would immediately go stale.
type WithReadiness<T> = T & { readiness: number | null };

function attachReadiness<
  T extends {
    curveShape: unknown;
    peakMaturityFrom: number | null;
    peakMaturityTo: number | null;
  },
>(item: T): WithReadiness<T> {
  return {
    ...item,
    readiness: computeReadiness(
      item.curveShape as Parameters<typeof computeReadiness>[0],
      item.peakMaturityFrom,
      item.peakMaturityTo,
    ),
  };
}

/** What the FEAT-65 "same bottle" rule compares. */
type DuplicateKey = Pick<InventoryPatch, 'category' | 'producer' | 'name' | 'vintage' | 'bottleSize' | 'format'>;

/**
 * FEAT-65 "same bottle" rule, mirroring the client's `isDuplicateOf`
 * (`web/lib/inventory/duplicate.ts`). Pure, so a caller holding a list of
 * candidates (the CSV import, FEAT-91) does not re-read the database per row.
 */
export function isDuplicateOf(
  item: Pick<InventoryItem, 'category' | 'producer' | 'name' | 'vintage' | 'bottleSize' | 'format'>,
  data: DuplicateKey,
): boolean {
  const normalize = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();
  if (!data.category || !data.producer || !data.name || item.category !== data.category) return false;
  if (normalize(item.producer) !== normalize(data.producer)) return false;
  if (normalize(item.name) !== normalize(data.name)) return false;

  if (data.category === 'cigar') {
    return normalize(item.format) === normalize(data.format);
  }
  if (data.category === 'spirit') {
    return normalize(item.bottleSize) === normalize(data.bottleSize);
  }
  // wine / sparkling — a missing vintage on either side is a potential
  // match (let the caller decide), same as the client's vintageMatch.
  const vintageMatches = data.vintage == null || item.vintage == null || item.vintage === data.vintage;
  return vintageMatches && normalize(item.bottleSize) === normalize(data.bottleSize);
}

export class InventoryService {
  /**
   * ISSUE_083: an unbounded `findMany` here loads the entire inventory into
   * memory and serializes all of it on every page load — fine at hundreds of
   * items, not at tens of thousands. A hard ceiling bounds the worst case;
   * `truncated` tells the caller the list isn't complete so it isn't
   * mistaken for the full inventory.
   */
  async listInventory(_userId: string): Promise<{ items: WithReadiness<InventoryItemView>[]; truncated: boolean }> {
    const limit = 2000;
    const items = await prisma.inventoryItem.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: INVENTORY_ITEM_INCLUDE,
      take: limit + 1,
    });
    const truncated = items.length > limit;
    return { items: items.slice(0, limit).map((item) => attachReadiness(toItemView(item))), truncated };
  }

  async listTrash(_userId: string): Promise<InventoryItemView[]> {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const items = await prisma.inventoryItem.findMany({
      where: {
        deletedAt: { not: null, gte: cutoff },
      },
      orderBy: { deletedAt: 'desc' },
      include: INVENTORY_ITEM_INCLUDE,
    });
    return items.map(toItemView);
  }

  async getItem(_userId: string, id: string): Promise<InventoryItemView | null> {
    const item = await prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null },
      include: INVENTORY_ITEM_INCLUDE,
    });
    return item ? toItemView(item) : null;
  }

  async getItemWithTraceability(_userId: string, id: string): Promise<InventoryWithTraceability | null> {
    const item = await prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null },
      include: INVENTORY_ITEM_INCLUDE,
    });
    if (!item) return null;

    // `updatedBy` is a real column on InventoryItem (nullable) — no cast needed.
    const uniqueIds = [...new Set([item.userId, item.updatedBy ?? undefined].filter((v): v is string => Boolean(v)))];
    const users = await prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, displayName: true, username: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.displayName ?? u.username]));

    const creator = item.userId ? { id: item.userId, name: userMap.get(item.userId) ?? item.userId } : null;
    const updatedById = item.updatedBy ?? undefined;
    const lastEditor = updatedById ? { id: updatedById, name: userMap.get(updatedById) ?? updatedById } : null;

    // `item` (a concrete typed object) is a structural subtype of
    // `Record<string, unknown>` — every property value is assignable to
    // `unknown`, so this assigns directly, no cast required. FEAT-86:
    // `readiness` is folded in here so the single-item route exposes it too.
    return { item: attachReadiness(toItemView(item)), creator, lastEditor };
  }

  async getItemHistory(id: string): Promise<InventoryHistoryEntry[]> {
    const logs = await prisma.auditLog.findMany({
      where: {
        bottleId: id,
        action: { in: ['CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'RESTORE_FIELD', 'GUEST_UPDATE'] },
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
        changes: details?.['changes'] as FieldChange[] | null ?? null,
        createdAt: log.createdAt,
      };
    });
  }

  /**
   * ISSUE_141/ISSUE_068: the FEAT-65 "is this the same bottle" rule
   * (`web/lib/inventory/duplicate.ts`'s `isDuplicateOf`) existed only in the
   * browser — CSV import, the offline queue and two members creating the
   * same bottle concurrently from two devices all bypassed it entirely.
   * Ported here so server-side creation paths can apply the identical rule.
   * Scans by category only (indexed, small result set for a self-hosted
   * single-household inventory) then compares in JS — mirrors the client
   * logic exactly rather than re-deriving an equivalent SQL predicate.
   */
  async findDuplicateCandidate(
    data: DuplicateKey,
    client: PrismaClientOrTx = prisma,
  ): Promise<InventoryItem | null> {
    if (!data.category || !data.producer || !data.name) return null;

    const candidates = await client.inventoryItem.findMany({
      where: { category: data.category, deletedAt: null },
    });

    return candidates.find((item) => isDuplicateOf(item, data)) ?? null;
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
    client: PrismaClientOrTx = prisma,
    fieldSources?: Partial<Record<string, FieldSource>>,
  ): Promise<InventoryItemView> {
    // InventoryInput (a per-category discriminated union with some required
    // fields) is a structural subset of InventoryPatch (the same fields, all
    // optional, flattened across categories) — a single assertion documents
    // that relationship instead of the previous `as unknown as` escape hatch.
    const patch = data as InventoryPatch;
    const dbData = this.mapInputToDb(patch);
    const alertStatus = computeAlertStatus(
      patch.peakMaturityFrom ?? undefined,
      patch.peakMaturityTo ?? undefined,
    );
    const extra: Record<string, unknown> = {};
    if (fieldSources && Object.keys(fieldSources).length > 0) {
      extra.fieldSources = fieldSources;
    }

    // #471: the unit is created with its own family, in the same write. The
    // description is still written on the unit too (transitional mirror read
    // by every existing path); the family keeps its own locks and sources.
    const { cellarId, ...itemData } = dbData;
    const { category, name, producer } = data;
    const productSources = pickProductFields(fieldSources ?? {});
    const product = {
      userId,
      ...pickProductFields({ ...dbData, alertStatus }),
      category,
      name,
      producer,
      lockedFields: (data.lockedFields ?? []).filter(isProductField),
      ...(Object.keys(productSources).length > 0 ? { fieldSources: productSources } : {}),
    };
    const created = await client.inventoryItem.create({
      data: {
        id: uuidv4(),
        purchasedAt: todayAsPurchaseDate(),
        ...itemData,
        ...extra,
        category,
        name,
        producer,
        alertStatus,
        user: { connect: { id: userId } },
        ...(cellarId ? { cellar: { connect: { id: cellarId } } } : {}),
        product: { create: product },
      } satisfies Prisma.InventoryItemCreateInput,
      include: INVENTORY_ITEM_INCLUDE,
    });
    return toItemView(created);
  }

  /**
   * `options.fieldSources` tags the (non-manual) origin of specific fields
   * in this patch — used by the FEAT-04 OCR scan pipeline and CSV import.
   * `options.isManualEdit` (default `true`) governs the FEAT-05 "manual
   * entry has absolute priority" guarantee:
   *  - `true` (the regular user-facing PATCH /:id and the guest write-access
   *    route, both driven by an explicit form/detail-sheet edit): every
   *    touched field is added to `lockedFields` so a later automated update
   *    can never silently overwrite it again, and any stale non-manual
   *    `fieldSources` tag on that field is cleared back to the implicit
   *    'manual' default.
   *  - `false` (the OCR scan pipeline calling this same method): fields are
   *    populated without being locked, so the user can still let a later
   *    automated pass complete them.
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
    // `alertStatus` is always derived from the drinking window (below), never
    // taken from a patch, so it is neither written, locked nor logged from it.
    const { expectedUpdatedAt, alertStatus: _derived, ...patch } = rawPatch;
    const row = await prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null },
      include: INVENTORY_ITEM_INCLUDE,
    });
    if (!row) return null;
    // #471: what the caller sees and patches is the flat record — the unit
    // with its family's description (see `toItemView`).
    const existing = toItemView(row);

    // ─── Optimistic concurrency check (FEAT-16/23) ───────────────────────────
    // Opt-in: the offline sync queue and the bottle edit form (#572) send
    // `expectedUpdatedAt`, the item's `updatedAt` as known when the change
    // was made (possibly while offline). Every other caller omits it and
    // keeps the unconditional last-write-wins behavior. Compared in milliseconds since
    // the wire format is an ISO string round-tripped through JSON. #471: the
    // unit's own `updatedAt` — every write through this route bumps it.
    if (
      expectedUpdatedAt !== undefined &&
      new Date(expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()
    ) {
      return { conflict: true, serverItem: existing };
    }

    // `lockedFields` exists to stop a *later automated* update (OCR scan)
    // from silently overwriting a manual edit — it must never block the user
    // from manually editing that same field again (e.g. bumping the quantity
    // of an already-locked duplicate, or resetting a bottle from "empty" back
    // to "full"). Only a non-manual caller is filtered against it.
    const safePatch = bypassFieldLock || isManualEdit
      ? patch
      : (Object.fromEntries(
          Object.entries(patch).filter(([key]) => !existing.lockedFields.includes(key))
        ) as InventoryPatch);

    // #573: a bottle this patch leaves finished gives its grid slot back (see
    // lib/finished-item.ts) — the cellar map hides it, so a slot it kept would
    // look free yet refuse every other bottle. Judged on `safePatch`, i.e. on
    // what is really written: a locked `fillLevel` stripped from an automated
    // update must not unplace a bottle that stays full.
    const finished = this.isFinishedAfter(existing, safePatch);

    // Slot uniqueness: if assigning a grid slot, verify it is not occupied by
    // another item. Not for a finished bottle (#573): it is leaving its slot,
    // so it cannot conflict with anyone.
    const targetCellarId = 'cellarId' in patch ? patch.cellarId : existing.cellarId;
    const targetSlotColumn = 'slotColumn' in patch ? patch.slotColumn : existing.slotColumn;
    const targetSlotRow = 'slotRow' in patch ? patch.slotRow : existing.slotRow;

    if (!finished && targetCellarId && targetSlotColumn != null && targetSlotRow != null) {
      const conflict = await prisma.inventoryItem.findFirst({
        where: {
          cellarId: targetCellarId,
          slotColumn: targetSlotColumn,
          slotRow: targetSlotRow,
          id: { not: id },
          deletedAt: null,
        },
      });
      if (conflict) return { item: existing, changes: [], slotConflict: true };
    }

    // #573: the released slot goes into the recorded changes as well as the
    // write, so the history records which slot the bottle left — and never a
    // slot sent alongside that `NO_SLOT` overrides.
    const writePatch: InventoryPatch = finished ? { ...safePatch, ...NO_SLOT } : safePatch;

    const changes: FieldChange[] = Object.entries(writePatch)
      .filter(([key, val]) => {
        const existingVal = this.getField(existing, key);
        return JSON.stringify(existingVal) !== JSON.stringify(val);
      })
      .map(([key, val]) => ({
        field: key,
        from: this.getField(existing, key),
        to: val,
      }));

    // #471: the family's fields go to the family (and its mirror), the rest
    // to the unit — each with its own locks and field sources (D1).
    const dbData = this.mapInputToDb(writePatch);
    const productData: ProductWrite = pickProductFields(dbData);
    const itemData = Object.fromEntries(Object.entries(dbData).filter(([key]) => !isProductField(key)));

    // ─── FEAT-05: auto-lock manually-edited fields + reconcile fieldSources ──
    // `lockedFields` can already be set explicitly in the patch (a future
    // "unlock this field" UI action) — that explicit intent always wins over
    // the automatic append.
    const touched = Object.keys(safePatch).filter((key) => key !== 'lockedFields');
    const autoLock = isManualEdit && !Object.prototype.hasOwnProperty.call(safePatch, 'lockedFields');
    const isUnitField = (key: string) => !isProductField(key);
    const bookkeeping = { touched, fieldSources, isManualEdit, autoLock };
    Object.assign(productData, this.nextLocksAndSources(row.product, isProductField, bookkeeping));
    Object.assign(itemData, this.nextLocksAndSources(row, isUnitField, bookkeeping));

    const from = ('peakMaturityFrom' in safePatch ? safePatch.peakMaturityFrom : existing.peakMaturityFrom) as number | null | undefined;
    const to = ('peakMaturityTo' in safePatch ? safePatch.peakMaturityTo : existing.peakMaturityTo) as number | null | undefined;
    // #706: a patch moving only one end of the window is checked against the
    // stored other end. Throws a ZodError, which the router answers with 400.
    if ('peakMaturityFrom' in safePatch || 'peakMaturityTo' in safePatch) {
      peakWindowSchema.parse({ peakMaturityFrom: from, peakMaturityTo: to });
    }
    // Written only when it moves, so a unit-only edit leaves the family untouched.
    const alertStatus = computeAlertStatus(from, to);
    if (alertStatus !== row.product.alertStatus) productData.alertStatus = alertStatus;

    let item: InventoryItemView;
    try {
      item = await prisma.$transaction(async (tx) => {
        if (Object.keys(productData).length > 0) {
          await writeProductFields(tx, row.productId, { ...productData, updatedBy: userId });
        }
        // The unit is always stamped: the flat record it stands for changed.
        const updated = await tx.inventoryItem.update({
          where: { id },
          data: { ...itemData, updatedAt: new Date(), updatedBy: userId } as never,
          include: INVENTORY_ITEM_INCLUDE,
        });
        return toItemView(updated);
      });
    } catch (err) {
      // #173: the application-level check above closes almost every window,
      // but the database's partial unique index is the actual guarantee — a
      // concurrent request that slipped past that check still hits this and
      // gets the same clean slotConflict response instead of a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { item: existing, changes: [], slotConflict: true };
      }
      throw err;
    }

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

    // `field` is a runtime string (not a literal key), so its shape can't be
    // statically checked here — but unlike the previous `as unknown as`, this
    // is validated at runtime just above against the item's real change
    // history, and `updateItem` re-filters by `lockedFields`/known columns.
    const patch = { [field]: toValue } as InventoryPatch;
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
    const rows = await prisma.inventoryItem.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: INVENTORY_ITEM_INCLUDE,
    });

    if (rows.length === 0) return 0;
    const existing = rows.map((row) => ({ row, view: toItemView(row) }));

    // #706: as in updateItem, a patch moving one end of the peak window is
    // checked against each item's stored other end, before anything is written.
    if ('peakMaturityFrom' in patch || 'peakMaturityTo' in patch) {
      for (const { view: item } of existing) {
        peakWindowSchema.parse({
          peakMaturityFrom: 'peakMaturityFrom' in patch ? patch.peakMaturityFrom : item.peakMaturityFrom,
          peakMaturityTo: 'peakMaturityTo' in patch ? patch.peakMaturityTo : item.peakMaturityTo,
        });
      }
    }

    let updatedCount = 0;
    // #471: a family shared by several selected units is written once.
    const writtenProducts = new Set<string>();
    await prisma.$transaction(async (tx) => {
      for (const { row, view: item } of existing) {
        // A bulk action is an explicit user action, exactly like the regular
        // single-item PATCH: `lockedFields` only shields a field from a later
        // *automated* pass (see `updateItem`), never from the user. Filtering
        // the patch here silently turned "mark as opened" / "set fill level"
        // into a no-op on every bottle whose level had once been adjusted by
        // hand — and still counted it as updated (ISSUE_034).
        const changedEntries = Object.entries(patch).filter(
          ([key, value]) => JSON.stringify(this.getField(item, key)) !== JSON.stringify(value)
        );
        // Only items this call really changes are applied and counted, so the
        // "N items updated" confirmation tells the truth.
        if (changedEntries.length === 0) continue;

        const changed = Object.fromEntries(changedEntries) as InventoryPatch;
        const dbData = this.mapInputToDb(changed);
        const productData: ProductWrite = pickProductFields(dbData);
        if (Object.keys(productData).length > 0 && !writtenProducts.has(row.productId)) {
          writtenProducts.add(row.productId);
          await writeProductFields(tx, row.productId, { ...productData, updatedBy: userId });
        }
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: {
            ...Object.fromEntries(Object.entries(dbData).filter(([key]) => !isProductField(key))),
            // #573: an item this call leaves finished gives its grid slot back (see updateItem).
            ...(this.isFinishedAfter(item, changed) ? NO_SLOT : {}),
            updatedAt: new Date(),
            updatedBy: userId,
          } as never,
        });
        updatedCount++;
      }
    }, { timeout: 60000, maxWait: 10000 });

    return updatedCount;
  }

  async softDelete(_userId: string, id: string): Promise<InventoryItemView | null> {
    const existing = await prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return null;

    const trashed = await prisma.inventoryItem.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: INVENTORY_ITEM_INCLUDE,
    });
    return toItemView(trashed);
  }

  async restore(_userId: string, id: string): Promise<InventoryItemView | null> {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const existing = await prisma.inventoryItem.findFirst({
      where: {
        id,
        deletedAt: { not: null, gte: cutoff },
      },
    });
    if (!existing) return null;

    // A trashed bottle keeps its grid slot, which may have been given to another
    // bottle since (#174). Restore it unplaced rather than assign the slot twice.
    let slotTaken = false;
    if (existing.cellarId && existing.slotColumn != null && existing.slotRow != null) {
      const occupant = await prisma.inventoryItem.findFirst({
        where: {
          cellarId: existing.cellarId,
          slotColumn: existing.slotColumn,
          slotRow: existing.slotRow,
          id: { not: id },
          deletedAt: null,
        },
        select: { id: true },
      });
      slotTaken = occupant !== null;
    }

    try {
      return toItemView(await prisma.inventoryItem.update({
        where: { id },
        data: slotTaken ? { deletedAt: null, slotColumn: null, slotRow: null } : { deletedAt: null },
        include: INVENTORY_ITEM_INCLUDE,
      }));
    } catch (err) {
      // #173: the occupant check above closes almost every window; the
      // database's partial unique index is the actual guarantee against a
      // slot having been taken in the instant between that check and this
      // write — fall back to restoring unplaced rather than erroring out.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return toItemView(await prisma.inventoryItem.update({
          where: { id },
          data: { deletedAt: null, slotColumn: null, slotRow: null },
          include: INVENTORY_ITEM_INCLUDE,
        }));
      }
      throw err;
    }
  }

  /**
   * ISSUE_096: a permanently-purged item's photo (uploads/products/*) was
   * never deleted alongside its row — the upload volume only ever grew.
   * Rows only here, same two-phase contract as scanService's scan-photo
   * purge (#183): the caller must only call `deletePhotoFiles` on the
   * returned paths once this has actually committed, never before, so a
   * rolled-back transaction doesn't leave rows pointing at photos already
   * gone from disk.
   *
   * #471: a family whose last units are purged goes with them unless it holds
   * a tasting (QP1: it then stays, "Plus en cave"). A photo is only returned
   * once nothing — no family (photo or other photos), no remaining unit —
   * references it any more.
   */
  async purgeTrashed(
    client: PrismaClientOrTx = prisma,
  ): Promise<{ count: number; photoPaths: string[] }> {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const toPurge = await client.inventoryItem.findMany({
      where: { deletedAt: { lt: cutoff } },
      select: { id: true, photoUrl: true, productId: true },
    });
    if (toPurge.length === 0) return { count: 0, photoPaths: [] };

    const result = await client.inventoryItem.deleteMany({
      where: { id: { in: toPurge.map((item) => item.id) } },
    });

    const emptiedFamilies = {
      id: { in: [...new Set(toPurge.map((item) => item.productId))] },
      items: { none: {} },
      tastingNotes: { none: {} },
    } satisfies Prisma.ProductWhereInput;
    const purgedFamilies = await client.product.findMany({
      where: emptiedFamilies,
      select: { photoUrl: true, otherPhotoUrls: true },
    });
    if (purgedFamilies.length > 0) await client.product.deleteMany({ where: emptiedFamilies });

    const candidates = [
      ...toPurge.map((item) => item.photoUrl),
      ...purgedFamilies.flatMap((family) => [family.photoUrl, ...family.otherPhotoUrls]),
    ].filter((url): url is string => !!url && url.startsWith(LOCAL_PRODUCT_PHOTO_PREFIX));
    const photos = [...new Set(candidates)];
    const stillReferenced = await this.referencedProductPhotos(client, photos);
    return { count: result.count, photoPaths: photos.filter((url) => !stillReferenced.has(url)) };
  }

  /** The local product photos referenced by a unit or a family (its photo or its other photos). */
  private async referencedProductPhotos(client: PrismaClientOrTx, among?: string[]): Promise<Set<string>> {
    if (among?.length === 0) return new Set();
    const urls = among ? { in: among } : { startsWith: LOCAL_PRODUCT_PHOTO_PREFIX };
    const items = await client.inventoryItem.findMany({ where: { photoUrl: urls }, select: { photoUrl: true } });
    const families = await client.product.findMany({
      where: { OR: [{ photoUrl: urls }, among ? { otherPhotoUrls: { hasSome: among } } : { otherPhotoUrls: { isEmpty: false } }] },
      select: { photoUrl: true, otherPhotoUrls: true },
    });
    return new Set(
      [...items.map((item) => item.photoUrl), ...families.flatMap((family) => [family.photoUrl, ...family.otherPhotoUrls])]
        .filter((url): url is string => !!url && url.startsWith(LOCAL_PRODUCT_PHOTO_PREFIX)),
    );
  }

  /** Deletes local product photos from disk. Never throws: one bad path must not block the rest. */
  async deletePhotoFiles(photoPaths: string[]): Promise<void> {
    for (const photoPath of photoPaths) {
      try {
        await fs.unlink(path.join(process.cwd(), photoPath));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error(`[inventory] Failed to purge photo file ${photoPath}:`, err);
        }
      }
    }
  }

  /**
   * ISSUE_096 complement: a photo can be orphaned without ever going through
   * `purgeTrashed` — e.g. the item's photo was replaced (the old file's URL
   * was simply overwritten, nothing ever deleted it) or the save completed
   * but the surrounding item creation/update didn't. Sweeps uploads/products/
   * for files no InventoryItem (trashed or not — only a purged item's photo
   * is truly gone) and no family (#471: photo or other photos) references
   * any more.
   */
  async sweepOrphanProductPhotos(client: PrismaClientOrTx = prisma): Promise<number> {
    const uploadDir = path.join(process.cwd(), 'uploads', 'products');
    let files: string[];
    try {
      files = await fs.readdir(uploadDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw err;
    }
    if (files.length === 0) return 0;

    const referenced = await this.referencedProductPhotos(client);
    const referencedFilenames = new Set(
      [...referenced].map((url) => url.slice(LOCAL_PRODUCT_PHOTO_PREFIX.length)),
    );

    let deleted = 0;
    for (const filename of files) {
      if (referencedFilenames.has(filename)) continue;
      try {
        await fs.unlink(path.join(uploadDir, filename));
        deleted++;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error(`[inventory] Failed to purge orphan photo file ${filename}:`, err);
        }
      }
    }
    return deleted;
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

  /**
   * Read a dynamically-named field off an InventoryItem (`key` comes from
   * `Object.entries(patch)`, so it's a runtime string, not a literal key).
   * Single narrow assertion instead of the previous `as unknown as Record`
   * detour — `keyof InventoryItem` is still checked against the real model.
   */
  private getField(item: object, key: string): unknown {
    return (item as Record<string, unknown>)[key];
  }

  /**
   * FEAT-05 bookkeeping of one table — the family or the unit, each for its
   * own fields (#471, D1), told apart by `belongs`: a manual edit locks the
   * touched fields and clears their stale non-manual source, `fieldSources`
   * tags the fields this call filled. Returns only the columns that change.
   */
  private nextLocksAndSources(
    current: { lockedFields: string[]; fieldSources: Prisma.JsonValue },
    belongs: (field: string) => boolean,
    options: { touched: string[]; fieldSources?: Partial<Record<string, FieldSource>>; isManualEdit: boolean; autoLock: boolean },
  ): { lockedFields?: string[]; fieldSources?: Record<string, string> } {
    const { fieldSources, isManualEdit, autoLock } = options;
    const touched = options.touched.filter(belongs);
    const result: { lockedFields?: string[]; fieldSources?: Record<string, string> } = {};

    if (autoLock) {
      const fieldsToLock = touched.filter((key) => !current.lockedFields.includes(key));
      if (fieldsToLock.length > 0) result.lockedFields = [...current.lockedFields, ...fieldsToLock];
    }

    const existingSources = fieldSourcesOf(current.fieldSources);
    const nextSources: Record<string, string> = { ...existingSources };
    for (const [key, source] of Object.entries(fieldSources ?? {})) {
      if (source && belongs(key)) nextSources[key] = source;
    }
    if (isManualEdit) {
      // A field the user just edited by hand reclaims 'manual' status — any
      // stale non-manual tag is cleared unless this very call re-tags it
      // (e.g. a future OCR confirmation step calling updateItem with both
      // isManualEdit: true and an explicit fieldSources entry).
      for (const key of touched) {
        if (!fieldSources || !(key in fieldSources)) delete nextSources[key];
      }
    }
    if (JSON.stringify(nextSources) !== JSON.stringify(existingSources)) result.fieldSources = nextSources;
    return result;
  }

  /**
   * #573: whether `item` is finished once `patch` is applied. A field the
   * patch leaves `undefined` keeps its stored value (`mapInputToDb` drops
   * it); an explicit `fillLevel: null` does overwrite it.
   */
  private isFinishedAfter(item: { isOpened: boolean; fillLevel: number | null }, patch: InventoryPatch): boolean {
    return isFinishedItem({
      isOpened: patch.isOpened === undefined ? item.isOpened : patch.isOpened,
      fillLevel: patch.fillLevel === undefined ? item.fillLevel : patch.fillLevel,
    });
  }
}

export const inventoryService = new InventoryService();
