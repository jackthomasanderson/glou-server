import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// #470, #492: arriving on /bottles from another page with filters in the
// URL (a category link, an alert, a collection) showed the whole list — the
// URL was only read on the first render. The filters follow the URL on
// arrival and on every later navigation.

const push = vi.fn();
const replace = vi.fn();
const router = { push, replace };
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  useRouter: () => router,
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
  push.mockClear();
  replace.mockClear();
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

// #503: the category chosen from the navigation survives "Reset filters".
describe('clearFilters keeps the navigation category (#503)', () => {
  it('stays on the category page', () => {
    const { result } = renderFilters('category=wine&q=rioja');
    act(() => result.current.clearFilters());
    expect(push).toHaveBeenCalledWith('/bottles?category=wine');
    expect(result.current.selectedCategories).toEqual(['wine']);
    expect(result.current.searchQuery).toBe('');
  });

  it('still goes to the bare page when no category was chosen', () => {
    const { result } = renderFilters('q=rioja');
    act(() => result.current.clearFilters());
    expect(push).toHaveBeenCalledWith('/bottles');
    expect(result.current.selectedCategories).toEqual([]);
  });
});

describe('the navigation category is the page, not a filter (#503)', () => {
  it('?category=wine alone is no active filter', () => {
    const { result } = renderFilters('category=wine');
    expect(result.current.navCategory).toBe('wine');
    expect(result.current.selectedCategories).toEqual(['wine']);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('another filter on top of it is one', () => {
    const { result } = renderFilters('category=wine&q=rioja');
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('a category chosen outside the navigation still counts', () => {
    const { result } = renderFilters('');
    act(() => result.current.setSelectedCategories(['wine']));
    expect(result.current.hasActiveFilters).toBe(true);
    expect(replace).not.toHaveBeenCalled();
  });

  it('unticking the nav category leaves the category URL, so the title does not lie', () => {
    const { result } = renderFilters('category=wine&q=x');
    act(() => result.current.setSelectedCategories([]));
    expect(replace).toHaveBeenCalledWith('/bottles?q=x', { scroll: false });
    expect(result.current.selectedCategories).toEqual([]);
  });

  it('keeps the chips picked while leaving the category URL', () => {
    const { result, rerender } = renderFilters('category=wine');
    act(() => result.current.setSelectedCategories(['wine', 'spirit']));
    expect(replace).toHaveBeenCalledWith('/bottles', { scroll: false });
    navigate(rerender, '');
    expect(result.current.selectedCategories).toEqual(['wine', 'spirit']);
  });

  it('widening the chips keeps the opened-bottles filter and the collection', () => {
    const { result, rerender } = renderFilters('category=wine&collection=col-1');
    act(() => { result.current.setOpenedFilter('opened'); });
    act(() => result.current.setSelectedCategories(['wine', 'spirit']));
    navigate(rerender, 'collection=col-1');
    expect(result.current.openedFilter).toBe('opened');
    expect(result.current.selectedCollectionId).toBe('col-1');
    expect(result.current.selectedCategories).toEqual(['wine', 'spirit']);
  });

  it('a hand-typed category stays a plain filter', () => {
    const { result } = renderFilters('category=cigar');
    expect(result.current.navCategory).toBeNull();
    expect(result.current.hasActiveFilters).toBe(true);
    act(() => result.current.setSelectedCategories([]));
    expect(replace).not.toHaveBeenCalled();
  });
});
