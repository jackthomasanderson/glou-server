import { describe, it, expect } from 'vitest';
import { AppError } from '../../src/lib/errors';
import { checkGuestWrite } from '../../src/lib/guest-write';
import { planState, type StateItem } from '../../src/services/stock-state.service';
import { guestInventoryUpdateSchema, type GuestInventoryUpdate } from '../../src/schemas/inventory.schema';

// #471 (FEAT-109 c1, c2, c4): a guest opens, drinks or smokes ONE copy and
// sets the level of an opened bottle — never a number changed. Each case is
// judged with the outcome the detach rule really plans for the write.

const DAY = new Date('2026-01-15T00:00:00.000Z');
const SHARE = { writeCellarIds: ['garage'] };

function unit(fields: Partial<StateItem> = {}): StateItem {
  return {
    id: 'u1', userId: 'creator', productId: 'p1', cellarId: 'garage', slotColumn: null, slotRow: null,
    purchasedAt: DAY, cigarsPerBox: null, cigarsLeft: null, parentItemId: null, writtenOffAt: null,
    needsReview: false, category: 'wine', name: 'Talbot', producer: 'Château Talbot', location: null,
    purchasePrice: 20, estimatedValue: null, purchasePlace: null, bottleSize: '75cl', quantity: 1,
    isOpened: false, fillLevel: null, openedAt: null, lockedFields: [], fieldSources: null,
    deletedAt: null, createdAt: DAY, updatedAt: DAY, updatedBy: null, isOwned: true,
    ...fields,
  } as unknown as StateItem;
}

const group = (quantity: number, fields: Partial<StateItem> = {}) => unit({ quantity, ...fields });
const opened = (fields: Partial<StateItem> = {}) => unit({ isOpened: true, fillLevel: 60, parentItemId: 'g1', ...fields });
const finished = (fields: Partial<StateItem> = {}) => unit({ isOpened: true, fillLevel: 0, parentItemId: 'g1', ...fields });
const boxes = (quantity: number, fields: Partial<StateItem> = {}) => unit({ category: 'cigar', quantity, cigarsPerBox: 25, ...fields } as Partial<StateItem>);

/** The guest's write as the route runs it: parsed by the strict schema, planned, then checked. */
function guestWrite(item: StateItem, body: Record<string, unknown>, kind: 'bottle' | 'cigar' = 'bottle') {
  const patch: GuestInventoryUpdate = guestInventoryUpdateSchema.parse(body);
  const { smokeOne, ...state } = patch;
  let outcome: string | undefined;
  checkGuestWrite(SHARE, patch, item, () => (outcome = planState(item, { state, smokeOne }, kind).outcome));
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
    const smoked = unit({ category: 'cigar', isOpened: true, fillLevel: 0, parentItemId: 'g1' } as Partial<StateItem>);
    expect(refusal(() => guestWrite(smoked, { isOpened: false }, 'cigar'))).toEqual({ status: 409, code: 'GUEST_ITEM_FINISHED' });
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
