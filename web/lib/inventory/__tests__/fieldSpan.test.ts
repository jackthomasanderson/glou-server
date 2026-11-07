import { describe, expect, it } from 'vitest';
import { lastFieldDesktopSpan } from '../fieldSpan';

// Recette n°5 quater of #847 (KO 5.1): the last field of a four-column grid ends its row.
describe('lastFieldDesktopSpan', () => {
  it('fills what is left of its row', () => {
    expect(lastFieldDesktopSpan([2], 2)).toBe('sm:col-span-2');
    expect(lastFieldDesktopSpan([1, 1], 1)).toBe('sm:col-span-2');
    expect(lastFieldDesktopSpan([2, 1], 1)).toBe('sm:col-span-1');
  });

  it('takes the whole row when it starts one', () => {
    // A cigar: leaf origin, factory code, humidity, humidification system — then the reminder.
    expect(lastFieldDesktopSpan([2, 2, 2, 2], 2)).toBe('sm:col-span-4');
    expect(lastFieldDesktopSpan([], 2)).toBe('sm:col-span-4');
  });

  it('goes to the next row, whole, when what is left is too narrow', () => {
    expect(lastFieldDesktopSpan([2, 1], 2)).toBe('sm:col-span-4');
  });

  it('lays out in order: a field too wide for its row starts the next one', () => {
    // 2, then 4 (new row), then 1: the last field has 3 columns left.
    expect(lastFieldDesktopSpan([2, 4, 1], 2)).toBe('sm:col-span-3');
  });
});
