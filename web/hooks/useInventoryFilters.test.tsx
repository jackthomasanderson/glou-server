import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// #470, #492: arriving on /bottles from another page with filters in the
// URL (a category link, an alert, a collection) showed the whole list — the
// URL was only read on the first render. The filters follow the URL on
// arrival and on every later navigation.

let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/bottles',
}));

import { useInventoryFilters } from './useInventoryFilters';

const t = (key: string) => key;

function renderFilters(query: string) {
  searchParams = new URLSearchParams(query);
  return renderHook(() => useInventoryFilters({ products: [], cellars: [], t, hasMounted: true }));
}

function navigate(rerender: () => void, query: string) {
  searchParams = new URLSearchParams(query);
  rerender();
}

beforeEach(() => {
  searchParams = new URLSearchParams();
});

describe('useInventoryFilters reads its filters from the URL (#470)', () => {
  it('applies the filters of the URL it arrives with', () => {
    const { result } = renderFilters('category=spirit&filter=alerts&collection=col-1&q=talbot');
    expect(result.current.selectedCategories).toEqual(['spirit']);
    expect(result.current.openedFilter).toBe('alerts');
    expect(result.current.isFiltersOpen).toBe(true);
    expect(result.current.selectedCollectionId).toBe('col-1');
    expect(result.current.searchQuery).toBe('talbot');
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('follows a later change of the URL, without leaving the page', () => {
    const { result, rerender } = renderFilters('category=spirit');
    expect(result.current.selectedCategories).toEqual(['spirit']);

    navigate(rerender, 'category=wine&filter=opened');
    expect(result.current.selectedCategories).toEqual(['wine']);
    expect(result.current.openedFilter).toBe('opened');

    navigate(rerender, '');
    expect(result.current.selectedCategories).toEqual([]);
    expect(result.current.openedFilter).toBe('all');
    expect(result.current.selectedCollectionId).toBeNull();
  });

  it('keeps a filter picked on the page while the URL stays the same', () => {
    const { result, rerender } = renderFilters('category=spirit');
    act(() => result.current.setSelectedCellars(['garage']));
    rerender();
    expect(result.current.selectedCellars).toEqual(['garage']);
    expect(result.current.selectedCategories).toEqual(['spirit']);
  });
});
