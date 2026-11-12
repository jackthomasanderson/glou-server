import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMapFilters } from './useMapFilters';

const KEY = 'glou:analytics-map-filters:v1';

describe('useMapFilters (#961)', () => {
  beforeEach(() => window.localStorage.clear());

  it('opens on all categories even when a category was picked on an earlier visit', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ categories: ['wine'], vintageMin: '2010', openedState: 'inCellar' }));
    const { result } = renderHook(() => useMapFilters());
    expect(result.current[0].categories).toEqual([]);
    // The other filters, which only narrow the list under the map, are still restored.
    expect(result.current[0].vintageMin).toBe('2010');
    expect(result.current[0].openedState).toBe('inCellar');
  });

  it('keeps a category picked during the visit without saving it for the next one', () => {
    const { result } = renderHook(() => useMapFilters());
    act(() => result.current[1]({ ...result.current[0], categories: ['cigar'], priceMax: '50' }));
    expect(result.current[0].categories).toEqual(['cigar']);
    const stored = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
    expect(stored.categories).toBeUndefined();
    expect(stored.priceMax).toBe('50');
  });
});
