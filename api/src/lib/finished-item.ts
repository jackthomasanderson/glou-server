import { isFinishedState } from '../../../shared/units';

// #471: the pure counting rules and state predicates live in shared/units.ts
// (the web needs them too); the Prisma filter fragments below cannot.
export {
  isFinishedState, isIntactItem, isGroupableItem, itemUnits, itemValue, itemSpend, itemCostInStock, consumedUnits, unitKind, productKey, groupKey,
  summarizeStock, slotCapacity,
} from '../../../shared/units';
export type { UnitKind, UnitState, StockSummary } from '../../../shared/units';

/**
 * ISSUE_239: the app-wide "this bottle is finished" criterion, in one place.
 *
 * A finished bottle is an opened bottle with nothing left in it
 * (`isOpened = true`, `fillLevel = 0`). The criterion was already written by
 * hand in analytics.service.ts (`consumedCount`), consumption-plan.service.ts
 * (`getGoalProgress`) and inventory-count.service.ts (`mark_consumed`); the
 * valuation paths forgot it, which is the bug this module exists to close.
 *
 * Row kept here rather than on the item: it is a Prisma filter AND an
 * in-memory predicate, used by both the aggregate queries and the loop in
 * analytics.service.ts.
 */

/**
 * The finished state itself: matches finished bottles as a query fragment,
 * and is also the payload that marks one as finished (see
 * inventory-count.service.ts `mark_consumed`).
 */
export const FINISHED_ITEM_STATE = { isOpened: true, fillLevel: 0 } as const;

/**
 * Matches everything that is NOT a finished bottle — i.e. what the instance
 * still physically holds. `NOT` rather than negating each field: an item with
 * `isOpened = true, fillLevel = 40` is still held, and so is an unopened one
 * with no `fillLevel` at all.
 *
 * #573: `fillLevel` is nullable and SQL's `NOT` is not null-safe:
 * `NOT (isOpened AND fillLevel = 0)` is NULL, so the row is dropped, for an
 * opened bottle whose level was never entered. `not: null` makes the inner
 * condition plainly false for those rows, so they stay in stock.
 */
export const NOT_FINISHED_ITEM_FILTER = {
  NOT: { isOpened: true, fillLevel: { equals: 0, not: null } },
} as const;

/**
 * #573: what is in stock — not in the trash, not finished and not written
 * off (#471: broken, given away or lost — `writtenOffAt`) ("En stock" in the design.md glossary). The
 * scope of every "what is in the cellar" figure: peak alerts, drink
 * suggestions, inventory counts, the cellar map and the item counters. A new
 * query describing the cellar's contents uses it rather than rebuilding it.
 */
export const IN_STOCK_ITEM_FILTER = {
  deletedAt: null,
  writtenOffAt: null,
  ...NOT_FINISHED_ITEM_FILTER,
} as const;

/** In-memory counterpart of {@link FINISHED_ITEM_STATE} (shared/units.ts `isFinishedState`). */
export const isFinishedItem = isFinishedState;

/**
 * #589: when a unit was finished, and by whom. `updatedAt`/`updatedBy` are
 * rewritten by any later edit (a move, a count, a postponed suggestion), so
 * "consumed over the period" and the personal goal read these instead.
 */
export interface FinishedStamp {
  finishedAt: Date | null;
  finishedBy: string | null;
}

/**
 * The stamp a write leaves on a unit going from `before` (null: a unit
 * created) to `after`: set once, by the write that finishes it (`actorId`,
 * at `now`), cleared by the one that puts it back; nothing to write
 * otherwise, so a later edit of a finished unit never re-dates it. Every
 * write of a unit's state calls it (stock-state.service.ts `applyState`, a
 * unit created already finished by `createItem`). Deliberate exception: a
 * CSV import (import.service.ts → stock.service.ts `addCopies`) writes a
 * finished row unstamped — importing a history is not drinking it today, and
 * the file says neither when nor by whom it was finished.
 */
export function finishedStamp(
  before: Parameters<typeof isFinishedState>[0] | null,
  after: Parameters<typeof isFinishedState>[0],
  actorId: string,
  now: Date,
): Partial<FinishedStamp> {
  const was = before != null && isFinishedState(before);
  const is = isFinishedState(after);
  if (is && !was) return { finishedAt: now, finishedBy: actorId };
  if (was && !is) return { finishedAt: null, finishedBy: null };
  return {};
}
