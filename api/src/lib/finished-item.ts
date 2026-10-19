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
 */
export const NOT_FINISHED_ITEM_FILTER = { NOT: FINISHED_ITEM_STATE } as const;

/** In-memory counterpart of {@link FINISHED_ITEM_STATE}. */
export function isFinishedItem(item: { isOpened: boolean; fillLevel: number | null }): boolean {
  return item.isOpened && item.fillLevel === 0;
}
