import { describe, it, expect } from 'vitest';
import { AppError } from '../../src/lib/errors';
import {
  checkGuestUndo, checkGuestWrite, GUEST_UNDO_WINDOW_MS, isGuestMove, stateBefore, undoPatch, type GuestMoveEntry,
} from '../../src/lib/guest-write';
import { planState, type StateItem } from '../../src/services/stock-state.service';
import { guestInventoryUpdateSchema, type GuestInventoryUpdate } from '../../src/schemas/inventory.schema';

// #471 (FEAT-109 c1, c2, c4): a guest opens, drinks or smokes ONE copy and
// sets the level of an opened bottle — never a number changed. Each case is
// judged with the outcome the detach rule really plans for the write.

const DAY = new Date('2026-01-15T00:00:00.000Z');
const SHARE = { writeCellarIds: ['garage'] };

function unit(fields: Partial<StateItem> = {}): StateItem {
  return {
    id: 'u1', userId: 'creator', productId: 'p1', cellarId: 'garage',
    purchasedAt: DAY, cigarsPerBox: null, cigarsLeft: null, parentItemId: null, writtenOffAt: null,
    needsReview: false, location: null,
    purchasePrice: 20, estimatedValue: null, purchasePlace: null, bottleSize: '75cl', quantity: 1,
    isOpened: false, fillLevel: null, openedAt: null, lockedFields: [], fieldSources: null,
    deletedAt: null, createdAt: DAY, updatedAt: DAY, updatedBy: null,
    ...fields,
  } as unknown as StateItem;
}

const group = (quantity: number, fields: Partial<StateItem> = {}) => unit({ quantity, ...fields });
const opened = (fields: Partial<StateItem> = {}) => unit({ isOpened: true, fillLevel: 60, parentItemId: 'g1', ...fields });
const finished = (fields: Partial<StateItem> = {}) => unit({ isOpened: true, fillLevel: 0, parentItemId: 'g1', ...fields });
const boxes = (quantity: number, fields: Partial<StateItem> = {}) => unit({ quantity, cigarsPerBox: 25, ...fields });

/** The guest's write as the route runs it: parsed by the strict schema, planned, then checked. */
function guestWrite(item: StateItem, body: Record<string, unknown>, kind: 'bottle' | 'cigar' = 'bottle') {
  const patch: GuestInventoryUpdate = guestInventoryUpdateSchema.parse(body);
  const { smokeOne, ...state } = patch;
  let outcome: string | undefined;
  checkGuestWrite(SHARE, patch, item, () => (outcome = planState(item, { state, smokeOne }, kind).outcome), kind);
  return outcome;
}

function refusal(run: () => unknown): { status: number; code: string } | null {
  try {
    run();
    return null;
  } catch (error) {
    if (error instanceof AppError) return { status: error.status, code: error.code };
    throw error;
  }
}

describe('checkGuestWrite — what a guest may do (FEAT-109)', () => {
  it('c1: opens one bottle of a group of six — it is detached', () => {
    expect(guestWrite(group(6), { isOpened: true, fillLevel: 100, openedAt: '2026-11-04T10:00:00.000Z' })).toBe('detached');
  });

  it('drinks one bottle of a group of six — it is detached, finished', () => {
    expect(guestWrite(group(6), { isOpened: true, fillLevel: 0 })).toBe('detached');
  });

  it('opens the bottle of a line of one, at any level', () => {
    expect(guestWrite(group(1), { isOpened: true, fillLevel: 60 })).toBe('updated');
  });

  it('sets the level of an opened bottle, up to full, and finishes it', () => {
    expect(guestWrite(opened(), { fillLevel: 30 })).toBe('updated');
    expect(guestWrite(opened(), { isOpened: true, fillLevel: 100 })).toBe('updated');
    expect(guestWrite(opened(), { fillLevel: 0 })).toBe('updated');
  });

  it('smokes one cigar of a closed box, then of the opened box', () => {
    expect(guestWrite(boxes(3), { smokeOne: true }, 'cigar')).toBe('detached');
    expect(guestWrite(boxes(1, { isOpened: true, cigarsLeft: 10, parentItemId: 'g1' }), { smokeOne: true }, 'cigar')).toBe('updated');
  });
});

