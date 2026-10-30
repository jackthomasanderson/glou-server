import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/toast', () => ({ notifyError: vi.fn() }));

import { notifyError } from '@/lib/toast';
import { useBulkPresets, useDeleteBulkPreset } from './useBulkPresets';

// #580: the preset was deleted on the server (204 No Content), but reading
// that empty answer as JSON failed, so the list was never refreshed and the
// preset stayed on screen until a reload.

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const preset = (id: string) => ({ id, name: `Preset ${id}`, payload: {}, createdAt: '2026-10-01T00:00:00.000Z' });

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('useDeleteBulkPreset', () => {
  it('removes the deleted preset from the list', async () => {
    let stored = [preset('p1'), preset('p2')];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        stored = stored.filter((p) => !url.endsWith(`/${p.id}`));
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ data: stored }), { status: 200 });
    }));
    const { result } = renderHook(() => ({ list: useBulkPresets(), remove: useDeleteBulkPreset() }), { wrapper });
    await waitFor(() => expect(result.current.list.data?.map((p) => p.id)).toEqual(['p1', 'p2']));

    act(() => result.current.remove.mutate('p1'));

    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.list.data?.map((p) => p.id)).toEqual(['p2']));
    expect(notifyError).not.toHaveBeenCalled();
  });

  // The confirmation closes as soon as Delete is pressed: a failure has to be said.
  it('says so when the delete fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'PRESET_NOT_FOUND' }), { status: 404 }),
    ));
    const { result } = renderHook(() => useDeleteBulkPreset(), { wrapper });

    act(() => result.current.mutate('p1'));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notifyError).toHaveBeenCalledWith('toast.bulkPreset.deleteError');
  });
});
