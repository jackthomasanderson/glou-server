import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSidebarCounts, SIDEBAR_COUNTS_KEY } from './useSidebarCounts';

const get = vi.fn();
vi.mock('@/lib/api', () => ({ client: { get: (...a: unknown[]) => get(...a) } }));

const counts = { bottles: 1, cigars: 2, cellars: 3, collections: 4, countSessionActive: false, wishlistReady: 0 };

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, ...renderHook(() => useSidebarCounts(), { wrapper }) };
}

afterEach(() => get.mockReset());

describe('useSidebarCounts (#212)', () => {
  it('fetches the counts from a single lightweight endpoint', async () => {
    get.mockResolvedValue({ data: counts });
    const { result } = setup();
    await waitFor(() => expect(result.current.data).toEqual(counts));
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/stats/counts');
  });

  it('refetches when an inventory query is invalidated', async () => {
    get.mockResolvedValue({ data: counts });
    const { qc, result } = setup();
    await waitFor(() => expect(result.current.data).toBeDefined());
    qc.setQueryData(['inventory'], []);
    await qc.invalidateQueries({ queryKey: ['inventory'] });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('ignores unrelated invalidations', async () => {
    get.mockResolvedValue({ data: counts });
    const { qc, result } = setup();
    await waitFor(() => expect(result.current.data).toBeDefined());
    qc.setQueryData(['tastings'], []);
    await qc.invalidateQueries({ queryKey: ['tastings'] });
    expect(get).toHaveBeenCalledTimes(1);
    expect(qc.getQueryState(SIDEBAR_COUNTS_KEY)?.isInvalidated).toBe(false);
  });
});
