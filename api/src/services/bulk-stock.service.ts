import { prisma, type PrismaClientOrTx } from '../lib/prisma';
import { badRequest } from '../lib/errors';
import {
  FINISHED_ITEM_STATE, IN_STOCK_ITEM_FILTER, isGroupableItem, isIntactItem, itemUnits, unitKind, type UnitKind,
} from '../lib/finished-item';
import { compareFamilyIds, lockFamilies } from '../lib/product-fields';
import { freeSlots, slotsFreed, trashSlots } from '../lib/slots';
import type { AuditAction } from './audit.service';
import { applyState, STATE_FIELDS, type StateItem } from './stock-state.service';
import { splitLockedGroup } from './stock-split.service';
import { LISTED_PRODUCT_FILTER } from './product.service';
import { preselectGroup } from '../../../shared/stock-choice';
import type { BulkStockResult, FieldChange } from '../../../shared/product';
import type { BulkDrinkInput, BulkMoveInput, BulkTrashInput } from '../schemas/stock.schema';

// #471 (FEAT-111, D18, ux-ui.md §10.4.8): the bulk actions on wines selected
// in the list. Each one applies to every copy IN STOCK of the wines chosen —
// their groups and their opened bottles; never a finished or written-off one
// (c4) — in one transaction: all of it, or nothing. The families are locked
// first, in sorted order (the locking rule), before any unit is read or
// written. A wine in the trash, or unknown, is left out.

/** One line of history a bulk action writes, logged by the route once the transaction went through. */
export interface BulkAuditEntry {
  action: AuditAction;
  bottleId: string;
  productId: string;
  details: Record<string, unknown>;
}

export interface BulkOutcome {
  result: BulkStockResult;
  entries: BulkAuditEntry[];
}

type UnitRecord = NonNullable<Awaited<ReturnType<typeof prisma.inventoryItem.findFirst>>>;

interface LockedFamily {
  id: string;
  kind: UnitKind;
}

/** The families of `productIds` still listed (out of the trash), locked in sorted order. */
async function lockListedFamilies(tx: PrismaClientOrTx, productIds: string[]): Promise<LockedFamily[]> {
  await lockFamilies(tx, productIds);
  const families = await tx.product.findMany({
    where: { id: { in: productIds }, ...LISTED_PRODUCT_FILTER },
    select: { id: true, category: true },
  });
  return families
    .map((family) => ({ id: family.id, kind: unitKind(family.category) }))
    .sort((a, b) => compareFamilyIds(a.id, b.id));
}

