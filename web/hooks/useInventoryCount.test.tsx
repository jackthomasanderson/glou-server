import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// #471 (I1 → W3): once an inventory is closed, its corrections show on the
// list of wines too, not only on the bottles and the cellars.

vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
vi.mock('@/lib/inventory-count/client', () => ({
  inventoryCountClient: {
    complete: vi.fn(async () => ({ session: { id: 's1' }, skipped: [] })),
    scan: vi.fn(async () => { throw new Error('ITEM_NOT_FOUND'); }),
  },
}));

import { qk } from '@/lib/queryKeys';
import { notifyError } from '@/lib/toast';
import { useCompleteCountSession, useScanItem } from './useInventoryCount';

const PRODUCTS_KEY = qk.products.list;
const productDetailKey = qk.products.detail;

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

// #873: a cigar refused at the count is not told "the bottle".
describe('useScanItem', () => {
  function scan(category: string) {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    queryClient.setQueryData(qk.inventoryCount.report('s1'), { expected: [{ id: 'i1', category }], unexpected: [] });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    return renderHook(() => useScanItem('s1'), { wrapper });
  }

  it('names a cigar in its error message', async () => {
    const { result } = scan('cigar');
    result.current.mutate({ itemId: 'i1' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notifyError).toHaveBeenCalledWith('toast.count.scanError', { context: 'cigar' });
  });

  it('keeps the bottle for a wine', async () => {
    const { result } = scan('wine');
    result.current.mutate({ itemId: 'i1' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notifyError).toHaveBeenCalledWith('toast.count.scanError');
  });
});
