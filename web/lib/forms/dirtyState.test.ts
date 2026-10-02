import { describe, it, expect } from 'vitest';
import { areValuesEquivalent, isFormDirty, haveSameIds } from './dirtyState';

describe('isFormDirty (ISSUE_119 — unsaved form detection)', () => {
  it('reports an untouched form as clean', () => {
    const baseline = { category: 'wine', name: '', producer: '', tags: [] };
    expect(isFormDirty(baseline, { ...baseline })).toBe(false);
  });

  it('reports any filled field as dirty', () => {
    const baseline = { category: 'wine', name: '', producer: '' };
    expect(isFormDirty(baseline, { ...baseline, name: 'Pétrus' })).toBe(true);
  });

  it('treats empty-value aliases as equivalent', () => {
    expect(areValuesEquivalent(undefined, '')).toBe(true);
    expect(areValuesEquivalent(null, [])).toBe(true);
    expect(isFormDirty({ notes: '' }, { notes: null, tags: [] })).toBe(false);
  });

  it('does not confuse falsy-but-meaningful values with empty ones', () => {
    expect(areValuesEquivalent(0, '')).toBe(false);
    expect(areValuesEquivalent(false, undefined)).toBe(false);
  });

  it('compares nested objects and arrays structurally', () => {
    const baseline = { grid: { rows: '', columns: '' }, tags: ['a'] };
    expect(isFormDirty(baseline, { grid: { rows: '', columns: '' }, tags: ['a'] })).toBe(false);
    expect(isFormDirty(baseline, { grid: { rows: '5', columns: '' }, tags: ['a'] })).toBe(true);
    expect(isFormDirty(baseline, { grid: { rows: '', columns: '' }, tags: ['a', 'b'] })).toBe(true);
  });

  it('compares dates by value', () => {
    expect(isFormDirty({ at: new Date(0) }, { at: new Date(0) })).toBe(false);
    expect(isFormDirty({ at: new Date(0) }, { at: new Date(1) })).toBe(true);
  });
});

describe('haveSameIds', () => {
  it('ignores ordering', () => {
    expect(haveSameIds(['a', 'b'], ['b', 'a'])).toBe(true);
  });

  it('detects additions and removals', () => {
    expect(haveSameIds(['a'], ['a', 'b'])).toBe(false);
    expect(haveSameIds(['a', 'b'], ['a', 'c'])).toBe(false);
  });
});