describe('checkGuestWrite — never a number changed (FEAT-109 c2)', () => {
  it('refuses a level on a group of more than one: it belongs to the opened bottle', () => {
    expect(refusal(() => guestWrite(group(6), { isOpened: true, fillLevel: 60 }))).toEqual({ status: 400, code: 'LEVEL_ON_GROUP' });
  });

  it('refuses a write on a closed copy that is not opening, drinking or smoking one', () => {
    expect(refusal(() => guestWrite(group(6), { fillLevel: 0 }))).toEqual({ status: 400, code: 'GUEST_NOT_A_MOVE' });
    expect(refusal(() => guestWrite(group(6), { openedAt: '2026-11-04T10:00:00.000Z' }))).toEqual({ status: 400, code: 'GUEST_NOT_A_MOVE' });
    expect(refusal(() => guestWrite(group(1), { isOpened: false, fillLevel: 100 }))).toEqual({ status: 400, code: 'GUEST_NOT_A_MOVE' });
  });

  it('refuses to put an opened bottle back with the others (a reattach: +1 to the group)', () => {
    expect(refusal(() => guestWrite(opened(), { isOpened: false, fillLevel: 100 }))).toEqual({ status: 403, code: 'GUEST_CANNOT_RESTOCK' });
    expect(refusal(() => guestWrite(opened(), { isOpened: false }))).toEqual({ status: 403, code: 'GUEST_CANNOT_RESTOCK' });
  });

  it('refuses to close an opened line of one (a regroup) or an opened box', () => {
    expect(refusal(() => guestWrite(opened({ parentItemId: null }), { isOpened: false, fillLevel: 100 }))).toEqual({ status: 403, code: 'GUEST_CANNOT_RESTOCK' });
    const box = boxes(1, { isOpened: true, cigarsLeft: 25, parentItemId: 'g1' });
    expect(refusal(() => guestWrite(box, { isOpened: false }, 'cigar'))).toEqual({ status: 403, code: 'GUEST_CANNOT_RESTOCK' });
  });

  it('refuses any way back from a finished bottle or a smoked cigar (+1 to the stock)', () => {
    expect(refusal(() => guestWrite(finished(), { isOpened: false, fillLevel: 100 }))).toEqual({ status: 409, code: 'GUEST_ITEM_FINISHED' });
    expect(refusal(() => guestWrite(finished(), { fillLevel: 50 }))).toEqual({ status: 409, code: 'GUEST_ITEM_FINISHED' });
    const smoked = unit({ isOpened: true, fillLevel: 0, parentItemId: 'g1' });
    expect(refusal(() => guestWrite(smoked, { isOpened: false }, 'cigar'))).toEqual({ status: 409, code: 'GUEST_ITEM_FINISHED' });
  });

  it('a cigar: only smoking one — never a level or an opening that would open or finish a whole box', () => {
    expect(refusal(() => guestWrite(boxes(3), { isOpened: true, fillLevel: 0 }, 'cigar'))).toEqual({ status: 400, code: 'GUEST_NOT_A_MOVE' });
    expect(refusal(() => guestWrite(boxes(1), { isOpened: true }, 'cigar'))).toEqual({ status: 400, code: 'GUEST_NOT_A_MOVE' });
    const openedBox = boxes(1, { isOpened: true, cigarsLeft: 24, parentItemId: 'g1' });
    expect(refusal(() => guestWrite(openedBox, { fillLevel: 0 }, 'cigar'))).toEqual({ status: 400, code: 'GUEST_NOT_A_MOVE' });
    expect(refusal(() => guestWrite(openedBox, { smokeOne: true, fillLevel: 0 }, 'cigar'))).toEqual({ status: 400, code: 'GUEST_NOT_A_MOVE' });
  });

  it('refuses a written-off copy', () => {
    expect(refusal(() => guestWrite(group(2, { writtenOffAt: DAY }), { isOpened: true }))).toEqual({ status: 409, code: 'GUEST_ITEM_FINISHED' });
  });

  it('c4: refuses a copy outside the cellars shared with write access', () => {
    expect(refusal(() => guestWrite(group(6, { cellarId: 'kitchen' }), { isOpened: true }))).toEqual({ status: 403, code: 'READ_ONLY_ACCESS' });
    expect(refusal(() => guestWrite(group(6, { cellarId: null }), { isOpened: true }))).toEqual({ status: 403, code: 'READ_ONLY_ACCESS' });
  });

  it('refuses every field but the state, before anything is planned', () => {
    for (const field of ['quantity', 'cellarId', 'purchasePrice', 'notes', 'keepTastings', 'cigarsLeft', 'deletedAt']) {
      expect(guestInventoryUpdateSchema.safeParse({ isOpened: true, [field]: 1 }).success, field).toBe(false);
    }
    expect(guestInventoryUpdateSchema.safeParse({ smokeOne: false }).success).toBe(false);
  });
});

