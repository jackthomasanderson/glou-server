import { describe, expect, it } from 'vitest';
import { cigarGroupErrors, cigarGroupInput, cigarsInDraft, draftFrom } from '../cigarGroup';

// #471 (FEAT-95): a group of cigars is N closed boxes of M, or N single cigars.
describe('cigar group draft', () => {
  it('counts the cigars of the group: 3 boxes of 25 = 75, 4 single cigars = 4', () => {
    expect(cigarsInDraft({ storage: 'boxes', quantity: 3, cigarsPerBox: 25 })).toBe(75);
    expect(cigarsInDraft({ storage: 'singles', quantity: 4, cigarsPerBox: 25 })).toBe(4);
    expect(cigarsInDraft({ storage: 'boxes', quantity: 3, cigarsPerBox: null })).toBeNull();
  });

  it('sends no box size for single cigars, even one typed before switching', () => {
    expect(cigarGroupInput({ storage: 'singles', quantity: 4, cigarsPerBox: 25 })).toEqual({ quantity: 4, cigarsPerBox: null });
    expect(cigarGroupInput({ storage: 'boxes', quantity: 3, cigarsPerBox: 25 })).toEqual({ quantity: 3, cigarsPerBox: 25 });
  });

  it('wants a whole number from 1 to 1000, and a box size only for boxes', () => {
    expect(cigarGroupErrors({ storage: 'boxes', quantity: 0, cigarsPerBox: 25 })).toEqual({ quantity: true, cigarsPerBox: false });
    expect(cigarGroupErrors({ storage: 'boxes', quantity: 2, cigarsPerBox: 2.5 })).toEqual({ quantity: false, cigarsPerBox: true });
    expect(cigarGroupErrors({ storage: 'singles', quantity: 1001, cigarsPerBox: null })).toEqual({ quantity: true, cigarsPerBox: false });
  });

  it('starts from the latest line: its box size, or single cigars; one box to size without any', () => {
    expect(draftFrom(25)).toEqual({ storage: 'boxes', quantity: 1, cigarsPerBox: 25 });
    expect(draftFrom(null)).toEqual({ storage: 'singles', quantity: 1, cigarsPerBox: null });
    expect(draftFrom(undefined)).toEqual({ storage: 'boxes', quantity: 1, cigarsPerBox: null });
  });
});
