import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
vi.mock('@/lib/i18n', () => ({
  default: { t: (key: string, v: { col: number; row: number; name: string }) => `${key}(${v.col},${v.row},${v.name})` },
}));

import { notifyError, notifySuccess } from '@/lib/toast';
import { useDeleteCellar, useUpdateCellar } from './useCellars';

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

// #852: a smaller grid would hide the bottles placed in the cells it removes;
// the API refuses it with those cells, and the message names them.
describe('useUpdateCellar', () => {
  it('names the cells to empty first when the grid would leave bottles outside', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'SLOTS_OUTSIDE_GRID',
      details: { slots: [{ column: 2, row: 5, name: 'Chablis' }, { column: 7, row: 1, name: 'Margaux' }] },
    }), { status: 409 })));
    const { result } = renderHook(() => useUpdateCellar(), { wrapper });

    act(() => result.current.mutate({ id: 'cellar-1', data: { rows: 4 } }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notifyError).toHaveBeenCalledWith('toast.cellar.slotsOutsideGrid', {
      count: 2,
      cells: 'cellars.grid.cellOutside(2,5,Chablis), cellars.grid.cellOutside(7,1,Margaux)',
    });
  });

  it('keeps the generic message for any other refusal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'VALIDATION_ERROR' }), { status: 400 }),
    ));
    const { result } = renderHook(() => useUpdateCellar(), { wrapper });

    act(() => result.current.mutate({ id: 'cellar-1', data: { rows: 4 } }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notifyError).toHaveBeenCalledWith('toast.cellar.updateError');
  });
});
