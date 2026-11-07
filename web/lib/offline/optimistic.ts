import { isFinishedState, isIntactItem } from '@shared/units';
import type { CorrectionReason } from '@shared/product';

// ─── FEAT-108 — what a queued change shows before it reaches the server ────
// Pure functions shared by the sync engine (caches, IndexedDB copy) and the
// screens. They mirror the API's own rules (stock-state.service.ts `planState`,
// stock.service.ts `correctQuantity`) as far as the screen needs them:
//
// - opening, drinking or smoking one copy of a group of more than one takes
//   it off the group (×6 → ×5) and shows it as a PROVISIONAL sub-record, with
//   an id of its own (`offline:<change id>`) that the server never sees —
//   never the whole group shown opened (FEAT-108 c1);
// - a group of one (or an opened copy) changes itself;
// - "Corriger le nombre" sets the group's number; "cassée, offerte ou perdue"
//   shows the copies gone as a provisional write-off.
//
// These are applied to the server's state only (a fresh answer, a refetch):
// applying them to a list that already shows them would count twice.

/** What the screens need to know about a queued change. */
export interface QueuedChange {
  id: string;
  itemId: string;
  /** `patch`: PATCH /api/inventory/:id; `correct`: POST /api/inventory/:id/correct. */
  kind?: 'patch' | 'correct';
  patch: Record<string, unknown>;
  createdAt: string;
  status?: string;
}

/** A unit as any cache holds it (the flat list, a wine's card, its drawer). */
export type UnitLike = { id: string } & Record<string, unknown>;

const PROVISIONAL_PREFIX = 'offline:';

/** The id of the copy a queued change shows taken off its group. */
export const provisionalIdOf = (changeId: string) => `${PROVISIONAL_PREFIX}${changeId}`;

/** A copy shown by a change still waiting for the network: nothing can be done on it yet. */
export const isProvisional = (unit: { id: string }) => unit.id.startsWith(PROVISIONAL_PREFIX);

/** The change a provisional copy comes from. */
export const changeIdOfProvisional = (id: string) => (id.startsWith(PROVISIONAL_PREFIX) ? id.slice(PROVISIONAL_PREFIX.length) : undefined);

const STATE_FIELDS = ['isOpened', 'fillLevel', 'openedAt', 'cigarsLeft'] as const;
/** Sent with a state but never a column of the unit (FEAT-93: which copy, a cell asked back). */
const NOT_A_COLUMN = new Set(['smokeOne', 'keepTastings', 'expectedUpdatedAt', 'fromSlotId', 'fromUnplaced', 'placeAt']);
/** FEAT-93: no cell of the plan (a copy finished or written off). */
const NO_SLOT = { slots: [] };

type Cell = { id: string; column: number; row: number };
const cellsOf = (unit: UnitLike): Cell[] => (Array.isArray(unit.slots) ? unit.slots as Cell[] : []);
/** The unit without the cells `ids` (freed, or gone with the copy taken). */
const without = (unit: UnitLike, ids: readonly string[]) => ({ slots: cellsOf(unit).filter((cell) => !ids.includes(cell.id)) });

type State = { isOpened: boolean; fillLevel: number | null; openedAt: unknown; cigarsLeft: number | null };

const stateOf = (unit: UnitLike): State => ({
  isOpened: unit.isOpened === true,
  fillLevel: (unit.fillLevel as number | null | undefined) ?? null,
  openedAt: unit.openedAt ?? null,
  cigarsLeft: (unit.cigarsLeft as number | null | undefined) ?? null,
});

/** Whether a patch writes the state of a copy (and may then take it off its group). */
export const writesState = (patch: Record<string, unknown>) =>
  patch.smokeOne === true || STATE_FIELDS.some((field) => patch[field] !== undefined);

/** The state fields a patch sets on `unit` (planState, the parts the screen shows). */
function stateChanges(unit: UnitLike, patch: Record<string, unknown>, at: string): Partial<State> {
  const changes: Partial<State> = {};
  for (const field of STATE_FIELDS) {
    if (patch[field] !== undefined) (changes as Record<string, unknown>)[field] = patch[field];
  }
  if (patch.smokeOne !== true) return changes;
  const perBox = (unit.cigarsPerBox as number | null | undefined) ?? null;
  let left: number;
  if (unit.isOpened === true) {
    left = ((unit.cigarsLeft as number | null | undefined) ?? 1) - 1;
  } else {
    left = perBox != null ? perBox - 1 : 0;
    changes.isOpened = true;
    changes.openedAt = changes.openedAt ?? at;
  }
  // Single cigars have no box to count in; a finished box has none left.
  changes.cigarsLeft = perBox == null ? null : Math.max(left, 0);
  if (left <= 0) {
    changes.isOpened = true;
    changes.fillLevel = 0;
  }
  return changes;
}

/** The unit's own columns in a patch (cellar, price…), state and request-only fields left out. */
function columnsOf(patch: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(patch).filter(([field]) =>
    !NOT_A_COLUMN.has(field) && !(STATE_FIELDS as readonly string[]).includes(field)));
}

/**
 * `units` once `change` is applied. Nothing happens when its unit is not
 * there (another wine), or when its provisional copy already is (applied).
 */
