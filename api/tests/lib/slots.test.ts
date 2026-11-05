import { describe, it, expect } from 'vitest';
import { pickSlots } from '../../src/lib/slots';

// FEAT-93, decision #471 point 75: gestures made without the plan in sight
// take unplaced copies first, then the most recently placed cells (the
// slots come most recent first, as liveSlotsOf reads them).
describe('pickSlots (automatic rule)', () => {
  const recentFirst = ['c3', 'c2', 'c1'];

  it('takes no cell while unplaced copies remain', () => {
    expect(pickSlots(recentFirst, 2, 1)).toEqual([]);
    expect(pickSlots(recentFirst, 2, 2)).toEqual([]);
  });

  it('then the most recently placed cells', () => {
    expect(pickSlots(recentFirst, 2, 3)).toEqual(['c3']);
    expect(pickSlots(recentFirst, 0, 2)).toEqual(['c3', 'c2']);
  });

  it('never more cells than the unit holds', () => {
    expect(pickSlots(recentFirst, 0, 5)).toEqual(['c3', 'c2', 'c1']);
    expect(pickSlots([], 3, 2)).toEqual([]);
  });
});
