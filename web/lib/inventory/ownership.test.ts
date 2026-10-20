import { describe, it, expect } from 'vitest';
import { isOwnedItem } from './ownership';

// FEAT-87: the absence of the field means "owned" — items created before the
// column existed, and locally-drafted ones, must not read as references.
describe('isOwnedItem', () => {
  it('treats an explicit false as a non-owned reference', () => {
    expect(isOwnedItem({ isOwned: false })).toBe(false);
  });

  it('treats true, undefined and a missing field as owned', () => {
    expect(isOwnedItem({ isOwned: true })).toBe(true);
    expect(isOwnedItem({ isOwned: undefined })).toBe(true);
    expect(isOwnedItem({} as { isOwned?: boolean })).toBe(true);
  });
});

describe('isFinishedItem (#504)', () => {
  it('is an opened item with nothing left', async () => {
    const { isFinishedItem } = await import('./ownership');
    expect(isFinishedItem({ isOpened: true, fillLevel: 0 })).toBe(true);
    expect(isFinishedItem({ isOpened: true, fillLevel: 40 })).toBe(false);
    expect(isFinishedItem({ isOpened: false, fillLevel: 0 })).toBe(false);
  });
});
