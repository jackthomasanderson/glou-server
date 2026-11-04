import { AppError } from './errors';
import { isFinishedState, isIntactItem } from './finished-item';
import type { GuestInventoryUpdate } from '../schemas/inventory.schema';
import type { StateItem, StateOutcome } from '../services/stock-state.service';

/**
 * #471 (FEAT-109, decision #471 point 24): what a guest with write access may
 * do to one copy — open, drink or smoke ONE, set the level of an opened
 * bottle — and nothing that changes a number. Judged on the unit as read
 * under its family's lock (InventoryService.updateItem `guard`), with the
 * outcome the detach rule plans for the write, so a concurrent change (a
 * move to another cellar, a bottle finished meanwhile) is seen.
 *
 * Refused:
 * - a unit outside the share's write cellars (403 READ_ONLY_ACCESS);
 * - a finished or written-off unit: nothing comes back from there (409 GUEST_ITEM_FINISHED);
 * - closing an opened bottle or box again, or any write that would put a
 *   copy back into a group (reattach, regroup): the stock would grow (403 GUEST_CANNOT_RESTOCK);
 * - on an intact unit (a group), anything but opening, drinking or smoking
 *   one (400 GUEST_NOT_A_MOVE), and a level other than full or empty on a
 *   group of more than one (400 LEVEL_ON_GROUP) — a level belongs to the
 *   opened bottle, set once it is detached.
 */
export function checkGuestWrite(
  share: { writeCellarIds: readonly string[] },
  patch: GuestInventoryUpdate,
  unit: Pick<StateItem, 'cellarId' | 'quantity' | 'isOpened' | 'fillLevel' | 'cigarsLeft' | 'writtenOffAt'>,
  /** The outcome the detach rule plans for the write (it may itself refuse it), read once the unit passed the checks above. */
  planned: () => StateOutcome,
): void {
  if (!unit.cellarId || !share.writeCellarIds.includes(unit.cellarId)) throw new AppError(403, 'READ_ONLY_ACCESS');
  if (unit.writtenOffAt != null || isFinishedState(unit)) throw new AppError(409, 'GUEST_ITEM_FINISHED');
  if (patch.isOpened === false && !isIntactItem(unit)) throw new AppError(403, 'GUEST_CANNOT_RESTOCK');
  const outcome = planned();
  if (outcome === 'reattached' || outcome === 'regrouped') throw new AppError(403, 'GUEST_CANNOT_RESTOCK');
  if (isIntactItem(unit)) {
    if (!patch.smokeOne && patch.isOpened !== true) throw new AppError(400, 'GUEST_NOT_A_MOVE');
    const level = patch.fillLevel;
    if ((unit.quantity ?? 1) > 1 && level != null && level !== 0 && level !== 100) throw new AppError(400, 'LEVEL_ON_GROUP');
  }
}
