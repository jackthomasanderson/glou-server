import { Prisma } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { prisma, PrismaClientOrTx } from '../lib/prisma';
import { InventoryPatch, InventoryInput } from '../schemas/inventory.schema';
import { computeAlertStatus, computeReadiness } from './alert.service';
import { readFieldHistory } from './audit.service';
import type { FieldChange, ItemView, ProductHistoryEntry } from '../../../shared/product';
import { isGroupableItem, unitKind, type UnitKind } from '../lib/finished-item';
import { v4 as uuidv4 } from 'uuid';
import { TRASH_RETENTION_DAYS, type FieldSource } from '../../../shared/inventory';
import {
  compareFamilyIds, isProductField, lockFamilies, lockFamily, nextLocksAndSources, pickProductFields, purchaseDayFromInput,
  toItemView, toUnitView, UNIT_SLOTS_INCLUDE,
  type FlatItemView,
} from '../lib/product-fields';
import {
  applyState, isStateField, planState, type ApplyStateResult, type StateItem, type StateOutcome, type StatePatch,
} from './stock-state.service';
import { writeFamilyDescription, type UnitSlotChanges } from './product.service';
import { rememberDistinct } from './review.service';
import { GROUP_KEY_FIELDS, joinIdenticalGroup, splitLockedGroup } from './stock-split.service';
import { fitSlotsTo, freeSlots, reviveSlots, slotsFreed, trashSlots } from '../lib/slots';

// ISSUE_096: only a photoUrl saved by search.router.ts's product-image
// endpoints (uploads/products/*) is ever safe to delete from disk — an
// item whose photoUrl is some other external address must never be touched.
const LOCAL_PRODUCT_PHOTO_PREFIX = '/uploads/products/';

/** `/uploads/products/<file>` of a photo URL, absolute or not; null when it is not a local product photo. */
export function localPhotoPath(url: string | null): string | null {
  if (!url) return null;
  let pathname: string;
  try {
    pathname = new URL(url, 'http://local').pathname;
  } catch {
    return null;
  }
  return pathname.startsWith(LOCAL_PRODUCT_PHOTO_PREFIX) && !pathname.slice(LOCAL_PRODUCT_PHOTO_PREFIX.length).includes('/')
    ? pathname
    : null;
}

export type { FieldChange };

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
  | { status: 'success'; item: InventoryItemView; changes: FieldChange[]; joined?: { from: number; to: number } };

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
  | {
      /** D8: the unit that now carries the requested state (a detached sub-record, the unit itself, or the group that absorbed it). */
      item: InventoryItemView;
      changes: FieldChange[];
      /** D8: the other units written (the group a copy was detached from). */
      changed: ItemView[];
      /** D8: the units deleted (a sub-record absorbed by its group). */
      removedIds: string[];
      /** How the detach / reattach rule applied the state, when it did more than update the unit. */
      outcome?: Exclude<StateOutcome, 'updated'>;
      /** The group whose count moved (−1 detached, +1 reattached): logged in its own history. */
      groupChange?: { itemId: string; from: number; to: number; slotChanges?: FieldChange[] };
      /** Tastings deleted by a reattach answered `keepTastings: false`. */
      deletedTastings?: number;
      /**
       * #471 (W3): the edited group became identical to another one and joined
       * it — `item` is that group, at `to` copies; the edited one is in `removedIds`.
       */
      joined?: { from: number; to: number };
      /** FEAT-93: other units of the family that gave up cells with its new category. */
      unitSlotChanges?: UnitSlotChanges[];
    }
  | { conflict: true; serverItem: InventoryItemView };

/** A line of a unit's history; `itemId` is the unit itself. */
export type InventoryHistoryEntry = ProductHistoryEntry;

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
/**
 * #471 (lot Z): the unit's own columns a history value may be restored to —
 * every column but its identity and bookkeeping. Description fields are the
 * family's ({@link isProductField}), restored on it.
 */
const RESTORABLE_UNIT_FIELDS: ReadonlySet<string> = new Set(
  Object.values(Prisma.InventoryItemScalarFieldEnum).filter((field) => ![
    'id', 'userId', 'productId', 'createdAt', 'updatedAt', 'deletedAt', 'updatedBy', 'lockedFields', 'fieldSources',
  ].includes(field)),
);

