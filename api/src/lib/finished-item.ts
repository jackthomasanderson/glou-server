import { OWNED_ITEM_FILTER } from './owned-item';

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
 * #573: what is in stock — not in the trash, owned (not a FEAT-87
 * reference) and not finished ("En stock" in the design.md glossary). The
 * scope of every "what is in the cellar" figure: peak alerts, drink
 * suggestions, inventory counts, the cellar map and the item counters. A new
 * query describing the cellar's contents uses it rather than rebuilding it.
 */
export const IN_STOCK_ITEM_FILTER = {
  deletedAt: null,
  ...OWNED_ITEM_FILTER,
  ...NOT_FINISHED_ITEM_FILTER,
} as const;

/**
 * #573: a finished bottle has left its rack, so it gives its grid slot back.
 * Written together with the finished state by every path that sets it.
 */
export const NO_SLOT = { slotColumn: null, slotRow: null } as const;

/** In-memory counterpart of {@link FINISHED_ITEM_STATE}. */
export function isFinishedItem(item: { isOpened: boolean; fillLevel: number | null }): boolean {
  return item.isOpened && item.fillLevel === 0;
}
