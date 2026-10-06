import { describe, it, expect } from 'vitest';
import { nextCellCenter } from './gridKeyboard';

// 3 columns x 2 rows, 40px pitch.
const centers = [0, 1].flatMap((r) => [0, 1, 2].map((c) => ({ x: 20 + c * 40, y: 20 + r * 40 })));

describe('nextCellCenter (#199)', () => {
  it('moves to the adjacent cell in each direction', () => {
    const from = { x: 60, y: 20 };
    expect(nextCellCenter('ArrowRight', from, centers)).toEqual({ x: 100, y: 20 });
    expect(nextCellCenter('ArrowLeft', from, centers)).toEqual({ x: 20, y: 20 });
    expect(nextCellCenter('ArrowDown', from, centers)).toEqual({ x: 60, y: 60 });
  });

  it('returns null at the edge of the grid', () => {
    expect(nextCellCenter('ArrowLeft', { x: 20, y: 20 }, centers)).toBeNull();
    expect(nextCellCenter('ArrowUp', { x: 20, y: 20 }, centers)).toBeNull();
    expect(nextCellCenter('ArrowRight', { x: 100, y: 60 }, centers)).toBeNull();
    expect(nextCellCenter('ArrowDown', { x: 100, y: 60 }, centers)).toBeNull();
  });

  it('never jumps to another row when moving sideways', () => {
    // Last cell of row 1: the first of row 2 is "after" it in reading order but not to its right.
    expect(nextCellCenter('ArrowRight', { x: 100, y: 20 }, centers)).toBeNull();
  });
});
