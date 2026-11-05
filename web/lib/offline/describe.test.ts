import { describe, expect, it } from 'vitest';
import { mayAlreadyBeRecorded, refusalKey } from './describe';

// Review of #823: the conflict dialog warns that an action may already be
// recorded (the connection dropped while it was being sent) when the unit
// on the server is exactly what the action would have made of it.

const OPEN = { isOpened: true, fillLevel: 100, openedAt: '2026-11-04T10:00:00.000Z' };
const DRINK = { isOpened: true, fillLevel: 0 };
const SMOKE = { smokeOne: true };
const group = { isOpened: false, fillLevel: 100, cigarsLeft: null, writtenOffAt: null };

describe('mayAlreadyBeRecorded', () => {
  it('a copy taken off a group: the group one fewer, not two', () => {
    const m = { patch: DRINK, before: { ...group, quantity: 6 } };
    expect(mayAlreadyBeRecorded(m, { quantity: 5 })).toBe(true);
    expect(mayAlreadyBeRecorded(m, { quantity: 4 })).toBe(false);
    expect(mayAlreadyBeRecorded({ patch: SMOKE, before: { ...group, quantity: 3, fillLevel: null } }, { quantity: 2 })).toBe(true);
  });

  it('a cigar smoked in an already opened box (×1): one cigar fewer in it — 10 → 9', () => {
    const m = { patch: SMOKE, before: { quantity: 1, isOpened: true, fillLevel: null, cigarsLeft: 10 } };
    expect(mayAlreadyBeRecorded(m, { quantity: 1, isOpened: true, cigarsLeft: 9, cigarsPerBox: 25 })).toBe(true);
    expect(mayAlreadyBeRecorded(m, { quantity: 1, isOpened: true, cigarsLeft: 8, cigarsPerBox: 25 })).toBe(false);
    // Its last cigar: the box is finished.
    const last = { patch: SMOKE, before: { quantity: 1, isOpened: true, fillLevel: null, cigarsLeft: 1 } };
    expect(mayAlreadyBeRecorded(last, { quantity: 1, isOpened: true, fillLevel: 0, cigarsLeft: 0, cigarsPerBox: 25 })).toBe(true);
  });

  it('the first cigar of a single closed box: opened with all but one', () => {
    const m = { patch: SMOKE, before: { ...group, quantity: 1, fillLevel: null } };
    expect(mayAlreadyBeRecorded(m, { quantity: 1, isOpened: true, cigarsLeft: 24, cigarsPerBox: 25 })).toBe(true);
    expect(mayAlreadyBeRecorded(m, { quantity: 1, isOpened: false, cigarsLeft: null, cigarsPerBox: 25 })).toBe(false);
  });

  it('a single bottle (or an opened one) drunk: finished on the server', () => {
    const single = { patch: DRINK, before: { ...group, quantity: 1 } };
    expect(mayAlreadyBeRecorded(single, { quantity: 1, isOpened: true, fillLevel: 0 })).toBe(true);
    expect(mayAlreadyBeRecorded(single, { quantity: 1, isOpened: true, fillLevel: 40 })).toBe(false);
    const opened = { patch: DRINK, before: { quantity: 1, isOpened: true, fillLevel: 60, cigarsLeft: null } };
    expect(mayAlreadyBeRecorded(opened, { quantity: 1, isOpened: true, fillLevel: 0 })).toBe(true);
  });

  it('a correction: the number already the one asked; an edit never', () => {
    const correct = { kind: 'correct' as const, patch: { quantity: 5, reason: 'written_off' }, before: { quantity: 6 } };
    expect(mayAlreadyBeRecorded(correct, { quantity: 5 })).toBe(true);
    expect(mayAlreadyBeRecorded(correct, { quantity: 4 })).toBe(false);
    expect(mayAlreadyBeRecorded({ patch: { ...OPEN, region: 'Loire' }, before: { quantity: 1 } }, { quantity: 1, isOpened: true })).toBe(false);
  });
});

// Review of #856 (e): a change queued before "De quelle case ?" existed, on a
// line placed on the plan, did not meet a change made meanwhile.
describe('refusalKey — the cells of the plan (FEAT-93)', () => {
  it('SLOT_CHOICE_REQUIRED has its own words; the cells changed meanwhile are a conflict', () => {
    expect(refusalKey('SLOT_CHOICE_REQUIRED')).toBe('offline.errors.slotChoice');
    expect(refusalKey('SLOT_CHANGED')).toBe('offline.errors.changed');
    expect(refusalKey('SLOTS_TO_FREE_REQUIRED')).toBe('offline.errors.changed');
  });
});