export function applyChange<T extends UnitLike>(units: readonly T[], change: QueuedChange): T[] {
  const index = units.findIndex((unit) => unit.id === change.itemId);
  const provisionalId = provisionalIdOf(change.id);
  if (index < 0 || units.some((unit) => unit.id === provisionalId)) return [...units];
  const target = units[index];
  const quantity = (target.quantity as number | null | undefined) ?? 1;
  const at = change.createdAt;
  const result = [...units];

  if (change.kind === 'correct') {
    const to = Number(change.patch.quantity);
    const reason = change.patch.reason as CorrectionReason;
    if (!Number.isFinite(to)) return result;
    // FEAT-93 c4: the cells named are freed with the copies.
    const freed = Array.isArray(change.patch.slotIds) ? change.patch.slotIds as string[] : [];
    if (reason !== 'written_off') {
      result[index] = { ...target, quantity: to, ...without(target, freed) };
    } else if (to <= 0) {
      // The whole line broken, given away or lost.
      result[index] = { ...target, writtenOffAt: at, ...NO_SLOT };
    } else {
      result[index] = { ...target, quantity: to, ...without(target, freed) };
      const gone = { ...target, ...NO_SLOT, id: provisionalId, quantity: quantity - to, writtenOffAt: at, parentItemId: null, needsReview: false };
      result.splice(index + 1, 0, gone as T);
    }
    return result;
  }

  const columns = columnsOf(change.patch);
  if (!writesState(change.patch)) {
    result[index] = { ...target, ...columns };
    return result;
  }
  const changes = stateChanges(target, change.patch, at);
  const next = { ...stateOf(target), ...changes };
  if (isIntactItem(stateOf(target)) && quantity > 1 && !isIntactItem(next)) {
    // One copy taken off the group: ×6 → ×5 and the copy on its own line.
    // FEAT-93: from the cell chosen — opened it holds that cell, finished it
    // frees it; an unplaced copy leaves the cells to the group.
    const cell = cellsOf(target).find((slot) => slot.id === change.patch.fromSlotId);
    const taken = cell ? [cell.id] : [];
    result[index] = { ...target, ...columns, quantity: quantity - 1, ...without(target, taken) };
    const copySlots = { slots: cell && !isFinishedState(next) ? [cell] : [] };
    const copy = { ...target, ...columns, ...next, ...copySlots, id: provisionalId, quantity: 1, parentItemId: target.id, needsReview: false };
    result.splice(index + 1, 0, copy as T);
    return result;
  }
  // A finished copy gives its grid slot back (#573).
  result[index] = { ...target, ...columns, ...changes, ...(isFinishedState(next) ? NO_SLOT : {}) };
  return result;
}

/**
 * The server's `units` with the changes still waiting on this device laid
 * over them, in the order they were made. A change in conflict is left out:
 * the conflict dialog shows both versions.
 */
export function overlayChanges<T extends UnitLike>(units: readonly T[], changes: readonly QueuedChange[]): T[] {
  const shown = changes.filter((change) => change.status !== 'conflict');
  if (shown.length === 0) return [...units];
  const provisional = new Set(shown.map((change) => provisionalIdOf(change.id)));
  return shown.reduce<T[]>((list, change) => applyChange(list, change), units.filter((unit) => !provisional.has(unit.id)));
}

/** What a unit was, as a change needs to be taken back (its group's number, its state). */
export type UnitBefore = Partial<Record<'quantity' | 'isOpened' | 'fillLevel' | 'openedAt' | 'cigarsLeft' | 'writtenOffAt' | 'slots', unknown>>;

export function beforeOf(unit: UnitLike): UnitBefore {
  const { quantity, isOpened, fillLevel, openedAt, cigarsLeft, writtenOffAt, slots } = unit;
  return { quantity, isOpened, fillLevel, openedAt, cigarsLeft, writtenOffAt, slots };
}

/**
 * `units` once a change that never reached the server is dropped ("Annuler",
 * "Abandonner"): a copy taken off a group goes back to it (×5 → ×6), a unit
 * changed itself gets back what it was.
 */
export function revertChange<T extends UnitLike>(units: readonly T[], change: QueuedChange, before: UnitBefore | undefined): T[] {
  const provisionalId = provisionalIdOf(change.id);
  const copy = units.find((unit) => unit.id === provisionalId);
  const rest = units.filter((unit) => unit.id !== provisionalId);
  return rest.map((unit) => {
    if (unit.id !== change.itemId) return unit;
    if (copy) {
      const back = (copy.quantity as number | null | undefined) ?? 1;
      // FEAT-93: with the cell it went with, if it took one.
      const cells = before && Array.isArray(before.slots) ? { slots: before.slots } : {};
      return { ...unit, ...cells, quantity: ((unit.quantity as number | null | undefined) ?? 1) + back };
    }
    return before ? { ...unit, ...before } : unit;
  });
}

/** Copies in the stock (a wine's card lists only those). */
export const unitInStock = (unit: UnitLike) =>
  unit.deletedAt == null && unit.writtenOffAt == null && !isFinishedState(stateOf(unit))
  && (unit.isOpened === true || ((unit.quantity as number | null | undefined) ?? 1) > 0);

/** What a queued change does, in words (the pending changes panel, the conflict dialog). */
export type ChangeAction = 'open' | 'drink' | 'smoke' | 'correct' | 'edit';

/**
 * The fields an everyday action sends (lib/products/openDrink.ts `movePatch`,
 * FEAT-93: with the copy's cell): anything else is an edit.
 */
const ACTION_FIELDS: ReadonlySet<string> = new Set([...STATE_FIELDS, 'smokeOne', 'fromSlotId', 'fromUnplaced']);

export function actionOf(change: Pick<QueuedChange, 'kind' | 'patch'>): ChangeAction {
  if (change.kind === 'correct') return 'correct';
  if (!Object.keys(change.patch).every((field) => ACTION_FIELDS.has(field))) return 'edit';
  if (change.patch.smokeOne === true) return 'smoke';
  if (change.patch.isOpened === true && change.patch.fillLevel === 0) return 'drink';
  if (change.patch.isOpened === true && change.patch.fillLevel != null) return 'open';
  return 'edit';
}
