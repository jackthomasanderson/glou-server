import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// #471 (I1 → W3): once an inventory is closed, its corrections show on the
// list of wines too, not only on the bottles and the cellars.

vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
vi.mock('@/lib/inventory-count/client', () => ({
  inventoryCountClient: { complete: vi.fn(async () => ({ session: { id: 's1' }, skipped: [] })) },
}));

import { PRODUCTS_KEY, productDetailKey } from '@/hooks/useProducts';
import { useCompleteCountSession } from './useInventoryCount';

describe('useCompleteCountSession', () => {
  it('refreshes the list of wines and an open wine once the inventory is closed', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(PRODUCTS_KEY, []);
    queryClient.setQueryData(productDetailKey('p1'), { id: 'p1', items: [] });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useCompleteCountSession('s1'), { wrapper });

    result.current.mutate([]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(queryClient.getQueryState(PRODUCTS_KEY)?.isInvalidated).toBe(true));
    expect(queryClient.getQueryState(productDetailKey('p1'))?.isInvalidated).toBe(true);
  });
});
