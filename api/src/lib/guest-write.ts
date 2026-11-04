import { AppError } from './errors';
import { isFinishedState, isIntactItem } from './finished-item';
import type { GuestInventoryUpdate } from '../schemas/inventory.schema';
import type { StateItem, StateOutcome } from '../services/stock-state.service';
import type { UnitKind } from '../../../shared/units';

type GuestUnit = Pick<StateItem, 'cellarId' | 'quantity' | 'isOpened' | 'fillLevel' | 'cigarsLeft' | 'writtenOffAt'>;

const inWriteCellar = (share: { writeCellarIds: readonly string[] }, unit: Pick<StateItem, 'cellarId'>) =>
  unit.cellarId != null && share.writeCellarIds.includes(unit.cellarId);

/**
 * #471 (FEAT-109, decision #471 points 24 and 69): what a guest with write
 * access may do to one copy — open, drink or smoke ONE, set the level of an
 * opened bottle — and nothing that changes a number. Judged on the unit as
 * read under its family's lock (InventoryService.updateItem `guard`), with
 * the outcome the detach rule plans for it (read last), so a concurrent
 * change (a move to another cellar, a bottle finished meanwhile) is seen.
 *
 * Refused:
 * - a unit outside the share's write cellars (403 READ_ONLY_ACCESS);
 * - a finished or written-off unit: nothing comes back from there (409 GUEST_ITEM_FINISHED);
 * - closing an opened bottle or box again, or any write that would put a
 *   copy back into a group (reattach, regroup): the stock would grow (403
 *   GUEST_CANNOT_RESTOCK) — only "Annuler" of the guest's own move does
 *   that ({@link checkGuestUndo});
 * - a cigar: anything but smoking one (400 GUEST_NOT_A_MOVE): a level or an
 *   opening would finish or open a whole box at once;
 * - on an intact unit (a group), anything but opening, drinking or smoking
 *   one (400 GUEST_NOT_A_MOVE), and a level other than full or empty on a
 *   group of more than one (400 LEVEL_ON_GROUP) — a level belongs to the
 *   opened bottle, set once it is detached.
 */
export function checkGuestWrite(
  share: { writeCellarIds: readonly string[] },
  patch: GuestInventoryUpdate,
  unit: GuestUnit,
  /** The outcome the detach rule plans for the write (it may itself refuse it), read once the unit passed the checks above. */
  planned: () => StateOutcome,
  /** A bottle or a cigar, as its family says. */
  kind: UnitKind,
): void {
  if (!inWriteCellar(share, unit)) throw new AppError(403, 'READ_ONLY_ACCESS');
  if (unit.writtenOffAt != null || isFinishedState(unit)) throw new AppError(409, 'GUEST_ITEM_FINISHED');
  if (patch.isOpened === false && !isIntactItem(unit)) throw new AppError(403, 'GUEST_CANNOT_RESTOCK');
  if (kind === 'cigar' && !(patch.smokeOne && Object.keys(patch).length === 1)) throw new AppError(400, 'GUEST_NOT_A_MOVE');
  const outcome = planned();
  if (outcome === 'reattached' || outcome === 'regrouped') throw new AppError(403, 'GUEST_CANNOT_RESTOCK');
  if (isIntactItem(unit)) {
    if (!patch.smokeOne && patch.isOpened !== true) throw new AppError(400, 'GUEST_NOT_A_MOVE');
    const level = patch.fillLevel;
    if ((unit.quantity ?? 1) > 1 && level != null && level !== 0 && level !== 100) throw new AppError(400, 'LEVEL_ON_GROUP');
  }
}

// ─── "Annuler" (decision #471 point 68) ──────────────────────────────────────

/** How long after a guest's move its "Annuler" is accepted (the web offers it for 8 s, UNDO_TIMEOUT_MS). */
export const GUEST_UNDO_WINDOW_MS = 60_000;

/** The state a guest's move found on its unit: what "Annuler" puts back. */
export interface GuestStateBefore {
  isOpened: boolean;
  fillLevel: number | null;
  openedAt: string | null;
  cigarsLeft: number | null;
  /** The grid slot a line of one gave back when finished in place (#573). */
  slotColumn?: number | null;
  slotRow?: number | null;
}

