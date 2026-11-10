import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/offline/db', () => ({ getAllQueuedMutations: async () => [], getCachedInventory: async () => [] }));

import { useCellarProducts } from './useProducts';

// #475 (review of #908): offline, the cellar's own list must fail — the page
// then says it is incomplete — rather than wait paused while the capped
// household list is shown as if it were whole.

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => {
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

describe('useCellarProducts', () => {
  it('asks for the wines of one cellar', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [], truncated: false }) });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCellarProducts('c1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/products?cellarId=c1');
  });

  it('offline, fails instead of waiting', async () => {
    onlineManager.setOnline(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const { result } = renderHook(() => useCellarProducts('c1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
