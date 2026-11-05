import { describe, expect, it } from 'vitest';
import {
  actionOf, applyChange, beforeOf, isProvisional, overlayChanges, provisionalIdOf, revertChange, unitInStock,
  type QueuedChange, type UnitLike,
} from './optimistic';

// FEAT-108 (#471, ux-ui.md §10.8): what a change made without network shows
// before the server has it — a group one fewer and the copy on its own
// line, never the whole group opened (the limit left by L1, #816).

const AT = '2026-11-04T10:00:00.000Z';
const group = (quantity: number, extra: Record<string, unknown> = {}): UnitLike => ({
  id: 'g', productId: 'p1', quantity, isOpened: false, fillLevel: 100, openedAt: null, cigarsLeft: null,
  cigarsPerBox: null, parentItemId: null, writtenOffAt: null, slots: [{ id: 's1', column: 2, row: 3 }], updatedAt: 'v1', ...extra,
});
const change = (patch: Record<string, unknown>, extra: Partial<QueuedChange> = {}): QueuedChange =>
  ({ id: 'm1', itemId: 'g', patch, createdAt: AT, status: 'pending', ...extra });

const OPEN = { isOpened: true, fillLevel: 100, openedAt: AT };
const DRINK = { isOpened: true, fillLevel: 0 };

describe('applyChange — one copy of a group (FEAT-108 c1)', () => {
  it('opening one of ×6 shows ×5 and one opened bottle, provisional, the slot left to the group', () => {
    const [g, copy, ...rest] = applyChange([group(6)], change(OPEN));
    expect(rest).toEqual([]);
    expect(g).toMatchObject({ id: 'g', quantity: 5, isOpened: false, fillLevel: 100, slots: [{ id: 's1', column: 2, row: 3 }] });
    expect(copy).toMatchObject({ id: provisionalIdOf('m1'), quantity: 1, isOpened: true, fillLevel: 100, parentItemId: 'g', slots: [] });
    expect(isProvisional(copy)).toBe(true);
    expect(unitInStock(copy)).toBe(true);
  });

  it('drinking one of ×6 shows ×5 and one bottle drunk, out of the stock', () => {
    const [g, copy] = applyChange([group(6)], change(DRINK));
    expect(g.quantity).toBe(5);
    expect(copy).toMatchObject({ isOpened: true, fillLevel: 0 });
    expect(unitInStock(copy)).toBe(false);
  });

  it('a group of one opens itself: nothing taken off', () => {
    const shown = applyChange([group(1)], change(OPEN));
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ id: 'g', quantity: 1, isOpened: true, fillLevel: 100 });
  });

  it('a level on an opened bottle changes it alone', () => {
    const opened: UnitLike = { ...group(1), id: 's', isOpened: true, fillLevel: 60 };
    const shown = applyChange([group(5), opened], change({ fillLevel: 30 }, { itemId: 's' }));
    expect(shown.map((u) => [u.id, u.quantity, u.fillLevel])).toEqual([['g', 5, 100], ['s', 1, 30]]);
  });

  it('smoking the first cigar of 3 closed boxes of 25: 2 boxes + one opened box with 24 left', () => {
    const boxes = group(3, { cigarsPerBox: 25, fillLevel: null });
    const [g, box] = applyChange([boxes], change({ smokeOne: true }));
    expect(g).toMatchObject({ quantity: 2, isOpened: false, cigarsLeft: null });
    expect(box).toMatchObject({ quantity: 1, isOpened: true, cigarsLeft: 24, openedAt: AT });
    expect(box).not.toHaveProperty('smokeOne');
  });

  it('smoking one of 4 single cigars: 3 left, one smoked', () => {
    const [g, cigar] = applyChange([group(4, { fillLevel: null })], change({ smokeOne: true }));
    expect(g.quantity).toBe(3);
    expect(cigar).toMatchObject({ isOpened: true, fillLevel: 0, cigarsLeft: null });
    expect(unitInStock(cigar)).toBe(false);
  });

  it('smoking in an opened box counts one fewer in it, its last one finishes it', () => {
    const box = group(1, { id: 'b', cigarsPerBox: 25, isOpened: true, cigarsLeft: 10, fillLevel: null });
    expect(applyChange([box], change({ smokeOne: true }, { itemId: 'b' }))[0]).toMatchObject({ cigarsLeft: 9, isOpened: true });
    const last = applyChange([{ ...box, cigarsLeft: 1 }], change({ smokeOne: true }, { itemId: 'b' }))[0];
    expect(last).toMatchObject({ cigarsLeft: 0, isOpened: true, fillLevel: 0 });
  });

  it('leaves another wine alone, and does not show twice a change already shown', () => {
    const other = { ...group(6), id: 'x' };
    expect(applyChange([other], change(OPEN))).toEqual([other]);
    const once = applyChange([group(6)], change(OPEN));
    expect(applyChange(once, change(OPEN))).toEqual(once);
  });
});