const INVENTORY_ITEM_INCLUDE = {
  product: { include: { collections: { select: { id: true, name: true, color: true, icon: true } } } },
  // FEAT-93: the unit's live cells of the cellar plan.
  slots: UNIT_SLOTS_INCLUDE,
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

  getItemHistory(id: string): Promise<InventoryHistoryEntry[]> {
    return readFieldHistory({ bottleId: id });
  }

  /**
   * #471 (FEAT-97 c5): "C'est un autre vin" — a new wine of the same name as
   * `distinctFrom`, remembered as a different wine from each of them, in one
   * transaction (rememberDistinct, review.service.ts).
   */
  async createApart(
    userId: string,
    data: InventoryInput,
    distinctFrom: string[],
    fieldSources?: Partial<Record<string, FieldSource>>,
  ): Promise<InventoryItemView> {
    return prisma.$transaction(async (tx) => {
      const created = await this.createItem(userId, data, tx, fieldSources);
      await rememberDistinct(tx, created.productId, distinctFrom);
      return created;
    });
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
    const unitSources = Object.fromEntries(Object.entries(fieldSources ?? {}).filter(([key]) => !isProductField(key)));
    if (Object.keys(unitSources).length > 0) {
      extra.fieldSources = unitSources;
    }

    // #471: the unit is created with its own family, in the same write. The
    // description goes to the family only; each keeps its own locks and
    // sources. The purchase day is the group's (D5), stored as a day (D6).
    const { cellarId, purchasedAt: _day, ...rest } = dbData as typeof dbData & { purchasedAt?: string | null };
    const itemData = Object.fromEntries(Object.entries(rest).filter(([key]) => !isProductField(key) && key !== 'lockedFields'));
    const unitLocks = (data.lockedFields ?? []).filter((field) => !isProductField(field));
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
        ...itemData,
        purchasedAt: purchaseDayFromInput(data.purchasedAt),
        ...extra,
        ...(unitLocks.length > 0 ? { lockedFields: unitLocks } : {}),
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
      /**
       * #471 (FEAT-109): a check of the write against the unit as read under
       * its family's lock, with the outcome the detach rule plans for it —
       * the guest route refuses there what would change a number. Throws an
       * AppError to refuse; nothing is written then.
       */
      guard?: (unit: StateItem, planned: () => StateOutcome, kind: UnitKind) => void;
    },
  ): Promise<UpdateItemResult | null> {
    const { fieldSources, isManualEdit = true, bypassFieldLock = false } = options ?? {};
    // `expectedUpdatedAt` (FEAT-16/23) is a sync-protocol field, not a real
    // InventoryItem column — strip it before it reaches `mapInputToDb`/Prisma.
    // `alertStatus` is always derived from the drinking window (below), never
    // taken from a patch, so it is neither written, locked nor logged from it.
    // #471: `smokeOne` and `keepTastings` are instructions to the detach /
    // reattach rule (stock-state.service.ts), not columns either; nor is
    // `tastingId`, the tasting that follows a detached copy (FEAT-107).
    // #471 (lot Z): `isOwned` is only an older client's leftover (schema: `true` ignored, `false` refused).
    const { expectedUpdatedAt, alertStatus: _derived, smokeOne, keepTastings, tastingId, isOwned: _legacy, ...patch } = rawPatch;
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
    // This first check only answers early: the one that decides is made
    // again once the family is locked and the unit read under that lock
    // (below), so a write committed in between (a write-off, a detach) is
    // never overwritten by a count or a state computed before it.
    const isStale = (updatedAt: Date) =>
      expectedUpdatedAt !== undefined && new Date(expectedUpdatedAt).getTime() !== updatedAt.getTime();
    if (isStale(existing.updatedAt)) {
      return { conflict: true, serverItem: existing };
    }

    // `lockedFields` exists to stop a *later automated* update (OCR scan)
    // from silently overwriting a manual edit — it must never block the user
    // from manually editing that same field again (e.g. bumping the quantity
    // of an already-locked duplicate, or resetting a bottle from "empty" back
    // to "full"). Only a non-manual caller is filtered against it. #471: the
    // unit's own locks here; the family's are read once it is locked, in the
    // transaction (writeFamilyDescription).
    const respectLocks = !bypassFieldLock && !isManualEdit;
    const safePatch = respectLocks
      ? (Object.fromEntries(
          Object.entries(patch).filter(([key]) => isProductField(key) || !row.lockedFields.includes(key))
        ) as InventoryPatch)
      : patch;

    // #471: the family's fields go to the family, the rest
    // to the unit — each with its own locks and field sources (D1). FEAT-93:
    // the cells of the cellar plan are not columns of the unit (routes of
    // slot.service.ts); the detach rule frees them when the unit is finished
    // (#573) or changes cellar (#798), and records which in the changes.
    const dbData = this.mapInputToDb(safePatch);
    const familyPatch = pickProductFields(dbData);
    const itemData = Object.fromEntries(Object.entries(dbData).filter(([key]) => !isProductField(key)));

    // ─── FEAT-05: auto-lock manually-edited fields + reconcile fieldSources ──
    // `lockedFields` can already be set explicitly in the patch (a future
    // "unlock this field" UI action) — that explicit intent always wins over
    // the automatic append.
    const touched = Object.keys(safePatch).filter((key) => key !== 'lockedFields');
    const autoLock = isManualEdit && !Object.prototype.hasOwnProperty.call(safePatch, 'lockedFields');
    const isUnitField = (key: string) => !isProductField(key);
    const unitWrite = { ...itemData, ...nextLocksAndSources(row, isUnitField, { touched, fieldSources, isManualEdit, autoLock }) };
    const state = Object.fromEntries(Object.entries(unitWrite).filter(([key]) => isStateField(key))) as StatePatch;
    const unit = Object.fromEntries(Object.entries(unitWrite).filter(([key]) => !isStateField(key)));

    let familyChanges = new Map<string, FieldChange>();
    let familySlots: UnitSlotChanges[] = [];
    const written = await prisma.$transaction(async (tx) => {
      // #471: the family first (the locking rule), then the unit as it is
      // once nobody else can write it — a detach decided on a stale count
      // would create a copy out of nothing.
      await lockFamily(tx, row.productId);
      const fresh = await tx.inventoryItem.findUnique({ where: { id } });
      if (!fresh || fresh.deletedAt) return null;
      if (isStale(fresh.updatedAt)) return { conflict: true as const };
      const kind = unitKind(safePatch.category ?? row.product.category);
      options?.guard?.(fresh as StateItem, () =>
        planState(fresh as StateItem, { unit, state, smokeOne, keepTastings }, kind).outcome, kind);
      // Also when the patch holds no family field: the derived alert may
      // need realigning, and that is decided on the locked family (#706
      // window check included — a ZodError, answered with 400).
      const family = await writeFamilyDescription(tx, row.productId, familyPatch, {
        userId, touched, fieldSources, isManualEdit, autoLock, respectLocks,
      });
      familyChanges = new Map(family.changes.map((change) => [change.field, change]));
      familySlots = family.unitSlotChanges;
      // The unit is always stamped: the flat record it stands for changed.
      const result = await applyState<typeof INVENTORY_ITEM_INCLUDE, InventoryItemRow>(
        tx, fresh as StateItem, { unit, state, smokeOne, keepTastings },
        { userId, kind, include: INVENTORY_ITEM_INCLUDE },
      );
      // FEAT-107 c3: the tasting noted on the group goes with the copy taken
      // off it — the finished bottle is the one that was tasted.
      if (tastingId && result.outcome === 'detached') {
        await tx.tastingNote.updateMany({ where: { id: tastingId, itemId: id }, data: { itemId: result.data.id } });
      }
      // A whole group made identical to another one by this edit joins it
      // (design.md rule 4): the answer is then that group (D8). So does a
      // copy put back intact that became a line of its own (its line of
      // origin finished or gone meanwhile): two « Annuler » in either order
      // end as one line, never two identical ones side by side.
      const regroups = result.outcome === 'regrouped' || (result.outcome === 'updated'
        && GROUP_KEY_FIELDS.some((field) => field in unit && JSON.stringify(unit[field]) !== JSON.stringify(fresh[field])));
      const joined = regroups ? await joinIdenticalGroup(tx, result.data, kind, userId) : null;
      if (!joined) return { result, fresh: fresh as StateItem, joined: null };
      const survivor = await tx.inventoryItem.findUniqueOrThrow({ where: { id: joined.survivorId }, include: INVENTORY_ITEM_INCLUDE });
      return {
        result: { ...result, data: survivor as InventoryItemRow, removedIds: [...result.removedIds, id] },
        fresh: fresh as StateItem,
        joined: { from: joined.from, to: joined.to },
      };
    });
    if (!written) return null;
    if ('conflict' in written) {
      const server = await this.getItem(userId, id);
      return server ? { conflict: true, serverItem: server } : null;
    }
    const outcome: ApplyStateResult<InventoryItemRow> = written.result;
    const current: StateItem = written.fresh;
    const joined = written.joined;

    // #471: recorded from the unit as read once locked, with the state as
    // the detach rule wrote it (a smoked cigar).
    const recorded: Record<string, unknown> = { ...dbData };
    if (smokeOne) Object.assign(recorded, outcome.state);
    const unitChanges = new Map(Object.entries(recorded)
      .filter(([key, value]) => !isProductField(key) && JSON.stringify(this.getField(current, key)) !== JSON.stringify(value))
      .map(([key, value]) => [key, { field: key, from: this.getField(current, key), to: value }]));
    const changes = [
      ...Object.keys(recorded)
        .map((key) => familyChanges.get(key) ?? unitChanges.get(key))
        .filter((change): change is FieldChange => change !== undefined),
      // FEAT-93 (#573): the cells the unit gave up, so its history says which.
      ...outcome.slotChanges,
      // And those it gave up with its family's new category (a wine made a cigar).
      ...familySlots.filter((unit) => unit.itemId === id).flatMap((unit) => unit.changes),
    ];
    return {
      item: toItemView(outcome.data),
      changes,
      changed: outcome.changed.map(toUnitView),
      removedIds: outcome.removedIds,
      ...(outcome.outcome !== 'updated' ? { outcome: outcome.outcome } : {}),
      ...(outcome.groupChange ? { groupChange: outcome.groupChange } : {}),
      ...(outcome.deletedTastings ? { deletedTastings: outcome.deletedTastings } : {}),
      ...(joined ? { joined } : {}),
      // FEAT-93: the other units of the family that gave up cells with it.
      ...(familySlots.some((unit) => unit.itemId !== id) ? { unitSlotChanges: familySlots.filter((unit) => unit.itemId !== id) } : {}),
    };
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
    // #471 (FEAT-102): a guessed number is settled by "C'est bon" or "Corriger le nombre", never marked again from the history.
    if (field === 'needsReview') return { status: 'invalid_value' };
    // #471 (lot Z): only a column of the unit or of its family can be written
    // back. An older history line may name one that is gone (FEAT-87's
    // `isOwned`, "Stocker cette référence"): refused, never sent to Prisma.
    if (!isProductField(field) && !RESTORABLE_UNIT_FIELDS.has(field)) return { status: 'invalid_value' };

    const history = await this.getItemHistory(itemId);
    const seenValues = new Set<string>();
    for (const entry of history) {
      // #471: a value of a line since absorbed by this one would rewrite all its copies.
      if (entry.absorbed) continue;
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

    return { status: 'success', item: result.item, changes: result.changes, ...(result.joined ? { joined: result.joined } : {}) };
  }

  async bulkUpdate(
    userId: string,
    ids: string[],
    patch: InventoryPatch,
    /** FEAT-93: filled with the cells each unit gave up, for its history. */
    slotChanges: UnitSlotChanges[] = [],
  ): Promise<number> {
    const rows = await prisma.inventoryItem.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: INVENTORY_ITEM_INCLUDE,
    });

    if (rows.length === 0) return 0;
    // #471: families locked in a stable order (by id), so two bulk actions
    // over overlapping selections cannot deadlock.
    const existing = rows
      .map((row) => ({ row, view: toItemView(row) }))
      .sort((a, b) => compareFamilyIds(a.row.productId, b.row.productId) || compareFamilyIds(a.row.id, b.row.id));
    // #471 (D18): no state reaches here — the bulk schema refuses one ("Marquer
    // comme bus" is POST /api/products/bulk-drink). The sync version is not a column.
    const { expectedUpdatedAt: _sync, ...columns } = patch;
    const familyPatch = pickProductFields(this.mapInputToDb(columns));
    const unitPatch = Object.fromEntries(Object.entries(this.mapInputToDb(columns)).filter(([key]) => !isProductField(key)));

    let updatedCount = 0;
    await prisma.$transaction(async (tx) => {
      // #471 (lock order, #787 review): every family of the selection locked
      // first, in sorted order, before any unit is written — even for a patch
      // of unit fields only, which would otherwise deadlock (40P01) with a
      // description write (family lock, then copy onto its units).
      await lockFamilies(tx, rows.map((row) => row.productId));
      // #471: each family written once, under its lock — the window checked
      // against its stored other end (#706, a ZodError rolls everything
      // back) and its alert recomputed (writeFamilyDescription).
      const familyChanged = new Map<string, boolean>();
      for (const { row, view: item } of existing) {
        if (!familyChanged.has(row.productId)) {
          const family = Object.keys(familyPatch).length > 0
            ? await writeFamilyDescription(tx, row.productId, familyPatch, {
              // A bulk action is an explicit user action, exactly like the regular
              // single-item PATCH: `lockedFields` only shields a field from a later
              // *automated* pass (see `updateItem`), never from the user. Filtering
              // the patch here silently turned a bulk edit into a no-op on every
              // field once adjusted by hand — and still counted it (ISSUE_034).
              userId, isManualEdit: false, autoLock: false, respectLocks: false, onlyChanged: true,
            })
            : null;
          slotChanges.push(...(family?.unitSlotChanges ?? []));
          const changed = (family?.changes.length ?? 0) > 0;
          familyChanged.set(row.productId, changed);
        }
        const changedEntries = Object.entries(unitPatch).filter(
          ([key, value]) => JSON.stringify(this.getField(item, key)) !== JSON.stringify(value)
        );
        // Only items this call really changes are applied and counted, so the
        // "N items updated" confirmation tells the truth.
        if (changedEntries.length === 0 && !familyChanged.get(row.productId)) continue;
        // Read again under its family's lock: a bottle trashed since the
        // selection was read is left alone (never moved or edited in the trash).
        const fresh = await tx.inventoryItem.findFirst({ where: { id: item.id, deletedAt: null } });
        if (!fresh) continue;

        const changed = Object.fromEntries(changedEntries) as InventoryPatch;
        if (changed.cellarId !== undefined && isGroupableItem(fresh)) {
          // #471 (FEAT-111): a whole group moved to another cellar joins the
          // identical group there, as "Déplacer" does (a preset or the bulk
          // edit's cellar): never a line apart that should be one. Its other
          // fields are written first, so the group it joins is the one it now is.
          const { cellarId, ...others } = changed;
          const group = Object.keys(others).length === 0 ? fresh : await tx.inventoryItem.update({
            where: { id: item.id },
            data: { ...others, updatedAt: new Date(), updatedBy: userId } as never,
          });
          await splitLockedGroup(tx, userId, group, group.quantity ?? 1, { field: 'cellarId', to: cellarId ?? null }, unitKind(row.product.category));
          updatedCount++;
          continue;
        }
        // #798: an item moved to another cellar arrives unplaced (an opened
        // bottle; a group joins above): its cells are freed before the cellar
        // is written (FEAT-93, the slot's key includes the cellar).
        // A count or box size lowered, or the family's new category (single
        // cigars: one cell for the group), frees the cells beyond what the
        // unit may hold — the most recently placed first (automatic rule
        // until lot S2), never a commit refused by the cells' guard.
        const freed = [
          ...(changed.cellarId !== undefined && changed.cellarId !== fresh.cellarId ? await freeSlots(tx, item.id) : []),
          ...await fitSlotsTo(tx, item.id, { ...fresh, ...changed } as typeof fresh, unitKind(familyPatch.category ?? row.product.category)),
        ];
        if (freed.length > 0) slotChanges.push({ itemId: item.id, changes: slotsFreed(freed) });
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: {
            ...changed,
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

    // FEAT-93 (#174): its cells go to the trash with it, same timestamp.
    const deletedAt = new Date();
    const trashed = await prisma.$transaction(async (tx) => {
      await trashSlots(tx, [id], deletedAt);
      return tx.inventoryItem.update({ where: { id }, data: { deletedAt }, include: INVENTORY_ITEM_INCLUDE });
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
      include: { product: { select: { deletedAt: true } } },
    });
    if (!existing) return null;

    // #471 (D10): a unit back in stock brings its family out of the trash with
    // it — otherwise it would come back inside a family nobody sees.
    // FEAT-93 (#174): its cells come back with it, except a cell given to
    // another bottle since: that copy comes back unplaced. #173: the partial
    // unique index is the real guarantee against a cell taken between the
    // check and the write — tried once more, the check then sees it.
    try {
      return await this.restoreOnce(existing);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return this.restoreOnce(existing);
      throw err;
    }
  }

  private restoreOnce(existing: { productId: string; id: string; product: { deletedAt: Date | null } }): Promise<InventoryItemView> {
    const { id } = existing;
    return prisma.$transaction(async (tx) => {
      // The locking rule: the family first, then its unit.
      await lockFamily(tx, existing.productId);
      if (existing.product.deletedAt) {
        await tx.product.update({ where: { id: existing.productId }, data: { deletedAt: null } });
      }
      await tx.inventoryItem.update({ where: { id }, data: { deletedAt: null } });
      await reviveSlots(tx, [id]);
      return toItemView(await tx.inventoryItem.findUniqueOrThrow({ where: { id }, include: INVENTORY_ITEM_INCLUDE }));
    });
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
   * #471: a family left without any unit by this purge goes with its units,
   * unless it holds a tasting (QP1: it then stays, "Plus en cave"). A family
   * put in the trash itself (D10) is deleted past the retention period, its
   * tastings with it (QP7: erasing the wine was asked for explicitly). A
   * photo is only returned once nothing — no family (photo or other photos),
   * no remaining unit — references it any more.
   *
   * Without a client, runs in its own transaction (startup purge): a
   * half-done purge would leave emptied families nobody ever looks at again.
   */
  async purgeTrashed(
    client?: PrismaClientOrTx,
  ): Promise<{ count: number; photoPaths: string[] }> {
    if (!client) return prisma.$transaction((tx) => this.purgeTrashed(tx), { timeout: 60000, maxWait: 10000 });
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const toPurge = await client.inventoryItem.findMany({
      where: { deletedAt: { lt: cutoff } },
      select: { id: true, productId: true },
    });
    const result = toPurge.length > 0
      ? await client.inventoryItem.deleteMany({ where: { id: { in: toPurge.map((item) => item.id) } } })
      : { count: 0 };

    const purgedFamilies = await client.product.findMany({
      where: {
        items: { none: {} },
        OR: [
          // QP1: emptied by this purge, not in the trash themselves, no tasting.
          { id: { in: [...new Set(toPurge.map((item) => item.productId))] }, deletedAt: null, tastingNotes: { none: {} } },
          // QP7: trashed themselves, past the retention.
          { deletedAt: { lt: cutoff } },
        ],
      },
      select: { id: true, photoUrl: true, otherPhotoUrls: true },
    });
    if (purgedFamilies.length > 0) {
      const ids = { in: purgedFamilies.map((family) => family.id) };
      // `TastingNote.productId` is SET NULL: delete them first, or they would outlive their wine.
      await client.tastingNote.deleteMany({ where: { productId: ids } });
      await client.product.deleteMany({ where: { id: ids } });
    }

    const candidates = purgedFamilies.flatMap((family) => [family.photoUrl, ...family.otherPhotoUrls]).filter((url): url is string => !!url && url.startsWith(LOCAL_PRODUCT_PHOTO_PREFIX));
    const photos = [...new Set(candidates)];
    const stillReferenced = await this.referencedProductPhotos(client, photos);
    return { count: result.count, photoPaths: photos.filter((url) => !stillReferenced.has(url)) };
  }

  /**
   * The local product photos referenced by a family (its photo or its
   * other photos) or a tasting (#471, FEAT-107). A tasting's photo is stored
   * as an absolute URL: its path is what names the file. A deleted tasting
   * (by hand, by a reattach answered "Ne pas la garder", or with its wine at
   * the purge, QP7) thus leaves its photo to the orphan sweep.
   */
  private async referencedProductPhotos(client: PrismaClientOrTx, among?: string[]): Promise<Set<string>> {
    if (among?.length === 0) return new Set();
    const urls = among ? { in: among } : { startsWith: LOCAL_PRODUCT_PHOTO_PREFIX };
    const families = await client.product.findMany({
      where: { OR: [{ photoUrl: urls }, among ? { otherPhotoUrls: { hasSome: among } } : { otherPhotoUrls: { isEmpty: false } }] },
      select: { photoUrl: true, otherPhotoUrls: true },
    });
    const tastings = await client.tastingNote.findMany({
      where: { photoUrl: { contains: LOCAL_PRODUCT_PHOTO_PREFIX } },
      select: { photoUrl: true },
    });
    const tastingPaths = tastings.map((tasting) => localPhotoPath(tasting.photoUrl))
      .filter((url) => url !== null && (!among || among.includes(url)));
    return new Set(
      [...families.flatMap((family) => [family.photoUrl, ...family.otherPhotoUrls]), ...tastingPaths]
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
      // #471 (lot Z): `isOwned` is no column any more (an older client's `true`, see the schema).
      Object.entries(data).filter(([key, v]) => v !== undefined && key !== 'isOwned')
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
}

export const inventoryService = new InventoryService();
