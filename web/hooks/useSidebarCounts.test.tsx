import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSidebarCounts, useSidebarCountsSync, SIDEBAR_COUNTS_KEY } from './useSidebarCounts';

const get = vi.fn();
vi.mock('@/lib/api', () => ({ client: { get: (...a: unknown[]) => get(...a) } }));

const counts = { bottles: 1, cigars: 2, cellars: 3, collections: 4, countSessionActive: false, wishlistReady: 0 };

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, ...renderHook(() => { useSidebarCountsSync(); return useSidebarCounts(); }, { wrapper }) };
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

  it('merges many invalidations of one edit into a single counts fetch', async () => {
    get.mockResolvedValue({ data: counts });
    const { qc, result } = setup();
    await waitFor(() => expect(result.current.data).toBeDefined());
    for (const key of [['inventory'], ['cellars'], ['cellars', 'a'], ['cellars', 'b', 'layout'], ['collections']]) {
      qc.setQueryData(key, []);
    }
    await qc.invalidateQueries({ queryKey: ['inventory'] });
    await qc.invalidateQueries({ queryKey: ['cellars'] });
    await qc.invalidateQueries({ queryKey: ['collections'] });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 30));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('is not subscribed by the plain query hook (two consumers, one subscription)', async () => {
    get.mockResolvedValue({ data: counts });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => { useSidebarCounts(); return useSidebarCounts(); }, { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    qc.setQueryData(['inventory'], []);
    await qc.invalidateQueries({ queryKey: ['inventory'] });
    await new Promise((r) => setTimeout(r, 30));
    expect(get).toHaveBeenCalledTimes(1);
  });
});
