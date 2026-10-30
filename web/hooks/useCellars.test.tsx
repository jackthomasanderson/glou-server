import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

import { notifyError, notifySuccess } from '@/lib/toast';
import { useDeleteCellar } from './useCellars';

// #580: deleting a cellar worked on the server (204 No Content), yet the
// screen said it had failed and kept the confirmation dialog open.

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('useDeleteCellar', () => {
  it('confirms the delete when the server answers 204 No Content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const { result } = renderHook(() => useDeleteCellar(), { wrapper });

    await act(() => result.current.mutateAsync('cellar-1'));

    expect(notifySuccess).toHaveBeenCalledWith('toast.cellar.deleteSuccess');
    expect(notifyError).not.toHaveBeenCalled();
  });

  it('reports a refused delete as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'CELLAR_NOT_FOUND' }), { status: 404 }),
    ));
    const { result } = renderHook(() => useDeleteCellar(), { wrapper });

    act(() => result.current.mutate('cellar-1'));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notifyError).toHaveBeenCalledWith('toast.cellar.deleteError');
    expect(notifySuccess).not.toHaveBeenCalled();
  });
});
