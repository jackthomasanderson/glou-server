import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInventoryFilters } from './useInventoryFilters';
import type { InventoryItem } from '@/lib/inventory/types';

// Same inert navigation doubles as useInventoryFilters.references.test.tsx:
// one stable URLSearchParams instance, or the hook re-parses on every render.
const stableSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => stableSearchParams,
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

// #573: the list's "alerts" filter agrees with the bell — a bottle already
// drunk raises no drinking-window alert.
describe('useInventoryFilters — alerts filter', () => {
  it('leaves out finished bottles at their peak, but keeps their due reminders', () => {
    const items = [
      makeItem({ id: 'held', alertStatus: 'peak' }),
      makeItem({ id: 'opened', alertStatus: 'past', isOpened: true, fillLevel: 40 }),
      makeItem({ id: 'opened-no-level', alertStatus: 'peak', isOpened: true, fillLevel: null }),
      makeItem({ id: 'finished', alertStatus: 'peak', isOpened: true, fillLevel: 0 }),
      makeItem({ id: 'finished-reminder', isOpened: true, fillLevel: 0, reminderDate: '2000-01-01' }),
    ];
    const { result } = renderHook(() =>
      useInventoryFilters({ items, cellars: [], t: (k: string) => k, hasMounted: true }),
    );

    act(() => result.current.setOpenedFilter('alerts'));

    expect(result.current.filteredItems.map((i) => i.id).sort()).toEqual(
      ['finished-reminder', 'held', 'opened', 'opened-no-level'],
    );
  });
});
