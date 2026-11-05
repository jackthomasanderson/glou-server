import { describe, expect, it } from 'vitest';
import { dropAction, moveSlot, swapOwners } from './gridMoves';
import type { GridCell, GridItem } from './types';

// FEAT-93: what the plan shows while a move or a swap is on its way, as the server will make it.

const line = (id: string, slots: { id: string; column: number; row: number }[]): GridItem => ({
  id, productId: `p-${id}`, name: id, producer: 'P', category: 'wine', color: 'red', vintage: null,
  quantity: 6, units: 6, isOpened: false, cigarsPerBox: null, cigarsLeft: null, purchasePrice: null, purchasedAt: null,
  slots, unplaced: 6 - slots.length,
});
const cell = (item: GridItem, slotId: string): GridCell => ({ ...item, slotId });
const where = (lines: GridItem[]) => Object.fromEntries(lines.map((l) => [l.id, l.slots.map((s) => `${s.id}@${s.column}:${s.row}`).sort()]));

describe('dropAction', () => {
  const x = line('X', [{ id: 'a', column: 1, row: 1 }, { id: 'c', column: 3, row: 1 }]);
  const y = line('Y', [{ id: 'b', column: 2, row: 1 }]);

  it('an empty cell: the slot moves', () => {
    expect(dropAction(cell(x, 'a'), null)).toBe('move');
  });

  it('a cell of another line: the two swap', () => {
    expect(dropAction(cell(x, 'a'), cell(y, 'b'))).toBe('swap');
  });

  it('its own cell, or another cell of the same line: nothing to do (no false history, no "X swapped with X")', () => {
    expect(dropAction(cell(x, 'a'), cell(x, 'a'))).toBe('none');
    expect(dropAction(cell(x, 'a'), cell(x, 'c'))).toBe('none');
  });
});

describe('moveSlot', () => {
  it('moves one slot, the other cells of the line stay', () => {
    const x = line('X', [{ id: 'a', column: 1, row: 1 }, { id: 'c', column: 3, row: 1 }]);
    expect(where(moveSlot([x], 'a', 2, 2))).toEqual({ X: ['a@2:2', 'c@3:1'] });
  });
});

// Review of #855: the server swaps the bottles, each slot staying in its cell —
// a slot id never changes cell, so a gesture made before the reload moves the right bottle.
describe('swapOwners', () => {
  it('each slot stays in its cell and takes the other line', () => {
    const x = line('X', [{ id: 'a', column: 1, row: 1 }, { id: 'c', column: 3, row: 1 }]);
    const y = line('Y', [{ id: 'b', column: 2, row: 1 }]);
    const swapped = swapOwners([x, y], cell(x, 'a'), cell(y, 'b'));
    expect(where(swapped)).toEqual({ X: ['b@2:1', 'c@3:1'], Y: ['a@1:1'] });
    expect(swapped.map((l) => l.unplaced)).toEqual([4, 5]);
  });
});