/**
 * Recorded in the audit entry of a guest's move (GUEST_UPDATE, on the unit
 * now carrying the state): what it found, and the version of the unit it
 * left (`updatedAt`). "Annuler" is accepted only while the unit is still
 * exactly that version.
 */
export interface GuestUndoMarker {
  before: GuestStateBefore;
  stampedAt: string;
}

/**
 * A move: one copy opened, drunk or smoked from a closed line, a cigar
 * smoked, or the opened bottle finished by « J'en bois une » (its payload,
 * `isOpened: true, fillLevel: 0`, §10.4.2 step 1) — not a level set, even
 * one to empty with the slider. Its "Annuler" puts the unit back as found:
 * an opened bottle stays opened at its level, never closed (decision 69).
 */
export const isGuestMove = (patch: GuestInventoryUpdate, before: Pick<StateItem, 'isOpened' | 'fillLevel' | 'cigarsLeft'>) =>
  patch.smokeOne === true
  || (patch.isOpened === true && (isIntactItem(before) || (patch.fillLevel === 0 && !isFinishedState(before))));

export function stateBefore(unit: StateItem, keepSlot: boolean): GuestStateBefore {
  return {
    isOpened: unit.isOpened,
    fillLevel: unit.fillLevel,
    openedAt: unit.openedAt ? unit.openedAt.toISOString() : null,
    cigarsLeft: unit.cigarsLeft,
    ...(keepSlot && unit.slotColumn != null && unit.slotRow != null ? { slotColumn: unit.slotColumn, slotRow: unit.slotRow } : {}),
  };
}

/**
 * The write that puts the unit back as the move found it: closed and full
 * (a box with all its cigars) — rejoining its line — or an opened box with
 * its cigar back.
 */
export function undoPatch(before: GuestStateBefore, cigarsPerBox: number | null) {
  const intact = isIntactItem(before);
  return {
    isOpened: before.isOpened,
    fillLevel: before.fillLevel,
    openedAt: before.openedAt ? new Date(before.openedAt) : null,
    // A closed box is put back complete (normalizeCigarState); an opened one with its count.
    cigarsLeft: intact && cigarsPerBox != null ? cigarsPerBox : before.cigarsLeft,
    // Recorded only when the unit gave its slot back itself; still free, or the version check refuses.
    ...(before.slotColumn != null && before.slotRow != null ? { slotColumn: before.slotColumn, slotRow: before.slotRow } : {}),
  };
}

/** The latest guest move recorded on a unit, as the audit log holds it. */
export interface GuestMoveEntry {
  shareId: unknown;
  createdAt: Date;
  undo: GuestUndoMarker | null;
}

/**
 * "Annuler" of a guest's move (decision #471 point 68): accepted only for
 * the guest's own move, just made — the unit's latest move was recorded
 * through this share, less than {@link GUEST_UNDO_WINDOW_MS} ago, and the
 * unit (read under its family's lock) is still exactly the version that
 * move left: anyone's later change, the guest's own included, closes it.
 * Never a general "close" or "put back": 403 GUEST_UNDO_REFUSED.
 */
export function checkGuestUndo(
  share: { id: string; writeCellarIds: readonly string[] },
  entry: GuestMoveEntry | null,
  unit: Pick<StateItem, 'cellarId' | 'updatedAt'>,
  now: Date = new Date(),
): GuestUndoMarker {
  if (!inWriteCellar(share, unit)) throw new AppError(403, 'READ_ONLY_ACCESS');
  const refused = () => new AppError(403, 'GUEST_UNDO_REFUSED');
  if (!entry?.undo || entry.shareId !== share.id) throw refused();
  if (now.getTime() - entry.createdAt.getTime() > GUEST_UNDO_WINDOW_MS) throw refused();
  if (unit.updatedAt.getTime() !== Date.parse(entry.undo.stampedAt)) throw refused();
  return entry.undo;
}