/** The copies in stock of a family, as they stand now (oldest first). */
const inStock = (tx: PrismaClientOrTx, productId: string): Promise<UnitRecord[]> =>
  tx.inventoryItem.findMany({
    where: { productId, ...IN_STOCK_ITEM_FILTER },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

const unitsOf = (rows: UnitRecord[]) => rows.reduce((sum, row) => sum + itemUnits(row), 0);

/** The state columns that moved, as the history shows them. */
const stateChanges = (before: UnitRecord, after: Pick<StateItem, (typeof STATE_FIELDS)[number]>): FieldChange[] =>
  STATE_FIELDS
    .filter((field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null))
    .map((field) => ({ field, from: before[field], to: after[field] }));

export const bulkStockService = {
  /**
   * "Déplacer" (FEAT-111 c1): every copy in stock of the wines to `cellarId`.
   * A whole group moved joins the identical group already there (or moved
   * there just before), as "Déplacer" from the drawer does (FEAT-98): no
   * line is left apart that should be one. An opened bottle moves on its
   * own. Each moved copy leaves its cells (places in its old cellar's plan).
   */
  async move(userId: string, input: BulkMoveInput): Promise<BulkOutcome> {
    const { productIds, cellarId } = input;
    return prisma.$transaction(async (tx) => {
      const families = await lockListedFamilies(tx, productIds);
      if (cellarId !== null && !(await tx.cellar.findUnique({ where: { id: cellarId }, select: { id: true } }))) {
        throw badRequest('CELLAR_NOT_FOUND');
      }
      const entries: BulkAuditEntry[] = [];
      let units = 0;
      for (const family of families) {
        for (const listed of await inStock(tx, family.id)) {
          // Read again: an earlier group may have joined this one.
          const unit = await tx.inventoryItem.findFirst({ where: { id: listed.id, ...IN_STOCK_ITEM_FILTER } });
          if (!unit || unit.cellarId === cellarId) continue;
          units += itemUnits(unit);
          if (isGroupableItem(unit)) {
            const split = await splitLockedGroup(tx, userId, unit, unit.quantity ?? 1, { field: 'cellarId', to: cellarId }, family.kind);
            for (const { itemId, ...entry } of split.entries) {
              entries.push({
                action: 'MOVE_UNITS', bottleId: itemId, productId: family.id,
                details: { count: split.count, cellarId: { from: split.change.from, to: split.change.to }, ...entry, bulk: true },
              });
            }
            continue;
          }
          // An opened bottle (box): one copy, never joined to a group.
          // Its cell freed before the cellar is written (FEAT-93: the slot's key holds the cellar).
          const freed = slotsFreed(await freeSlots(tx, unit.id));
          await tx.inventoryItem.update({ where: { id: unit.id }, data: { cellarId, updatedBy: userId } });
          const changes: FieldChange[] = [{ field: 'cellarId', from: unit.cellarId, to: cellarId }, ...freed];
          entries.push({ action: 'UPDATE', bottleId: unit.id, productId: family.id, details: { changes, bulk: true } });
        }
      }
      return { result: { wines: families.length, units }, entries };
    }, { timeout: 60000, maxWait: 10000 });
  },

  /**
   * "Mettre à la corbeille" (FEAT-111 c2): every copy in stock of the wines,
   * with one `deletedAt`. The wine itself stays (its finished bottles, its
   * tastings): with nothing left in the cellar it leaves the list, and
   * restoring the copies from the trash brings it back.
   */
  async trash(userId: string, input: BulkTrashInput): Promise<BulkOutcome & { deletedAt: Date }> {
    return prisma.$transaction(async (tx) => {
      const families = await lockListedFamilies(tx, input.productIds);
      const deletedAt = new Date();
      const entries: BulkAuditEntry[] = [];
      let units = 0;
      for (const family of families) {
        const rows = await inStock(tx, family.id);
        if (rows.length === 0) continue;
        units += unitsOf(rows);
        // FEAT-93 (#174): their cells go to the trash with them.
        await trashSlots(tx, rows.map((row) => row.id), deletedAt);
        await tx.inventoryItem.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { deletedAt, updatedBy: userId } });
        for (const row of rows) entries.push({ action: 'DELETE', bottleId: row.id, productId: family.id, details: { bulk: true } });
      }
      return { result: { wines: families.length, units }, entries, deletedAt };
    }, { timeout: 60000, maxWait: 10000 });
  },

  /**
   * "Marquer comme bus" (FEAT-111 c3, decision #471 point 42): `count`
   * bottles (cigars) of each wine finished, each one through the detach
   * rule (FEAT-103): a copy of a group of more than one becomes a finished
   * sub-record, the group keeps the rest. Which copy: an opened one first
   * when asked (`openedFirst`, the default — the oldest opening first), then
   * the line FEAT-104 preselects (the cellar looked at, bought first, the
   * cheapest, the largest). Cigars are smoked one by one: the first of a
   * closed box opens it, the next ones come out of that box. 400
   * COUNT_ABOVE_STOCK when a wine has fewer in stock than asked.
   */
  async drink(userId: string, input: BulkDrinkInput): Promise<BulkOutcome> {
    const asked = new Map(input.items.map((item) => [item.productId, item]));
    return prisma.$transaction(async (tx) => {
      const families = await lockListedFamilies(tx, [...asked.keys()]);
      const entries: BulkAuditEntry[] = [];
      let units = 0;
      for (const family of families) {
        const { count, openedFirst = true } = asked.get(family.id)!;
        if (unitsOf(await inStock(tx, family.id)) < count) throw badRequest('COUNT_ABOVE_STOCK', { productId: family.id });
        // Boxes opened by this very action: the next cigars come out of them.
        const openedHere = new Set<string>();
        for (let i = 0; i < count; i++) {
          const rows = await inStock(tx, family.id);
          const opened = rows
            .filter((row) => !isIntactItem(row) && (openedFirst || openedHere.has(row.id)))
            .sort((a, b) => (a.openedAt?.getTime() ?? 0) - (b.openedAt?.getTime() ?? 0));
          const target = opened[0]
            ?? preselectGroup(rows, { cellarIds: input.cellarIds })?.line
            // Nothing but opened copies left: one of them, whatever was asked.
            ?? rows.find((row) => !isIntactItem(row));
          if (!target) break;
          const write = family.kind === 'cigar' ? { smokeOne: true } : { state: { ...FINISHED_ITEM_STATE } };
          const done = await applyState<Record<string, never>, { id: string }>(
            tx, target as StateItem, write, { userId, kind: family.kind, include: {} },
          );
          if (family.kind === 'cigar' && done.state.fillLevel !== 0) openedHere.add(done.data.id);
          units++;
          // FEAT-93 (decision #471 point 75): the cell the copy came from, if any, in the history of the line it left.
          entries.push({
            action: 'UPDATE', bottleId: done.data.id, productId: family.id,
            details: {
              changes: [...stateChanges(target, done.state), ...(done.groupChange ? [] : done.slotChanges)],
              outcome: done.outcome, targetItemId: target.id, bulk: true,
            },
          });
          // The group's own history: one copy fewer.
          if (done.groupChange) {
            const { itemId, from, to } = done.groupChange;
            entries.push({
              action: 'UPDATE', bottleId: itemId, productId: family.id,
              details: { changes: [{ field: 'quantity', from, to }, ...done.slotChanges], outcome: done.outcome, subItemId: done.data.id, bulk: true },
            });
          }
        }
      }
      return { result: { wines: families.length, units }, entries };
    }, { timeout: 60000, maxWait: 10000 });
  },
};