// Decision #471 point 68: "Annuler" of the guest's own move, just made.
describe('checkGuestUndo — only the guest\'s own move, just made', () => {
  const NOW = new Date('2026-11-04T10:00:30.000Z');
  const STAMP = new Date('2026-11-04T10:00:00.000Z');
  const share = { id: 's1', writeCellarIds: ['garage'] };
  const entry = (over: Partial<GuestMoveEntry> = {}): GuestMoveEntry => ({
    shareId: 's1', createdAt: STAMP,
    undo: { before: { isOpened: false, fillLevel: null, openedAt: null, cigarsLeft: null }, stampedAt: STAMP.toISOString() },
    ...over,
  });
  const sub = (updatedAt = STAMP) => ({ cellarId: 'garage', updatedAt });

  it('is accepted right after the move', () => {
    expect(checkGuestUndo(share, entry(), sub(), NOW).before).toMatchObject({ isOpened: false });
  });

  it('is refused once the window has passed', () => {
    const later = new Date(STAMP.getTime() + GUEST_UNDO_WINDOW_MS + 1);
    expect(refusal(() => checkGuestUndo(share, entry(), sub(), later))).toEqual({ status: 403, code: 'GUEST_UNDO_REFUSED' });
  });

  it('is refused on a unit changed since, by anyone (a member set its level)', () => {
    expect(refusal(() => checkGuestUndo(share, entry(), sub(new Date('2026-11-04T10:00:10.000Z')), NOW)))
      .toEqual({ status: 403, code: 'GUEST_UNDO_REFUSED' });
  });

  it('is refused from another share, and when the latest change was not a guest move', () => {
    expect(refusal(() => checkGuestUndo(share, entry({ shareId: 's2' }), sub(), NOW))).toEqual({ status: 403, code: 'GUEST_UNDO_REFUSED' });
    expect(refusal(() => checkGuestUndo(share, entry({ undo: null }), sub(), NOW))).toEqual({ status: 403, code: 'GUEST_UNDO_REFUSED' });
    expect(refusal(() => checkGuestUndo(share, null, sub(), NOW))).toEqual({ status: 403, code: 'GUEST_UNDO_REFUSED' });
  });

  it('is refused outside the write cellars', () => {
    expect(refusal(() => checkGuestUndo(share, entry(), { cellarId: 'kitchen', updatedAt: STAMP }, NOW))).toEqual({ status: 403, code: 'READ_ONLY_ACCESS' });
  });

  it('puts a bottle back closed and full — rejoining its line — and a box complete', () => {
    const bottlePatch = undoPatch(stateBefore(group(6)), null);
    expect(bottlePatch).toEqual({ isOpened: false, fillLevel: null, openedAt: null, cigarsLeft: null });
    expect(planState(unit({ isOpened: true, fillLevel: 100, parentItemId: 'g1' }), { state: bottlePatch }, 'bottle').outcome).toBe('reattached');

    const boxSub = boxes(1, { isOpened: true, cigarsLeft: 24, parentItemId: 'g1' });
    const boxPatch = undoPatch(stateBefore(boxes(3)), 25);
    expect(boxPatch.cigarsLeft).toBe(25);
    expect(planState(boxSub, { state: boxPatch }, 'cigar').outcome).toBe('reattached');
  });

  // FEAT-93: the cell a line of one freed is not recorded until lot S2 (`placeAt`).
  it('gives a cigar back to an opened box; no cell is written by the undo', () => {
    const openedBox = boxes(1, { isOpened: true, cigarsLeft: 10, parentItemId: 'g1' });
    expect(undoPatch(stateBefore(openedBox), 25)).toMatchObject({ isOpened: true, cigarsLeft: 10 });
    expect(undoPatch(stateBefore(group(1)), null)).toEqual({ isOpened: false, fillLevel: null, openedAt: null, cigarsLeft: null });
  });

  it('only a move is undoable, not a level set', () => {
    expect(isGuestMove({ isOpened: true, fillLevel: 0 }, group(6))).toBe(true);
    expect(isGuestMove({ smokeOne: true }, boxes(1, { isOpened: true, cigarsLeft: 10 }))).toBe(true);
    expect(isGuestMove({ fillLevel: 30 }, opened())).toBe(false);
  });

  // Recette #471 lot RB: « J'en bois une » finishes the opened bottle (§10.4.2,
  // as for members) — the guest's own move, undone back to its level.
  it('« J\'en bois une » on the opened bottle is a move: undone back opened at its level, never closed', () => {
    expect(guestWrite(opened(), { isOpened: true, fillLevel: 0 })).toBe('updated');
    expect(isGuestMove({ isOpened: true, fillLevel: 0 }, opened())).toBe(true);
    const back = undoPatch(stateBefore(opened({ openedAt: DAY })), null);
    expect(back).toEqual({ isOpened: true, fillLevel: 60, openedAt: DAY, cigarsLeft: null });
    expect(planState(finished(), { state: back }, 'bottle').outcome).not.toMatch(/reattached|regrouped/);
  });

  it('a level set to empty with the slider stays a level set (no « Annuler »), and a level up stays one', () => {
    expect(isGuestMove({ fillLevel: 0 }, opened())).toBe(false);
    expect(isGuestMove({ isOpened: true, fillLevel: 100 }, opened())).toBe(false);
    expect(isGuestMove({ isOpened: true, fillLevel: 30 }, opened())).toBe(false);
  });
});

describe('the guest schema', () => {
  it('takes "undo" alone', () => {
    expect(guestInventoryUpdateSchema.safeParse({ undo: true }).success).toBe(true);
    expect(guestInventoryUpdateSchema.safeParse({ undo: true, isOpened: false }).success).toBe(false);
  });
});
