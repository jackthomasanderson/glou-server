import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInventoryFilters } from './useInventoryFilters';
import type { InventoryItem } from '@/lib/inventory/types';

// The hook reads the URL to restore a collection filter and pushes on clear;
// none of that matters here, so navigation is stubbed to inert doubles.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/bottles',
}));

function makeItem(over: Partial<InventoryItem> & { id: string }): InventoryItem {
  return {
    category: 'wine',
    name: 'Bottle',
    producer: 'Producer',
    tags: [],
    isOpened: false,
    ...over,
  } as InventoryItem;
}

const owned = makeItem({ id: 'owned', name: 'Owned bottle', isOwned: true });
const legacy = makeItem({ id: 'legacy', name: 'Item from before the field' });
const reference = makeItem({ id: 'ref', name: 'Tasted elsewhere', isOwned: false });

function setup(items: InventoryItem[]) {
  return renderHook(() =>
    useInventoryFilters({ items, cellars: [], t: (k: string) => k, hasMounted: true }),
  );
}

// FEAT-87
describe('useInventoryFilters — non-owned references', () => {
  it('hides references by default, in the list and in the stats base', () => {
    const { result } = setup([owned, legacy, reference]);

    expect(result.current.filteredItems.map((i) => i.id)).toEqual(['owned', 'legacy']);
    expect(result.current.baseItems.map((i) => i.id)).toEqual(['owned', 'legacy']);
    expect(result.current.showReferences).toBe(false);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('shows them once the filter is turned on, and counts as an active filter', () => {
    const { result } = setup([owned, legacy, reference]);

    act(() => result.current.setShowReferences(true));

    expect(result.current.filteredItems.map((i) => i.id)).toEqual(['owned', 'legacy', 'ref']);
    expect(result.current.baseItems.map((i) => i.id)).toEqual(['owned', 'legacy', 'ref']);
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('hides them again when filters are cleared', () => {
    const { result } = setup([owned, reference]);

    act(() => result.current.setShowReferences(true));
    act(() => result.current.clearFilters());

    expect(result.current.showReferences).toBe(false);
    expect(result.current.filteredItems.map((i) => i.id)).toEqual(['owned']);
  });
});
