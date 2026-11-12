import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSidebarCounts } from './useSidebarCounts';
import { invalidateAfterInventoryChange } from '@/lib/queryKeys';

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
    expect(get).toHaveBeenCalledWith('/stats/counts', { signal: expect.any(AbortSignal) });
  });

  it('a stock change fetches the counts again, once (#621, #632)', async () => {
    get.mockResolvedValue({ data: counts });
    const { qc, result } = setup();
    await waitFor(() => expect(result.current.data).toBeDefined());
    invalidateAfterInventoryChange(qc);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 30));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('ignores unrelated invalidations', async () => {
    get.mockResolvedValue({ data: counts });
    const { qc, result } = setup();
    await waitFor(() => expect(result.current.data).toBeDefined());
    qc.setQueryData(['tastings'], []);
    await qc.invalidateQueries({ queryKey: ['tastings'] });
    expect(get).toHaveBeenCalledTimes(1);
  });
});
