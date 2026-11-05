import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { InventoryItem } from '@/lib/inventory/types';

// #595 / #586: the stock question after a tasting read the tasted item from
// the loaded list only. The list can miss it (2,000-row cap, not loaded yet,
// failed); the question then guessed a closed bottle, which could refill an
// opened bottle or empty a cigar box.

const getItem = vi.fn();
vi.mock('@/lib/inventory/client', () => ({ inventoryClient: { get: (id: string) => getItem(id) } }));
vi.mock('@/lib/offline/db', () => ({ mirrorInventoryToCache: vi.fn(), getCachedInventory: vi.fn() }));
vi.mock('@/lib/offline/syncEngine', () => ({ overlayQueuedChanges: async <T,>(items: T) => items, enqueueMutation: vi.fn() }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

import { INVENTORY_KEY, useInventoryItemLookup } from './useInventory';

const box = (quantity: number) => ({ id: 'cigar-1', category: 'cigar', quantity, isOpened: false }) as unknown as InventoryItem;

let queryClient: QueryClient;
function lookUp(id: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useInventoryItemLookup(), { wrapper });
  return result.current(id);
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('useInventoryItemLookup', () => {
  it('reads the item from the loaded list first', async () => {
    queryClient.setQueryData(INVENTORY_KEY, [box(25)]);
    queryClient.setQueryData(['inventory', 'cigar-1'], box(3));
    await expect(lookUp('cigar-1')).resolves.toMatchObject({ quantity: 25 });
    expect(getItem).not.toHaveBeenCalled();
  });

  it('falls back on the item\'s own cache entry when the list misses it', async () => {
    queryClient.setQueryData(INVENTORY_KEY, []);
    queryClient.setQueryData(['inventory', 'cigar-1'], box(12));
    await expect(lookUp('cigar-1')).resolves.toMatchObject({ quantity: 12 });
    expect(getItem).not.toHaveBeenCalled();
  });

  it('asks the server when nothing is cached', async () => {
    getItem.mockResolvedValue(box(7));
    await expect(lookUp('cigar-1')).resolves.toMatchObject({ quantity: 7 });
    expect(getItem).toHaveBeenCalledWith('cigar-1');
  });

  it('resolves undefined when the server cannot tell', async () => {
    getItem.mockRejectedValue(new Error('NOT_FOUND'));
    await expect(lookUp('cigar-1')).resolves.toBeUndefined();
  });
});