describe('applyChange — "Corriger le nombre" (FEAT-108 c5)', () => {
  it('broken, given away or lost: ×6 → ×5, the copy gone shown apart (out of the stock)', () => {
    const [g, gone] = applyChange([group(6)], change({ quantity: 5, reason: 'written_off' }, { kind: 'correct' }));
    expect(g.quantity).toBe(5);
    expect(gone).toMatchObject({ id: provisionalIdOf('m1'), quantity: 1, writtenOffAt: AT });
    expect(unitInStock(gone)).toBe(false);
  });

  it('an input error: ×6 → ×4, nothing else', () => {
    const shown = applyChange([group(6)], change({ quantity: 4, reason: 'input_error' }, { kind: 'correct' }));
    expect(shown.map((u) => [u.id, u.quantity])).toEqual([['g', 4]]);
  });

  it('the whole line broken: the line itself leaves the stock', () => {
    const [g] = applyChange([group(2)], change({ quantity: 0, reason: 'written_off' }, { kind: 'correct' }));
    expect(g).toMatchObject({ writtenOffAt: AT, slots: [] });
    expect(unitInStock(g)).toBe(false);
  });
});

describe('overlayChanges — on the server\'s state', () => {
  it('two openings of a ×6: ×4 and two provisional opened bottles, in order', () => {
    const shown = overlayChanges([group(6)], [change(OPEN), change(OPEN, { id: 'm2', createdAt: '2026-11-04T10:01:00.000Z' })]);
    expect(shown.map((u) => [u.id, u.quantity])).toEqual([['g', 4], [provisionalIdOf('m2'), 1], [provisionalIdOf('m1'), 1]]);
  });

  it('drops the provisional copies it lays again (no double count), and leaves a conflict out', () => {
    const once = overlayChanges([group(6)], [change(OPEN)]);
    // The server answered the group as ×6 again (another reason): laid once.
    const again = overlayChanges([group(6), once[1]], [change(OPEN)]);
    expect(again.map((u) => [u.id, u.quantity])).toEqual([['g', 5], [provisionalIdOf('m1'), 1]]);
    expect(overlayChanges([group(6)], [change(OPEN, { status: 'conflict' })])).toEqual([group(6)]);
  });
});

describe('revertChange — "Annuler" before the network is back', () => {
  it('puts the copy back in its group: ×5 → ×6', () => {
    const shown = applyChange([group(6)], change(OPEN));
    expect(revertChange(shown, change(OPEN), beforeOf(group(6)))).toEqual([{ ...group(6), quantity: 6 }]);
  });

  it('gives a unit changed itself back what it was', () => {
    const shown = applyChange([group(1)], change(DRINK));
    expect(revertChange(shown, change(DRINK), beforeOf(group(1)))[0]).toMatchObject({ isOpened: false, fillLevel: 100, slots: [{ id: 's1', column: 2, row: 3 }] });
  });

  it('a correction with copies gone: back to the number before', () => {
    const correction = change({ quantity: 4, reason: 'written_off' }, { kind: 'correct' });
    expect(revertChange(applyChange([group(6)], correction), correction, beforeOf(group(6))).map((u) => u.quantity)).toEqual([6]);
  });
});

describe('actionOf', () => {
  it('names the everyday actions, and anything else an edit', () => {
    expect(actionOf(change(OPEN))).toBe('open');
    expect(actionOf(change(DRINK))).toBe('drink');
    expect(actionOf(change({ smokeOne: true }))).toBe('smoke');
    expect(actionOf(change({ quantity: 5, reason: 'written_off' }, { kind: 'correct' }))).toBe('correct');
    // The edit form sends a whole record, opened state included.
    expect(actionOf(change({ ...OPEN, region: 'Loire' }))).toBe('edit');
  });
});
