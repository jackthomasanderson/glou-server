import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

import { notifyError } from '@/lib/toast';
import { useRemoveItemFromCollection } from './useCollections';

// #580: removing a bottle from a collection read the server's error answer as
// the updated collection, so a refusal passed for a success. The hook raises
// no toast of its own: a save runs several of these and reports once
// (lib/collections/sync.ts).

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('useRemoveItemFromCollection', () => {
  it('reports a refused removal as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'COLLECTION_NOT_FOUND' }), { status: 404 }),
    ));
    const { result } = renderHook(() => useRemoveItemFromCollection(), { wrapper });

    act(() => result.current.mutate({ id: 'c1', itemId: 'i1' }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('COLLECTION_NOT_FOUND');
    expect(notifyError).not.toHaveBeenCalled();
  });
});
