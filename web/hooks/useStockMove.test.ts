import { describe, expect, it } from 'vitest';
import { cellGivenBack } from './useStockMove';

// FEAT-93 (review of #856, d): "Annuler" asks back the cell a write gave
// back — never one the copy, or its group, still holds.
describe('cellGivenBack', () => {
  const cells = [{ id: 's1', column: 1, row: 1 }, { id: 's2', column: 2, row: 3 }];
  const group = { id: 'g', quantity: 3, cigarsPerBox: null, slots: cells };

  it('a copy drunk from the cell chosen gave that cell back', () => {
    expect(cellGivenBack(group, { id: 'sub', slots: [] }, { fromSlotId: 's2' })).toEqual({ placeAt: { column: 2, row: 3 } });
  });

  it('a copy opened from a cell holds it (it comes back with it); an unplaced copy gave nothing', () => {
    expect(cellGivenBack(group, { id: 'sub', slots: [cells[0]] }, { fromSlotId: 's1' })).toEqual({});
    expect(cellGivenBack(group, { id: 'sub', slots: [] }, { fromUnplaced: true })).toEqual({});
  });

  it('a line of one finished in its cell gave it back', () => {
    const one = { id: 'one', quantity: 1, cigarsPerBox: null, slots: [cells[1]] };
    expect(cellGivenBack(one, { id: 'one', slots: [] })).toEqual({ placeAt: { column: 2, row: 3 } });
  });

  it('a cigar smoked off a group of single cigars: their one cell stays with the group', () => {
    const singles = { id: 'c', quantity: 5, cigarsPerBox: null, slots: [cells[0]] };
    expect(cellGivenBack(singles, { id: 'sub', slots: [] }, { fromSlotId: 's1' }, 'cigar')).toEqual({});
  });
});
