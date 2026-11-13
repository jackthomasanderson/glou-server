import { describe, it, expect, vi } from 'vitest';
import { pickSlots, placeBack } from '../../src/lib/slots';

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

// Review of #856 (f): "Annuler" puts a copy back in its cell only while the
// line has a copy unplaced — never one cell more than it can hold (the
// database guard would turn that into a failed write).
describe('placeBack (FEAT-93 lot S2, placeAt)', () => {
  const unit = (quantity: number) => ({
    id: 'g', cellarId: 'c1', quantity, isOpened: false, fillLevel: 100, cigarsPerBox: null, cigarsLeft: null, writtenOffAt: null,
  });

  function client(placed: number) {
    return {
      cellar: { findUnique: vi.fn(async () => ({ columns: 4, rows: 4 })) },
      $queryRaw: vi.fn(async () => []),
      itemSlot: { count: vi.fn(async () => placed) },
      $executeRaw: vi.fn(async () => 1),
    };
  }

  it('places the copy back while the line has one unplaced', async () => {
    const db = client(1);

    expect(await placeBack(db as never, unit(2), 'bottle', { column: 2, row: 3 })).toEqual({ column: 2, row: 3 });
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('leaves it unplaced when every copy of the line already holds a cell', async () => {
    const db = client(2);

    expect(await placeBack(db as never, unit(2), 'bottle', { column: 2, row: 3 })).toBeNull();
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it('leaves it unplaced outside the grid, or without a cellar', async () => {
    const db = client(0);

    expect(await placeBack(db as never, unit(2), 'bottle', { column: 5, row: 1 })).toBeNull();
    expect(await placeBack(db as never, { ...unit(2), cellarId: null }, 'bottle', { column: 1, row: 1 })).toBeNull();
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });
});
