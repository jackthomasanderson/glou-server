import { describe, it, expect } from 'vitest';
import { openableGroups, preselectGroup, type ChoiceLine } from '../../../shared/stock-choice';

// #471 (FEAT-104 c3, ux-ui.md §10.4.2): which line a bottle is taken from
// when a wine has several — the cellar looked at, else the oldest purchase,
// else the cheapest, else the largest.

const line = (id: string, fields: Partial<ChoiceLine> = {}): ChoiceLine => ({
  id,
  cellarId: null,
  purchasePrice: null,
  purchasedAt: null,
  quantity: 1,
  isOpened: false,
  fillLevel: null,
  cigarsPerBox: null,
  cigarsLeft: null,
  writtenOffAt: null,
  ...fields,
});

describe('openableGroups', () => {
  it('keeps the groups in stock, never an opened, finished, written-off or trashed copy', () => {
    const groups = openableGroups([
      line('full', { quantity: 4 }),
      line('opened', { isOpened: true, fillLevel: 60 }),
      line('drunk', { isOpened: true, fillLevel: 0 }),
      line('gone', { quantity: 2, writtenOffAt: '2026-10-01' }),
      line('trashed', { quantity: 3, deletedAt: '2026-10-02' }),
      line('box', { quantity: 2, cigarsPerBox: 25 }),
    ]);
    expect(groups.map((group) => group.id)).toEqual(['full', 'box']);
  });
});

describe('preselectGroup (FEAT-104 c3)', () => {
  const garage = line('garage', { cellarId: 'garage', quantity: 4, purchasePrice: 20, purchasedAt: '2026-01-10' });
  const kitchen = line('kitchen', { cellarId: 'kitchen', quantity: 2, purchasePrice: 20, purchasedAt: '2026-06-01' });

  it('takes the group of the cellar being looked at', () => {
    expect(preselectGroup([garage, kitchen], { cellarIds: ['kitchen'] })).toEqual({ line: kitchen, reason: 'cellar' });
  });

  it('without a cellar looked at, takes the group bought first', () => {
    expect(preselectGroup([kitchen, garage])).toEqual({ line: garage, reason: 'oldest' });
  });

  it('a cellar looked at that holds none of the groups changes nothing', () => {
    expect(preselectGroup([kitchen, garage], { cellarIds: ['cave'] })).toEqual({ line: garage, reason: 'oldest' });
  });

  it('between several groups of the cellar looked at, takes the one bought first', () => {
    const older = line('older', { cellarId: 'kitchen', quantity: 1, purchasedAt: '2025-03-01' });
    expect(preselectGroup([garage, kitchen, older], { cellarIds: ['kitchen'] })).toEqual({ line: older, reason: 'cellar' });
  });

  it('two groups without a purchase day: the cheaper one (20 € before 25 €)', () => {
    const at25 = line('at25', { quantity: 3, purchasePrice: 25 });
    const at20 = line('at20', { quantity: 1, purchasePrice: 20 });
    expect(preselectGroup([at25, at20])).toEqual({ line: at20, reason: 'cheapest' });
  });

  it('bought the same day: the cheaper one', () => {
    const at25 = line('at25', { purchasePrice: 25, purchasedAt: '2026-01-10' });
    const at20 = line('at20', { purchasePrice: 20, purchasedAt: '2026-01-10T00:00:00.000Z' });
    expect(preselectGroup([at25, at20])).toEqual({ line: at20, reason: 'cheapest' });
  });

  it('same price: the largest group (decision #471, point 43)', () => {
    const two = line('two', { quantity: 2, purchasePrice: 20 });
    const five = line('five', { quantity: 5, purchasePrice: 20 });
    expect(preselectGroup([two, five])).toEqual({ line: five, reason: 'largest' });
  });

  it('a purchase day known comes before an unknown one, a price known before none', () => {
    const undated = line('undated', { purchasePrice: 10 });
    const dated = line('dated', { purchasePrice: 30, purchasedAt: '2026-05-01' });
    expect(preselectGroup([undated, dated])).toEqual({ line: dated, reason: 'oldest' });
    const unpriced = line('unpriced', { quantity: 6 });
    const priced = line('priced', { purchasePrice: 30 });
    expect(preselectGroup([unpriced, priced])).toEqual({ line: priced, reason: 'cheapest' });
  });

  it('nothing tells two groups apart: the first one, no reason given', () => {
    const a = line('a', { quantity: 2 });
    const b = line('b', { quantity: 2 });
    expect(preselectGroup([a, b])).toEqual({ line: a, reason: null });
  });

  it('a single group is taken without a reason (no question is asked)', () => {
    expect(preselectGroup([garage], { cellarIds: ['garage'] })).toEqual({ line: garage, reason: null });
  });

  it('only chooses among groups in stock, and none when there is none', () => {
    const opened = line('opened', { cellarId: 'kitchen', isOpened: true, fillLevel: 50 });
    expect(preselectGroup([opened, garage], { cellarIds: ['kitchen'] })).toEqual({ line: garage, reason: null });
    expect(preselectGroup([opened])).toBeNull();
    expect(preselectGroup([])).toBeNull();
  });
});
